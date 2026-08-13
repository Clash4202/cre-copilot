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
