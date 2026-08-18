-- System Feature Toggles foundation.
--
-- Reuse the existing platform_settings store for runtime configuration. These
-- toggles are an operational kill-switch layer on top of normal plan/role
-- entitlements; disabling a feature never grants access that the account would
-- not otherwise have.

insert into public.platform_settings (
  key,
  value,
  description
)
values (
  'feature_toggles',
  '{
    "translation": true,
    "audio": true,
    "pronunciation": true,
    "thesaurus": true,
    "role_play": true,
    "word_breakdown": true,
    "saved_phrases": true,
    "vocabulary_decks": true,
    "flashcards": true,
    "history": true,
    "practice_streak": true,
    "practice_analytics": true,
    "daily_practice": true,
    "grammar_tooltips": true,
    "embeddable_widgets": true
  }'::jsonb,
  'Administrator-managed runtime feature switches. Disabled features remain unavailable even when the account plan would otherwise permit access.'
)
on conflict (key) do nothing;


alter table public.platform_settings
  drop constraint if exists platform_settings_feature_toggles_check;

alter table public.platform_settings
  add constraint platform_settings_feature_toggles_check
  check (
    key <> 'feature_toggles'
    or (
      jsonb_typeof(value) = 'object'
      and jsonb_typeof(value -> 'translation') = 'boolean'
      and jsonb_typeof(value -> 'audio') = 'boolean'
      and jsonb_typeof(value -> 'pronunciation') = 'boolean'
      and jsonb_typeof(value -> 'thesaurus') = 'boolean'
      and jsonb_typeof(value -> 'role_play') = 'boolean'
      and jsonb_typeof(value -> 'word_breakdown') = 'boolean'
      and jsonb_typeof(value -> 'saved_phrases') = 'boolean'
      and jsonb_typeof(value -> 'vocabulary_decks') = 'boolean'
      and jsonb_typeof(value -> 'flashcards') = 'boolean'
      and jsonb_typeof(value -> 'history') = 'boolean'
      and jsonb_typeof(value -> 'practice_streak') = 'boolean'
      and jsonb_typeof(value -> 'practice_analytics') = 'boolean'
      and jsonb_typeof(value -> 'daily_practice') = 'boolean'
      and jsonb_typeof(value -> 'grammar_tooltips') = 'boolean'
      and jsonb_typeof(value -> 'embeddable_widgets') = 'boolean'
      and (
        value
        - array[
          'translation',
          'audio',
          'pronunciation',
          'thesaurus',
          'role_play',
          'word_breakdown',
          'saved_phrases',
          'vocabulary_decks',
          'flashcards',
          'history',
          'practice_streak',
          'practice_analytics',
          'daily_practice',
          'grammar_tooltips',
          'embeddable_widgets'
        ]::text[]
      ) = '{}'::jsonb
    )
  );


create or replace function public.get_system_feature_toggles()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    '{
      "translation": true,
      "audio": true,
      "pronunciation": true,
      "thesaurus": true,
      "role_play": true,
      "word_breakdown": true,
      "saved_phrases": true,
      "vocabulary_decks": true,
      "flashcards": true,
      "history": true,
      "practice_streak": true,
      "practice_analytics": true,
      "daily_practice": true,
      "grammar_tooltips": true,
      "embeddable_widgets": true
    }'::jsonb
    || coalesce(
      (
        select setting.value
        from public.platform_settings as setting
        where setting.key = 'feature_toggles'
        limit 1
      ),
      '{}'::jsonb
    );
$$;


create or replace function public.admin_set_system_feature_toggles(
  p_toggles jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_defaults constant jsonb :=
    '{
      "translation": true,
      "audio": true,
      "pronunciation": true,
      "thesaurus": true,
      "role_play": true,
      "word_breakdown": true,
      "saved_phrases": true,
      "vocabulary_decks": true,
      "flashcards": true,
      "history": true,
      "practice_streak": true,
      "practice_analytics": true,
      "daily_practice": true,
      "grammar_tooltips": true,
      "embeddable_widgets": true
    }'::jsonb;
  v_previous jsonb;
  v_next jsonb;
  v_unknown_key text;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  if p_toggles is null
    or jsonb_typeof(p_toggles) <> 'object' then
    raise exception 'Feature toggles must be a JSON object';
  end if;

  select item.toggle_key
    into v_unknown_key
  from jsonb_object_keys(p_toggles) as item(toggle_key)
  where item.toggle_key not in (
    'translation',
    'audio',
    'pronunciation',
    'thesaurus',
    'role_play',
    'word_breakdown',
    'saved_phrases',
    'vocabulary_decks',
    'flashcards',
    'history',
    'practice_streak',
    'practice_analytics',
    'daily_practice',
    'grammar_tooltips',
    'embeddable_widgets'
  )
  limit 1;

  if v_unknown_key is not null then
    raise exception 'Unsupported feature toggle: %', v_unknown_key;
  end if;

  if exists (
    select 1
    from jsonb_each(p_toggles) as item(toggle_key, toggle_value)
    where jsonb_typeof(item.toggle_value) <> 'boolean'
  ) then
    raise exception 'Feature toggle values must be true or false';
  end if;

  v_previous := public.get_system_feature_toggles();
  v_next := v_defaults || p_toggles;

  insert into public.platform_settings (
    key,
    value,
    description,
    updated_by,
    updated_at
  )
  values (
    'feature_toggles',
    v_next,
    'Administrator-managed runtime feature switches. Disabled features remain unavailable even when the account plan would otherwise permit access.',
    auth.uid(),
    now()
  )
  on conflict (key) do update
  set
    value = excluded.value,
    description = excluded.description,
    updated_by = auth.uid(),
    updated_at = now();

  insert into public.admin_audit_log (
    admin_user_id,
    action,
    target_type,
    target_id,
    safe_details
  )
  values (
    auth.uid(),
    'system_feature_toggles_updated',
    'platform_settings',
    'feature_toggles',
    jsonb_build_object(
      'previous', v_previous,
      'new', v_next
    )
  );

  return v_next;
end;
$$;


revoke all
on function public.get_system_feature_toggles()
from public, anon, authenticated;

grant execute
on function public.get_system_feature_toggles()
to anon, authenticated, service_role;

revoke all
on function public.admin_set_system_feature_toggles(jsonb)
from public, anon, authenticated;

grant execute
on function public.admin_set_system_feature_toggles(jsonb)
to authenticated;


comment on function public.get_system_feature_toggles() is
  'Returns the public boolean runtime feature switches. These switches do not replace plan or role entitlements.';

comment on function public.admin_set_system_feature_toggles(jsonb) is
  'Admin-only audited update for the runtime feature switch configuration.';
