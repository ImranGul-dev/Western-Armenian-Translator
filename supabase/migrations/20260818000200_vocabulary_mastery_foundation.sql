-- Vocabulary Mastery Scores foundation.
--
-- Mastery belongs to a Saved Phrase, not to a Vocabulary Deck. Decks remain
-- membership-only containers while public.saved_phrases remains the canonical
-- learning item.
--
-- Every Flashcard rating creates an append-only review event and updates the
-- one current mastery row for that user + Saved Phrase inside one database
-- transaction.
--
-- Direct browser access is intentionally closed. The Flashcards Edge Function
-- will call public.record_vocabulary_review() with the service role after it
-- authenticates the user and verifies paid access.


-- ============================================================
-- Current per-phrase mastery state
-- ============================================================

create table if not exists public.vocabulary_mastery (
  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  saved_phrase_id uuid not null,

  mastery_score smallint not null
    default 0,

  review_count integer not null
    default 0,

  successful_review_count integer not null
    default 0,

  current_recall_streak integer not null
    default 0,

  last_rating text,

  last_reviewed_at timestamptz,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  constraint vocabulary_mastery_primary
    primary key (
      user_id,
      saved_phrase_id
    ),

  constraint vocabulary_mastery_phrase_owner_fk
    foreign key (
      saved_phrase_id,
      user_id
    )
    references public.saved_phrases (
      id,
      user_id
    )
    on delete cascade,

  constraint vocabulary_mastery_score_range
    check (
      mastery_score between 0 and 100
    ),

  constraint vocabulary_mastery_review_count_valid
    check (
      review_count >= 0
    ),

  constraint vocabulary_mastery_success_count_valid
    check (
      successful_review_count >= 0
      and successful_review_count <= review_count
    ),

  constraint vocabulary_mastery_recall_streak_valid
    check (
      current_recall_streak >= 0
      and current_recall_streak <= successful_review_count
    ),

  constraint vocabulary_mastery_last_rating_valid
    check (
      last_rating is null
      or last_rating in (
        'again',
        'hard',
        'good',
        'easy'
      )
    )
);


create index if not exists
  vocabulary_mastery_user_score_idx
on public.vocabulary_mastery (
  user_id,
  mastery_score desc,
  last_reviewed_at desc nulls last
);


create index if not exists
  vocabulary_mastery_phrase_idx
on public.vocabulary_mastery (
  saved_phrase_id,
  user_id
);


create or replace function
  public.set_vocabulary_mastery_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


drop trigger if exists
  vocabulary_mastery_updated_at
on public.vocabulary_mastery;


create trigger
  vocabulary_mastery_updated_at
before update
on public.vocabulary_mastery
for each row
execute function
  public.set_vocabulary_mastery_updated_at();


-- ============================================================
-- Append-only review events
-- ============================================================

create table if not exists public.vocabulary_review_events (
  id uuid primary key
    default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  saved_phrase_id uuid not null,

  -- Optional because a review event can remain useful even after its source
  -- deck is deleted. PostgreSQL 15 allows SET NULL to target deck_id only,
  -- preserving the non-null user_id in this composite owner key.
  deck_id uuid,

  session_id uuid not null,

  rating text not null,

  previous_mastery_score smallint not null,
  resulting_mastery_score smallint not null,

  reviewed_at timestamptz not null
    default now(),

  constraint vocabulary_review_events_phrase_owner_fk
    foreign key (
      saved_phrase_id,
      user_id
    )
    references public.saved_phrases (
      id,
      user_id
    )
    on delete cascade,

  constraint vocabulary_review_events_deck_owner_fk
    foreign key (
      deck_id,
      user_id
    )
    references public.vocabulary_decks (
      id,
      user_id
    )
    on delete set null (deck_id),

  constraint vocabulary_review_events_rating_valid
    check (
      rating in (
        'again',
        'hard',
        'good',
        'easy'
      )
    ),

  constraint vocabulary_review_events_previous_score_range
    check (
      previous_mastery_score between 0 and 100
    ),

  constraint vocabulary_review_events_result_score_range
    check (
      resulting_mastery_score between 0 and 100
    )
);


create index if not exists
  vocabulary_review_events_user_reviewed_idx
on public.vocabulary_review_events (
  user_id,
  reviewed_at desc
);


create index if not exists
  vocabulary_review_events_phrase_reviewed_idx
on public.vocabulary_review_events (
  user_id,
  saved_phrase_id,
  reviewed_at desc
);


