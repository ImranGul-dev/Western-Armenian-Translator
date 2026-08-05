-- Safe placeholder seed data. Every language item remains unapproved.
-- Replace placeholders only with expert-reviewed content that TunApp owns or may use commercially.

insert into public.glossary_terms (
  source_language,target_language,source_term,target_term,western_armenian_term,
  part_of_speech,definition,notes,source_name,copyright_status,commercial_use_allowed,approved
) values (
  'en','hyw','example source term','REPLACE_WITH_EXPERT_APPROVED_WESTERN_ARMENIAN',
  'REPLACE_WITH_EXPERT_APPROVED_WESTERN_ARMENIAN','noun','',
  'Placeholder only. Do not approve without expert review.','TunApp placeholder','Client-owned placeholder',false,false
)
on conflict (source_language,target_language,source_term) do update set approved=false;

insert into public.grammar_rules (
  source_language,target_language,title,description,rule_category,correct_examples,
  incorrect_examples,exceptions,keywords,priority,notes,source_name,copyright_status,
  commercial_use_allowed,approved
) values (
  'en','hyw','Example unapproved grammar rule',
  'REPLACE_WITH_EXPERT_APPROVED_WESTERN_ARMENIAN_RULE','general','[]'::jsonb,'[]'::jsonb,
  '[]'::jsonb,'{}',100,'Placeholder only.','TunApp placeholder','Client-owned placeholder',false,false
);

insert into public.approved_translation_examples (
  source_language,target_language,source_text,translated_text,category,notes,
  source_name,copyright_status,commercial_use_allowed,approved
) values (
  'en','hyw','Example sentence','REPLACE_WITH_EXPERT_APPROVED_WESTERN_ARMENIAN',
  'general','Placeholder only. Do not approve without expert review.','TunApp placeholder',
  'Client-owned placeholder',false,false
)
on conflict (source_language,target_language,source_text) do update set approved=false;
