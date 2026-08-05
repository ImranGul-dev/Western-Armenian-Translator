-- Western Armenian Translator production schema
-- Run with: npx supabase db push

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.translation_glossary (
  id uuid primary key default gen_random_uuid(),
  source_language text not null check (source_language in ('en', 'hyw', 'hye')),
  target_language text not null check (target_language in ('en', 'hyw', 'hye')),
  source_term text not null,
  target_term text not null,
  part_of_speech text,
  definition text,
  notes text,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint translation_glossary_supported_pair check (
    (source_language = 'en' and target_language = 'hyw')
    or (source_language = 'hyw' and target_language = 'en')
    or (source_language = 'hye' and target_language = 'hyw')
  ),
  constraint translation_glossary_unique_term unique (source_language, target_language, source_term)
);

create table if not exists public.translation_grammar_rules (
  id uuid primary key default gen_random_uuid(),
  source_language text not null check (source_language in ('en', 'hyw', 'hye')),
  target_language text not null check (target_language in ('en', 'hyw', 'hye')),
  title text not null,
  description text not null,
  examples jsonb not null default '[]'::jsonb check (jsonb_typeof(examples) = 'array'),
  keywords text[] not null default '{}',
  priority integer not null default 100,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint translation_grammar_supported_pair check (
    (source_language = 'en' and target_language = 'hyw')
    or (source_language = 'hyw' and target_language = 'en')
    or (source_language = 'hye' and target_language = 'hyw')
  )
);

create table if not exists public.approved_translations (
  id uuid primary key default gen_random_uuid(),
  source_language text not null check (source_language in ('en', 'hyw', 'hye')),
  target_language text not null check (target_language in ('en', 'hyw', 'hye')),
  source_text text not null,
  target_text text not null,
  category text,
  notes text,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approved_translations_supported_pair check (
    (source_language = 'en' and target_language = 'hyw')
    or (source_language = 'hyw' and target_language = 'en')
    or (source_language = 'hye' and target_language = 'hyw')
  ),
  constraint approved_translations_unique_source unique (source_language, target_language, source_text)
);

create table if not exists public.translation_usage (
  request_id uuid primary key,
  user_id uuid null references auth.users(id) on delete set null,
  anonymous_client_hash text not null,
  source_language text not null check (source_language in ('en', 'hyw', 'hye')),
  target_language text not null check (target_language in ('en', 'hyw', 'hye')),
  character_count integer not null check (character_count between 0 and 3000),
  status text not null,
  latency_ms integer not null check (latency_ms >= 0),
  model text not null,
  created_at timestamptz not null default now()
);

comment on table public.translation_usage is
  'Anonymous operational usage only. Source text and translated text are intentionally not stored.';

