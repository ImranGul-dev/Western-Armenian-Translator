-- Saved Phrases + Favourites foundation.
--
-- Saved learning items are intentionally independent from
-- translation_history. Users may clear translation history
-- without deleting phrases they intentionally saved.
--
-- Direct browser access is not granted. The paid Saved Phrases
-- API will use the service role and enforce entitlement server-side.

create table if not exists public.saved_phrases (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  source_text text not null,
  translated_text text not null,

  source_language text not null,
  target_language text not null,

  is_favorite boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint saved_phrases_source_text_not_blank
    check (length(btrim(source_text)) > 0),

  constraint saved_phrases_translated_text_not_blank
    check (length(btrim(translated_text)) > 0),

  constraint saved_phrases_source_language_supported
    check (
      source_language in (
        'en',
        'hyw',
        'hye'
      )
    ),

  constraint saved_phrases_target_language_supported
    check (
      target_language in (
        'en',
        'hyw',
        'hye'
      )
    ),

  constraint saved_phrases_language_pair_differs
    check (
      source_language <> target_language
    )
);


create index if not exists
  saved_phrases_user_created_idx
on public.saved_phrases (
  user_id,
  created_at desc
);


create index if not exists
  saved_phrases_user_favorite_created_idx
on public.saved_phrases (
  user_id,
  is_favorite,
  created_at desc
);


create or replace function
  public.set_saved_phrase_updated_at()
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
  saved_phrases_updated_at
on public.saved_phrases;


create trigger
  saved_phrases_updated_at
before update
on public.saved_phrases
for each row
execute function
  public.set_saved_phrase_updated_at();


alter table
  public.saved_phrases
enable row level security;


-- No anon/authenticated table privileges.
-- Paid access will be enforced by the Saved Phrases Edge Function.
revoke all
on table public.saved_phrases
from anon, authenticated;


grant select, insert, update, delete
on table public.saved_phrases
to service_role;


-- Service-role Edge Functions are the intended access path.
-- These owner policies remain as defence-in-depth if authenticated
-- table grants are intentionally added in a future migration.

drop policy if exists
  saved_phrases_owner_select
on public.saved_phrases;

create policy
  saved_phrases_owner_select
on public.saved_phrases
for select
using (
  user_id = auth.uid()
);


drop policy if exists
  saved_phrases_owner_insert
on public.saved_phrases;

create policy
  saved_phrases_owner_insert
on public.saved_phrases
for insert
with check (
  user_id = auth.uid()
);


drop policy if exists
  saved_phrases_owner_update
on public.saved_phrases;

create policy
  saved_phrases_owner_update
on public.saved_phrases
for update
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
);


drop policy if exists
  saved_phrases_owner_delete
on public.saved_phrases;

create policy
  saved_phrases_owner_delete
on public.saved_phrases
for delete
using (
  user_id = auth.uid()
);
