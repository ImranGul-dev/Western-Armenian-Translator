-- Guest translation quota and guest-user admin statistics.
--
-- Guests receive 5 completed translation slots per UTC day.
-- The quota is stored separately from analytics so enforcement is atomic
-- and does not depend on delayed/background usage-event writes.

create table if not exists public.guest_daily_usage (
  anonymous_client_hash text not null,
  usage_date date not null,
  translation_count integer not null default 0
    check (translation_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (anonymous_client_hash, usage_date)
);

comment on table public.guest_daily_usage is
  'Daily anonymous translation quota. Stores only a hashed anonymous client identifier; no source or translated text.';

create index if not exists guest_daily_usage_date_idx
  on public.guest_daily_usage (usage_date desc);

alter table public.guest_daily_usage
  enable row level security;


-- Atomically reserve one guest translation.
--
-- This avoids race conditions where two requests both see "4 of 5"
-- and both get accepted.
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

  insert into public.guest_daily_usage (
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
  on conflict (anonymous_client_hash, usage_date)
  do update
  set
    translation_count =
      public.guest_daily_usage.translation_count + 1,
    updated_at = now()
  where public.guest_daily_usage.translation_count < p_limit
  returning translation_count
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
  from public.guest_daily_usage g
  where g.anonymous_client_hash = p_anonymous_client_hash
    and g.usage_date = v_date;

  v_count := coalesce(v_count, p_limit);

  return query
  select
    false,
    v_count,
    greatest(p_limit - v_count, 0),
    v_date;
end;
$$;


-- Release a reserved translation if the translation request fails or
-- the browser cancels it while realtime translation is in progress.
create or replace function public.release_guest_daily_translation(
  p_anonymous_client_hash text
)
returns void
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
    return;
  end if;

  update public.guest_daily_usage
  set
    translation_count = greatest(translation_count - 1, 0),
    updated_at = now()
  where anonymous_client_hash = p_anonymous_client_hash
    and usage_date = v_date
  returning translation_count
  into v_count;

  if v_count = 0 then
    delete from public.guest_daily_usage
    where anonymous_client_hash = p_anonymous_client_hash
      and usage_date = v_date
      and translation_count = 0;
  end if;
end;
$$;


-- Update admin dashboard statistics.
--
-- Guest users are unique anonymous hashed clients that have consumed
-- at least one translation slot today.
create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_editor() then
    raise exception 'Not authorized';
  end if;

  select jsonb_build_object(
    'total_users',
      (
        select count(*)
        from public.profiles
      ),

    'active_users',
      (
        select count(*)
        from public.profiles
        where last_active_at >= now() - interval '30 days'
      ),

    'guest_users_today',
      (
        select count(*)
        from public.guest_daily_usage
        where usage_date = (now() at time zone 'UTC')::date
          and translation_count > 0
      ),

    'guest_translations_today',
      (
        select coalesce(sum(translation_count), 0)
        from public.guest_daily_usage
        where usage_date = (now() at time zone 'UTC')::date
      ),

    'translations_today',
      (
        select count(*)
        from public.usage_events
        where success
          and created_at >= date_trunc('day', now())
      ),

    'translations_month',
      (
        select count(*)
        from public.usage_events
        where success
          and created_at >= date_trunc('month', now())
      ),

    'characters_month',
      (
        select coalesce(sum(character_count), 0)
        from public.usage_events
        where success
          and created_at >= date_trunc('month', now())
      ),

    'failed_requests',
      (
        select count(*)
        from public.usage_events
        where not success
          and created_at >= date_trunc('month', now())
      ),

    'pending_corrections',
      (
        select count(*)
        from public.translation_feedback
        where status = 'pending'
      ),

    'pending_glossary',
      (
        select count(*)
        from public.glossary_terms
        where not approved
      ),

    'estimated_cost_usd',
      (
        select coalesce(sum(estimated_cost_usd), 0)
        from public.usage_events
        where created_at >= date_trunc('month', now())
      ),

    'most_used_directions',
      (
        select coalesce(jsonb_agg(x), '[]'::jsonb)
        from (
          select
            source_language || '→' || target_language as direction,
            count(*) as requests
          from public.usage_events
          where created_at >= date_trunc('month', now())
          group by 1
          order by 2 desc
          limit 5
        ) x
      )
  )
  into result;

  return result;
end;
$$;


-- Browser clients must never directly manipulate guest quota records.
revoke all on table public.guest_daily_usage
  from public, anon, authenticated;

revoke all on function public.consume_guest_daily_translation(text, integer)
  from public, anon, authenticated;

revoke all on function public.release_guest_daily_translation(text)
  from public, anon, authenticated;


-- Edge Function uses service_role for quota enforcement.
grant select, insert, update, delete
  on table public.guest_daily_usage
  to service_role;

grant execute
  on function public.consume_guest_daily_translation(text, integer)
  to service_role;

grant execute
  on function public.release_guest_daily_translation(text)
  to service_role;


-- Admin dashboard remains available to authenticated users;
-- the function itself checks editor/admin authorization.
grant execute
  on function public.admin_dashboard_stats()
  to authenticated;