-- Translation latency improvements and Eastern Armenian direction expansion.
-- Keeps the existing billing, dashboard, knowledge-base and widget architecture intact.

-- Support the two client-requested English <-> Eastern Armenian directions in
-- every language resource table while retaining the existing directions.
alter table public.glossary_terms
  drop constraint if exists translation_glossary_supported_pair;
alter table public.glossary_terms
  drop constraint if exists glossary_terms_supported_pair;
alter table public.glossary_terms
  add constraint glossary_terms_supported_pair check (
    (source_language = 'en' and target_language = 'hyw') or
    (source_language = 'hyw' and target_language = 'en') or
    (source_language = 'hye' and target_language = 'hyw') or
    (source_language = 'en' and target_language = 'hye') or
    (source_language = 'hye' and target_language = 'en')
  );

alter table public.grammar_rules
  drop constraint if exists translation_grammar_supported_pair;
alter table public.grammar_rules
  drop constraint if exists grammar_rules_supported_pair;
alter table public.grammar_rules
  add constraint grammar_rules_supported_pair check (
    (source_language = 'en' and target_language = 'hyw') or
    (source_language = 'hyw' and target_language = 'en') or
    (source_language = 'hye' and target_language = 'hyw') or
    (source_language = 'en' and target_language = 'hye') or
    (source_language = 'hye' and target_language = 'en')
  );

alter table public.approved_translation_examples
  drop constraint if exists approved_translations_supported_pair;
alter table public.approved_translation_examples
  drop constraint if exists approved_translation_examples_supported_pair;
alter table public.approved_translation_examples
  add constraint approved_translation_examples_supported_pair check (
    (source_language = 'en' and target_language = 'hyw') or
    (source_language = 'hyw' and target_language = 'en') or
    (source_language = 'hye' and target_language = 'hyw') or
    (source_language = 'en' and target_language = 'hye') or
    (source_language = 'hye' and target_language = 'en')
  );

alter table public.widget_sites
  drop constraint if exists widget_site_language_pair;
alter table public.widget_sites
  add constraint widget_site_language_pair check (
    (default_source_language = 'en' and default_target_language = 'hyw') or
    (default_source_language = 'hyw' and default_target_language = 'en') or
    (default_source_language = 'hye' and default_target_language = 'hyw') or
    (default_source_language = 'en' and default_target_language = 'hye') or
    (default_source_language = 'hye' and default_target_language = 'en')
  );

