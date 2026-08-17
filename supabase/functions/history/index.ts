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


type HistoryType =
  | "translation"
  | "thesaurus"
  | "role_play";

type HistoryFilter =
  | "all"
  | HistoryType;

type HistoryAction =
  | "list"
  | "delete"
  | "clear";

interface HistoryRequest {
  action?: unknown;
  type?: unknown;
  id?: unknown;
  query?: unknown;
  limit?: unknown;
  offset?: unknown;
}

interface TranslationRow {
  id: string;
  source_language: string;
  target_language: string;
  source_text: string;
  translated_text: string;
  created_at: string;
}

interface ThesaurusRow {
  id: string;
  input_text: string;
  synonyms: string[];
  antonyms: string[];
  alternatives: string[];
  created_at: string;
}

interface RolePlayRow {
  id: string;
  scenario_slug: string;
  scenario_title: string;
  status: string;
  interaction_mode: string;
  message_count: number;
  started_at: string;
  last_activity_at: string;
  ended_at: string | null;
  created_at: string;
}

interface HistoryItem {
  id: string;
  type: HistoryType;
  createdAt: string;
  sortAt: string;
  data: Record<string, unknown>;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_OFFSET = 500;
const SEARCH_LIMIT_EXTRA = 25;

function json(
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string>,
) {
  return Response.json(
    body,
    {
      status,
      headers: {
        ...headers,
        "Cache-Control":
          "no-store",
        "Content-Type":
          "application/json; charset=utf-8",
        "X-Content-Type-Options":
          "nosniff",
      },
    },
  );
}

function parseAction(
  value: unknown,
): HistoryAction | null {
  if (
    value === "list" ||
    value === "delete" ||
    value === "clear"
  ) {
    return value;
  }

  return null;
}

function parseFilter(
  value: unknown,
): HistoryFilter | null {
  if (
    value === undefined ||
    value === null ||
    value === "all"
  ) {
    return "all";
  }

  if (
    value === "translation" ||
    value === "thesaurus" ||
    value === "role_play"
  ) {
    return value;
  }

  return null;
}

function parseLimit(
  value: unknown,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : DEFAULT_LIMIT;

  if (!Number.isFinite(parsed)) {
    return DEFAULT_LIMIT;
  }

  return Math.max(
    1,
    Math.min(
      MAX_LIMIT,
      Math.trunc(parsed),
    ),
  );
}

function parseOffset(
  value: unknown,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 0;

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      MAX_OFFSET,
      Math.trunc(parsed),
    ),
  );
}

function parseSearch(
  value: unknown,
): string {
  if (typeof value !== "string") {
    return "";
  }

  return Array.from(
    value.trim(),
  )
    .slice(0, 200)
    .join("");
}

function searchPattern(
  value: string,
): string {
  return `%${value.replace(
    /[\\%_]/gu,
    (character) =>
      `\\${character}`,
  )}%`;
}

function roleFromProfile(
  value: unknown,
) {
  if (value === "admin") {
    return "admin";
  }

  if (value === "language_editor") {
    return "language_editor";
  }

  return "user";
}

function isUuid(
  value: string,
): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
    .test(value);
}

function translationItem(
  row: TranslationRow,
): HistoryItem {
  return {
    id: row.id,
    type: "translation",
    createdAt: row.created_at,
    sortAt: row.created_at,
    data: {
      sourceLanguage:
        row.source_language,
      targetLanguage:
        row.target_language,
      sourceText:
        row.source_text,
      translatedText:
        row.translated_text,
    },
  };
}

function thesaurusItem(
  row: ThesaurusRow,
): HistoryItem {
  return {
    id: row.id,
    type: "thesaurus",
    createdAt: row.created_at,
    sortAt: row.created_at,
    data: {
      input:
        row.input_text,
      synonyms:
        row.synonyms,
      antonyms:
        row.antonyms,
      alternatives:
        row.alternatives,
    },
  };
}

function rolePlayItem(
  row: RolePlayRow,
): HistoryItem {
  return {
    id: row.id,
    type: "role_play",
    createdAt: row.started_at,
    sortAt:
      row.last_activity_at ||
      row.started_at,
    data: {
      scenarioSlug:
        row.scenario_slug,
      scenarioTitle:
        row.scenario_title,
      status:
        row.status,
      interactionMode:
        row.interaction_mode,
      messageCount:
        row.message_count,
      startedAt:
        row.started_at,
      lastActivityAt:
        row.last_activity_at,
      endedAt:
        row.ended_at,
    },
  };
}

