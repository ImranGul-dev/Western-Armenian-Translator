-- Phase 2 commercial MVP: authentication, roles, knowledge management,
-- history, feedback, usage metering, configurable plans and Stripe readiness.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- Preserve the Phase 1 data while moving to the canonical Phase 2 names.
do $$
begin
  if to_regclass('public.glossary_terms') is null and to_regclass('public.translation_glossary') is not null then
    alter table public.translation_glossary rename to glossary_terms;
  end if;
  if to_regclass('public.grammar_rules') is null and to_regclass('public.translation_grammar_rules') is not null then
    alter table public.translation_grammar_rules rename to grammar_rules;
  end if;
  if to_regclass('public.approved_translation_examples') is null and to_regclass('public.approved_translations') is not null then
    alter table public.approved_translations rename to approved_translation_examples;
  end if;
  if to_regclass('public.usage_events') is null and to_regclass('public.translation_usage') is not null then
    alter table public.translation_usage rename to usage_events;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='approved_translation_examples' and column_name='target_text'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='approved_translation_examples' and column_name='translated_text'
  ) then
    alter table public.approved_translation_examples rename column target_text to translated_text;
  end if;
end $$;

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug in ('free','premium','business')),
  name text not null,
  price_monthly_cents integer not null default 0 check (price_monthly_cents >= 0),
  monthly_character_limit bigint not null check (monthly_character_limit > 0),
  max_characters_per_request integer not null check (max_characters_per_request between 100 and 10000),
  history_limit integer null check (history_limit is null or history_limit > 0),
  rate_limit_per_minute integer not null check (rate_limit_per_minute between 1 and 1000),
  features jsonb not null default '[]'::jsonb check (jsonb_typeof(features)='array'),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.plans (slug,name,price_monthly_cents,monthly_character_limit,max_characters_per_request,history_limit,rate_limit_per_minute,features,sort_order)
values
('free','Free',0,20000,1500,20,20,'["20,000 characters per month","1,500 characters per request","Last 20 translations","TunApp branding visible"]',1),
('premium','Premium',900,300000,5000,null,60,'["300,000 characters per month","5,000 characters per request","Full translation history","Saved favourites","Priority translation processing","No public API access yet"]',2),
('business','Business',2900,1500000,10000,null,120,'["1,500,000 characters per month","10,000 characters per request","Full translation history","Usage dashboard","Team-ready architecture","Future widget access — coming soon","Future API access — coming soon"]',3)
on conflict (slug) do update set
  name=excluded.name,
  price_monthly_cents=excluded.price_monthly_cents,
  monthly_character_limit=excluded.monthly_character_limit,
  max_characters_per_request=excluded.max_characters_per_request,
  history_limit=excluded.history_limit,
  rate_limit_per_minute=excluded.rate_limit_per_minute,
  features=excluded.features,
  sort_order=excluded.sort_order,
  updated_at=now();

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'user' check (role in ('user','language_editor','admin')),
  history_enabled boolean not null default true,
  current_plan_id uuid references public.plans(id),
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plan_id uuid references public.plans(id),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'inactive',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Extend the existing knowledge tables without discarding working Phase 1 rows.
alter table public.glossary_terms
  add column if not exists western_armenian_term text,
  add column if not exists eastern_armenian_term text,
  add column if not exists english_term text,
  add column if not exists example_source text,
  add column if not exists example_western_armenian text,
  add column if not exists source_name text,
  add column if not exists source_url text,
  add column if not exists copyright_status text,
  add column if not exists commercial_use_allowed boolean not null default false,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz;

update public.glossary_terms set
  western_armenian_term = coalesce(western_armenian_term, case when target_language='hyw' then target_term when source_language='hyw' then source_term end),
  eastern_armenian_term = coalesce(eastern_armenian_term, case when source_language='hye' then source_term when target_language='hye' then target_term end),
  english_term = coalesce(english_term, case when source_language='en' then source_term when target_language='en' then target_term end)
where western_armenian_term is null or eastern_armenian_term is null or english_term is null;

