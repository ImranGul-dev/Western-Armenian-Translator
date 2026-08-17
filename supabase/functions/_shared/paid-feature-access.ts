export type PaidFeature =
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
  | "practice_analytics";

interface PaidFeatureAccount {
  userId: string | null;
  role?: string | null;
  plan?: {
    slug?: string | null;
  } | null;
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

  history: new Set([
    "premium",
    "business",
    "admin",
  ]),

  practice_streak: new Set([
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
  account: PaidFeatureAccount,
): boolean {
  if (!account.userId) {
    return false;
  }

  if (account.role === "admin") {
    return true;
  }

  const planSlug =
    account.plan?.slug;

  if (!planSlug) {
    return false;
  }

  return FEATURE_PLAN_SLUGS[
    feature
  ].has(
    planSlug,
  );
}
