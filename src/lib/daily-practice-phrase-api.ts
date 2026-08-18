import {
  getSupabaseConfig,
} from "@/lib/supabase/client";

export type DailyPracticeDifficulty =
  | "beginner"
  | "intermediate"
  | "advanced";

export interface DailyPracticePhrase {
  id: string;
  practiceDate: string;
  westernArmenianText: string;
  englishText: string;
  category: string;
  difficulty: DailyPracticeDifficulty;
  teachingNote: string;
  publishedAt: string | null;
}

export interface DailyPracticeAdminPhrase
  extends DailyPracticePhrase {
  published: boolean;
  archivedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DailyPracticeAdminPhraseInput {
  practiceDate: string;
  westernArmenianText: string;
  englishText: string;
  category: string;
  difficulty: DailyPracticeDifficulty;
  teachingNote: string;
  published: boolean;
}

export type DailyPracticeAdminStateAction =
  | "admin_publish"
  | "admin_unpublish"
  | "admin_archive"
  | "admin_restore";

export type DailyPracticePhraseApiError =
  Error & {
    code?: string;
  };

interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
}

interface TodayResponse {
  success: true;
  action: "today";
  timezone: string;
  phrase: DailyPracticePhrase | null;
}

interface AdminListResponse {
  success: true;
  action: "admin_list";
  phrases: DailyPracticeAdminPhrase[];
}

interface AdminMutationResponse {
  success: true;
  action:
    | "admin_create"
    | "admin_update"
    | DailyPracticeAdminStateAction;
  phrase: DailyPracticeAdminPhrase;
}

function getFunctionUrl(): string {
  const explicit =
    process.env
      .NEXT_PUBLIC_DAILY_PRACTICE_PHRASE_FUNCTION_URL
      ?.trim();

  if (explicit) {
    return explicit.replace(/\/+$/u, "");
  }

  const { url } = getSupabaseConfig();

  if (!url) {
    throw new Error(
      "Supabase is not configured.",
    );
  }

  return `${url}/functions/v1/daily-practice-phrase`;
}

function apiError(
  message: string,
  code?: string,
): DailyPracticePhraseApiError {
  const error =
    new Error(message) as DailyPracticePhraseApiError;

  error.code = code;
  return error;
}

async function requestDailyPractice<T>(
  body: Record<string, unknown>,
  accessToken: string,
  signal?: AbortSignal,
): Promise<T> {
  const { key } = getSupabaseConfig();

  if (!key) {
    throw new Error(
      "Supabase is not configured.",
    );
  }

  const response = await fetch(
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
      body: JSON.stringify(body),
      cache: "no-store",
      signal,
    },
  );

  let data: unknown;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The Daily Practice Phrase service returned an invalid response.",
    );
  }

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new Error(
      "The Daily Practice Phrase service returned an invalid response.",
    );
  }

  const record =
    data as Record<string, unknown>;

  if (
    !response.ok ||
    record.success !== true
  ) {
    const errorData =
      data as Partial<ErrorResponse>;

    throw apiError(
      typeof errorData.error === "string"
        ? errorData.error
        : "Daily Practice Phrase request failed. Please try again.",
      typeof errorData.code === "string"
        ? errorData.code
        : undefined,
    );
  }

  return data as T;
}

export function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat()
      .resolvedOptions()
      .timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export async function loadDailyPracticePhrase(
  accessToken: string,
  timezone = getBrowserTimeZone(),
  signal?: AbortSignal,
): Promise<TodayResponse> {
  return requestDailyPractice<TodayResponse>(
    {
      action: "today",
      timezone,
    },
    accessToken,
    signal,
  );
}

export async function listAdminDailyPracticePhrases(
  accessToken: string,
  signal?: AbortSignal,
): Promise<DailyPracticeAdminPhrase[]> {
  const result =
    await requestDailyPractice<AdminListResponse>(
      {
        action: "admin_list",
      },
      accessToken,
      signal,
    );

  return result.phrases;
}

export async function createAdminDailyPracticePhrase(
  phrase: DailyPracticeAdminPhraseInput,
  accessToken: string,
  signal?: AbortSignal,
): Promise<DailyPracticeAdminPhrase> {
  const result =
    await requestDailyPractice<AdminMutationResponse>(
      {
        action: "admin_create",
        phrase,
      },
      accessToken,
      signal,
    );

  return result.phrase;
}

export async function updateAdminDailyPracticePhrase(
  phraseId: string,
  phrase: DailyPracticeAdminPhraseInput,
  accessToken: string,
  signal?: AbortSignal,
): Promise<DailyPracticeAdminPhrase> {
  const result =
    await requestDailyPractice<AdminMutationResponse>(
      {
        action: "admin_update",
        phraseId,
        phrase,
      },
      accessToken,
      signal,
    );

  return result.phrase;
}

export async function changeAdminDailyPracticePhraseState(
  phraseId: string,
  action: DailyPracticeAdminStateAction,
  accessToken: string,
  signal?: AbortSignal,
): Promise<DailyPracticeAdminPhrase> {
  const result =
    await requestDailyPractice<AdminMutationResponse>(
      {
        action,
        phraseId,
      },
      accessToken,
      signal,
    );

  return result.phrase;
}
