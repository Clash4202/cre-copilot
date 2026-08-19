import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
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

  it('does not overwrite a SHARED formula cell even if a write instruction targets it', async () => {
    // Regression test for the shared-formula case: ExcelJS represents a shared formula's follower
    // cells (e.g. a formula filled down/across a range, as with a DCF model's Year 1..Year N grid)
    // without a `formula` key -- only `sharedFormula`. Defense-in-depth in writeGeneratedWorkbook
    // must recognize this representation too and refuse to overwrite it, even though nothing
    // upstream should ever produce a write instruction targeting it if the mapping is correct.
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('DCF')
    sheet.getCell('A1').value = 2
    sheet.fillFormula('B1:B3', 'A1*2', [2, 4, 6])
    const templateBuffer = (await workbook.xlsx.writeBuffer()) as ArrayBuffer

    const outputBuffer = await writeGeneratedWorkbook(templateBuffer, [{ sheet: 'DCF', cell: 'B2', value: 999 }])

    const output = new ExcelJS.Workbook()
    await output.xlsx.load(outputBuffer as unknown as ArrayBuffer)
    const outSheet = output.getWorksheet('DCF')!

    const b2 = outSheet.getCell('B2').value
    expect(b2).not.toBe(999)
    expect(typeof b2).toBe('object')
    expect(b2).not.toBeNull()
    expect((b2 as { sharedFormula?: string; formula?: string }).sharedFormula ?? (b2 as { formula?: string }).formula).toBeDefined()
  })

  it('sets fullCalcOnLoad so the opening application recalculates stale cached formula results', async () => {
    // ExcelJS's own workbook.xlsx.load() does not parse the calcPr attributes back out of the XML
    // (its calc-properties xform ignores node attributes on parseOpen), so round-tripping through
    // ExcelJS and inspecting workbook.calcProperties.fullCalcOnLoad cannot detect this. Inspect the
    // raw workbook.xml written into the .xlsx zip instead, which is what Excel/LibreOffice read.
    const templateBuffer = await buildTemplateBuffer()

    const outputBuffer = await writeGeneratedWorkbook(templateBuffer, [{ sheet: 'DCF', cell: 'A1', value: 999 }])

    const zip = await JSZip.loadAsync(outputBuffer)
    const workbookXml = await zip.file('xl/workbook.xml')!.async('string')

    expect(workbookXml).toMatch(/<calcPr[^>]*\bfullCalcOnLoad="1"/)
  })
})
