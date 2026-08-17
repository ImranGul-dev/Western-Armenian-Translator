import type {
  SupabaseClient,
} from "@supabase/supabase-js";


export type VocabularyMasteryRating =
  | "again"
  | "hard"
  | "good"
  | "easy";


export interface VocabularyMasteryRow {
  saved_phrase_id: string;
  mastery_score: number;
  review_count: number;
  successful_review_count: number;
  current_recall_streak: number;
  last_rating: VocabularyMasteryRating | null;
  last_reviewed_at: string | null;
}


export interface VocabularyMasteryResponse {
  score: number;
  reviewCount: number;
  successfulReviewCount: number;
  currentRecallStreak: number;
  lastRating: VocabularyMasteryRating | null;
  lastReviewedAt: string | null;
}


const MASTERY_COLUMNS = [
  "saved_phrase_id",
  "mastery_score",
  "review_count",
  "successful_review_count",
  "current_recall_streak",
  "last_rating",
  "last_reviewed_at",
].join(",");


export function vocabularyMasteryResponse(
  row?: VocabularyMasteryRow,
): VocabularyMasteryResponse {
  return {
    score:
      row?.mastery_score ??
      0,

    reviewCount:
      row?.review_count ??
      0,

    successfulReviewCount:
      row?.successful_review_count ??
      0,

    currentRecallStreak:
      row?.current_recall_streak ??
      0,

    lastRating:
      row?.last_rating ??
      null,

    lastReviewedAt:
      row?.last_reviewed_at ??
      null,
  };
}


export async function loadVocabularyMasteryByPhraseId(
  admin: SupabaseClient,
  userId: string,
  phraseIds: string[],
): Promise<Map<string, VocabularyMasteryRow>> {
  const uniquePhraseIds =
    Array.from(
      new Set(
        phraseIds.filter(Boolean),
      ),
    );

  if (
    uniquePhraseIds.length ===
      0
  ) {
    return new Map();
  }

  const {
    data,
    error,
  } =
    await admin
      .from(
        "vocabulary_mastery",
      )
      .select(
        MASTERY_COLUMNS,
      )
      .eq(
        "user_id",
        userId,
      )
      .in(
        "saved_phrase_id",
        uniquePhraseIds,
      );

  if (error) {
    throw error;
  }

  const rows =
    (
      data ??
      []
    ) as VocabularyMasteryRow[];

  return new Map(
    rows.map(
      (row) => [
        row.saved_phrase_id,
        row,
      ],
    ),
  );
}
