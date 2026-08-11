import { describe, it, expect, vi, beforeEach } from 'vitest'
import { embedTexts } from './voyage'

describe('embedTexts', () => {
  beforeEach(() => {
    process.env.VOYAGE_API_KEY = 'test-key'
  })

  it('returns embeddings in input order regardless of response order', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { embedding: [0.2], index: 1 },
          { embedding: [0.1], index: 0 },
        ],
      }),
    }) as unknown as typeof fetch

    const result = await embedTexts(['a', 'b'], 'document')
    expect(result).toEqual([[0.1], [0.2]])
  })

  it('throws with the response body on failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid key',
    }) as unknown as typeof fetch

    await expect(embedTexts(['a'], 'document')).rejects.toThrow('401')
  })
})
