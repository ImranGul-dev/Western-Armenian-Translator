import {
  getSupabaseConfig,
} from "@/lib/supabase/client";


export type HistoryType =
  | "translation"
  | "thesaurus"
  | "role_play";

export type HistoryFilter =
  | "all"
  | HistoryType;

export interface TranslationHistoryItem {
  id: string;
  type: "translation";
  createdAt: string;
  sortAt: string;
  data: {
    sourceLanguage: string;
    targetLanguage: string;
    sourceText: string;
    translatedText: string;
  };
}

export interface ThesaurusHistoryItem {
  id: string;
  type: "thesaurus";
  createdAt: string;
  sortAt: string;
  data: {
    input: string;
    synonyms: string[];
    antonyms: string[];
    alternatives: string[];
  };
}

export interface RolePlayHistoryItem {
  id: string;
  type: "role_play";
  createdAt: string;
  sortAt: string;
  data: {
    scenarioSlug: string;
    scenarioTitle: string;
    status: string;
    interactionMode: string;
    messageCount: number;
    startedAt: string;
    lastActivityAt: string;
    endedAt: string | null;
  };
}

export type HistoryItem =
  | TranslationHistoryItem
  | ThesaurusHistoryItem
  | RolePlayHistoryItem;

export interface HistoryListResult {
  success: true;
  action: "list";
  type: HistoryFilter;
  query: string;
  limit: number;
  offset: number;
  items: HistoryItem[];
  hasMore: boolean;
}

interface HistoryMutationResult {
  success: true;
  action: "delete" | "clear";
  type: HistoryFilter;
  id?: string;
}

interface HistoryErrorResponse {
  success: false;
  error: string;
  code?: string;
  upgradeRecommended?: boolean;
}

export type HistoryApiError =
  Error & {
    code?: string;
    upgradeRecommended?: boolean;
  };


function getFunctionUrl(): string {
  const explicit =
    process.env
      .NEXT_PUBLIC_HISTORY_FUNCTION_URL
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

  return `${url}/functions/v1/history`;
}


function apiError(
  message: string,
  code?: string,
  upgradeRecommended?: boolean,
): HistoryApiError {
  const error =
    new Error(
      message,
    ) as HistoryApiError;

  error.code = code;
  error.upgradeRecommended =
    upgradeRecommended;

  return error;
}


async function requestHistory<T>(
  body: Record<string, unknown>,
  accessToken: string,
  signal?: AbortSignal,
): Promise<T> {
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
          JSON.stringify(body),

        cache:
          "no-store",

        signal,
      },
    );

  let data: unknown;

  try {
    data =
      await response.json();
  } catch {
    throw new Error(
      "The History service returned an invalid response.",
    );
  }

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new Error(
      "The History service returned an invalid response.",
    );
  }

  const record =
    data as Record<string, unknown>;

  if (
    !response.ok ||
    record.success !== true
  ) {
    const errorData =
      data as Partial<HistoryErrorResponse>;

    throw apiError(
      typeof errorData.error === "string"
        ? errorData.error
        : "History request failed. Please try again.",

      typeof errorData.code === "string"
        ? errorData.code
        : undefined,

      errorData.upgradeRecommended === true,
    );
  }

  return data as T;
}


export async function listHistory(
  accessToken: string,
  options: {
    type?: HistoryFilter;
    query?: string;
    limit?: number;
    offset?: number;
    signal?: AbortSignal;
  } = {},
): Promise<HistoryListResult> {
  return requestHistory<HistoryListResult>(
    {
      action:
        "list",

      type:
        options.type ?? "all",

      query:
        options.query ?? "",

      limit:
        options.limit ?? 20,

      offset:
        options.offset ?? 0,
    },
    accessToken,
    options.signal,
  );
}


export async function deleteHistoryItem(
  accessToken: string,
  type: HistoryType,
  id: string,
  signal?: AbortSignal,
): Promise<void> {
  await requestHistory<HistoryMutationResult>(
    {
      action:
        "delete",
      type,
      id,
    },
    accessToken,
    signal,
  );
}


export async function clearHistory(
  accessToken: string,
  type: HistoryFilter = "all",
  signal?: AbortSignal,
): Promise<void> {
  await requestHistory<HistoryMutationResult>(
    {
      action:
        "clear",
      type,
    },
    accessToken,
    signal,
  );
}
