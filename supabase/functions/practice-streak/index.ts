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

import {
  isRuntimeSystemFeatureEnabled,
} from "../_shared/system-feature-toggles.ts";


interface PracticeStreakRequest {
  timezone?: unknown;
}


interface PracticeStreakRow {
  current_streak: number;
  longest_streak: number;
  practiced_today: boolean;
  last_practice_date: string | null;
  today_review_count: number;
  total_practice_days: number;
}


const MAX_TIMEZONE_CHARACTERS =
  100;


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
            "Practice Streak is not configured correctly.",
          code:
            "practice_streak_configuration_error",
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

    const featureEnabled =
      await isRuntimeSystemFeatureEnabled(
        admin,
        "practice_streak",
      );

    if (!featureEnabled) {
      return json(
        {
          success: false,
          error:
            "Practice Streak is temporarily unavailable.",
          code:
            "feature_disabled",
        },
        503,
        cors,
      );
    }

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
            "Please log in to view your Practice Streak.",
          code:
            "auth_required",
        },
        401,
        cors,
      );
    }

    let payload:
      PracticeStreakRequest;

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
        raw as PracticeStreakRequest;
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
          "practice_streak profile lookup failed",
          profileResult.error,
        );

        return json(
          {
            success: false,
            error:
              "Practice Streak is temporarily unavailable.",
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
          "practice_streak",
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
              "Practice Streak is available with Person or Schools access.",
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
          "get_practice_streak",
          {
            p_user_id:
              user.id,
            p_timezone:
              timezone,
          },
        );

      if (error) {
        console.error(
          "practice_streak rpc failed",
          error,
        );

        const invalidTimezone =
          error.code ===
            "22023";

        return json(
          {
            success: false,
            error:
              invalidTimezone
                ? "The browser time zone is not recognized."
                : "Practice Streak could not be loaded.",
            code:
              invalidTimezone
                ? "invalid_timezone"
                : "practice_streak_load_failed",
          },
          invalidTimezone
            ? 400
            : 500,
          cors,
        );
      }

      const rows =
        (
          data ??
          []
        ) as PracticeStreakRow[];

      const row =
        rows[0];

      if (!row) {
        return json(
          {
            success: false,
            error:
              "Practice Streak returned no result.",
            code:
              "practice_streak_result_missing",
          },
          500,
          cors,
        );
      }

      return json(
        {
          success: true,
          timezone,
          streak: {
            currentStreak:
              row.current_streak,
            longestStreak:
              row.longest_streak,
            practicedToday:
              row.practiced_today,
            lastPracticeDate:
              row.last_practice_date,
            todayReviewCount:
              row.today_review_count,
            totalPracticeDays:
              row.total_practice_days,
          },
        },
        200,
        cors,
      );
    } catch (error) {
      console.error(
        "practice_streak unexpected failure",
        error,
      );

      return json(
        {
          success: false,
          error:
            "Practice Streak is temporarily unavailable. Please try again.",
          code:
            "practice_streak_error",
        },
        500,
        cors,
      );
    }
  },
);
