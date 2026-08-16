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


type VocabularyDeckAction =
  | "list_decks"
  | "get_deck"
  | "create_deck"
  | "update_deck"
  | "delete_deck"
  | "add_phrase"
  | "remove_phrase";


type LanguageCode =
  | "en"
  | "hyw"
  | "hye";


interface VocabularyDeckRequest {
  action?: unknown;

  deckId?: unknown;
  savedPhraseId?: unknown;

  name?: unknown;
  description?: unknown;

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

  source_language:
    LanguageCode;

  target_language:
    LanguageCode;

  is_favorite: boolean;

  created_at: string;
  updated_at: string;
}


const MAX_DECK_LIST_LIMIT =
  100;

const MAX_DECK_ITEM_LIMIT =
  100;

const MAX_DECK_NAME_CHARACTERS =
  100;

const MAX_DECK_DESCRIPTION_CHARACTERS =
  500;


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


function json(
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string>,
) {
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


function cleanAction(
  value: unknown,
): VocabularyDeckAction | null {
  const action =
    cleanString(
      value,
      40,
    ).toLowerCase();

  switch (action) {
    case "list_decks":
    case "get_deck":
    case "create_deck":
    case "update_deck":
    case "delete_deck":
    case "add_phrase":
    case "remove_phrase":
      return action;

    default:
      return null;
  }
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


function validDeckName(
  value: unknown,
): {
  value: string;
  valid: boolean;
} {
  if (
    typeof value !==
      "string"
  ) {
    return {
      value: "",
      valid: false,
    };
  }

  const name =
    value.trim();

  const length =
    Array.from(
      name,
    ).length;

  return {
    value:
      name,

    valid:
      length > 0 &&
      length <=
        MAX_DECK_NAME_CHARACTERS,
  };
}


function validDescription(
  value: unknown,
): {
  value: string | null;
  valid: boolean;
} {
  if (
    value === null ||
    value === undefined
  ) {
    return {
      value: null,
      valid: true,
    };
  }

  if (
    typeof value !==
      "string"
  ) {
    return {
      value: null,
      valid: false,
    };
  }

  const description =
    value.trim();

  if (
    Array.from(
      description,
    ).length >
      MAX_DECK_DESCRIPTION_CHARACTERS
  ) {
    return {
      value: null,
      valid: false,
    };
  }

  return {
    value:
      description ||
      null,

    valid:
      true,
  };
}


function isUniqueViolation(
  error: unknown,
): boolean {
  if (
    !error ||
    typeof error !==
      "object"
  ) {
    return false;
  }

  const value =
    error as {
      code?: unknown;
    };

  return value.code ===
    "23505";
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


function phraseResponse(
  row: SavedPhraseRow,
  addedAt: string,
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
  };
}


async function touchDeck(
  admin: SupabaseClient,
  userId: string,
  deckId: string,
): Promise<void> {
  const {
    error,
  } =
    await admin
      .from(
        "vocabulary_decks",
      )
      .update({
        updated_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "id",
        deckId,
      )
      .eq(
        "user_id",
        userId,
      );

  if (error) {
    console.error(
      "vocabulary_decks touch failed",
      error,
    );
  }
}


async function listDecks(
  admin: SupabaseClient,
  userId: string,
  payload: VocabularyDeckRequest,
  cors: Record<string, string>,
): Promise<Response> {
  const limit =
    cleanInteger(
      payload.limit,
      50,
      1,
      MAX_DECK_LIST_LIMIT,
    );

  const offset =
    cleanInteger(
      payload.offset,
      0,
      0,
      100_000,
    );

  const {
    data,
    error,
    count,
  } =
    await admin
      .from(
        "vocabulary_decks",
      )
      .select(
        DECK_COLUMNS,
        {
          count:
            "exact",
        },
      )
      .eq(
        "user_id",
        userId,
      )
      .order(
        "updated_at",
        {
          ascending:
            false,
        },
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

  if (error) {
    console.error(
      "vocabulary_decks list failed",
      error,
    );

    return json(
      {
        success:
          false,

        error:
          "Vocabulary Decks could not be loaded.",

        code:
          "vocabulary_decks_list_failed",
      },
      500,
      cors,
    );
  }

  const rows =
    (
      data ?? []
    ) as VocabularyDeckRow[];

  const countResults =
    await Promise.all(
      rows.map(
        async (
          row,
        ) => {
          const {
            error:
              countError,

            count:
              phraseCount,
          } =
            await admin
              .from(
                "vocabulary_deck_items",
              )
              .select(
                "saved_phrase_id",
                {
                  count:
                    "exact",

                  head:
                    true,
                },
              )
              .eq(
                "user_id",
                userId,
              )
              .eq(
                "deck_id",
                row.id,
              );

          return {
            row,
            phraseCount:
              phraseCount ??
              0,
            error:
              countError,
          };
        },
      ),
    );

  const failedCount =
    countResults.find(
      (
        result,
      ) =>
        Boolean(
          result.error,
        ),
    );

  if (failedCount) {
    console.error(
      "vocabulary_decks count failed",
      failedCount.error,
    );

    return json(
      {
        success:
          false,

        error:
          "Vocabulary Decks could not be loaded.",

        code:
          "vocabulary_decks_count_failed",
      },
      500,
      cors,
    );
  }

  return json(
    {
      success:
        true,

      items:
        countResults.map(
          (
            result,
          ) =>
            deckResponse(
              result.row,
              result.phraseCount,
            ),
        ),

      total:
        count ??
        0,

      limit,
      offset,
    },
    200,
    cors,
  );
}


async function getDeck(
  admin: SupabaseClient,
  userId: string,
  payload: VocabularyDeckRequest,
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
      50,
      1,
      MAX_DECK_ITEM_LIMIT,
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
      "vocabulary_decks get deck failed",
      deckError,
    );

    return json(
      {
        success:
          false,

        error:
          "The Vocabulary Deck could not be loaded.",

        code:
          "vocabulary_deck_load_failed",
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
      "vocabulary_decks membership list failed",
      membershipError,
    );

    return json(
      {
        success:
          false,

        error:
          "The Vocabulary Deck could not be loaded.",

        code:
          "vocabulary_deck_items_load_failed",
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
            deckData as VocabularyDeckRow,
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

  const {
    data:
      phraseData,

    error:
      phraseError,
  } =
    await admin
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
      );

  if (phraseError) {
    console.error(
      "vocabulary_decks phrase load failed",
      phraseError,
    );

    return json(
      {
        success:
          false,

        error:
          "The Vocabulary Deck phrases could not be loaded.",

        code:
          "vocabulary_deck_phrases_load_failed",
      },
      500,
      cors,
    );
  }

  const phraseRows =
    (
      phraseData ??
      []
    ) as SavedPhraseRow[];

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
          );
        },
      )
      .filter(
        (
          item,
        ): item is ReturnType<
          typeof phraseResponse
        > =>
          item !== null,
      );

  return json(
    {
      success:
        true,

      deck:
        deckResponse(
          deckData as VocabularyDeckRow,
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


async function createDeck(
  admin: SupabaseClient,
  userId: string,
  payload: VocabularyDeckRequest,
  cors: Record<string, string>,
): Promise<Response> {
  const name =
    validDeckName(
      payload.name,
    );

  const description =
    validDescription(
      payload.description,
    );

  if (!name.valid) {
    return json(
      {
        success:
          false,

        error:
          `Deck names must contain between 1 and ${MAX_DECK_NAME_CHARACTERS} characters.`,

        code:
          "invalid_vocabulary_deck_name",
      },
      400,
      cors,
    );
  }

  if (
    !description.valid
  ) {
    return json(
      {
        success:
          false,

        error:
          `Deck descriptions may contain up to ${MAX_DECK_DESCRIPTION_CHARACTERS} characters.`,

        code:
          "invalid_vocabulary_deck_description",
      },
      400,
      cors,
    );
  }

  const {
    data,
    error,
  } =
    await admin
      .from(
        "vocabulary_decks",
      )
      .insert({
        user_id:
          userId,

        name:
          name.value,

        description:
          description.value,
      })
      .select(
        DECK_COLUMNS,
      )
      .single();

  if (error) {
    if (
      isUniqueViolation(
        error,
      )
    ) {
      return json(
        {
          success:
            false,

          error:
            "You already have a Vocabulary Deck with that name.",

          code:
            "vocabulary_deck_name_exists",
        },
        409,
        cors,
      );
    }

    console.error(
      "vocabulary_decks create failed",
      error,
    );

    return json(
      {
        success:
          false,

        error:
          "The Vocabulary Deck could not be created.",

        code:
          "vocabulary_deck_create_failed",
      },
      500,
      cors,
    );
  }

  return json(
    {
      success:
        true,

      item:
        deckResponse(
          data as VocabularyDeckRow,
          0,
        ),
    },
    201,
    cors,
  );
}


async function updateDeck(
  admin: SupabaseClient,
  userId: string,
  payload: VocabularyDeckRequest,
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

  const updates:
    Record<string, unknown> =
      {};

  if (
    "name" in payload
  ) {
    const name =
      validDeckName(
        payload.name,
      );

    if (!name.valid) {
      return json(
        {
          success:
            false,

          error:
            `Deck names must contain between 1 and ${MAX_DECK_NAME_CHARACTERS} characters.`,

          code:
            "invalid_vocabulary_deck_name",
        },
        400,
        cors,
      );
    }

    updates.name =
      name.value;
  }

  if (
    "description" in payload
  ) {
    const description =
      validDescription(
        payload.description,
      );

    if (
      !description.valid
    ) {
      return json(
        {
          success:
            false,

          error:
            `Deck descriptions may contain up to ${MAX_DECK_DESCRIPTION_CHARACTERS} characters.`,

          code:
            "invalid_vocabulary_deck_description",
        },
        400,
        cors,
      );
    }

    updates.description =
      description.value;
  }

  if (
    Object.keys(
      updates,
    ).length ===
      0
  ) {
    return json(
      {
        success:
          false,

        error:
          "Provide a deck name or description to update.",

        code:
          "vocabulary_deck_update_empty",
      },
      400,
      cors,
    );
  }

  const {
    data,
    error,
  } =
    await admin
      .from(
        "vocabulary_decks",
      )
      .update(
        updates,
      )
      .eq(
        "id",
        deckId,
      )
      .eq(
        "user_id",
        userId,
      )
      .select(
        DECK_COLUMNS,
      )
      .maybeSingle();

  if (error) {
    if (
      isUniqueViolation(
        error,
      )
    ) {
      return json(
        {
          success:
            false,

          error:
            "You already have a Vocabulary Deck with that name.",

          code:
            "vocabulary_deck_name_exists",
        },
        409,
        cors,
      );
    }

    console.error(
      "vocabulary_decks update failed",
      error,
    );

    return json(
      {
        success:
          false,

        error:
          "The Vocabulary Deck could not be updated.",

        code:
          "vocabulary_deck_update_failed",
      },
      500,
      cors,
    );
  }

  if (!data) {
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
    count:
      phraseCount,

    error:
      countError,
  } =
    await admin
      .from(
        "vocabulary_deck_items",
      )
      .select(
        "saved_phrase_id",
        {
          count:
            "exact",

          head:
            true,
        },
      )
      .eq(
        "user_id",
        userId,
      )
      .eq(
        "deck_id",
        deckId,
      );

  if (countError) {
    console.error(
      "vocabulary_decks update count failed",
      countError,
    );

    return json(
      {
        success:
          false,

        error:
          "The Vocabulary Deck was updated, but its phrase count could not be loaded.",

        code:
          "vocabulary_deck_count_failed",
      },
      500,
      cors,
    );
  }

  return json(
    {
      success:
        true,

      item:
        deckResponse(
          data as VocabularyDeckRow,
          phraseCount ??
            0,
        ),
    },
    200,
    cors,
  );
}


async function deleteDeck(
  admin: SupabaseClient,
  userId: string,
  payload: VocabularyDeckRequest,
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

  const {
    data,
    error,
  } =
    await admin
      .from(
        "vocabulary_decks",
      )
      .delete()
      .eq(
        "id",
        deckId,
      )
      .eq(
        "user_id",
        userId,
      )
      .select(
        "id",
      )
      .maybeSingle();

  if (error) {
    console.error(
      "vocabulary_decks delete failed",
      error,
    );

    return json(
      {
        success:
          false,

        error:
          "The Vocabulary Deck could not be deleted.",

        code:
          "vocabulary_deck_delete_failed",
      },
      500,
      cors,
    );
  }

  if (!data) {
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

  return json(
    {
      success:
        true,

      deletedId:
        deckId,
    },
    200,
    cors,
  );
}


async function addPhrase(
  admin: SupabaseClient,
  userId: string,
  payload: VocabularyDeckRequest,
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

  const [
    deckResult,
    phraseResult,
  ] =
    await Promise.all([
      admin
        .from(
          "vocabulary_decks",
        )
        .select(
          "id",
        )
        .eq(
          "id",
          deckId,
        )
        .eq(
          "user_id",
          userId,
        )
        .maybeSingle(),

      admin
        .from(
          "saved_phrases",
        )
        .select(
          "id",
        )
        .eq(
          "id",
          savedPhraseId,
        )
        .eq(
          "user_id",
          userId,
        )
        .maybeSingle(),
    ]);

  if (
    deckResult.error
  ) {
    console.error(
      "vocabulary_decks add phrase deck lookup failed",
      deckResult.error,
    );

    return json(
      {
        success:
          false,

        error:
          "The Vocabulary Deck could not be loaded.",

        code:
          "vocabulary_deck_load_failed",
      },
      500,
      cors,
    );
  }

  if (
    phraseResult.error
  ) {
    console.error(
      "vocabulary_decks add phrase lookup failed",
      phraseResult.error,
    );

    return json(
      {
        success:
          false,

        error:
          "The Saved Phrase could not be loaded.",

        code:
          "saved_phrase_load_failed",
      },
      500,
      cors,
    );
  }

  if (
    !deckResult.data
  ) {
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

  if (
    !phraseResult.data
  ) {
    return json(
      {
        success:
          false,

        error:
          "Saved Phrase not found.",

        code:
          "saved_phrase_not_found",
      },
      404,
      cors,
    );
  }

  const {
    error,
  } =
    await admin
      .from(
        "vocabulary_deck_items",
      )
      .insert({
        user_id:
          userId,

        deck_id:
          deckId,

        saved_phrase_id:
          savedPhraseId,
      });

  if (error) {
    if (
      isUniqueViolation(
        error,
      )
    ) {
      return json(
        {
          success:
            true,

          created:
            false,

          deckId,
          savedPhraseId,
        },
        200,
        cors,
      );
    }

    console.error(
      "vocabulary_decks add phrase failed",
      error,
    );

    return json(
      {
        success:
          false,

        error:
          "The Saved Phrase could not be added to the deck.",

        code:
          "vocabulary_deck_add_phrase_failed",
      },
      500,
      cors,
    );
  }

  await touchDeck(
    admin,
    userId,
    deckId,
  );

  return json(
    {
      success:
        true,

      created:
        true,

      deckId,
      savedPhraseId,
    },
    201,
    cors,
  );
}


async function removePhrase(
  admin: SupabaseClient,
  userId: string,
  payload: VocabularyDeckRequest,
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

  const {
    data,
    error,
  } =
    await admin
      .from(
        "vocabulary_deck_items",
      )
      .delete()
      .eq(
        "user_id",
        userId,
      )
      .eq(
        "deck_id",
        deckId,
      )
      .eq(
        "saved_phrase_id",
        savedPhraseId,
      )
      .select(
        "saved_phrase_id",
      )
      .maybeSingle();

  if (error) {
    console.error(
      "vocabulary_decks remove phrase failed",
      error,
    );

    return json(
      {
        success:
          false,

        error:
          "The Saved Phrase could not be removed from the deck.",

        code:
          "vocabulary_deck_remove_phrase_failed",
      },
      500,
      cors,
    );
  }

  if (!data) {
    return json(
      {
        success:
          false,

        error:
          "That Saved Phrase is not in this Vocabulary Deck.",

        code:
          "vocabulary_deck_phrase_not_found",
      },
      404,
      cors,
    );
  }

  await touchDeck(
    admin,
    userId,
    deckId,
  );

  return json(
    {
      success:
        true,

      deckId,
      removedSavedPhraseId:
        savedPhraseId,
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
            "Vocabulary Decks is not configured correctly.",

          code:
            "vocabulary_decks_configuration_error",
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
            "Please log in to use Vocabulary Decks.",

          code:
            "auth_required",
        },
        401,
        cors,
      );
    }

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
        "vocabulary_decks profile lookup failed",
        profileResult.error,
      );

      return json(
        {
          success:
            false,

          error:
            "Vocabulary Decks is temporarily unavailable.",

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
        "vocabulary_decks",
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
            "Vocabulary Decks is available with Person or Schools access.",

          code:
            "paid_feature_required",

          upgradeRecommended:
            true,
        },
        403,
        cors,
      );
    }

    let payload:
      VocabularyDeckRequest;

    try {
      payload =
        await request.json() as
          VocabularyDeckRequest;
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
      cleanAction(
        payload.action,
      );

    if (!action) {
      return json(
        {
          success:
            false,

          error:
            "A valid Vocabulary Decks action is required.",

          code:
            "invalid_action",
        },
        400,
        cors,
      );
    }

    try {
      switch (action) {
        case "list_decks":
          return await listDecks(
            admin,
            user.id,
            payload,
            cors,
          );

        case "get_deck":
          return await getDeck(
            admin,
            user.id,
            payload,
            cors,
          );

        case "create_deck":
          return await createDeck(
            admin,
            user.id,
            payload,
            cors,
          );

        case "update_deck":
          return await updateDeck(
            admin,
            user.id,
            payload,
            cors,
          );

        case "delete_deck":
          return await deleteDeck(
            admin,
            user.id,
            payload,
            cors,
          );

        case "add_phrase":
          return await addPhrase(
            admin,
            user.id,
            payload,
            cors,
          );

        case "remove_phrase":
          return await removePhrase(
            admin,
            user.id,
            payload,
            cors,
          );
      }
    } catch (error) {
      console.error(
        "vocabulary_decks unexpected failure",
        error,
      );

      return json(
        {
          success:
            false,

          error:
            "Vocabulary Decks is temporarily unavailable. Please try again.",

          code:
            "vocabulary_decks_error",
        },
        500,
        cors,
      );
    }
  },
);
