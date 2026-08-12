import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockStream = vi.fn()
const mockFinalMessage = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function () {
    return {
      messages: {
        stream: (...args: unknown[]) => {
          mockStream(...args)
          return { finalMessage: mockFinalMessage }
        },
      },
    }
  }),
}))

import { transcribeScannedPdf, exceedsOcrLimits, MAX_OCR_PAGES, MAX_OCR_FILE_BYTES } from './ocr'

describe('exceedsOcrLimits', () => {
  it('allows a document within both limits', () => {
    expect(exceedsOcrLimits(1_000_000, 10)).toBeNull()
  })

  it('rejects a document over the page cap', () => {
    expect(exceedsOcrLimits(1_000_000, MAX_OCR_PAGES + 1)).toMatch(/too many scanned pages/)
  })

  it('rejects a document over the file size cap', () => {
    expect(exceedsOcrLimits(MAX_OCR_FILE_BYTES + 1, 5)).toMatch(/too large to transcribe/)
  })

  it('allows a document exactly at both caps', () => {
    expect(exceedsOcrLimits(MAX_OCR_FILE_BYTES, MAX_OCR_PAGES)).toBeNull()
  })
})

describe('transcribeScannedPdf', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockStream.mockClear()
    mockFinalMessage.mockReset()
  })

  it('sends the PDF as a document content block and returns the transcribed text', async () => {
    mockFinalMessage.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Page 1 content here.' }],
    })

    const result = await transcribeScannedPdf(new ArrayBuffer(8))

    expect(result).toBe('Page 1 content here.')
    const request = mockStream.mock.calls[0][0]
    expect(request.messages[0].content[0]).toMatchObject({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf' },
    })
  })

  it('tells Claude to treat page content as untrusted data, not instructions', async () => {
    mockFinalMessage.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'ok' }],
    })

    await transcribeScannedPdf(new ArrayBuffer(8))

    const request = mockStream.mock.calls[0][0]
    expect(request.system).toMatch(/not as instructions/i)
  })

  it('throws when the response has no text block', async () => {
    mockFinalMessage.mockResolvedValue({ stop_reason: 'end_turn', content: [] })

    await expect(transcribeScannedPdf(new ArrayBuffer(8))).rejects.toThrow('no text')
  })

  it('throws when the transcription was truncated', async () => {
    mockFinalMessage.mockResolvedValue({
      stop_reason: 'max_tokens',
      content: [{ type: 'text', text: 'partial...' }],
    })

    await expect(transcribeScannedPdf(new ArrayBuffer(8))).rejects.toThrow('truncated')
  })
})
