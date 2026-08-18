-- Admin Analytics & Audit Logs foundation.
--
-- Reuses the existing operational tables and admin_audit_log instead of
-- creating parallel stores. Analytics intentionally uses operational metadata
-- only; translation source/output text is not copied into analytics or audit
-- records.


-- Improve filtering for the existing audit feed.

create index if not exists
  admin_audit_log_action_created_idx
on public.admin_audit_log (
  action,
  created_at desc
);

create index if not exists
  admin_audit_log_target_created_idx
on public.admin_audit_log (
  target_type,
  created_at desc
);


-- Capture important browser-admin/editor mutations that previously relied on
-- RLS but did not create an audit entry. This trigger function is SECURITY
-- DEFINER because authenticated users intentionally do not have INSERT access
-- to admin_audit_log.

create or replace function public.capture_admin_audit_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid;
  v_role text;
  v_action text;
  v_target_id text;
  v_details jsonb := '{}'::jsonb;
  v_old jsonb;
  v_new jsonb;
begin
  v_actor := auth.uid();

  -- Service-role CMS writes may carry the verified editor/admin identity in
  -- created_by / updated_by even though auth.uid() is null on the DB client.
  if v_actor is null and tg_op <> 'DELETE' then
    v_new := to_jsonb(new);

    if v_new ? 'updated_by' then
      begin
        v_actor := nullif(v_new ->> 'updated_by', '')::uuid;
      exception
        when invalid_text_representation then
          v_actor := null;
      end;
    end if;

    if v_actor is null and v_new ? 'created_by' then
      begin
        v_actor := nullif(v_new ->> 'created_by', '')::uuid;
      exception
        when invalid_text_representation then
          v_actor := null;
      end;
    end if;
  end if;

  if v_actor is null and tg_op = 'DELETE' then
    v_old := to_jsonb(old);

    if v_old ? 'updated_by' then
      begin
        v_actor := nullif(v_old ->> 'updated_by', '')::uuid;
      exception
        when invalid_text_representation then
          v_actor := null;
      end;
    end if;

    if v_actor is null and v_old ? 'created_by' then
      begin
        v_actor := nullif(v_old ->> 'created_by', '')::uuid;
      exception
        when invalid_text_representation then
          v_actor := null;
      end;
    end if;
  end if;

  if v_actor is null then
    return coalesce(new, old);
  end if;

  select p.role
    into v_role
  from public.profiles as p
  where p.id = v_actor;

  if v_role not in ('admin', 'language_editor') then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    v_new := coalesce(v_new, to_jsonb(new));
    v_target_id := v_new ->> 'id';
    v_action := tg_table_name || '_created';
  elsif tg_op = 'DELETE' then
    v_old := coalesce(v_old, to_jsonb(old));
    v_target_id := v_old ->> 'id';
    v_action := tg_table_name || '_deleted';
  else
    v_old := to_jsonb(old);
    v_new := coalesce(v_new, to_jsonb(new));
    v_target_id := v_new ->> 'id';
    v_action := tg_table_name || '_updated';
  end if;

  -- Keep details intentionally narrow. Do not copy full translations, notes,
  -- examples, teaching content, profile email or other free-form payloads.
  if tg_table_name = 'profiles' then
    if tg_op <> 'UPDATE'
      or old.role is not distinct from new.role then
      return coalesce(new, old);
    end if;

    v_action := 'user_role_changed';
    v_details := jsonb_build_object(
      'previous_role', old.role,
      'new_role', new.role
    );

  elsif tg_table_name = 'glossary_terms' then
    v_details := jsonb_build_object(
      'source_language', coalesce(v_new ->> 'source_language', v_old ->> 'source_language'),
      'target_language', coalesce(v_new ->> 'target_language', v_old ->> 'target_language'),
      'approved', coalesce((v_new ->> 'approved')::boolean, (v_old ->> 'approved')::boolean),
      'commercial_use_allowed', coalesce((v_new ->> 'commercial_use_allowed')::boolean, (v_old ->> 'commercial_use_allowed')::boolean)
    );

  elsif tg_table_name = 'grammar_rules' then
    v_details := jsonb_build_object(
      'source_language', coalesce(v_new ->> 'source_language', v_old ->> 'source_language'),
      'target_language', coalesce(v_new ->> 'target_language', v_old ->> 'target_language'),
      'approved', coalesce((v_new ->> 'approved')::boolean, (v_old ->> 'approved')::boolean),
      'commercial_use_allowed', coalesce((v_new ->> 'commercial_use_allowed')::boolean, (v_old ->> 'commercial_use_allowed')::boolean),
      'tooltip_enabled', coalesce((v_new ->> 'tooltip_enabled')::boolean, (v_old ->> 'tooltip_enabled')::boolean)
    );

  elsif tg_table_name = 'approved_translation_examples' then
    v_details := jsonb_build_object(
      'source_language', coalesce(v_new ->> 'source_language', v_old ->> 'source_language'),
      'target_language', coalesce(v_new ->> 'target_language', v_old ->> 'target_language'),
      'approved', coalesce((v_new ->> 'approved')::boolean, (v_old ->> 'approved')::boolean),
      'commercial_use_allowed', coalesce((v_new ->> 'commercial_use_allowed')::boolean, (v_old ->> 'commercial_use_allowed')::boolean)
    );

  elsif tg_table_name = 'daily_practice_phrases' then
    v_details := jsonb_build_object(
      'practice_date', coalesce(v_new ->> 'practice_date', v_old ->> 'practice_date'),
      'published', coalesce((v_new ->> 'published')::boolean, (v_old ->> 'published')::boolean),
      'archived', coalesce(v_new ->> 'archived_at', v_old ->> 'archived_at') is not null
    );

  elsif tg_table_name = 'role_play_scenarios' then
    v_details := jsonb_build_object(
      'slug', coalesce(v_new ->> 'slug', v_old ->> 'slug'),
      'published', coalesce((v_new ->> 'published')::boolean, (v_old ->> 'published')::boolean),
      'archived', coalesce(v_new ->> 'archived_at', v_old ->> 'archived_at') is not null
    );
  end if;

  insert into public.admin_audit_log (
    admin_user_id,
    action,
    target_type,
    target_id,
    safe_details
  )
  values (
    v_actor,
    v_action,
    tg_table_name,
    v_target_id,
    v_details
  );

  return coalesce(new, old);
