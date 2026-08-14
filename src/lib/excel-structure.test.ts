import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { describeWorkbookStructure } from './excel-structure'

describe('describeWorkbookStructure', () => {
  it('describes literal values, formulas, and which sheet each cell is on', () => {
    const workbook = new ExcelJS.Workbook()
    const sheet1 = workbook.addWorksheet('Cash Flow (DCF)')
    sheet1.getCell('A1').value = 'Discount Rate'
    sheet1.getCell('B1').value = 0.08
    sheet1.getCell('C1').value = { formula: 'A1&B1', result: 'Discount Rate0.08' }
    const sheet2 = workbook.addWorksheet('Direct Cap')
    sheet2.getCell('A1').value = 'Overall Rate'

    const cells = describeWorkbookStructure(workbook)

    expect(cells).toContainEqual({ sheet: 'Cash Flow (DCF)', cell: 'A1', value: 'Discount Rate', formula: null })
    expect(cells).toContainEqual({ sheet: 'Cash Flow (DCF)', cell: 'B1', value: 0.08, formula: null })
    expect(cells).toContainEqual({ sheet: 'Cash Flow (DCF)', cell: 'C1', value: null, formula: 'A1&B1' })
    expect(cells).toContainEqual({ sheet: 'Direct Cap', cell: 'A1', value: 'Overall Rate', formula: null })
  })

  it('skips empty cells', () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Sheet1')
    sheet.getCell('A1').value = 'x'

    const cells = describeWorkbookStructure(workbook)

    expect(cells).toHaveLength(1)
  })

  it('reports every cell in a shared formula range as a formula, never as a literal value', () => {
    // ExcelJS represents a shared formula's follower cells (e.g. a formula filled down/across a
    // range, as in a DCF model's Year 1..Year N projection grid) WITHOUT a `formula` key -- only a
    // `sharedFormula` key pointing at the master cell. Regression test for the bug where those
    // follower cells were emitted as literal values, indistinguishable from real input placeholders.
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Sheet1')
    sheet.getCell('A1').value = 2
    sheet.fillFormula('B1:B3', 'A1*2', [2, 4, 6])

    const cells = describeWorkbookStructure(workbook)

    const b1 = cells.find((c) => c.cell === 'B1')
    const b2 = cells.find((c) => c.cell === 'B2')
    const b3 = cells.find((c) => c.cell === 'B3')

    for (const cell of [b1, b2, b3]) {
      expect(cell).toBeDefined()
      expect(cell!.value).toBeNull()
      expect(cell!.formula).not.toBeNull()
    }
  })

  it('caps the number of cells described per sheet', () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Sheet1')
    sheet.getCell('A1').value = 'one'
    sheet.getCell('A2').value = 'two'
    sheet.getCell('A3').value = 'three'

    const cells = describeWorkbookStructure(workbook, 2)

    expect(cells).toHaveLength(2)
  })
})
