# Project Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user organize documents into named projects, focus Vault/Chat on one project at a time, or widen chat to search everything they own at once.

**Architecture:** Add `projects` and a many-to-many `project_documents` join table (a document can belong to more than one project). Add an optional `filter_project_id` parameter to the existing `match_document_chunks` search function — omitted, it searches everything the user owns (today's behavior, now doubling as "all projects" mode); provided, it narrows to one project. Restructure the app around `/projects` as the home dashboard, with each project getting its own scoped Vault and Chat under `/projects/[projectId]/...`, plus a separate `/projects/all/chat` for the macro view. A one-time data migration puts every existing document into a "General" project so nothing already uploaded gets orphaned.

**Tech Stack:** Next.js 16 App Router (async dynamic route `params`), Supabase (Postgres + RLS + `@supabase/supabase-js` embedded relation queries), Vitest. No new dependencies.

## Global Constraints

- No new npm dependencies — everything needed already exists in `package.json`.
- Code style matches the existing codebase: no semicolons, single quotes, `'use server'` at the top of server action files.
- Next.js 16 App Router: dynamic route `params` are async — type as `params: Promise<{ projectId: string }>` and `await params` before use (confirmed against `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`).
- Row-level security is the real security boundary. Every new table has RLS enabled from the moment it's created, and every new query relies on it rather than manual `user_id` filtering in application code — matching the existing `documents`/`document_chunks` pattern.
- Next.js layouts don't pass their fetched data down to page components as props. Because of that, `[projectId]/layout.tsx` and each page underneath it (`vault/page.tsx`, `chat/page.tsx`) independently re-fetch and re-verify the project via its own RLS-scoped query, calling `notFound()` if it's missing. This is intentional — each route stays safe on its own — not an oversight to dedupe later.
- Reuse the existing "deed and ledger" design tokens from `src/app/globals.css` (`bg-forest`, `text-wine`, `border-hairline`, `bg-paper`, `text-ink`, `text-slate`, `font-mono uppercase tracking-widest` for labels, `font-display` for headings). No new design pass — match `vault/page.tsx` and `chat/page.tsx`'s existing look exactly.
- Following the existing codebase convention: pure functions get unit tests (`src/lib/*.ts`); Server Components, Server Actions, and API routes (`page.tsx`, `actions.ts`, `route.ts`) do not have dedicated test files today and this plan doesn't add any — they get `npx tsc --noEmit` type-checking and the manual end-to-end walkthrough in Task 10 instead.

---

### Task 1: Database migration — projects, linking table, scoped search, data backfill

**Files:**
- Create: `supabase/migrations/0003_projects.sql`

**Interfaces:**
- Produces: `projects` table (`id`, `user_id`, `name`, `created_at`); `project_documents` join table (`project_id`, `document_id`, `created_at`); an updated `match_document_chunks(query_embedding vector(1024), match_count int default 8, filter_project_id uuid default null)` function. Task 3's chat route calls this function by name with these exact parameter names. Task 5's vault actions and Task 6's linking action insert into `project_documents` by these exact column names.

- [ ] **Step 1: Write the migration**

```sql
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table project_documents (
  project_id uuid not null references projects(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, document_id)
);

alter table projects enable row level security;
alter table project_documents enable row level security;

create policy "Users manage their own projects"
  on projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own project links"
  on project_documents for all
  using (
    auth.uid() = (select user_id from projects where id = project_id)
  )
  with check (
    auth.uid() = (select user_id from projects where id = project_id)
    and auth.uid() = (select user_id from documents where id = document_id)
  );

-- Only one version of match_document_chunks exists today (from 0001_init.sql), so an
-- unqualified drop is unambiguous. Recreated below with an extra optional parameter.
drop function if exists match_document_chunks;

create function match_document_chunks (
  query_embedding vector(1024),
  match_count int default 8,
  filter_project_id uuid default null
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
    and (
      filter_project_id is null
      or document_chunks.document_id in (
        select document_id from project_documents where project_id = filter_project_id
      )
    )
  order by document_chunks.embedding <=> query_embedding
  limit match_count;
$$;

-- One-time backfill: every existing user's existing documents move into a "General"
-- project so nothing already uploaded (Clayton's real E2E-test documents) is orphaned.
insert into projects (user_id, name)
select distinct user_id, 'General' from documents
on conflict do nothing;

insert into project_documents (project_id, document_id)
select p.id, d.id
from documents d
join projects p on p.user_id = d.user_id and p.name = 'General'
on conflict do nothing;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0003_projects.sql
git commit -m "Add projects, project_documents, and scoped chunk search"
```

- [ ] **Step 3: Run the migration against the live database**

This changes the real Supabase database, not just local files — same as `0001_init.sql` and `0002_ocr_page_count.sql` before it. Give Clayton the exact SQL from Step 1 and ask him to paste it into the Supabase dashboard's SQL Editor (Project → SQL Editor → New query → paste → Run). Then ask him to run this check query in the same editor and paste back the result:

```sql
select p.name, count(pd.document_id) as document_count
from projects p
left join project_documents pd on pd.project_id = p.id
group by p.name;
```

Expect one row named "General" whose `document_count` matches however many documents he'd already uploaded during earlier E2E testing. Wait for his confirmation the migration ran cleanly and this check looks right before starting Task 5 — Task 5's upload code will fail at runtime against a database that doesn't have `project_documents` yet. Tasks 2–4 don't touch the database and can proceed without waiting.

---

### Task 2: Citation-building helper

**Files:**
- Create: `src/lib/citations.ts`
- Test: `src/lib/citations.test.ts`

**Interfaces:**
- Consumes: nothing (pure function, no Supabase/network calls).
- Produces: `Citation` interface (`index`, `documentId`, `fileName`, `excerpt`, optional `projectNames`) and `buildCitations(matches, fileNameById, projectNamesByDocId?)`. Task 3 imports both into `src/app/api/chat/route.ts`. Task 7 imports `Citation` into `src/components/chat-interface.tsx`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/citations.test.ts
import { describe, it, expect } from 'vitest'
import { buildCitations } from './citations'

describe('buildCitations', () => {
  const matches = [
    { document_id: 'doc-1', content: 'a'.repeat(250) },
    { document_id: 'doc-2', content: 'short excerpt' },
  ]
  const fileNameById = new Map([
    ['doc-1', 'Rent Roll.pdf'],
    ['doc-2', 'T12.pdf'],
  ])

  it('numbers citations starting at 1', () => {
    const result = buildCitations(matches, fileNameById)
    expect(result[0].index).toBe(1)
    expect(result[1].index).toBe(2)
  })

  it('truncates excerpts to 200 characters', () => {
    const result = buildCitations(matches, fileNameById)
    expect(result[0].excerpt.length).toBe(200)
  })

  it('falls back to "unknown document" when a file name is missing', () => {
    const result = buildCitations([{ document_id: 'doc-missing', content: 'x' }], fileNameById)
    expect(result[0].fileName).toBe('unknown document')
  })

  it('omits projectNames when no project map is given', () => {
    const result = buildCitations(matches, fileNameById)
    expect(result[0].projectNames).toBeUndefined()
  })

  it('includes projectNames from the project map when given', () => {
    const projectNamesByDocId = new Map([['doc-1', ['123 Main St']]])
    const result = buildCitations(matches, fileNameById, projectNamesByDocId)
    expect(result[0].projectNames).toEqual(['123 Main St'])
    expect(result[1].projectNames).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/citations.test.ts`
Expected: FAIL — `./citations` has no exported member `buildCitations` (module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/citations.ts
export interface Citation {
  index: number
  documentId: string
  fileName: string
  excerpt: string
  projectNames?: string[]
}

interface ChunkMatch {
  document_id: string
  content: string
}

const EXCERPT_LENGTH = 200

export function buildCitations(
  matches: ChunkMatch[],
  fileNameById: Map<string, string>,
  projectNamesByDocId?: Map<string, string[]>
): Citation[] {
  return matches.map((match, i) => {
    const citation: Citation = {
      index: i + 1,
      documentId: match.document_id,
      fileName: fileNameById.get(match.document_id) ?? 'unknown document',
      excerpt: match.content.slice(0, EXCERPT_LENGTH),
    }
    if (projectNamesByDocId) {
      citation.projectNames = projectNamesByDocId.get(match.document_id) ?? []
    }
    return citation
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/citations.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/citations.ts src/lib/citations.test.ts
git commit -m "Add buildCitations helper for project-aware chat citations"
```

---

### Task 3: Scope the chat API route to an optional project

**Files:**
- Modify: `src/app/api/chat/route.ts` (full file replaced below)

**Interfaces:**
- Consumes: `buildCitations`, `Citation` from `src/lib/citations.ts` (Task 2); `match_document_chunks`'s `filter_project_id` param (Task 1).
- Produces: `POST /api/chat` now accepts `{ question: string, projectId?: string }`. Task 7's scoped chat page sends `projectId`; the all-projects chat page omits it. Response shape (`{ answer, citations }`) is unchanged from today.

- [ ] **Step 1: Replace the route**

```typescript
// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { embedTexts } from '@/lib/voyage'
import { askClaude } from '@/lib/claude'
import { checkRateLimit } from '@/lib/rate-limit'
import { buildCitations } from '@/lib/citations'

const MAX_QUESTION_CHARS = 2000
const RATE_LIMIT_MAX_REQUESTS = 20
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

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

  if (!checkRateLimit(user.id, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json({ error: 'Too many requests. Try again in a few minutes.' }, { status: 429 })
  }

  const { question, projectId } = await request.json()
  if (typeof question !== 'string' || !question.trim()) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 })
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return NextResponse.json({ error: 'Question is too long.' }, { status: 400 })
  }
  const scopedToProject = typeof projectId === 'string' && projectId.length > 0

  const [queryEmbedding] = await embedTexts([question], 'query')

  const { data: matches, error } = await supabase.rpc('match_document_chunks', {
    query_embedding: queryEmbedding,
    match_count: 8,
    filter_project_id: scopedToProject ? projectId : null,
  })
  if (error) {
    console.error('match_document_chunks failed:', error)
    return NextResponse.json({ error: 'Something went wrong searching your documents.' }, { status: 500 })
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

  // Only look up which project(s) each source document belongs to when the question
  // wasn't scoped to one project already — in scoped mode the user already knows.
  let projectNamesByDocId: Map<string, string[]> | undefined
  if (!scopedToProject) {
    const { data: links } = await supabase
      .from('project_documents')
      .select('document_id, projects(name)')
      .in('document_id', documentIds)

    projectNamesByDocId = new Map()
    for (const link of (links ?? []) as unknown as { document_id: string; projects: { name: string } | null }[]) {
      const name = link.projects?.name
      if (!name) continue
      const existing = projectNamesByDocId.get(link.document_id) ?? []
      existing.push(name)
      projectNamesByDocId.set(link.document_id, existing)
    }
  }

  const contextChunks = chunkMatches.map((m) => ({
    fileName: fileNameById.get(m.document_id) ?? 'unknown document',
    content: m.content,
  }))

  const answer = await askClaude(question, contextChunks)

  return NextResponse.json({
    answer,
    citations: buildCitations(chunkMatches, fileNameById, projectNamesByDocId),
  })
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "Scope chat search to an optional project"
```

---

### Task 4: Projects dashboard (list + create)

**Files:**
- Create: `src/app/(app)/projects/page.tsx`
- Create: `src/app/(app)/projects/actions.ts`

**Interfaces:**
- Consumes: `projects` table, `project_documents` (Task 1).
- Produces: `/projects` route and `createProject(formData)` server action. Task 8's layout links here (`/projects` as the brand link and post-login redirect target).

- [ ] **Step 1: Write the create action**

```typescript
// src/app/(app)/projects/actions.ts
'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const MAX_NAME_CHARS = 200

export async function createProject(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const name = formData.get('name')
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Give the project a name')
  }
  if (name.length > MAX_NAME_CHARS) {
    throw new Error('Project name is too long')
  }

  const { data: project, error } = await supabase
    .from('projects')
    .insert({ user_id: user.id, name: name.trim() })
    .select('id')
    .single()
  if (error || !project) {
    console.error('Failed to create project:', error)
    throw new Error('Could not create this project. Please try again.')
  }

  redirect(`/projects/${project.id}/vault`)
}
```

- [ ] **Step 2: Write the dashboard page**

```tsx
// src/app/(app)/projects/page.tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createProject } from './actions'

interface ProjectRow {
  id: string
  name: string
  created_at: string
  project_documents: { count: number }[]
}

export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('projects')
    .select('id, name, created_at, project_documents(count)')
    .order('created_at', { ascending: false })

  const projects = (data ?? []) as unknown as ProjectRow[]

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-widest text-slate">Projects</span>
        <h1 className="font-display text-3xl font-medium tracking-tight">Your projects</h1>
      </div>

      <Link
        href="/projects/all/chat"
        className="rounded-md border border-wine/30 px-4 py-3 text-sm text-wine transition-colors hover:bg-wine/5"
      >
        Ask across everything →
      </Link>

      <form
        action={createProject}
        className="flex items-center gap-2 rounded-md border border-dashed border-hairline px-4 py-4"
      >
        <input
          type="text"
          name="name"
          placeholder="New project name (e.g. 123 Main St)"
          required
          className="flex-1 rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
        />
        <button
          type="submit"
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-forest"
        >
          Create
        </button>
      </form>

      {projects.length === 0 ? (
        <p className="text-sm text-slate">No projects yet. Create your first one above.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {projects.map((project) => {
            const count = project.project_documents[0]?.count ?? 0
            return (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}/vault`}
                  className="flex items-center justify-between rounded-md border border-hairline px-4 py-3 text-sm transition-colors hover:border-forest"
                >
                  <span className="font-display text-base font-medium tracking-tight">{project.name}</span>
                  <span className="font-mono text-xs text-slate">
                    {count} document{count === 1 ? '' : 's'}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/projects/page.tsx src/app/\(app\)/projects/actions.ts
git commit -m "Add projects dashboard with create-project form"
```

---

### Task 5: Project workspace layout + scoped Vault

**Files:**
- Create: `src/app/(app)/projects/[projectId]/layout.tsx`
- Create: `src/app/(app)/projects/[projectId]/vault/page.tsx`
- Create: `src/app/(app)/projects/[projectId]/vault/actions.ts`
- Delete: `src/app/(app)/vault/page.tsx`
- Delete: `src/app/(app)/vault/actions.ts`

**Interfaces:**
- Consumes: `projects`, `project_documents` (Task 1).
- Produces: `uploadDocument(projectId, formData)` in `.../vault/actions.ts` — Task 6 adds `linkDocumentToProject` to this same file. `/projects/[projectId]/vault` route — Task 6 extends this page.

- [ ] **Step 1: Write the project layout**

```tsx
// src/app/(app)/projects/[projectId]/layout.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const supabase = await createClient()
  const { data: project } = await supabase.from('projects').select('id, name').eq('id', projectId).single()
  if (!project) notFound()

  return (
    <div>
      <div className="border-b border-hairline">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-baseline gap-3">
            <Link
              href="/projects"
              className="font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-ink"
            >
              ← Projects
            </Link>
            <span className="font-display text-base font-medium tracking-tight">{project.name}</span>
          </div>
          <div className="flex items-center gap-6">
            <Link
              href={`/projects/${project.id}/vault`}
              className="font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-ink"
            >
              Vault
            </Link>
            <Link
              href={`/projects/${project.id}/chat`}
              className="font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-ink"
            >
              Ask the Brain
            </Link>
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Write the scoped vault actions**

```typescript
// src/app/(app)/projects/[projectId]/vault/actions.ts
'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { extractTextFromFile, extractPdfPages, isPageScanned, spliceOcrPages } from '@/lib/parse'
import { exceedsOcrLimits, transcribeScannedPdf } from '@/lib/ocr'
import { chunkText } from '@/lib/chunk'
import { embedTexts } from '@/lib/voyage'

const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50MB
const MAX_EXTRACTED_TEXT_CHARS = 2_000_000
const MAX_CHUNKS_PER_DOCUMENT = 500

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\]/g, '_').replace(/[\x00-\x1f]/g, '').slice(0, 200) || 'upload'
}

export async function uploadDocument(projectId: string, formData: FormData) {
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
    throw new Error('File is too large (max 50MB)')
  }
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const isText = file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')
  if (!isPdf && !isText) {
    throw new Error('Only PDF and plain text files are supported')
  }

  const safeName = sanitizeFilename(file.name)
  const storagePath = `${user.id}/${randomUUID()}-${safeName}`
  const { error: uploadError } = await supabase.storage.from('documents').upload(storagePath, file)
  if (uploadError) {
    console.error('Vault upload failed:', uploadError)
    throw new Error('Upload failed. Please try again.')
  }

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
    console.error('Failed to record document:', insertError)
    throw new Error('Could not save this document. Please try again.')
  }

  const { error: linkError } = await supabase
    .from('project_documents')
    .insert({ project_id: projectId, document_id: documentRow.id })
  if (linkError) {
    console.error('Failed to link document to project:', linkError)
    await supabase.from('documents').update({ status: 'failed' }).eq('id', documentRow.id)
    throw new Error('Could not add this document to the project. Please try again.')
  }

  try {
    let text: string
    let ocrPageCount = 0

    if (isPdf) {
      const arrayBuffer = await file.arrayBuffer()
      const pages = await extractPdfPages(new Uint8Array(arrayBuffer))
      ocrPageCount = pages.filter(isPageScanned).length

      if (ocrPageCount > 0) {
        const limitError = exceedsOcrLimits(file.size, pages.length)
        if (limitError) {
          throw new Error(limitError)
        }
        const ocrPages = await transcribeScannedPdf(arrayBuffer, pages.length)
        const splicedPages = spliceOcrPages(pages, ocrPages)
        text = splicedPages.join('\n\n')
      } else {
        text = pages.join('\n\n')
      }
    } else {
      text = await extractTextFromFile(file)
    }

    if (text.length > MAX_EXTRACTED_TEXT_CHARS) {
      throw new Error('This document is too large to process (extracted text exceeds the v1 limit).')
    }

    const chunks = chunkText(text)
    if (chunks.length === 0) {
      throw new Error('No extractable text found in this file')
    }
    if (chunks.length > MAX_CHUNKS_PER_DOCUMENT) {
      throw new Error('This document is too large to process (too many sections for v1).')
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
    if (chunksError) {
      console.error('Failed to store document chunks:', chunksError)
      throw new Error('Could not process this document. Please try again.')
    }

    const { error: readyError } = await supabase
      .from('documents')
      .update({ status: 'ready', ocr_page_count: ocrPageCount })
      .eq('id', documentRow.id)
    if (readyError) {
      console.error('Failed to mark document ready:', readyError)
      throw new Error('Could not finish processing this document. Please try again.')
    }
  } catch (err) {
    console.error('Ingestion failed for document', documentRow.id, err)
    await supabase.from('documents').update({ status: 'failed' }).eq('id', documentRow.id)
    throw err
  }

  revalidatePath(`/projects/${projectId}/vault`)
}
```

- [ ] **Step 3: Write the scoped vault page**

```tsx
// src/app/(app)/projects/[projectId]/vault/page.tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { uploadDocument } from './actions'

const STATUS_LABEL: Record<string, string> = {
  ready: 'Ready to search',
  processing: 'Processing',
  failed: 'Failed',
}

const STATUS_DOT: Record<string, string> = {
  ready: 'bg-forest',
  processing: 'bg-slate',
  failed: 'bg-brick',
}

interface DocumentRow {
  id: string
  file_name: string
  doc_type: string | null
  status: string
  created_at: string
  ocr_page_count: number
}

export default async function ProjectVaultPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const supabase = await createClient()

  const { data: project } = await supabase.from('projects').select('id').eq('id', projectId).single()
  if (!project) notFound()

  const { data: links } = await supabase
    .from('project_documents')
    .select('created_at, documents(id, file_name, doc_type, status, created_at, ocr_page_count)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  const documents = ((links ?? []) as unknown as { documents: DocumentRow }[])
    .map((link) => link.documents)
    .filter(Boolean)

  const docCount = documents.length
  const readyCount = documents.filter((d) => d.status === 'ready').length
  const uploadToThisProject = uploadDocument.bind(null, projectId)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-widest text-slate">Vault</span>
        <h1 className="font-display text-3xl font-medium tracking-tight">This project&apos;s documents</h1>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 rounded-md border border-hairline px-4 py-3">
          <div className="font-mono text-2xl tabular-nums">{docCount}</div>
          <div className="text-xs text-slate">documents in this project</div>
        </div>
        <div className="flex-1 rounded-md border border-hairline px-4 py-3">
          <div className="font-mono text-2xl tabular-nums text-forest">{readyCount}</div>
          <div className="text-xs text-slate">ready to search</div>
        </div>
      </div>

      <form
        action={uploadToThisProject}
        className="flex flex-col items-center gap-2 rounded-md border border-dashed border-hairline px-6 py-8 text-center"
      >
        <p className="text-sm text-slate">Add a PDF or plain text file to this project.</p>
        <div className="flex items-center gap-2">
          <input
            type="file"
            name="file"
            accept=".pdf,.txt"
            required
            className="text-sm text-slate file:mr-3 file:rounded-md file:border file:border-hairline file:bg-paper file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:border-forest"
          />
          <button
            type="submit"
            className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-forest"
          >
            Upload
          </button>
        </div>
      </form>

      {docCount === 0 ? (
        <p className="text-sm text-slate">
          No documents yet. Upload your first file above to start building this project&apos;s vault.
        </p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-hairline">
              <th className="py-2 font-mono text-xs font-normal uppercase tracking-widest text-slate">File</th>
              <th className="py-2 font-mono text-xs font-normal uppercase tracking-widest text-slate">Status</th>
              <th className="py-2 font-mono text-xs font-normal uppercase tracking-widest text-slate">Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id} className="border-b border-hairline">
                <td className="py-3">
                  <span className="flex items-center gap-2">
                    {doc.file_name}
                    {doc.ocr_page_count > 0 && (
                      <span
                        className="rounded-full border border-wine/30 px-1.5 py-0.5 font-mono text-[10px] text-wine"
                        title={`This PDF had ${doc.ocr_page_count} image-only page${doc.ocr_page_count === 1 ? '' : 's'}, so the whole document was transcribed by AI. Double-check exact figures against the original.`}
                      >
                        AI-transcribed
                      </span>
                    )}
                  </span>
                </td>
                <td className="py-3">
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[doc.status] ?? 'bg-slate'}`}
                      aria-hidden="true"
                    />
                    {STATUS_LABEL[doc.status] ?? doc.status}
                  </span>
                </td>
                <td className="py-3 font-mono text-xs tabular-nums text-slate">
                  {new Date(doc.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Delete the old unscoped vault route**

```bash
git rm "src/app/(app)/vault/page.tsx" "src/app/(app)/vault/actions.ts"
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/projects/[projectId]/layout.tsx" "src/app/(app)/projects/[projectId]/vault"
git commit -m "Scope Vault to a project and remove the old unscoped route"
```

---

### Task 6: "Add to another project" linking

**Files:**
- Modify: `src/app/(app)/projects/[projectId]/vault/actions.ts` (add `linkDocumentToProject`)
- Modify: `src/app/(app)/projects/[projectId]/vault/page.tsx` (add other-projects lookup and per-row form)

**Interfaces:**
- Consumes: `projects`, `project_documents` (Task 1).
- Produces: `linkDocumentToProject(documentId, currentProjectId, formData)` — no other task depends on this; it's the terminal piece of the multi-project-document feature from the spec.

- [ ] **Step 1: Add the linking action**

Append to `src/app/(app)/projects/[projectId]/vault/actions.ts` (same file as Task 5's `uploadDocument`):

```typescript
export async function linkDocumentToProject(documentId: string, currentProjectId: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const targetProjectId = formData.get('targetProjectId')
  if (typeof targetProjectId !== 'string' || !targetProjectId) {
    throw new Error('Pick a project to add this document to')
  }

  const { error } = await supabase
    .from('project_documents')
    .insert({ project_id: targetProjectId, document_id: documentId })
  if (error) {
    console.error('Failed to link document to project:', error)
    throw new Error('Could not add this document to that project. Please try again.')
  }

  revalidatePath(`/projects/${currentProjectId}/vault`)
}
```

- [ ] **Step 2: Fetch other projects and existing links in the vault page**

In `src/app/(app)/projects/[projectId]/vault/page.tsx`, change the import line and add lookups right after the existing `documents` computation (after the `const documents = ...` block, before `const docCount = ...`):

```typescript
import { linkDocumentToProject, uploadDocument } from './actions'
```

```typescript
const { data: otherProjectRows } = await supabase.from('projects').select('id, name').neq('id', projectId)
const otherProjects = otherProjectRows ?? []

const documentIds = documents.map((d) => d.id)
const linkedProjectIdsByDoc = new Map<string, Set<string>>()
if (documentIds.length > 0) {
  const { data: existingLinks } = await supabase
    .from('project_documents')
    .select('document_id, project_id')
    .in('document_id', documentIds)
  for (const link of existingLinks ?? []) {
    const set = linkedProjectIdsByDoc.get(link.document_id) ?? new Set<string>()
    set.add(link.project_id)
    linkedProjectIdsByDoc.set(link.document_id, set)
  }
}
```

- [ ] **Step 3: Render the linking form per document row**

In the same file, inside the `<td className="py-3">` that renders `doc.file_name` (the first table cell), change it from a single-line `<span>` to a `<div>` wrapping both the existing file-name span and a new linking form:

```tsx
<td className="py-3">
  <div className="flex flex-col gap-1.5">
    <span className="flex items-center gap-2">
      {doc.file_name}
      {doc.ocr_page_count > 0 && (
        <span
          className="rounded-full border border-wine/30 px-1.5 py-0.5 font-mono text-[10px] text-wine"
          title={`This PDF had ${doc.ocr_page_count} image-only page${doc.ocr_page_count === 1 ? '' : 's'}, so the whole document was transcribed by AI. Double-check exact figures against the original.`}
        >
          AI-transcribed
        </span>
      )}
    </span>
    {(() => {
      const linkable = otherProjects.filter((p) => !linkedProjectIdsByDoc.get(doc.id)?.has(p.id))
      if (linkable.length === 0) return null
      return (
        <form action={linkDocumentToProject.bind(null, doc.id, projectId)} className="flex items-center gap-1.5">
          <select
            name="targetProjectId"
            className="rounded border border-hairline bg-paper px-1.5 py-0.5 text-xs text-ink"
          >
            {linkable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="font-mono text-[10px] uppercase tracking-widest text-wine transition-colors hover:text-brick"
          >
            + Add to project
          </button>
        </form>
      )
    })()}
  </div>
</td>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/projects/[projectId]/vault"
git commit -m "Let a document be linked into more than one project"
```

---

### Task 7: Scoped Chat + all-projects Chat

**Files:**
- Create: `src/components/chat-interface.tsx`
- Create: `src/app/(app)/projects/[projectId]/chat/page.tsx`
- Create: `src/app/(app)/projects/all/chat/page.tsx`
- Delete: `src/app/(app)/chat/page.tsx`

**Interfaces:**
- Consumes: `Citation` from `src/lib/citations.ts` (Task 2); `POST /api/chat` accepting `{ question, projectId? }` (Task 3).
- Produces: `ChatInterface({ projectId?, eyebrow, heading, emptyStateText })` client component, reused by both new chat pages.

- [ ] **Step 1: Extract the shared chat UI into a client component**

```tsx
// src/components/chat-interface.tsx
'use client'

import { useState } from 'react'
import type { Citation } from '@/lib/citations'

interface ChatTurn {
  question: string
  answer: string
  citations: Citation[]
}

interface ChatInterfaceProps {
  projectId?: string
  eyebrow: string
  heading: string
  emptyStateText: string
}

export function ChatInterface({ projectId, eyebrow, heading, emptyStateText }: ChatInterfaceProps) {
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
      body: JSON.stringify({ question: currentQuestion, projectId }),
    })
    const data = await response.json()
    setTurns((prev) => [
      ...prev,
      { question: currentQuestion, answer: data.answer ?? data.error, citations: data.citations ?? [] },
    ])
    setLoading(false)
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-widest text-slate">{eyebrow}</span>
        <h1 className="font-display text-3xl font-medium tracking-tight">{heading}</h1>
      </div>

      {turns.length === 0 ? (
        <p className="text-sm text-slate">{emptyStateText}</p>
      ) : (
        <div className="flex flex-col gap-8">
          {turns.map((turn, i) => (
            <div key={i} className="flex flex-col gap-3">
              <p className="font-display text-lg font-medium tracking-tight">{turn.question}</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{turn.answer}</p>
              {turn.citations.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {turn.citations.map((c) => (
                    <details
                      key={c.index}
                      className="group rounded-md border border-hairline px-2 py-1 open:bg-wine/5"
                    >
                      <summary className="flex cursor-pointer list-none items-center gap-1.5 font-mono text-xs text-wine marker:content-none">
                        <span className="rounded-full bg-wine px-1.5 text-paper">{c.index}</span>
                        {c.fileName}
                        {c.projectNames && c.projectNames.length > 0 && (
                          <span className="text-slate">({c.projectNames.join(', ')})</span>
                        )}
                      </summary>
                      <p className="mt-1.5 max-w-sm text-xs text-slate">&quot;{c.excerpt}&quot;</p>
                    </details>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="sticky bottom-6 flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question..."
          className="flex-1 rounded-md border border-hairline bg-paper px-3 py-2.5 text-sm text-ink shadow-sm outline-none transition-colors placeholder:text-slate/70 focus:border-forest focus:ring-2 focus:ring-forest/20"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-paper shadow-sm transition-colors hover:bg-forest disabled:opacity-50"
        >
          {loading ? 'Thinking...' : 'Ask'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Write the scoped chat page**

```tsx
// src/app/(app)/projects/[projectId]/chat/page.tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChatInterface } from '@/components/chat-interface'

export default async function ProjectChatPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const supabase = await createClient()
  const { data: project } = await supabase.from('projects').select('id, name').eq('id', projectId).single()
  if (!project) notFound()

  return (
    <ChatInterface
      projectId={project.id}
      eyebrow="Ask the Brain"
      heading={`Ask ${project.name}`}
      emptyStateText="Ask a question about this project's documents. Every answer cites the exact document and passage it came from."
    />
  )
}
```

- [ ] **Step 3: Write the all-projects chat page**

```tsx
// src/app/(app)/projects/all/chat/page.tsx
import Link from 'next/link'
import { ChatInterface } from '@/components/chat-interface'

export default function AllProjectsChatPage() {
  return (
    <>
      <div className="mx-auto max-w-3xl px-6 pt-6">
        <Link
          href="/projects"
          className="font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-ink"
        >
          ← All projects
        </Link>
      </div>
      <ChatInterface
        eyebrow="Ask the Brain — All Projects"
        heading="Ask across everything"
        emptyStateText="Ask a question across every project's documents. Each answer's citations show which project the source came from."
      />
    </>
  )
}
```

- [ ] **Step 4: Delete the old unscoped chat route**

```bash
git rm "src/app/(app)/chat/page.tsx"
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/chat-interface.tsx "src/app/(app)/projects/[projectId]/chat" "src/app/(app)/projects/all"
git commit -m "Scope Chat to a project and add an all-projects chat mode"
```

---

### Task 8: Update top nav and post-login redirect

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `/projects` (Task 4).
- Produces: nothing consumed by later tasks — this is the last routing piece that makes the new structure reachable from login.

- [ ] **Step 1: Simplify the top-level nav**

Replace the full contents of `src/app/(app)/layout.tsx`:

```tsx
// src/app/(app)/layout.tsx
import { signOut } from '@/app/actions'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b-2 border-hairline">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <a href="/projects" className="flex items-baseline gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-wine" aria-hidden="true" />
            <span className="font-display text-lg font-medium tracking-tight">cre-copilot</span>
          </a>
          <form action={signOut}>
            <button
              type="submit"
              className="font-mono text-xs uppercase tracking-widest text-slate transition-colors hover:text-brick"
            >
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </>
  )
}
```

(The per-project Vault/Ask the Brain tabs now live in `[projectId]/layout.tsx` from Task 5, so they're removed from here rather than duplicated.)

- [ ] **Step 2: Update the post-login redirect**

In `src/app/page.tsx`, change:

```typescript
if (user) {
  redirect('/vault')
}
```

to:

```typescript
if (user) {
  redirect('/projects')
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/layout.tsx" src/app/page.tsx
git commit -m "Point top nav and post-login redirect at the projects dashboard"
```

---

### Task 9: Security audit pass

**Files:** none created — this task reviews Tasks 1–8's changes (`supabase/migrations/0003_projects.sql`, `src/lib/citations.ts`, `src/app/api/chat/route.ts`, `src/app/(app)/projects/page.tsx`, `src/app/(app)/projects/actions.ts`, `src/app/(app)/projects/[projectId]/layout.tsx`, `src/app/(app)/projects/[projectId]/vault/page.tsx`, `src/app/(app)/projects/[projectId]/vault/actions.ts`, `src/app/(app)/projects/[projectId]/chat/page.tsx`, `src/app/(app)/projects/all/chat/page.tsx`, `src/components/chat-interface.tsx`, `src/app/(app)/layout.tsx`, `src/app/page.tsx`).

- [ ] **Step 1: Dispatch the security review**

Use the Agent tool with the "AI-Generated Code Security Auditor" agent type. Give it the list of changed files above and ask it to check specifically:
- Whether a user can view, search, or link another user's project or document through `project_documents`, the updated `match_document_chunks` function, or any new query in `projects/[projectId]/vault/actions.ts` (`uploadDocument`, `linkDocumentToProject`) — the RLS policies from Task 1 are supposed to be the only thing preventing this, so check they actually hold, not just that application code happens to behave.
- Whether `filter_project_id` in `match_document_chunks` can be used to bypass the existing `document_chunks.user_id = auth.uid()` check, rather than only narrowing within it.
- Whether the removed `/vault` and `/chat` routes leave anything reachable without going through the project-scoped ownership check in `[projectId]/layout.tsx` and each page's own `notFound()` guard.
- Whether `linkDocumentToProject`'s `with check` path (via the `project_documents` RLS policy) actually blocks linking a document you don't own into a project you do own, and vice versa.

- [ ] **Step 2: Address findings**

Fix anything the audit flags as a real issue. If a finding is a false positive or an accepted tradeoff, state why in the commit message rather than silently dismissing it.

- [ ] **Step 3: Re-run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Security pass on project workspaces: RLS and route-removal verification"
```

If Step 2 required no code changes, skip Steps 3–4 and just report the audit's clean result — don't create an empty commit.

---

### Task 10: End-to-end manual walkthrough

**Files:** none — this is verification only, following the standing rule to show evidence before claiming a UI feature works.

- [ ] **Step 1: Start the dev server and confirm the migrated data**

Run: `npm run dev`

In the browser, sign in and confirm you land on `/projects` with a "General" project already listed (from Task 1's backfill), containing the documents uploaded during earlier E2E testing.

- [ ] **Step 2: Create a project and upload a document**

Click "Create," name a project (e.g. "Test Deal"), confirm it redirects to that project's Vault, and upload a real PDF or text file. Confirm it reaches "Ready to search" status.

- [ ] **Step 3: Ask a scoped question**

Go to this project's Chat tab, ask a question the uploaded document can answer. Confirm the answer cites the document and the citation does NOT show a project name (single-project mode).

- [ ] **Step 4: Ask across everything**

Go back to `/projects`, click "Ask across everything," ask a question that could match documents in either "General" or "Test Deal." Confirm the citation now shows the project name in parentheses next to the file name.

- [ ] **Step 5: Link a document into a second project**

From "Test Deal"'s Vault, use the "+ Add to project" control on the uploaded document to link it into "General" as well. Confirm the page updates and the linking option for "General" disappears for that document (it's now linked to both).

- [ ] **Step 6: Confirm old routes and cross-project access are gone**

Navigate directly to `/vault` and `/chat` — confirm both 404 (routes were deleted in Tasks 5 and 7). Navigate to `/projects/00000000-0000-0000-0000-000000000000/vault` (a made-up id) — confirm it 404s via the `notFound()` guard rather than erroring or showing empty-but-valid content.

- [ ] **Step 7: Report results**

Summarize what was checked and any issues found. If everything passed, this plan is complete.

