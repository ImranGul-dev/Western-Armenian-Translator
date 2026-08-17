import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import {
  resolveEffectivePlan,
} from "../_shared/account.ts";

import {
  buildCorsHeaders,
  isOriginAllowed,
} from "../_shared/cors.ts";

import {
  getRuntimeConfig,
} from "../_shared/env.ts";

import {
  requireUser,
} from "../_shared/function-auth.ts";

import {
  hasPaidFeatureAccess,
} from "../_shared/paid-feature-access.ts";


type LanguageCode =
  | "en"
  | "hyw"
  | "hye";


type FlashcardRating =
  | "again"
  | "hard"
  | "good"
  | "easy";


interface FlashcardsRequest {
  action?: unknown;
  deckId?: unknown;
  savedPhraseId?: unknown;
  rating?: unknown;
  sessionId?: unknown;
  limit?: unknown;
  offset?: unknown;
}


interface VocabularyDeckRow {
  id: string;
  user_id: string;

  name: string;
  description: string | null;

  created_at: string;
  updated_at: string;
}


interface VocabularyDeckItemRow {
  saved_phrase_id: string;
  created_at: string;
}


interface SavedPhraseRow {
  id: string;
  user_id: string;

  source_text: string;
  translated_text: string;

  source_language: LanguageCode;
  target_language: LanguageCode;

  is_favorite: boolean;

  created_at: string;
  updated_at: string;
}


interface VocabularyMasteryRow {
  saved_phrase_id: string;
  mastery_score: number;
  review_count: number;
  successful_review_count: number;
  current_recall_streak: number;
  last_rating: FlashcardRating | null;
  last_reviewed_at: string | null;
}


interface ReviewResultRow {
  review_event_id: string;
  session_id: string;
  mastery_score: number;
  review_count: number;
  successful_review_count: number;
  current_recall_streak: number;
  last_rating: FlashcardRating;
  last_reviewed_at: string;
}


const MAX_FLASHCARD_LIMIT =
  100;


const DECK_COLUMNS = [
  "id",
  "user_id",
  "name",
  "description",
  "created_at",
  "updated_at",
].join(",");


const SAVED_PHRASE_COLUMNS = [
  "id",
  "user_id",
  "source_text",
  "translated_text",
  "source_language",
  "target_language",
  "is_favorite",
  "created_at",
  "updated_at",
].join(",");


const MASTERY_COLUMNS = [
  "saved_phrase_id",
  "mastery_score",
  "review_count",
  "successful_review_count",
  "current_recall_streak",
  "last_rating",
  "last_reviewed_at",
].join(",");


function json(
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string>,
): Response {
  return Response.json(
    body,
    {
      status,

      headers: {
        ...headers,

        "Content-Type":
          "application/json; charset=utf-8",

        "X-Content-Type-Options":
          "nosniff",
      },
    },
  );
}


function cleanString(
  value: unknown,
  maxCharacters: number,
): string {
  if (
    typeof value !==
      "string"
  ) {
    return "";
  }

  return Array.from(
    value.trim(),
  )
    .slice(
      0,
      maxCharacters,
    )
    .join("");
}


function cleanInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed =
    typeof value ===
        "number"
      ? value
      : typeof value ===
          "string"
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isFinite(
      parsed,
    )
  ) {
    return fallback;
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      Math.floor(
        parsed,
      ),
    ),
  );
}


function validUuid(
  value: string,
): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
    .test(value);
}


function validRating(
  value: string,
): value is FlashcardRating {
  return (
    value === "again" ||
    value === "hard" ||
    value === "good" ||
    value === "easy"
  );
}


