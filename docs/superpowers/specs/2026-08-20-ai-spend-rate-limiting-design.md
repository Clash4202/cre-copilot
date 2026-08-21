# Design: durable rate limiting on AI-spend paths

Date: 2026-08-20
Status: approved, ready for implementation planning

## Problem

`src/lib/rate-limit.ts` is an in-memory sliding-window limiter that today guards exactly two
callers: the chat API route and the public demo-request form. Every other path that spends money on
an AI vendor is unguarded. This gap has been flagged three separate times (the first real
end-to-end test on 2026-08-11, the OCR security audit on 2026-08-12, and again during the
2026-08-20 review) without being closed, and it has grown since it was first noted: the Excel
automation and library/inbox subsystems each added new unmetered Claude call sites.

The four unguarded entry points and what each one spends:

| Entry point | Spend per call |
|---|---|
| `stageInboxUpload` | 2 Claude calls (property-name extraction, section match) |
| `confirmInboxItem` -> `ingestGeneralDocument` | Claude vision OCR (up to ~64k tokens) + Voyage embeddings |
| `uploadDocument` (Vault) | Same as above. The form was removed from the UI but the server action is still a live endpoint |
| `analyzeTemplate` | 1 large Claude call over a whole workbook structure summary |

`runModelGeneration` is deliberately **not** on this list. It reaches no AI vendor at all; it is
deterministic Excel math via `exceljs`, so it costs nothing per run.

There is a second problem underneath the first. The existing limiter counts inside a single running
server process, so it resets on redeploy and does not coordinate across instances. On Vercel, where
each serverless invocation can be a fresh process, the counter effectively restarts constantly. The
whole point of this work is to hold up once the app is reachable by people other than Clayton, which
is exactly the condition under which the current design stops working.

## Non-goals

- **The demo-request form stays on the in-memory limiter.** It is keyed by IP rather than user, and
  it spends no AI money (it sends email through Resend, which is still unconfigured). Moving it to a
  durable store would mean accepting a caller-supplied IP key, which reintroduces the forgeable-key
  weakness this design exists to avoid.
- **No per-user spend budget or cost accounting.** Considered and declined: this design caps request
  rates, not dollars.
- **No app-wide error-handling rewrite.** Only the rate-limit path moves to return values. The
  roughly 40 other `throw new Error(...)` calls in the codebase are left alone.
- **No `service_role` key usage.** That key stays inert until the admin feature is built.

## Design

### 1. Counting lives in Postgres

New migration `supabase/migrations/0006_rate_limits.sql`:

```sql
create table rate_limit_events (
  id bigserial primary key,
  bucket_key text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_events_key_time_idx on rate_limit_events (bucket_key, created_at desc);

alter table rate_limit_events enable row level security;
-- Deliberately zero policies. Nothing reaches this table except the security-definer
-- function below, so a user cannot read, insert into, or delete from it directly.
```

The function takes **only an action name**, and derives everything else itself:

```sql
create function check_rate_limit(p_action text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
-- Full body in supabase/migrations/0007_rate_limits_hardening.sql. In outline:
--   1. return false if auth.uid() is null
--   2. v_key := p_action || ':' || auth.uid()   (uid MUST stay the suffix)
--   3. pg_advisory_xact_lock(hashtext(v_key))
--   4. case p_action -> v_limit, v_window_seconds; else return false
--   5. delete this key's rows older than v_window_seconds  (housekeeping only)
--   6. count this key's rows newer than v_window_seconds   (own time predicate)
--   7. return false if v_count >= v_limit, else insert a row and return true
$$;
```

> **Revision, 2026-08-20.** This section originally specified
> `check_rate_limit(p_action, p_limit, p_window_seconds)`, where the caller supplied the limit and
> the window. The final whole-branch review found that exploitable and it was replaced before merge.
> The original reasoning correctly established that a caller-supplied `p_limit` was harmless, then
> wrongly generalized that to `p_window_seconds`. The two are not alike: `p_limit` only fed a
> comparison, but `p_window_seconds` fed a `DELETE`, and the original `COUNT` had no time predicate
> of its own, which made pruning the enforcement mechanism. Any signed-in user could call the RPC
> directly with `p_window_seconds: 0`, empty their own bucket, and proceed, making all five limits
> unenforceable. **The lesson worth carrying forward: "the caller cannot forge the key" is not the
> same as "caller input is safe," and any argument that reaches a statement which mutates state
> needs its own separate analysis.**

**Why the identity is derived inside the function rather than passed in.** The server-side Supabase
client runs as the `authenticated` role using the user's own session, so any signed-in user can call
this RPC directly from outside the app with arbitrary arguments. If the function accepted a
caller-supplied key, a user who knew another user's UUID could call it repeatedly with
`ocr:<their-uuid>` and exhaust that person's allowance, locking them out. Deriving the key from
`auth.uid()` makes that structurally impossible: a caller can only ever spend their own budget. The
ordering is load-bearing, and `auth.uid()` must stay the suffix: reversed, a crafted action string
could land in someone else's bucket.

`p_action` is validated against the five known names, so a direct caller cannot invent a novel key
whose rows nothing ever prunes.

`set search_path = public, pg_temp` is the hardening for a `security definer` function. Naming
`pg_temp` explicitly matters, because Postgres searches it first when it is not listed, which would
otherwise let a temp table shadow the real one under the definer's privileges.

