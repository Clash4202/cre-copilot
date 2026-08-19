create table libraries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table library_sections (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references libraries(id) on delete cascade,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

alter table templates add column section_id uuid references library_sections(id);

create table bov_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  section_id uuid references library_sections(id),
  name text not null,
  storage_path text not null,
  mapping jsonb,
  mapping_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table generated_bovs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  bov_template_id uuid not null references bov_templates(id),
  source_document_ids uuid[] not null default '{}',
  storage_path text not null,
  gaps jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table inbox_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  detected_type text not null,
  proposal jsonb not null default '{}',
  status text not null default 'pending_review',
  created_at timestamptz not null default now()
);

alter table libraries enable row level security;
alter table library_sections enable row level security;
alter table bov_templates enable row level security;
alter table generated_bovs enable row level security;
alter table inbox_items enable row level security;

create policy "Users manage their own libraries"
  on libraries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own library sections"
  on library_sections for all
  using (auth.uid() = (select user_id from libraries where id = library_id))
  with check (auth.uid() = (select user_id from libraries where id = library_id));

create policy "Users manage their own bov templates"
  on bov_templates for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own generated bovs"
  on generated_bovs for all
  using (
    auth.uid() = (select user_id from projects where id = project_id)
  )
  with check (
    auth.uid() = (select user_id from projects where id = project_id)
    and bov_template_id in (select id from bov_templates where user_id = auth.uid())
  );

create policy "Users manage their own inbox items"
  on inbox_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values
  ('inbox', 'inbox', false),
  ('bov-templates', 'bov-templates', false),
  ('generated-bovs', 'generated-bovs', false)
on conflict (id) do nothing;

create policy "Users upload to their own inbox folder"
  on storage.objects for insert
  with check (bucket_id = 'inbox' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users read their own inbox folder"
  on storage.objects for select
  using (bucket_id = 'inbox' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users delete their own inbox folder"
  on storage.objects for delete
  using (bucket_id = 'inbox' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users upload bov templates to their own folder"
  on storage.objects for insert
  with check (bucket_id = 'bov-templates' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users read their own bov templates"
  on storage.objects for select
  using (bucket_id = 'bov-templates' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users upload generated bovs to their own folder"
  on storage.objects for insert
  with check (bucket_id = 'generated-bovs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users read their own generated bovs"
  on storage.objects for select
  using (bucket_id = 'generated-bovs' and (storage.foldername(name))[1] = auth.uid()::text);

-- One-time backfill: templates uploaded before this migration (flat list, no section) move into
-- a "Templates" library, "Unsorted" section per user, so nothing already uploaded is orphaned.
insert into libraries (user_id, name)
select distinct user_id, 'Templates' from templates
where not exists (
  select 1 from libraries l where l.user_id = templates.user_id and l.name = 'Templates'
);

insert into library_sections (library_id, name, description)
select l.id, 'Unsorted', 'Templates uploaded before the library system existed.'
from libraries l
where l.name = 'Templates'
  and exists (select 1 from templates t where t.user_id = l.user_id and t.section_id is null)
  and not exists (
    select 1 from library_sections s where s.library_id = l.id and s.name = 'Unsorted'
  );

update templates
set section_id = (
  select s.id
  from library_sections s
  join libraries l on l.id = s.library_id
  where l.user_id = templates.user_id and l.name = 'Templates' and s.name = 'Unsorted'
)
where section_id is null;
