// In-memory sliding-window rate limiter.
//
// Stopgap for v1: this only limits requests within a single running server
// process, so it resets on redeploy and doesn't coordinate across multiple
// instances. Fine for a handful of trusted users; replace with a durable
// store (e.g. Upstash Redis, Vercel KV) before opening this up more broadly.

const requestLog = new Map<string, number[]>()

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
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
