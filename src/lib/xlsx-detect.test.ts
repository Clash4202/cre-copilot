import { describe, it, expect } from 'vitest'
import { detectDocumentKind } from './xlsx-detect'
import type { XlsxRow } from './xlsx-rows'

function t12Row(accountCode: string | null, label: string | null, total: number | null): XlsxRow {
  const r: XlsxRow = new Array(15).fill(null)
  r[0] = accountCode
  r[1] = label
  r[14] = total
  return r
}

function rentRollRow(label: string | null, budgetedRent: number | null): XlsxRow {
  const r: XlsxRow = new Array(11).fill(null)
  r[0] = label
  r[9] = budgetedRent
  return r
}

describe('detectDocumentKind', () => {
  it('detects a T12 by its GL-coded line items and labeled subtotals', () => {
    const rows = [
      t12Row('5005-0000', 'Gross Market Rent', 10641115.44),
      t12Row(null, 'Gross Potential Rent', 10322963.78),
    ]

    expect(detectDocumentKind(rows)).toBe('t12')
  })

  it('detects a rent roll by its Unit Type blocks with units', () => {
    const rows = [
      rentRollRow('Unit Type: Retail', null),
      rentRollRow('RetailSpace 1', 0),
    ]

    expect(detectDocumentKind(rows)).toBe('rent_roll')
  })

  it('returns unknown for a sheet matching neither structure', () => {
    const rows: XlsxRow[] = [['Just', 'some', 'random', 'spreadsheet', 'data']]

    expect(detectDocumentKind(rows)).toBe('unknown')
  })

  it('returns unknown for an empty sheet', () => {
    expect(detectDocumentKind([])).toBe('unknown')
  })
})
