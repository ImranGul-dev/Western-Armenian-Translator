-- Role-Play foundation
--
-- Supports:
-- - Admin-managed preset practice scenarios.
-- - Paid-user conversation sessions.
-- - Persisted user / assistant turns.
-- - Future Role-Play logs, practice analytics, streaks and CMS.
--
-- Browser clients do not write these tables directly.
-- Role-Play Edge Functions use the service role and enforce paid access.

create table if not exists public.role_play_scenarios (
  id uuid primary key default gen_random_uuid(),

  slug text not null unique
    check (
      slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),

  title text not null
    check (
      char_length(btrim(title))
        between 1 and 120
    ),

  description text not null default ''
    check (
      char_length(description) <= 500
    ),

  category text not null default 'everyday'
    check (
      char_length(btrim(category))
        between 1 and 60
    ),

  difficulty text not null default 'beginner'
    check (
      difficulty in (
        'beginner',
        'intermediate',
        'advanced'
      )
    ),

  setting text not null default ''
    check (
      char_length(setting) <= 500
    ),

  user_role text not null
    check (
      char_length(btrim(user_role))
        between 1 and 300
    ),

  ai_role text not null
    check (
      char_length(btrim(ai_role))
        between 1 and 300
    ),

  goal text not null default ''
    check (
      char_length(goal) <= 1000
    ),

  instructions text not null default ''
    check (
      char_length(instructions) <= 5000
    ),

  opening_message text not null
    check (
      char_length(btrim(opening_message))
        between 1 and 1000
    ),

  published boolean not null default false,

  sort_order integer not null default 100
    check (
      sort_order >= 0
    ),

  created_by uuid
    references auth.users(id)
    on delete set null,

  updated_by uuid
    references auth.users(id)
    on delete set null,

  published_at timestamptz,

  archived_at timestamptz,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now()
);


create table if not exists public.role_play_sessions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  scenario_id uuid
    references public.role_play_scenarios(id)
    on delete set null,

  -- Snapshots preserve useful history even if
  -- an administrator later edits the scenario.
  scenario_slug text not null,

  scenario_title text not null,

  status text not null default 'active'
    check (
      status in (
        'active',
        'completed',
        'abandoned'
      )
    ),

  interaction_mode text not null default 'text'
    check (
      interaction_mode in (
        'text',
        'voice',
        'mixed'
      )
    ),

  message_count integer not null default 0
    check (
      message_count >= 0
    ),

  started_at timestamptz
    not null default now(),

  last_activity_at timestamptz
    not null default now(),

  ended_at timestamptz,

  metadata jsonb
    not null default '{}'::jsonb,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  constraint role_play_session_end_time
    check (
      ended_at is null
      or ended_at >= started_at
    )
);


create table if not exists public.role_play_turns (
  id uuid primary key default gen_random_uuid(),

  session_id uuid not null
    references public.role_play_sessions(id)
    on delete cascade,

  turn_index integer not null
    check (
      turn_index > 0
    ),

  speaker text not null
    check (
      speaker in (
        'user',
        'assistant'
      )
    ),

  modality text not null default 'text'
    check (
      modality in (
        'text',
        'voice'
      )
    ),

  content text not null
    check (
      char_length(btrim(content))
        between 1 and 5000
    ),

  created_at timestamptz
    not null default now(),

  unique (
    session_id,
    turn_index
  )
);


-- Fast user history / analytics queries.

create index if not exists
  role_play_sessions_user_started_idx
on public.role_play_sessions (
  user_id,
  started_at desc
);


create index if not exists
  role_play_sessions_scenario_idx
on public.role_play_sessions (
  scenario_id,
  started_at desc
);


create index if not exists
  role_play_sessions_status_idx
on public.role_play_sessions (
  user_id,
  status,
  last_activity_at desc
);


create index if not exists
  role_play_turns_session_idx
on public.role_play_turns (
  session_id,
  turn_index
);


create index if not exists
  role_play_scenarios_published_idx
on public.role_play_scenarios (
  published,
  sort_order,
  title
)
where archived_at is null;


-- Reuse the project's shared updated_at trigger.

drop trigger if exists
  role_play_scenarios_updated_at
on public.role_play_scenarios;

create trigger
  role_play_scenarios_updated_at
before update
on public.role_play_scenarios
for each row
execute function public.set_updated_at();


drop trigger if exists
  role_play_sessions_updated_at
on public.role_play_sessions;

create trigger
  role_play_sessions_updated_at
before update
on public.role_play_sessions
for each row
execute function public.set_updated_at();


-- RLS stays enabled even though browser access is
-- intentionally revoked. Role-Play Edge Functions will
-- use the service role after authenticating the user and
-- checking role_play paid-feature entitlement.

alter table public.role_play_scenarios
  enable row level security;

alter table public.role_play_sessions
  enable row level security;

alter table public.role_play_turns
  enable row level security;


revoke all
on table public.role_play_scenarios
from anon, authenticated;

revoke all
on table public.role_play_sessions
from anon, authenticated;

revoke all
on table public.role_play_turns
from anon, authenticated;


grant all
on table public.role_play_scenarios
to service_role;

grant all
on table public.role_play_sessions
to service_role;

grant all
on table public.role_play_turns
to service_role;


-- Initial client-requested Role-Play scenarios.
--
-- Future Admin CMS work will allow administrators to
-- create, edit, publish, unpublish and reorder these.

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
values
(
  'ordering-food',
  'Ordering Food',
  'Practise ordering a meal and speaking naturally with restaurant staff.',
  'everyday',
  'beginner',
  'A Western Armenian-speaking restaurant.',
  'You are a customer ordering food and speaking with restaurant staff.',
  'You are a friendly restaurant server who speaks natural Western Armenian.',
  'Help the learner practise greetings, ordering food, asking simple questions and responding politely.',
  'Keep the conversation realistic and appropriate for a restaurant. Use natural Western Armenian with traditional orthography. Keep individual replies concise enough for conversational practice.',
  'Բարեւ ձեզ։ Ի՞նչ կը փափաքիք պատուիրել։',
  true,
  10,
  now()
),
(
  'family-phone-call',
  'Family Phone Call',
  'Practise an informal Western Armenian phone conversation with a family member.',
  'family',
  'beginner',
  'A casual phone call between family members.',
  'You are calling a family member and practising a natural everyday conversation.',
  'You are a warm family member speaking conversational Western Armenian.',
  'Help the learner practise greetings, asking how someone is, sharing simple news and ending a phone call naturally.',
  'Keep the tone warm and conversational. Use natural Western Armenian with traditional orthography. Keep individual replies concise and invite the learner to continue speaking.',
  'Բարեւ սիրելի՛ս։ Ինչպէ՞ս ես։ Ուրախ եմ ձայնդ լսելու։',
  true,
  20,
  now()
),
(
  'community-event',
  'Community Event',
  'Practise meeting and speaking with people at an Armenian community event.',
  'community',
  'intermediate',
  'A Western Armenian community gathering.',
  'You are attending a community event and meeting other attendees.',
  'You are a welcoming community member speaking natural Western Armenian.',
  'Help the learner practise introductions, polite conversation, asking about the event and speaking with members of the community.',
  'Keep the conversation friendly and realistic for an Armenian community gathering. Use natural Western Armenian with traditional orthography and encourage practical conversation.',
  'Բարի եկաք։ Ուրախ ենք ձեզ տեսնելու մեր համայնքային ձեռնարկին։',
  true,
  30,
  now()
)
on conflict (slug)
do nothing;