# AI-Spend Rate Limiting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a durable, per-user rate limit in front of every code path in the app that spends money on Claude or Voyage.

**Architecture:** Counting moves out of process memory and into Postgres. A `rate_limit_events` table with zero RLS policies is reachable only through a `security definer` function that derives the caller identity from `auth.uid()` itself, so a user can never spend or exhaust anyone else's allowance. A thin TypeScript wrapper calls that function by action name; five named buckets cover inbox staging, ingestion, OCR, template analysis, and chat.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS + RPC), TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-08-20-ai-spend-rate-limiting-design.md`

## Deviations from the spec

Both were decided while mapping the existing code. They are refinements, not scope changes, and the reviewer should check them deliberately:

1. **Client wrappers use `useTransition` plus a plain async client function passed to `<form action={...}>`, not `useActionState`.** `useActionState` invokes the action as `(prevState, formData)`, which would change the signatures of `stageInboxUpload`, `confirmInboxItem`, and `analyzeTemplate` and force edits to 17 existing call sites in `src/app/(app)/inbox/actions.test.ts` for no behavioral gain. The wrapper approach leaves every action signature and every existing test untouched. **Cost:** these three forms no longer submit with JavaScript disabled, which today they do. Accepted as irrelevant for this app.
2. **Limits live in one `RATE_LIMITS` record keyed by action**, so the wrapper is `checkRateLimit(supabase, action)` rather than the spec's four-argument form. A call site cannot pass a different limit for the same bucket, and every number is readable in one place.

## Global Constraints

- No `SUPABASE_SERVICE_ROLE_KEY` usage anywhere in this work. The limiter runs on the anon key plus the user session.
- The limiter fails closed: any error reaching the RPC returns `false` (refuse the spend), never `true`.
- No em dashes in code comments, commit messages, or UI copy. Use commas, periods, colons, or parentheses.
- Existing thrown errors in touched actions keep throwing exactly as they do today. Only rate-limit rejections become return values.
- The demo-request form in `src/app/actions.ts` stays on the in-memory limiter. It is out of scope beyond a mechanical import rename.
- All five bucket limits come from the spec verbatim: `inbox_stage` 30/3600s, `ingest` 20/3600s, `ocr` 10/3600s, `template_analyze` 10/3600s, `chat` 20/300s.

---

### Task 1: Migration and live schema

**Files:**
- Create: `supabase/migrations/0006_rate_limits.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: a Postgres function `check_rate_limit(p_action text, p_limit int, p_window_seconds int) returns boolean`, callable via `supabase.rpc('check_rate_limit', { p_action, p_limit, p_window_seconds })`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0006_rate_limits.sql`:

```sql
-- Durable rate limiting for paths that spend money on an AI vendor.
--
-- The table has RLS enabled and deliberately zero policies, so no client role can read, insert
-- into, or delete from it directly. The only way in is the security definer function below.

create table rate_limit_events (
  id bigserial primary key,
  bucket_key text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_events_key_time_idx on rate_limit_events (bucket_key, created_at desc);

alter table rate_limit_events enable row level security;

-- Takes an action name, never a full bucket key. The caller identity comes from auth.uid() inside
-- the function, so a signed-in user calling this RPC directly from outside the app can only ever
-- spend their own allowance. If the key were caller-supplied, anyone who knew another user's UUID
-- could exhaust that user's buckets and lock them out.
create function check_rate_limit(p_action text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_count int;
begin
  if auth.uid() is null then
    return false;
  end if;

  v_key := p_action || ':' || auth.uid()::text;

  delete from rate_limit_events
    where bucket_key = v_key
      and created_at < now() - make_interval(secs => p_window_seconds);

  select count(*) into v_count
    from rate_limit_events
    where bucket_key = v_key;

  if v_count >= p_limit then
    return false;
  end if;

  insert into rate_limit_events (bucket_key) values (v_key);
  return true;
end;
$$;
```

