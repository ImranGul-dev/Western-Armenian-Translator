-- Daily Practice Streak foundation.
--
-- Practice streaks are derived from the append-only vocabulary_review_events
-- history created by Flashcard ratings. No separate mutable streak counter is
-- stored, so current/longest streak values cannot drift away from the source
-- practice events.
--
-- A practice day is calculated in the user's supplied IANA time zone. The
-- backend will obtain that value from the browser and pass it to the service-
-- role-only function below.


-- ============================================================
-- Preserve historical practice events when Saved Phrases are deleted
-- ============================================================
--
-- Mastery is current state and may disappear when its Saved Phrase is deleted,
-- but historical practice activity must remain available for streaks and
-- future Practice Analytics. Keep user_id, deck/session/rating/scores/time while
-- allowing saved_phrase_id to become NULL after phrase deletion.

alter table public.vocabulary_review_events
  alter column saved_phrase_id drop not null;


alter table public.vocabulary_review_events
  drop constraint if exists vocabulary_review_events_phrase_owner_fk;


alter table public.vocabulary_review_events
  add constraint vocabulary_review_events_phrase_owner_fk
    foreign key (
      saved_phrase_id,
      user_id
    )
    references public.saved_phrases (
      id,
      user_id
    )
    on delete set null (saved_phrase_id);


-- ============================================================
-- Timezone-aware streak calculation
-- ============================================================
--
-- Current streak semantics:
--   * If the user practised today, count the consecutive run ending today.
--   * If the user has not practised today but did practise yesterday, the
--     streak remains alive and counts the consecutive run ending yesterday.
--   * If the most recent practice day is older than yesterday, current streak
--     is zero.
--
-- Any Flashcard rating counts as practice. Again/Hard/Good/Easy affect mastery
-- differently, but each rating represents a real study event.

create or replace function public.get_practice_streak(
  p_user_id uuid,
  p_timezone text default 'UTC'
)
returns table (
  current_streak integer,
  longest_streak integer,
  practiced_today boolean,
  last_practice_date date,
  today_review_count integer,
  total_practice_days integer
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_timezone text;
  v_today date;
  v_today_start timestamptz;
  v_tomorrow_start timestamptz;

  v_last_practice_date date;
  v_current_streak integer := 0;
  v_longest_streak integer := 0;
  v_today_review_count integer := 0;
  v_total_practice_days integer := 0;
begin
  if p_user_id is null then
    raise exception 'A user ID is required.'
      using errcode = '22023';
  end if;

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

  -- Convert local midnight boundaries back to timestamptz. This keeps today's
  -- review count correct across daylight-saving transitions.
  v_today_start :=
    v_today::timestamp
    at time zone v_timezone;

  v_tomorrow_start :=
    (
      v_today + 1
    )::timestamp
    at time zone v_timezone;


  select
    max(practice_date),
    count(*)::integer
  into
    v_last_practice_date,
    v_total_practice_days
  from (
    select distinct
      (
        reviewed_at
        at time zone v_timezone
      )::date as practice_date
    from public.vocabulary_review_events
    where user_id = p_user_id
  ) as practice_days;


  select
    count(*)::integer
  into
    v_today_review_count
  from public.vocabulary_review_events
  where user_id = p_user_id
    and reviewed_at >= v_today_start
    and reviewed_at < v_tomorrow_start;


  if v_total_practice_days > 0 then
    with practice_days as (
      select distinct
        (
          reviewed_at
          at time zone v_timezone
        )::date as practice_date
      from public.vocabulary_review_events
      where user_id = p_user_id
    ),
    numbered_days as (
      select
        practice_date,
        row_number() over (
          order by practice_date
        ) as day_number
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
      coalesce(
        max(streak_length),
        0
      )::integer,
      coalesce(
        max(streak_length) filter (
          where streak_end = v_last_practice_date
        ),
        0
      )::integer
    into
      v_longest_streak,
      v_current_streak
    from streaks;

    if v_last_practice_date <
      v_today - 1
    then
      v_current_streak := 0;
    end if;
  end if;


  return query
  select
    v_current_streak,
    v_longest_streak,
    v_today_review_count > 0,
    v_last_practice_date,
    v_today_review_count,
    v_total_practice_days;
end;
$$;


-- ============================================================
-- Least-privilege execution
-- ============================================================
--
-- The browser never calls this function directly. The authenticated Practice
-- Streak Edge Function will verify the user and plan, then call this RPC with
-- the service role and the authenticated user's ID.

revoke all
on function public.get_practice_streak(
  uuid,
  text
)
from public, anon, authenticated;


grant execute
on function public.get_practice_streak(
  uuid,
  text
)
to service_role;


comment on function public.get_practice_streak(
  uuid,
  text
) is
  'Returns timezone-aware current/longest Flashcard practice streak metrics derived from vocabulary review events.';
