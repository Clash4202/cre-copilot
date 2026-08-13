import { describe, it, expect } from 'vitest'
import { buildCitations } from './citations'

describe('buildCitations', () => {
  const matches = [
    { document_id: 'doc-1', content: 'a'.repeat(250) },
    { document_id: 'doc-2', content: 'short excerpt' },
  ]
  const fileNameById = new Map([
    ['doc-1', 'Rent Roll.pdf'],
    ['doc-2', 'T12.pdf'],
  ])

  it('numbers citations starting at 1', () => {
    const result = buildCitations(matches, fileNameById)
    expect(result[0].index).toBe(1)
    expect(result[1].index).toBe(2)
  })

  it('truncates excerpts to 200 characters', () => {
    const result = buildCitations(matches, fileNameById)
    expect(result[0].excerpt.length).toBe(200)
  })

  it('falls back to "unknown document" when a file name is missing', () => {
    const result = buildCitations([{ document_id: 'doc-missing', content: 'x' }], fileNameById)
    expect(result[0].fileName).toBe('unknown document')
  })

  it('omits projectNames when no project map is given', () => {
    const result = buildCitations(matches, fileNameById)
    expect(result[0].projectNames).toBeUndefined()
  })

  it('includes projectNames from the project map when given', () => {
    const projectNamesByDocId = new Map([['doc-1', ['123 Main St']]])
    const result = buildCitations(matches, fileNameById, projectNamesByDocId)
    expect(result[0].projectNames).toEqual(['123 Main St'])
    expect(result[1].projectNames).toEqual([])
  })
})