create index if not exists
  vocabulary_review_events_session_idx
on public.vocabulary_review_events (
  user_id,
  session_id,
  reviewed_at
);


create index if not exists
  vocabulary_review_events_deck_idx
on public.vocabulary_review_events (
  user_id,
  deck_id,
  reviewed_at desc
)
where deck_id is not null;


-- ============================================================
-- Atomic review recording + mastery calculation
-- ============================================================
--
-- The first three successful ratings intentionally build mastery gradually:
--
--   Again: score becomes 55% of the previous score and recall streak resets.
--   Hard:  score becomes 88% of previous score + 8.
--   Good:  score becomes 88% of previous score + 15.
--   Easy:  score becomes 88% of previous score + 22.
--
-- Scores are always clamped to 0..100. Repeated Hard reviews converge below
-- "mastered" territory, while repeated Good/Easy reviews can reach strong
-- mastery. An Again rating produces a meaningful drop rather than merely
-- subtracting a fixed number.
--
-- The mastery row is created if needed, then locked FOR UPDATE before the
-- score is calculated. That serializes concurrent reviews for the same phrase
-- and ensures the event stores the exact previous/resulting score pair.

create or replace function public.record_vocabulary_review(
  p_user_id uuid,
  p_saved_phrase_id uuid,
  p_rating text,
  p_deck_id uuid default null,
  p_session_id uuid default null
)
returns table (
  review_event_id uuid,
  session_id uuid,
  mastery_score smallint,
  review_count integer,
  successful_review_count integer,
  current_recall_streak integer,
  last_rating text,
  last_reviewed_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rating text;
  v_session_id uuid;
  v_reviewed_at timestamptz := now();

  v_previous_score integer;
  v_next_score integer;
  v_review_count integer;
  v_successful_review_count integer;
  v_current_recall_streak integer;

  v_event_id uuid;
begin
  if p_user_id is null then
    raise exception 'A user ID is required.'
      using errcode = '22023';
  end if;

  if p_saved_phrase_id is null then
    raise exception 'A Saved Phrase ID is required.'
      using errcode = '22023';
  end if;

  v_rating := lower(btrim(coalesce(p_rating, '')));

  if v_rating not in (
    'again',
    'hard',
    'good',
    'easy'
  ) then
    raise exception 'A valid Flashcard rating is required.'
      using errcode = '22023';
  end if;

  perform 1
  from public.saved_phrases
  where id = p_saved_phrase_id
    and user_id = p_user_id;

  if not found then
    raise exception 'Saved Phrase not found.'
      using errcode = 'P0002';
  end if;

  if p_deck_id is not null then
    perform 1
    from public.vocabulary_deck_items
    where user_id = p_user_id
      and deck_id = p_deck_id
      and saved_phrase_id = p_saved_phrase_id;

    if not found then
      raise exception 'The Saved Phrase is not in the supplied Vocabulary Deck.'
        using errcode = '23503';
    end if;
  end if;

  v_session_id := coalesce(
    p_session_id,
    gen_random_uuid()
  );

  -- Ensure the row exists before taking the row-level lock. ON CONFLICT makes
  -- simultaneous first reviews safe: one insert wins and the other waits,
  -- then both continue through the same locked row in sequence.
  insert into public.vocabulary_mastery (
    user_id,
    saved_phrase_id
  )
  values (
    p_user_id,
    p_saved_phrase_id
  )
  on conflict (
    user_id,
    saved_phrase_id
  ) do nothing;

  select
    vm.mastery_score,
    vm.review_count,
    vm.successful_review_count,
    vm.current_recall_streak
  into
    v_previous_score,
    v_review_count,
    v_successful_review_count,
    v_current_recall_streak
  from public.vocabulary_mastery as vm
  where vm.user_id = p_user_id
    and vm.saved_phrase_id = p_saved_phrase_id
  for update;

  if not found then
    raise exception 'Vocabulary mastery could not be initialized.';
  end if;

  v_next_score :=
    case v_rating
      when 'again' then
        greatest(
          0,
          round(
            v_previous_score::numeric * 0.55
          )::integer
        )

      when 'hard' then
        least(
          100,
          round(
            v_previous_score::numeric * 0.88 + 8
          )::integer
        )

      when 'good' then
        least(
          100,
          round(
            v_previous_score::numeric * 0.88 + 15
          )::integer
        )

      when 'easy' then
        least(
          100,
          round(
            v_previous_score::numeric * 0.88 + 22
          )::integer
        )
    end;

  v_review_count :=
    v_review_count + 1;

  if v_rating = 'again' then
    v_current_recall_streak := 0;
  else
    v_successful_review_count :=
      v_successful_review_count + 1;

    v_current_recall_streak :=
      v_current_recall_streak + 1;
  end if;

  update public.vocabulary_mastery
  set
    mastery_score = v_next_score,
    review_count = v_review_count,
    successful_review_count = v_successful_review_count,
    current_recall_streak = v_current_recall_streak,
    last_rating = v_rating,
    last_reviewed_at = v_reviewed_at
  where user_id = p_user_id
    and saved_phrase_id = p_saved_phrase_id;

  insert into public.vocabulary_review_events (
    user_id,
    saved_phrase_id,
    deck_id,
    session_id,
    rating,
    previous_mastery_score,
    resulting_mastery_score,
    reviewed_at
  )
  values (
    p_user_id,
    p_saved_phrase_id,
    p_deck_id,
    v_session_id,
    v_rating,
    v_previous_score,
    v_next_score,
    v_reviewed_at
  )
  returning id
  into v_event_id;

  return query
  select
    v_event_id,
    v_session_id,
    v_next_score::smallint,
    v_review_count,
    v_successful_review_count,
    v_current_recall_streak,
    v_rating,
    v_reviewed_at;
end;
$$;


-- ============================================================
-- Row Level Security + least-privilege access
-- ============================================================

alter table public.vocabulary_mastery
  enable row level security;

alter table public.vocabulary_review_events
  enable row level security;


revoke all
on table public.vocabulary_mastery
from anon, authenticated;

revoke all
on table public.vocabulary_review_events
from anon, authenticated;


grant select, insert, update, delete
on table public.vocabulary_mastery
to service_role;


grant select, insert, delete
on table public.vocabulary_review_events
to service_role;


-- Defence-in-depth owner policies if direct authenticated grants are ever
-- intentionally added in a future migration.

drop policy if exists
  vocabulary_mastery_owner_select
on public.vocabulary_mastery;

create policy
  vocabulary_mastery_owner_select
on public.vocabulary_mastery
for select
using (
  user_id = auth.uid()
);


drop policy if exists
  vocabulary_mastery_owner_insert
on public.vocabulary_mastery;

create policy
  vocabulary_mastery_owner_insert
on public.vocabulary_mastery
for insert
with check (
  user_id = auth.uid()
);


drop policy if exists
  vocabulary_mastery_owner_update
on public.vocabulary_mastery;

create policy
  vocabulary_mastery_owner_update
on public.vocabulary_mastery
for update
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
);


