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
  loadVocabularyMasteryByPhraseId,
  vocabularyMasteryResponse,
} from "../_shared/vocabulary-mastery.ts";


interface VocabularyMasteryRequest {
  phraseIds?: unknown;
}


const MAX_PHRASE_IDS =
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


function validUuid(
  value: string,
): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
    .test(value);
}


function cleanPhraseIds(
  value: unknown,
): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const phraseIds =
    Array.from(
      new Set(
        value
          .filter(
            (item): item is string =>
              typeof item === "string",
          )
          .map(
            (item) =>
              item.trim(),
          )
          .filter(
            (item) =>
              validUuid(item),
          ),
      ),
    );

  if (
    phraseIds.length !==
      value.length ||
    phraseIds.length >
      MAX_PHRASE_IDS
  ) {
    return null;
  }

  return phraseIds;
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
            "Vocabulary Mastery is not configured correctly.",
          code:
            "vocabulary_mastery_configuration_error",
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
            "Please log in to view Vocabulary Mastery.",
          code:
            "auth_required",
        },
        401,
        cors,
      );
    }

    let payload:
      VocabularyMasteryRequest;

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
        raw as VocabularyMasteryRequest;
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

    const phraseIds =
      cleanPhraseIds(
        payload.phraseIds,
      );

    if (!phraseIds) {
      return json(
        {
          success: false,
          error:
            `Provide up to ${MAX_PHRASE_IDS} valid Saved Phrase IDs.`,
          code:
            "invalid_phrase_ids",
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
          "vocabulary_mastery profile lookup failed",
          profileResult.error,
        );

        return json(
          {
            success: false,
            error:
              "Vocabulary Mastery is temporarily unavailable.",
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
          "flashcards",
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
              "Vocabulary Mastery is available with Person or Schools access.",
            code:
              "paid_feature_required",
            upgradeRecommended:
              true,
          },
          403,
          cors,
        );
      }

      const masteryByPhraseId =
        await loadVocabularyMasteryByPhraseId(
          admin,
          user.id,
          phraseIds,
        );

      const items =
        phraseIds.map(
          (savedPhraseId) => ({
            savedPhraseId,
            mastery:
              vocabularyMasteryResponse(
                masteryByPhraseId.get(
                  savedPhraseId,
                ),
              ),
          }),
        );

      return json(
        {
          success: true,
          items,
        },
        200,
        cors,
      );
    } catch (error) {
      console.error(
        "vocabulary_mastery unexpected failure",
        error,
      );

      return json(
        {
          success: false,
          error:
            "Vocabulary Mastery is temporarily unavailable. Please try again.",
          code:
            "vocabulary_mastery_error",
        },
        500,
        cors,
      );
    }
  },
);
