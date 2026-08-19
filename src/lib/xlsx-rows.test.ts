import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { readWorksheetRows } from './xlsx-rows'

describe('readWorksheetRows', () => {
  it('reads populated cells into 0-indexed row arrays', () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Sheet1')
    sheet.getCell('A1').value = 'Account'
    sheet.getCell('B1').value = 'Account Name'
    sheet.getCell('O1').value = 'Total'
    sheet.getCell('A2').value = '5005-0000'
    sheet.getCell('B2').value = 'Gross Market Rent'
    sheet.getCell('O2').value = 10641115.44

    const rows = readWorksheetRows(sheet)

    expect(rows[0][0]).toBe('Account')
    expect(rows[0][1]).toBe('Account Name')
    expect(rows[0][14]).toBe('Total')
    expect(rows[1][0]).toBe('5005-0000')
    expect(rows[1][1]).toBe('Gross Market Rent')
    expect(rows[1][14]).toBe(10641115.44)
  })

  it('returns null for empty cells within the used range', () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Sheet1')
    sheet.getCell('A1').value = 'x'
    sheet.getCell('F1').value = 'y'

    const rows = readWorksheetRows(sheet)

    expect(rows[0][2]).toBeNull()
  })

  it('returns an empty array for a sheet with no data', () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Empty')

    expect(readWorksheetRows(sheet)).toEqual([])
  })
})
