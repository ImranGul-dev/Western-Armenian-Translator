import {
  getSupabaseConfig,
} from "@/lib/supabase/client";

export type ThesaurusLanguage =
  | "hyw"
  | "hye";

export interface ThesaurusItem {
  text: string;
  meaning: string;
}

export interface ThesaurusResult {
  input: string;
  inputMeaning: string;
  language: ThesaurusLanguage;
  originalInput: string;
  synonyms: ThesaurusItem[];
  antonyms: ThesaurusItem[];
  alternatives: ThesaurusItem[];
}

interface ThesaurusSuccessResponse
  extends ThesaurusResult {
  success: true;
}

interface ThesaurusErrorResponse {
  success: false;
  error: string;
  code?: string;
  upgradeRecommended?: boolean;
}

type ThesaurusResponse =
  | ThesaurusSuccessResponse
  | ThesaurusErrorResponse;

export type ThesaurusApiError =
  Error & {
    code?: string;
    upgradeRecommended?: boolean;
  };

function getFunctionUrl(): string {
  const explicit =
    process.env
      .NEXT_PUBLIC_THESAURUS_FUNCTION_URL
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

  return `${url}/functions/v1/thesaurus`;
}

function apiError(
  message: string,
  code?: string,
  upgradeRecommended?: boolean,
): ThesaurusApiError {
  const error =
    new Error(
      message,
    ) as ThesaurusApiError;

  error.code = code;
  error.upgradeRecommended =
    upgradeRecommended;

  return error;
}

function normalizeItem(
  value: unknown,
): ThesaurusItem | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const item =
    value as Record<string, unknown>;

  const text =
    typeof item.text === "string"
      ? item.text.trim()
      : "";

  const meaning =
    typeof item.meaning === "string"
      ? item.meaning.trim()
      : "";

  if (!text) {
    return null;
  }

  return {
    text,
    meaning,
  };
}

function normalizeItems(
  value: unknown,
): ThesaurusItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeItem)
    .filter(
      (
        item,
      ): item is ThesaurusItem =>
        Boolean(item),
    );
}

export async function requestThesaurus(
  text: string,
  accessToken: string,
  language: ThesaurusLanguage = "hyw",
  signal?: AbortSignal,
): Promise<ThesaurusResult> {
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

          apikey: key,

          Authorization:
            `Bearer ${accessToken}`,
        },

        body:
          JSON.stringify({
            text,
            language,
          }),

        cache:
          "no-store",

        signal,
      },
    );

  let data:
    ThesaurusResponse;

  try {
    data =
      await response.json() as
        ThesaurusResponse;
  } catch {
    throw new Error(
      "The thesaurus service returned an invalid response.",
    );
  }

  if (
    !response.ok ||
    !data.success
  ) {
    if (data.success) {
      throw apiError(
        "Thesaurus lookup failed. Please try again.",
      );
    }

    throw apiError(
      data.error,
      data.code,
      data.upgradeRecommended,
    );
  }

  return {
    input:
      typeof data.input === "string"
        ? data.input
        : text,

    inputMeaning:
      typeof data.inputMeaning === "string"
        ? data.inputMeaning
        : "",

    language:
      data.language === "hye"
        ? "hye"
        : "hyw",

    originalInput:
      typeof data.originalInput === "string"
        ? data.originalInput
        : text,

    synonyms:
      normalizeItems(
        data.synonyms,
      ),

    antonyms:
      normalizeItems(
        data.antonyms,
      ),

    alternatives:
      normalizeItems(
        data.alternatives,
      ),
  };
}