end;
$$;


-- Profiles only need role-change auditing. Other profile preference/account
-- changes remain user-owned and should not become admin audit noise.

drop trigger if exists
  profiles_admin_audit
on public.profiles;

create trigger profiles_admin_audit
after update
on public.profiles
for each row
when (old.role is distinct from new.role)
execute function public.capture_admin_audit_event();


-- Knowledge CMS changes are made directly through authenticated RLS clients.

drop trigger if exists
  glossary_terms_admin_audit
on public.glossary_terms;

create trigger glossary_terms_admin_audit
after insert or update or delete
on public.glossary_terms
for each row
execute function public.capture_admin_audit_event();


drop trigger if exists
  grammar_rules_admin_audit
on public.grammar_rules;

create trigger grammar_rules_admin_audit
after insert or update or delete
on public.grammar_rules
for each row
execute function public.capture_admin_audit_event();


drop trigger if exists
  approved_translation_examples_admin_audit
on public.approved_translation_examples;

create trigger approved_translation_examples_admin_audit
after insert or update or delete
on public.approved_translation_examples
for each row
execute function public.capture_admin_audit_event();


-- Service-role CMS functions populate created_by/updated_by, allowing the
-- trigger helper to retain the verified administrator identity.

do $$
begin
  if to_regclass('public.daily_practice_phrases') is not null then
    execute 'drop trigger if exists daily_practice_phrases_admin_audit on public.daily_practice_phrases';
    execute 'create trigger daily_practice_phrases_admin_audit after insert or update or delete on public.daily_practice_phrases for each row execute function public.capture_admin_audit_event()';
  end if;

  if to_regclass('public.role_play_scenarios') is not null then
    execute 'drop trigger if exists role_play_scenarios_admin_audit on public.role_play_scenarios';
    execute 'create trigger role_play_scenarios_admin_audit after insert or update or delete on public.role_play_scenarios for each row execute function public.capture_admin_audit_event()';
  end if;
