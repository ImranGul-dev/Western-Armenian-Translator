import {
  getSupabaseConfig,
} from "@/lib/supabase/client";

import type {
  VocabularyDeck,
  VocabularyDeckPhrase,
} from "@/lib/vocabulary-decks-api";


export type FlashcardRating =
  | "again"
  | "hard"
  | "good"
  | "easy";


export interface FlashcardMastery {
  score: number;
  reviewCount: number;
  successfulReviewCount: number;
  currentRecallStreak: number;
  lastRating: FlashcardRating | null;
  lastReviewedAt: string | null;
}


export interface FlashcardPhrase
  extends VocabularyDeckPhrase {
  mastery: FlashcardMastery;
}


export interface FlashcardDeckResult {
  deck: VocabularyDeck;

  items: FlashcardPhrase[];

  total: number;
  limit: number;
  offset: number;
}


export interface RecordFlashcardReviewResult {
  reviewEventId: string;
  sessionId: string;
  savedPhraseId: string;
  mastery: FlashcardMastery;
}


export type FlashcardsApiError =
  Error & {
    code?: string;
    upgradeRecommended?: boolean;
  };


function getFunctionUrl(): string {
  const explicit =
    process.env
      .NEXT_PUBLIC_FLASHCARDS_FUNCTION_URL
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

  return `${url}/functions/v1/flashcards`;
}


function apiError(
  message: string,
  code?: string,
  upgradeRecommended?: boolean,
): FlashcardsApiError {
  const error =
    new Error(
      message,
    ) as FlashcardsApiError;

  error.code =
    code;

  error.upgradeRecommended =
    upgradeRecommended;

  return error;
}


async function requestFlashcards(
  accessToken: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
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
        method:
          "POST",

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
          JSON.stringify(
            payload,
          ),

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
      "The Flashcards service returned an invalid response.",
    );
  }


  if (
    !response.ok ||
    data.success !==
      true
  ) {
    throw apiError(
      typeof data.error ===
        "string"
        ? data.error
        : "Flashcards failed. Please try again.",

      typeof data.code ===
        "string"
        ? data.code
        : undefined,

      typeof data.upgradeRecommended ===
        "boolean"
        ? data.upgradeRecommended
        : undefined,
    );
  }


  return data;
}


function requireDeck(
  value: unknown,
): VocabularyDeck {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    throw new Error(
      "The Flashcards service returned an invalid Vocabulary Deck.",
    );
  }

  return value as
    VocabularyDeck;
}


function requireMastery(
  value: unknown,
): FlashcardMastery {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    throw new Error(
      "The Flashcards service returned invalid mastery data.",
    );
  }

  const record =
    value as Record<string, unknown>;

  return {
    score:
      typeof record.score ===
        "number"
        ? record.score
        : 0,

    reviewCount:
      typeof record.reviewCount ===
        "number"
        ? record.reviewCount
        : 0,

    successfulReviewCount:
      typeof record.successfulReviewCount ===
        "number"
        ? record.successfulReviewCount
        : 0,

    currentRecallStreak:
      typeof record.currentRecallStreak ===
        "number"
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
      typeof record.lastReviewedAt ===
        "string"
        ? record.lastReviewedAt
        : null,
  };
}


function requireFlashcardPhrase(
  value: unknown,
): FlashcardPhrase {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    throw new Error(
      "The Flashcards service returned an invalid Flashcard.",
    );
  }

  const record =
    value as Record<string, unknown>;

  return {
    ...(record as unknown as
      VocabularyDeckPhrase),

    mastery:
      requireMastery(
        record.mastery,
      ),
  };
}


export async function loadFlashcardDeck(
  accessToken: string,
  deckId: string,
  options: {
    limit?: number;
    offset?: number;
  } = {},
  signal?: AbortSignal,
): Promise<FlashcardDeckResult> {
  const data =
    await requestFlashcards(
      accessToken,
      {
        action:
          "load_deck",

        deckId,

        limit:
          options.limit ??
          100,

        offset:
          options.offset ??
          0,
      },
      signal,
    );


  return {
    deck:
      requireDeck(
        data.deck,
      ),

    items:
      Array.isArray(
        data.items,
      )
        ? data.items.map(
            requireFlashcardPhrase,
          )
        : [],

    total:
      typeof data.total ===
        "number"
        ? data.total
        : 0,

    limit:
      typeof data.limit ===
        "number"
        ? data.limit
        : options.limit ??
          100,

    offset:
      typeof data.offset ===
        "number"
        ? data.offset
        : options.offset ??
          0,
  };
}


export async function recordFlashcardReview(
  accessToken: string,
  input: {
    deckId: string;
    savedPhraseId: string;
    rating: FlashcardRating;
    sessionId: string;
  },
  signal?: AbortSignal,
): Promise<RecordFlashcardReviewResult> {
  const data =
    await requestFlashcards(
      accessToken,
      {
        action:
          "record_review",

        deckId:
          input.deckId,

        savedPhraseId:
          input.savedPhraseId,

        rating:
          input.rating,

        sessionId:
          input.sessionId,
      },
      signal,
    );


  if (
    typeof data.reviewEventId !==
      "string" ||
    typeof data.sessionId !==
      "string" ||
    typeof data.savedPhraseId !==
      "string"
  ) {
    throw new Error(
      "The Flashcards service returned an invalid review result.",
    );
  }


  return {
    reviewEventId:
      data.reviewEventId,

    sessionId:
      data.sessionId,

    savedPhraseId:
      data.savedPhraseId,

    mastery:
      requireMastery(
        data.mastery,
      ),
  };
}
