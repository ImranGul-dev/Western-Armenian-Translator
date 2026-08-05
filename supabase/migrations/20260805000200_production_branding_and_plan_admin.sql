-- Production configuration: administrator-managed plans and anonymous usage limits.
-- Paid access remains controlled by verified Stripe webhooks.

insert into public.platform_settings(key, value, description)
values (
  'anonymous_usage',
  '{"monthly_character_limit":20000,"max_characters_per_request":1500,"rate_limit_per_minute":10}'::jsonb,
  'Public translator limits for visitors who are not signed in.'
)
on conflict (key) do nothing;

-- Plans are publicly readable, but only administrators may change them.
drop policy if exists plans_admin_write on public.plans;
create policy plans_admin_write on public.plans
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant insert, update, delete on public.plans to authenticated;

-- Keep platform setting timestamps and editor attribution accurate.
create or replace function public.set_platform_setting_audit_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists platform_settings_audit_fields on public.platform_settings;
create trigger platform_settings_audit_fields
before insert or update on public.platform_settings
for each row execute function public.set_platform_setting_audit_fields();

-- Expose only non-sensitive translation limits to the public client.
create or replace function public.get_public_translation_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'anonymous', coalesce(
      (select value from public.platform_settings where key = 'anonymous_usage'),
      '{"monthly_character_limit":20000,"max_characters_per_request":1500,"rate_limit_per_minute":10}'::jsonb
    ),
    'free_plan', coalesce(
      (
        select jsonb_build_object(
          'monthly_character_limit', monthly_character_limit,
          'max_characters_per_request', max_characters_per_request,
          'rate_limit_per_minute', rate_limit_per_minute
        )
        from public.plans
        where slug = 'free'
        limit 1
      ),
      '{"monthly_character_limit":20000,"max_characters_per_request":1500,"rate_limit_per_minute":20}'::jsonb
    )
  );
$$;

grant execute on function public.get_public_translation_settings() to anon, authenticated;
