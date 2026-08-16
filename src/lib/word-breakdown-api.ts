import {
  getSupabaseConfig,
} from "@/lib/supabase/client";

export interface WordBreakdownWord {
  text: string;
  meaning: string;
  partOfSpeech: string;
  baseForm: string;
  grammarNote: string;
}

export interface WordBreakdownKnowledgeUsed {
  glossary: number;
  grammarRules: number;
  approvedExamples: number;
}

export interface WordBreakdownResult {
  input: string;
  naturalMeaning: string;
  literalMeaning: string;
  words: WordBreakdownWord[];
  notes: string[];
  knowledgeUsed: WordBreakdownKnowledgeUsed;
}

interface WordBreakdownSuccessResponse
  extends WordBreakdownResult {
  success: true;
}

interface WordBreakdownErrorResponse {
  success: false;
  error: string;
  code?: string;
  upgradeRecommended?: boolean;
}

type WordBreakdownResponse =
  | WordBreakdownSuccessResponse
  | WordBreakdownErrorResponse;

export type WordBreakdownApiError =
  Error & {
    code?: string;
    upgradeRecommended?: boolean;
  };

function getFunctionUrl(): string {
  const explicit =
    process.env
      .NEXT_PUBLIC_WORD_BREAKDOWN_FUNCTION_URL
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

  return `${url}/functions/v1/word-breakdown`;
}

function apiError(
  message: string,
  code?: string,
  upgradeRecommended?: boolean,
): WordBreakdownApiError {
  const error =
    new Error(
      message,
    ) as WordBreakdownApiError;

  error.code =
    code;

  error.upgradeRecommended =
    upgradeRecommended;

  return error;
}

export async function requestWordBreakdown(
  text: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<WordBreakdownResult> {
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
            text,
          }),

        cache:
          "no-store",

        signal,
      },
    );

  let data:
    WordBreakdownResponse;

  try {
    data =
      await response.json() as
        WordBreakdownResponse;
  } catch {
    throw new Error(
      "The Word Breakdown service returned an invalid response.",
    );
  }

  if (
    !response.ok ||
    !data.success
  ) {
    if (data.success) {
      throw apiError(
        "Word Breakdown failed. Please try again.",
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

    naturalMeaning:
      data.naturalMeaning,

    literalMeaning:
      data.literalMeaning,

    words:
      data.words,

    notes:
      data.notes,

    knowledgeUsed:
      data.knowledgeUsed,
  };
}