end $$;


-- Admin-only analytics assembled from existing privacy-safe operational
-- metadata. No translation source text or translated text is returned.

create or replace function public.admin_operations_analytics(
  p_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_days integer;
  v_start timestamptz;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  v_days := case
    when p_days in (7, 30, 60, 90) then p_days
    else 30
  end;

  v_start := date_trunc('day', now()) - make_interval(days => v_days - 1);

  with dates as (
    select generate_series(
      v_start,
      date_trunc('day', now()),
      interval '1 day'
    ) as day_start
  ),
  usage_daily as (
    select
      date_trunc('day', u.created_at) as day_start,
      count(*)::bigint as requests,
      count(*) filter (where u.success)::bigint as successful,
      count(*) filter (where not u.success)::bigint as failed,
      coalesce(sum(u.character_count), 0)::bigint as characters,
      coalesce(sum(u.estimated_cost_usd), 0)::numeric as estimated_cost_usd
    from public.usage_events as u
    where u.created_at >= v_start
    group by 1
  ),
  widget_daily as (
    select
      date_trunc('day', w.created_at) as day_start,
      count(*)::bigint as requests,
      count(*) filter (where w.success)::bigint as successful,
      count(*) filter (where not w.success)::bigint as failed
    from public.widget_usage_events as w
    where w.created_at >= v_start
    group by 1
  ),
  user_daily as (
    select
      date_trunc('day', p.created_at) as day_start,
      count(*)::bigint as new_users
    from public.profiles as p
    where p.created_at >= v_start
    group by 1
  ),
  error_daily as (
    select
      date_trunc('day', e.created_at) as day_start,
      count(*)::bigint as system_errors
    from public.system_errors as e
    where e.created_at >= v_start
    group by 1
  ),
  audit_daily as (
    select
      date_trunc('day', a.created_at) as day_start,
      count(*)::bigint as audit_events
    from public.admin_audit_log as a
    where a.created_at >= v_start
    group by 1
  ),
  daily as (
    select jsonb_agg(
      jsonb_build_object(
        'date', to_char(d.day_start, 'YYYY-MM-DD'),
        'translation_requests', coalesce(u.requests, 0),
        'successful_translations', coalesce(u.successful, 0),
        'failed_translations', coalesce(u.failed, 0),
        'characters', coalesce(u.characters, 0),
        'estimated_cost_usd', coalesce(u.estimated_cost_usd, 0),
        'widget_requests', coalesce(w.requests, 0),
        'widget_successful', coalesce(w.successful, 0),
        'widget_failed', coalesce(w.failed, 0),
        'new_users', coalesce(n.new_users, 0),
        'system_errors', coalesce(e.system_errors, 0),
        'audit_events', coalesce(a.audit_events, 0)
      )
      order by d.day_start
    ) as value
    from dates as d
    left join usage_daily as u using (day_start)
    left join widget_daily as w using (day_start)
    left join user_daily as n using (day_start)
    left join error_daily as e using (day_start)
    left join audit_daily as a using (day_start)
  ),
  directions as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'source_language', ranked.source_language,
          'target_language', ranked.target_language,
          'requests', ranked.requests
        )
        order by ranked.requests desc
      ),
      '[]'::jsonb
    ) as value
    from (
      select
        u.source_language,
        u.target_language,
        count(*)::bigint as requests
      from public.usage_events as u
      where u.created_at >= v_start
      group by u.source_language, u.target_language
      order by requests desc
      limit 10
    ) as ranked
  ),
  plans as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'plan', ranked.plan_slug,
          'requests', ranked.requests,
          'characters', ranked.characters
        )
        order by ranked.requests desc
      ),
      '[]'::jsonb
    ) as value
    from (
      select
        coalesce(nullif(u.plan_slug, ''), 'unknown') as plan_slug,
        count(*)::bigint as requests,
        coalesce(sum(u.character_count), 0)::bigint as characters
      from public.usage_events as u
      where u.created_at >= v_start
      group by 1
      order by requests desc
    ) as ranked
  ),
  recent_errors as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', ranked.id,
          'error_code', ranked.error_code,
          'safe_message', ranked.safe_message,
          'function_name', ranked.function_name,
          'created_at', ranked.created_at
        )
        order by ranked.created_at desc
      ),
      '[]'::jsonb
    ) as value
    from (
      select
        e.id,
        e.error_code,
        e.safe_message,
        e.function_name,
        e.created_at
      from public.system_errors as e
      where e.created_at >= v_start
      order by e.created_at desc
      limit 20
    ) as ranked
  )
  select jsonb_build_object(
    'days', v_days,
    'generated_at', now(),
    'totals', jsonb_build_object(
      'translation_requests', (
        select count(*) from public.usage_events where created_at >= v_start
      ),
      'successful_translations', (
        select count(*) from public.usage_events where created_at >= v_start and success
      ),
      'failed_translations', (
        select count(*) from public.usage_events where created_at >= v_start and not success
      ),
      'characters', (
        select coalesce(sum(character_count), 0) from public.usage_events where created_at >= v_start
      ),
      'estimated_cost_usd', (
        select coalesce(sum(estimated_cost_usd), 0) from public.usage_events where created_at >= v_start
      ),
      'active_users', (
        select count(*) from public.profiles where last_active_at >= v_start
      ),
      'new_users', (
        select count(*) from public.profiles where created_at >= v_start
      ),
      'widget_requests', (
        select count(*) from public.widget_usage_events where created_at >= v_start
      ),
      'system_errors', (
        select count(*) from public.system_errors where created_at >= v_start
      ),
      'audit_events', (
        select count(*) from public.admin_audit_log where created_at >= v_start
      )
    ),
    'daily', daily.value,
    'directions', directions.value,
    'plans', plans.value,
    'recent_errors', recent_errors.value
  )
  into v_result
  from daily, directions, plans, recent_errors;

  return v_result;
