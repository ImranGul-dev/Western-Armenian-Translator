-- Daily Practice Phrase CMS foundation.
--
-- Supports:
-- - One canonical Western Armenian practice phrase per calendar date.
-- - Admin create/edit/publish/unpublish/archive workflows.
-- - Timezone-aware learner lookup for "today".
-- - Service-role-only table access; browser clients do not query the CMS table
--   directly.

create table if not exists public.daily_practice_phrases (
  id uuid primary key default gen_random_uuid(),

  practice_date date not null unique,

  western_armenian_text text not null
    check (
      char_length(btrim(western_armenian_text))
        between 1 and 500
    ),

  english_text text not null
    check (
      char_length(btrim(english_text))
        between 1 and 500
    ),

  category text not null default 'everyday'
    check (
      char_length(btrim(category))
        between 1 and 60
    ),

  difficulty text not null default 'beginner'
    check (
      difficulty in (
        'beginner',
        'intermediate',
        'advanced'
      )
    ),

  teaching_note text not null default ''
    check (
      char_length(teaching_note) <= 1200
    ),

  published boolean not null default false,

  published_at timestamptz,

  archived_at timestamptz,

  created_by uuid
    references auth.users(id)
    on delete set null,

  updated_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  constraint daily_practice_phrases_archive_state_check
    check (
      archived_at is null
      or published = false
    )
);


-- The unique practice_date constraint is the source of truth for the CMS:
-- there can never be two competing phrases for the same learner day.
-- The Edge Function can surface PostgreSQL 23505 as a clear admin conflict.

create index if not exists
  daily_practice_phrases_admin_order_idx
on public.daily_practice_phrases (
  practice_date desc,
  created_at desc
);


-- Reuse the project's shared updated_at trigger.

drop trigger if exists
  daily_practice_phrases_updated_at
on public.daily_practice_phrases;

create trigger
  daily_practice_phrases_updated_at
before update
on public.daily_practice_phrases
for each row
execute function public.set_updated_at();


-- Browser clients do not access the CMS table directly. A dedicated Edge
-- Function will authenticate the user, verify admin access for CMS actions,
-- and use the service role for database reads/writes.

alter table public.daily_practice_phrases
  enable row level security;

revoke all
on table public.daily_practice_phrases
from anon, authenticated;

grant all
on table public.daily_practice_phrases
to service_role;


-- Timezone-aware lookup for the learner-facing "today" card.
-- This follows the same IANA timezone validation approach as Practice Streak.

create or replace function public.get_daily_practice_phrase(
  p_timezone text default 'UTC'
)
returns table (
  id uuid,
  practice_date date,
  western_armenian_text text,
  english_text text,
  category text,
  difficulty text,
  teaching_note text,
  published_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_timezone text;
  v_today date;
begin
  v_timezone := btrim(
    coalesce(
      p_timezone,
      'UTC'
    )
  );

  if v_timezone = '' then
    v_timezone := 'UTC';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = v_timezone
  ) then
    raise exception 'The supplied time zone is not recognized.'
      using errcode = '22023';
  end if;

  v_today :=
    (
      current_timestamp
      at time zone v_timezone
    )::date;

  return query
  select
    phrase.id,
    phrase.practice_date,
    phrase.western_armenian_text,
    phrase.english_text,
    phrase.category,
    phrase.difficulty,
    phrase.teaching_note,
    phrase.published_at
  from public.daily_practice_phrases as phrase
  where phrase.practice_date = v_today
    and phrase.published = true
    and phrase.archived_at is null
  limit 1;
end;
$$;


revoke all
on function public.get_daily_practice_phrase(text)
from public, anon, authenticated;

grant execute
on function public.get_daily_practice_phrase(text)
to service_role;


comment on table public.daily_practice_phrases is
  'Admin-managed Western Armenian practice phrases scheduled one per calendar date.';

comment on function public.get_daily_practice_phrase(text) is
  'Returns the published Daily Practice Phrase for the caller-supplied IANA timezone current date.';