- [ ] **Step 2: Apply it to the live Supabase project**

Open the Supabase dashboard for this project, go to the SQL Editor, paste the entire contents of
`supabase/migrations/0006_rate_limits.sql`, and run it. Expected: "Success. No rows returned."

This project has no local Supabase CLI setup; every prior migration (`0001` through `0005`) was
applied by hand this same way.

- [ ] **Step 3: Verify the table is not directly reachable**

The app's `.env.local` holds `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. From
the repo root:

```bash
set -a && . ./.env.local && set +a
curl -s -o /dev/null -w "%{http_code}\n" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rate_limit_events?select=id&limit=1" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

Expected: `200` with an empty array `[]`, NOT rows. RLS with zero policies means an anon caller sees
nothing. If this returns actual rows, RLS did not take effect and the migration must be fixed before
continuing.

- [ ] **Step 4: Verify the function rejects an unauthenticated caller**

```bash
set -a && . ./.env.local && set +a
curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/check_rate_limit" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_action":"ocr","p_limit":10,"p_window_seconds":3600}'
```

Expected: `false`. There is no user session on this call, so `auth.uid()` is null and the function
refuses. This is the fail-closed behavior working.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_rate_limits.sql
git commit -m "Add rate_limit_events table and check_rate_limit function"
```

---

### Task 2: The TypeScript wrapper

**Files:**
- Modify: `src/lib/rate-limit.ts`
- Modify: `src/lib/rate-limit.test.ts`
- Modify: `src/app/actions.ts:6` (import rename only)

**Interfaces:**
- Consumes: the `check_rate_limit` RPC from Task 1.
- Produces:
  - `type RateLimitAction = 'inbox_stage' | 'ingest' | 'ocr' | 'template_analyze' | 'chat'`
  - `checkRateLimit(supabase, action: RateLimitAction): Promise<boolean>`
  - `rateLimitMessage(action: RateLimitAction): string`
  - `checkInMemoryRateLimit(key: string, limit: number, windowMs: number): boolean` (the renamed original)

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `src/lib/rate-limit.test.ts` with:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { checkRateLimit, checkInMemoryRateLimit, rateLimitMessage, RATE_LIMITS } from './rate-limit'

type RpcResult = { data: unknown; error: unknown }

// The wrapper's whole job is translating an action name into the right RPC call and translating the
// result back into a boolean, so a hand-rolled stub that records its arguments is exactly the right
// level of fidelity here. The counting itself is SQL and is verified live in Task 8.
function fakeSupabase(result: RpcResult) {
  const rpc = vi.fn(async () => result)
  return { client: { rpc } as unknown as Parameters<typeof checkRateLimit>[0], rpc }
}

