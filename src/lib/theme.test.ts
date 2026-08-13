import { describe, it, expect } from 'vitest'
import { isValidTheme, getNextTheme, resolveTheme, DEFAULT_THEME } from './theme'

describe('isValidTheme', () => {
  it('accepts "dark" and "light"', () => {
    expect(isValidTheme('dark')).toBe(true)
    expect(isValidTheme('light')).toBe(true)
  })

  it('rejects null and unrecognized values', () => {
    expect(isValidTheme(null)).toBe(false)
    expect(isValidTheme('blue')).toBe(false)
    expect(isValidTheme('')).toBe(false)
  })
})

describe('getNextTheme', () => {
  it('toggles dark to light', () => {
    expect(getNextTheme('dark')).toBe('light')
  })

  it('toggles light to dark', () => {
    expect(getNextTheme('light')).toBe('dark')
  })
})

describe('DEFAULT_THEME', () => {
  it('is dark, per the decision to make dark the deliberate default', () => {
    expect(DEFAULT_THEME).toBe('dark')
  })
})

describe('resolveTheme', () => {
  it('returns the cookie value when valid', () => {
    expect(resolveTheme('light')).toBe('light')
    expect(resolveTheme('dark')).toBe('dark')
  })

  it('falls back to DEFAULT_THEME when missing or invalid', () => {
    expect(resolveTheme(undefined)).toBe(DEFAULT_THEME)
    expect(resolveTheme('blue')).toBe(DEFAULT_THEME)
  })
})
