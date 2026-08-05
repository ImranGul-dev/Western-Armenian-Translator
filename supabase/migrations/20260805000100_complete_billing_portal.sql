-- Phase 3: complete Stripe Billing operations, customer portal, admin billing views,
-- customer payment history, privacy-controlled query review and audit logging.

alter table public.plans
  add column if not exists stripe_product_id text,
  add column if not exists stripe_price_id text,
  add column if not exists currency text not null default 'usd',
  add column if not exists billing_interval text not null default 'month'
    check (billing_interval in ('day','week','month','year'));

create unique index if not exists plans_stripe_price_unique_idx
  on public.plans(stripe_price_id)
  where stripe_price_id is not null;

alter table public.profiles
  add column if not exists query_review_consent boolean not null default false;

alter table public.translation_history
  add column if not exists admin_visible boolean not null default false;

create index if not exists translation_history_admin_review_idx
  on public.translation_history(admin_visible, created_at desc)
  where admin_visible;

alter table public.subscriptions
  add column if not exists billing_provider text not null default 'stripe'
    check (billing_provider in ('stripe')),
  add column if not exists stripe_subscription_item_id text,
  add column if not exists stripe_price_id text,
  add column if not exists plan_slug text,
  add column if not exists amount_cents integer check (amount_cents is null or amount_cents >= 0),
  add column if not exists currency text,
  add column if not exists billing_interval text,
  add column if not exists billing_interval_count integer,
  add column if not exists quantity integer not null default 1 check (quantity > 0),
  add column if not exists latest_invoice_id text,
  add column if not exists next_payment_at timestamptz,
  add column if not exists last_payment_at timestamptz,
  add column if not exists canceled_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists trial_end timestamptz,
  add column if not exists pause_collection_behavior text,
  add column if not exists pause_resumes_at timestamptz,
  add column if not exists access_suspended boolean not null default false,
  add column if not exists access_suspended_reason text,
  add column if not exists synced_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists subscriptions_status_idx on public.subscriptions(status, updated_at desc);
create index if not exists subscriptions_plan_slug_idx on public.subscriptions(plan_slug, status);
create index if not exists subscriptions_customer_idx on public.subscriptions(stripe_customer_id);

create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_invoice_id text not null unique,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  invoice_number text,
  status text not null,
  billing_reason text,
  amount_due integer not null default 0,
  amount_paid integer not null default 0,
  amount_remaining integer not null default 0,
  refunded_amount integer not null default 0,
  currency text not null default 'usd',
  hosted_invoice_url text,
  invoice_pdf text,
  failure_code text,
  failure_message text,
  period_start timestamptz,
  period_end timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  raw_summary jsonb not null default '{}'::jsonb
);

create index if not exists billing_payments_user_created_idx
  on public.billing_payments(user_id, created_at desc);
create index if not exists billing_payments_status_created_idx
  on public.billing_payments(status, created_at desc);
create index if not exists billing_payments_subscription_idx
  on public.billing_payments(stripe_subscription_id, created_at desc);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  safe_details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx on public.admin_audit_log(created_at desc);
create index if not exists admin_audit_log_admin_idx on public.admin_audit_log(admin_user_id, created_at desc);

insert into public.platform_settings(key,value,description)
values
  ('query_review', '{"enabled":true,"requires_user_consent":true,"anonymous_text_storage":false}'::jsonb,
   'Controls privacy-safe administrator review of authenticated translation history.'),
  ('billing', '{"provider":"stripe","customer_portal":true,"admin_actions":true}'::jsonb,
   'Billing architecture. Stripe is the source of truth for subscriptions and invoices.')
on conflict (key) do nothing;

drop trigger if exists billing_payments_updated_at on public.billing_payments;
create trigger billing_payments_updated_at
before update on public.billing_payments
for each row execute function public.set_updated_at();

create or replace function public.admin_commercial_stats()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  select jsonb_build_object(
    'registered_users', (select count(*) from public.profiles),
    'active_users_30d', (select count(*) from public.profiles where last_active_at >= now()-interval '30 days'),
    'active_subscribers', (select count(*) from public.subscriptions where status in ('active','trialing','past_due') and not access_suspended),
    'past_due_subscribers', (select count(*) from public.subscriptions where status='past_due'),
    'canceling_subscribers', (select count(*) from public.subscriptions where cancel_at_period_end),
    'suspended_subscribers', (select count(*) from public.subscriptions where access_suspended),
    'payments_month', (select count(*) from public.billing_payments where status='paid' and paid_at >= date_trunc('month',now())),
    'revenue_month_minor_units', (select coalesce(sum(amount_paid-refunded_amount),0) from public.billing_payments where status='paid' and paid_at >= date_trunc('month',now())),
    'failed_payments_month', (select count(*) from public.billing_payments where status in ('open','uncollectible') and created_at >= date_trunc('month',now())),
    'reviewable_queries', (select count(*) from public.translation_history where admin_visible)
  ) into result;
  return result;
end $$;

alter table public.billing_payments enable row level security;
alter table public.admin_audit_log enable row level security;

-- Add a narrow admin review policy without changing ownership of user history.
drop policy if exists history_admin_review on public.translation_history;
create policy history_admin_review on public.translation_history
  for select using (public.is_admin() and admin_visible);

create policy billing_payments_owner_read on public.billing_payments
  for select using (user_id=auth.uid() or public.is_admin());

create policy billing_payments_admin_write on public.billing_payments
  for all using (public.is_admin()) with check (public.is_admin());

create policy admin_audit_log_admin_read on public.admin_audit_log
  for select using (public.is_admin());

-- Writes are performed only by service-role Edge Functions.
grant select on public.billing_payments to authenticated;
grant select on public.admin_audit_log to authenticated;
grant execute on function public.admin_commercial_stats() to authenticated;
grant all on public.billing_payments,public.admin_audit_log to service_role;

revoke insert,update,delete on public.billing_payments from anon,authenticated;
revoke insert,update,delete on public.admin_audit_log from anon,authenticated;
