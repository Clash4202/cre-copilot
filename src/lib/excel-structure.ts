import type { Workbook } from 'exceljs'

export interface CellDescriptor {
  sheet: string
  cell: string
  value: string | number | null
  formula: string | null
}

const DEFAULT_MAX_CELLS_PER_SHEET = 2000

export function describeWorkbookStructure(
  workbook: Workbook,
  maxCellsPerSheet: number = DEFAULT_MAX_CELLS_PER_SHEET
): CellDescriptor[] {
  const cells: CellDescriptor[] = []

  workbook.eachSheet((worksheet) => {
    let count = 0
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (count >= maxCellsPerSheet) return
        const raw = cell.value
        if (raw === null || raw === undefined) return

        let value: string | number | null = null
        let formula: string | null = null

        if (typeof raw === 'object' && raw !== null && ('formula' in raw || 'sharedFormula' in raw)) {
          // A shared formula's follower cells (e.g. a formula filled down/across a range) carry only
          // a `sharedFormula` key pointing at the master cell, not a `formula` key. Either key means
          // this is a formula cell and must never be treated as a literal/candidate-input value.
          const formulaCell = raw as { formula?: string; sharedFormula?: string }
          formula = formulaCell.formula ?? formulaCell.sharedFormula ?? null
        } else if (typeof raw === 'number' || typeof raw === 'string') {
          value = raw
        } else {
          value = cell.text || null
        }

        cells.push({ sheet: worksheet.name, cell: cell.address, value, formula })
        count++
      })
    })
  })

  return cells
}
