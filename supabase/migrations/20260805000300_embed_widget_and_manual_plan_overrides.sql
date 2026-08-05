-- Embeddable translator widgets and auditable manual plan overrides.
-- Forward-only migration: existing Stripe, authentication, usage and knowledge data are preserved.

alter table public.plans
  add column if not exists widget_enabled boolean not null default false,
  add column if not exists widget_site_limit integer not null default 0 check (widget_site_limit between 0 and 1000),
  add column if not exists widget_monthly_character_limit bigint null check (widget_monthly_character_limit is null or widget_monthly_character_limit > 0),
  add column if not exists widget_branding_removable boolean not null default false;

update public.plans set
  widget_enabled = false,
  widget_site_limit = 0,
  widget_monthly_character_limit = null,
  widget_branding_removable = false,
  features = '["20,000 characters per month","1,500 characters per request","Last 20 translations","Tun branding"]'::jsonb
where slug = 'free';

update public.plans set
  widget_enabled = true,
  widget_site_limit = greatest(widget_site_limit, 1),
  widget_monthly_character_limit = null,
  widget_branding_removable = false,
  features = '["300,000 characters per month","5,000 characters per request","Full translation history","Saved favourites","One embeddable translator site","Priority processing"]'::jsonb
where slug = 'premium';

update public.plans set
  widget_enabled = true,
  widget_site_limit = greatest(widget_site_limit, 5),
  widget_monthly_character_limit = null,
  widget_branding_removable = true,
  features = '["1,500,000 characters per month","10,000 characters per request","Full translation history","Usage dashboard","Five embeddable translator sites","Optional widget branding"]'::jsonb
where slug = 'business';

create table if not exists public.user_plan_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  active boolean not null default true,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  reason text,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_plan_override_expiry check (expires_at is null or expires_at > starts_at)
);

create index if not exists user_plan_overrides_active_idx
  on public.user_plan_overrides(user_id, active, starts_at, expires_at);
create index if not exists user_plan_overrides_plan_idx
  on public.user_plan_overrides(plan_id, active);

drop trigger if exists user_plan_overrides_updated_at on public.user_plan_overrides;
create trigger user_plan_overrides_updated_at
before update on public.user_plan_overrides
for each row execute function public.set_updated_at();

create or replace function public.normalize_widget_domain(p_value text)
returns text
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  v_value text := lower(btrim(p_value));
  v_host text;
  v_port text;
begin
  v_value := regexp_replace(v_value, '^[a-z][a-z0-9+.-]*://', '', 'i');
  v_value := split_part(v_value, '/', 1);
  v_value := split_part(v_value, '?', 1);
  v_value := split_part(v_value, '#', 1);
  v_value := regexp_replace(v_value, '\.$', '');
  v_port := substring(v_value from ':([0-9]+)$');
  v_host := regexp_replace(v_value, ':[0-9]+$', '');

  if v_value = '' or char_length(v_value) > 259 or v_value ~ '[[:space:]@]' then
    raise exception 'Enter a valid website domain.';
  end if;
  if v_host = '' or char_length(v_host) > 253
     or v_host !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$'
     or v_host ~ '\.\.' then
    raise exception 'Enter a valid website domain, optionally including a port.';
  end if;
  if v_port is not null and (v_port::integer < 1 or v_port::integer > 65535) then
    raise exception 'Enter a valid website port.';
  end if;
  return v_host || case when v_port is null then '' else ':' || v_port end;
end;
$$;

create table if not exists public.widget_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  allowed_domain text not null,
  public_key text not null unique check (public_key ~ '^wpk_[a-f0-9]{48}$'),
  active boolean not null default true,
  theme text not null default 'auto' check (theme in ('light','dark','auto')),
  default_source_language text not null default 'en' check (default_source_language in ('en','hyw','hye')),
  default_target_language text not null default 'hyw' check (default_target_language in ('en','hyw','hye')),
  show_branding boolean not null default true,
  last_used_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint widget_site_language_pair check (
    (default_source_language='en' and default_target_language='hyw') or
    (default_source_language='hyw' and default_target_language='en') or
    (default_source_language='hye' and default_target_language='hyw')
  )
);

create index if not exists widget_sites_user_idx on public.widget_sites(user_id, created_at desc);
create index if not exists widget_sites_domain_idx on public.widget_sites(allowed_domain) where deleted_at is null;
create index if not exists widget_sites_activity_idx on public.widget_sites(active, last_used_at desc) where deleted_at is null;
create unique index if not exists widget_sites_user_domain_name_idx
  on public.widget_sites(user_id, allowed_domain, lower(name)) where deleted_at is null;

drop trigger if exists widget_sites_updated_at on public.widget_sites;
create trigger widget_sites_updated_at
before update on public.widget_sites
for each row execute function public.set_updated_at();

