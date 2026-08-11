# cre-copilot v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build v1 of cre-copilot — real login, a document Vault where a user uploads CRE documents (PDF/text), an ingestion pipeline that makes them searchable, and an "Ask the Brain" chat that answers questions grounded in and citing those documents via Claude.

**Architecture:** Next.js App Router (frontend + backend in one app) deployed to Vercel. Supabase provides Postgres, auth, file storage, and `pgvector` for embeddings. Voyage AI generates embeddings; Anthropic's Claude API answers questions from retrieved document chunks.

**Tech Stack:** Next.js 15 (TypeScript, App Router, Tailwind), `@supabase/supabase-js` + `@supabase/ssr`, `@anthropic-ai/sdk`, `unpdf` (PDF text extraction), Voyage AI REST API (embeddings), Vitest (unit tests).

## Global Constraints

- API keys (`ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are server-side only — never referenced in a Client Component or exposed to the browser.
- Every table holding user data has Row Level Security enabled, scoped to `auth.uid()`.
- Claude model: `claude-sonnet-5` (chosen over `claude-opus-5` for cost — this runs on every chat message in a continuously-running app, not a one-off task).
- Voyage embedding model: `voyage-3.5`, fixed at `output_dimension: 1024` so the database schema doesn't depend on the provider's default.
- No feature beyond what's specified here (deck generation, buyer intelligence, Excel sync, multi-firm billing) — those are explicitly deferred per the design spec.

---

### Task 1: Install dependencies and test runner

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `npm run test` script, `@/*` path alias usable in both app code and tests.

- [ ] **Step 1: Install runtime dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr @anthropic-ai/sdk unpdf
```

- [ ] **Step 2: Install test dependencies**

```bash
npm install -D vitest
```

- [ ] **Step 3: Add the test script**

Edit `package.json`, add to `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 4: Create the Vitest config**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 5: Verify**

Run: `npm run test`
Expected: `No test files found` (no `*.test.ts` files exist yet) — this confirms Vitest runs without config errors. Not a failure.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "Add Supabase, Anthropic, Voyage, and unpdf dependencies plus Vitest"
```

---

### Task 2: Supabase client, server, and middleware utilities

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/proxy.ts`
- Create: `src/proxy.ts`
- Modify: `.env.example` (add `NEXT_PUBLIC_SITE_URL`)

**Note:** This project is on Next.js 16, where the `middleware.ts` convention is deprecated in favor of `proxy.ts` (same API, renamed file and export — see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`). Do not create a `middleware.ts` file.

**Interfaces:**
- Produces: `createClient()` (browser, from `src/lib/supabase/client.ts`), `createClient()` (server/async, from `src/lib/supabase/server.ts`) — both return a configured Supabase client. Consumed by every later task that touches Supabase.

- [ ] **Step 1: Browser client**

```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 2: Server client**

```typescript
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component render — middleware refreshes the session instead.
          }
        },
      },
    }
  )
}
```

- [ ] **Step 3: Proxy (Next 16's renamed middleware) — session refresh + route protection**

```typescript
// src/lib/supabase/proxy.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthRoute =
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/auth')

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
```

```typescript
// src/proxy.ts
import { updateSession } from '@/lib/supabase/proxy'
import type { NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

- [ ] **Step 4: Add the site URL env var**

Edit `.env.example`, add:

```
# Base URL of this app (http://localhost:3000 for local dev)
NEXT_PUBLIC_SITE_URL=
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: no errors (Supabase env vars aren't set yet, but that's a runtime concern, not a type error).

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase src/middleware.ts .env.example
git commit -m "Add Supabase browser/server clients and auth middleware"
```

---

### Task 3: Database schema — documents, chunks, RLS, storage bucket, vector search function

**Files:**
- Create: `supabase/migrations/0001_init.sql`

**Interfaces:**
- Produces: `documents` table, `document_chunks` table (with `embedding vector(1024)`), a private `documents` storage bucket, and a `match_document_chunks(query_embedding, match_count)` Postgres function. Consumed by Tasks 10–11.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0001_init.sql

create extension if not exists vector;

create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  doc_type text,
  status text not null default 'processing',
  created_at timestamptz not null default now()
);

create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector(1024),
  created_at timestamptz not null default now()
);

create index document_chunks_embedding_idx
  on document_chunks using hnsw (embedding vector_cosine_ops);

alter table documents enable row level security;
alter table document_chunks enable row level security;

create policy "Users manage their own documents"
  on documents for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own chunks"
  on document_chunks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "Users upload to their own folder"
  on storage.objects for insert
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users read their own folder"
  on storage.objects for select
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function match_document_chunks (
  query_embedding vector(1024),
  match_count int default 8
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  similarity float
)
language sql
stable
as $$
  select
    document_chunks.id,
    document_chunks.document_id,
    document_chunks.content,
    1 - (document_chunks.embedding <=> query_embedding) as similarity
  from document_chunks
  where document_chunks.user_id = auth.uid()
  order by document_chunks.embedding <=> query_embedding
  limit match_count;
$$;
```

**Why `where document_chunks.user_id = auth.uid()` is inside the function too, not just relying on the table's RLS policy:** this function runs as the calling user (Postgres default), so the table's RLS policy already restricts it — but adding the same filter directly in the function is defense-in-depth: if RLS is ever accidentally disabled on this table, the function still can't leak another user's chunks.

- [ ] **Step 2: Run the migration**

This step happens in the Supabase dashboard, not the terminal (Clayton does this once his Supabase project exists — see `docs/account-setup.md`): open the SQL Editor, paste the contents of `0001_init.sql`, run it.

- [ ] **Step 3: Verify**

In the Supabase dashboard's Table Editor, confirm `documents` and `document_chunks` tables exist, and in Storage confirm a `documents` bucket exists (marked private). In the SQL Editor, run `select proname from pg_proc where proname = 'match_document_chunks';` — expect one row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_init.sql
git commit -m "Add database schema: documents, document_chunks, RLS, storage bucket, vector search function"
```

---

### Task 4: Login page and magic-link auth flow

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/login/actions.ts`
- Create: `src/app/auth/confirm/route.ts`

**Interfaces:**
- Consumes: `createClient()` from `src/lib/supabase/server.ts` (Task 2).
- Produces: working login at `/login`; `/auth/confirm` completes the magic-link flow and redirects to `/`.

- [ ] **Step 1: Server action to send the magic link**

```typescript
// src/app/login/actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'

export async function sendMagicLink(email: string): Promise<{ success: boolean }> {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
    },
  })

  return { success: !error }
}
```

- [ ] **Step 2: Login page**

```tsx
// src/app/login/page.tsx
'use client'

import { useState } from 'react'
import { sendMagicLink } from './actions'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const result = await sendMagicLink(email)
    setStatus(result.success ? 'sent' : 'error')
  }

  if (status === 'sent') {
    return <p className="p-8 text-center">Check {email} for a sign-in link.</p>
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto mt-24 flex max-w-sm flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Sign in to cre-copilot</h1>
      <input
        type="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded border px-3 py-2"
      />
      <button type="submit" className="rounded bg-black px-3 py-2 text-white">
        Send magic link
      </button>
      {status === 'error' && <p className="text-red-600">Something went wrong. Try again.</p>}
    </form>
  )
}
```

- [ ] **Step 3: Magic-link confirmation route**

```typescript
// src/app/auth/confirm/route.ts
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      redirect('/')
    }
  }

  redirect('/login?error=invalid_link')
}
```

- [ ] **Step 4: Configure the Supabase email template (dashboard, one-time)**

Supabase's default magic-link email points at Supabase's own verification endpoint, which doesn't match the `token_hash`-based route above. In the Supabase dashboard: Authentication → Email Templates → Magic Link, set the link to:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

**Why:** this makes the email link point at *your app's* route (which calls `verifyOtp` itself) instead of Supabase's hosted verification page — necessary for the App Router SSR pattern used here.

- [ ] **Step 5: Verify**

Run `npm run dev`, visit `http://localhost:3000/login`, submit your email, check your inbox, click the link. Expected: redirected to `/` (which will still redirect back to `/login` until Task 5 — that's expected at this point; confirm no error is shown and you land somewhere other than `/login?error=invalid_link`).

- [ ] **Step 6: Commit**

```bash
git add src/app/login src/app/auth
git commit -m "Add magic-link login flow"
```

---

### Task 5: Root layout, home routing, and sign-out

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`
- Create: `src/app/actions.ts`

**Interfaces:**
- Consumes: `createClient()` (Task 2).
- Produces: `signOut()` server action; `/` redirects logged-in users to `/vault`, logged-out users to `/login`.

- [ ] **Step 1: Sign-out action**

```typescript
// src/app/actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

- [ ] **Step 2: Root page routes by auth state**

```tsx
// src/app/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  redirect(user ? '/vault' : '/login')
}
```

- [ ] **Step 3: Layout with sign-out**

Read the existing `src/app/layout.tsx` first, then replace its body content with a nav bar. Keep the existing `<html>`/`<body>` wrapper and font setup from the scaffolded file — only add the nav:

```tsx
// Add inside the existing <body> element, before {children}:
<nav className="flex items-center justify-between border-b px-6 py-3">
  <span className="font-semibold">cre-copilot</span>
  <form action={signOut}>
    <button type="submit" className="text-sm text-gray-500 hover:text-black">
      Sign out
    </button>
  </form>
</nav>
```

Add the import at the top: `import { signOut } from '@/app/actions'`.

- [ ] **Step 4: Verify**

Run `npm run dev`, visit `/`. Logged out: redirected to `/login`. Log in via magic link: redirected toward `/vault` (this 404s until Task 10 creates it — confirm the URL bar shows `/vault`, not an error redirect back to `/login`). Click "Sign out": redirected to `/login`.

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/page.tsx src/app/actions.ts
git commit -m "Add root routing by auth state and sign-out"
```

---

### Task 6: Text chunking utility

**Files:**
- Create: `src/lib/chunk.ts`
- Test: `src/lib/chunk.test.ts`

**Interfaces:**
- Produces: `chunkText(text: string): string[]`. Consumed by Task 10.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/chunk.test.ts
import { describe, it, expect } from 'vitest'
import { chunkText } from './chunk'

describe('chunkText', () => {
  it('returns an empty array for empty input', () => {
    expect(chunkText('')).toEqual([])
  })

  it('returns a single chunk for short text', () => {
    expect(chunkText('hello world')).toEqual(['hello world'])
  })

  it('splits long text into multiple overlapping chunks', () => {
    const text = 'a'.repeat(4000)
    const result = chunkText(text)
    expect(result.length).toBeGreaterThan(1)
    const overlapFromFirst = result[0].slice(-50)
    expect(result[1]).toContain(overlapFromFirst.slice(0, 10))
  })

  it('collapses internal whitespace', () => {
    expect(chunkText('hello    \n\n  world')).toEqual(['hello world'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- chunk.test.ts`
Expected: FAIL — `Cannot find module './chunk'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/chunk.ts
const CHUNK_SIZE = 1500 // characters, roughly 300-400 tokens
const CHUNK_OVERLAP = 200

export function chunkText(text: string): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length === 0) return []

  const chunks: string[] = []
  let start = 0

  while (start < cleaned.length) {
    const end = Math.min(start + CHUNK_SIZE, cleaned.length)
    chunks.push(cleaned.slice(start, end))
    if (end === cleaned.length) break
    start = end - CHUNK_OVERLAP
  }

  return chunks
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- chunk.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/chunk.ts src/lib/chunk.test.ts
git commit -m "Add text chunking utility with overlap"
```

---

### Task 7: Document text extraction utility

**Files:**
- Create: `src/lib/parse.ts`
- Test: `src/lib/parse.test.ts`

**Interfaces:**
- Produces: `extractTextFromFile(file: File): Promise<string>`. Consumed by Task 10.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/parse.test.ts
import { describe, it, expect } from 'vitest'
import { extractTextFromFile } from './parse'

describe('extractTextFromFile', () => {
  it('reads plain text files directly', async () => {
    const file = new File(['hello world'], 'notes.txt', { type: 'text/plain' })
    const result = await extractTextFromFile(file)
    expect(result).toBe('hello world')
  })

  it('rejects unsupported file types', async () => {
    const file = new File(['data'], 'image.png', { type: 'image/png' })
    await expect(extractTextFromFile(file)).rejects.toThrow('Unsupported file type')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- parse.test.ts`
Expected: FAIL — `Cannot find module './parse'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/parse.ts
import { getDocumentProxy, extractText } from 'unpdf'

export async function extractTextFromFile(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer())

  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (isPdf) {
    const pdf = await getDocumentProxy(buffer)
    const { text } = await extractText(pdf, { mergePages: true })
    return text
  }

  const isText = file.type.startsWith('text/') || file.name.toLowerCase().endsWith('.txt')
  if (isText) {
    return new TextDecoder().decode(buffer)
  }

  throw new Error(`Unsupported file type: ${file.type || file.name}`)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- parse.test.ts`
Expected: PASS (2 tests). PDF extraction itself is verified manually in Task 10 with a real PDF — a unit test would need a binary fixture, which isn't worth the setup for v1.

- [ ] **Step 5: Commit**

```bash
git add src/lib/parse.ts src/lib/parse.test.ts
git commit -m "Add document text extraction for PDF and plain text"
```

---

### Task 8: Voyage AI embeddings client

**Files:**
- Create: `src/lib/voyage.ts`
- Test: `src/lib/voyage.test.ts`

**Interfaces:**
- Produces: `embedTexts(texts: string[], inputType: 'document' | 'query'): Promise<number[][]>`. Consumed by Task 10 (documents) and Task 11 (queries).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/voyage.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- voyage.test.ts`
Expected: FAIL — `Cannot find module './voyage'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/voyage.ts
const VOYAGE_MODEL = 'voyage-3.5'
const EMBEDDING_DIMENSION = 1024

interface VoyageEmbeddingResponse {
  data: { embedding: number[]; index: number }[]
}

export async function embedTexts(
  texts: string[],
  inputType: 'document' | 'query'
): Promise<number[][]> {
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: texts,
      model: VOYAGE_MODEL,
      input_type: inputType,
      output_dimension: EMBEDDING_DIMENSION,
    }),
  })

  if (!response.ok) {
    throw new Error(`Voyage embedding request failed: ${response.status} ${await response.text()}`)
  }

  const body = (await response.json()) as VoyageEmbeddingResponse
  return body.data.sort((a, b) => a.index - b.index).map((item) => item.embedding)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- voyage.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/voyage.ts src/lib/voyage.test.ts
git commit -m "Add Voyage AI embeddings client"
```

---

### Task 9: Claude client wrapper

**Files:**
- Create: `src/lib/claude.ts`

**Interfaces:**
- Produces: `askClaude(question: string, chunks: ContextChunk[]): Promise<string>`, `ContextChunk { fileName: string, content: string }`. Consumed by Task 11.

- [ ] **Step 1: Write the implementation**

```typescript
// src/lib/claude.ts
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface ContextChunk {
  fileName: string
  content: string
}

const SYSTEM_PROMPT = `You are a CRE (commercial real estate) document assistant.
Answer the user's question using ONLY the numbered document excerpts provided below.
Cite the excerpt number in brackets like [1] after every claim you make from it.
If the excerpts do not contain the answer, say "I don't have information on that in the documents you've uploaded" — never guess or use outside knowledge.`

export async function askClaude(question: string, chunks: ContextChunk[]): Promise<string> {
  const context = chunks
    .map((chunk, i) => `[${i + 1}] (from "${chunk.fileName}")\n${chunk.content}`)
    .join('\n\n')

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    messages: [
      {
        role: 'user',
        content: `Document excerpts:\n\n${context}\n\nQuestion: ${question}`,
      },
    ],
  })

  const textBlock = message.content.find((block) => block.type === 'text')
  return textBlock?.type === 'text' ? textBlock.text : ''
}
```

**Why the system prompt refuses to answer beyond the excerpts:** this is the core trust safeguard from the design spec — a confidently wrong answer on a real financial document is worse than no answer.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors. Full behavioral verification (a real Claude call) happens in Task 11 once the chat route exists and `ANTHROPIC_API_KEY` is set.

- [ ] **Step 3: Commit**

```bash
git add src/lib/claude.ts
git commit -m "Add Claude client wrapper with grounded, citation-required system prompt"
```

---

### Task 10: Vault page — upload, storage, and ingestion pipeline

**Files:**
- Create: `src/app/vault/page.tsx`
- Create: `src/app/vault/actions.ts`

**Interfaces:**
- Consumes: `createClient()` (Task 2), `extractTextFromFile` (Task 7), `chunkText` (Task 6), `embedTexts` (Task 8).
- Produces: working `/vault` page; `uploadDocument(formData)` server action.

- [ ] **Step 1: Upload + ingestion server action**

```typescript
// src/app/vault/actions.ts
'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { extractTextFromFile } from '@/lib/parse'
import { chunkText } from '@/lib/chunk'
import { embedTexts } from '@/lib/voyage'

const MAX_FILE_BYTES = 20 * 1024 * 1024 // 20MB

export async function uploadDocument(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('No file provided')
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('File is too large (max 20MB)')
  }
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const isText = file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')
  if (!isPdf && !isText) {
    throw new Error('Only PDF and plain text files are supported')
  }

  const storagePath = `${user.id}/${randomUUID()}-${file.name}`
  const { error: uploadError } = await supabase.storage.from('documents').upload(storagePath, file)
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

  const { data: documentRow, error: insertError } = await supabase
    .from('documents')
    .insert({
      user_id: user.id,
      file_name: file.name,
      storage_path: storagePath,
      doc_type: isPdf ? 'pdf' : 'text',
      status: 'processing',
    })
    .select('id')
    .single()
  if (insertError || !documentRow) {
    throw new Error(`Failed to record document: ${insertError?.message}`)
  }

  try {
    const text = await extractTextFromFile(file)
    const chunks = chunkText(text)
    if (chunks.length === 0) {
      throw new Error('No extractable text found in this file')
    }

    const embeddings = await embedTexts(chunks, 'document')

    const { error: chunksError } = await supabase.from('document_chunks').insert(
      chunks.map((content, i) => ({
        document_id: documentRow.id,
        user_id: user.id,
        chunk_index: i,
        content,
        embedding: embeddings[i],
      }))
    )
    if (chunksError) throw new Error(`Failed to store chunks: ${chunksError.message}`)

    await supabase.from('documents').update({ status: 'ready' }).eq('id', documentRow.id)
  } catch (err) {
    await supabase.from('documents').update({ status: 'failed' }).eq('id', documentRow.id)
    throw err
  }

  revalidatePath('/vault')
}
```

**Why status flips to `'failed'` on any ingestion error rather than leaving it `'processing'` forever:** a document stuck at "processing" with no path forward is indistinguishable from a slow upload — the user needs a clear signal that this specific file needs re-uploading or is unsupported.

- [ ] **Step 2: Vault page**

```tsx
// src/app/vault/page.tsx
import { createClient } from '@/lib/supabase/server'
import { uploadDocument } from './actions'

export default async function VaultPage() {
  const supabase = await createClient()
  const { data: documents } = await supabase
    .from('documents')
    .select('id, file_name, doc_type, status, created_at')
    .order('created_at', { ascending: false })

  const docCount = documents?.length ?? 0
  const readyCount = documents?.filter((d) => d.status === 'ready').length ?? 0

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Vault</h1>
      <div className="flex gap-6 text-sm text-gray-600">
        <span>{docCount} documents</span>
        <span>{readyCount} ready to search</span>
      </div>

      <form action={uploadDocument} className="flex items-center gap-2">
        <input type="file" name="file" accept=".pdf,.txt" required className="text-sm" />
        <button type="submit" className="rounded bg-black px-4 py-2 text-sm text-white">
          Upload
        </button>
      </form>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">File</th>
            <th className="py-2">Status</th>
            <th className="py-2">Uploaded</th>
          </tr>
        </thead>
        <tbody>
          {(documents ?? []).map((doc) => (
            <tr key={doc.id} className="border-b">
              <td className="py-2">{doc.file_name}</td>
              <td className="py-2">{doc.status}</td>
              <td className="py-2">{new Date(doc.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Verify**

This is the first point all the real accounts (Supabase, Voyage) need to be live. Set real values in `.env.local`. Run `npm run dev`, log in, go to `/vault`, upload a small real PDF or `.txt` file. Expected: the file appears in the table with status `processing` then (after a page refresh) `ready`. In the Supabase Table Editor, confirm rows exist in both `documents` and `document_chunks` for that upload, and that `document_chunks.embedding` is populated (not null).

- [ ] **Step 4: Commit**

```bash
git add src/app/vault
git commit -m "Add Vault page with document upload and ingestion pipeline"
```

---

### Task 11: Vector search + chat API route

**Files:**
- Create: `src/app/api/chat/route.ts`

**Interfaces:**
- Consumes: `createClient()` (Task 2), `embedTexts` (Task 8), `askClaude` + `ContextChunk` (Task 9), `match_document_chunks` RPC (Task 3).
- Produces: `POST /api/chat` — `{ question: string }` → `{ answer: string, citations: Citation[] }`.

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { embedTexts } from '@/lib/voyage'
import { askClaude } from '@/lib/claude'

interface ChunkMatch {
  id: string
  document_id: string
  content: string
  similarity: number
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { question } = await request.json()
  if (typeof question !== 'string' || !question.trim()) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 })
  }

  const [queryEmbedding] = await embedTexts([question], 'query')

  const { data: matches, error } = await supabase.rpc('match_document_chunks', {
    query_embedding: queryEmbedding,
    match_count: 8,
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const chunkMatches = (matches ?? []) as ChunkMatch[]
  if (chunkMatches.length === 0) {
    return NextResponse.json({
      answer: "I don't have any documents to search yet — upload something in the Vault first.",
      citations: [],
    })
  }

  const documentIds = [...new Set(chunkMatches.map((m) => m.document_id))]
  const { data: documents } = await supabase.from('documents').select('id, file_name').in('id', documentIds)
  const fileNameById = new Map((documents ?? []).map((d) => [d.id, d.file_name]))

  const contextChunks = chunkMatches.map((m) => ({
    fileName: fileNameById.get(m.document_id) ?? 'unknown document',
    content: m.content,
  }))

  const answer = await askClaude(question, contextChunks)

  return NextResponse.json({
    answer,
    citations: chunkMatches.map((m, i) => ({
      index: i + 1,
      documentId: m.document_id,
      fileName: fileNameById.get(m.document_id) ?? 'unknown document',
      excerpt: m.content.slice(0, 200),
    })),
  })
}
```

- [ ] **Step 2: Verify**

Run `npm run dev`, log in (with at least one `ready` document from Task 10). Use a tool like `curl` or the browser dev console to POST:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: <copy your browser's cookie header for localhost:3000>" \
  -d '{"question": "What does this document say?"}'
```

Expected: a JSON response with a non-empty `answer` and at least one `citations` entry whose `fileName` matches your uploaded document. (Full UI-based verification happens in Task 12 — this step just confirms the route itself works before wiring up a form.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/chat
git commit -m "Add vector search and chat API route"
```

---

### Task 12: Ask-the-Brain chat UI

**Files:**
- Create: `src/app/chat/page.tsx`
- Modify: `src/app/layout.tsx` (add a nav link to `/chat`)

**Interfaces:**
- Consumes: `POST /api/chat` (Task 11).
- Produces: working chat UI at `/chat`.

- [ ] **Step 1: Chat page**

```tsx
// src/app/chat/page.tsx
'use client'

import { useState } from 'react'

interface Citation {
  index: number
  documentId: string
  fileName: string
  excerpt: string
}

interface ChatTurn {
  question: string
  answer: string
  citations: Citation[]
}

export default function ChatPage() {
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim() || loading) return
    setLoading(true)
    const currentQuestion = question
    setQuestion('')

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: currentQuestion }),
    })
    const data = await response.json()
    setTurns((prev) => [
      ...prev,
      { question: currentQuestion, answer: data.answer ?? data.error, citations: data.citations ?? [] },
    ])
    setLoading(false)
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Ask the Brain</h1>
      <div className="flex flex-col gap-6">
        {turns.map((turn, i) => (
          <div key={i} className="flex flex-col gap-2">
            <p className="font-medium">{turn.question}</p>
            <p className="whitespace-pre-wrap text-sm text-gray-700">{turn.answer}</p>
            {turn.citations.length > 0 && (
              <div className="flex flex-col gap-1 text-xs text-gray-500">
                {turn.citations.map((c) => (
                  <div key={c.index}>
                    [{c.index}] {c.fileName}: &quot;{c.excerpt}...&quot;
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about your uploaded documents..."
          className="flex-1 rounded border px-3 py-2"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? 'Thinking...' : 'Ask'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Add nav link**

In `src/app/layout.tsx`, add links to `/vault` and `/chat` in the nav bar added in Task 5:

```tsx
<div className="flex gap-4">
  <a href="/vault" className="text-sm hover:underline">Vault</a>
  <a href="/chat" className="text-sm hover:underline">Ask the Brain</a>
</div>
```

- [ ] **Step 3: Verify — this is the full end-to-end check for v1**

Run `npm run dev`. Log in. Upload a real document with a fact you know (e.g. a specific number or name) via `/vault`. Wait for status `ready`. Go to `/chat`, ask a question whose answer is in that document. Expected: the answer is correct, cites `[1]` (or another number) matching the citation list below it, and the cited excerpt actually contains the relevant text. Then ask something the document does *not* cover — expected: the answer says it doesn't have that information, rather than guessing.

- [ ] **Step 4: Commit**

```bash
git add src/app/chat src/app/layout.tsx
git commit -m "Add Ask-the-Brain chat UI with citations"
```

---

## After this plan

v1 is a working, real (not synthetic) document Q&A tool: real login, real document storage, real grounded answers with citations. Natural next steps — not part of this plan, evaluate after v1 is actually used:

- Show your real contact the working app, get their documents and feedback (per the design spec's validation path).
- If it holds up: revisit deferred features (deck generation, buyer intelligence) with real usage data informing which one to build next.
- Deploy to Vercel (guide Clayton through account setup once there's something worth putting online).
