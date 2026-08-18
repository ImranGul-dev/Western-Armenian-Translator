import {
  getSupabaseBrowserClient,
} from "@/lib/supabase/client";


export type SystemFeatureToggle =
  | "translation"
  | "audio"
  | "pronunciation"
  | "thesaurus"
  | "role_play"
  | "word_breakdown"
  | "saved_phrases"
  | "vocabulary_decks"
  | "flashcards"
  | "history"
  | "practice_streak"
  | "practice_analytics"
  | "daily_practice"
  | "grammar_tooltips"
  | "embeddable_widgets";


export type SystemFeatureToggles =
  Record<SystemFeatureToggle, boolean>;


export interface SystemFeatureToggleDefinition {
  key: SystemFeatureToggle;
  label: string;
  area: "Core" | "Learning" | "Account" | "Content" | "Platform";
  description: string;
  warning?: string;
}


export const DEFAULT_SYSTEM_FEATURE_TOGGLES:
  SystemFeatureToggles = {
    translation: true,
    audio: true,
    pronunciation: true,
    thesaurus: true,
    role_play: true,
    word_breakdown: true,
    saved_phrases: true,
    vocabulary_decks: true,
    flashcards: true,
    history: true,
    practice_streak: true,
    practice_analytics: true,
    daily_practice: true,
    grammar_tooltips: true,
    embeddable_widgets: true,
  };


export const SYSTEM_FEATURE_TOGGLE_DEFINITIONS:
  readonly SystemFeatureToggleDefinition[] = [
    {
      key: "translation",
      label: "Translation",
      area: "Core",
      description:
        "Controls the main translation experience. Disable only for maintenance or an operational incident.",
      warning:
        "Turning off Translation will block the core translator once runtime enforcement is wired.",
    },
    {
      key: "audio",
      label: "Audio playback",
      area: "Learning",
      description:
        "Controls text-to-speech playback for translated Western Armenian.",
    },
    {
      key: "pronunciation",
      label: "Pronunciation",
      area: "Learning",
      description:
        "Controls pronunciation playback used by transliteration and learning tools.",
    },
    {
      key: "thesaurus",
      label: "Thesaurus",
      area: "Learning",
      description:
        "Controls access to the Western Armenian thesaurus experience.",
    },
    {
      key: "role_play",
      label: "Role-Play",
      area: "Learning",
      description:
        "Controls the learner Role-Play practice experience. Published CMS scenarios are preserved when disabled.",
    },
    {
      key: "word_breakdown",
      label: "Word Breakdown",
      area: "Learning",
      description:
        "Controls word-by-word translation explanations and grammar breakdowns.",
    },
    {
      key: "saved_phrases",
      label: "Saved Phrases",
      area: "Account",
      description:
        "Controls saved translation and favourite phrase tools. Existing saved data is not deleted.",
    },
    {
      key: "vocabulary_decks",
      label: "Vocabulary Decks",
      area: "Account",
      description:
        "Controls vocabulary deck management and export access. Existing decks remain stored.",
    },
    {
      key: "flashcards",
      label: "Flashcards",
      area: "Learning",
      description:
        "Controls flashcard practice. Existing progress remains stored while disabled.",
    },
    {
      key: "history",
      label: "Translation History",
      area: "Account",
      description:
        "Controls learner access to unified translation history. Existing history records remain stored.",
    },
    {
      key: "practice_streak",
      label: "Practice Streak",
      area: "Learning",
      description:
        "Controls learner streak visibility and streak-related practice features.",
    },
    {
      key: "practice_analytics",
      label: "Practice Analytics",
      area: "Learning",
      description:
        "Controls learner practice analytics and progress reporting.",
    },
    {
      key: "daily_practice",
      label: "Daily Practice Phrase",
      area: "Content",
      description:
        "Controls the learner daily phrase card. CMS content and schedules are preserved when disabled.",
    },
    {
      key: "grammar_tooltips",
      label: "Grammar Tooltips",
      area: "Content",
      description:
        "Controls contextual grammar tips shown with translation results. Grammar CMS rules remain stored.",
    },
    {
      key: "embeddable_widgets",
      label: "Embeddable Widgets",
      area: "Platform",
      description:
        "Controls website translator widgets independently from normal customer translation access.",
    },
  ];


export function normalizeSystemFeatureToggles(
  value: unknown,
): SystemFeatureToggles {
  const record =
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};

  return Object.fromEntries(
    Object.entries(
      DEFAULT_SYSTEM_FEATURE_TOGGLES,
    ).map(
      ([key, fallback]) => [
        key,
        typeof record[key] === "boolean"
          ? record[key]
          : fallback,
      ],
    ),
  ) as SystemFeatureToggles;
}


export async function loadSystemFeatureToggles():
  Promise<SystemFeatureToggles> {
  const { data, error } =
    await getSupabaseBrowserClient()
      .rpc("get_system_feature_toggles");

  if (error) {
    throw new Error(
      error.message ||
        "System feature toggles could not be loaded.",
    );
  }

  return normalizeSystemFeatureToggles(data);
}


export async function saveSystemFeatureToggles(
  toggles: SystemFeatureToggles,
): Promise<SystemFeatureToggles> {
  const { data, error } =
    await getSupabaseBrowserClient()
      .rpc(
        "admin_set_system_feature_toggles",
        {
          p_toggles: toggles,
        },
      );

  if (error) {
    throw new Error(
      error.message ||
        "System feature toggles could not be saved.",
    );
  }

  return normalizeSystemFeatureToggles(data);
}
