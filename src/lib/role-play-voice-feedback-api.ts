import {
  getSupabaseConfig,
} from "@/lib/supabase/client";

export interface RolePlayVoiceStreak {
  currentVoiceStreak: number;
  longestVoiceStreak: number;
  practicedToday: boolean;
  lastVoicePracticeDate: string | null;
  totalVoicePracticeDays: number;
  eligibleForFeedback: boolean;
  streakStartDate: string | null;
}

export interface RolePlayVoiceFeedbackReport {
  id: string;
  streakStartDate: string;
  streakEndDate: string;
  voicePracticeDays: number;
  sourceTurnCount: number;
  planSlug: string;
  summary: string;
  strengths: string[];
  focusAreas: string[];
  pronunciationGuidance: string;
  tutorRecommendation: string;
  tutoringUrl: string;
  generatedAt: string;
  viewedAt: string | null;
}

export interface RolePlayVoiceFeedbackResult {
  success: true;
  status: "progress" | "report_ready";
  streak: RolePlayVoiceStreak;
  daysRemaining: number;
  report: RolePlayVoiceFeedbackReport | null;
}

interface RolePlayVoiceFeedbackError {
  success?: false;
  error?: string;
  code?: string;
}

function getFunctionUrl(): string {
  const explicit =
    process.env
      .NEXT_PUBLIC_ROLE_PLAY_VOICE_FEEDBACK_FUNCTION_URL
      ?.trim();

  if (explicit) {
    return explicit.replace(/\/+$/u, "");
  }

  const { url } = getSupabaseConfig();

  if (!url) {
    throw new Error("Supabase is not configured.");
  }

  return `${url}/functions/v1/role-play-voice-feedback`;
}

export async function getRolePlayVoiceFeedback(
  accessToken: string,
  options?: {
    markViewed?: boolean;
    signal?: AbortSignal;
  },
): Promise<RolePlayVoiceFeedbackResult> {
  const { key } = getSupabaseConfig();

  if (!key) {
    throw new Error("Supabase is not configured.");
  }

  const timezone =
    Intl.DateTimeFormat()
      .resolvedOptions()
      .timeZone || "UTC";

  const response = await fetch(
    getFunctionUrl(),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        apikey: key,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        timezone,
        markViewed:
          options?.markViewed === true,
      }),
      cache: "no-store",
      signal: options?.signal,
    },
  );

  let data: unknown;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The AI Voice feedback service returned an invalid response.",
    );
  }

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new Error(
      "The AI Voice feedback service returned an invalid response.",
    );
  }

  const record = data as Record<string, unknown>;

  if (!response.ok || record.success !== true) {
    const errorData = data as RolePlayVoiceFeedbackError;

    throw new Error(
      typeof errorData.error === "string"
        ? errorData.error
        : "AI Voice feedback could not be loaded.",
    );
  }

  return data as RolePlayVoiceFeedbackResult;
}