create table if not exists public.widget_usage_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  widget_site_id uuid references public.widget_sites(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  origin text,
  source_language text check (source_language is null or source_language in ('en','hyw','hye')),
  target_language text check (target_language is null or target_language in ('en','hyw','hye')),
  character_count integer not null default 0 check (character_count between 0 and 10000),
  status text not null,
  success boolean not null default false,
  openai_processed boolean not null default false,
  latency_ms integer not null default 0 check (latency_ms >= 0),
  error_code text,
  created_at timestamptz not null default now()
);

comment on table public.widget_usage_events is
  'Operational widget usage only. Source text and translated text are intentionally never stored.';

create index if not exists widget_usage_site_month_idx on public.widget_usage_events(widget_site_id, created_at desc);
create index if not exists widget_usage_user_month_idx on public.widget_usage_events(user_id, created_at desc);
create index if not exists widget_usage_status_idx on public.widget_usage_events(status, created_at desc);
create index if not exists widget_usage_origin_idx on public.widget_usage_events(origin, created_at desc);

create or replace function public.widget_monthly_characters_for_user(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(character_count), 0)::bigint
  from public.widget_usage_events
  where user_id = p_user_id
    and success
    and created_at >= date_trunc('month', now());
$$;

create or replace function public.effective_plan_for_user(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_plan_id uuid;
  v_plan public.plans%rowtype;
  v_source text := 'default';
  v_override_expires timestamptz;
  v_subscription_status text;
  v_subscription_id text;
  v_customer_id text;
begin
  select role into v_role from public.profiles where id = p_user_id;
  if v_role is null then
    return null;
  end if;

  if v_role = 'admin' then
    select * into v_plan from public.plans where slug = 'business' limit 1;
    return jsonb_build_object(
      'id', v_plan.id,
      'slug', 'admin',
      'name', 'Administrator',
      'source', 'admin',
      'monthly_character_limit', 100000000,
      'max_characters_per_request', 10000,
      'history_limit', null,
      'rate_limit_per_minute', 240,
      'widget_enabled', true,
      'widget_site_limit', 100,
      'widget_monthly_character_limit', null,
      'widget_branding_removable', true,
      'override_expires_at', null,
      'stripe_status', null,
      'stripe_subscription_id', null,
      'stripe_customer_id', null
    );
  end if;

  select o.plan_id, o.expires_at
    into v_plan_id, v_override_expires
  from public.user_plan_overrides o
  where o.user_id = p_user_id
    and o.active
    and o.starts_at <= now()
    and (o.expires_at is null or o.expires_at > now())
  limit 1;

  if found then
    select * into v_plan from public.plans where id = v_plan_id;
    v_source := 'manual';
  else
    select s.plan_id, s.status, s.stripe_subscription_id, s.stripe_customer_id
      into v_plan_id, v_subscription_status, v_subscription_id, v_customer_id
    from public.subscriptions s
    join public.plans pl on pl.id = s.plan_id
    where s.user_id = p_user_id
      and s.status in ('active','trialing','past_due')
      and not s.access_suspended
    limit 1;

    if found then
      select * into v_plan from public.plans where id = v_plan_id;
      v_source := 'stripe';
    else
      select * into v_plan from public.plans where slug = 'free' limit 1;
      v_source := 'default';
    end if;
  end if;

  return jsonb_build_object(
    'id', v_plan.id,
    'slug', v_plan.slug,
    'name', v_plan.name,
    'source', v_source,
    'monthly_character_limit', v_plan.monthly_character_limit,
    'max_characters_per_request', v_plan.max_characters_per_request,
    'history_limit', v_plan.history_limit,
    'rate_limit_per_minute', v_plan.rate_limit_per_minute,
    'widget_enabled', v_plan.widget_enabled,
    'widget_site_limit', v_plan.widget_site_limit,
    'widget_monthly_character_limit', v_plan.widget_monthly_character_limit,
    'widget_branding_removable', v_plan.widget_branding_removable,
    'override_expires_at', v_override_expires,
    'stripe_status', v_subscription_status,
    'stripe_subscription_id', v_subscription_id,
    'stripe_customer_id', v_customer_id
  );
end;
$$;

create or replace function public.get_my_effective_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  return public.effective_plan_for_user(auth.uid());
end;
$$;

create or replace function public.get_current_usage()
returns table(characters_used bigint, character_limit bigint, plan_slug text, month date)
language sql
stable
security definer
set search_path = public
as $$
  with account as (
    select auth.uid() id, public.effective_plan_for_user(auth.uid()) plan
  )
  select
    coalesce(mu.character_count, 0),
    coalesce((a.plan->>'monthly_character_limit')::bigint, 20000),
    coalesce(a.plan->>'slug', 'free'),
    date_trunc('month', now())::date
  from account a
  left join public.monthly_usage mu
    on mu.identity_key = 'user:' || a.id::text
   and mu.month = date_trunc('month', now())::date;
$$;

create or replace function public.admin_users_with_effective_plans()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_result jsonb;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'display_name', p.display_name,
    'role', p.role,
    'created_at', p.created_at,
    'last_active_at', p.last_active_at,
    'effective_plan', public.effective_plan_for_user(p.id),
    'subscription', case when s.id is null then null else jsonb_build_object(
      'id', s.id, 'plan_slug', s.plan_slug, 'status', s.status,
      'access_suspended', s.access_suspended, 'cancel_at_period_end', s.cancel_at_period_end,
      'stripe_customer_id', s.stripe_customer_id, 'stripe_subscription_id', s.stripe_subscription_id
    ) end,
    'override', case when o.id is null then null else jsonb_build_object(
      'id', o.id, 'plan_slug', op.slug, 'active', o.active, 'starts_at', o.starts_at,
      'expires_at', o.expires_at, 'reason', o.reason, 'assigned_by', o.assigned_by
    ) end
  ) order by p.created_at desc), '[]'::jsonb)
  into v_result
  from public.profiles p
  left join public.subscriptions s on s.user_id = p.id
  left join public.user_plan_overrides o on o.user_id = p.id
  left join public.plans op on op.id = o.plan_id;
  return v_result;
