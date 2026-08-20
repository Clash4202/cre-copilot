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
