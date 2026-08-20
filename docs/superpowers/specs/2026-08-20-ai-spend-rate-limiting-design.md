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

The function takes an **action name, not a full bucket key**, and derives the identity itself:

```sql
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

**Why the identity is derived inside the function rather than passed in.** The server-side Supabase
client runs as the `authenticated` role using the user's own session, so any signed-in user can call
this RPC directly from outside the app with arbitrary arguments. If the function accepted a
caller-supplied key, a user who knew another user's UUID could call it repeatedly with
`ocr:<their-uuid>` and exhaust that person's allowance, locking them out. Deriving the key from
`auth.uid()` makes that structurally impossible: a caller can only ever spend their own budget.
Passing a large `p_limit` in a direct call is harmless for the same reason, since it cannot change
what the app checks on the next real request.

`set search_path = public` is the standard hardening for a `security definer` function, preventing a
shadowed table name from running under the definer's privileges.

**Row growth.** Each call deletes its own key's expired rows before counting, so the table stays
bounded at roughly (limit x active keys) rather than growing without limit. Rows belonging to a user
who stops using the app linger until that user returns. A periodic sweep is a possible later
addition and is not needed at this scale.

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
  action: RateLimitAction,
  limit: number,
  windowSeconds: number
): Promise<boolean>
```

It calls the RPC and returns its boolean. A failed RPC call (network error, missing function)
returns `false`, so a broken limiter refuses spend rather than allowing unlimited spend. The action
names live in one exported union type so a typo cannot silently create a brand-new empty bucket.

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
