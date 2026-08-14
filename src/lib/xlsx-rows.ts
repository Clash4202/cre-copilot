import type { Worksheet } from 'exceljs'

export type XlsxRow = (string | number | null)[]

export function readWorksheetRows(worksheet: Worksheet): XlsxRow[] {
  const rows: XlsxRow[] = []

  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const values: XlsxRow = []
    for (let col = 1; col <= worksheet.columnCount; col++) {
      const raw = row.getCell(col).value
      if (typeof raw === 'number' || typeof raw === 'string') {
        values[col - 1] = raw
      } else if (raw === null || raw === undefined) {
        values[col - 1] = null
      } else {
        values[col - 1] = row.getCell(col).text || null
      }
    }
    rows[row.number - 1] = values
  })

  return rows.map((row) => row ?? [])
}
