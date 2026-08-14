import ExcelJS from 'exceljs'
import type { CellWrite } from './model-generation'

export async function writeGeneratedWorkbook(templateBuffer: ArrayBuffer, writes: CellWrite[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(templateBuffer)

  for (const write of writes) {
    const sheet = workbook.getWorksheet(write.sheet)
    if (!sheet) continue
    sheet.getCell(write.cell).value = write.value
  }

  return (await workbook.xlsx.writeBuffer()) as unknown as Buffer
}
