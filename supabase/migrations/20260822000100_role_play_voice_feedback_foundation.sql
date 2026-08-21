-- AI Voice Practice: five-day feedback foundation
--
-- Client requirement:
-- - When a paid learner practises with the AI Voice Bot for 5 days in a row,
--   offer a personalised feedback report.
-- - The report can recommend a live Tun tutor and link to the tutoring page.
--
-- A qualifying practice day is a calendar day where the authenticated learner
-- submitted at least one USER voice turn in Role-Play. Text-only Role-Play does
-- not count toward this voice-practice streak.
--
-- The streak is derived from role_play_turns + role_play_sessions rather than a
-- mutable counter so the value cannot drift away from the real practice data.


-- ============================================================
-- Stored personalised feedback reports
-- ============================================================

create table if not exists public.role_play_voice_feedback_reports (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  -- One report is generated for each uninterrupted voice-practice streak once
  -- that streak reaches the five-day milestone. The same continuing streak does
  -- not generate a new report every day.
  streak_start_date date not null,
  streak_end_date date not null,

  voice_practice_days integer not null
    check (voice_practice_days >= 5),

  source_turn_count integer not null default 0
    check (source_turn_count >= 0),

  plan_slug text not null default 'premium'
    check (plan_slug in ('premium', 'business', 'admin')),

  report_summary text not null default '',

  strengths jsonb not null default '[]'::jsonb
    check (jsonb_typeof(strengths) = 'array'),

  focus_areas jsonb not null default '[]'::jsonb
    check (jsonb_typeof(focus_areas) = 'array'),

  -- Important: current Voice Input stores transcripts, not reusable audio.
  -- The report generator must not invent exact sound-level mistakes from text
  -- alone. This field is for careful, evidence-based pronunciation guidance.
  pronunciation_guidance text not null default '',

  tutor_recommendation text not null default '',

  tutoring_url text not null
    default 'https://tunapp.com/western-armenian-tutoring',

  model text,

  generated_at timestamptz not null default now(),
  viewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint role_play_voice_feedback_report_dates
    check (streak_end_date >= streak_start_date),

  unique (user_id, streak_start_date)
);


create index if not exists
  role_play_voice_feedback_reports_user_idx
on public.role_play_voice_feedback_reports (
  user_id,
  generated_at desc
);


drop trigger if exists
  role_play_voice_feedback_reports_updated_at
on public.role_play_voice_feedback_reports;

create trigger
  role_play_voice_feedback_reports_updated_at
before update
on public.role_play_voice_feedback_reports
for each row
execute function public.set_updated_at();


alter table public.role_play_voice_feedback_reports
  enable row level security;

revoke all
on table public.role_play_voice_feedback_reports
from public, anon, authenticated;

grant all
on table public.role_play_voice_feedback_reports
to service_role;


-- ============================================================
-- Timezone-aware AI Voice practice streak
-- ============================================================

create or replace function public.get_role_play_voice_streak(
  p_user_id uuid,
  p_timezone text default 'UTC'
)
returns table (
  current_voice_streak integer,
  longest_voice_streak integer,
  practiced_today boolean,
  last_voice_practice_date date,
  total_voice_practice_days integer,
  eligible_for_feedback boolean,
  streak_start_date date
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_timezone text;
  v_today date;
  v_last_practice_date date;
  v_current_streak integer := 0;
  v_longest_streak integer := 0;
  v_total_practice_days integer := 0;
  v_streak_start_date date;
begin
  if p_user_id is null then
    raise exception 'A user ID is required.'
      using errcode = '22023';
  end if;

  v_timezone := btrim(coalesce(p_timezone, 'UTC'));

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
    (current_timestamp at time zone v_timezone)::date;

  select
    max(practice_date),
    count(*)::integer
  into
    v_last_practice_date,
    v_total_practice_days
  from (
    select distinct
      (turns.created_at at time zone v_timezone)::date as practice_date
    from public.role_play_turns as turns
    join public.role_play_sessions as sessions
      on sessions.id = turns.session_id
    where sessions.user_id = p_user_id
      and turns.speaker = 'user'
      and turns.modality = 'voice'
  ) as practice_days;

  if v_total_practice_days > 0 then
    with practice_days as (
      select distinct
        (turns.created_at at time zone v_timezone)::date as practice_date
      from public.role_play_turns as turns
      join public.role_play_sessions as sessions
        on sessions.id = turns.session_id
      where sessions.user_id = p_user_id
        and turns.speaker = 'user'
        and turns.modality = 'voice'
    ),
    numbered_days as (
      select
        practice_date,
        row_number() over (order by practice_date) as day_number
      from practice_days
    ),
    streak_islands as (
      select
        practice_date,
        practice_date - day_number::integer as island_key
      from numbered_days
    ),
    streaks as (
      select
        min(practice_date) as streak_start,
        max(practice_date) as streak_end,
        count(*)::integer as streak_length
      from streak_islands
      group by island_key
    )
    select
      coalesce(max(streak_length), 0)::integer,
      coalesce(
        max(streak_length) filter (
          where streak_end = v_last_practice_date
        ),
        0
      )::integer,
      max(streak_start) filter (
        where streak_end = v_last_practice_date
      )
    into
      v_longest_streak,
      v_current_streak,
      v_streak_start_date
    from streaks;

    -- Keep a streak alive through the following day, matching the existing
    -- Flashcard streak behaviour. It becomes zero only after a full day is
    -- missed.
    if v_last_practice_date < v_today - 1 then
      v_current_streak := 0;
      v_streak_start_date := null;
    end if;
  end if;

  return query
  select
    v_current_streak,
    v_longest_streak,
    v_last_practice_date = v_today,
    v_last_practice_date,
    v_total_practice_days,
    v_current_streak >= 5,
    case
      when v_current_streak >= 1
        then v_streak_start_date
      else null
    end;
end;
$$;


revoke all
on function public.get_role_play_voice_streak(uuid, text)
from public, anon, authenticated;

grant execute
on function public.get_role_play_voice_streak(uuid, text)
to service_role;


comment on function public.get_role_play_voice_streak(uuid, text) is
  'Returns a timezone-aware streak derived only from authenticated user voice turns in Role-Play. Five consecutive voice-practice days make the learner eligible for a personalised feedback report.';

comment on table public.role_play_voice_feedback_reports is
  'Stores one personalised AI Voice practice feedback report per uninterrupted qualifying voice-practice streak.';
