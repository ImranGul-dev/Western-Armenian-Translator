-- Add explicit user-selected country support.
-- Country is not inferred from IP, browser locale, or billing information.

alter table public.profiles
  add column if not exists country_code text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_country_code_format_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_country_code_format_check
      check (
        country_code is null
        or country_code ~ '^[A-Z]{2}$'
      );
  end if;
end;
$$;

comment on column public.profiles.country_code is
  'User-selected two-letter country code. Null when not set.';


-- New accounts copy a valid country code from Auth metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_free_plan uuid;
  v_country_code text;
begin
  select id
  into v_free_plan
  from public.plans
  where slug = 'free'
  limit 1;

  v_country_code :=
    upper(
      nullif(
        btrim(
          coalesce(
            new.raw_user_meta_data->>'country_code',
            ''
          )
        ),
        ''
      )
    );

  if v_country_code is not null
     and v_country_code !~ '^[A-Z]{2}$'
  then
    v_country_code := null;
  end if;

  insert into public.profiles (
    id,
    email,
    display_name,
    country_code,
    current_plan_id
  )
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      ''
    ),
    v_country_code,
    v_free_plan
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


-- Backfill only when an existing Auth user already has valid metadata.
update public.profiles p
set country_code =
  upper(u.raw_user_meta_data->>'country_code')
from auth.users u
where p.id = u.id
  and p.country_code is null
  and upper(
    coalesce(
      u.raw_user_meta_data->>'country_code',
      ''
    )
  ) ~ '^[A-Z]{2}$';


-- Preserve the current Admin Users RPC and add country_code.
create or replace function public.admin_users_with_effective_plans()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'email', p.email,
        'display_name', p.display_name,
        'country_code', p.country_code,
        'role', p.role,
        'created_at', p.created_at,
        'last_active_at', p.last_active_at,
        'effective_plan', public.effective_plan_for_user(p.id),

        'subscription',
        case
          when s.id is null then null
          else jsonb_build_object(
            'id', s.id,
            'plan_slug', s.plan_slug,
            'status', s.status,
            'access_suspended', s.access_suspended,
            'cancel_at_period_end', s.cancel_at_period_end,
            'stripe_customer_id', s.stripe_customer_id,
            'stripe_subscription_id', s.stripe_subscription_id
          )
        end,

        'override',
        case
          when o.id is null then null
          else jsonb_build_object(
            'id', o.id,
            'plan_slug', op.slug,
            'active', o.active,
            'starts_at', o.starts_at,
            'expires_at', o.expires_at,
            'reason', o.reason,
            'assigned_by', o.assigned_by
          )
        end
      )
      order by p.created_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.profiles p
  left join public.subscriptions s
    on s.user_id = p.id
  left join public.user_plan_overrides o
    on o.user_id = p.id
  left join public.plans op
    on op.id = o.plan_id;

  return v_result;
end;
$$;