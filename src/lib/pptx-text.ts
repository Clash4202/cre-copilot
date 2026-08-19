import JSZip from 'jszip'

const TEXT_RUN_PATTERN = /<a:t>(.*?)<\/a:t>/g
const SLIDE_PATH_PATTERN = /^ppt\/slides\/slide(\d+)\.xml$/

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

export async function extractPptxSlideText(buffer: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer)

  const slideEntries = Object.keys(zip.files)
    .map((path) => {
      const match = path.match(SLIDE_PATH_PATTERN)
      return match ? { path, index: Number(match[1]) } : null
    })
    .filter((entry): entry is { path: string; index: number } => entry !== null)
    .sort((a, b) => a.index - b.index)

  const slideTexts: string[] = []
  for (const entry of slideEntries) {
    const xml = await zip.files[entry.path].async('string')
    const runs = [...xml.matchAll(TEXT_RUN_PATTERN)].map((m) => decodeXmlEntities(m[1]))
    slideTexts.push(runs.join(' '))
  }

  return slideTexts
}
