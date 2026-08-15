import OpenAI from "openai";

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

interface ThesaurusRequest {
  text?: unknown;
}

interface ThesaurusResult {
  synonyms: string[];
  antonyms: string[];
  alternatives: string[];
}

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

function reasoningForModel(
  model: string,
):
  | {
      effort: "none" | "minimal";
    }
  | undefined {
  const normalized =
    model.trim().toLowerCase();

  if (
    normalized === "gpt-5.4" ||
    normalized.startsWith(
      "gpt-5.4-",
    ) ||
    normalized === "gpt-5.4-mini" ||
    normalized.startsWith(
      "gpt-5.4-mini-",
    ) ||
    normalized === "gpt-5.4-nano" ||
    normalized.startsWith(
      "gpt-5.4-nano-",
    )
  ) {
    return {
      effort: "none",
    };
  }

  if (
    normalized === "gpt-5-mini" ||
    normalized.startsWith(
      "gpt-5-mini-",
    )
  ) {
    return {
      effort: "minimal",
    };
  }

  return undefined;
}

function cleanList(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen =
    new Set<string>();

  const items: string[] = [];

  for (const raw of value) {
    if (typeof raw !== "string") {
      continue;
    }

    const item =
      raw.trim();

    if (!item) {
      continue;
    }

    const key =
      item.toLocaleLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    items.push(item);

    if (items.length >= 6) {
      break;
    }
  }

  return items;
}

function parseResult(
  raw: string,
): ThesaurusResult {
  const cleaned =
    raw
      .trim()
      .replace(
        /^```(?:json)?\s*/iu,
        "",
      )
      .replace(
        /\s*```$/u,
        "",
      );

  const parsed =
    JSON.parse(cleaned) as
      Record<string, unknown>;

  return {
    synonyms:
      cleanList(parsed.synonyms),

    antonyms:
      cleanList(parsed.antonyms),

    alternatives:
      cleanList(
        parsed.alternatives,
      ),
  };
}

function openAiError(
  error: unknown,
): {
  status: number;
  message: string;
  code: string;
} {
  const raw =
    error &&
      typeof error === "object"
      ? error as Record<
          string,
          unknown
        >
      : {};

  const nested =
    raw.error &&
      typeof raw.error ===
        "object"
      ? raw.error as Record<
          string,
          unknown
        >
      : {};

  const status =
    typeof raw.status === "number"
      ? raw.status
      : undefined;

  const code =
    typeof raw.code === "string"
      ? raw.code
      : typeof nested.code ===
          "string"
        ? nested.code
        : "";

  const message =
    typeof raw.message === "string"
      ? raw.message
      : "";

  const combined =
    `${code} ${message}`
      .toLowerCase();

  if (
    status === 401 ||
    combined.includes(
      "invalid_api_key",
    )
  ) {
    return {
      status: 502,
      message:
        "The thesaurus service is not configured correctly.",
      code:
        "openai_auth_error",
    };
  }

  if (
    status === 404 ||
    combined.includes(
      "model_not_found",
    )
  ) {
    return {
      status: 502,
      message:
        "The configured AI model is unavailable.",
      code:
        "model_unavailable",
    };
  }

  if (
    combined.includes(
      "insufficient_quota",
    ) ||
    combined.includes("billing") ||
    combined.includes("credit")
  ) {
    return {
      status: 503,
      message:
        "The thesaurus service is temporarily unavailable.",
      code:
        "openai_billing_error",
    };
  }

  if (status === 429) {
    return {
      status: 503,
      message:
        "The thesaurus service is busy. Please wait and try again.",
      code:
        "openai_rate_limited",
    };
  }

  return {
    status: 502,
    message:
      "The thesaurus is temporarily unavailable. Please try again.",
    code:
      "openai_error",
  };
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
      buildCorsHeaders(origin);

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
            "The service is not configured correctly.",
          code:
            "supabase_configuration_error",
        },
        503,
        cors,
      );
    }

    if (
      !config.openAiApiKey
    ) {
      return json(
        {
          success: false,
          error:
            "The thesaurus service is not configured correctly.",
          code:
            "openai_configuration_error",
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
            "Please log in to use the thesaurus.",
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
          .eq("id", user.id)
          .maybeSingle(),
      ]);

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
        "thesaurus",
        {
          userId: user.id,
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
            "Thesaurus is available with Person or Schools access.",
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
      ThesaurusRequest;

    try {
      payload =
        await request.json() as
          ThesaurusRequest;
    } catch {
      return json(
        {
          success: false,
          error:
            "Please enter a Western Armenian word or phrase.",
          code:
            "invalid_json",
        },
        400,
        cors,
      );
    }

    const text =
      typeof payload.text ===
        "string"
        ? payload.text.trim()
        : "";

    const characters =
      Array.from(text).length;

    if (
      !text ||
      characters > 200
    ) {
      return json(
        {
          success: false,
          error:
            characters > 200
              ? "Please keep the word or phrase under 200 characters."
              : "Please enter a Western Armenian word or phrase.",
          code:
            "invalid_text",
        },
        400,
        cors,
      );
    }

    const instructions = `
You are the Western Armenian Thesaurus for the Tun Western Armenian language platform.

Your job is to analyse the user's Western Armenian word or short phrase and return useful Western Armenian alternatives.

Requirements:
- Use Western Armenian, not Eastern Armenian.
- Preserve traditional Western Armenian orthography.
- Give natural vocabulary that a Western Armenian speaker could actually use.
- Synonyms should be genuinely close in meaning.
- Antonyms should only be included when a natural antonym exists.
- Alternative phrasing should preserve the original meaning while showing other natural ways to express it.
- Do not invent words.
- Avoid duplicate items.
- Return no more than 6 items in each list.
- If there is no clear antonym, return an empty antonyms array.
- Do not include explanations, markdown, code fences, transliteration, headings, or commentary.

Return ONLY one valid JSON object in exactly this structure:
{
  "synonyms": ["..."],
  "antonyms": ["..."],
  "alternatives": ["..."]
}
`.trim();

    const model =
      config.openAiModel;

    const reasoning =
      reasoningForModel(
        model,
      );

    try {
      const client =
        new OpenAI({
          apiKey:
            config.openAiApiKey,
          maxRetries: 0,
          timeout:
            config.openAiTimeoutMs,
        });

      const response =
        await client.responses.create({
          model,

          instructions,

          input: [
            {
              role: "user",
              content: [
                {
                  type:
                    "input_text",
                  text,
                },
              ],
            },
          ],

          max_output_tokens:
            1200,

          ...(reasoning
            ? {
                reasoning,
              }
            : {}),

          store: false,
        });

      const raw =
        response.output_text
          ?.trim();

      if (!raw) {
        throw new Error(
          "EMPTY_THESAURUS_RESPONSE",
        );
      }

      let result:
        ThesaurusResult;

      try {
        result =
          parseResult(raw);
      } catch {
        return json(
          {
            success: false,
            error:
              "The thesaurus response could not be read. Please try again.",
            code:
              "invalid_ai_response",
          },
          502,
          cors,
        );
      }

      return json(
        {
          success: true,
          input: text,
          synonyms:
            result.synonyms,
          antonyms:
            result.antonyms,
          alternatives:
            result.alternatives,
        },
        200,
        cors,
      );
    } catch (error) {
      const friendly =
        openAiError(error);

      return json(
        {
          success: false,
          error:
            friendly.message,
          code:
            friendly.code,
        },
        friendly.status,
        cors,
      );
    }
  },
);