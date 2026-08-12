import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendDemoRequestEmail } from './resend'

describe('sendDemoRequestEmail', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.DEMO_REQUEST_NOTIFY_EMAIL = 'clayton@example.com'
  })

  it('sends the demo request details to the Resend API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = fetchMock as unknown as typeof fetch

    await sendDemoRequestEmail({
      name: 'Jamie Broker',
      email: 'jamie@example.com',
      firm: 'Example Realty',
      note: 'Interested in a demo',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      })
    )
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.to).toBe('clayton@example.com')
    expect(body.text).toContain('Jamie Broker')
    expect(body.text).toContain('jamie@example.com')
  })

  it('throws with the response body on failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid key',
    }) as unknown as typeof fetch

    await expect(
      sendDemoRequestEmail({ name: 'A', email: 'a@example.com', firm: 'B', note: 'C' })
    ).rejects.toThrow('401')
  })
})
