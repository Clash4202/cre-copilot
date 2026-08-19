import type { XlsxRow } from './xlsx-rows'

const LABEL_COL = 0
const STATUS_COL = 2
const MARKET_RENT_COL = 8
const BUDGETED_RENT_COL = 9
const ACTUAL_CHARGES_COL = 10
const UNIT_TYPE_PREFIX = 'Unit Type: '

export interface RentRollUnit {
  unitId: string
  status: string | null
  marketRent: number
  budgetedRent: number
  actualCharges: number
}

export interface RentRollUnitTypeBlock {
  unitType: string
  units: RentRollUnit[]
}

export interface ParsedRentRoll {
  unitTypeBlocks: RentRollUnitTypeBlock[]
}

export function parseRentRoll(rows: XlsxRow[]): ParsedRentRoll {
  const unitTypeBlocks: RentRollUnitTypeBlock[] = []
  let currentBlock: RentRollUnitTypeBlock | null = null

  for (const row of rows) {
    const label = row[LABEL_COL]
    if (typeof label !== 'string') continue

    if (label.startsWith(UNIT_TYPE_PREFIX)) {
      currentBlock = { unitType: label.slice(UNIT_TYPE_PREFIX.length), units: [] }
      unitTypeBlocks.push(currentBlock)
      continue
    }
    if (label.endsWith(' Total:') || label === 'Total') continue
    if (!currentBlock) continue

    const status = row[STATUS_COL]
    const marketRent = row[MARKET_RENT_COL]
    const budgetedRent = row[BUDGETED_RENT_COL]
    const actualCharges = row[ACTUAL_CHARGES_COL]

    currentBlock.units.push({
      unitId: label,
      status: typeof status === 'string' ? status : null,
      marketRent: typeof marketRent === 'number' ? marketRent : 0,
      budgetedRent: typeof budgetedRent === 'number' ? budgetedRent : 0,
      actualCharges: typeof actualCharges === 'number' ? actualCharges : 0,
    })
  }

  return { unitTypeBlocks }
}

export function averageBudgetedRent(units: RentRollUnit[]): number {
  if (units.length === 0) return 0
  return units.reduce((sum, unit) => sum + unit.budgetedRent, 0) / units.length
}