end;
$$;

create or replace function public.admin_set_user_plan_override(
  p_user_id uuid,
  p_plan_slug text,
  p_expires_at timestamptz default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_previous jsonb;
  v_next jsonb;
  v_action text;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if p_user_id is null or not exists(select 1 from public.profiles where id=p_user_id) then
    raise exception 'User not found';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Expiration must be in the future';
  end if;
  if p_reason is not null and char_length(p_reason) > 1000 then
    raise exception 'Reason must be 1,000 characters or fewer';
  end if;

  v_previous := public.effective_plan_for_user(p_user_id);
  if p_plan_slug is null or p_plan_slug in ('billing','default','') then
    delete from public.user_plan_overrides where user_id = p_user_id;
    v_action := 'manual_plan_override_removed';
  else
    if p_plan_slug not in ('free','premium','business') then raise exception 'Unsupported plan'; end if;
    select id into v_plan_id from public.plans where slug=p_plan_slug limit 1;
    if v_plan_id is null then raise exception 'Plan not found'; end if;
    insert into public.user_plan_overrides(user_id,plan_id,active,starts_at,expires_at,reason,assigned_by)
    values(p_user_id,v_plan_id,true,now(),p_expires_at,nullif(btrim(p_reason),''),auth.uid())
    on conflict(user_id) do update set
      plan_id=excluded.plan_id, active=true, starts_at=now(), expires_at=excluded.expires_at,
      reason=excluded.reason, assigned_by=auth.uid(), updated_at=now();
    v_action := 'manual_plan_override_set';
  end if;

  v_next := public.effective_plan_for_user(p_user_id);
  insert into public.admin_audit_log(admin_user_id,action,target_type,target_id,safe_details)
  values(auth.uid(),v_action,'user_plan_override',p_user_id::text,jsonb_build_object(
    'previous', v_previous,
    'new', v_next,
    'requested_plan', p_plan_slug,
    'expires_at', p_expires_at,
    'reason', nullif(btrim(p_reason),'')
  ));
  return v_next;
end;
$$;

create or replace function public.get_my_widget_sites()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select jsonb_build_object(
    'effective_plan', public.effective_plan_for_user(auth.uid()),
    'sites', coalesce(jsonb_agg(jsonb_build_object(
      'id', w.id, 'name', w.name, 'allowed_domain', w.allowed_domain, 'public_key', w.public_key,
      'active', w.active, 'theme', w.theme, 'default_source_language', w.default_source_language,
      'default_target_language', w.default_target_language, 'show_branding', w.show_branding,
      'last_used_at', w.last_used_at, 'created_at', w.created_at, 'updated_at', w.updated_at,
      'monthly_translations', (select count(*) from public.widget_usage_events e where e.widget_site_id=w.id and e.success and e.created_at>=date_trunc('month',now())),
      'monthly_characters', (select coalesce(sum(e.character_count),0) from public.widget_usage_events e where e.widget_site_id=w.id and e.success and e.created_at>=date_trunc('month',now()))
    ) order by w.created_at desc) filter (where w.id is not null), '[]'::jsonb)
  ) into v_result
  from public.widget_sites w
  where w.user_id=auth.uid() and w.deleted_at is null;
  return v_result;
end;
$$;

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
set search_path = public
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
    if not ((v_source='en' and v_target='hyw') or (v_source='hyw' and v_target='en') or (v_source='hye' and v_target='hyw')) then raise exception 'Unsupported language pair'; end if;
    v_branding := coalesce(p_show_branding,true);
    if not v_branding and coalesce((v_plan->>'widget_branding_removable')::boolean,false) is not true then raise exception 'This plan requires Tun branding'; end if;
    v_key := 'wpk_' || encode(gen_random_bytes(24),'hex');
    insert into public.widget_sites(user_id,name,allowed_domain,public_key,active,theme,default_source_language,default_target_language,show_branding)
    values(v_owner,btrim(p_name),v_domain,v_key,coalesce(p_active,true),coalesce(p_theme,'auto'),v_source,v_target,v_branding)
    returning * into v_site;
  elsif p_action = 'update' then
    v_source := coalesce(p_source_language,(select default_source_language from public.widget_sites where id=p_widget_id));
    v_target := coalesce(p_target_language,(select default_target_language from public.widget_sites where id=p_widget_id));
    if not ((v_source='en' and v_target='hyw') or (v_source='hyw' and v_target='en') or (v_source='hye' and v_target='hyw')) then raise exception 'Unsupported language pair'; end if;
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

create or replace function public.admin_widget_sites()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_result jsonb;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', w.id, 'name', w.name, 'allowed_domain', w.allowed_domain, 'public_key', w.public_key,
    'active', w.active, 'deleted_at', w.deleted_at, 'theme', w.theme,
    'default_source_language', w.default_source_language, 'default_target_language', w.default_target_language,
    'show_branding', w.show_branding, 'last_used_at', w.last_used_at, 'created_at', w.created_at,
    'owner', jsonb_build_object('id',p.id,'email',p.email,'display_name',p.display_name),
    'effective_plan', public.effective_plan_for_user(w.user_id),
    'monthly_translations', (select count(*) from public.widget_usage_events e where e.widget_site_id=w.id and e.success and e.created_at>=date_trunc('month',now())),
    'monthly_characters', (select coalesce(sum(e.character_count),0) from public.widget_usage_events e where e.widget_site_id=w.id and e.success and e.created_at>=date_trunc('month',now())),
    'blocked_requests', (select count(*) from public.widget_usage_events e where e.widget_site_id=w.id and not e.success and e.created_at>=date_trunc('month',now()))
  ) order by w.created_at desc), '[]'::jsonb)
  into v_result
  from public.widget_sites w join public.profiles p on p.id=w.user_id;
  return v_result;
