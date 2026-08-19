import { describe, it, expect } from 'vitest'
import { generateModel } from './model-generation'
import type { TemplateMapping } from './template-mapping'
import type { ParsedT12 } from './t12'
import type { ParsedRentRoll } from './rent-roll'

const t12: ParsedT12 = {
  lineItems: [{ accountCode: '7005-0000', label: 'Property Taxes', total: 1056595.25 }],
  subtotalsByLabel: {
    'Total General & Administrative': 214125.62,
    'NET OPERATING INCOME': 1488873.7,
  },
}

const rentRoll: ParsedRentRoll = {
  unitTypeBlocks: [
    {
      unitType: 'A1 Studio',
      units: [
        { unitId: '159', status: 'Vacant Unrented Ready', marketRent: 1399, budgetedRent: 1249, actualCharges: 0 },
        { unitId: '164', status: 'Occupied No Notice', marketRent: 1399, budgetedRent: 1249, actualCharges: 612.95 },
      ],
    },
  ],
}

describe('generateModel', () => {
  it('resolves an assumption field from the entered assumptions', () => {
    const mapping: TemplateMapping = {
      fields: [{ id: 'assumption.discountRate', label: 'Discount Rate', sheet: 'DCF', cell: 'M8', source: 'assumption', sourceKey: null }],
    }

    const result = generateModel(mapping, null, null, { 'assumption.discountRate': 0.08 })

    expect(result.writes).toEqual([{ sheet: 'DCF', cell: 'M8', value: 0.08 }])
    expect(result.gaps).toEqual([])
    expect(result.filled).toEqual([{ label: 'Discount Rate', value: 0.08 }])
  })

  it('flags an unentered assumption as a gap', () => {
    const mapping: TemplateMapping = {
      fields: [{ id: 'assumption.discountRate', label: 'Discount Rate', sheet: 'DCF', cell: 'M8', source: 'assumption', sourceKey: null }],
    }

    const result = generateModel(mapping, null, null, {})

    expect(result.writes).toEqual([])
    expect(result.gaps).toEqual([{ fieldId: 'assumption.discountRate', label: 'Discount Rate', reason: 'Not entered for this deal' }])
  })

  it('resolves a t12_subtotal field from the parsed T12', () => {
    const mapping: TemplateMapping = {
      fields: [{ id: 'opex.gna', label: 'G&A', sheet: 'DCF', cell: 'E34', source: 't12_subtotal', sourceKey: 'Total General & Administrative' }],
    }

    const result = generateModel(mapping, t12, null, {})

    expect(result.writes).toEqual([{ sheet: 'DCF', cell: 'E34', value: 214125.62 }])
  })

  it('flags a t12_subtotal field as a gap when no T12 was provided', () => {
    const mapping: TemplateMapping = {
      fields: [{ id: 'opex.gna', label: 'G&A', sheet: 'DCF', cell: 'E34', source: 't12_subtotal', sourceKey: 'Total General & Administrative' }],
    }

    const result = generateModel(mapping, null, null, {})

    expect(result.gaps).toEqual([{ fieldId: 'opex.gna', label: 'G&A', reason: 'No T12 was provided' }])
  })

  it('flags a t12_subtotal field as a gap when the label is not found in the T12', () => {
    const mapping: TemplateMapping = {
      fields: [{ id: 'opex.unknown', label: 'Unknown Category', sheet: 'DCF', cell: 'E99', source: 't12_subtotal', sourceKey: 'Not A Real Category' }],
    }

    const result = generateModel(mapping, t12, null, {})

    expect(result.gaps).toEqual([
      { fieldId: 'opex.unknown', label: 'Unknown Category', reason: 'Not found in the uploaded T12 (looked for "Not A Real Category")' },
    ])
  })

  it('resolves a t12_line_item field from the parsed T12', () => {
    const mapping: TemplateMapping = {
      fields: [{ id: 'opex.taxes', label: 'Property Taxes', sheet: 'DCF', cell: 'E44', source: 't12_line_item', sourceKey: 'Property Taxes' }],
    }

    const result = generateModel(mapping, t12, null, {})

    expect(result.writes).toEqual([{ sheet: 'DCF', cell: 'E44', value: 1056595.25 }])
  })

  it('resolves rent_roll_unit_count and rent_roll_average_budgeted_rent fields', () => {
    const mapping: TemplateMapping = {
      fields: [
        { id: 'unitmix.a1studio.count', label: 'A1 Studio Count', sheet: 'DCF', cell: 'C4', source: 'rent_roll_unit_count', sourceKey: 'A1 Studio' },
        { id: 'unitmix.a1studio.rent', label: 'A1 Studio Avg Rent', sheet: 'DCF', cell: 'F4', source: 'rent_roll_average_budgeted_rent', sourceKey: 'A1 Studio' },
      ],
    }

    const result = generateModel(mapping, null, rentRoll, {})

    expect(result.writes).toEqual([
      { sheet: 'DCF', cell: 'C4', value: 2 },
      { sheet: 'DCF', cell: 'F4', value: 1249 },
    ])
  })

  it('flags rent-roll fields as gaps when no rent roll was provided', () => {
    const mapping: TemplateMapping = {
      fields: [{ id: 'unitmix.a1studio.count', label: 'A1 Studio Count', sheet: 'DCF', cell: 'C4', source: 'rent_roll_unit_count', sourceKey: 'A1 Studio' }],
    }

    const result = generateModel(mapping, null, null, {})

    expect(result.gaps).toEqual([{ fieldId: 'unitmix.a1studio.count', label: 'A1 Studio Count', reason: 'No rent roll was provided' }])
  })

  it('flags rent-roll fields as gaps when the unit type is not found', () => {
    const mapping: TemplateMapping = {
      fields: [{ id: 'unitmix.penthouse.count', label: 'Penthouse Count', sheet: 'DCF', cell: 'C9', source: 'rent_roll_unit_count', sourceKey: 'Penthouse' }],
    }

    const result = generateModel(mapping, null, rentRoll, {})

    expect(result.gaps).toEqual([
      { fieldId: 'unitmix.penthouse.count', label: 'Penthouse Count', reason: 'Not found in the uploaded rent roll (looked for "Penthouse")' },
    ])
  })

  it('mixes resolved fields and gaps across sources in one pass', () => {
    const mapping: TemplateMapping = {
      fields: [
        { id: 'assumption.discountRate', label: 'Discount Rate', sheet: 'DCF', cell: 'M8', source: 'assumption', sourceKey: null },
        { id: 'opex.gna', label: 'G&A', sheet: 'DCF', cell: 'E34', source: 't12_subtotal', sourceKey: 'Total General & Administrative' },
        { id: 'unitmix.a1studio.count', label: 'A1 Studio Count', sheet: 'DCF', cell: 'C4', source: 'rent_roll_unit_count', sourceKey: 'A1 Studio' },
        { id: 'opex.missing', label: 'Missing Category', sheet: 'DCF', cell: 'E50', source: 't12_subtotal', sourceKey: 'Nonexistent' },
      ],
    }

    const result = generateModel(mapping, t12, rentRoll, { 'assumption.discountRate': 0.08 })

    expect(result.writes).toHaveLength(3)
    expect(result.gaps).toHaveLength(1)
    expect(result.gaps[0].fieldId).toBe('opex.missing')
    expect(result.filled).toHaveLength(3)
  })
})
