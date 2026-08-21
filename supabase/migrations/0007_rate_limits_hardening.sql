-- Hardening pass on check_rate_limit, from the final whole-branch review of the ai-spend-rate-limiting
-- feature. The 3-argument version in 0006_rate_limits.sql trusted caller-supplied p_limit and
-- p_window_seconds, and the DELETE that pruned old rows was the only thing keeping the COUNT
-- accurate (the count itself had no time predicate of its own). That meant pruning WAS the
-- enforcement mechanism, and it was caller-controlled: any signed-in user could call the RPC
-- directly with the public anon key and their own session, pass p_window_seconds: 0, and empty
-- their own bucket immediately before every real request, making every limit unenforceable.
--
-- The fix moves the limit and window into this function, so nothing the caller supplies affects
-- enforcement any more. See docs/superpowers/specs/2026-08-20-ai-spend-rate-limiting-design.md.
--
-- 0006_rate_limits.sql has already been applied to the live production database and is left
-- untouched; this migration only replaces the function.

-- Postgres treats a different argument list as a different function. Without this explicit drop,
-- the create below would define a new 1-argument function alongside the old 3-argument one, and the
-- old vulnerable version would stay callable, leaving the hole open.
drop function if exists check_rate_limit(text, int, int);

create or replace function check_rate_limit(p_action text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
  v_count int;
  v_limit int;
  v_window_seconds int;
begin
  if auth.uid() is null then
    return false;
  end if;

  -- auth.uid() must stay the SUFFIX of the bucket key, never the prefix or anywhere p_action could
  -- reach it. p_action is restricted below to five fixed literals, but if a future edit ever widens
  -- that, a caller-supplied action string placed before the uid could be crafted to land in another
  -- user's bucket. Keeping uid last means the key can only ever address the caller's own bucket.
  v_key := p_action || ':' || auth.uid()::text;

  -- Serializes concurrent requests for the same bucket. Under READ COMMITTED, without this lock, N
  -- concurrent requests for the same key can each see the same count and all pass, overshooting the
  -- limit by up to N requests; on the ocr bucket each excess call is roughly 64k Claude tokens.
  perform pg_advisory_xact_lock(hashtext(v_key));

  -- The limit and window live here, in SQL, rather than being accepted as arguments, so nothing the
  -- caller supplies affects enforcement. This is the single source of truth; src/lib/rate-limit.ts
  -- no longer keeps a second copy of these numbers. An action name outside this list is refused
  -- rather than silently creating a new, never-pruned bucket key that a direct caller could grow
  -- without bound.
  case p_action
    when 'inbox_stage' then
      v_limit := 30;
      v_window_seconds := 3600;
    when 'ingest' then
      v_limit := 20;
      v_window_seconds := 3600;
    when 'ocr' then
      v_limit := 10;
      v_window_seconds := 3600;
    when 'template_analyze' then
      v_limit := 10;
      v_window_seconds := 3600;
    when 'chat' then
      v_limit := 20;
      v_window_seconds := 300;
    else
      return false;
  end case;

  -- Housekeeping only. Based solely on this function's own v_window_seconds, never on caller input,
  -- so pruning can no longer be used to reset the count early. Correctness of the check below does
  -- not depend on this delete having run.
  delete from rate_limit_events
    where bucket_key = v_key
      and created_at < now() - make_interval(secs => v_window_seconds);

  -- Own time predicate, independent of the delete above. This is what closes the Finding 1 hole:
  -- there is no caller-supplied value that reaches this WHERE clause or the delete's WHERE clause,
  -- so a direct RPC call cannot empty or inflate the count.
  select count(*) into v_count
    from rate_limit_events
    where bucket_key = v_key
      and created_at >= now() - make_interval(secs => v_window_seconds);

  if v_count >= v_limit then
    return false;
  end if;

  insert into rate_limit_events (bucket_key) values (v_key);
  return true;
end;
$$;
