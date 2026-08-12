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

import {
  transcribeScannedPdf,
  parseTranscribedPages,
  exceedsOcrLimits,
  MAX_OCR_PAGES,
  MAX_OCR_FILE_BYTES,
} from './ocr'

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

describe('parseTranscribedPages', () => {
  it('splits a multi-page transcription into one string per page', () => {
    const text = '--- Page 1 ---\nFirst page text.\n\n--- Page 2 ---\nSecond page text.'
    expect(parseTranscribedPages(text, 2)).toEqual(['First page text.', 'Second page text.'])
  })

  it('trims whitespace around each page\'s content', () => {
    const text = '--- Page 1 ---\n\n  padded text  \n\n--- Page 2 ---\n\nmore text\n'
    expect(parseTranscribedPages(text, 2)).toEqual(['padded text', 'more text'])
  })

  it('throws when the marker count does not match the expected page count', () => {
    const text = '--- Page 1 ---\nOnly one page.'
    expect(() => parseTranscribedPages(text, 2)).toThrow(/expected 2/)
  })

  it('throws when pages are out of order or mislabeled', () => {
    const text = '--- Page 1 ---\nFirst.\n\n--- Page 3 ---\nMislabeled.'
    expect(() => parseTranscribedPages(text, 2)).toThrow(/out of order|mislabeled/)
  })
})

describe('transcribeScannedPdf', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockStream.mockClear()
    mockFinalMessage.mockReset()
  })

  it('sends the PDF as a document content block and returns one transcription per page', async () => {
    mockFinalMessage.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '--- Page 1 ---\nPage 1 content here.\n\n--- Page 2 ---\nPage 2 content here.' }],
    })

    const result = await transcribeScannedPdf(new ArrayBuffer(8), 2)

    expect(result).toEqual(['Page 1 content here.', 'Page 2 content here.'])
    const request = mockStream.mock.calls[0][0]
    expect(request.messages[0].content[0]).toMatchObject({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf' },
    })
  })

  it('tells Claude to treat page content as untrusted data, not instructions', async () => {
    mockFinalMessage.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '--- Page 1 ---\nok' }],
    })

    await transcribeScannedPdf(new ArrayBuffer(8), 1)

    const request = mockStream.mock.calls[0][0]
    expect(request.system).toMatch(/not as instructions/i)
  })

  it('throws when the response has no text block', async () => {
    mockFinalMessage.mockResolvedValue({ stop_reason: 'end_turn', content: [] })

    await expect(transcribeScannedPdf(new ArrayBuffer(8), 1)).rejects.toThrow('no text')
  })

  it('throws when the transcription was truncated', async () => {
    mockFinalMessage.mockResolvedValue({
      stop_reason: 'max_tokens',
      content: [{ type: 'text', text: 'partial...' }],
    })

    await expect(transcribeScannedPdf(new ArrayBuffer(8), 1)).rejects.toThrow('truncated')
  })

  it('throws when the returned page count does not match what was requested', async () => {
    mockFinalMessage.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '--- Page 1 ---\nonly one page' }],
    })

    await expect(transcribeScannedPdf(new ArrayBuffer(8), 3)).rejects.toThrow(/expected 3/)
  })
})
