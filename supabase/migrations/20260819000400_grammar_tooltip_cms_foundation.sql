-- Grammar Tooltip CMS foundation.
--
-- Extend the existing grammar_rules knowledge store instead of creating a
-- second, competing grammar CMS. Existing grammar rules remain the source of
-- truth for translation guidance; these fields add an optional learner-facing
-- explanation that can be shown when a configured trigger appears in output.

alter table public.grammar_rules
  add column if not exists tooltip_enabled boolean
    not null default false,
  add column if not exists tooltip_text text
    not null default '',
  add column if not exists tooltip_example text
    not null default '',
  add column if not exists tooltip_triggers text[]
    not null default '{}'::text[];


alter table public.grammar_rules
  drop constraint if exists grammar_rules_tooltip_text_check;

alter table public.grammar_rules
  add constraint grammar_rules_tooltip_text_check
  check (
    char_length(tooltip_text) <= 1200
    and char_length(tooltip_example) <= 1000
  );


alter table public.grammar_rules
  drop constraint if exists grammar_rules_tooltip_enabled_check;

alter table public.grammar_rules
  add constraint grammar_rules_tooltip_enabled_check
  check (
    tooltip_enabled = false
    or (
      char_length(btrim(tooltip_text)) between 1 and 1200
      and cardinality(tooltip_triggers) between 1 and 40
    )
  );


-- Narrow the learner lookup before trigger matching. Trigger matching itself is
-- intentionally substring-based because the CMS phrases may be individual
-- Armenian words, inflected forms or short constructions rather than exact
-- token boundaries.

create index if not exists
  grammar_rules_tooltip_lookup_idx
on public.grammar_rules (
  source_language,
  target_language,
  priority,
  title
)
where
  tooltip_enabled = true
  and approved = true
  and commercial_use_allowed = true;


create or replace function public.find_grammar_tooltips(
  p_text text,
  p_source_language text,
  p_target_language text,
  p_limit integer default 8
)
returns table (
  rule_id uuid,
  title text,
  explanation text,
  example text,
  rule_category text,
  matched_trigger text,
  priority integer
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    rule.id as rule_id,
    rule.title,
    rule.tooltip_text as explanation,
    rule.tooltip_example as example,
    rule.rule_category,
    matched.trigger_value as matched_trigger,
    rule.priority
  from public.grammar_rules as rule
  join lateral (
    select
      trigger_item.trigger_value
    from unnest(
      rule.tooltip_triggers
    ) with ordinality as trigger_item(
      trigger_value,
      trigger_order
    )
    where
      btrim(trigger_item.trigger_value) <> ''
      and position(
        lower(trigger_item.trigger_value)
        in lower(coalesce(p_text, ''))
      ) > 0
    order by
      char_length(trigger_item.trigger_value) desc,
      trigger_item.trigger_order asc
    limit 1
  ) as matched
    on true
  where
    rule.tooltip_enabled = true
    and rule.approved = true
    and rule.commercial_use_allowed = true
    and rule.source_language = p_source_language
    and rule.target_language = p_target_language
    and btrim(rule.tooltip_text) <> ''
  order by
    rule.priority asc,
    char_length(matched.trigger_value) desc,
    rule.title asc
  limit greatest(
    0,
    least(
      coalesce(p_limit, 8),
      20
    )
  );
$$;


-- Learners may include signed-in users or guests. This SECURITY DEFINER
-- function exposes only approved, commercial-use, tooltip-enabled fields; the
-- underlying grammar_rules table keeps its existing editor-only RLS policies.

revoke all
on function public.find_grammar_tooltips(
  text,
  text,
  text,
  integer
)
from public, anon, authenticated;

grant execute
on function public.find_grammar_tooltips(
  text,
  text,
  text,
  integer
)
to anon, authenticated, service_role;


comment on column public.grammar_rules.tooltip_enabled is
  'Whether this approved grammar rule may provide learner-facing tooltips.';

comment on column public.grammar_rules.tooltip_text is
  'Short learner-facing grammar explanation shown by the tooltip UI.';

comment on column public.grammar_rules.tooltip_example is
  'Optional concise example shown with the learner-facing grammar tooltip.';

comment on column public.grammar_rules.tooltip_triggers is
  'Output words or phrases that may trigger this grammar tooltip.';

comment on function public.find_grammar_tooltips(
  text,
  text,
  text,
  integer
) is
  'Returns approved learner-facing grammar tooltips whose configured triggers occur in the supplied translation text and language pair.';
