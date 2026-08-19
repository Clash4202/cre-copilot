import ExcelJS from 'exceljs'
import type { CellWrite } from './model-generation'

export async function writeGeneratedWorkbook(templateBuffer: ArrayBuffer, writes: CellWrite[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(templateBuffer)

  for (const write of writes) {
    const sheet = workbook.getWorksheet(write.sheet)
    if (!sheet) continue

    const cell = sheet.getCell(write.cell)
    const raw = cell.value
    // Defense-in-depth: never overwrite a cell that is currently a formula, whether it's the
    // formula's master cell (`formula` key) or one of its shared-formula followers (`sharedFormula`
    // key). This should never trigger if the mapping upstream is correct, but it guarantees the
    // "never touch a formula cell" rule structurally rather than relying on that alone.
    const isFormulaCell = typeof raw === 'object' && raw !== null && ('formula' in raw || 'sharedFormula' in raw)
    if (isFormulaCell) continue

    cell.value = write.value
  }

  // Writing a new input value leaves downstream formula cells showing their stale cached results
  // from the template. This does not evaluate any formulas ourselves: it only asks whichever
  // application opens the file (Excel, LibreOffice, etc.) to perform its own normal recalculation.
  workbook.calcProperties.fullCalcOnLoad = true

  return (await workbook.xlsx.writeBuffer()) as unknown as Buffer
}
