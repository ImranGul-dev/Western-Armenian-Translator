-- Client-requested open conversation Role-Play scenario.
--
-- Reuses the existing Role-Play scenario/session architecture so text, voice,
-- history, paid access and the Admin Role-Play CMS continue to work normally.

insert into public.role_play_scenarios (
  slug,
  title,
  description,
  category,
  difficulty,
  setting,
  user_role,
  ai_role,
  goal,
  instructions,
  opening_message,
  published,
  sort_order,
  published_at
)
values (
  'choose-your-own-topic',
  'Choose Your Own Topic',
  'Have an open Western Armenian conversation about anything you want. Type or speak naturally and let the conversation follow your interests.',
  'open conversation',
  'beginner',
  'An open, informal conversation with no fixed situation or required subject.',
  'Be yourself. You may introduce any topic, ask any everyday question, tell a story, or simply chat about your day.',
  'You are a supportive, natural Western Armenian conversation partner who follows the learner''s chosen topic.',
  'Give the learner flexible Western Armenian speaking practice without forcing a preset scenario. Follow the subject they introduce and help the conversation continue naturally.',
  'There is no fixed scenario. Follow the learner''s topic rather than redirecting them to a predetermined subject. Reply primarily in natural Western Armenian using traditional Western Armenian orthography. Keep replies conversational and reasonably concise. Ask relevant follow-up questions when helpful. If the learner writes in English, understand the meaning and continue in accessible Western Armenian. If the learner changes topics, follow the new topic naturally. Do not behave like a quiz unless the learner asks for one. Do not invent corrections or interrupt the conversation with grammar explanations unless clarification is genuinely useful.',
  'Բարեւ։ Ի՞նչ նիւթի մասին կ՚ուզես խօսիլ այսօր։',
  true,
  40,
  now()
)
on conflict (slug) do update
set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  difficulty = excluded.difficulty,
  setting = excluded.setting,
  user_role = excluded.user_role,
  ai_role = excluded.ai_role,
  goal = excluded.goal,
  instructions = excluded.instructions,
  opening_message = excluded.opening_message,
  published = true,
  sort_order = excluded.sort_order,
  published_at = coalesce(
    public.role_play_scenarios.published_at,
    now()
  ),
  archived_at = null;
