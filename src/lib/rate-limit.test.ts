import { describe, it, expect, vi } from 'vitest'
import { checkRateLimit, checkInMemoryRateLimit, rateLimitMessage } from './rate-limit'

type RpcResult = { data: unknown; error: unknown }

// The wrapper's whole job is translating an action name into the right RPC call and translating the
// result back into a boolean, so a hand-rolled stub that records its arguments is exactly the right
// level of fidelity here. The counting itself, and the limit/window for each action, is SQL and is
// verified live in Task 8 (see supabase/migrations/0007_rate_limits_hardening.sql).
function fakeSupabase(result: RpcResult) {
  const rpc = vi.fn(async () => result)
  return { client: { rpc } as unknown as Parameters<typeof checkRateLimit>[0], rpc }
}

describe('checkRateLimit', () => {
  it('calls the RPC with only the action name, nothing that could affect enforcement', async () => {
    const { client, rpc } = fakeSupabase({ data: true, error: null })

    await checkRateLimit(client, 'ocr')

    expect(rpc).toHaveBeenCalledWith('check_rate_limit', { p_action: 'ocr' })
  })

  it('passes each action name through unchanged', async () => {
    const { client, rpc } = fakeSupabase({ data: true, error: null })

    await checkRateLimit(client, 'chat')

    expect(rpc).toHaveBeenCalledWith('check_rate_limit', { p_action: 'chat' })
  })

  it('allows the action when the function returns true', async () => {
    const { client } = fakeSupabase({ data: true, error: null })
    expect(await checkRateLimit(client, 'ingest')).toBe(true)
  })

  it('refuses the action when the function returns false', async () => {
    const { client } = fakeSupabase({ data: false, error: null })
    expect(await checkRateLimit(client, 'ingest')).toBe(false)
  })

  it('fails closed when the RPC errors', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'network down' } })
    expect(await checkRateLimit(client, 'inbox_stage')).toBe(false)
  })

  it('fails closed when the RPC returns something that is not a boolean', async () => {
    const { client } = fakeSupabase({ data: null, error: null })
    expect(await checkRateLimit(client, 'template_analyze')).toBe(false)
  })
})

describe('rateLimitMessage', () => {
  it('names the window in plain language rather than seconds', () => {
    expect(rateLimitMessage('ocr')).toMatch(/hour/)
    expect(rateLimitMessage('chat')).toMatch(/minutes/)
  })
})

describe('checkInMemoryRateLimit', () => {
  it('allows requests up to the limit', () => {
    const key = `test-${Math.random()}`
    expect(checkInMemoryRateLimit(key, 3, 1000)).toBe(true)
    expect(checkInMemoryRateLimit(key, 3, 1000)).toBe(true)
    expect(checkInMemoryRateLimit(key, 3, 1000)).toBe(true)
  })

  it('blocks requests past the limit within the window', () => {
    const key = `test-${Math.random()}`
    checkInMemoryRateLimit(key, 2, 1000)
    checkInMemoryRateLimit(key, 2, 1000)
    expect(checkInMemoryRateLimit(key, 2, 1000)).toBe(false)
  })

  it('tracks separate keys independently', () => {
    const keyA = `test-${Math.random()}`
    const keyB = `test-${Math.random()}`
    checkInMemoryRateLimit(keyA, 1, 1000)
    expect(checkInMemoryRateLimit(keyB, 1, 1000)).toBe(true)
  })
})
