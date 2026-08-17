import {
  getSupabaseConfig,
} from "@/lib/supabase/client";


export type VocabularyMasteryRating =
  | "again"
  | "hard"
  | "good"
  | "easy";


export interface VocabularyMastery {
  score: number;
  reviewCount: number;
  successfulReviewCount: number;
  currentRecallStreak: number;
  lastRating: VocabularyMasteryRating | null;
  lastReviewedAt: string | null;
}


export interface VocabularyMasteryItem {
  savedPhraseId: string;
  mastery: VocabularyMastery;
}


export type VocabularyMasteryApiError =
  Error & {
    code?: string;
    upgradeRecommended?: boolean;
  };


function getFunctionUrl(): string {
  const explicit =
    process.env
      .NEXT_PUBLIC_VOCABULARY_MASTERY_FUNCTION_URL
      ?.trim();

  if (explicit) {
    return explicit.replace(
      /\/+$/u,
      "",
    );
  }

  const {
    url,
  } = getSupabaseConfig();

  if (!url) {
    throw new Error(
      "Supabase is not configured.",
    );
  }

  return `${url}/functions/v1/vocabulary-mastery`;
}


function apiError(
  message: string,
  code?: string,
  upgradeRecommended?: boolean,
): VocabularyMasteryApiError {
  const error =
    new Error(
      message,
    ) as VocabularyMasteryApiError;

  error.code =
    code;

  error.upgradeRecommended =
    upgradeRecommended;

  return error;
}


function parseMastery(
  value: unknown,
): VocabularyMastery {
  const record =
    value &&
    typeof value === "object"
      ? value as Record<string, unknown>
      : {};

  return {
    score:
      typeof record.score === "number"
        ? record.score
        : 0,

    reviewCount:
      typeof record.reviewCount === "number"
        ? record.reviewCount
        : 0,

    successfulReviewCount:
      typeof record.successfulReviewCount === "number"
        ? record.successfulReviewCount
        : 0,

    currentRecallStreak:
      typeof record.currentRecallStreak === "number"
        ? record.currentRecallStreak
        : 0,

    lastRating:
      record.lastRating === "again" ||
      record.lastRating === "hard" ||
      record.lastRating === "good" ||
      record.lastRating === "easy"
        ? record.lastRating
        : null,

    lastReviewedAt:
      typeof record.lastReviewedAt === "string"
        ? record.lastReviewedAt
        : null,
  };
}


export async function loadVocabularyMastery(
  accessToken: string,
  phraseIds: string[],
  signal?: AbortSignal,
): Promise<VocabularyMasteryItem[]> {
  const uniquePhraseIds =
    Array.from(
      new Set(
        phraseIds.filter(Boolean),
      ),
    ).slice(
      0,
      100,
    );

  if (
    uniquePhraseIds.length ===
      0
  ) {
    return [];
  }

  const {
    key,
  } = getSupabaseConfig();

  if (!key) {
    throw new Error(
      "Supabase is not configured.",
    );
  }

  const response =
    await fetch(
      getFunctionUrl(),
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Accept:
            "application/json",
          apikey:
            key,
          Authorization:
            `Bearer ${accessToken}`,
        },
        body:
          JSON.stringify({
            phraseIds:
              uniquePhraseIds,
          }),
        cache:
          "no-store",
        signal,
      },
    );

  let data:
    Record<string, unknown>;

  try {
    data =
      await response.json() as
        Record<string, unknown>;
  } catch {
    throw new Error(
      "The Vocabulary Mastery service returned an invalid response.",
    );
  }

  if (
    !response.ok ||
    data.success !== true
  ) {
    throw apiError(
      typeof data.error === "string"
        ? data.error
        : "Vocabulary Mastery could not be loaded.",
      typeof data.code === "string"
        ? data.code
        : undefined,
      typeof data.upgradeRecommended === "boolean"
        ? data.upgradeRecommended
        : undefined,
    );
  }

  if (!Array.isArray(data.items)) {
    return [];
  }

  return data.items.flatMap(
    (value) => {
      if (
        !value ||
        typeof value !== "object"
      ) {
        return [];
      }

      const record =
        value as Record<string, unknown>;

      if (
        typeof record.savedPhraseId !== "string"
      ) {
        return [];
      }

      return [
        {
          savedPhraseId:
            record.savedPhraseId,
          mastery:
            parseMastery(
              record.mastery,
            ),
        },
      ];
    },
  );
}
