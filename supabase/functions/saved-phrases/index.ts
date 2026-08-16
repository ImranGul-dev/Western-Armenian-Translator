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

type LanguageCode =
  | "en"
  | "hyw"
  | "hye";

type SavedPhraseAction =
  | "list"
  | "save"
  | "favorite"
  | "unfavorite"
  | "delete";

interface SavedPhraseRequest {
  action?: unknown;
  id?: unknown;

  sourceText?: unknown;
  translatedText?: unknown;

  sourceLanguage?: unknown;
  targetLanguage?: unknown;

  isFavorite?: unknown;

  limit?: unknown;
  offset?: unknown;
  favoritesOnly?: unknown;
}

interface SavedPhraseRow {
  id: string;
  user_id: string;

  source_text: string;
  translated_text: string;

  source_language: LanguageCode;
  target_language: LanguageCode;

  is_favorite: boolean;

  created_at: string;
  updated_at: string;
}

const MAX_TEXT_CHARACTERS =
  10_000;

const MAX_LIST_LIMIT =
  100;

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

        "Content-Type":
          "application/json; charset=utf-8",

        "X-Content-Type-Options":
          "nosniff",
      },
    },
  );
}

function cleanString(
  value: unknown,
  maxCharacters: number,
): string {
  if (
    typeof value !==
    "string"
  ) {
    return "";
  }

  return Array.from(
    value.trim(),
  )
    .slice(
      0,
      maxCharacters,
    )
    .join("");
}

function cleanAction(
  value: unknown,
): SavedPhraseAction | null {
  const action =
    cleanString(
      value,
      30,
    ).toLowerCase();

  switch (action) {
    case "list":
    case "save":
    case "favorite":
    case "unfavorite":
    case "delete":
      return action;

    default:
      return null;
  }
}

function cleanLanguage(
  value: unknown,
): LanguageCode | null {
  if (
    value === "en" ||
    value === "hyw" ||
    value === "hye"
  ) {
    return value;
  }

  return null;
}

function cleanBoolean(
  value: unknown,
  fallback = false,
): boolean {
  return typeof value ===
      "boolean"
    ? value
    : fallback;
}

function cleanInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed =
    typeof value ===
      "number"
      ? value
      : typeof value ===
          "string"
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isFinite(parsed)
  ) {
    return fallback;
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      Math.floor(parsed),
    ),
  );
}

function validUuid(
  value: string,
): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
    .test(value);
}

