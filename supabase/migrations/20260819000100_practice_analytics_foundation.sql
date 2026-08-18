-- Practice Analytics foundation.
--
-- Analytics are derived from public.vocabulary_review_events, the same
-- append-only source of truth used by Vocabulary Mastery and Daily Practice
-- Streak. No separate analytics counters or summary tables are stored.
--
-- The caller supplies an IANA time zone so review events are grouped into the
-- learner's local calendar days. The first supported reporting windows are
-- intentionally limited to 7, 30 and 90 days.


create or replace function public.get_practice_analytics(
  p_user_id uuid,
  p_timezone text default 'UTC',
  p_days integer default 30
)
returns table (
  period_days integer,
  period_start_date date,
  period_end_date date,
  total_reviews integer,
  practice_days integer,
  practice_sessions integer,
  recall_rate numeric(5, 2),
  average_mastery_change numeric(6, 2),
  again_count integer,
  hard_count integer,
  good_count integer,
  easy_count integer,
  daily_activity jsonb
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_timezone text;
  v_today date;
  v_start_date date;
  v_period_start timestamptz;
  v_period_end timestamptz;
begin
  if p_user_id is null then
    raise exception 'A user ID is required.'
      using errcode = '22023';
  end if;

  if p_days not in (
    7,
    30,
    90
  ) then
    raise exception 'Practice Analytics supports 7, 30 or 90 day periods.'
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

  v_start_date :=
    v_today -
    (
      p_days - 1
    );

  -- Convert local midnight boundaries back to timestamptz. Using local day
  -- boundaries instead of fixed UTC offsets keeps the selected reporting
  -- period correct across daylight-saving transitions.
  v_period_start :=
    v_start_date::timestamp
    at time zone v_timezone;

  v_period_end :=
    (
      v_today + 1
    )::timestamp
    at time zone v_timezone;


  return query
  with period_events as (
    select
      event.rating,
      event.session_id,
      event.previous_mastery_score,
      event.resulting_mastery_score,
      (
        event.reviewed_at
        at time zone v_timezone
      )::date as practice_date
    from public.vocabulary_review_events as event
    where event.user_id = p_user_id
      and event.reviewed_at >= v_period_start
      and event.reviewed_at < v_period_end
  ),
  summary as (
    select
      count(*)::integer as total_reviews,

      count(
        distinct practice_date
      )::integer as practice_days,

      count(
        distinct session_id
      )::integer as practice_sessions,

      coalesce(
        round(
          100.0 *
          count(*) filter (
            where rating in (
              'hard',
              'good',
              'easy'
            )
          ) /
          nullif(
            count(*),
            0
          ),
          2
        ),
        0
      )::numeric(5, 2) as recall_rate,

      coalesce(
        round(
          avg(
            resulting_mastery_score -
            previous_mastery_score
          ),
          2
        ),
        0
      )::numeric(6, 2) as average_mastery_change,

      count(*) filter (
        where rating = 'again'
      )::integer as again_count,

      count(*) filter (
        where rating = 'hard'
      )::integer as hard_count,

      count(*) filter (
        where rating = 'good'
      )::integer as good_count,

      count(*) filter (
        where rating = 'easy'
      )::integer as easy_count
    from period_events
  ),
  daily_counts as (
    select
      practice_date,
      count(*)::integer as review_count
    from period_events
    group by practice_date
  ),
  calendar_days as (
    select
      (
        v_start_date +
        series.day_offset
      )::date as practice_date
    from pg_catalog.generate_series(
      0,
      p_days - 1
    ) as series(day_offset)
  ),
  activity as (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'date',
            to_char(
              calendar.practice_date,
              'YYYY-MM-DD'
            ),
            'reviews',
            coalesce(
              daily.review_count,
              0
            )
          )
          order by calendar.practice_date
        ),
        '[]'::jsonb
      ) as daily_activity
    from calendar_days as calendar
    left join daily_counts as daily
      on daily.practice_date =
        calendar.practice_date
  )
  select
    p_days,
    v_start_date,
    v_today,
    summary.total_reviews,
    summary.practice_days,
    summary.practice_sessions,
    summary.recall_rate,
    summary.average_mastery_change,
    summary.again_count,
    summary.hard_count,
    summary.good_count,
    summary.easy_count,
    activity.daily_activity
  from summary
  cross join activity;
end;
$$;


-- ============================================================
-- Least-privilege execution
-- ============================================================
--
-- The browser does not query vocabulary_review_events or this function
-- directly. The authenticated Practice Analytics Edge Function will verify the
-- account and paid entitlement, then invoke this RPC with the service role.

revoke all
on function public.get_practice_analytics(
  uuid,
  text,
  integer
)
from public, anon, authenticated;


grant execute
on function public.get_practice_analytics(
  uuid,
  text,
  integer
)
to service_role;


comment on function public.get_practice_analytics(
  uuid,
  text,
  integer
) is
  'Returns timezone-aware 7/30/90-day Flashcard practice analytics derived from vocabulary review events. Recall rate is the percentage of reviews rated Hard, Good or Easy rather than Again.';
