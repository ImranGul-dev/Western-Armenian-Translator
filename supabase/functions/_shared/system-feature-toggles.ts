import type {
  SupabaseClient,
} from "@supabase/supabase-js";

export type RuntimeSystemFeature =
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

const DEFAULT_ENABLED = true;

export async function isRuntimeSystemFeatureEnabled(
  admin: SupabaseClient,
  feature: RuntimeSystemFeature,
): Promise<boolean> {
  const { data, error } =
    await admin.rpc(
      "get_system_feature_toggles",
    );

  if (error) {
    console.error(
      "System feature toggle lookup failed",
      feature,
      error,
    );

    // Fail open if settings cannot be read so a settings outage does not
    // accidentally disable the whole product.
    return DEFAULT_ENABLED;
  }

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    return DEFAULT_ENABLED;
  }

  const value =
    (data as Record<string, unknown>)[
      feature
    ];

  return typeof value === "boolean"
    ? value
    : DEFAULT_ENABLED;
}

export async function requestTargetsDisabledSystemFeature(
  admin: SupabaseClient,
  request: Request,
): Promise<RuntimeSystemFeature | null> {
  const pathname =
    new URL(request.url)
      .pathname
      .toLowerCase();

  let feature:
    RuntimeSystemFeature | null =
      null;

  if (pathname.endsWith("/translate")) {
    feature = "translation";
  } else if (pathname.endsWith("/thesaurus")) {
    feature = "thesaurus";
  } else if (pathname.endsWith("/word-breakdown")) {
    feature = "word_breakdown";
  } else if (pathname.endsWith("/role-play")) {
    feature = "role_play";
  } else if (pathname.endsWith("/daily-practice-phrase")) {
    feature = "daily_practice";
  } else if (pathname.endsWith("/voice-tts")) {
    let mode = "natural";

    try {
      const body =
        await request
          .clone()
          .json() as
            Record<string, unknown>;

      if (
        body?.mode ===
        "pronunciation"
      ) {
        mode = "pronunciation";
      }
    } catch {
      // Invalid JSON will be handled by the owning Edge Function.
    }

    feature =
      mode === "pronunciation"
        ? "pronunciation"
        : "audio";
  } else if (
    pathname.includes("/widget")
  ) {
    feature = "embeddable_widgets";
  }

  if (!feature) {
    return null;
  }

  const enabled =
    await isRuntimeSystemFeatureEnabled(
      admin,
      feature,
    );

  return enabled
    ? null
    : feature;
}
