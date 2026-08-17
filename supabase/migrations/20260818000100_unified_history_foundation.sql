-- Unified searchable History foundation
--
-- Keeps existing translation_history and Role-Play persistence intact.
-- Adds only the missing Thesaurus history store plus search indexes that
-- support the future unified History API.

create extension if not exists pg_trgm;

create table if not exists public.thesaurus_history (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  input_text text not null
    check (
      char_length(btrim(input_text))
        between 1 and 200
    ),

  synonyms text[] not null
    default '{}'::text[],

  antonyms text[] not null
    default '{}'::text[],

  alternatives text[] not null
    default '{}'::text[],

  -- Filled by the trigger below so one indexed field can search the input
  -- and returned Thesaurus vocabulary without duplicating search logic in
  -- every API query.
  search_text text not null
    default '',

  created_at timestamptz
    not null default now(),

  constraint thesaurus_history_synonyms_limit
    check (
      cardinality(synonyms) <= 5
    ),

  constraint thesaurus_history_antonyms_limit
    check (
      cardinality(antonyms) <= 5
    ),

  constraint thesaurus_history_alternatives_limit
    check (
      cardinality(alternatives) <= 5
    )
);


create or replace function public.set_thesaurus_history_search_text()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.search_text = btrim(
    concat_ws(
      ' ',
      new.input_text,
      array_to_string(new.synonyms, ' '),
      array_to_string(new.antonyms, ' '),
      array_to_string(new.alternatives, ' ')
    )
  );

  return new;
end;
$$;


drop trigger if exists
  thesaurus_history_search_text_trigger
on public.thesaurus_history;

create trigger
  thesaurus_history_search_text_trigger
before insert or update of
  input_text,
  synonyms,
  antonyms,
  alternatives
on public.thesaurus_history
for each row
execute function public.set_thesaurus_history_search_text();


-- Safe backfill if this migration is reapplied after rows already exist.
update public.thesaurus_history
set input_text = input_text
where search_text = '';


create index if not exists
  thesaurus_history_user_created_idx
on public.thesaurus_history (
  user_id,
  created_at desc
);

create index if not exists
  thesaurus_history_search_trgm_idx
on public.thesaurus_history
using gin (
  search_text gin_trgm_ops
);

-- Existing translation history remains the source of truth for translations.
-- These indexes make future source/result text searches efficient.
create index if not exists
  translation_history_source_text_trgm_idx
on public.translation_history
using gin (
  source_text gin_trgm_ops
);

create index if not exists
  translation_history_translated_text_trgm_idx
on public.translation_history
using gin (
  translated_text gin_trgm_ops
);

-- Existing Role-Play sessions remain the source of truth for Role-Play
-- history. The unified History v1 searches scenario/title for this type.
create index if not exists
  role_play_sessions_scenario_title_trgm_idx
on public.role_play_sessions
using gin (
  scenario_title gin_trgm_ops
);


-- Thesaurus history is accessed through authenticated Edge Functions.
-- Keep direct browser table access closed, matching the existing Role-Play
-- storage pattern.
alter table public.thesaurus_history
  enable row level security;

revoke all
on table public.thesaurus_history
from anon, authenticated;

grant all
on table public.thesaurus_history
to service_role;


comment on table public.thesaurus_history is
  'Private per-user Thesaurus activity used by unified searchable History. Direct browser access is intentionally revoked.';
