-- Vocabulary Decks foundation.
--
-- Decks organise existing Saved Phrases without duplicating phrase content.
-- A Saved Phrase may belong to multiple decks.
--
-- Deleting a deck deletes only its deck memberships.
-- Deleting a Saved Phrase automatically removes its deck memberships.
--
-- Direct browser access is intentionally not granted. The paid Vocabulary
-- Decks Edge Function will use the service role and enforce entitlement
-- server-side, following the Saved Phrases architecture.


-- ============================================================
-- Saved Phrase composite owner key
-- ============================================================
--
-- saved_phrases.id is already globally unique, but this additional unique
-- index lets vocabulary_deck_items use a composite foreign key containing
-- both saved_phrase_id and user_id.
--
-- That makes it impossible at the database level for a membership row to
-- connect one user's deck to another user's Saved Phrase.

create unique index if not exists
  saved_phrases_id_user_unique_idx
on public.saved_phrases (
  id,
  user_id
);


-- ============================================================
-- Vocabulary Decks
-- ============================================================

create table if not exists
  public.vocabulary_decks (
    id uuid primary key
      default gen_random_uuid(),

    user_id uuid not null
      references auth.users(id)
      on delete cascade,

    name text not null,

    description text,

    created_at timestamptz not null
      default now(),

    updated_at timestamptz not null
      default now(),

    constraint vocabulary_decks_name_not_blank
      check (
        length(
          btrim(name)
        ) > 0
      ),

    constraint vocabulary_decks_name_length
      check (
        length(
          btrim(name)
        ) <= 100
      ),

    constraint vocabulary_decks_description_length
      check (
        description is null
        or length(description) <= 500
      )
  );


-- One user cannot create duplicate deck names that differ only
-- by casing or surrounding whitespace.
create unique index if not exists
  vocabulary_decks_user_name_unique_idx
on public.vocabulary_decks (
  user_id,
  lower(
    btrim(name)
  )
);


-- Required for the composite owner foreign key used by
-- vocabulary_deck_items.
create unique index if not exists
  vocabulary_decks_id_user_unique_idx
on public.vocabulary_decks (
  id,
  user_id
);


create index if not exists
  vocabulary_decks_user_created_idx
on public.vocabulary_decks (
  user_id,
  created_at desc
);


-- ============================================================
-- Updated-at trigger
-- ============================================================

create or replace function
  public.set_vocabulary_deck_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();

  return new;
end;
$$;


drop trigger if exists
  vocabulary_decks_updated_at
on public.vocabulary_decks;


create trigger
  vocabulary_decks_updated_at
before update
on public.vocabulary_decks
for each row
execute function
  public.set_vocabulary_deck_updated_at();


-- ============================================================
-- Vocabulary Deck Items
-- ============================================================
--
-- This is a membership table only. Translation content remains
-- stored once in public.saved_phrases.
--
-- user_id is intentionally present in this join table so the
-- composite foreign keys can enforce matching ownership.

create table if not exists
  public.vocabulary_deck_items (
    user_id uuid not null
      references auth.users(id)
      on delete cascade,

    deck_id uuid not null,

    saved_phrase_id uuid not null,

    created_at timestamptz not null
      default now(),

    constraint vocabulary_deck_items_primary
      primary key (
        deck_id,
        saved_phrase_id
      ),

    constraint vocabulary_deck_items_deck_owner_fk
      foreign key (
        deck_id,
        user_id
      )
      references public.vocabulary_decks (
        id,
        user_id
      )
      on delete cascade,

    constraint vocabulary_deck_items_phrase_owner_fk
      foreign key (
        saved_phrase_id,
        user_id
      )
      references public.saved_phrases (
        id,
        user_id
      )
      on delete cascade
  );


create index if not exists
  vocabulary_deck_items_user_created_idx
on public.vocabulary_deck_items (
  user_id,
  created_at desc
);


create index if not exists
  vocabulary_deck_items_saved_phrase_idx
on public.vocabulary_deck_items (
  saved_phrase_id,
  user_id
);


-- ============================================================
-- Row Level Security
-- ============================================================

alter table
  public.vocabulary_decks
enable row level security;


alter table
  public.vocabulary_deck_items
enable row level security;


-- ============================================================
-- Table privileges
-- ============================================================
--
-- No direct anon/authenticated table privileges.
-- The future Vocabulary Decks Edge Function is the intended
-- application access path.

revoke all
on table public.vocabulary_decks
from anon, authenticated;


revoke all
on table public.vocabulary_deck_items
from anon, authenticated;


grant
  select,
  insert,
  update,
  delete
on table public.vocabulary_decks
to service_role;


grant
  select,
  insert,
  delete
on table public.vocabulary_deck_items
to service_role;


-- ============================================================
-- Deck owner policies
-- ============================================================
--
-- These remain defence-in-depth if authenticated table grants
-- are intentionally added in the future.

drop policy if exists
  vocabulary_decks_owner_select
on public.vocabulary_decks;


create policy
  vocabulary_decks_owner_select
on public.vocabulary_decks
for select
using (
  user_id = auth.uid()
);


drop policy if exists
  vocabulary_decks_owner_insert
on public.vocabulary_decks;


create policy
  vocabulary_decks_owner_insert
on public.vocabulary_decks
for insert
with check (
  user_id = auth.uid()
);


drop policy if exists
  vocabulary_decks_owner_update
on public.vocabulary_decks;


create policy
  vocabulary_decks_owner_update
on public.vocabulary_decks
for update
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
);


drop policy if exists
  vocabulary_decks_owner_delete
on public.vocabulary_decks;


create policy
  vocabulary_decks_owner_delete
on public.vocabulary_decks
for delete
using (
  user_id = auth.uid()
);


-- ============================================================
-- Deck item owner policies
-- ============================================================

drop policy if exists
  vocabulary_deck_items_owner_select
on public.vocabulary_deck_items;


create policy
  vocabulary_deck_items_owner_select
on public.vocabulary_deck_items
for select
using (
  user_id = auth.uid()
);


drop policy if exists
  vocabulary_deck_items_owner_insert
on public.vocabulary_deck_items;


create policy
  vocabulary_deck_items_owner_insert
on public.vocabulary_deck_items
for insert
with check (
  user_id = auth.uid()
);


drop policy if exists
  vocabulary_deck_items_owner_delete
on public.vocabulary_deck_items;


create policy
  vocabulary_deck_items_owner_delete
on public.vocabulary_deck_items
for delete
using (
  user_id = auth.uid()
);