create table if not exists public.translation_rate_limits (
  identifier_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists translation_glossary_lookup_idx
  on public.translation_glossary (source_language, target_language, approved);
create index if not exists translation_glossary_source_trgm_idx
  on public.translation_glossary using gin (lower(source_term) gin_trgm_ops);
create index if not exists translation_grammar_lookup_idx
  on public.translation_grammar_rules (source_language, target_language, approved, priority);
create index if not exists approved_translations_lookup_idx
  on public.approved_translations (source_language, target_language, approved);
create index if not exists approved_translations_source_trgm_idx
  on public.approved_translations using gin (lower(source_text) gin_trgm_ops);
create index if not exists translation_usage_created_at_idx
  on public.translation_usage (created_at desc);

create or replace function public.set_updated_at()
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

drop trigger if exists translation_glossary_updated_at on public.translation_glossary;
create trigger translation_glossary_updated_at
before update on public.translation_glossary
for each row execute function public.set_updated_at();

drop trigger if exists translation_grammar_updated_at on public.translation_grammar_rules;
create trigger translation_grammar_updated_at
before update on public.translation_grammar_rules
for each row execute function public.set_updated_at();

drop trigger if exists approved_translations_updated_at on public.approved_translations;
create trigger approved_translations_updated_at
before update on public.approved_translations
for each row execute function public.set_updated_at();

create or replace function public.find_translation_context(
  p_text text,
  p_source_language text,
  p_target_language text,
  p_glossary_limit integer default 12,
  p_example_limit integer default 4,
  p_rule_limit integer default 6
)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'glossary', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'sourceTerm', g.source_term,
          'targetTerm', g.target_term,
          'partOfSpeech', g.part_of_speech,
          'notes', g.notes
        )
        order by char_length(g.source_term) desc
      )
      from (
        select source_term, target_term, part_of_speech, notes
        from public.translation_glossary
        where approved = true
          and source_language = p_source_language
          and target_language = p_target_language
          and position(lower(source_term) in lower(p_text)) > 0
        order by char_length(source_term) desc
        limit greatest(0, least(p_glossary_limit, 20))
      ) g
    ), '[]'::jsonb),
    'grammarRules', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'title', r.title,
          'description', r.description,
          'examples', r.examples
        )
        order by r.priority asc, r.title asc
      )
      from (
        select title, description, examples, priority
        from public.translation_grammar_rules
        where approved = true
          and source_language = p_source_language
          and target_language = p_target_language
          and (
            cardinality(keywords) = 0
            or exists (
              select 1
              from unnest(keywords) keyword
              where position(lower(keyword) in lower(p_text)) > 0
            )
          )
        order by priority asc, title asc
        limit greatest(0, least(p_rule_limit, 10))
      ) r
    ), '[]'::jsonb),
    'approvedExamples', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'sourceText', e.source_text,
          'targetText', e.target_text,
          'category', e.category
        )
        order by e.match_score desc
      )
      from (
        select
          source_text,
          target_text,
          category,
          greatest(
            similarity(lower(source_text), lower(p_text)),
            case when position(lower(source_text) in lower(p_text)) > 0 then 1.0 else 0.0 end
          ) as match_score
        from public.approved_translations
        where approved = true
          and source_language = p_source_language
          and target_language = p_target_language
          and (
            similarity(lower(source_text), lower(p_text)) >= 0.18
            or position(lower(source_text) in lower(p_text)) > 0
          )
        order by match_score desc
        limit greatest(0, least(p_example_limit, 8))
      ) e
    ), '[]'::jsonb)
  );
$$;

create or replace function public.consume_translation_rate_limit(
  p_identifier_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_started_at timestamptz;
  v_request_count integer;
begin
  if p_identifier_hash is null or char_length(p_identifier_hash) < 32 then
    raise exception 'Invalid rate-limit identifier';
  end if;

  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate-limit configuration';
  end if;

  insert into public.translation_rate_limits (
    identifier_hash,
    window_started_at,
    request_count,
    updated_at
  ) values (
    p_identifier_hash,
    v_now,
    1,
    v_now
  )
  on conflict (identifier_hash) do update
  set
    window_started_at = case
      when public.translation_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now
        then v_now
      else public.translation_rate_limits.window_started_at
    end,
    request_count = case
      when public.translation_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now
        then 1
      else public.translation_rate_limits.request_count + 1
    end,
    updated_at = v_now
  returning window_started_at, request_count
  into v_window_started_at, v_request_count;

  return query select
    v_request_count <= p_limit,
    greatest(p_limit - v_request_count, 0),
    v_window_started_at + make_interval(secs => p_window_seconds);
end;
$$;

alter table public.translation_glossary enable row level security;
alter table public.translation_grammar_rules enable row level security;
alter table public.approved_translations enable row level security;
alter table public.translation_usage enable row level security;
alter table public.translation_rate_limits enable row level security;

-- Browser clients have no direct table access. The Edge Function uses a secret key.
revoke all on table public.translation_glossary from anon, authenticated;
revoke all on table public.translation_grammar_rules from anon, authenticated;
revoke all on table public.approved_translations from anon, authenticated;
revoke all on table public.translation_usage from anon, authenticated;
revoke all on table public.translation_rate_limits from anon, authenticated;
revoke all on function public.find_translation_context(text, text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.consume_translation_rate_limit(text, integer, integer) from public, anon, authenticated;

grant select on table public.translation_glossary to service_role;
grant select on table public.translation_grammar_rules to service_role;
grant select on table public.approved_translations to service_role;
grant insert, select on table public.translation_usage to service_role;
grant select, insert, update on table public.translation_rate_limits to service_role;
grant execute on function public.find_translation_context(text, text, text, integer, integer, integer) to service_role;
grant execute on function public.consume_translation_rate_limit(text, integer, integer) to service_role;