end;
$$;

alter table public.user_plan_overrides enable row level security;
alter table public.widget_sites enable row level security;
alter table public.widget_usage_events enable row level security;

drop policy if exists plan_overrides_owner_read on public.user_plan_overrides;
create policy plan_overrides_owner_read on public.user_plan_overrides
  for select using (public.is_admin());

drop policy if exists widget_sites_owner_read on public.widget_sites;
create policy widget_sites_owner_read on public.widget_sites
  for select using (user_id=auth.uid() or public.is_admin());

drop policy if exists widget_usage_owner_read on public.widget_usage_events;
create policy widget_usage_owner_read on public.widget_usage_events
  for select using (user_id=auth.uid() or public.is_admin());

grant select on public.user_plan_overrides, public.widget_sites, public.widget_usage_events to authenticated;
grant all on public.user_plan_overrides, public.widget_sites, public.widget_usage_events to service_role;
revoke insert, update, delete on public.user_plan_overrides, public.widget_sites, public.widget_usage_events from anon, authenticated;

revoke all on function public.widget_monthly_characters_for_user(uuid) from public, anon, authenticated;
revoke all on function public.effective_plan_for_user(uuid) from public, anon, authenticated;
revoke all on function public.get_my_effective_plan() from public, anon, authenticated;
revoke all on function public.admin_users_with_effective_plans() from public, anon, authenticated;
revoke all on function public.admin_set_user_plan_override(uuid,text,timestamptz,text) from public, anon, authenticated;
revoke all on function public.get_my_widget_sites() from public, anon, authenticated;
revoke all on function public.manage_widget_site(text,uuid,text,text,boolean,text,text,text,boolean) from public, anon, authenticated;
revoke all on function public.admin_widget_sites() from public, anon, authenticated;
grant execute on function public.widget_monthly_characters_for_user(uuid) to service_role;
grant execute on function public.effective_plan_for_user(uuid) to service_role;
grant execute on function public.get_my_effective_plan() to authenticated;
grant execute on function public.get_current_usage() to authenticated;
grant execute on function public.admin_users_with_effective_plans() to authenticated;
grant execute on function public.admin_set_user_plan_override(uuid,text,timestamptz,text) to authenticated;
grant execute on function public.get_my_widget_sites() to authenticated;
grant execute on function public.manage_widget_site(text,uuid,text,text,boolean,text,text,text,boolean) to authenticated;
grant execute on function public.admin_widget_sites() to authenticated;