drop policy if exists
  vocabulary_mastery_owner_delete
on public.vocabulary_mastery;

create policy
  vocabulary_mastery_owner_delete
on public.vocabulary_mastery
for delete
using (
  user_id = auth.uid()
);


drop policy if exists
  vocabulary_review_events_owner_select
on public.vocabulary_review_events;

create policy
  vocabulary_review_events_owner_select
on public.vocabulary_review_events
for select
using (
  user_id = auth.uid()
);


drop policy if exists
  vocabulary_review_events_owner_insert
on public.vocabulary_review_events;

create policy
  vocabulary_review_events_owner_insert
on public.vocabulary_review_events
for insert
with check (
  user_id = auth.uid()
);


drop policy if exists
  vocabulary_review_events_owner_delete
on public.vocabulary_review_events;

create policy
  vocabulary_review_events_owner_delete
on public.vocabulary_review_events
for delete
using (
  user_id = auth.uid()
);


-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Only the
-- trusted backend service role should be able to call this mutation directly.
revoke all
on function public.record_vocabulary_review(
  uuid,
  uuid,
  text,
  uuid,
  uuid
)
from public, anon, authenticated;


grant execute
on function public.record_vocabulary_review(
  uuid,
  uuid,
  text,
  uuid,
  uuid
)
to service_role;


comment on table public.vocabulary_mastery is
  'Current per-user mastery state for Saved Phrases, updated by Flashcard review ratings.';

comment on table public.vocabulary_review_events is
  'Append-only Flashcard review events used for mastery, streaks and future practice analytics.';

comment on function public.record_vocabulary_review(
  uuid,
  uuid,
  text,
  uuid,
  uuid
) is
  'Atomically records an Again/Hard/Good/Easy Flashcard review and updates the Saved Phrase mastery score.';
