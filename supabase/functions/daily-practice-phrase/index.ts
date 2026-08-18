import {
  createClient,
} from "@supabase/supabase-js";

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


type DailyPracticeAction =
  | "today"
  | "admin_list"
  | "admin_create"
  | "admin_update"
  | "admin_publish"
  | "admin_unpublish"
  | "admin_archive"
  | "admin_restore";

interface DailyPracticeRequest {
  action?: unknown;
  timezone?: unknown;
  phraseId?: unknown;
  phrase?: unknown;
}

interface DailyPracticePhraseRow {
  id: string;
  practice_date: string;
  western_armenian_text: string;
  english_text: string;
  category: string;
  difficulty: string;
  teaching_note: string;
  published: boolean;
  published_at: string | null;
  archived_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

interface DailyPracticePhraseInput {
  practiceDate: string;
  westernArmenianText: string;
  englishText: string;
  category: string;
  difficulty:
    | "beginner"
    | "intermediate"
    | "advanced";
  teachingNote: string;
  published: boolean;
}

const ADMIN_FIELDS = [
  "id",
  "practice_date",
  "western_armenian_text",
  "english_text",
  "category",
  "difficulty",
  "teaching_note",
  "published",
  "published_at",
  "archived_at",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
].join(",");

const MAX_TIMEZONE_CHARACTERS = 100;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

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

function parseAction(value: unknown): DailyPracticeAction | null {
  if (
    value === "today" ||
    value === "admin_list" ||
    value === "admin_create" ||
    value === "admin_update" ||
    value === "admin_publish" ||
    value === "admin_unpublish" ||
    value === "admin_archive" ||
    value === "admin_restore"
  ) {
    return value;
  }

  return null;
}

function cleanTimezone(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const timezone = Array.from(value.trim())
    .slice(0, MAX_TIMEZONE_CHARACTERS)
    .join("");

  return timezone || null;
}

function cleanText(
  value: unknown,
  maxCharacters: number,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const text = Array.from(value.trim())
    .slice(0, maxCharacters)
    .join("");

  return text;
}

function normalizePhraseInput(
  value: unknown,
):
  | { ok: true; value: DailyPracticePhraseInput }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      error: "A valid Daily Practice Phrase is required.",
    };
  }

  const record = value as Record<string, unknown>;
  const practiceDate = cleanText(record.practiceDate, 10);
  const westernArmenianText = cleanText(record.westernArmenianText, 500);
  const englishText = cleanText(record.englishText, 500);
  const category = cleanText(record.category, 60);
  const teachingNote = cleanText(record.teachingNote, 1200) ?? "";
  const difficulty = record.difficulty;
  const published = record.published;

  if (!practiceDate || !DATE_PATTERN.test(practiceDate)) {
    return {
      ok: false,
      error: "Practice date must use YYYY-MM-DD format.",
    };
  }

  const parsedDate = new Date(`${practiceDate}T00:00:00Z`);

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== practiceDate
  ) {
    return {
      ok: false,
      error: "Practice date is invalid.",
    };
  }

  if (!westernArmenianText) {
    return {
      ok: false,
      error: "Western Armenian text is required.",
    };
  }

  if (!englishText) {
    return {
      ok: false,
      error: "English meaning is required.",
    };
  }

  if (!category) {
    return {
      ok: false,
      error: "Category is required.",
    };
  }

  if (
    difficulty !== "beginner" &&
    difficulty !== "intermediate" &&
    difficulty !== "advanced"
  ) {
    return {
      ok: false,
      error: "Difficulty must be beginner, intermediate, or advanced.",
    };
  }

  if (typeof published !== "boolean") {
    return {
      ok: false,
      error: "Published must be true or false.",
    };
  }

  return {
    ok: true,
    value: {
      practiceDate,
      westernArmenianText,
      englishText,
      category,
      difficulty,
      teachingNote,
      published,
    },
  };
}