alter table public.grammar_rules
  add column if not exists rule_category text,
  add column if not exists correct_examples jsonb not null default '[]'::jsonb,
  add column if not exists incorrect_examples jsonb not null default '[]'::jsonb,
  add column if not exists exceptions jsonb not null default '[]'::jsonb,
  add column if not exists notes text,
  add column if not exists source_name text,
  add column if not exists source_url text,
  add column if not exists copyright_status text,
  add column if not exists commercial_use_allowed boolean not null default false,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz;

update public.grammar_rules set correct_examples=examples
where correct_examples='[]'::jsonb and examples <> '[]'::jsonb;

alter table public.approved_translation_examples
  add column if not exists source_name text,
  add column if not exists source_url text,
  add column if not exists copyright_status text,
  add column if not exists commercial_use_allowed boolean not null default false,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz;

-- Operational events intentionally do not contain source or translated text.
alter table public.usage_events drop constraint if exists translation_usage_character_count_check;
alter table public.usage_events drop constraint if exists usage_events_character_count_check;
alter table public.usage_events add constraint usage_events_character_count_check check (character_count between 0 and 10000);
alter table public.usage_events
  alter column anonymous_client_hash drop not null,
  add column if not exists plan_id uuid references public.plans(id),
  add column if not exists plan_slug text,
  add column if not exists openai_processed boolean not null default false,
  add column if not exists success boolean not null default false,
  add column if not exists estimated_cost_usd numeric(12,6),
  add column if not exists error_code text;

create table if not exists public.translation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null unique,
  source_language text not null check (source_language in ('en','hyw','hye')),
  target_language text not null check (target_language in ('en','hyw','hye')),
  source_text text not null,
  translated_text text not null,
  character_count integer not null check (character_count between 1 and 10000),
  is_favorite boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.translation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  request_id uuid not null,
  source_language text not null check (source_language in ('en','hyw','hye')),
  target_language text not null check (target_language in ('en','hyw','hye')),
  source_text text not null,
  generated_translation text not null,
  rating text not null check (rating in ('helpful','not_accurate','correction')),
  suggested_translation text,
  comment text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.monthly_usage (
  identity_key text not null,
  month date not null,
  user_id uuid references auth.users(id) on delete cascade,
  plan_id uuid references public.plans(id),
  plan_slug text not null,
  character_count bigint not null default 0 check (character_count >= 0),
  request_count integer not null default 0 check (request_count >= 0),
  failed_request_count integer not null default 0 check (failed_request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (identity_key, month)
);

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.system_errors (
  id uuid primary key default gen_random_uuid(),
  request_id uuid,
  error_code text,
  safe_message text not null,
  function_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processing_status text not null default 'processing' check (processing_status in ('processing','completed','failed')),
  last_error text,
  processed_at timestamptz
);

create index if not exists glossary_terms_lookup_idx on public.glossary_terms(source_language,target_language,approved);
create index if not exists glossary_terms_source_trgm_idx on public.glossary_terms using gin(lower(source_term) gin_trgm_ops);
create index if not exists glossary_terms_target_trgm_idx on public.glossary_terms using gin(lower(target_term) gin_trgm_ops);
create index if not exists glossary_terms_western_trgm_idx on public.glossary_terms using gin(lower(coalesce(western_armenian_term,'')) gin_trgm_ops);
create index if not exists glossary_terms_eastern_trgm_idx on public.glossary_terms using gin(lower(coalesce(eastern_armenian_term,'')) gin_trgm_ops);
create index if not exists grammar_rules_pair_idx on public.grammar_rules(source_language,target_language,approved,priority);
create index if not exists approved_examples_pair_idx on public.approved_translation_examples(source_language,target_language,approved);
create index if not exists approved_examples_source_trgm_idx on public.approved_translation_examples using gin(lower(source_text) gin_trgm_ops);
create index if not exists history_user_created_idx on public.translation_history(user_id,created_at desc);
create index if not exists feedback_status_created_idx on public.translation_feedback(status,created_at desc);
create index if not exists usage_events_user_created_idx on public.usage_events(user_id,created_at desc);
create index if not exists usage_events_created_status_idx on public.usage_events(created_at desc,status);
create index if not exists monthly_usage_user_month_idx on public.monthly_usage(user_id,month desc);

-- Shared updated_at triggers.
drop trigger if exists plans_updated_at on public.plans;
create trigger plans_updated_at before update on public.plans for each row execute function public.set_updated_at();
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare v_free_plan uuid;
begin
  select id into v_free_plan from public.plans where slug='free' limit 1;
  insert into public.profiles(id,email,display_name,current_plan_id)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'display_name',''),v_free_plan)
  on conflict(id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Backfill profiles for users created before this migration.
insert into public.profiles(id,email,display_name,current_plan_id)
select u.id,u.email,coalesce(u.raw_user_meta_data->>'display_name',''),p.id
from auth.users u cross join lateral (select id from public.plans where slug='free' limit 1) p
on conflict(id) do nothing;

create or replace function public.has_any_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role=any(required_roles));
$$;
create or replace function public.is_editor() returns boolean language sql stable security definer set search_path=public as $$ select public.has_any_role(array['language_editor','admin']); $$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select public.has_any_role(array['admin']); $$;

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.role is distinct from old.role
    and coalesce(auth.role(),'') <> 'service_role'
    and coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role'
    and not public.is_admin() then
    raise exception 'Only an administrator can change account roles';
  end if;
  if new.current_plan_id is distinct from old.current_plan_id
    and coalesce(auth.role(),'') <> 'service_role'
    and coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role'
    and not public.is_admin() then
    raise exception 'Plans are managed by billing or an administrator';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_profile_role_trigger on public.profiles;
