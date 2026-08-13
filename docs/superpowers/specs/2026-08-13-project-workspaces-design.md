# Project workspaces — design

## Problem

Today every document a user uploads lives in one flat pile (`documents.user_id`), and both Vault and Chat always operate over everything that user owns. There's no way to focus on a single deal's documents, and no way to group documents by deal at all. Clayton wants to organize work by project ("123 Main St," "Hilco Capstone") — focus the AI on one project's documents, or deliberately widen to a "macro" view across everything.

This is the first of three planned subsystems (project workspaces, then Excel/BOV template automation, then team/company collaboration). It's sequenced first because it introduces the "project" concept the other two will build on, and because it's the smallest change relative to the app that already exists and has been validated with a real document and a real answer.

## Approach

Add `projects` as a first-class entity, and a many-to-many link between documents and projects (a document can be relevant to more than one deal, e.g. a submarket report). Reuse the existing single-user RLS pattern — a project is owned by exactly one user, same as documents are today. Team/shared ownership is explicitly out of scope here (that's subsystem 3).

Restructure navigation around projects as workspaces: a `/projects` dashboard is the new home screen; each project gets its own Vault and Chat, scoped to that project's documents only. A separate "all projects" chat mode, reached from the dashboard, searches everything the user owns — this reuses the existing chat UI and API route with a scope flag rather than being a new feature.

## Data model

New migration, `supabase/migrations/0003_projects.sql`:

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
```

`documents` and `document_chunks` are unchanged — a document's ownership is still tracked the same way it is today; `project_documents` is purely a link table.

## Retrieval change

`match_document_chunks` (the Postgres function chat search calls) gets an optional `project_id` parameter:

```sql
create or replace function match_document_chunks (
  query_embedding vector(1024),
  match_count int default 8,
  filter_project_id uuid default null
)
returns table (id uuid, document_id uuid, content text, similarity float)
language sql stable
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
```

`src/app/api/chat/route.ts` accepts an optional `projectId` in its request body and passes it through as `filter_project_id`. When omitted, behavior is exactly today's "search everything I own" — that's the "all projects" mode, no separate code path needed.

**Citations in "all projects" mode:** the route already looks up `file_name` for each matched document's id. It additionally looks up which project(s) each document belongs to (via `project_documents`) and includes a `projectNames` field on each citation, so an all-projects answer can show "from *Rent Roll.pdf* (123 Main St)" instead of just the file name. In single-project mode this is redundant (the user already knows which project they're in) and is omitted.

## Navigation / routes

- `/projects` — new dashboard, replaces today's implicit "go straight to Vault" flow as the landing page after login. Lists the user's projects (name, document count), a "New Project" button (name only — no other fields, matching Clayton's call to keep project creation minimal for v1), and an "Ask across everything" link into all-projects chat.
- `/projects/[projectId]/vault` — today's Vault page, scoped: uploads here link the new document to this project automatically (insert into `project_documents` right after the existing document insert). Document list here shows only documents linked to this project.
- `/projects/[projectId]/chat` — today's Chat page, scoped: passes this project's id as `projectId` in chat requests.
- `/projects/all/chat` — the all-projects chat: same Chat UI component, no `projectId` sent. (`all` is a safe, non-colliding route segment here since real project ids are UUIDs and can never literally be the string "all".)
- Existing `/vault` and `/chat` routes are removed in favor of the scoped equivalents (no reason to keep an ambiguous unscoped Vault around once projects exist).

**Linking a document into a second project:** from a project's Vault document list, an "Add to another project" action opens a picker of the user's other projects and inserts the corresponding `project_documents` row. No new document upload or duplicate storage — same file, just linked into more than one project.

## Migration (existing data)

Part of the same `0003_projects.sql` migration, as a data-migration step run once at deploy time:

```sql
insert into projects (user_id, name)
select distinct user_id, 'General' from documents
on conflict do nothing;

insert into project_documents (project_id, document_id)
select p.id, d.id
from documents d
join projects p on p.user_id = d.user_id and p.name = 'General';
```

This runs once, at migration time, not as ongoing app logic — every user with existing documents (today, just Clayton's test account) gets a "General" project containing everything they'd already uploaded, so nothing is lost or orphaned when this ships.

## Error handling

Same pattern as the rest of the app: Supabase/RLS already prevents a user from linking a project to someone else's document (the `with check` clause verifies both the project and the document belong to `auth.uid()`). The "Add to another project" action surfaces a clear error if the insert is rejected. Deleting a project cascades to `project_documents` only (via `on delete cascade`) — the underlying documents and their chunks are untouched, so a document linked to two projects survives deletion of one of them; a document only ever linked to the deleted project becomes unlinked (still visible via "all projects" chat, not lost).

## Testing

- `project_documents` RLS policy: covered by a migration-level test following the existing pattern used for `documents`/`document_chunks` policies, if one exists; otherwise a manual RLS check during implementation (attempt cross-user link, confirm rejection).
- `match_document_chunks` project filter: since this is a SQL function, verified via a direct Supabase call in a test/dev script rather than a unit test (matches how the existing function is exercised today).
- Chat route's `projectId` handling and citation `projectNames` enrichment: unit-testable the same way `src/app/api/chat/route.ts` — check for existing test coverage patterns during implementation and follow them.
- Migration data-migration step: run against a copy of the real dev database first, confirm document counts match before/after, before running on the real one.

## Security

Per the standing "security review at every major milestone" rule: this change touches RLS (new tables, new policies) and the one shared SQL function every chat request goes through, so it gets the same dedicated security-audit pass used for prior features (OCR, v1) — checking specifically that:
- A user cannot link, view, or search another user's project or document via the new `project_documents` table or the updated `match_document_chunks` function.
- The `filter_project_id` parameter can't be used to bypass the existing `document_chunks.user_id = auth.uid()` check (it's an *additional* filter, never a replacement).
- Removing the old unscoped `/vault` and `/chat` routes doesn't leave a stale route or cached link reachable without going through project-scoped auth checks.

## Out of scope (deliberately deferred)

- Renaming or deleting projects from the UI (schema supports it; UI can follow once the core flow is validated).
- Any project metadata beyond a name (property address, deal stage, etc.) — add later if actually needed.
- Excel/BOV template automation and team/company collaboration — separate specs, sequenced after this one.
