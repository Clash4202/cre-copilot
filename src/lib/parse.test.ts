import { describe, it, expect } from 'vitest'
import { extractTextFromFile } from './parse'

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
