import type { DocumentKind } from './xlsx-detect'

export type InboxFileKind = 'property_document' | 'candidate_template' | 'candidate_bov' | 'general_document'

export function classifyInboxFile(fileName: string, xlsxKind: DocumentKind | null): InboxFileKind {
  const lower = fileName.toLowerCase()

  if (lower.endsWith('.pptx')) {
    return 'candidate_bov'
  }

  if (lower.endsWith('.xlsx')) {
    if (xlsxKind === 't12' || xlsxKind === 'rent_roll') {
      return 'property_document'
    }
    return 'candidate_template'
  }

  return 'general_document'
}