-- Keep widget creation/update validation aligned with the expanded language pairs.
-- This is the existing management function with only the supported-pair checks
-- expanded; plan, domain, branding, rotation and audit behavior are preserved.
create or replace function public.manage_widget_site(
  p_action text,
  p_widget_id uuid default null,
  p_name text default null,
  p_allowed_domain text default null,
  p_active boolean default null,
  p_theme text default null,
  p_source_language text default null,
  p_target_language text default null,
  p_show_branding boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean := public.is_admin();
  v_owner uuid;
  v_plan jsonb;
  v_site public.widget_sites%rowtype;
  v_domain text;
  v_count integer;
  v_key text;
  v_source text;
  v_target text;
  v_branding boolean;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_action not in ('create','update','rotate','delete','set_active') then raise exception 'Unsupported widget action'; end if;
  if p_action in ('create','update') and p_name is not null and char_length(btrim(p_name)) not between 1 and 100 then raise exception 'Widget name must be between 1 and 100 characters'; end if;
  if p_theme is not null and p_theme not in ('light','dark','auto') then raise exception 'Unsupported widget theme'; end if;

  if p_action = 'create' then
    v_owner := v_user_id;
  else
    select user_id into v_owner from public.widget_sites where id=p_widget_id and deleted_at is null;
    if v_owner is null then raise exception 'Widget not found'; end if;
    if v_owner <> v_user_id and not v_is_admin then raise exception 'Not authorized'; end if;
  end if;

  v_plan := public.effective_plan_for_user(v_owner);
  if p_action not in ('delete','set_active') or coalesce(p_active,true) then
    if coalesce((v_plan->>'widget_enabled')::boolean,false) is not true then raise exception 'Your effective plan does not include widget access'; end if;
  end if;

  if p_action = 'create' then
    perform pg_advisory_xact_lock(hashtextextended('widget-sites:' || v_owner::text, 0));
    select count(*) into v_count from public.widget_sites where user_id=v_owner and deleted_at is null;
    if v_count >= coalesce((v_plan->>'widget_site_limit')::integer,0) then raise exception 'Your widget site limit has been reached'; end if;
    if p_name is null or btrim(p_name) = '' then raise exception 'Widget name is required'; end if;
    if p_allowed_domain is null then raise exception 'Allowed domain is required'; end if;
    v_domain := public.normalize_widget_domain(p_allowed_domain);
    v_source := coalesce(p_source_language,'en');
    v_target := coalesce(p_target_language,'hyw');
    if not ((v_source='en' and v_target='hyw') or (v_source='hyw' and v_target='en') or (v_source='hye' and v_target='hyw') or (v_source='en' and v_target='hye') or (v_source='hye' and v_target='en')) then raise exception 'Unsupported language pair'; end if;
    v_branding := coalesce(p_show_branding,true);
    if not v_branding and coalesce((v_plan->>'widget_branding_removable')::boolean,false) is not true then raise exception 'This plan requires Tun branding'; end if;
    v_key := 'wpk_' || encode(gen_random_bytes(24),'hex');
    insert into public.widget_sites(user_id,name,allowed_domain,public_key,active,theme,default_source_language,default_target_language,show_branding)
    values(v_owner,btrim(p_name),v_domain,v_key,coalesce(p_active,true),coalesce(p_theme,'auto'),v_source,v_target,v_branding)
    returning * into v_site;
  elsif p_action = 'update' then
    v_source := coalesce(p_source_language,(select default_source_language from public.widget_sites where id=p_widget_id));
    v_target := coalesce(p_target_language,(select default_target_language from public.widget_sites where id=p_widget_id));
    if not ((v_source='en' and v_target='hyw') or (v_source='hyw' and v_target='en') or (v_source='hye' and v_target='hyw') or (v_source='en' and v_target='hye') or (v_source='hye' and v_target='en')) then raise exception 'Unsupported language pair'; end if;
    v_branding := coalesce(p_show_branding,(select show_branding from public.widget_sites where id=p_widget_id));
    if not v_branding and coalesce((v_plan->>'widget_branding_removable')::boolean,false) is not true then raise exception 'This plan requires Tun branding'; end if;
    update public.widget_sites set
      name=coalesce(nullif(btrim(p_name),''),name),
      allowed_domain=case when p_allowed_domain is null then allowed_domain else public.normalize_widget_domain(p_allowed_domain) end,
      active=coalesce(p_active,active),
      theme=coalesce(p_theme,theme),
      default_source_language=v_source,
      default_target_language=v_target,
      show_branding=v_branding
    where id=p_widget_id returning * into v_site;
  elsif p_action = 'rotate' then
    v_key := 'wpk_' || encode(gen_random_bytes(24),'hex');
    update public.widget_sites set public_key=v_key where id=p_widget_id returning * into v_site;
  elsif p_action = 'set_active' then
    update public.widget_sites set active=coalesce(p_active,false) where id=p_widget_id returning * into v_site;
  elsif p_action = 'delete' then
    update public.widget_sites set active=false, deleted_at=now() where id=p_widget_id returning * into v_site;
  end if;

  insert into public.admin_audit_log(admin_user_id,action,target_type,target_id,safe_details)
  values(
    v_user_id,
    case when v_is_admin then 'admin_widget_' else 'customer_widget_' end || p_action,
    'widget_site',
    v_site.id::text,
    jsonb_build_object('owner_user_id',v_owner,'domain',v_site.allowed_domain,'active',v_site.active)
  );
  return to_jsonb(v_site);
end;
$$;

revoke all on function public.manage_widget_site(text, uuid, text, text, boolean, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.manage_widget_site(text, uuid, text, text, boolean, text, text, text, boolean) to authenticated;

-- Exact approved translations are a safe translation-memory fast path. The
-- index makes common approved phrases return without an OpenAI round trip.
create index if not exists approved_examples_exact_pair_idx
  on public.approved_translation_examples (
    source_language,
    target_language,
    lower(btrim(source_text))
  )
  where approved = true and commercial_use_allowed = true;

-- One database round trip for profile + effective plan. This preserves all
-- manual overrides, Stripe subscription rules and admin entitlements because
-- the existing effective_plan_for_user() remains authoritative.
create or replace function public.translation_account_for_user(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'role', p.role,
    'history_enabled', p.history_enabled,
    'query_review_consent', p.query_review_consent,
    'plan', public.effective_plan_for_user(p.id)
  )
  from public.profiles p
  where p.id = p_user_id
  limit 1;
$$;

-- One database round trip for the anonymous/free plan configuration.
create or replace function public.anonymous_translation_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan public.plans%rowtype;
  v_settings jsonb := '{}'::jsonb;
begin
  select * into v_plan
  from public.plans
  where slug = 'free'
  limit 1;

  select coalesce(value, '{}'::jsonb) into v_settings
  from public.platform_settings
  where key = 'anonymous_usage'
  limit 1;

  return jsonb_build_object(
    'id', v_plan.id,
    'slug', 'anonymous',
    'name', 'Anonymous',
    'source', 'anonymous',
    'monthly_character_limit', coalesce((v_settings->>'monthly_character_limit')::bigint, v_plan.monthly_character_limit, 20000),
    'max_characters_per_request', coalesce((v_settings->>'max_characters_per_request')::integer, v_plan.max_characters_per_request, 1500),
    'history_limit', 0,
    'rate_limit_per_minute', coalesce((v_settings->>'rate_limit_per_minute')::integer, 10),
    'widget_enabled', false,
    'widget_site_limit', 0,
    'widget_monthly_character_limit', null,
    'widget_branding_removable', false,
    'override_expires_at', null,
    'stripe_status', null,
    'stripe_subscription_id', null,
    'stripe_customer_id', null
  );
end;
$$;

-- Combine the monthly quota lookup and rate-limit mutation into one RPC while
-- preserving the existing rule that over-quota requests do not consume a
-- normal translation rate-limit slot.
create or replace function public.prepare_translation_request(
  p_identity_key text,
  p_character_count integer,
  p_monthly_character_limit bigint,
  p_rate_identifier_hash text,
  p_rate_limit integer,
  p_window_seconds integer default 60
)
returns table (
  characters_used bigint,
  monthly_allowed boolean,
  rate_allowed boolean,
  rate_remaining integer,
  rate_reset_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_used bigint := 0;
  v_rate_allowed boolean := true;
  v_rate_remaining integer := 0;
  v_rate_reset_at timestamptz := now();
begin
  if p_identity_key is null or char_length(p_identity_key) < 6 then
    raise exception 'Invalid usage identity';
  end if;
  if p_character_count < 0 or p_monthly_character_limit < 1 then
    raise exception 'Invalid usage limits';
  end if;
  if p_rate_identifier_hash is null or char_length(p_rate_identifier_hash) < 32 then
    raise exception 'Invalid rate-limit identifier';
  end if;
  if p_rate_limit < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate-limit configuration';
  end if;

  select coalesce((
    select mu.character_count
    from public.monthly_usage mu
    where mu.identity_key = p_identity_key
      and mu.month = date_trunc('month', now())::date
    limit 1
  ), 0)::bigint
  into v_used;

  if v_used + p_character_count > p_monthly_character_limit then
    return query select v_used, false, true, p_rate_limit, v_rate_reset_at;
    return;
  end if;

  select r.allowed, r.remaining, r.reset_at
    into v_rate_allowed, v_rate_remaining, v_rate_reset_at
  from public.consume_translation_rate_limit(
    p_rate_identifier_hash,
    p_rate_limit,
    p_window_seconds
  ) r;

  return query select v_used, true, v_rate_allowed, v_rate_remaining, v_rate_reset_at;
end;
$$;

-- Fastest request-preparation path: account/plan resolution, monthly quota and
-- rate limiting in one Postgres round trip after the Edge Function verifies the JWT.
create or replace function public.prepare_translation_account(
  p_user_id uuid,
  p_anonymous_identity_key text,
  p_character_count integer,
  p_rate_identifier_hash text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_plan jsonb;
  v_identity_key text;
  v_role text := 'anonymous';
  v_history_enabled boolean := false;
  v_query_review_consent boolean := false;
  v_request_allowed boolean := true;
  v_characters_used bigint := 0;
  v_monthly_allowed boolean := true;
  v_rate_allowed boolean := true;
  v_rate_remaining integer := 0;
  v_rate_reset_at timestamptz := now();
begin
  if p_character_count < 0 then raise exception 'Invalid character count'; end if;

  if p_user_id is null then
    if p_anonymous_identity_key is null or char_length(p_anonymous_identity_key) < 6 then
      raise exception 'Invalid anonymous identity';
    end if;
    v_identity_key := p_anonymous_identity_key;
    v_plan := public.anonymous_translation_plan();
  else
    select
      case when p.role in ('admin','language_editor') then p.role else 'user' end,
      p.history_enabled,
      p.query_review_consent
    into v_role, v_history_enabled, v_query_review_consent
    from public.profiles p
    where p.id = p_user_id;

    if not found then return null; end if;
    v_identity_key := 'user:' || p_user_id::text;
    v_plan := public.effective_plan_for_user(p_user_id);
  end if;

  if v_plan is null then return null; end if;

  v_request_allowed := p_character_count <= coalesce((v_plan->>'max_characters_per_request')::integer, 1500);

  if v_request_allowed then
    select
      r.characters_used,
      r.monthly_allowed,
      r.rate_allowed,
      r.rate_remaining,
      r.rate_reset_at
    into
      v_characters_used,
      v_monthly_allowed,
      v_rate_allowed,
      v_rate_remaining,
      v_rate_reset_at
    from public.prepare_translation_request(
      v_identity_key,
      p_character_count,
      coalesce((v_plan->>'monthly_character_limit')::bigint, 20000),
      p_rate_identifier_hash,
      coalesce((v_plan->>'rate_limit_per_minute')::integer, 10),
      60
    ) r;
  else
    v_rate_remaining := coalesce((v_plan->>'rate_limit_per_minute')::integer, 10);
  end if;

  return jsonb_build_object(
    'user_id', p_user_id,
    'role', v_role,
    'history_enabled', coalesce(v_history_enabled, false),
    'query_review_consent', coalesce(v_query_review_consent, false),
    'identity_key', v_identity_key,
    'plan', v_plan,
    'request_allowed', v_request_allowed,
    'characters_used', coalesce(v_characters_used, 0),
    'monthly_allowed', coalesce(v_monthly_allowed, false),
    'rate_allowed', coalesce(v_rate_allowed, false),
    'rate_remaining', coalesce(v_rate_remaining, 0),
    'rate_reset_at', v_rate_reset_at
  );
end;
$$;

revoke all on function public.translation_account_for_user(uuid) from public, anon, authenticated;
revoke all on function public.anonymous_translation_plan() from public, anon, authenticated;
revoke all on function public.prepare_translation_request(text, integer, bigint, text, integer, integer) from public, anon, authenticated;
revoke all on function public.prepare_translation_account(uuid, text, integer, text) from public, anon, authenticated;

grant execute on function public.translation_account_for_user(uuid) to service_role;
grant execute on function public.anonymous_translation_plan() to service_role;
grant execute on function public.prepare_translation_request(text, integer, bigint, text, integer, integer) to service_role;
grant execute on function public.prepare_translation_account(uuid, text, integer, text) to service_role;
