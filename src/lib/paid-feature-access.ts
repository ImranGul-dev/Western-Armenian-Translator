export type PaidFeature =
  | "audio"
  | "pronunciation"
  | "thesaurus"
  | "role_play"
  | "word_breakdown"
  | "saved_phrases"
  | "vocabulary_decks"
  | "flashcards"
  | "practice_analytics";

interface PaidFeatureAccessContext {
  isAuthenticated: boolean;
  role?: string | null;
  planSlug?: string | null;
}

const FEATURE_PLAN_SLUGS:
  Record<
    PaidFeature,
    ReadonlySet<string>
  > = {
  audio: new Set([
    "premium",
    "business",
    "admin",
  ]),

  pronunciation: new Set([
    "premium",
    "business",
    "admin",
  ]),

  thesaurus: new Set([
    "premium",
    "business",
    "admin",
  ]),

  role_play: new Set([
    "premium",
    "business",
    "admin",
  ]),

  word_breakdown: new Set([
    "premium",
    "business",
    "admin",
  ]),

  saved_phrases: new Set([
    "premium",
    "business",
    "admin",
  ]),

  vocabulary_decks: new Set([
    "premium",
    "business",
    "admin",
  ]),

  flashcards: new Set([
    "premium",
    "business",
    "admin",
  ]),

  practice_analytics: new Set([
    "premium",
    "business",
    "admin",
  ]),
};

export function hasPaidFeatureAccess(
  feature: PaidFeature,
  context: PaidFeatureAccessContext,
): boolean {
  if (!context.isAuthenticated) {
    return false;
  }

  if (context.role === "admin") {
    return true;
  }

  if (!context.planSlug) {
    return false;
  }

  return FEATURE_PLAN_SLUGS[
    feature
  ].has(
    context.planSlug,
  );
}