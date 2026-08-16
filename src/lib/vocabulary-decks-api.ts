import {
  getSupabaseConfig,
} from "@/lib/supabase/client";

import type {
  SavedPhraseItem,
} from "@/lib/saved-phrases-api";


export interface VocabularyDeck {
  id: string;

  name: string;
  description: string | null;

  phraseCount: number;

  createdAt: string;
  updatedAt: string;
}


export interface VocabularyDeckPhrase
  extends SavedPhraseItem {
  addedAt: string;
}


export interface VocabularyDeckListResult {
  items: VocabularyDeck[];

  total: number;
  limit: number;
  offset: number;
}


export interface VocabularyDeckDetailResult {
  deck: VocabularyDeck;

  items: VocabularyDeckPhrase[];

  total: number;
  limit: number;
  offset: number;
}


export interface CreateVocabularyDeckInput {
  name: string;
  description?: string | null;
}


export interface UpdateVocabularyDeckInput {
  name?: string;
  description?: string | null;
}


export interface AddPhraseToVocabularyDeckResult {
  created: boolean;

  deckId: string;
  savedPhraseId: string;
}


export interface RemovePhraseFromVocabularyDeckResult {
  deckId: string;

  removedSavedPhraseId: string;
}


export type VocabularyDecksApiError =
  Error & {
    code?: string;
    upgradeRecommended?: boolean;
  };


function getFunctionUrl(): string {
  const explicit =
    process.env
      .NEXT_PUBLIC_VOCABULARY_DECKS_FUNCTION_URL
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

  return `${url}/functions/v1/vocabulary-decks`;
}


function apiError(
  message: string,
  code?: string,
  upgradeRecommended?: boolean,
): VocabularyDecksApiError {
  const error =
    new Error(
      message,
    ) as VocabularyDecksApiError;

  error.code =
    code;

  error.upgradeRecommended =
    upgradeRecommended;

  return error;
}


async function requestVocabularyDecks(
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
      "The Vocabulary Decks service returned an invalid response.",
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
        : "Vocabulary Decks failed. Please try again.",

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
      "The Vocabulary Decks service returned an invalid deck.",
    );
  }

  return value as
    VocabularyDeck;
}


function requireString(
  value: unknown,
  message: string,
): string {
  if (
    typeof value !==
      "string" ||
    !value
  ) {
    throw new Error(
      message,
    );
  }

  return value;
}


export async function listVocabularyDecks(
  accessToken: string,
  options: {
    limit?: number;
    offset?: number;
  } = {},
  signal?: AbortSignal,
): Promise<VocabularyDeckListResult> {
  const data =
    await requestVocabularyDecks(
      accessToken,
      {
        action:
          "list_decks",

        limit:
          options.limit ??
          50,

        offset:
          options.offset ??
          0,
      },
      signal,
    );

  return {
    items:
      Array.isArray(
        data.items,
      )
        ? data.items as
          VocabularyDeck[]
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
          50,

    offset:
      typeof data.offset ===
        "number"
        ? data.offset
        : options.offset ??
          0,
  };
}


export async function getVocabularyDeck(
  accessToken: string,
  deckId: string,
  options: {
    limit?: number;
    offset?: number;
  } = {},
  signal?: AbortSignal,
): Promise<VocabularyDeckDetailResult> {
  const data =
    await requestVocabularyDecks(
      accessToken,
      {
        action:
          "get_deck",

        deckId,

        limit:
          options.limit ??
          50,

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
        ? data.items as
          VocabularyDeckPhrase[]
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
          50,

    offset:
      typeof data.offset ===
        "number"
        ? data.offset
        : options.offset ??
          0,
  };
}


export async function createVocabularyDeck(
  accessToken: string,
  input: CreateVocabularyDeckInput,
  signal?: AbortSignal,
): Promise<VocabularyDeck> {
  const data =
    await requestVocabularyDecks(
      accessToken,
      {
        action:
          "create_deck",

        name:
          input.name,

        description:
          input.description,
      },
      signal,
    );

  return requireDeck(
    data.item,
  );
}


export async function updateVocabularyDeck(
  accessToken: string,
  deckId: string,
  input: UpdateVocabularyDeckInput,
  signal?: AbortSignal,
): Promise<VocabularyDeck> {
  const payload:
    Record<string, unknown> =
      {
        action:
          "update_deck",

        deckId,
      };

  if (
    input.name !==
      undefined
  ) {
    payload.name =
      input.name;
  }

  if (
    input.description !==
      undefined
  ) {
    payload.description =
      input.description;
  }

  const data =
    await requestVocabularyDecks(
      accessToken,
      payload,
      signal,
    );

  return requireDeck(
    data.item,
  );
}


export async function deleteVocabularyDeck(
  accessToken: string,
  deckId: string,
  signal?: AbortSignal,
): Promise<string> {
  const data =
    await requestVocabularyDecks(
      accessToken,
      {
        action:
          "delete_deck",

        deckId,
      },
      signal,
    );

  return requireString(
    data.deletedId,
    "The Vocabulary Decks service returned an invalid delete response.",
  );
}


export async function addSavedPhraseToVocabularyDeck(
  accessToken: string,
  deckId: string,
  savedPhraseId: string,
  signal?: AbortSignal,
): Promise<AddPhraseToVocabularyDeckResult> {
  const data =
    await requestVocabularyDecks(
      accessToken,
      {
        action:
          "add_phrase",

        deckId,
        savedPhraseId,
      },
      signal,
    );

  return {
    created:
      data.created ===
        true,

    deckId:
      requireString(
        data.deckId,
        "The Vocabulary Decks service returned an invalid deck membership response.",
      ),

    savedPhraseId:
      requireString(
        data.savedPhraseId,
        "The Vocabulary Decks service returned an invalid Saved Phrase membership response.",
      ),
  };
}


export async function removeSavedPhraseFromVocabularyDeck(
  accessToken: string,
  deckId: string,
  savedPhraseId: string,
  signal?: AbortSignal,
): Promise<RemovePhraseFromVocabularyDeckResult> {
  const data =
    await requestVocabularyDecks(
      accessToken,
      {
        action:
          "remove_phrase",

        deckId,
        savedPhraseId,
      },
      signal,
    );

  return {
    deckId:
      requireString(
        data.deckId,
        "The Vocabulary Decks service returned an invalid deck membership response.",
      ),

    removedSavedPhraseId:
      requireString(
        data.removedSavedPhraseId,
        "The Vocabulary Decks service returned an invalid remove response.",
      ),
  };
}
