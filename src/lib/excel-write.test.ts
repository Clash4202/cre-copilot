import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { writeGeneratedWorkbook } from './excel-write'

async function buildTemplateBuffer(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('DCF')
  sheet.getCell('A1').value = 0 // the input cell this test will write to
  sheet.getCell('B1').value = { formula: 'A1*2', result: 0 } // a formula cell that must survive untouched
  sheet.getCell('C1').value = 'label' // an untouched cell
  const buffer = await workbook.xlsx.writeBuffer()
  return buffer as ArrayBuffer
}

describe('writeGeneratedWorkbook', () => {
  it('writes only the given cells, leaving formulas and other cells untouched', async () => {
    const templateBuffer = await buildTemplateBuffer()

    const outputBuffer = await writeGeneratedWorkbook(templateBuffer, [{ sheet: 'DCF', cell: 'A1', value: 214125.62 }])

    const output = new ExcelJS.Workbook()
    await output.xlsx.load(outputBuffer as unknown as ArrayBuffer)
    const sheet = output.getWorksheet('DCF')!

    expect(sheet.getCell('A1').value).toBe(214125.62)
    expect(sheet.getCell('B1').formula).toBe('A1*2')
    expect(sheet.getCell('C1').value).toBe('label')
  })

  it('skips a write targeting a sheet that does not exist in the template, without throwing', async () => {
    const templateBuffer = await buildTemplateBuffer()

    const outputBuffer = await writeGeneratedWorkbook(templateBuffer, [{ sheet: 'Nonexistent', cell: 'A1', value: 1 }])

    const output = new ExcelJS.Workbook()
    await output.xlsx.load(outputBuffer as unknown as ArrayBuffer)
    expect(output.getWorksheet('DCF')!.getCell('A1').value).toBe(0)
  })
})
