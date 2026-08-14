import { describe, it, expect } from 'vitest'
import { buildMappingPrompt, parseMappingResponse } from './template-mapping'
import type { CellDescriptor } from './excel-structure'

describe('buildMappingPrompt', () => {
  it('embeds the asset type and the serialized structure', () => {
    const structure: CellDescriptor[] = [
      { sheet: 'Cash Flow (DCF)', cell: 'M8', value: 0.08, formula: null },
    ]

    const prompt = buildMappingPrompt(structure, 'multifamily')

    expect(prompt).toContain('multifamily')
    expect(prompt).toContain('"sheet":"Cash Flow (DCF)"')
    expect(prompt).toContain('"cell":"M8"')
  })

  it('lists every valid source kind so the model knows the fixed vocabulary', () => {
    const prompt = buildMappingPrompt([], 'retail')

    expect(prompt).toContain('assumption')
    expect(prompt).toContain('t12_subtotal')
    expect(prompt).toContain('t12_line_item')
    expect(prompt).toContain('rent_roll_unit_count')
    expect(prompt).toContain('rent_roll_average_budgeted_rent')
  })
})

describe('parseMappingResponse', () => {
  it('parses a clean JSON response', () => {
    const response = JSON.stringify({
      fields: [
        { id: 'assumption.discountRate', label: 'Discount Rate', sheet: 'Cash Flow (DCF)', cell: 'M8', source: 'assumption', sourceKey: null },
      ],
    })

    const result = parseMappingResponse(response)

    expect(result.fields).toEqual([
      { id: 'assumption.discountRate', label: 'Discount Rate', sheet: 'Cash Flow (DCF)', cell: 'M8', source: 'assumption', sourceKey: null },
    ])
  })

  it('extracts JSON even when wrapped in prose or a code fence', () => {
    const response =
      'Here is the mapping:\n```json\n{"fields":[{"id":"a","label":"A","sheet":"S","cell":"A1","source":"assumption","sourceKey":null}]}\n```\nLet me know if you want changes.'

    const result = parseMappingResponse(response)

    expect(result.fields).toHaveLength(1)
    expect(result.fields[0].id).toBe('a')
  })

  it('throws a clear error when the response has no JSON object', () => {
    expect(() => parseMappingResponse('Sorry, I could not analyze this template.')).toThrow(
      /did not contain a JSON object/
    )
  })

  it('throws a clear error when the JSON is malformed', () => {
    expect(() => parseMappingResponse('{"fields": [')).toThrow(/not valid JSON/)
  })

  it('filters out fields with an invalid source value instead of throwing', () => {
    const response = JSON.stringify({
      fields: [
        { id: 'a', label: 'A', sheet: 'S', cell: 'A1', source: 'not_a_real_source', sourceKey: null },
        { id: 'b', label: 'B', sheet: 'S', cell: 'B1', source: 'assumption', sourceKey: null },
      ],
    })

    const result = parseMappingResponse(response)

    expect(result.fields).toHaveLength(1)
    expect(result.fields[0].id).toBe('b')
  })

  it('filters out fields missing required keys', () => {
    const response = JSON.stringify({
      fields: [{ id: 'a', source: 'assumption' }],
    })

    expect(parseMappingResponse(response).fields).toEqual([])
  })
})
