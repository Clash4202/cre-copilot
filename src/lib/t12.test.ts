import { describe, it, expect } from 'vitest'
import { parseT12 } from './t12'
import type { XlsxRow } from './xlsx-rows'

function row(accountCode: string | null, label: string | null, total: number | string | null): XlsxRow {
  const r: XlsxRow = new Array(15).fill(null)
  r[0] = accountCode
  r[1] = label
  r[14] = total
  return r
}

describe('parseT12', () => {
  it('extracts GL-coded rows as line items, keyed with their account code', () => {
    const rows = [
      row('Income Statement', null, null),
      row('Operating Income', null, null),
      row('Gross Potential Rent', null, null),
      row('5005-0000', 'Gross Market Rent', 10641115.44),
      row('5010-0000', 'Contract Gain(Loss) to Lease', -318151.66),
    ]

    const result = parseT12(rows)

    expect(result.lineItems).toEqual([
      { accountCode: '5005-0000', label: 'Gross Market Rent', total: 10641115.44 },
      { accountCode: '5010-0000', label: 'Contract Gain(Loss) to Lease', total: -318151.66 },
    ])
  })

  it('extracts unaccounted rows with a label and a numeric total as subtotals', () => {
    const rows = [
      row('5005-0000', 'Gross Market Rent', 10641115.44),
      row('5010-0000', 'Contract Gain(Loss) to Lease', -318151.66),
      row(null, 'Gross Potential Rent', 10322963.78),
      row(null, 'Total General & Administrative', 214125.62),
      row(null, 'NET OPERATING INCOME', 1488873.7),
    ]

    const result = parseT12(rows)

    expect(result.subtotalsByLabel).toEqual({
      'Gross Potential Rent': 10322963.78,
      'Total General & Administrative': 214125.62,
      'NET OPERATING INCOME': 1488873.7,
    })
  })

  it('ignores title rows, section-header-only rows, and the column header row', () => {
    const rows = [
      row('Income Statement', null, null),
      row('Avery Philly', null, null),
      row('Accrual Basis', null, null),
      row('Operating Income', null, null),
      row('Account', 'Account Name', 'Total'),
    ]

    const result = parseT12(rows)

    expect(result.lineItems).toEqual([])
    expect(result.subtotalsByLabel).toEqual({})
  })

  it('returns empty structures for an empty sheet', () => {
    expect(parseT12([])).toEqual({ lineItems: [], subtotalsByLabel: {} })
  })
})
