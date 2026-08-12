import { describe, it, expect } from 'vitest'
import { extractTextFromFile, isPageScanned, OCR_TEXT_THRESHOLD } from './parse'

describe('extractTextFromFile', () => {
  it('reads plain text files directly', async () => {
    const file = new File(['hello world'], 'notes.txt', { type: 'text/plain' })
    const result = await extractTextFromFile(file)
    expect(result).toBe('hello world')
  })

  it('rejects unsupported file types', async () => {
    const file = new File(['data'], 'image.png', { type: 'image/png' })
    await expect(extractTextFromFile(file)).rejects.toThrow('Unsupported file type')
  })
})

describe('isPageScanned', () => {
  it('treats a page with real text as not scanned', () => {
    expect(
      isPageScanned(
        'This is a full page of ordinary extracted PDF text content with plenty of real words on it.'
      )
    ).toBe(false)
  })

  it('treats an empty or near-empty page as scanned', () => {
    expect(isPageScanned('')).toBe(true)
    expect(isPageScanned('   \n  ')).toBe(true)
  })

  it('treats a page right at the threshold as scanned, and one above it as not', () => {
    const atThreshold = 'x'.repeat(OCR_TEXT_THRESHOLD - 1)
    const aboveThreshold = 'x'.repeat(OCR_TEXT_THRESHOLD)
    expect(isPageScanned(atThreshold)).toBe(true)
    expect(isPageScanned(aboveThreshold)).toBe(false)
  })

  it('counts only non-whitespace characters toward the threshold', () => {
    const mostlyWhitespace = 'x'.repeat(OCR_TEXT_THRESHOLD) + ' '.repeat(1000)
    expect(isPageScanned(mostlyWhitespace)).toBe(false)
    const paddedButEmpty = ' '.repeat(OCR_TEXT_THRESHOLD + 1000)
    expect(isPageScanned(paddedButEmpty)).toBe(true)
  })
})
