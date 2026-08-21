import OpenAI from "openai";

import {
  createClient,
  type SupabaseClient,
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

interface FeedbackRequest {
  timezone?: unknown;
  markViewed?: unknown;
}

interface VoiceStreakRow {
  current_voice_streak: number;
  longest_voice_streak: number;
  practiced_today: boolean;
  last_voice_practice_date: string | null;
  total_voice_practice_days: number;
  eligible_for_feedback: boolean;
  streak_start_date: string | null;
}

interface FeedbackReportRow {
  id: string;
  user_id: string;
  streak_start_date: string;
  streak_end_date: string;
  voice_practice_days: number;
  source_turn_count: number;
  plan_slug: string;
  report_summary: string;
  strengths: unknown;
  focus_areas: unknown;
  pronunciation_guidance: string;
  tutor_recommendation: string;
  tutoring_url: string;
  model: string | null;
  generated_at: string;
  viewed_at: string | null;
}

interface VoiceTurnRow {
  content: string;
  created_at: string;
  session_id: string;
}

interface FeedbackPayload {
  summary: string;
  strengths: string[];
  focusAreas: string[];
  pronunciationGuidance: string;
  tutorRecommendation: string;
}

const MAX_TIMEZONE_CHARACTERS = 100;
const MAX_ANALYSIS_TURNS = 80;
const MAX_ANALYSIS_CHARACTERS = 24000;
const TUTORING_URL =
  "https://tunapp.com/western-armenian-tutoring";

function json(
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string>,
): Response {
  return Response.json(body, {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function cleanTimezone(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const timezone = Array.from(value.trim())
    .slice(0, MAX_TIMEZONE_CHARACTERS)
    .join("");

  return timezone || null;
}

function roleFromProfile(value: unknown) {
  if (value === "admin") return "admin";
  if (value === "language_editor") return "language_editor";
  return "user";
}

function reasoningForModel(
  model: string,
): { effort: "none" | "minimal" } | undefined {
  const normalized = model.trim().toLowerCase();

  if (
    normalized === "gpt-5.4" ||
    normalized.startsWith("gpt-5.4-")
  ) {
    return { effort: "none" };
  }

  if (
    normalized === "gpt-5-mini" ||
    normalized.startsWith("gpt-5-mini-")
  ) {
    return { effort: "minimal" };
  }

  return undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function cleanText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : fallback;
}

function parseFeedback(raw: string): FeedbackPayload {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("INVALID_FEEDBACK_JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("INVALID_FEEDBACK_JSON");
  }

  const record = parsed as Record<string, unknown>;

  const summary = cleanText(record.summary);
  const strengths = stringArray(record.strengths);
  const focusAreas = stringArray(record.focusAreas);
  const pronunciationGuidance = cleanText(
    record.pronunciationGuidance,
    "Keep practising aloud. This report is based on speech transcripts, so exact sound-level pronunciation mistakes cannot be confirmed from the available data.",
  );
  const tutorRecommendation = cleanText(
    record.tutorRecommendation,
    "A live Tun tutor can help you practise the areas that would benefit from real-time speaking feedback.",
  );

  if (!summary || strengths.length === 0 || focusAreas.length === 0) {
    throw new Error("INVALID_FEEDBACK_JSON");
  }

  return {
    summary,
    strengths,
    focusAreas,
    pronunciationGuidance,
    tutorRecommendation,
  };
}

function reportResponse(row: FeedbackReportRow) {
  return {
    id: row.id,
    streakStartDate: row.streak_start_date,
    streakEndDate: row.streak_end_date,
    voicePracticeDays: row.voice_practice_days,
    sourceTurnCount: row.source_turn_count,
    planSlug: row.plan_slug,
    summary: row.report_summary,
    strengths: stringArray(row.strengths),
    focusAreas: stringArray(row.focus_areas),
    pronunciationGuidance: row.pronunciation_guidance,
    tutorRecommendation: row.tutor_recommendation,
    tutoringUrl: row.tutoring_url,
    generatedAt: row.generated_at,
    viewedAt: row.viewed_at,
  };
}

async function loadVoiceTurns(
  admin: SupabaseClient,
  userId: string,
  streakStartDate: string,
  timezone: string,
): Promise<VoiceTurnRow[]> {
  const sessionsResult = await admin
    .from("role_play_sessions")
    .select("id")
    .eq("user_id", userId);

  if (sessionsResult.error) {
    throw sessionsResult.error;
  }

  const sessionIds = (sessionsResult.data ?? [])
    .map((row) => row.id as string)
    .filter(Boolean);

  if (!sessionIds.length) return [];

  const fromIso = new Date(
    `${streakStartDate}T00:00:00.000Z`,
  ).toISOString();

  const turnsResult = await admin
    .from("role_play_turns")
    .select("content,created_at,session_id")
    .in("session_id", sessionIds)
    .eq("speaker", "user")
    .eq("modality", "voice")
    .gte("created_at", fromIso)
    .order("created_at", { ascending: true })
    .limit(MAX_ANALYSIS_TURNS);

  if (turnsResult.error) {
    throw turnsResult.error;
  }

  // The DB streak is the source of truth for eligibility. We deliberately keep
  // this transcript query simple and bounded; the exact local-day calculation
  // remains inside get_role_play_voice_streak().
  void timezone;

  return (turnsResult.data ?? []) as VoiceTurnRow[];
}

function buildTranscript(turns: VoiceTurnRow[]): string {
  let text = turns
    .map((turn, index) =>
      `Voice turn ${index + 1}: ${turn.content.trim()}`,
    )
    .join("\n");

  if (text.length > MAX_ANALYSIS_CHARACTERS) {
    text = `${text.slice(0, MAX_ANALYSIS_CHARACTERS)}\n[Older transcript content omitted.]`;
  }

  return text;
}

Deno.serve(async (request: Request): Promise<Response> => {
  const config = getRuntimeConfig();
  const origin = request.headers.get("origin");

  if (!isOriginAllowed(origin, config.allowedOrigins)) {
    return json(
      {
        success: false,
        error: "Origin is not allowed.",
        code: "origin_not_allowed",
      },
      403,
      { Vary: "Origin" },
    );
  }

  const cors = buildCorsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method !== "POST") {
    return json(
      {
        success: false,
        error: "Method not allowed.",
        code: "method_not_allowed",
      },
      405,
      cors,
    );
  }

  if (!config.supabaseUrl || !config.adminKey) {
    return json(
      {
        success: false,
        error: "AI Voice feedback is not configured correctly.",
        code: "configuration_error",
      },
      503,
      cors,
    );
  }

  const admin = createClient(config.supabaseUrl, config.adminKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const featureEnabled = await isRuntimeSystemFeatureEnabled(
    admin,
    "role_play",
  );

  if (!featureEnabled) {
    return json(
      {
        success: false,
        error: "AI Role-Play is temporarily unavailable.",
        code: "feature_disabled",
      },
      503,
      cors,
    );
  }

  let user;

  try {
    user = await requireUser(admin, request);
  } catch {
    return json(
      {
        success: false,
        error: "Please log in to view AI Voice feedback.",
        code: "auth_required",
      },
      401,
      cors,
    );
  }

  let payload: FeedbackRequest;

  try {
    const raw: unknown = await request.json();

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid payload.");
    }

    payload = raw as FeedbackRequest;
  } catch {
    return json(
      {
        success: false,
        error: "The request could not be read.",
        code: "invalid_json",
      },
      400,
      cors,
    );
  }

  const timezone = cleanTimezone(payload.timezone);

  if (!timezone) {
    return json(
      {
        success: false,
        error: "A valid browser time zone is required.",
        code: "invalid_timezone",
      },
      400,
      cors,
    );
  }

  try {
    const [effectivePlan, profileResult] = await Promise.all([
      resolveEffectivePlan(admin, user.id),
      admin
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    if (profileResult.error) {
      throw profileResult.error;
    }

    const role = roleFromProfile(profileResult.data?.role);

    const allowed = hasPaidFeatureAccess("role_play", {
      userId: user.id,
      role,
      plan: { slug: effectivePlan.slug },
    });

    if (!allowed) {
      return json(
        {
          success: false,
          error: "AI Voice feedback is available with paid Role-Play access.",
          code: "paid_feature_required",
          upgradeRecommended: true,
        },
        403,
        cors,
      );
    }

    const { data: streakData, error: streakError } = await admin.rpc(
      "get_role_play_voice_streak",
      {
        p_user_id: user.id,
        p_timezone: timezone,
      },
    );

    if (streakError) {
      const invalidTimezone = streakError.code === "22023";

      return json(
        {
          success: false,
          error: invalidTimezone
            ? "The browser time zone is not recognized."
            : "AI Voice practice progress could not be loaded.",
          code: invalidTimezone
            ? "invalid_timezone"
            : "voice_streak_load_failed",
        },
        invalidTimezone ? 400 : 500,
        cors,
      );
    }

    const streak = ((streakData ?? []) as VoiceStreakRow[])[0];

    if (!streak) {
      return json(
        {
          success: false,
          error: "AI Voice practice progress returned no result.",
          code: "voice_streak_result_missing",
        },
        500,
        cors,
      );
    }

    const baseResponse = {
      currentVoiceStreak: streak.current_voice_streak,
      longestVoiceStreak: streak.longest_voice_streak,
      practicedToday: streak.practiced_today,
      lastVoicePracticeDate: streak.last_voice_practice_date,
      totalVoicePracticeDays: streak.total_voice_practice_days,
      eligibleForFeedback: streak.eligible_for_feedback,
      streakStartDate: streak.streak_start_date,
    };

    if (!streak.eligible_for_feedback || !streak.streak_start_date) {
      return json(
        {
          success: true,
          status: "progress",
          streak: baseResponse,
          daysRemaining: Math.max(0, 5 - streak.current_voice_streak),
          report: null,
        },
        200,
        cors,
      );
    }

    const existingResult = await admin
      .from("role_play_voice_feedback_reports")
      .select("*")
      .eq("user_id", user.id)
      .eq("streak_start_date", streak.streak_start_date)
      .maybeSingle();

    if (existingResult.error) {
      throw existingResult.error;
    }

    let report = existingResult.data as FeedbackReportRow | null;

    if (!report) {
      if (!config.openAiApiKey) {
        return json(
          {
            success: false,
            error: "The personalised feedback service is not configured correctly.",
            code: "openai_configuration_error",
          },
          503,
          cors,
        );
      }

      const turns = await loadVoiceTurns(
        admin,
        user.id,
        streak.streak_start_date,
        timezone,
      );

      if (!turns.length) {
        return json(
          {
            success: false,
            error: "No AI Voice practice transcript was available for the report.",
            code: "voice_transcript_missing",
          },
          409,
          cors,
        );
      }

      const transcript = buildTranscript(turns);
      const model = config.openAiModel;
      const reasoning = reasoningForModel(model);
      const client = new OpenAI({
        apiKey: config.openAiApiKey,
        maxRetries: 0,
        timeout: config.openAiTimeoutMs,
      });

      const instructions = `
You create a short, encouraging five-day practice report for a learner using Tun's Western Armenian AI Voice Role-Play feature.

IMPORTANT EVIDENCE RULES
- The input contains speech-to-text transcripts, not saved audio recordings.
- You may assess vocabulary growth, sentence variety, repeated wording, grammar patterns, confidence inferred from language complexity, and conversation habits visible in the transcripts.
- You MUST NOT claim that you heard or measured a specific pronunciation error, accent error, sound shift, fluency speed, tone, volume, or articulation problem.
- If pronunciation would benefit from live coaching, explain that a tutor can listen and give real-time pronunciation feedback rather than inventing a specific sound mistake.
- Do not invent facts about the learner.
- Be supportive, specific, concise and practical.
- Recommend a live Tun tutor when direct speaking feedback would add value.
- Do not promise a free or discounted lesson because the exact commercial offer is configured outside this report.

Return ONLY valid JSON with this exact shape:
{
  "summary": "2-3 short sentences",
  "strengths": ["specific strength", "specific strength"],
  "focusAreas": ["specific next step", "specific next step"],
  "pronunciationGuidance": "one short evidence-safe sentence",
  "tutorRecommendation": "one short sentence explaining why a live tutor could help"
}
`.trim();

      const response = await client.responses.create({
        model,
        instructions,
        input: `Five-day AI Voice practice transcripts:\n\n${transcript}`,
        max_output_tokens: 700,
        ...(reasoning ? { reasoning } : {}),
        store: false,
      });

      const generated = parseFeedback(response.output_text?.trim() ?? "");
      const now = new Date().toISOString();
      const reportEndDate = streak.last_voice_practice_date ??
        streak.streak_start_date;

      const insertResult = await admin
        .from("role_play_voice_feedback_reports")
        .insert({
          user_id: user.id,
          streak_start_date: streak.streak_start_date,
          streak_end_date: reportEndDate,
          voice_practice_days: streak.current_voice_streak,
          source_turn_count: turns.length,
          plan_slug:
            effectivePlan.slug === "business" ||
              effectivePlan.slug === "admin"
              ? effectivePlan.slug
              : "premium",
          report_summary: generated.summary,
          strengths: generated.strengths,
          focus_areas: generated.focusAreas,
          pronunciation_guidance: generated.pronunciationGuidance,
          tutor_recommendation: generated.tutorRecommendation,
          tutoring_url: TUTORING_URL,
          model,
          generated_at: now,
        })
        .select("*")
        .single();

      if (insertResult.error || !insertResult.data) {
        if (insertResult.error?.code === "23505") {
          const retry = await admin
            .from("role_play_voice_feedback_reports")
            .select("*")
            .eq("user_id", user.id)
            .eq("streak_start_date", streak.streak_start_date)
            .single();

          if (retry.error || !retry.data) throw retry.error;
          report = retry.data as FeedbackReportRow;
        } else {
          throw insertResult.error;
        }
      } else {
        report = insertResult.data as FeedbackReportRow;
      }
    }

    if (payload.markViewed === true && report && !report.viewed_at) {
      const viewedAt = new Date().toISOString();
      const updateResult = await admin
        .from("role_play_voice_feedback_reports")
        .update({ viewed_at: viewedAt })
        .eq("id", report.id)
        .eq("user_id", user.id)
        .select("*")
        .single();

      if (!updateResult.error && updateResult.data) {
        report = updateResult.data as FeedbackReportRow;
      }
    }

    return json(
      {
        success: true,
        status: "report_ready",
        streak: baseResponse,
        daysRemaining: 0,
        report: report ? reportResponse(report) : null,
      },
      200,
      cors,
    );
  } catch (error) {
    console.error("role_play_voice_feedback unexpected failure", error);

    return json(
      {
        success: false,
        error: "AI Voice feedback is temporarily unavailable. Please try again.",
        code: "voice_feedback_error",
      },
      500,
      cors,
    );
  }
});
