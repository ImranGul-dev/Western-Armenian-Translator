import {
  getBrowserTimeZone,
} from "@/lib/practice-streak-api";

import {
  getSupabaseConfig,
} from "@/lib/supabase/client";


export type PracticeAnalyticsPeriod =
  | 7
  | 30
  | 90;


export interface PracticeAnalyticsDailyActivity {
  date: string;
  reviews: number;
}


export interface PracticeAnalyticsRatingBreakdown {
  again: number;
  hard: number;
  good: number;
  easy: number;
}


export interface PracticeAnalytics {
  periodDays: PracticeAnalyticsPeriod;
  periodStartDate: string;
  periodEndDate: string;
  totalReviews: number;
  practiceDays: number;
  practiceSessions: number;
  recallRate: number;
  averageMasteryChange: number;
  ratings: PracticeAnalyticsRatingBreakdown;
  dailyActivity: PracticeAnalyticsDailyActivity[];
}


export interface PracticeAnalyticsResult {
  timezone: string;
  analytics: PracticeAnalytics;
}


export type PracticeAnalyticsApiError =
  Error & {
    code?: string;
    upgradeRecommended?: boolean;
  };


function getFunctionUrl(): string {
  const explicit =
    process.env
      .NEXT_PUBLIC_PRACTICE_ANALYTICS_FUNCTION_URL
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

  return `${url}/functions/v1/practice-analytics`;
}


function apiError(
  message: string,
  code?: string,
  upgradeRecommended?: boolean,
): PracticeAnalyticsApiError {
  const error =
    new Error(
      message,
    ) as PracticeAnalyticsApiError;

  error.code =
    code;

  error.upgradeRecommended =
    upgradeRecommended;

  return error;
}


function finiteNumber(
  value: unknown,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return 0;
  }

  return value;
}


function finiteInteger(
  value: unknown,
): number {
  return Math.max(
    0,
    Math.floor(
      finiteNumber(value),
    ),
  );
}


function parsePeriod(
  value: unknown,
): PracticeAnalyticsPeriod {
  if (
    value === 7 ||
    value === 30 ||
    value === 90
  ) {
    return value;
  }

  return 30;
}


function parseRatings(
  value: unknown,
): PracticeAnalyticsRatingBreakdown {
  const record =
    value &&
    typeof value === "object"
      ? value as Record<string, unknown>
      : {};

  return {
    again:
      finiteInteger(
        record.again,
      ),
    hard:
      finiteInteger(
        record.hard,
      ),
    good:
      finiteInteger(
        record.good,
      ),
    easy:
      finiteInteger(
        record.easy,
      ),
  };
}


function parseDailyActivity(
  value: unknown,
): PracticeAnalyticsDailyActivity[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(
    (item) => {
      if (
        !item ||
        typeof item !== "object"
      ) {
        return [];
      }

      const record =
        item as Record<string, unknown>;

      if (
        typeof record.date !== "string"
      ) {
        return [];
      }

      return [
        {
          date:
            record.date,
          reviews:
            finiteInteger(
              record.reviews,
            ),
        },
      ];
    },
  );
}


function parseAnalytics(
  value: unknown,
): PracticeAnalytics {
  const record =
    value &&
    typeof value === "object"
      ? value as Record<string, unknown>
      : {};

  return {
    periodDays:
      parsePeriod(
        record.periodDays,
      ),

    periodStartDate:
      typeof record.periodStartDate === "string"
        ? record.periodStartDate
        : "",

    periodEndDate:
      typeof record.periodEndDate === "string"
        ? record.periodEndDate
        : "",

    totalReviews:
      finiteInteger(
        record.totalReviews,
      ),

    practiceDays:
      finiteInteger(
        record.practiceDays,
      ),

    practiceSessions:
      finiteInteger(
        record.practiceSessions,
      ),

    recallRate:
      finiteNumber(
        record.recallRate,
      ),

    averageMasteryChange:
      finiteNumber(
        record.averageMasteryChange,
      ),

    ratings:
      parseRatings(
        record.ratings,
      ),

    dailyActivity:
      parseDailyActivity(
        record.dailyActivity,
      ),
  };
}


export async function loadPracticeAnalytics(
  accessToken: string,
  period: PracticeAnalyticsPeriod = 30,
  timezone = getBrowserTimeZone(),
  signal?: AbortSignal,
): Promise<PracticeAnalyticsResult> {
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
            days:
              period,
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
      "The Practice Analytics service returned an invalid response.",
    );
  }

  if (
    !response.ok ||
    data.success !== true
  ) {
    throw apiError(
      typeof data.error === "string"
        ? data.error
        : "Practice Analytics could not be loaded.",
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

    analytics:
      parseAnalytics(
        data.analytics,
      ),
  };
}
