import { describe, it, expect } from 'vitest'
import { parseRentRoll, averageBudgetedRent } from './rent-roll'
import type { XlsxRow } from './xlsx-rows'

function row(
  label: string | null,
  status: string | null,
  marketRent: number | null,
  budgetedRent: number | null,
  actualCharges: number | null
): XlsxRow {
  const r: XlsxRow = new Array(11).fill(null)
  r[0] = label
  r[2] = status
  r[8] = marketRent
  r[9] = budgetedRent
  r[10] = actualCharges
  return r
}

describe('parseRentRoll', () => {
  it('groups units into blocks by Unit Type header, closing on the Total: row', () => {
    const rows = [
      row('Rent Roll', null, null, null, null),
      row('Unit Details', null, null, null, null),
      row('Bldg-Unit', 'Unit Status', null, null, null),
      row('Unit Type: Retail', null, null, null, null),
      row('RetailSpace 1', 'Occupied No Notice', 0, 0, 6481),
      row('RetailSpace 2', 'Occupied No Notice', 0, 0, 5706.95),
      row('RetailSpace 3', 'Vacant Unrented Ready', 0, 0, 0),
      row('RetailSpace 4', 'Vacant Unrented Ready', 0, 0, 0),
      row('Retail Total:', null, 0, 0, 12187.95),
      row('Unit Type: A1 Studio', null, null, null, null),
      row('159', 'Vacant Unrented Ready', 1399, 1249, 0),
      row('162', 'Vacant Unrented Ready', 1399, 1249, 0),
      row('163', 'Vacant Unrented Ready', 1399, 1249, 0),
      row('164', 'Occupied No Notice', 1399, 1249, 612.95),
    ]

    const result = parseRentRoll(rows)

    expect(result.unitTypeBlocks).toHaveLength(2)
    expect(result.unitTypeBlocks[0].unitType).toBe('Retail')
    expect(result.unitTypeBlocks[0].units).toEqual([
      { unitId: 'RetailSpace 1', status: 'Occupied No Notice', marketRent: 0, budgetedRent: 0, actualCharges: 6481 },
      { unitId: 'RetailSpace 2', status: 'Occupied No Notice', marketRent: 0, budgetedRent: 0, actualCharges: 5706.95 },
      { unitId: 'RetailSpace 3', status: 'Vacant Unrented Ready', marketRent: 0, budgetedRent: 0, actualCharges: 0 },
      { unitId: 'RetailSpace 4', status: 'Vacant Unrented Ready', marketRent: 0, budgetedRent: 0, actualCharges: 0 },
    ])
    expect(result.unitTypeBlocks[1].unitType).toBe('A1 Studio')
    expect(result.unitTypeBlocks[1].units).toHaveLength(4)
    expect(result.unitTypeBlocks[1].units[3]).toEqual({
      unitId: '164',
      status: 'Occupied No Notice',
      marketRent: 1399,
      budgetedRent: 1249,
      actualCharges: 612.95,
    })
  })

  it('ignores rows before the first Unit Type header', () => {
    const rows = [row('Some stray label', 'Occupied No Notice', 500, 500, 500)]

    expect(parseRentRoll(rows).unitTypeBlocks).toEqual([])
  })

  it('returns an empty structure for an empty sheet', () => {
    expect(parseRentRoll([])).toEqual({ unitTypeBlocks: [] })
  })
})

describe('averageBudgetedRent', () => {
  it('averages budgeted rent across every unit in a block, vacant or occupied', () => {
    const units = [
      { unitId: '159', status: 'Vacant Unrented Ready', marketRent: 1399, budgetedRent: 1249, actualCharges: 0 },
      { unitId: '162', status: 'Vacant Unrented Ready', marketRent: 1399, budgetedRent: 1249, actualCharges: 0 },
      { unitId: '163', status: 'Vacant Unrented Ready', marketRent: 1399, budgetedRent: 1249, actualCharges: 0 },
      { unitId: '164', status: 'Occupied No Notice', marketRent: 1399, budgetedRent: 1249, actualCharges: 612.95 },
    ]

    expect(averageBudgetedRent(units)).toBe(1249)
  })

  it('returns 0 for an empty unit list', () => {
    expect(averageBudgetedRent([])).toBe(0)
  })
})
