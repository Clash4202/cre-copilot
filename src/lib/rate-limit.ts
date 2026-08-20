import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// Every path that spends money on an AI vendor gets its own bucket, so a runaway in one cannot
// starve the others. Limits are per user, enforced in Postgres (see 0006_rate_limits.sql).
export type RateLimitAction = 'inbox_stage' | 'ingest' | 'ocr' | 'template_analyze' | 'chat'

export const RATE_LIMITS: Record<RateLimitAction, { limit: number; windowSeconds: number }> = {
  // Two small Claude calls per file. Generous so bulk-uploading a folder still works.
  inbox_stage: { limit: 30, windowSeconds: 3600 },
  // Voyage embeddings, up to MAX_CHUNKS_PER_DOCUMENT chunks per document.
  ingest: { limit: 20, windowSeconds: 3600 },
  // The expensive one: roughly 64k Claude tokens per scanned PDF.
  ocr: { limit: 10, windowSeconds: 3600 },
  // One large Claude call over a whole workbook structure summary.
  template_analyze: { limit: 10, windowSeconds: 3600 },
  chat: { limit: 20, windowSeconds: 300 },
}

const MESSAGES: Record<RateLimitAction, string> = {
  inbox_stage: 'Upload limit reached. Try again in about an hour.',
  ingest: 'Document processing limit reached. Try again in about an hour.',
  ocr: 'Scanned-document limit reached. Try again in about an hour.',
  template_analyze: 'Template analysis limit reached. Try again in about an hour.',
  chat: 'Too many requests. Try again in a few minutes.',
}

export function rateLimitMessage(action: RateLimitAction): string {
  return MESSAGES[action]
}

// Returns true if the caller may proceed. Fails closed: if the check itself cannot be completed,
// the answer is no, because allowing unlimited spend is the worse failure.
export async function checkRateLimit(
  supabase: SupabaseServerClient,
  action: RateLimitAction
): Promise<boolean> {
  const { limit, windowSeconds } = RATE_LIMITS[action]

  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_action: action,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })

  if (error) {
    console.error('Rate limit check failed for', action, error)
    return false
  }

  return data === true
}

// In-memory sliding-window limiter. Only one caller remains: the public demo-request form, which is
// keyed by IP rather than user and spends no AI money. It counts within a single running server
// process, so it resets on redeploy and does not coordinate across instances. Anything that spends
// money on a vendor must use checkRateLimit above instead.
const requestLog = new Map<string, number[]>()

export function checkInMemoryRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const windowStart = now - windowMs
  const timestamps = (requestLog.get(key) ?? []).filter((t) => t > windowStart)

  if (timestamps.length >= limit) {
    requestLog.set(key, timestamps)
    return false
  }

  timestamps.push(now)
  requestLog.set(key, timestamps)
  return true
}