function deckResponse(
  row: VocabularyDeckRow,
  phraseCount: number,
) {
  return {
    id:
      row.id,

    name:
      row.name,

    description:
      row.description,

    phraseCount,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}


function masteryResponse(
  row?: VocabularyMasteryRow,
) {
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


function phraseResponse(
  row: SavedPhraseRow,
  addedAt: string,
  mastery?: VocabularyMasteryRow,
) {
  return {
    id:
      row.id,

    sourceText:
      row.source_text,

    translatedText:
      row.translated_text,

    sourceLanguage:
      row.source_language,

    targetLanguage:
      row.target_language,

    isFavorite:
      row.is_favorite,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    addedAt,

    mastery:
      masteryResponse(
        mastery,
      ),
  };
}


async function loadFlashcardDeck(
  admin: SupabaseClient,
  userId: string,
  payload: FlashcardsRequest,
  cors: Record<string, string>,
): Promise<Response> {
  const deckId =
    cleanString(
      payload.deckId,
      100,
    );

  if (
    !deckId ||
    !validUuid(
      deckId,
    )
  ) {
    return json(
      {
        success:
          false,

        error:
          "A valid Vocabulary Deck ID is required.",

        code:
          "invalid_vocabulary_deck_id",
      },
      400,
      cors,
    );
  }


  const limit =
    cleanInteger(
      payload.limit,
      MAX_FLASHCARD_LIMIT,
      1,
      MAX_FLASHCARD_LIMIT,
    );

  const offset =
    cleanInteger(
      payload.offset,
      0,
      0,
      100_000,
    );


  const {
    data:
      deckData,

    error:
      deckError,
  } =
    await admin
      .from(
        "vocabulary_decks",
      )
      .select(
        DECK_COLUMNS,
      )
      .eq(
        "id",
        deckId,
      )
      .eq(
        "user_id",
        userId,
      )
      .maybeSingle();


  if (deckError) {
    console.error(
      "flashcards deck lookup failed",
      deckError,
    );

    return json(
      {
        success:
          false,

        error:
          "The Vocabulary Deck could not be loaded.",

        code:
          "flashcards_deck_load_failed",
      },
      500,
      cors,
    );
  }


  if (!deckData) {
    return json(
      {
        success:
          false,

        error:
          "Vocabulary Deck not found.",

        code:
          "vocabulary_deck_not_found",
      },
      404,
      cors,
    );
  }


  const {
    data:
      membershipData,

    error:
      membershipError,

    count:
      itemCount,
  } =
    await admin
      .from(
        "vocabulary_deck_items",
      )
      .select(
        "saved_phrase_id,created_at",
        {
          count:
            "exact",
        },
      )
      .eq(
        "user_id",
        userId,
      )
      .eq(
        "deck_id",
        deckId,
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        },
      )
      .range(
        offset,
        offset + limit - 1,
      );


  if (membershipError) {
    console.error(
      "flashcards membership lookup failed",
      membershipError,
    );

    return json(
      {
        success:
          false,

        error:
          "The Flashcards could not be loaded.",

        code:
          "flashcards_membership_load_failed",
      },
      500,
      cors,
    );
  }


  const memberships =
    (
      membershipData ??
      []
    ) as VocabularyDeckItemRow[];


  if (
    memberships.length ===
      0
  ) {
    return json(
      {
        success:
          true,

        deck:
          deckResponse(
            deckData as
              VocabularyDeckRow,
            itemCount ??
              0,
          ),

        items:
          [],

        total:
          itemCount ??
          0,

        limit,
        offset,
      },
      200,
      cors,
    );
  }


  const phraseIds =
    memberships.map(
      (
        membership,
      ) =>
        membership
          .saved_phrase_id,
    );


  const [
    phraseResult,
    masteryResult,
  ] =
    await Promise.all([
      admin
        .from(
          "saved_phrases",
        )
        .select(
          SAVED_PHRASE_COLUMNS,
        )
        .eq(
          "user_id",
          userId,
        )
        .in(
          "id",
          phraseIds,
        ),

      admin
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
          phraseIds,
        ),
    ]);


  if (phraseResult.error) {
    console.error(
      "flashcards phrase lookup failed",
      phraseResult.error,
    );

    return json(
      {
        success:
          false,

        error:
          "The Flashcards could not be loaded.",

        code:
          "flashcards_phrase_load_failed",
      },
      500,
      cors,
    );
  }


  if (masteryResult.error) {
    console.error(
      "flashcards mastery lookup failed",
      masteryResult.error,
    );

    return json(
      {
        success:
          false,

        error:
          "The Flashcard mastery data could not be loaded.",

        code:
          "flashcards_mastery_load_failed",
      },
      500,
      cors,
    );
  }


  const phraseRows =
    (
      phraseResult.data ??
      []
    ) as SavedPhraseRow[];

  const masteryRows =
    (
      masteryResult.data ??
      []
    ) as VocabularyMasteryRow[];


  const phrasesById =
    new Map(
      phraseRows.map(
        (
          row,
        ) => [
          row.id,
          row,
        ],
      ),
    );

  const masteryByPhraseId =
    new Map(
      masteryRows.map(
        (
          row,
        ) => [
          row.saved_phrase_id,
          row,
        ],
      ),
    );


  const items =
    memberships
      .map(
        (
          membership,
        ) => {
          const phrase =
            phrasesById.get(
              membership
                .saved_phrase_id,
            );

          if (!phrase) {
            return null;
          }

          return phraseResponse(
            phrase,
            membership.created_at,
            masteryByPhraseId.get(
              membership
                .saved_phrase_id,
            ),
          );
        },
      )
      .filter(
        (
          item,
        ): item is ReturnType<
          typeof phraseResponse
        > =>
          item !==
            null,
      );


  return json(
    {
      success:
        true,

      deck:
        deckResponse(
          deckData as
            VocabularyDeckRow,
          itemCount ??
            0,
        ),

      items,

      total:
        itemCount ??
        0,

      limit,
      offset,
    },
    200,
    cors,
  );
}