describe('checkRateLimit', () => {
  it('calls the RPC with the action name and that action\'s configured limits', async () => {
    const { client, rpc } = fakeSupabase({ data: true, error: null })

    await checkRateLimit(client, 'ocr')

    expect(rpc).toHaveBeenCalledWith('check_rate_limit', {
      p_action: 'ocr',
      p_limit: 10,
      p_window_seconds: 3600,
    })
  })

  it('sends the chat bucket its own shorter window', async () => {
    const { client, rpc } = fakeSupabase({ data: true, error: null })

    await checkRateLimit(client, 'chat')

    expect(rpc).toHaveBeenCalledWith('check_rate_limit', {
      p_action: 'chat',
      p_limit: 20,
      p_window_seconds: 300,
    })
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

describe('RATE_LIMITS', () => {
  it('has an entry for every action, and every limit is a positive number', () => {
    for (const [action, config] of Object.entries(RATE_LIMITS)) {
      expect(config.limit, action).toBeGreaterThan(0)
      expect(config.windowSeconds, action).toBeGreaterThan(0)
    }
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/rate-limit.test.ts`
Expected: FAIL, with import errors for `checkInMemoryRateLimit`, `rateLimitMessage`, and `RATE_LIMITS`.

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `src/lib/rate-limit.ts` with:

```typescript
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
```

- [ ] **Step 4: Update the demo-form import**

In `src/app/actions.ts`, change line 6 from:

```typescript
import { checkRateLimit } from '@/lib/rate-limit'
```

to:

```typescript
import { checkInMemoryRateLimit } from '@/lib/rate-limit'
```

and at line 31 change `if (!checkRateLimit(` to `if (!checkInMemoryRateLimit(`. Nothing else in that
file changes.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/rate-limit.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If `supabase.rpc` complains about an unknown function name, the Supabase client
here is untyped (no generated database types in this project), so it should accept any string. If it
does error, do not add a cast at the call site; report it in the task notes.

- [ ] **Step 7: Commit**

```bash
git add src/lib/rate-limit.ts src/lib/rate-limit.test.ts src/app/actions.ts
git commit -m "Add durable Postgres-backed rate limit wrapper"
```

---

### Task 3: Guard template analysis

**Files:**
- Modify: `src/app/(app)/templates/actions.ts:57-97`
- Create: `src/app/(app)/libraries/analyze-template-form.tsx`
- Modify: `src/app/(app)/libraries/page.tsx:1-4, 179-183`

**Interfaces:**
- Consumes: `checkRateLimit`, `rateLimitMessage` from Task 2.
- Produces: `analyzeTemplate(templateId: string): Promise<{ error: string } | undefined>`. It returned `void` before; it now returns an object only on a rate-limit rejection, and `undefined` on success.

- [ ] **Step 1: Add the guard to the action**

In `src/app/(app)/templates/actions.ts`, add to the imports at the top:

```typescript
import { checkRateLimit, rateLimitMessage } from '@/lib/rate-limit'
```

Then change the signature and opening of `analyzeTemplate` from:

```typescript
export async function analyzeTemplate(templateId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: template, error: fetchError } = await supabase
```

to:

```typescript
export async function analyzeTemplate(templateId: string): Promise<{ error: string } | undefined> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  if (!(await checkRateLimit(supabase, 'template_analyze'))) {
    return { error: rateLimitMessage('template_analyze') }
  }

  const { data: template, error: fetchError } = await supabase
```

Leave the rest of the function body exactly as it is. It ends with `revalidatePath` calls and no
return, which TypeScript reads as `undefined`.

- [ ] **Step 2: Create the client form wrapper**

Create `src/app/(app)/libraries/analyze-template-form.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { analyzeTemplate } from '@/app/(app)/templates/actions'

// A client component purely so a rate-limit rejection can be shown in place. In production, Next
// omits everything except an error digest when an error is thrown inside a Server Action, so a
// thrown message would never reach the user. Hitting a limit is expected behavior, not a crash, so
// it comes back as a return value instead.
export function AnalyzeTemplateForm({ templateId }: { templateId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <form
      action={() => {
        startTransition(async () => {
          const result = await analyzeTemplate(templateId)
          setError(result?.error ?? null)
        })
      }}
      className="flex flex-col items-end gap-1"
    >
      <button
        type="submit"
        disabled={isPending}
        className="font-mono text-xs uppercase tracking-widest text-wine hover:text-brick disabled:opacity-50"
      >
        {isPending ? 'Analyzing...' : 'Analyze →'}
      </button>
      {error && <p className="text-xs text-brick">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 3: Use the wrapper on the libraries page**

In `src/app/(app)/libraries/page.tsx`, remove this import from the top of the file:

```typescript
import { analyzeTemplate } from '@/app/(app)/templates/actions'
```

and add:

```typescript
import { AnalyzeTemplateForm } from './analyze-template-form'
```

Then replace the form at lines 179-183:

```typescript
                              <form action={analyzeTemplate.bind(null, t.id)}>
                                <button type="submit" className="font-mono text-xs uppercase tracking-widest text-wine hover:text-brick">
                                  Analyze →
                                </button>
                              </form>
```

with:

```typescript
                              <AnalyzeTemplateForm templateId={t.id} />
```

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit && npx next lint`
Expected: no errors.

- [ ] **Step 5: Run the full suite for regressions**

Run: `npx vitest run`
Expected: all tests pass. No existing test calls `analyzeTemplate`, so this is a regression check
only.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/templates/actions.ts" "src/app/(app)/libraries/analyze-template-form.tsx" "src/app/(app)/libraries/page.tsx"
git commit -m "Rate limit template analysis, show rejection in place"
```

---

### Task 4: Guard inbox staging

**Files:**
- Modify: `src/app/(app)/inbox/actions.ts:50-56`
- Modify: `src/app/(app)/inbox/actions.test.ts` (add `rpc` to the fake client, add two tests)
- Create: `src/app/(app)/inbox/inbox-upload-form.tsx`
- Modify: `src/app/(app)/inbox/page.tsx:1-2, 41-55`

**Interfaces:**
- Consumes: `checkRateLimit`, `rateLimitMessage` from Task 2.
- Produces:
  - `stageInboxUpload(formData: FormData): Promise<{ error: string } | undefined>`
  - A `rpc` method on the test file's `FakeSupabase`, which Task 5 also relies on.

- [ ] **Step 1: Teach the test fake about the RPC**

In `src/app/(app)/inbox/actions.test.ts`, inside `class FakeSupabase`, add these members next to the
existing `auth` and `storage` members:

```typescript
  // Rate limiting is a Postgres function in production. Tests default to allowing every call so
  // existing behavior tests are unaffected; set rateLimitAllows = false to exercise a rejection.
  rateLimitAllows = true

  rpc = async (fn: string, args: Record<string, unknown>) => {
    if (fn === 'check_rate_limit') {
      this.rpcCalls.push(args)
      return { data: this.rateLimitAllows, error: null }
    }
    throw new Error(`Unexpected rpc call: ${fn}`)
  }

  rpcCalls: Record<string, unknown>[] = []
```

- [ ] **Step 2: Write the failing tests**

In the same file, add this block inside the existing `describe('stageInboxUpload — file type
allowlist', ...)`. The PDF fixture below is copied from that block's existing passing "accepts a PDF
and stages it" test, so it is known to reach the end of the action cleanly:

```typescript
  it('refuses to stage an upload once the inbox limit is reached', async () => {
    fake.rateLimitAllows = false
    const formData = new FormData()
    formData.set('file', new File(['%PDF-1.7'], 'offering-memo.pdf', { type: 'application/pdf' }))

    const result = await stageInboxUpload(formData)

    expect(result?.error).toMatch(/limit reached/i)
    // Nothing reached storage and no item was created, so the user can retry cleanly later.
    expect(fake.objects.size).toBe(0)
    expect(fake.rows('inbox_items')).toHaveLength(0)
  })

  it('checks the inbox_stage bucket before doing any work', async () => {
    const formData = new FormData()
    formData.set('file', new File(['%PDF-1.7'], 'offering-memo.pdf', { type: 'application/pdf' }))

    await stageInboxUpload(formData)

    expect(fake.rpcCalls[0]).toMatchObject({ p_action: 'inbox_stage' })
  })
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/app/\(app\)/inbox/actions.test.ts`
Expected: FAIL. The first test fails because `result` is undefined and a file does reach storage;
the second fails because `rpcCalls` is empty.

- [ ] **Step 4: Add the guard**

In `src/app/(app)/inbox/actions.ts`, add to the imports:

```typescript
import { checkRateLimit, rateLimitMessage } from '@/lib/rate-limit'
```

Then change the opening of `stageInboxUpload` from:

```typescript
export async function stageInboxUpload(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const file = formData.get('file')
```

to:

```typescript
export async function stageInboxUpload(formData: FormData): Promise<{ error: string } | undefined> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Checked before the file reaches storage, so a rejection leaves nothing behind to clean up.
  if (!(await checkRateLimit(supabase, 'inbox_stage'))) {
    return { error: rateLimitMessage('inbox_stage') }
  }

  const file = formData.get('file')
```

The rest of the function is unchanged. Its existing `throw` statements for a missing file, an
oversized file, and a disallowed extension all stay as throws.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/app/\(app\)/inbox/actions.test.ts`
Expected: PASS, including all pre-existing tests in the file.

- [ ] **Step 6: Create the client upload form**

Create `src/app/(app)/inbox/inbox-upload-form.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { stageInboxUpload } from './actions'

// Client component so a rate-limit rejection renders in place. See analyze-template-form.tsx for
// why rate-limit rejections are return values rather than thrown errors.
export function InboxUploadForm() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-2">
      <form
        action={(formData: FormData) => {
          startTransition(async () => {
            const result = await stageInboxUpload(formData)
            setError(result?.error ?? null)
          })
        }}
        className="flex items-center gap-2 rounded-md border border-dashed border-hairline px-6 py-8"
      >
        <input
          type="file"
          name="file"
          accept=".xlsx,.pptx,.pdf,.txt"
          required
          className="flex-1 text-sm text-slate file:mr-3 file:rounded-md file:border file:border-hairline file:bg-paper file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:border-forest"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-forest disabled:opacity-50"
        >
          {isPending ? 'Uploading...' : 'Upload'}
        </button>
      </form>
      {error && <p className="text-sm text-brick">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 7: Use it on the inbox page**

In `src/app/(app)/inbox/page.tsx`, change the import on line 2 from:

```typescript
import { stageInboxUpload, confirmInboxItem } from './actions'
```

to:

```typescript
import { confirmInboxItem } from './actions'
import { InboxUploadForm } from './inbox-upload-form'
```

Then replace the whole `<form action={stageInboxUpload} ...>` block at lines 41-55 with:

```typescript
      <InboxUploadForm />
```

- [ ] **Step 8: Type-check, lint, and run the full suite**

Run: `npx tsc --noEmit && npx next lint && npx vitest run`
Expected: no type errors, no lint errors, all tests pass.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(app)/inbox/actions.ts" "src/app/(app)/inbox/actions.test.ts" "src/app/(app)/inbox/inbox-upload-form.tsx" "src/app/(app)/inbox/page.tsx"
git commit -m "Rate limit inbox staging, show rejection in place"
```

---

### Task 5: Guard inbox confirm

**Files:**
- Modify: `src/app/(app)/inbox/actions.ts:197-211`
- Modify: `src/app/(app)/inbox/actions.test.ts` (add one test)
- Create: `src/app/(app)/inbox/inbox-confirm-form.tsx`
- Modify: `src/app/(app)/inbox/page.tsx:70-142`

**Interfaces:**
- Consumes: `checkRateLimit` and `rateLimitMessage` from Task 2; the `rpc` fake from Task 4.
- Produces: `confirmInboxItem(itemId: string, formData: FormData): Promise<{ error: string } | undefined>`. The two-argument shape is unchanged, so all 11 existing test call sites keep working.

- [ ] **Step 1: Write the failing test**

In `src/app/(app)/inbox/actions.test.ts`, add to the `describe` block covering `confirmInboxItem`:

```typescript
  it('refuses to confirm an item once the ingestion limit is reached', async () => {
    seedPendingTemplate()
    fake.rateLimitAllows = false

    const result = await confirmInboxItem('item-1', templateFormData())

    expect(result?.error).toMatch(/limit reached/i)
    // The item is still pending and nothing was filed, so the user can confirm it later.
    expect(fake.rows('libraries')).toHaveLength(0)
    const item = fake.rows('inbox_items').find((i) => i.id === 'item-1')
    expect(item?.status).toBe('pending_review')
  })
```

`seedPendingTemplate()` and `templateFormData()` are the existing helpers that block already uses,
and they seed the item as `item-1`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/\(app\)/inbox/actions.test.ts`
Expected: FAIL. `result` is undefined because the action does not check any limit yet.

- [ ] **Step 3: Add the guard**

In `src/app/(app)/inbox/actions.ts`, change the opening of `confirmInboxItem` from:

```typescript
export async function confirmInboxItem(itemId: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: item } = await supabase
```

to:

```typescript
export async function confirmInboxItem(
  itemId: string,
  formData: FormData
): Promise<{ error: string } | undefined> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Confirming files the document and immediately ingests it (embeddings, and OCR if the PDF is
  // scanned). Checked before any rows are created so a rejection leaves the item pending rather
  // than half-filed.
  if (!(await checkRateLimit(supabase, 'ingest'))) {
    return { error: rateLimitMessage('ingest') }
  }

  const { data: item } = await supabase
```

The rest of the function is unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/\(app\)/inbox/actions.test.ts`
Expected: PASS, including all 11 pre-existing `confirmInboxItem` tests.

- [ ] **Step 5: Create the client confirm form**

Create `src/app/(app)/inbox/inbox-confirm-form.tsx`. It takes the form fields as children so the
page keeps owning all the per-item field markup and this component owns only submission and error
display:

```typescript
'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { confirmInboxItem } from './actions'

// Client component so a rate-limit rejection renders in place. The fields themselves stay in the
// page as children, since they are per-item server-rendered markup with no client behavior.
export function InboxConfirmForm({ itemId, children }: { itemId: string; children: ReactNode }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <form
      action={(formData: FormData) => {
        startTransition(async () => {
          const result = await confirmInboxItem(itemId, formData)
          setError(result?.error ?? null)
        })
      }}
      className="flex flex-col gap-2"
    >
      {children}
      <button
        type="submit"
        disabled={isPending}
        className="mt-1 self-start rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-forest disabled:opacity-50"
      >
        {isPending ? 'Confirming...' : 'Confirm'}
      </button>
      {error && <p className="text-sm text-brick">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 6: Use it on the inbox page**

In `src/app/(app)/inbox/page.tsx`, add the import:

```typescript
import { InboxConfirmForm } from './inbox-confirm-form'
```

Then change the opening tag at line 70 from:

```typescript
              <form action={confirmInboxItem.bind(null, item.id)} className="flex flex-col gap-2">
```

to:

```typescript
              <InboxConfirmForm itemId={item.id}>
```

Delete the existing submit button block at lines 136-141 (the `<button type="submit">Confirm</button>`
and its wrapper), since the client component now renders it. Change the closing `</form>` at line
142 to `</InboxConfirmForm>`. Every field between them stays exactly as it is.

The `confirmInboxItem` import at the top of the page is now unused. Remove it, leaving only the
`InboxUploadForm` and `InboxConfirmForm` imports plus `createClient`.

- [ ] **Step 7: Type-check, lint, and run the full suite**

Run: `npx tsc --noEmit && npx next lint && npx vitest run`
Expected: no type errors, no lint errors, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/inbox/actions.ts" "src/app/(app)/inbox/actions.test.ts" "src/app/(app)/inbox/inbox-confirm-form.tsx" "src/app/(app)/inbox/page.tsx"
git commit -m "Rate limit inbox confirm, show rejection in place"
```

---

### Task 6: Guard Vault upload and OCR

**Files:**
- Modify: `src/app/(app)/projects/[projectId]/vault/actions.ts:23-50, 106-112`

**Interfaces:**
- Consumes: `checkRateLimit`, `rateLimitMessage` from Task 2.
- Produces: no signature changes. `uploadDocument` keeps throwing, because no form renders it any more; `ingestGeneralDocument` keeps its existing `(supabase, documentId, storagePath, fileName)` signature.

- [ ] **Step 1: Add the OCR guard inside ingestion**

In `src/app/(app)/projects/[projectId]/vault/actions.ts`, add to the imports:

```typescript
import { checkRateLimit, rateLimitMessage } from '@/lib/rate-limit'
```

Then in `ingestGeneralDocument`, inside the `if (ocrPageCount > 0)` branch, change:

```typescript
      if (ocrPageCount > 0) {
        const limitError = exceedsOcrLimits(blob.size, pages.length)
        if (limitError) {
          throw new Error(limitError)
        }
        const ocrPages = await transcribeScannedPdf(arrayBuffer, pages.length)
```

to:

```typescript
      if (ocrPageCount > 0) {
        const limitError = exceedsOcrLimits(blob.size, pages.length)
        if (limitError) {
          throw new Error(limitError)
        }
        // Whether a PDF needs OCR is only knowable after parsing it, so this check necessarily runs
        // mid-ingestion. A rejection here lands the document in `failed` through the catch below and
        // the user re-uploads to retry. A proper resume path would need a `pending_ocr` state and is
        // deliberately out of scope (see the design spec, "Known rough edge").
        if (!(await checkRateLimit(supabase, 'ocr'))) {
          throw new Error(rateLimitMessage('ocr'))
        }
        const ocrPages = await transcribeScannedPdf(arrayBuffer, pages.length)
```

- [ ] **Step 2: Add the ingestion guard to the Vault upload action**

In the same file, change the opening of `uploadDocument` from:

```typescript
export async function uploadDocument(projectId: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const file = formData.get('file')
```

to:

```typescript
export async function uploadDocument(projectId: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // No UI renders this action any more (uploads go through the Inbox), but it is still a live
  // server-action endpoint, so it gets the same ingestion budget as the Inbox path. It throws
  // rather than returning a message because there is no form here to display one.
  if (!(await checkRateLimit(supabase, 'ingest'))) {
    throw new Error(rateLimitMessage('ingest'))
  }

  const file = formData.get('file')
```

- [ ] **Step 3: Type-check and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors, all tests pass. `src/app/(app)/inbox/actions.test.ts` mocks
`ingestGeneralDocument` entirely, so the new OCR check is not exercised there.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/projects/[projectId]/vault/actions.ts"
git commit -m "Rate limit OCR transcription and Vault document ingestion"
```

---

### Task 7: Move chat onto the durable limiter

**Files:**
- Modify: `src/app/api/chat/route.ts:1-10, 28-30`

**Interfaces:**
- Consumes: `checkRateLimit` from Task 2.
- Produces: no signature changes. The route still returns HTTP 429 with the same JSON shape.

- [ ] **Step 1: Swap the limiter**

In `src/app/api/chat/route.ts`, change the import on line 5 from:

```typescript
import { checkRateLimit } from '@/lib/rate-limit'
```

to:

```typescript
import { checkRateLimit, rateLimitMessage } from '@/lib/rate-limit'
```

Delete these two now-unused constants at lines 9-10:

```typescript
const RATE_LIMIT_MAX_REQUESTS = 20
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
```

They move into `RATE_LIMITS.chat` in `src/lib/rate-limit.ts`, which already holds the same values
(20 requests, 300 seconds).

Then change the guard at lines 28-30 from:

```typescript
  if (!checkRateLimit(user.id, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json({ error: 'Too many requests. Try again in a few minutes.' }, { status: 429 })
  }
```

to:

```typescript
  if (!(await checkRateLimit(supabase, 'chat'))) {
    return NextResponse.json({ error: rateLimitMessage('chat') }, { status: 429 })
  }
```

The user id is no longer passed in, because the Postgres function derives it from the session
itself.

- [ ] **Step 2: Type-check, lint, and run the full suite**

Run: `npx tsc --noEmit && npx next lint && npx vitest run`
Expected: no type errors, no lint errors, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "Move chat rate limiting onto the durable limiter"
```

---

### Task 8: Full verification against the live database

**Files:** none (verification only)

**Interfaces:**
- Consumes: everything from Tasks 1 through 7.
- Produces: evidence that the limiter actually limits.

- [ ] **Step 1: Full automated check**

Run: `npx tsc --noEmit && npx next lint && npx vitest run`
Expected: no type errors, no lint errors, every test passes.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds. This matters more than usual here, because three server components became
client components and a build is what catches an accidental server-only import crossing into client
code.

- [ ] **Step 3: Start the dev server**

Run `npm run dev` in the background from the repo root and wait for it to report a port.

Do NOT use the Browser pane's `preview_start` if this work is happening inside a git worktree: it
resolves the project root independently of the active worktree and will silently serve the main
checkout instead, which looks exactly like stale routes.

- [ ] **Step 4: Verify the happy path still works**

Sign in, go to `/inbox`, upload a small `.txt` or `.pdf` file, and confirm it into a project.
Expected: it files exactly as it did before this work, reaching `status: 'ready'`. The limiter is
invisible when you are under the limit.

- [ ] **Step 5: Verify a limit actually trips**

Temporarily lower one bucket to make this cheap to test. In `src/lib/rate-limit.ts` change
`inbox_stage` to `{ limit: 2, windowSeconds: 3600 }`, save, and let the dev server hot-reload.

Upload three files through `/inbox`. Expected: the first two stage normally; the third shows
"Upload limit reached. Try again in about an hour." rendered inline under the upload form, with no
crash screen and no new row in `inbox_items`.

Then confirm the count is really in Postgres rather than in memory: restart the dev server entirely
and upload once more. Expected: still rejected, because the rows survived the restart. This is the
single most important check in this task, since it is what the in-memory limiter could never do.

Restore `inbox_stage` to `{ limit: 30, windowSeconds: 3600 }` when done.

- [ ] **Step 6: Verify one user cannot exhaust another user's bucket**

With the dev server running and signed in, open the browser devtools console on any app page and
run:

```javascript
await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'test' }) }).then(r => r.status)
```

Expected: `200` (or `429` if you already exhausted chat). This confirms the RPC path works with a
real session.

Then confirm the function ignores caller-supplied identity: in the Supabase SQL Editor, run

```sql
select bucket_key from rate_limit_events order by created_at desc limit 10;
```

Expected: every `bucket_key` ends with your own user UUID and no other. The action name is the only
part the app supplies.

- [ ] **Step 7: Confirm the leftover rows clean themselves up**

In the Supabase SQL Editor:

```sql
select bucket_key, count(*) from rate_limit_events group by bucket_key order by count desc;
```

Expected: counts at or below each bucket's configured limit, never growing without bound, because
each call deletes its own key's expired rows first.

- [ ] **Step 8: Commit any fixes found during the walkthrough**

If the walkthrough surfaces bugs, fix them, re-verify, and commit with a message describing what was
found. Do not leave the branch in a state where the walkthrough failed.

---

## Self-review notes

Spec coverage check, section by section:

- Postgres table and `security definer` function, identity from `auth.uid()`: Task 1.
- Fail-closed wrapper and the action-name union type: Task 2.
- All five bucket limits with the spec's exact numbers: Task 2 (`RATE_LIMITS`), verified in tests.
- In-memory limiter renamed, demo form left alone: Task 2 Steps 3 and 4.
- Guard placement at all six call sites: Tasks 3 (`analyzeTemplate`), 4 (`stageInboxUpload`), 5 (`confirmInboxItem`), 6 (`uploadDocument` and `ingestGeneralDocument`), 7 (chat route).
- Rate-limit rejections as return values on the three user-facing paths: Tasks 3, 4, 5.
- Known rough edge documented in code where it lives: Task 6 Step 1 comment.
- Testing split (mocked-client unit tests, existing suite green, live verification): Tasks 2 and 8.
