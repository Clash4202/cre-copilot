import { getDocumentProxy, extractText } from 'unpdf'

export const OCR_TEXT_THRESHOLD = 50

export function isPageScanned(pageText: string): boolean {
  return pageText.replace(/\s/g, '').length < OCR_TEXT_THRESHOLD
}

export async function extractPdfPages(buffer: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(buffer)
  const { text } = await extractText(pdf, { mergePages: false })
  return text
}

export async function extractTextFromFile(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer())

  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (isPdf) {
    const pages = await extractPdfPages(buffer)
    return pages.join('\n\n')
  }

  const isText = file.type.startsWith('text/') || file.name.toLowerCase().endsWith('.txt')
  if (isText) {
    return new TextDecoder().decode(buffer)
  }

  throw new Error(`Unsupported file type: ${file.type || file.name}`)
}
