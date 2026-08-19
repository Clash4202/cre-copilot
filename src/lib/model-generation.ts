import type { MappingField, TemplateMapping } from './template-mapping'
import type { ParsedT12 } from './t12'
import type { ParsedRentRoll } from './rent-roll'
import { averageBudgetedRent } from './rent-roll'

export interface CellWrite {
  sheet: string
  cell: string
  value: number
}

export interface Gap {
  fieldId: string
  label: string
  reason: string
}

export interface FilledField {
  label: string
  value: number
}

export interface GenerationResult {
  writes: CellWrite[]
  gaps: Gap[]
  filled: FilledField[]
}

export type Assumptions = Record<string, number>

export function generateModel(
  mapping: TemplateMapping,
  t12: ParsedT12 | null,
  rentRoll: ParsedRentRoll | null,
  assumptions: Assumptions
): GenerationResult {
  const writes: CellWrite[] = []
  const gaps: Gap[] = []
  const filled: FilledField[] = []

  for (const field of mapping.fields) {
    const value = resolveField(field, t12, rentRoll, assumptions)
    if (value === null) {
      gaps.push({ fieldId: field.id, label: field.label, reason: gapReason(field, t12, rentRoll) })
      continue
    }
    writes.push({ sheet: field.sheet, cell: field.cell, value })
    filled.push({ label: field.label, value })
  }

  return { writes, gaps, filled }
}

function resolveField(
  field: MappingField,
  t12: ParsedT12 | null,
  rentRoll: ParsedRentRoll | null,
  assumptions: Assumptions
): number | null {
  switch (field.source) {
    case 'assumption': {
      const value = assumptions[field.id]
      return typeof value === 'number' ? value : null
    }
    case 't12_subtotal': {
      if (!t12 || !field.sourceKey) return null
      const value = t12.subtotalsByLabel[field.sourceKey]
      return typeof value === 'number' ? value : null
    }
    case 't12_line_item': {
      if (!t12 || !field.sourceKey) return null
      const item = t12.lineItems.find((li) => li.label === field.sourceKey)
      return item ? item.total : null
    }
    case 'rent_roll_unit_count': {
      if (!rentRoll || !field.sourceKey) return null
      const block = rentRoll.unitTypeBlocks.find((b) => b.unitType === field.sourceKey)
      return block ? block.units.length : null
    }
    case 'rent_roll_average_budgeted_rent': {
      if (!rentRoll || !field.sourceKey) return null
      const block = rentRoll.unitTypeBlocks.find((b) => b.unitType === field.sourceKey)
      return block && block.units.length > 0 ? averageBudgetedRent(block.units) : null
    }
    default:
      return null
  }
}

function gapReason(field: MappingField, t12: ParsedT12 | null, rentRoll: ParsedRentRoll | null): string {
  if (field.source === 'assumption') return 'Not entered for this deal'
  if (field.source === 't12_subtotal' || field.source === 't12_line_item') {
    return t12 ? `Not found in the uploaded T12 (looked for "${field.sourceKey}")` : 'No T12 was provided'
  }
  return rentRoll
    ? `Not found in the uploaded rent roll (looked for "${field.sourceKey}")`
    : 'No rent roll was provided'
}
