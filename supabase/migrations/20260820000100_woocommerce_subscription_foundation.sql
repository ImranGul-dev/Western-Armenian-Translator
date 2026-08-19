-- WooCommerce subscription foundation.
--
-- WooCommerce/Tun is the payment and subscription source of truth. The SaaS
-- keeps only the verified subscription state needed to decide plan access.
-- Existing Stripe columns/data are preserved so this migration is forward-only.


-- ============================================================
-- Subscription provider support
-- ============================================================

alter table public.subscriptions
  drop constraint if exists subscriptions_billing_provider_check;

alter table public.subscriptions
  add constraint subscriptions_billing_provider_check
  check (
    billing_provider in (
      'stripe',
      'woocommerce'
    )
  );

alter table public.subscriptions
  add column if not exists woocommerce_subscription_id bigint,
  add column if not exists woocommerce_order_id bigint,
  add column if not exists woocommerce_customer_id bigint,
  add column if not exists woocommerce_product_id bigint,
  add column if not exists woocommerce_billing_email text,
  add column if not exists provider_updated_at timestamptz;

create unique index if not exists
  subscriptions_woocommerce_subscription_unique_idx
on public.subscriptions (
  woocommerce_subscription_id
)
where woocommerce_subscription_id is not null;

create index if not exists
  subscriptions_woocommerce_customer_idx
on public.subscriptions (
  woocommerce_customer_id
)
where woocommerce_customer_id is not null;


-- ============================================================
-- WooCommerce product -> SaaS plan mapping
-- ============================================================