async function loadTranslations(
  admin: SupabaseClient,
  userId: string,
  query: string,
  fetchCount: number,
): Promise<HistoryItem[]> {
  const fields =
    "id,source_language,target_language,source_text,translated_text,created_at";

  if (!query) {
    const { data, error } =
      await admin
        .from("translation_history")
        .select(fields)
        .eq("user_id", userId)
        .order("created_at", {
          ascending: false,
        })
        .limit(fetchCount);

    if (error) {
      throw error;
    }

    return (
      data as TranslationRow[] | null
    )?.map(translationItem) || [];
  }

  const pattern =
    searchPattern(query);

  const [
    sourceResult,
    translatedResult,
  ] = await Promise.all([
    admin
      .from("translation_history")
      .select(fields)
      .eq("user_id", userId)
      .ilike("source_text", pattern)
      .order("created_at", {
        ascending: false,
      })
      .limit(fetchCount),

    admin
      .from("translation_history")
      .select(fields)
      .eq("user_id", userId)
      .ilike("translated_text", pattern)
      .order("created_at", {
        ascending: false,
      })
      .limit(fetchCount),
  ]);

  if (sourceResult.error) {
    throw sourceResult.error;
  }

  if (translatedResult.error) {
    throw translatedResult.error;
  }

  const rows =
    new Map<string, TranslationRow>();

  for (
    const row of [
      ...(sourceResult.data || []),
      ...(translatedResult.data || []),
    ] as TranslationRow[]
  ) {
    rows.set(row.id, row);
  }

  return Array.from(
    rows.values(),
  ).map(translationItem);
}

async function loadThesaurus(
  admin: SupabaseClient,
  userId: string,
  query: string,
  fetchCount: number,
): Promise<HistoryItem[]> {
  let request =
    admin
      .from("thesaurus_history")
      .select(
        "id,input_text,synonyms,antonyms,alternatives,created_at",
      )
      .eq("user_id", userId);

  if (query) {
    request =
      request.ilike(
        "search_text",
        searchPattern(query),
      );
  }

  const { data, error } =
    await request
      .order("created_at", {
        ascending: false,
      })
      .limit(fetchCount);

  if (error) {
    throw error;
  }

  return (
    data as ThesaurusRow[] | null
  )?.map(thesaurusItem) || [];
}

async function loadRolePlay(
  admin: SupabaseClient,
  userId: string,
  query: string,
  fetchCount: number,
): Promise<HistoryItem[]> {
  let request =
    admin
      .from("role_play_sessions")
      .select(
        "id,scenario_slug,scenario_title,status,interaction_mode,message_count,started_at,last_activity_at,ended_at,created_at",
      )
      .eq("user_id", userId);

  if (query) {
    request =
      request.ilike(
        "scenario_title",
        searchPattern(query),
      );
  }

  const { data, error } =
    await request
      .order("last_activity_at", {
        ascending: false,
      })
      .limit(fetchCount);

  if (error) {
    throw error;
  }

  return (
    data as RolePlayRow[] | null
  )?.map(rolePlayItem) || [];
}

async function deleteHistoryItem(
  admin: SupabaseClient,
  userId: string,
  type: HistoryType,
  id: string,
) {
  const table =
    type === "translation"
      ? "translation_history"
      : type === "thesaurus"
        ? "thesaurus_history"
        : "role_play_sessions";

  const { error } =
    await admin
      .from(table)
      .delete()
      .eq("user_id", userId)
      .eq("id", id);

  if (error) {
    throw error;
  }
}

async function clearHistory(
  admin: SupabaseClient,
  userId: string,
  filter: HistoryFilter,
) {
  const operations:
    PromiseLike<unknown>[] = [];

  if (
    filter === "all" ||
    filter === "translation"
  ) {
    operations.push(
      admin
        .from("translation_history")
        .delete()
        .eq("user_id", userId),
    );
  }

  if (
    filter === "all" ||
    filter === "thesaurus"
  ) {
    operations.push(
      admin
        .from("thesaurus_history")
        .delete()
        .eq("user_id", userId),
    );
  }

  if (
    filter === "all" ||
    filter === "role_play"
  ) {
    operations.push(
      admin
        .from("role_play_sessions")
        .delete()
        .eq("user_id", userId),
    );
  }

  const results =
    await Promise.all(operations);

  for (const result of results) {
    if (
      result &&
      typeof result === "object" &&
      "error" in result &&
      result.error
    ) {
      throw result.error;
    }
  }
}

