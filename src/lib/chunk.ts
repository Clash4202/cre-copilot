const CHUNK_SIZE = 1500 // characters, roughly 300-400 tokens
const CHUNK_OVERLAP = 200

export function chunkText(text: string): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length === 0) return []

  const chunks: string[] = []
  let start = 0

  while (start < cleaned.length) {
    const end = Math.min(start + CHUNK_SIZE, cleaned.length)
    chunks.push(cleaned.slice(start, end))
    if (end === cleaned.length) break
    start = end - CHUNK_OVERLAP
  }

  return chunks
}