async function recordFlashcardReview(
  admin: SupabaseClient,
  userId: string,
  payload: FlashcardsRequest,
  cors: Record<string, string>,
): Promise<Response> {
  const deckId =
    cleanString(
      payload.deckId,
      100,
    );

  const savedPhraseId =
    cleanString(
      payload.savedPhraseId,
      100,
    );

  const sessionId =
    cleanString(
      payload.sessionId,
      100,
    );

  const rating =
    cleanString(
      payload.rating,
      20,
    ).toLowerCase();


  if (
    !deckId ||
    !validUuid(
      deckId,
    )
  ) {
    return json(
      {
        success:
          false,

        error:
          "A valid Vocabulary Deck ID is required.",

        code:
          "invalid_vocabulary_deck_id",
      },
      400,
      cors,
    );
  }


  if (
    !savedPhraseId ||
    !validUuid(
      savedPhraseId,
    )
  ) {
    return json(
      {
        success:
          false,

        error:
          "A valid Saved Phrase ID is required.",

        code:
          "invalid_saved_phrase_id",
      },
      400,
      cors,
    );
  }


  if (
    !sessionId ||
    !validUuid(
      sessionId,
    )
  ) {
    return json(
      {
        success:
          false,

        error:
          "A valid Flashcards session ID is required.",

        code:
          "invalid_flashcards_session_id",
      },
      400,
      cors,
    );
  }


  if (
    !validRating(
      rating,
    )
  ) {
    return json(
      {
        success:
          false,

        error:
          "Choose Again, Hard, Good or Easy for this Flashcard.",

        code:
          "invalid_flashcard_rating",
      },
      400,
      cors,
    );
  }


  const {
    data,
    error,
  } =
    await admin.rpc(
      "record_vocabulary_review",
      {
        p_user_id:
          userId,

        p_saved_phrase_id:
          savedPhraseId,

        p_rating:
          rating,

        p_deck_id:
          deckId,

        p_session_id:
          sessionId,
      },
    );


  if (error) {
    console.error(
      "flashcards review recording failed",
      error,
    );

    const missing =
      error.code ===
        "P0002";

    const invalidMembership =
      error.code ===
        "23503";

    return json(
      {
        success:
          false,

        error:
          missing
            ? "Saved Phrase not found."
            : invalidMembership
              ? "This Saved Phrase is not in the selected Vocabulary Deck."
              : "The Flashcard review could not be saved.",

        code:
          missing
            ? "saved_phrase_not_found"
            : invalidMembership
              ? "flashcard_not_in_deck"
              : "flashcard_review_failed",
      },
      missing
        ? 404
        : invalidMembership
          ? 409
          : 500,
      cors,
    );
  }


  const rows =
    (
      data ??
      []
    ) as ReviewResultRow[];

  const row =
    rows[0];


  if (!row) {
    return json(
      {
        success:
          false,

        error:
          "The Flashcard review returned no mastery result.",

        code:
          "flashcard_review_result_missing",
      },
      500,
      cors,
    );
  }


  return json(
    {
      success:
        true,

      action:
        "record_review",

      reviewEventId:
        row.review_event_id,

      sessionId:
        row.session_id,

      savedPhraseId,

      mastery: {
        score:
          row.mastery_score,

        reviewCount:
          row.review_count,

        successfulReviewCount:
          row.successful_review_count,

        currentRecallStreak:
          row.current_recall_streak,

        lastRating:
          row.last_rating,

        lastReviewedAt:
          row.last_reviewed_at,
      },
    },
    200,
    cors,
  );
}