function adminResponse(row: DailyPracticePhraseRow) {
  return {
    id: row.id,
    practiceDate: row.practice_date,
    westernArmenianText: row.western_armenian_text,
    englishText: row.english_text,
    category: row.category,
    difficulty: row.difficulty,
    teachingNote: row.teaching_note,
    published: row.published,
    publishedAt: row.published_at,
    archivedAt: row.archived_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function databaseValues(
  input: DailyPracticePhraseInput,
) {
  return {
    practice_date: input.practiceDate,
    western_armenian_text: input.westernArmenianText,
    english_text: input.englishText,
    category: input.category,
    difficulty: input.difficulty,
    teaching_note: input.teachingNote,
    published: input.published,
  };
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
    return new Response(null, {
      status: 204,
      headers: cors,
    });
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
        error: "Daily Practice Phrase is not configured correctly.",
        code: "daily_practice_configuration_error",
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

  let user;

  try {
    user = await requireUser(admin, request);
  } catch {
    return json(
      {
        success: false,
        error: "Please log in to use Daily Practice Phrase.",
        code: "auth_required",
      },
      401,
      cors,
    );
  }

  let payload: DailyPracticeRequest;

  try {
    const raw: unknown = await request.json();

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid payload.");
    }

    payload = raw as DailyPracticeRequest;
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

  const action = parseAction(payload.action);

  if (!action) {
    return json(
      {
        success: false,
        error: "A valid Daily Practice Phrase action is required.",
        code: "invalid_action",
      },
      400,
      cors,
    );
  }

  const profileResult = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileResult.error) {
    console.error("daily_practice profile lookup failed", profileResult.error);

    return json(
      {
        success: false,
        error: "Daily Practice Phrase is temporarily unavailable.",
        code: "profile_lookup_failed",
      },
      503,
      cors,
    );
  }

  const role = profileResult.data?.role;
  const isAdmin = role === "admin";
  const isAdminAction = action !== "today";

  if (isAdminAction && !isAdmin) {
    return json(
      {
        success: false,
        error: "Administrator access is required to manage Daily Practice Phrases.",
        code: "admin_required",
      },
      403,
      cors,
    );
  }

  try {
    if (action === "today") {
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

      const { data, error } = await admin.rpc(
        "get_daily_practice_phrase",
        {
          p_timezone: timezone,
        },
      );

      if (error) {
        console.error("daily_practice phrase rpc failed", error);

        const invalidTimezone = error.code === "22023";

        return json(
          {
            success: false,
            error: invalidTimezone
              ? "The browser time zone is not recognized."
              : "Today's Daily Practice Phrase could not be loaded.",
            code: invalidTimezone
              ? "invalid_timezone"
              : "daily_practice_load_failed",
          },
          invalidTimezone ? 400 : 500,
          cors,
        );
      }

      const row = Array.isArray(data) ? data[0] : null;

      if (!row) {
        return json(
          {
            success: true,
            action: "today",
            timezone,
            phrase: null,
          },
          200,
          cors,
        );
      }

      return json(
        {
          success: true,
          action: "today",
          timezone,
          phrase: {
            id: row.id,
            practiceDate: row.practice_date,
            westernArmenianText: row.western_armenian_text,
            englishText: row.english_text,
            category: row.category,
            difficulty: row.difficulty,
            teachingNote: row.teaching_note,
            publishedAt: row.published_at,
          },
        },
        200,
        cors,
      );
    }

    if (action === "admin_list") {
      const result = await admin
        .from("daily_practice_phrases")
        .select(ADMIN_FIELDS)
        .order("practice_date", { ascending: false });

      if (result.error) {
        console.error("daily_practice admin list failed", result.error);

        return json(
          {
            success: false,
            error: "Daily Practice Phrases could not be loaded for administration.",
            code: "admin_phrase_list_failed",
          },
          500,
          cors,
        );
      }

      return json(
        {
          success: true,
          action: "admin_list",
          phrases: (result.data ?? []).map((row) =>
            adminResponse(row as DailyPracticePhraseRow)
          ),
        },
        200,
        cors,
      );
    }

    if (action === "admin_create") {
      const normalized = normalizePhraseInput(payload.phrase);

      if (!normalized.ok) {
        return json(
          {
            success: false,
            error: normalized.error,
            code: "invalid_phrase",
          },
          400,
          cors,
        );
      }

      const now = new Date().toISOString();

      const result = await admin
        .from("daily_practice_phrases")
        .insert({
          ...databaseValues(normalized.value),
          created_by: user.id,
          updated_by: user.id,
          published_at: normalized.value.published ? now : null,
          archived_at: null,
        })
        .select(ADMIN_FIELDS)
        .single();

      if (result.error || !result.data) {
        console.error("daily_practice admin create failed", result.error);
        const duplicate = result.error?.code === "23505";

        return json(
          {
            success: false,
            error: duplicate
              ? "A Daily Practice Phrase already exists for that date."
              : "The Daily Practice Phrase could not be created.",
            code: duplicate
              ? "practice_date_exists"
              : "admin_phrase_create_failed",
          },
          duplicate ? 409 : 500,
          cors,
        );
      }

      return json(
        {
          success: true,
          action: "admin_create",
          phrase: adminResponse(result.data as DailyPracticePhraseRow),
        },
        201,
        cors,
      );
    }

    const phraseId =
      typeof payload.phraseId === "string"
        ? payload.phraseId.trim()
        : "";

    if (!UUID_PATTERN.test(phraseId)) {
      return json(
        {
          success: false,
          error: "A valid Daily Practice Phrase ID is required.",
          code: "invalid_phrase_id",
        },
        400,
        cors,
      );
    }

    if (action === "admin_update") {
      const normalized = normalizePhraseInput(payload.phrase);

      if (!normalized.ok) {
        return json(
          {
            success: false,
            error: normalized.error,
            code: "invalid_phrase",
          },
          400,
          cors,
        );
      }

      const currentResult = await admin
        .from("daily_practice_phrases")
        .select("published,published_at,archived_at")
        .eq("id", phraseId)
        .maybeSingle();

      if (currentResult.error || !currentResult.data) {
        return json(
          {
            success: false,
            error: "Daily Practice Phrase was not found.",
            code: "phrase_not_found",
          },
          404,
          cors,
        );
      }

      if (currentResult.data.archived_at) {
        return json(
          {
            success: false,
            error: "Restore the Daily Practice Phrase before editing it.",
            code: "phrase_archived",
          },
          409,
          cors,
        );
      }

      const now = new Date().toISOString();
      const publishedAt = normalized.value.published
        ? currentResult.data.published_at ?? now
        : null;

      const result = await admin
        .from("daily_practice_phrases")
        .update({
          ...databaseValues(normalized.value),
          updated_by: user.id,
          published_at: publishedAt,
        })
        .eq("id", phraseId)
        .select(ADMIN_FIELDS)
        .single();

      if (result.error || !result.data) {
        const duplicate = result.error?.code === "23505";

        return json(
          {
            success: false,
            error: duplicate
              ? "A Daily Practice Phrase already exists for that date."
              : "The Daily Practice Phrase could not be updated.",
            code: duplicate
              ? "practice_date_exists"
              : "admin_phrase_update_failed",
          },
          duplicate ? 409 : 500,
          cors,
        );
      }

      return json(
        {
          success: true,
          action: "admin_update",
          phrase: adminResponse(result.data as DailyPracticePhraseRow),
        },
        200,
        cors,
      );
    }

    const current = await admin
      .from("daily_practice_phrases")
      .select(ADMIN_FIELDS)
      .eq("id", phraseId)
      .maybeSingle();

    if (current.error || !current.data) {
      return json(
        {
          success: false,
          error: "Daily Practice Phrase was not found.",
          code: "phrase_not_found",
        },
        404,
        cors,
      );
    }

    const currentRow = current.data as DailyPracticePhraseRow;
    const now = new Date().toISOString();
    let updates: Record<string, unknown>;

    if (action === "admin_publish") {
      if (currentRow.archived_at) {
        return json(
          {
            success: false,
            error: "Restore the Daily Practice Phrase before publishing it.",
            code: "phrase_archived",
          },
          409,
          cors,
        );
      }

      updates = {
        published: true,
        published_at: currentRow.published_at ?? now,
        updated_by: user.id,
      };
    } else if (action === "admin_unpublish") {
      updates = {
        published: false,
        published_at: null,
        updated_by: user.id,
      };
    } else if (action === "admin_archive") {
      updates = {
        published: false,
        published_at: null,
        archived_at: now,
        updated_by: user.id,
      };
    } else {
      updates = {
        archived_at: null,
        updated_by: user.id,
      };
    }

    const result = await admin
      .from("daily_practice_phrases")
      .update(updates)
      .eq("id", phraseId)
      .select(ADMIN_FIELDS)
      .single();

    if (result.error || !result.data) {
      console.error("daily_practice admin state update failed", result.error);

      return json(
        {
          success: false,
          error: "The Daily Practice Phrase state could not be changed.",
          code: "admin_phrase_state_failed",
        },
        500,
        cors,
      );
    }

    return json(
      {
        success: true,
        action,
        phrase: adminResponse(result.data as DailyPracticePhraseRow),
      },
      200,
      cors,
    );
  } catch (error) {
    console.error("daily_practice unexpected failure", error);

    return json(
      {
        success: false,
        error: "Daily Practice Phrase is temporarily unavailable. Please try again.",
        code: "daily_practice_error",
      },
      500,
      cors,
    );
  }
});