create table if not exists public.woocommerce_product_plan_map (
  product_id bigint primary key,
  plan_id uuid not null
    references public.plans(id)
    on delete restrict,
  plan_slug text not null
    check (
      plan_slug in (
        'premium',
        'business'
      )
    ),
  label text not null,
  checkout_url text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.woocommerce_product_plan_map (
  product_id,
  plan_id,
  plan_slug,
  label,
  checkout_url,
  active
)
select
  13793,
  plan.id,
  'premium',
  'Person',
  'https://tunapp.com/checkout?add-to-cart=13793',
  true
from public.plans as plan
where plan.slug = 'premium'
on conflict (product_id) do update set
  plan_id = excluded.plan_id,
  plan_slug = excluded.plan_slug,
  label = excluded.label,
  checkout_url = excluded.checkout_url,
  active = true,
  updated_at = now();

insert into public.woocommerce_product_plan_map (
  product_id,
  plan_id,
  plan_slug,
  label,
  checkout_url,
  active
)
select
  13794,
  plan.id,
  'business',
  'Elite / Schools',
  'https://tunapp.com/checkout?add-to-cart=13794',
  true
from public.plans as plan
where plan.slug = 'business'
on conflict (product_id) do update set
  plan_id = excluded.plan_id,
  plan_slug = excluded.plan_slug,
  label = excluded.label,
  checkout_url = excluded.checkout_url,
  active = true,
  updated_at = now();


drop trigger if exists
  woocommerce_product_plan_map_updated_at
on public.woocommerce_product_plan_map;

create trigger
  woocommerce_product_plan_map_updated_at
before update
on public.woocommerce_product_plan_map
for each row
execute function public.set_updated_at();

alter table public.woocommerce_product_plan_map
  enable row level security;

revoke all
on table public.woocommerce_product_plan_map
from anon, authenticated;

grant all
on table public.woocommerce_product_plan_map
to service_role;


-- ============================================================
-- Idempotent WooCommerce webhook event log
-- ============================================================

create table if not exists public.woocommerce_webhook_events (
  event_id text primary key,
  event_type text not null,
  topic text,
  woocommerce_subscription_id bigint,
  processing_status text not null default 'processing'
    check (
      processing_status in (
        'processing',
        'completed',
        'failed',
        'ignored',
        'unmatched'
      )
    ),
  last_error text,
  safe_summary jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists
  woocommerce_webhook_events_received_idx
on public.woocommerce_webhook_events (
  received_at desc
);

alter table public.woocommerce_webhook_events
  enable row level security;

revoke all
on table public.woocommerce_webhook_events
from anon, authenticated;

grant all
on table public.woocommerce_webhook_events
to service_role;


-- ============================================================
-- Billing provider setting
-- ============================================================

insert into public.platform_settings (
  key,
  value,
  description
)
values (
  'billing',
  '{
    "provider": "woocommerce",
    "source_of_truth": "woocommerce",
    "checkout_host": "tunapp.com",
    "product_map": {
      "13793": "premium",
      "13794": "business"
    }
  }'::jsonb,
  'WooCommerce on tunapp.com is the source of truth for paid subscriptions.'
)
on conflict (key) do update set
  value = coalesce(
    public.platform_settings.value,
    '{}'::jsonb
  ) || excluded.value,
  description = excluded.description,
  updated_at = now();


-- ============================================================
-- Effective plan now understands WooCommerce subscriptions
-- ============================================================
--
-- Access rule for this first integration:
--   WooCommerce `active` -> paid access.
--   pending/on-hold/pending-cancel/cancelled/expired -> Free.
--
-- This intentionally makes a user lose paid SaaS access as soon as a
-- cancellation moves the WooCommerce subscription out of `active`, matching
-- the requested "cancel -> disable" behaviour. Manual admin overrides still
-- take priority exactly as before.

create or replace function public.effective_plan_for_user(
  p_user_id uuid
)
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
  v_billing_provider text;
  v_stripe_subscription_id text;
  v_stripe_customer_id text;
  v_woocommerce_subscription_id bigint;
  v_woocommerce_customer_id bigint;
begin
  select role
    into v_role
  from public.profiles
  where id = p_user_id;

  if v_role is null then
    return null;
  end if;

  if v_role = 'admin' then
    select *
      into v_plan
    from public.plans
    where slug = 'business'
    limit 1;

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
      'billing_provider', null,
      'subscription_status', null,
      'stripe_status', null,
      'stripe_subscription_id', null,
      'stripe_customer_id', null,
      'woocommerce_subscription_id', null,
      'woocommerce_customer_id', null
    );
  end if;

  select
    override.plan_id,
    override.expires_at
  into
    v_plan_id,
    v_override_expires
  from public.user_plan_overrides as override
  where override.user_id = p_user_id
    and override.active
    and override.starts_at <= now()
    and (
      override.expires_at is null
      or override.expires_at > now()
    )
  limit 1;

  if found then
    select *
      into v_plan
    from public.plans
    where id = v_plan_id;

    v_source := 'manual';
  else
    select
      subscription.plan_id,
      subscription.status,
      subscription.billing_provider,
      subscription.stripe_subscription_id,
      subscription.stripe_customer_id,
      subscription.woocommerce_subscription_id,
      subscription.woocommerce_customer_id
    into
      v_plan_id,
      v_subscription_status,
      v_billing_provider,
      v_stripe_subscription_id,
      v_stripe_customer_id,
      v_woocommerce_subscription_id,
      v_woocommerce_customer_id
    from public.subscriptions as subscription
    join public.plans as plan
      on plan.id = subscription.plan_id
    where subscription.user_id = p_user_id
      and not subscription.access_suspended
      and (
        (
          subscription.billing_provider = 'woocommerce'
          and subscription.status = 'active'
        )
        or (
          subscription.billing_provider = 'stripe'
          and subscription.status in (
            'active',
            'trialing',
            'past_due'
          )
        )
      )
    order by subscription.updated_at desc
    limit 1;

    if found then
      select *
        into v_plan
      from public.plans
      where id = v_plan_id;

      v_source := v_billing_provider;
    else
      select *
        into v_plan
      from public.plans
      where slug = 'free'
      limit 1;

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
    'billing_provider', v_billing_provider,
    'subscription_status', v_subscription_status,
    'stripe_status', case
      when v_billing_provider = 'stripe'
        then v_subscription_status
      else null
    end,
    'stripe_subscription_id', case
      when v_billing_provider = 'stripe'
        then v_stripe_subscription_id
      else null
    end,
    'stripe_customer_id', case
      when v_billing_provider = 'stripe'
        then v_stripe_customer_id
      else null
    end,
    'woocommerce_subscription_id', case
      when v_billing_provider = 'woocommerce'
        then v_woocommerce_subscription_id
      else null
    end,
    'woocommerce_customer_id', case
      when v_billing_provider = 'woocommerce'
        then v_woocommerce_customer_id
      else null
    end
  );
end;
$$;


comment on table public.woocommerce_product_plan_map is
  'Maps WooCommerce subscription products on tunapp.com to Tun SaaS paid plans.';

comment on table public.woocommerce_webhook_events is
  'Idempotent processing log for verified WooCommerce subscription lifecycle events.';