Deno.serve(
  async (
    request: Request,
  ): Promise<Response> => {
    const config =
      getRuntimeConfig();

    const origin =
      request.headers.get(
        "origin",
      );


    if (
      !isOriginAllowed(
        origin,
        config.allowedOrigins,
      )
    ) {
      return json(
        {
          success:
            false,

          error:
            "Origin is not allowed.",

          code:
            "origin_not_allowed",
        },
        403,
        {
          Vary:
            "Origin",
        },
      );
    }


    const cors =
      buildCorsHeaders(
        origin,
      );


    if (
      request.method ===
        "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status:
            204,

          headers:
            cors,
        },
      );
    }


    if (
      request.method !==
        "POST"
    ) {
      return json(
        {
          success:
            false,

          error:
            "Method not allowed.",

          code:
            "method_not_allowed",
        },
        405,
        cors,
      );
    }


    if (
      !config.supabaseUrl ||
      !config.adminKey
    ) {
      return json(
        {
          success:
            false,

          error:
            "Flashcards is not configured correctly.",

          code:
            "flashcards_configuration_error",
        },
        503,
        cors,
      );
    }


    const admin =
      createClient(
        config.supabaseUrl,
        config.adminKey,
        {
          auth: {
            persistSession:
              false,

            autoRefreshToken:
              false,
          },
        },
      );


    let user;

    try {
      user =
        await requireUser(
          admin,
          request,
        );
    } catch {
      return json(
        {
          success:
            false,

          error:
            "Please log in to use Flashcards.",

          code:
            "auth_required",
        },
        401,
        cors,
      );
    }


    let payload:
      FlashcardsRequest;

    try {
      const rawPayload:
        unknown =
        await request.json();

      if (
        !rawPayload ||
        typeof rawPayload !==
          "object" ||
        Array.isArray(
          rawPayload,
        )
      ) {
        throw new Error(
          "Invalid request payload.",
        );
      }

      payload =
        rawPayload as
          FlashcardsRequest;
    } catch {
      return json(
        {
          success:
            false,

          error:
            "The request could not be read.",

          code:
            "invalid_json",
        },
        400,
        cors,
      );
    }


    const action =
      cleanString(
        payload.action,
        40,
      ).toLowerCase();


    if (
      action !==
        "load_deck" &&
      action !==
        "record_review"
    ) {
      return json(
        {
          success:
            false,

          error:
            "A valid Flashcards action is required.",

          code:
            "invalid_action",
        },
        400,
        cors,
      );
    }


    try {
      const [
        effectivePlan,
        profileResult,
      ] =
        await Promise.all([
          resolveEffectivePlan(
            admin,
            user.id,
          ),

          admin
            .from(
              "profiles",
            )
            .select(
              "role",
            )
            .eq(
              "id",
              user.id,
            )
            .maybeSingle(),
        ]);


      if (
        profileResult.error
      ) {
        console.error(
          "flashcards profile lookup failed",
          profileResult.error,
        );

        return json(
          {
            success:
              false,

            error:
              "Flashcards is temporarily unavailable.",

            code:
              "profile_lookup_failed",
          },
          503,
          cors,
        );
      }


      const role =
        profileResult.data
            ?.role ===
          "admin"
          ? "admin"
          : profileResult.data
                ?.role ===
              "language_editor"
            ? "language_editor"
            : "user";


      const allowed =
        hasPaidFeatureAccess(
          "flashcards",
          {
            userId:
              user.id,

            role,

            plan: {
              slug:
                effectivePlan.slug,
            },
          },
        );


      if (!allowed) {
        return json(
          {
            success:
              false,

            error:
              "Flashcards is available with Person or Schools access.",

            code:
              "paid_feature_required",

            upgradeRecommended:
              true,
          },
          403,
          cors,
        );
      }


      if (
        action ===
          "record_review"
      ) {
        return await recordFlashcardReview(
          admin,
          user.id,
          payload,
          cors,
        );
      }


      return await loadFlashcardDeck(
        admin,
        user.id,
        payload,
        cors,
      );
    } catch (error) {
      console.error(
        "flashcards unexpected failure",
        error,
      );

      return json(
        {
          success:
            false,

          error:
            "Flashcards is temporarily unavailable. Please try again.",

          code:
            "flashcards_error",
        },
        500,
        cors,
      );
    }
  },
);