Deno.serve(
  async (
    request: Request,
  ): Promise<Response> => {
    const config =
      getRuntimeConfig();

    const origin =
      request.headers.get("origin");

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
          Vary: "Origin",
        },
      );
    }

    const cors =
      buildCorsHeaders(origin);

    if (
      request.method === "OPTIONS"
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
      request.method !== "POST"
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
            "The History service is not configured correctly.",
          code:
            "supabase_configuration_error",
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
            "Please log in to view History.",
          code:
            "auth_required",
        },
        401,
        cors,
      );
    }

    const [
      effectivePlan,
      profileResult,
    ] = await Promise.all([
      resolveEffectivePlan(
        admin,
        user.id,
      ),

      admin
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    const role =
      roleFromProfile(
        profileResult.data?.role,
      );

    if (
      !hasPaidFeatureAccess(
        "history",
        {
          userId: user.id,
          role,
          plan: {
            slug:
              effectivePlan.slug,
          },
        },
      )
    ) {
      return json(
        {
          success: false,
          error:
            "Searchable History is available with Person or Schools access.",
          code:
            "paid_feature_required",
          upgradeRecommended: true,
        },
        403,
        cors,
      );
    }

    let payload: HistoryRequest;

    try {
      payload =
        await request.json() as
          HistoryRequest;
    } catch {
      return json(
        {
          success: false,
          error:
            "The History request contains invalid JSON.",
          code:
            "invalid_json",
        },
        400,
        cors,
      );
    }

    const action =
      parseAction(payload.action);

    if (!action) {
      return json(
        {
          success: false,
          error:
            "A valid History action is required.",
          code:
            "invalid_action",
        },
        400,
        cors,
      );
    }

    const filter =
      parseFilter(payload.type);

    if (!filter) {
      return json(
        {
          success: false,
          error:
            "A valid History type is required.",
          code:
            "invalid_type",
        },
        400,
        cors,
      );
    }

    try {
      if (action === "list") {
        const limit =
          parseLimit(payload.limit);

        const offset =
          parseOffset(payload.offset);

        const query =
          parseSearch(payload.query);

        const fetchCount =
          Math.min(
            MAX_OFFSET +
              MAX_LIMIT +
              SEARCH_LIMIT_EXTRA,
            offset +
              limit +
              SEARCH_LIMIT_EXTRA,
          );

        const loaders:
          Promise<HistoryItem[]>[] = [];

        if (
          filter === "all" ||
          filter === "translation"
        ) {
          loaders.push(
            loadTranslations(
              admin,
              user.id,
              query,
              fetchCount,
            ),
          );
        }

        if (
          filter === "all" ||
          filter === "thesaurus"
        ) {
          loaders.push(
            loadThesaurus(
              admin,
              user.id,
              query,
              fetchCount,
            ),
          );
        }

        if (
          filter === "all" ||
          filter === "role_play"
        ) {
          loaders.push(
            loadRolePlay(
              admin,
              user.id,
              query,
              fetchCount,
            ),
          );
        }

        const grouped =
          await Promise.all(loaders);

        const merged =
          grouped
            .flat()
            .sort(
              (left, right) =>
                new Date(
                  right.sortAt,
                ).getTime() -
                new Date(
                  left.sortAt,
                ).getTime(),
            );

        const items =
          merged.slice(
            offset,
            offset + limit,
          );

        return json(
          {
            success: true,
            action: "list",
            type: filter,
            query,
            limit,
            offset,
            items,
            hasMore:
              merged.length >
              offset + limit,
          },
          200,
          cors,
        );
      }

      if (action === "delete") {
        if (filter === "all") {
          return json(
            {
              success: false,
              error:
                "Choose the History type for the item you want to delete.",
              code:
                "item_type_required",
            },
            400,
            cors,
          );
        }

        const id =
          typeof payload.id === "string"
            ? payload.id.trim()
            : "";

        if (!isUuid(id)) {
          return json(
            {
              success: false,
              error:
                "A valid History item id is required.",
              code:
                "invalid_id",
            },
            400,
            cors,
          );
        }

        await deleteHistoryItem(
          admin,
          user.id,
          filter,
          id,
        );

        return json(
          {
            success: true,
            action: "delete",
            type: filter,
            id,
          },
          200,
          cors,
        );
      }

      await clearHistory(
        admin,
        user.id,
        filter,
      );

      return json(
        {
          success: true,
          action: "clear",
          type: filter,
        },
        200,
        cors,
      );
    } catch (error) {
      console.error(
        "History request failed",
        error,
      );

      return json(
        {
          success: false,
          error:
            "History could not be loaded or updated. Please try again.",
          code:
            "history_service_error",
        },
        500,
        cors,
      );
    }
  },
);
