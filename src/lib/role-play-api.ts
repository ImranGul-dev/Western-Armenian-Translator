import {
  getSupabaseConfig,
} from "@/lib/supabase/client";

export type RolePlayInteractionMode =
  | "text"
  | "voice"
  | "mixed";

export type RolePlayModality =
  | "text"
  | "voice";

export type RolePlaySpeaker =
  | "user"
  | "assistant";

export type RolePlaySessionStatus =
  | "active"
  | "completed"
  | "abandoned";

export interface RolePlayScenario {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  difficulty:
    | "beginner"
    | "intermediate"
    | "advanced";
  setting: string;
  userRole: string;
  aiRole: string;
  goal: string;
  openingMessage: string;
  sortOrder: number;
}

export interface RolePlaySession {
  id: string;
  scenarioId?: string | null;
  scenarioSlug: string;
  scenarioTitle: string;
  status: RolePlaySessionStatus;
  interactionMode: RolePlayInteractionMode;
  messageCount: number;
  startedAt?: string;
  lastActivityAt: string;
  endedAt?: string | null;
}

export interface RolePlayTurn {
  turnIndex: number;
  speaker: RolePlaySpeaker;
  modality: RolePlayModality;
  content: string;
  createdAt?: string;
}

export interface RolePlayKnowledgeUsed {
  glossary: number;
  grammarRules: number;
  approvedExamples: number;
}

interface RolePlayErrorResponse {
  success: false;
  error: string;
  code?: string;
  upgradeRecommended?: boolean;
}

export type RolePlayApiError =
  Error & {
    code?: string;
    upgradeRecommended?: boolean;
  };

export interface RolePlayListResult {
  success: true;
  action: "list";
  scenarios: RolePlayScenario[];
}

export interface RolePlayStartResult {
  success: true;
  action: "start";
  scenario: RolePlayScenario;
  session: RolePlaySession;
  turn: RolePlayTurn;
}

export interface RolePlayMessageResult {
  success: true;
  action: "message";
  session: RolePlaySession;
  knowledgeUsed: RolePlayKnowledgeUsed;
  userTurn: RolePlayTurn;
  assistantTurn: RolePlayTurn;
}

export interface RolePlayEndResult {
  success: true;
  action: "end";
  session: RolePlaySession;
}

function getFunctionUrl(): string {
  const explicit =
    process.env
      .NEXT_PUBLIC_ROLE_PLAY_FUNCTION_URL
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

  return `${url}/functions/v1/role-play`;
}

function apiError(
  message: string,
  code?: string,
  upgradeRecommended?: boolean,
): RolePlayApiError {
  const error =
    new Error(
      message,
    ) as RolePlayApiError;

  error.code = code;
  error.upgradeRecommended =
    upgradeRecommended;

  return error;
}

async function requestRolePlay<T>(
  body: Record<string, unknown>,
  accessToken: string,
  signal?: AbortSignal,
): Promise<T> {
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
          JSON.stringify(
            body,
          ),

        cache:
          "no-store",

        signal,
      },
    );

  let data: unknown;

  try {
    data =
      await response.json();
  } catch {
    throw new Error(
      "The Role-Play service returned an invalid response.",
    );
  }

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new Error(
      "The Role-Play service returned an invalid response.",
    );
  }

  const record =
    data as Record<string, unknown>;

  if (
    !response.ok ||
    record.success !== true
  ) {
    const errorData =
      data as Partial<RolePlayErrorResponse>;

    throw apiError(
      typeof errorData.error === "string"
        ? errorData.error
        : "Role-Play request failed. Please try again.",

      typeof errorData.code === "string"
        ? errorData.code
        : undefined,

      errorData.upgradeRecommended === true,
    );
  }

  return data as T;
}

export async function listRolePlayScenarios(
  accessToken: string,
  signal?: AbortSignal,
): Promise<RolePlayScenario[]> {
  const result =
    await requestRolePlay<RolePlayListResult>(
      {
        action:
          "list",
      },
      accessToken,
      signal,
    );

  return result.scenarios;
}

export async function startRolePlaySession(
  scenarioSlug: string,
  accessToken: string,
  interactionMode:
    RolePlayInteractionMode =
      "text",
  signal?: AbortSignal,
): Promise<RolePlayStartResult> {
  return requestRolePlay<RolePlayStartResult>(
    {
      action:
        "start",

      scenarioSlug,

      interactionMode,
    },
    accessToken,
    signal,
  );
}

export async function sendRolePlayMessage(
  sessionId: string,
  message: string,
  accessToken: string,
  modality:
    RolePlayModality =
      "text",
  signal?: AbortSignal,
): Promise<RolePlayMessageResult> {
  return requestRolePlay<RolePlayMessageResult>(
    {
      action:
        "message",

      sessionId,

      message,

      modality,
    },
    accessToken,
    signal,
  );
}

export async function endRolePlaySession(
  sessionId: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<RolePlayEndResult> {
  return requestRolePlay<RolePlayEndResult>(
    {
      action:
        "end",

      sessionId,
    },
    accessToken,
    signal,
  );
}