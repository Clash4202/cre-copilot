import { getDocumentProxy, extractText } from 'unpdf'

export async function extractTextFromFile(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer())

  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (isPdf) {
    const pdf = await getDocumentProxy(buffer)
    const { text } = await extractText(pdf, { mergePages: true })
    return text
  }

  const isText = file.type.startsWith('text/') || file.name.toLowerCase().endsWith('.txt')
  if (isText) {
    return new TextDecoder().decode(buffer)
  }

  throw new Error(`Unsupported file type: ${file.type || file.name}`)
}
