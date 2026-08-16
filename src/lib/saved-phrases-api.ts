import {
  getSupabaseConfig,
} from "@/lib/supabase/client";

export type SavedPhraseLanguage =
  | "en"
  | "hyw"
  | "hye";

export interface SavedPhraseItem {
  id: string;

  sourceText: string;
  translatedText: string;

  sourceLanguage:
    SavedPhraseLanguage;

  targetLanguage:
    SavedPhraseLanguage;

  isFavorite: boolean;

  createdAt: string;
  updatedAt: string;
}

export interface SavedPhraseListResult {
  items: SavedPhraseItem[];
  total: number;
  limit: number;
  offset: number;
  favoritesOnly: boolean;
}

export interface SaveSavedPhraseInput {
  sourceText: string;
  translatedText: string;

  sourceLanguage:
    SavedPhraseLanguage;

  targetLanguage:
    SavedPhraseLanguage;

  isFavorite?: boolean;
}

export interface SaveSavedPhraseResult {
  created: boolean;
  item: SavedPhraseItem;
}

export type SavedPhrasesApiError =
  Error & {
    code?: string;
    upgradeRecommended?: boolean;
  };

function getFunctionUrl(): string {
  const explicit =
    process.env
      .NEXT_PUBLIC_SAVED_PHRASES_FUNCTION_URL
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

  return `${url}/functions/v1/saved-phrases`;
}

function apiError(
  message: string,
  code?: string,
  upgradeRecommended?: boolean,
): SavedPhrasesApiError {
  const error =
    new Error(
      message,
    ) as SavedPhrasesApiError;

  error.code =
    code;

  error.upgradeRecommended =
    upgradeRecommended;

  return error;
}

async function requestSavedPhrases(
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
      "The Saved Phrases service returned an invalid response.",
    );
  }

  if (
    !response.ok ||
    data.success !== true
  ) {
    throw apiError(
      typeof data.error ===
        "string"
        ? data.error
        : "Saved Phrases failed. Please try again.",

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

export async function listSavedPhrases(
  accessToken: string,
  options: {
    limit?: number;
    offset?: number;
    favoritesOnly?: boolean;
  } = {},
  signal?: AbortSignal,
): Promise<SavedPhraseListResult> {
  const data =
    await requestSavedPhrases(
      accessToken,
      {
        action:
          "list",

        limit:
          options.limit ?? 50,

        offset:
          options.offset ?? 0,

        favoritesOnly:
          options.favoritesOnly ??
          false,
      },
      signal,
    );

  return {
    items:
      Array.isArray(
        data.items,
      )
        ? data.items as SavedPhraseItem[]
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
        : options.limit ?? 50,

    offset:
      typeof data.offset ===
        "number"
        ? data.offset
        : options.offset ?? 0,

    favoritesOnly:
      data.favoritesOnly ===
        true,
  };
}

export async function saveSavedPhrase(
  accessToken: string,
  input: SaveSavedPhraseInput,
  signal?: AbortSignal,
): Promise<SaveSavedPhraseResult> {
  const data =
    await requestSavedPhrases(
      accessToken,
      {
        action:
          "save",

        sourceText:
          input.sourceText,

        translatedText:
          input.translatedText,

        sourceLanguage:
          input.sourceLanguage,

        targetLanguage:
          input.targetLanguage,

        isFavorite:
          input.isFavorite ??
          false,
      },
      signal,
    );

  if (
    !data.item ||
    typeof data.item !==
      "object"
  ) {
    throw new Error(
      "The Saved Phrases service returned an invalid saved phrase.",
    );
  }

  return {
    created:
      data.created ===
        true,

    item:
      data.item as
        SavedPhraseItem,
  };
}

export async function setSavedPhraseFavorite(
  accessToken: string,
  id: string,
  favorite: boolean,
  signal?: AbortSignal,
): Promise<SavedPhraseItem> {
  const data =
    await requestSavedPhrases(
      accessToken,
      {
        action:
          favorite
            ? "favorite"
            : "unfavorite",

        id,
      },
      signal,
    );

  if (
    !data.item ||
    typeof data.item !==
      "object"
  ) {
    throw new Error(
      "The Saved Phrases service returned an invalid saved phrase.",
    );
  }

  return data.item as
    SavedPhraseItem;
}

export async function deleteSavedPhrase(
  accessToken: string,
  id: string,
  signal?: AbortSignal,
): Promise<string> {
  const data =
    await requestSavedPhrases(
      accessToken,
      {
        action:
          "delete",

        id,
      },
      signal,
    );

  if (
    typeof data.deletedId !==
      "string"
  ) {
    throw new Error(
      "The Saved Phrases service returned an invalid delete response.",
    );
  }

  return data.deletedId;
}
