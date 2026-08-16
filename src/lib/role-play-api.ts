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

export type RolePlayDifficulty =
  | "beginner"
  | "intermediate"
  | "advanced";

export interface RolePlayScenario {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  difficulty: RolePlayDifficulty;
  setting: string;
  userRole: string;
  aiRole: string;
  goal: string;
  openingMessage: string;
  sortOrder: number;
}

export interface RolePlayAdminScenario
  extends RolePlayScenario {
  instructions: string;
  published: boolean;
  archivedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface RolePlayAdminScenarioInput {
  slug: string;
  title: string;
  description: string;
  category: string;
  difficulty: RolePlayDifficulty;
  setting: string;
  userRole: string;
  aiRole: string;
  goal: string;
  instructions: string;
  openingMessage: string;
  published: boolean;
  sortOrder: number;
}

export type RolePlayAdminStateAction =
  | "admin_publish"
  | "admin_unpublish"
  | "admin_archive"
  | "admin_restore";

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

export interface RolePlayAdminListResult {
  success: true;
  action: "admin_list";
  scenarios: RolePlayAdminScenario[];
}

export interface RolePlayAdminMutationResult {
  success: true;
  action:
    | "admin_create"
    | "admin_update"
    | RolePlayAdminStateAction;
  scenario: RolePlayAdminScenario;
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

export async function listAdminRolePlayScenarios(
  accessToken: string,
  signal?: AbortSignal,
): Promise<RolePlayAdminScenario[]> {
  const result =
    await requestRolePlay<RolePlayAdminListResult>(
      {
        action:
          "admin_list",
      },
      accessToken,
      signal,
    );

  return result.scenarios;
}

export async function createAdminRolePlayScenario(
  scenario: RolePlayAdminScenarioInput,
  accessToken: string,
  signal?: AbortSignal,
): Promise<RolePlayAdminScenario> {
  const result =
    await requestRolePlay<RolePlayAdminMutationResult>(
      {
        action:
          "admin_create",

        scenario,
      },
      accessToken,
      signal,
    );

  return result.scenario;
}

export async function updateAdminRolePlayScenario(
  scenarioId: string,
  scenario: RolePlayAdminScenarioInput,
  accessToken: string,
  signal?: AbortSignal,
): Promise<RolePlayAdminScenario> {
  const result =
    await requestRolePlay<RolePlayAdminMutationResult>(
      {
        action:
          "admin_update",

        scenarioId,

        scenario,
      },
      accessToken,
      signal,
    );

  return result.scenario;
}

export async function changeAdminRolePlayScenarioState(
  scenarioId: string,
  action: RolePlayAdminStateAction,
  accessToken: string,
  signal?: AbortSignal,
): Promise<RolePlayAdminScenario> {
  const result =
    await requestRolePlay<RolePlayAdminMutationResult>(
      {
        action,
        scenarioId,
      },
      accessToken,
      signal,
    );

  return result.scenario;
}