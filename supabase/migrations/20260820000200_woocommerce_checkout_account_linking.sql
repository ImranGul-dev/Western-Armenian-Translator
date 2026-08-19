-- Secure WooCommerce checkout account linking.
--
-- A logged-in Tun user receives a short-lived opaque checkout token. Only the
-- SHA-256 hash is stored in Supabase. The raw token is carried to tunapp.com,
-- copied onto the WooCommerce order/subscription, and returned by the existing
-- signed subscription webhook. This avoids relying on billing email as the
-- production account identifier.

create table if not exists public.woocommerce_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique
    check (token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  plan_id uuid not null
    references public.plans(id)
    on delete restrict,
  plan_slug text not null
    check (plan_slug in ('premium','business')),
  product_id bigint not null
    references public.woocommerce_product_plan_map(product_id)
    on delete restrict,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  woocommerce_subscription_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint woocommerce_checkout_session_expiry
    check (expires_at > created_at)
);

create index if not exists
  woocommerce_checkout_sessions_user_created_idx
on public.woocommerce_checkout_sessions (
  user_id,
  created_at desc
);

create index if not exists
  woocommerce_checkout_sessions_expiry_idx
on public.woocommerce_checkout_sessions (
  expires_at
)
where consumed_at is null;

create index if not exists
  woocommerce_checkout_sessions_subscription_idx
on public.woocommerce_checkout_sessions (
  woocommerce_subscription_id
)
where woocommerce_subscription_id is not null;

drop trigger if exists
  woocommerce_checkout_sessions_updated_at
on public.woocommerce_checkout_sessions;

create trigger
  woocommerce_checkout_sessions_updated_at
before update
on public.woocommerce_checkout_sessions
for each row
execute function public.set_updated_at();

alter table public.woocommerce_checkout_sessions
  enable row level security;

revoke all
on table public.woocommerce_checkout_sessions
from anon, authenticated;

grant all
on table public.woocommerce_checkout_sessions
to service_role;

comment on table public.woocommerce_checkout_sessions is
  'Short-lived server-created account links for WooCommerce subscription checkout. Raw checkout tokens are never stored.';
