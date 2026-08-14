create table templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  asset_type text not null,
  storage_path text not null,
  mapping jsonb,
  mapping_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table generated_models (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  template_id uuid not null references templates(id),
  t12_document_id uuid references documents(id),
  rent_roll_document_id uuid references documents(id),
  storage_path text not null,
  assumptions jsonb not null default '{}',
  summary jsonb not null default '{}',
  gaps jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table documents add column detected_kind text;

alter table templates enable row level security;
alter table generated_models enable row level security;

create policy "Users manage their own templates"
  on templates for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own generated models"
  on generated_models for all
  using (
    auth.uid() = (select user_id from projects where id = project_id)
  )
  with check (
    auth.uid() = (select user_id from projects where id = project_id)
    and template_id in (select id from templates where user_id = auth.uid())
  );

insert into storage.buckets (id, name, public)
values
  ('templates', 'templates', false),
  ('generated-models', 'generated-models', false)
on conflict (id) do nothing;

create policy "Users upload templates to their own folder"
  on storage.objects for insert
  with check (bucket_id = 'templates' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users read their own templates"
  on storage.objects for select
  using (bucket_id = 'templates' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users upload generated models to their own folder"
  on storage.objects for insert
  with check (bucket_id = 'generated-models' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users read their own generated models"
  on storage.objects for select
  using (bucket_id = 'generated-models' and (storage.foldername(name))[1] = auth.uid()::text);
