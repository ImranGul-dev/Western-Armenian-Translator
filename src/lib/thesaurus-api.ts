import {
  getSupabaseConfig,
} from "@/lib/supabase/client";

export interface ThesaurusResult {
  input: string;
  synonyms: string[];
  antonyms: string[];
  alternatives: string[];
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

export async function requestThesaurus(
  text: string,
  accessToken: string,
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
      data.input,

    synonyms:
      data.synonyms,

    antonyms:
      data.antonyms,

    alternatives:
      data.alternatives,
  };
}