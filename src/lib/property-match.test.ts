import { describe, it, expect } from 'vitest'
import { buildPropertyNamePrompt, parsePropertyNameResponse, matchProjectByName } from './property-match'
import type { XlsxRow } from './xlsx-rows'

describe('buildPropertyNamePrompt', () => {
  it('embeds the header rows as JSON', () => {
    const rows: XlsxRow[] = [
      ['Income Statement', null, null],
      ['Avery Philly', null, null],
      ['Accrual Basis', null, null],
    ]

    const prompt = buildPropertyNamePrompt(rows)

    expect(prompt).toContain('Avery Philly')
  })
})

describe('parsePropertyNameResponse', () => {
  it('extracts a plain property name from the response', () => {
    expect(parsePropertyNameResponse('Avery Philly')).toBe('Avery Philly')
  })

  it('trims surrounding whitespace and quotes', () => {
    expect(parsePropertyNameResponse('  "Avery Philly"  \n')).toBe('Avery Philly')
  })

  it('returns null when the model reports it cannot tell', () => {
    expect(parsePropertyNameResponse('UNKNOWN')).toBeNull()
  })

  it('returns null for an empty response', () => {
    expect(parsePropertyNameResponse('')).toBeNull()
  })
})

describe('matchProjectByName', () => {
  it('matches case-insensitively', () => {
    const projects = [
      { id: '1', name: 'Test Deal' },
      { id: '2', name: 'Avery Philly' },
    ]

    expect(matchProjectByName('avery philly', projects)).toEqual({ id: '2', name: 'Avery Philly' })
  })

  it('matches ignoring surrounding whitespace', () => {
    const projects = [{ id: '1', name: 'Avery Philly' }]

    expect(matchProjectByName('  Avery Philly  ', projects)).toEqual({ id: '1', name: 'Avery Philly' })
  })

  it('returns null when nothing matches', () => {
    const projects = [{ id: '1', name: 'Test Deal' }]

    expect(matchProjectByName('Avery Philly', projects)).toBeNull()
  })

  it('returns null for a null name', () => {
    const projects = [{ id: '1', name: 'Test Deal' }]

    expect(matchProjectByName(null as unknown as string, projects)).toBeNull()
  })
})
