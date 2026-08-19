import type { XlsxRow } from './xlsx-rows'

const GL_CODE_PATTERN = /^\d{4}-\d{4}$/
const ACCOUNT_COL = 0
const LABEL_COL = 1
const TOTAL_COL = 14

export interface T12LineItem {
  accountCode: string
  label: string
  total: number
}

export interface ParsedT12 {
  lineItems: T12LineItem[]
  subtotalsByLabel: Record<string, number>
}

export function parseT12(rows: XlsxRow[]): ParsedT12 {
  const lineItems: T12LineItem[] = []
  const subtotalsByLabel: Record<string, number> = {}

  for (const row of rows) {
    const accountCode = row[ACCOUNT_COL]
    const label = row[LABEL_COL]
    const total = row[TOTAL_COL]

    const isGlCodeRow = typeof accountCode === 'string' && GL_CODE_PATTERN.test(accountCode)

    if (isGlCodeRow && typeof label === 'string' && typeof total === 'number') {
      lineItems.push({ accountCode: accountCode as string, label, total })
    } else if (accountCode === null && typeof label === 'string' && typeof total === 'number') {
      subtotalsByLabel[label] = total
    }
  }

  return { lineItems, subtotalsByLabel }
}