function phraseResponse(
  row: SavedPhraseRow,
) {
  return {
    id:
      row.id,

    sourceText:
      row.source_text,

    translatedText:
      row.translated_text,

    sourceLanguage:
      row.source_language,

    targetLanguage:
      row.target_language,

    isFavorite:
      row.is_favorite,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

async function listPhrases(
  admin: SupabaseClient,
  userId: string,
  payload: SavedPhraseRequest,
  cors: Record<string, string>,
): Promise<Response> {
  const limit =
    cleanInteger(
      payload.limit,
      50,
      1,
      MAX_LIST_LIMIT,
    );

  const offset =
    cleanInteger(
      payload.offset,
      0,
      0,
      100_000,
    );

  const favoritesOnly =
    cleanBoolean(
      payload.favoritesOnly,
      false,
    );

  let query =
    admin
      .from("saved_phrases")
      .select(
        [
          "id",
          "user_id",
          "source_text",
          "translated_text",
          "source_language",
          "target_language",
          "is_favorite",
          "created_at",
          "updated_at",
        ].join(","),
        {
          count: "exact",
        },
      )
      .eq(
        "user_id",
        userId,
      );

  if (favoritesOnly) {
    query =
      query.eq(
        "is_favorite",
        true,
      );
  }

  const {
    data,
    error,
    count,
  } =
    await query
      .order(
        "created_at",
        {
          ascending: false,
        },
      )
      .range(
        offset,
        offset + limit - 1,
      );

  if (error) {
    console.error(
      "saved_phrases list failed",
      error,
    );

    return json(
      {
        success: false,
        error:
          "Saved phrases could not be loaded.",
        code:
          "saved_phrases_list_failed",
      },
      500,
      cors,
    );
  }

  const rows =
    (
      data ?? []
    ) as SavedPhraseRow[];

  return json(
    {
      success: true,

      items:
        rows.map(
          phraseResponse,
        ),

      total:
        count ?? 0,

      limit,
      offset,

      favoritesOnly,
    },
    200,
    cors,
  );
}

async function savePhrase(
  admin: SupabaseClient,
  userId: string,
  payload: SavedPhraseRequest,
  cors: Record<string, string>,
): Promise<Response> {
  const sourceText =
    cleanString(
      payload.sourceText,
      MAX_TEXT_CHARACTERS,
    );

  const translatedText =
    cleanString(
      payload.translatedText,
      MAX_TEXT_CHARACTERS,
    );

  const sourceLanguage =
    cleanLanguage(
      payload.sourceLanguage,
    );

  const targetLanguage =
    cleanLanguage(
      payload.targetLanguage,
    );

  const isFavorite =
    cleanBoolean(
      payload.isFavorite,
      false,
    );

  if (
    !sourceText ||
    !translatedText
  ) {
    return json(
      {
        success: false,
        error:
          "Both the source text and translation are required.",
        code:
          "invalid_saved_phrase_text",
      },
      400,
      cors,
    );
  }

  if (
    !sourceLanguage ||
    !targetLanguage ||
    sourceLanguage ===
      targetLanguage
  ) {
    return json(
      {
        success: false,
        error:
          "Please provide a valid translation language pair.",
        code:
          "invalid_saved_phrase_languages",
      },
      400,
      cors,
    );
  }

  const {
    data: existing,
    error: existingError,
  } =
    await admin
      .from("saved_phrases")
      .select(
        [
          "id",
          "user_id",
          "source_text",
          "translated_text",
          "source_language",
          "target_language",
          "is_favorite",
          "created_at",
          "updated_at",
        ].join(","),
      )
      .eq(
        "user_id",
        userId,
      )
      .eq(
        "source_text",
        sourceText,
      )
      .eq(
        "translated_text",
        translatedText,
      )
      .eq(
        "source_language",
        sourceLanguage,
      )
      .eq(
        "target_language",
        targetLanguage,
      )
      .order(
        "created_at",
        {
          ascending: false,
        },
      )
      .limit(1)
      .maybeSingle();

  if (existingError) {
    console.error(
      "saved_phrases duplicate check failed",
      existingError,
    );

    return json(
      {
        success: false,
        error:
          "The phrase could not be saved.",
        code:
          "saved_phrase_save_failed",
      },
      500,
      cors,
    );
  }

  if (existing) {
    let row =
      existing as SavedPhraseRow;

    if (
      isFavorite &&
      !row.is_favorite
    ) {
      const {
        data: updated,
        error: updateError,
      } =
        await admin
          .from("saved_phrases")
          .update({
            is_favorite:
              true,
          })
          .eq(
            "id",
            row.id,
          )
          .eq(
            "user_id",
            userId,
          )
          .select(
            [
              "id",
              "user_id",
              "source_text",
              "translated_text",
              "source_language",
              "target_language",
              "is_favorite",
              "created_at",
              "updated_at",
            ].join(","),
          )
          .single();

      if (updateError) {
        console.error(
          "saved_phrases existing favorite update failed",
          updateError,
        );

        return json(
          {
            success: false,
            error:
              "The phrase could not be saved.",
            code:
              "saved_phrase_save_failed",
          },
          500,
          cors,
        );
      }

      row =
        updated as SavedPhraseRow;
    }

    return json(
      {
        success: true,
        created:
          false,
        item:
          phraseResponse(
            row,
          ),
      },
      200,
      cors,
    );
  }

  const {
    data,
    error,
  } =
    await admin
      .from("saved_phrases")
      .insert({
        user_id:
          userId,

        source_text:
          sourceText,

        translated_text:
          translatedText,

        source_language:
          sourceLanguage,

        target_language:
          targetLanguage,

        is_favorite:
          isFavorite,
      })
      .select(
        [
          "id",
          "user_id",
          "source_text",
          "translated_text",
          "source_language",
          "target_language",
          "is_favorite",
          "created_at",
          "updated_at",
        ].join(","),
      )
      .single();

  if (
    error ||
    !data
  ) {
    console.error(
      "saved_phrases insert failed",
      error,
    );

    return json(
      {
        success: false,
        error:
          "The phrase could not be saved.",
        code:
          "saved_phrase_save_failed",
      },
      500,
      cors,
    );
  }

  return json(
    {
      success: true,
      created:
        true,
      item:
        phraseResponse(
          data as SavedPhraseRow,
        ),
    },
    201,
    cors,
  );
}

async function setFavorite(
  admin: SupabaseClient,
  userId: string,
  payload: SavedPhraseRequest,
  favorite: boolean,
  cors: Record<string, string>,
): Promise<Response> {
  const id =
    cleanString(
      payload.id,
      100,
    );

  if (
    !id ||
    !validUuid(id)
  ) {
    return json(
      {
        success: false,
        error:
          "A valid saved phrase ID is required.",
        code:
          "invalid_saved_phrase_id",
      },
      400,
      cors,
    );
  }

  const {
    data,
    error,
  } =
    await admin
      .from("saved_phrases")
      .update({
        is_favorite:
          favorite,
      })
      .eq(
        "id",
        id,
      )
      .eq(
        "user_id",
        userId,
      )
      .select(
        [
          "id",
          "user_id",
          "source_text",
          "translated_text",
          "source_language",
          "target_language",
          "is_favorite",
          "created_at",
          "updated_at",
        ].join(","),
      )
      .maybeSingle();

  if (error) {
    console.error(
      "saved_phrases favorite update failed",
      error,
    );

    return json(
      {
        success: false,
        error:
          "The saved phrase could not be updated.",
        code:
          "saved_phrase_update_failed",
      },
      500,
      cors,
    );
  }

  if (!data) {
    return json(
      {
        success: false,
        error:
          "Saved phrase not found.",
        code:
          "saved_phrase_not_found",
      },
      404,
      cors,
    );
  }

  return json(
    {
      success: true,
      item:
        phraseResponse(
          data as SavedPhraseRow,
        ),
    },
    200,
    cors,
  );
}

async function deletePhrase(
  admin: SupabaseClient,
  userId: string,
  payload: SavedPhraseRequest,
  cors: Record<string, string>,
): Promise<Response> {
  const id =
    cleanString(
      payload.id,
      100,
    );

  if (
    !id ||
    !validUuid(id)
  ) {
    return json(
      {
        success: false,
        error:
          "A valid saved phrase ID is required.",
        code:
          "invalid_saved_phrase_id",
      },
      400,
      cors,
    );
  }

  const {
    data,
    error,
  } =
    await admin
      .from("saved_phrases")
      .delete()
      .eq(
        "id",
        id,
      )
      .eq(
        "user_id",
        userId,
      )
      .select("id")
      .maybeSingle();

  if (error) {
    console.error(
      "saved_phrases delete failed",
      error,
    );

    return json(
      {
        success: false,
        error:
          "The saved phrase could not be deleted.",
        code:
          "saved_phrase_delete_failed",
      },
      500,
      cors,
    );
  }

  if (!data) {
    return json(
      {
        success: false,
        error:
          "Saved phrase not found.",
        code:
          "saved_phrase_not_found",
      },
      404,
      cors,
    );
  }

  return json(
    {
      success: true,
      deletedId:
        id,
    },
    200,
    cors,
  );
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
          Vary: "Origin",
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
            "Saved Phrases is not configured correctly.",
          code:
            "saved_phrases_configuration_error",
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
            persistSession:
              false,

            autoRefreshToken:
              false,
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
            "Please log in to use Saved Phrases.",
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

    if (profileResult.error) {
      console.error(
        "saved_phrases profile lookup failed",
        profileResult.error,
      );

      return json(
        {
          success: false,
          error:
            "Saved Phrases is temporarily unavailable.",
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
              ?.role ===
            "language_editor"
          ? "language_editor"
          : "user";

    const allowed =
      hasPaidFeatureAccess(
        "saved_phrases",
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
            "Saved Phrases is available with Person or Schools access.",
          code:
            "paid_feature_required",
          upgradeRecommended:
            true,
        },
        403,
        cors,
      );
    }

    let payload:
      SavedPhraseRequest;

    try {
      payload =
        await request.json() as
          SavedPhraseRequest;
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

    const action =
      cleanAction(
        payload.action,
      );

    if (!action) {
      return json(
        {
          success: false,
          error:
            "A valid Saved Phrases action is required.",
          code:
            "invalid_action",
        },
        400,
        cors,
      );
    }

    try {
      switch (action) {
        case "list":
          return await listPhrases(
            admin,
            user.id,
            payload,
            cors,
          );

        case "save":
          return await savePhrase(
            admin,
            user.id,
            payload,
            cors,
          );

        case "favorite":
          return await setFavorite(
            admin,
            user.id,
            payload,
            true,
            cors,
          );

        case "unfavorite":
          return await setFavorite(
            admin,
            user.id,
            payload,
            false,
            cors,
          );

        case "delete":
          return await deletePhrase(
            admin,
            user.id,
            payload,
            cors,
          );
      }
    } catch (error) {
      console.error(
        "saved_phrases unexpected failure",
        error,
      );

      return json(
        {
          success: false,
          error:
            "Saved Phrases is temporarily unavailable. Please try again.",
          code:
            "saved_phrases_error",
        },
        500,
        cors,
      );
    }
  },
);