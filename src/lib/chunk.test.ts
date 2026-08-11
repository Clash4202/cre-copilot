import { describe, it, expect } from 'vitest'
import { chunkText } from './chunk'

describe('chunkText', () => {
  it('returns an empty array for empty input', () => {
    expect(chunkText('')).toEqual([])
  })

  it('returns a single chunk for short text', () => {
    expect(chunkText('hello world')).toEqual(['hello world'])
  })

  it('splits long text into multiple overlapping chunks', () => {
    const text = 'a'.repeat(4000)
    const result = chunkText(text)
    expect(result.length).toBeGreaterThan(1)
    const overlapFromFirst = result[0].slice(-50)
    expect(result[1]).toContain(overlapFromFirst.slice(0, 10))
  })

  it('collapses internal whitespace', () => {
    expect(chunkText('hello    \n\n  world')).toEqual(['hello world'])
  })
})
