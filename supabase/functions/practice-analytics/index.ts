import {
  createClient,
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


interface PracticeAnalyticsRequest {
  timezone?: unknown;
  days?: unknown;
}


interface DailyActivityRow {
  date?: unknown;
  reviews?: unknown;
}


interface PracticeAnalyticsRow {
  period_days: number;
  period_start_date: string;
  period_end_date: string;
  total_reviews: number;
  practice_days: number;
  practice_sessions: number;
  recall_rate: number;
  average_mastery_change: number;
  again_count: number;
  hard_count: number;
  good_count: number;
  easy_count: number;
  daily_activity: DailyActivityRow[];
}


const MAX_TIMEZONE_CHARACTERS =
  100;

const ALLOWED_PERIODS =
  new Set([
    7,
    30,
    90,
  ]);


function json(
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string>,
): Response {
  return Response.json(
    body,
    {
      status,
      headers: {
        ...headers,
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":
          "no-store",
        "X-Content-Type-Options":
          "nosniff",
      },
    },
  );
}


function cleanTimezone(
  value: unknown,
): string | null {
  if (
    typeof value !==
      "string"
  ) {
    return null;
  }

  const timezone =
    Array.from(
      value.trim(),
    )
      .slice(
        0,
        MAX_TIMEZONE_CHARACTERS,
      )
      .join("");

  return timezone ||
    null;
}


function cleanPeriod(
  value: unknown,
): number | null {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    !ALLOWED_PERIODS.has(value)
  ) {
    return null;
  }

  return value;
}


function finiteNumber(
  value: unknown,
): number {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 0;

  return Number.isFinite(number)
    ? number
    : 0;
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
          success: false,
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
          status: 204,
          headers: cors,
        },
      );
    }

    if (
      request.method !==
        "POST"
    ) {
      return json(
        {
          success: false,
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
          success: false,
          error:
            "Practice Analytics is not configured correctly.",
          code:
            "practice_analytics_configuration_error",
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
            persistSession: false,
            autoRefreshToken: false,
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
          success: false,
          error:
            "Please log in to view Practice Analytics.",
          code:
            "auth_required",
        },
        401,
        cors,
      );
    }

    let payload:
      PracticeAnalyticsRequest;

    try {
      const raw:
        unknown =
        await request.json();

      if (
        !raw ||
        typeof raw !== "object" ||
        Array.isArray(raw)
      ) {
        throw new Error(
          "Invalid payload.",
        );
      }

      payload =
        raw as PracticeAnalyticsRequest;
    } catch {
      return json(
        {
          success: false,
          error:
            "The request could not be read.",
          code:
            "invalid_json",
        },
        400,
        cors,
      );
    }

    const timezone =
      cleanTimezone(
        payload.timezone,
      );

    if (!timezone) {
      return json(
        {
          success: false,
          error:
            "A valid browser time zone is required.",
          code:
            "invalid_timezone",
        },
        400,
        cors,
      );
    }

    const days =
      cleanPeriod(
        payload.days,
      );

    if (!days) {
      return json(
        {
          success: false,
          error:
            "Choose a 7, 30 or 90 day analytics period.",
          code:
            "invalid_period",
        },
        400,
        cors,
      );
    }

    try {
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
            .from("profiles")
            .select("role")
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
          "practice_analytics profile lookup failed",
          profileResult.error,
        );

        return json(
          {
            success: false,
            error:
              "Practice Analytics is temporarily unavailable.",
            code:
              "profile_lookup_failed",
          },
          503,
          cors,
        );
      }

      const role =
        profileResult.data
            ?.role === "admin"
          ? "admin"
          : profileResult.data
                ?.role === "language_editor"
            ? "language_editor"
            : "user";

      const allowed =
        hasPaidFeatureAccess(
          "practice_analytics",
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
            success: false,
            error:
              "Practice Analytics is available with Person or Schools access.",
            code:
              "paid_feature_required",
            upgradeRecommended:
              true,
          },
          403,
          cors,
        );
      }

      const {
        data,
        error,
      } =
        await admin.rpc(
          "get_practice_analytics",
          {
            p_user_id:
              user.id,
            p_timezone:
              timezone,
            p_days:
              days,
          },
        );

      if (error) {
        console.error(
          "practice_analytics rpc failed",
          error,
        );

        const invalidArgument =
          error.code ===
            "22023";

        return json(
          {
            success: false,
            error:
              invalidArgument
                ? "The analytics period or browser time zone is not recognized."
                : "Practice Analytics could not be loaded.",
            code:
              invalidArgument
                ? "invalid_analytics_request"
                : "practice_analytics_load_failed",
          },
          invalidArgument
            ? 400
            : 500,
          cors,
        );
      }

      const rows =
        (
          data ??
          []
        ) as PracticeAnalyticsRow[];

      const row =
        rows[0];

      if (!row) {
        return json(
          {
            success: false,
            error:
              "Practice Analytics returned no result.",
            code:
              "practice_analytics_result_missing",
          },
          500,
          cors,
        );
      }

      const dailyActivity =
        Array.isArray(
          row.daily_activity,
        )
          ? row.daily_activity.flatMap(
              (item) => {
                if (
                  !item ||
                  typeof item !==
                    "object"
                ) {
                  return [];
                }

                const record =
                  item as Record<string, unknown>;

                if (
                  typeof record.date !==
                    "string"
                ) {
                  return [];
                }

                return [
                  {
                    date:
                      record.date,
                    reviews:
                      Math.max(
                        0,
                        Math.floor(
                          finiteNumber(
                            record.reviews,
                          ),
                        ),
                      ),
                  },
                ];
              },
            )
          : [];

      return json(
        {
          success: true,
          timezone,
          analytics: {
            periodDays:
              Math.max(
                0,
                Math.floor(
                  finiteNumber(
                    row.period_days,
                  ),
                ),
              ),
            periodStartDate:
              row.period_start_date,
            periodEndDate:
              row.period_end_date,
            totalReviews:
              Math.max(
                0,
                Math.floor(
                  finiteNumber(
                    row.total_reviews,
                  ),
                ),
              ),
            practiceDays:
              Math.max(
                0,
                Math.floor(
                  finiteNumber(
                    row.practice_days,
                  ),
                ),
              ),
            practiceSessions:
              Math.max(
                0,
                Math.floor(
                  finiteNumber(
                    row.practice_sessions,
                  ),
                ),
              ),
            recallRate:
              finiteNumber(
                row.recall_rate,
              ),
            averageMasteryChange:
              finiteNumber(
                row.average_mastery_change,
              ),
            ratings: {
              again:
                Math.max(
                  0,
                  Math.floor(
                    finiteNumber(
                      row.again_count,
                    ),
                  ),
                ),
              hard:
                Math.max(
                  0,
                  Math.floor(
                    finiteNumber(
                      row.hard_count,
                    ),
                  ),
                ),
              good:
                Math.max(
                  0,
                  Math.floor(
                    finiteNumber(
                      row.good_count,
                    ),
                  ),
                ),
              easy:
                Math.max(
                  0,
                  Math.floor(
                    finiteNumber(
                      row.easy_count,
                    ),
                  ),
                ),
            },
            dailyActivity,
          },
        },
        200,
        cors,
      );
    } catch (error) {
      console.error(
        "practice_analytics unexpected failure",
        error,
      );

      return json(
        {
          success: false,
          error:
            "Practice Analytics is temporarily unavailable. Please try again.",
          code:
            "practice_analytics_error",
        },
        500,
        cors,
      );
    }
  },
);
