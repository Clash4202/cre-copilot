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