**Concurrency.** A `pg_advisory_xact_lock` on the bucket key serializes the count and the insert.
Without it, under READ COMMITTED a burst of concurrent requests each counts zero and all pass,
overshooting the limit by however many were in flight. On the `ocr` bucket each excess call is
roughly 64k Claude tokens.

**Row growth.** Each call deletes its own key's expired rows, so the table stays bounded at roughly
(limit x active keys). Correctness does not depend on that delete: the count carries its own time
predicate. Rows belonging to a user who stops using the app linger until that user returns. A
periodic sweep is a possible later addition and is not needed at this scale.

### 2. Buckets and limits

| Action name | Limit | Window | Reasoning |
|---|---|---|---|
| `inbox_stage` | 30 | 1 hour | Two small Claude calls per file. Bulk-uploading a folder of documents must still work |
| `ingest` | 20 | 1 hour | Voyage embeddings, up to `MAX_CHUNKS_PER_DOCUMENT` chunks per document |
| `ocr` | 10 | 1 hour | The expensive path, roughly 64k Claude tokens per scanned PDF |
| `template_analyze` | 10 | 1 hour | One large Claude call, rarely needed more than a few times per template |
| `chat` | 20 | 5 minutes | Existing value, unchanged. Moves off the in-memory store onto this one |

A clean PDF spends `ingest` only. A scanned PDF spends both `ingest` and `ocr`, which correctly
charges the path that costs real money twice.

### 3. Application changes

`src/lib/rate-limit.ts` gains a durable checker alongside the existing in-memory one:

```typescript
export async function checkRateLimit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  action: RateLimitAction
): Promise<boolean>
```

It calls the RPC with only `{ p_action: action }` and returns its boolean. A failed RPC call
(network error, missing function) returns `false`, so a broken limiter refuses spend rather than
allowing unlimited spend. The action names live in one exported union type so a typo cannot silently
create a brand-new empty bucket.

The limit and window numbers deliberately do **not** appear in TypeScript. They live only in
`supabase/migrations/0007_rate_limits_hardening.sql`, which is the single source of truth. Keeping a
second copy here would let the two drift, and passing them from the caller is what created the
vulnerability described in section 1.

The existing in-memory `checkRateLimit` is renamed to `checkInMemoryRateLimit` so the two are never
confused at a call site, and its only remaining caller is the demo-request form in
`src/app/actions.ts`.

Guard placement:

- `stageInboxUpload`: at the top, after the auth check, before the file reaches storage.
- `confirmInboxItem` and `uploadDocument`: before any database rows are created, so a rejection
  leaves nothing half-built.
- `ingestGeneralDocument`: immediately before `transcribeScannedPdf`, inside the existing
  `ocrPageCount > 0` branch.
- `analyzeTemplate`: at the top, after the auth check.
- `src/app/api/chat/route.ts`: replaces the in-memory call, still returning HTTP 429.

### 4. What the user sees when a limit is hit

A rate-limit hit is a normal expected condition, not a crash. In production, Next.js Flight
serialization omits everything except an error digest, so a message thrown inside a Server Action
never reaches the user. The Next.js guidance is to model expected errors as return values consumed
by `useActionState`.

The three user-facing actions therefore return a message instead of throwing, along these lines:

```typescript
return { error: 'Upload limit reached. Try again in about an hour.' }
```

Every `(app)` page is currently a server component rendering a plain `<form action={serverAction}>`,
so this needs three small client-component form wrappers (inbox upload, inbox confirm, template
analyze) that call `useActionState` and render the returned message inline. Their only new
responsibility is displaying that message; all existing thrown errors in those same actions keep
throwing exactly as they do today.

### 5. Known rough edge

The OCR check runs mid-ingestion, because whether a PDF needs OCR is not knowable until the PDF has
been parsed. If that check trips, the document lands in `failed` status through the existing catch
block, and the user re-uploads to retry. Handling it properly would need a `pending_ocr` document
state and a resume path, which is a larger feature than this one. Documented here so it is a known
tradeoff rather than a surprise.

## Testing

The counting logic is SQL, so it cannot be unit tested in vitest. Coverage splits accordingly:

- **Unit tests (vitest)** against a mocked Supabase client: the wrapper passes the correct action
  name, limit, and window through to the RPC; a `true` result allows the action to proceed; a
  `false` result produces the error return without any AI call being made; an RPC failure is treated
  as `false`.
- **Existing suite** must stay green. `src/app/(app)/inbox/actions.test.ts` already covers actions
  whose signatures change here.
- **Live verification** against the real Supabase project: confirm the migration applies, confirm a
  bucket refuses the (limit + 1)th call within the window, confirm it allows a call again after the
  window rolls over, and confirm that calling the RPC directly cannot affect another user's bucket.

## Files touched

- `supabase/migrations/0006_rate_limits.sql` (new)
- `src/lib/rate-limit.ts`, `src/lib/rate-limit.test.ts`
- `src/app/(app)/inbox/actions.ts`, `src/app/(app)/inbox/page.tsx`, plus two new client form components
- `src/app/(app)/projects/[projectId]/vault/actions.ts`
- `src/app/(app)/templates/actions.ts`, `src/app/(app)/templates/page.tsx`, plus one new client form component
- `src/app/api/chat/route.ts`
- `src/app/actions.ts` (import updated for the `checkInMemoryRateLimit` rename, no behavior change)
