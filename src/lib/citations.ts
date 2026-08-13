export interface Citation {
  index: number
  documentId: string
  fileName: string
  excerpt: string
  projectNames?: string[]
}

interface ChunkMatch {
  document_id: string
  content: string
}

const EXCERPT_LENGTH = 200

export function buildCitations(
  matches: ChunkMatch[],
  fileNameById: Map<string, string>,
  projectNamesByDocId?: Map<string, string[]>
): Citation[] {
  return matches.map((match, i) => {
    const citation: Citation = {
      index: i + 1,
      documentId: match.document_id,
      fileName: fileNameById.get(match.document_id) ?? 'unknown document',
      excerpt: match.content.slice(0, EXCERPT_LENGTH),
    }
    if (projectNamesByDocId) {
      citation.projectNames = projectNamesByDocId.get(match.document_id) ?? []
    }
    return citation
  })
}
