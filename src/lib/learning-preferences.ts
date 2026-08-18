export type LearningVoice =
  | "marin"
  | "cedar";

export type LearningPlaybackSpeed =
  | 0.75
  | 1
  | 1.25
  | 1.5;

export type LearningMicrophoneLanguage =
  | "hyw"
  | "en";

export interface LearningPreferences {
  tts_voice: LearningVoice;
  audio_speed: LearningPlaybackSpeed;
  pronunciation_speed: LearningPlaybackSpeed;
  microphone_language: LearningMicrophoneLanguage;
  auto_translate: boolean;
}

export const DEFAULT_LEARNING_PREFERENCES: LearningPreferences = {
  tts_voice: "marin",
  audio_speed: 1,
  pronunciation_speed: 0.75,
  microphone_language: "hyw",
  auto_translate: true,
};

const LEARNING_VOICES = new Set<LearningVoice>([
  "marin",
  "cedar",
]);

const PLAYBACK_SPEEDS = new Set<LearningPlaybackSpeed>([
  0.75,
  1,
  1.25,
  1.5,
]);

const MICROPHONE_LANGUAGES = new Set<LearningMicrophoneLanguage>([
  "hyw",
  "en",
]);

export function normalizeLearningPreferences(
  value: unknown,
): LearningPreferences {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {
      ...DEFAULT_LEARNING_PREFERENCES,
    };
  }

  const record = value as Record<string, unknown>;

  const voice =
    typeof record.tts_voice === "string" &&
    LEARNING_VOICES.has(record.tts_voice as LearningVoice)
      ? record.tts_voice as LearningVoice
      : DEFAULT_LEARNING_PREFERENCES.tts_voice;

  const audioSpeed =
    typeof record.audio_speed === "number" &&
    PLAYBACK_SPEEDS.has(record.audio_speed as LearningPlaybackSpeed)
      ? record.audio_speed as LearningPlaybackSpeed
      : DEFAULT_LEARNING_PREFERENCES.audio_speed;

  const pronunciationSpeed =
    typeof record.pronunciation_speed === "number" &&
    PLAYBACK_SPEEDS.has(record.pronunciation_speed as LearningPlaybackSpeed)
      ? record.pronunciation_speed as LearningPlaybackSpeed
      : DEFAULT_LEARNING_PREFERENCES.pronunciation_speed;

  const microphoneLanguage =
    typeof record.microphone_language === "string" &&
    MICROPHONE_LANGUAGES.has(
      record.microphone_language as LearningMicrophoneLanguage,
    )
      ? record.microphone_language as LearningMicrophoneLanguage
      : DEFAULT_LEARNING_PREFERENCES.microphone_language;

  return {
    tts_voice: voice,
    audio_speed: audioSpeed,
    pronunciation_speed: pronunciationSpeed,
    microphone_language: microphoneLanguage,
    auto_translate:
      typeof record.auto_translate === "boolean"
        ? record.auto_translate
        : DEFAULT_LEARNING_PREFERENCES.auto_translate,
  };
}
