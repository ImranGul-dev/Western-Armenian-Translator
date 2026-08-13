-- Fix guest daily quota RPC.
-- Uses the primary-key constraint directly to avoid PL/pgSQL
-- ambiguity between the returned usage_date field and table column.

create or replace function public.consume_guest_daily_translation(
  p_anonymous_client_hash text,
  p_limit integer default 5
)
returns table (
  allowed boolean,
  used integer,
  remaining integer,
  usage_date date
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_date date := (now() at time zone 'UTC')::date;
  v_count integer;
begin
  if p_anonymous_client_hash is null
     or char_length(btrim(p_anonymous_client_hash)) < 32 then
    raise exception 'Invalid anonymous client identifier';
  end if;

  if p_limit < 1 or p_limit > 1000 then
    raise exception 'Invalid guest translation limit';
  end if;

  insert into public.guest_daily_usage as g (
    anonymous_client_hash,
    usage_date,
    translation_count,
    updated_at
  )
  values (
    p_anonymous_client_hash,
    v_date,
    1,
    now()
  )
  on conflict on constraint guest_daily_usage_pkey
  do update
  set
    translation_count = g.translation_count + 1,
    updated_at = now()
  where g.translation_count < p_limit
  returning g.translation_count
  into v_count;

  if found then
    return query
    select
      true,
      v_count,
      greatest(p_limit - v_count, 0),
      v_date;

    return;
  end if;

  select g.translation_count
  into v_count
  from public.guest_daily_usage as g
  where g.anonymous_client_hash = p_anonymous_client_hash
    and g.usage_date = v_date;

  v_count := coalesce(
    v_count,
    p_limit
  );

  return query
  select
    false,
    v_count,
    greatest(p_limit - v_count, 0),
    v_date;
end;
$$;

revoke all
on function public.consume_guest_daily_translation(text, integer)
from public, anon, authenticated;

grant execute
on function public.consume_guest_daily_translation(text, integer)
to service_role;

-- Ensure PostgREST immediately sees the updated RPC.
notify pgrst, 'reload schema';