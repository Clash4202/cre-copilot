import type { XlsxRow } from './xlsx-rows'
import { parseT12 } from './t12'
import { parseRentRoll } from './rent-roll'

export type DocumentKind = 't12' | 'rent_roll' | 'unknown'

export function detectDocumentKind(rows: XlsxRow[]): DocumentKind {
  const t12 = parseT12(rows)
  if (t12.lineItems.length > 0 && Object.keys(t12.subtotalsByLabel).length > 0) {
    return 't12'
  }

  const rentRoll = parseRentRoll(rows)
  if (rentRoll.unitTypeBlocks.some((block) => block.units.length > 0)) {
    return 'rent_roll'
  }

  return 'unknown'
}