create trigger protect_profile_role_trigger before update on public.profiles for each row execute function public.protect_profile_role();

create or replace function public.increment_monthly_usage(
  p_identity_key text,
  p_user_id uuid,
  p_plan_id uuid,
  p_plan_slug text,
  p_characters integer,
  p_success boolean
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_month date := date_trunc('month',now())::date;
begin
  insert into public.monthly_usage(identity_key,month,user_id,plan_id,plan_slug,character_count,request_count,failed_request_count)
  values(p_identity_key,v_month,p_user_id,p_plan_id,p_plan_slug,case when p_success then p_characters else 0 end,case when p_success then 1 else 0 end,case when p_success then 0 else 1 end)
  on conflict(identity_key,month) do update set
    user_id=coalesce(excluded.user_id,public.monthly_usage.user_id),
    plan_id=excluded.plan_id,
    plan_slug=excluded.plan_slug,
    character_count=public.monthly_usage.character_count+excluded.character_count,
    request_count=public.monthly_usage.request_count+excluded.request_count,
    failed_request_count=public.monthly_usage.failed_request_count+excluded.failed_request_count,
    updated_at=now();
end;
$$;

create or replace function public.get_current_usage()
returns table(characters_used bigint,character_limit bigint,plan_slug text,month date)
language sql
stable
security definer
set search_path=public
as $$
  with account as (
    select p.id,coalesce(pl.slug,'free') slug,coalesce(pl.monthly_character_limit,20000) lim
    from public.profiles p left join public.plans pl on pl.id=p.current_plan_id where p.id=auth.uid()
  )
  select coalesce(mu.character_count,0),a.lim,a.slug,date_trunc('month',now())::date
  from account a left join public.monthly_usage mu on mu.identity_key='user:'||a.id::text and mu.month=date_trunc('month',now())::date;
$$;

create or replace function public.clear_my_translation_history()
returns void language sql security invoker set search_path=public as $$ delete from public.translation_history where user_id=auth.uid(); $$;

-- Relevant approved context only; exact phrase matches are ranked before word matches.
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
set search_path=public,extensions
as $$
with normalized as (
  select lower(regexp_replace(normalize(p_text,NFC),'[[:punct:]]+',' ','g')) text_value,
         regexp_split_to_array(lower(regexp_replace(normalize(p_text,NFC),'[^[:alnum:]]+',' ','g')),'\s+') words
), glossary as (
  select g.source_term,g.target_term,g.part_of_speech,g.definition,g.notes,g.source_name,
         case when position(lower(g.source_term) in n.text_value)>0 then 2 else 1 end match_kind
  from public.glossary_terms g cross join normalized n
  where g.approved=true and g.commercial_use_allowed=true
    and g.source_language=p_source_language and g.target_language=p_target_language
    and (position(lower(g.source_term) in n.text_value)>0 or lower(g.source_term)=any(n.words))
  order by match_kind desc,char_length(g.source_term) desc
  limit greatest(0,least(p_glossary_limit,20))
), rules as (
  select r.title,r.description,r.correct_examples,r.incorrect_examples,r.exceptions,r.notes,r.priority
  from public.grammar_rules r cross join normalized n
  where r.approved=true and r.commercial_use_allowed=true
    and r.source_language=p_source_language and r.target_language=p_target_language
    and (cardinality(r.keywords)=0 or exists(select 1 from unnest(r.keywords) k where lower(k)=any(n.words) or position(lower(k) in n.text_value)>0))
  order by r.priority,r.title limit greatest(0,least(p_rule_limit,10))
), examples as (
  select e.source_text,e.translated_text,e.category,e.notes,e.source_name,
         greatest(similarity(lower(e.source_text),lower(p_text)),case when position(lower(e.source_text) in lower(p_text))>0 then 1 else 0 end) score
  from public.approved_translation_examples e
  where e.approved=true and e.commercial_use_allowed=true and e.source_language=p_source_language and e.target_language=p_target_language
    and (similarity(lower(e.source_text),lower(p_text))>=0.18 or position(lower(e.source_text) in lower(p_text))>0)
  order by score desc limit greatest(0,least(p_example_limit,8))
)
select jsonb_build_object(
  'glossary',coalesce((select jsonb_agg(jsonb_build_object('sourceTerm',source_term,'targetTerm',target_term,'partOfSpeech',part_of_speech,'definition',definition,'notes',notes,'sourceName',source_name) order by match_kind desc,char_length(source_term) desc) from glossary),'[]'::jsonb),
  'grammarRules',coalesce((select jsonb_agg(jsonb_build_object('title',title,'description',description,'correctExamples',correct_examples,'incorrectExamples',incorrect_examples,'exceptions',exceptions,'notes',notes) order by priority,title) from rules),'[]'::jsonb),
  'approvedExamples',coalesce((select jsonb_agg(jsonb_build_object('sourceText',source_text,'targetText',translated_text,'category',category,'notes',notes,'sourceName',source_name) order by score desc) from examples),'[]'::jsonb)
);
$$;

create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare result jsonb;
begin
  if not public.is_editor() then raise exception 'Not authorized'; end if;
  select jsonb_build_object(
    'total_users',(select count(*) from public.profiles),
    'active_users',(select count(*) from public.profiles where last_active_at>=now()-interval '30 days'),
    'translations_today',(select count(*) from public.usage_events where success and created_at>=date_trunc('day',now())),
    'translations_month',(select count(*) from public.usage_events where success and created_at>=date_trunc('month',now())),
    'characters_month',(select coalesce(sum(character_count),0) from public.usage_events where success and created_at>=date_trunc('month',now())),
    'failed_requests',(select count(*) from public.usage_events where not success and created_at>=date_trunc('month',now())),
    'pending_corrections',(select count(*) from public.translation_feedback where status='pending'),
    'pending_glossary',(select count(*) from public.glossary_terms where not approved),
    'estimated_cost_usd',(select coalesce(sum(estimated_cost_usd),0) from public.usage_events where created_at>=date_trunc('month',now())),
    'most_used_directions',(select coalesce(jsonb_agg(x),'[]'::jsonb) from (select source_language||'→'||target_language direction,count(*) requests from public.usage_events where created_at>=date_trunc('month',now()) group by 1 order by 2 desc limit 5)x)
  ) into result;
  return result;
end;
$$;

-- Row Level Security
alter table public.plans enable row level security;
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.glossary_terms enable row level security;
alter table public.grammar_rules enable row level security;
alter table public.approved_translation_examples enable row level security;
alter table public.translation_history enable row level security;
alter table public.translation_feedback enable row level security;
alter table public.usage_events enable row level security;
alter table public.monthly_usage enable row level security;
alter table public.platform_settings enable row level security;
alter table public.system_errors enable row level security;
alter table public.stripe_webhook_events enable row level security;

-- Remove old policies so this migration can be reapplied in local resets.
do $$ declare r record; begin
  for r in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename in ('plans','profiles','subscriptions','glossary_terms','grammar_rules','approved_translation_examples','translation_history','translation_feedback','usage_events','monthly_usage','platform_settings','system_errors','stripe_webhook_events') loop
    execute format('drop policy if exists %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  end loop;
end $$;

create policy plans_public_read on public.plans for select using (active or public.is_admin());
create policy profiles_read on public.profiles for select using (id=auth.uid() or public.is_editor());
create policy profiles_update on public.profiles for update using (id=auth.uid() or public.is_admin()) with check (id=auth.uid() or public.is_admin());
create policy subscriptions_read on public.subscriptions for select using (user_id=auth.uid() or public.is_admin());
create policy subscriptions_admin on public.subscriptions for all using (public.is_admin()) with check (public.is_admin());

create policy glossary_editor_read on public.glossary_terms for select using (public.is_editor());
create policy glossary_editor_write on public.glossary_terms for all using (public.is_editor()) with check (public.is_editor());
create policy grammar_editor_read on public.grammar_rules for select using (public.is_editor());
create policy grammar_editor_write on public.grammar_rules for all using (public.is_editor()) with check (public.is_editor());
create policy examples_editor_read on public.approved_translation_examples for select using (public.is_editor());
create policy examples_editor_write on public.approved_translation_examples for all using (public.is_editor()) with check (public.is_editor());

create policy history_owner on public.translation_history for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy feedback_insert on public.translation_feedback for insert to authenticated with check (user_id=auth.uid());
create policy feedback_owner_read on public.translation_feedback for select using (user_id=auth.uid() or public.is_editor());
create policy feedback_owner_delete on public.translation_feedback for delete using ((user_id=auth.uid() and status='pending') or public.is_editor());
create policy feedback_editor_update on public.translation_feedback for update using (public.is_editor()) with check (public.is_editor());
create policy usage_owner_read on public.usage_events for select using (user_id=auth.uid() or public.is_admin());
create policy monthly_owner_read on public.monthly_usage for select using (user_id=auth.uid() or public.is_admin());
create policy settings_admin on public.platform_settings for all using (public.is_admin()) with check (public.is_admin());
create policy errors_admin on public.system_errors for select using (public.is_admin());
create policy stripe_events_admin on public.stripe_webhook_events for select using (public.is_admin());

-- Browser grants. RLS remains the authoritative access layer.
grant usage on schema public to anon,authenticated;
grant select on public.plans to anon,authenticated;
grant select,update on public.profiles to authenticated;
grant select on public.subscriptions to authenticated;
grant select,insert,update,delete on public.glossary_terms,public.grammar_rules,public.approved_translation_examples to authenticated;
grant select,insert,update,delete on public.translation_history to authenticated;
grant select,insert,update,delete on public.translation_feedback to authenticated;
grant select on public.usage_events,public.monthly_usage to authenticated;
grant select,insert,update,delete on public.platform_settings to authenticated;
grant select on public.system_errors,public.stripe_webhook_events to authenticated;
grant execute on function public.get_current_usage() to authenticated;
grant execute on function public.clear_my_translation_history() to authenticated;
grant execute on function public.admin_dashboard_stats() to authenticated;

-- Edge Functions use service_role for private operations.
grant all on public.plans,public.profiles,public.subscriptions,public.glossary_terms,public.grammar_rules,public.approved_translation_examples,public.translation_history,public.translation_feedback,public.usage_events,public.monthly_usage,public.platform_settings,public.system_errors,public.stripe_webhook_events to service_role;
grant execute on function public.increment_monthly_usage(text,uuid,uuid,text,integer,boolean) to service_role;
grant execute on function public.find_translation_context(text,text,text,integer,integer,integer) to service_role;
revoke all on function public.increment_monthly_usage(text,uuid,uuid,text,integer,boolean) from public,anon,authenticated;
revoke all on function public.find_translation_context(text,text,text,integer,integer,integer) from public,anon,authenticated;