end;
$$;


-- Admin-only paged audit feed with actor identity. safe_details is returned as
-- stored; no private translation text is added by this function.

create or replace function public.admin_audit_feed(
  p_limit integer default 100,
  p_offset integer default 0,
  p_action text default null,
  p_target_type text default null
)
returns table (
  id uuid,
  admin_user_id uuid,
  admin_email text,
  admin_display_name text,
  action text,
  target_type text,
  target_id text,
  safe_details jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  return query
  select
    a.id,
    a.admin_user_id,
    p.email,
    p.display_name,
    a.action,
    a.target_type,
    a.target_id,
    a.safe_details,
    a.created_at
  from public.admin_audit_log as a
  left join public.profiles as p
    on p.id = a.admin_user_id
  where
    (
      p_action is null
      or btrim(p_action) = ''
      or a.action = btrim(p_action)
    )
    and (
      p_target_type is null
      or btrim(p_target_type) = ''
      or a.target_type = btrim(p_target_type)
    )
  order by a.created_at desc
  limit greatest(
    1,
    least(
      coalesce(p_limit, 100),
      200
    )
  )
  offset greatest(
    0,
    least(
      coalesce(p_offset, 0),
      5000
    )
  );
end;
$$;


revoke all
on function public.capture_admin_audit_event()
from public, anon, authenticated;

revoke all
on function public.admin_operations_analytics(integer)
from public, anon, authenticated;

grant execute
on function public.admin_operations_analytics(integer)
to authenticated;

revoke all
on function public.admin_audit_feed(integer, integer, text, text)
from public, anon, authenticated;

grant execute
on function public.admin_audit_feed(integer, integer, text, text)
to authenticated;


comment on function public.admin_operations_analytics(integer) is
  'Admin-only privacy-safe operational analytics for the selected recent day window.';

comment on function public.admin_audit_feed(integer, integer, text, text) is
  'Admin-only paged audit feed with actor identity and safe metadata.';
