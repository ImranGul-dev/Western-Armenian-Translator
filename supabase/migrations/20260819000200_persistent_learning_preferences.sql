-- Persistent Audio / AI learning preferences.
--
-- Keep user-facing learning preferences on the existing profile row rather
-- than introducing a second settings store. The JSON object is intentionally
-- forward-compatible: known v1 keys are validated while future keys may be
-- added by later migrations without replacing the storage model.

alter table public.profiles
  add column if not exists learning_preferences jsonb
  not null
  default '{
    "tts_voice": "marin",
    "audio_speed": 1,
    "pronunciation_speed": 0.75,
    "microphone_language": "hyw",
    "auto_translate": true
  }'::jsonb;


alter table public.profiles
  drop constraint if exists profiles_learning_preferences_check;


alter table public.profiles
  add constraint profiles_learning_preferences_check
  check (
    jsonb_typeof(learning_preferences) = 'object'

    and (
      not (learning_preferences ? 'tts_voice')
      or (
        jsonb_typeof(learning_preferences -> 'tts_voice') = 'string'
        and learning_preferences ->> 'tts_voice' in (
          'marin',
          'cedar'
        )
      )
    )

    and (
      not (learning_preferences ? 'audio_speed')
      or (
        jsonb_typeof(learning_preferences -> 'audio_speed') = 'number'
        and (learning_preferences ->> 'audio_speed')::numeric in (
          0.75,
          1,
          1.25,
          1.5
        )
      )
    )

    and (
      not (learning_preferences ? 'pronunciation_speed')
      or (
        jsonb_typeof(learning_preferences -> 'pronunciation_speed') = 'number'
        and (learning_preferences ->> 'pronunciation_speed')::numeric in (
          0.75,
          1,
          1.25,
          1.5
        )
      )
    )

    and (
      not (learning_preferences ? 'microphone_language')
      or (
        jsonb_typeof(learning_preferences -> 'microphone_language') = 'string'
        and learning_preferences ->> 'microphone_language' in (
          'hyw',
          'en'
        )
      )
    )

    and (
      not (learning_preferences ? 'auto_translate')
      or jsonb_typeof(learning_preferences -> 'auto_translate') = 'boolean'
    )
  );


comment on column public.profiles.learning_preferences is
  'Per-user persisted learning preferences. V1 keys: tts_voice, audio_speed, pronunciation_speed, microphone_language and auto_translate.';
