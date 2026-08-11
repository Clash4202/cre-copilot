import { describe, it, expect } from 'vitest'
import { checkRateLimit } from './rate-limit'

describe('checkRateLimit', () => {
  it('allows requests up to the limit', () => {
    const key = `test-${Math.random()}`
    expect(checkRateLimit(key, 3, 1000)).toBe(true)
    expect(checkRateLimit(key, 3, 1000)).toBe(true)
    expect(checkRateLimit(key, 3, 1000)).toBe(true)
  })

  it('blocks requests past the limit within the window', () => {
    const key = `test-${Math.random()}`
    checkRateLimit(key, 2, 1000)
    checkRateLimit(key, 2, 1000)
    expect(checkRateLimit(key, 2, 1000)).toBe(false)
  })

  it('tracks separate keys independently', () => {
    const keyA = `test-${Math.random()}`
    const keyB = `test-${Math.random()}`
    checkRateLimit(keyA, 1, 1000)
    expect(checkRateLimit(keyB, 1, 1000)).toBe(true)
  })
})
