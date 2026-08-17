import {
  getSupabaseConfig,
} from "@/lib/supabase/client";


export interface PracticeStreak {
  currentStreak: number;
  longestStreak: number;
  practicedToday: boolean;
  lastPracticeDate: string | null;
  todayReviewCount: number;
  totalPracticeDays: number;
}


export interface PracticeStreakResult {
  timezone: string;
  streak: PracticeStreak;
}


export type PracticeStreakApiError =
  Error & {
    code?: string;
    upgradeRecommended?: boolean;
  };


function getFunctionUrl(): string {
  const explicit =
    process.env
      .NEXT_PUBLIC_PRACTICE_STREAK_FUNCTION_URL
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

  return `${url}/functions/v1/practice-streak`;
}


function apiError(
  message: string,
  code?: string,
  upgradeRecommended?: boolean,
): PracticeStreakApiError {
  const error =
    new Error(
      message,
    ) as PracticeStreakApiError;

  error.code =
    code;

  error.upgradeRecommended =
    upgradeRecommended;

  return error;
}


function finiteInteger(
  value: unknown,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.floor(value),
  );
}


function parseStreak(
  value: unknown,
): PracticeStreak {
  const record =
    value &&
    typeof value === "object"
      ? value as Record<string, unknown>
      : {};

  return {
    currentStreak:
      finiteInteger(
        record.currentStreak,
      ),

    longestStreak:
      finiteInteger(
        record.longestStreak,
      ),

    practicedToday:
      record.practicedToday ===
      true,

    lastPracticeDate:
      typeof record.lastPracticeDate === "string"
        ? record.lastPracticeDate
        : null,

    todayReviewCount:
      finiteInteger(
        record.todayReviewCount,
      ),

    totalPracticeDays:
      finiteInteger(
        record.totalPracticeDays,
      ),
  };
}


export function getBrowserTimeZone(): string {
  try {
    return Intl
      .DateTimeFormat()
      .resolvedOptions()
      .timeZone ||
      "UTC";
  } catch {
    return "UTC";
  }
}


export async function loadPracticeStreak(
  accessToken: string,
  timezone = getBrowserTimeZone(),
  signal?: AbortSignal,
): Promise<PracticeStreakResult> {
  const cleanTimezone =
    timezone.trim() ||
    "UTC";

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
            timezone:
              cleanTimezone,
          }),
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
      "The Practice Streak service returned an invalid response.",
    );
  }

  if (
    !response.ok ||
    data.success !== true
  ) {
    throw apiError(
      typeof data.error === "string"
        ? data.error
        : "Practice Streak could not be loaded.",
      typeof data.code === "string"
        ? data.code
        : undefined,
      typeof data.upgradeRecommended === "boolean"
        ? data.upgradeRecommended
        : undefined,
    );
  }

  return {
    timezone:
      typeof data.timezone === "string"
        ? data.timezone
        : cleanTimezone,

    streak:
      parseStreak(
        data.streak,
      ),
  };
}
