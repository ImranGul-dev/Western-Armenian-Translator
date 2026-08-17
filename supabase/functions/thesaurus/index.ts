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

    if (items.length >= 5) {
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
- Return only vocabulary and phrasing that you are confident is natural and semantically correct in Western Armenian.
- Never guess. If you are uncertain whether an item is correct, omit it.
- If a standalone word has several possible meanings and the user gives no context, use only its most common everyday meaning.
- Do not mix literal, figurative, technical, or context-specific senses in the same result.
- Synonyms and antonyms must match the same sense and grammatical role as the user's input.
- A synonym must be naturally substitutable for the input in ordinary usage, not merely related, stronger, weaker, larger, taller, more intense, or associated with it.
- Antonyms must be direct semantic opposites for that same sense. Do not include loosely contrasting or context-dependent words.
- Never return the user's exact input as one of its own synonyms, antonyms, or alternatives.
- Synonyms must have the same or a very closely related meaning. Do not include merely associated words.
- For greetings, expressions, idioms, and short phrases, synonyms must be expressions that can naturally replace the input in the same conversational situation.
- Antonyms must have a genuine opposite meaning. If there is no natural antonym, return an empty antonyms array.
- Alternative phrasing must preserve the original communicative meaning and be usable naturally in a similar context.
- Do not include words simply because they share letters, sounds, roots, or spelling with the input.
- Do not invent words.
- Do not include unrelated adjectives, nouns, verbs, or expressions.
- Prefer fewer high-confidence results over filling the list with weak results.
- Avoid duplicate or near-duplicate items.
- Return no more than 5 items in each list.
- Do not include explanations, English translations, markdown, code fences, transliteration, headings, or commentary.

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

      const validationInstructions = `
You are the quality-control reviewer for a Western Armenian thesaurus.

You will receive:
1. the original Western Armenian input;
2. candidate synonyms;
3. candidate antonyms;
4. candidate alternative phrasings.

Your task is ONLY to remove incorrect, weak, misleading, duplicated, or contextually mismatched candidates.

Strict rules:
- Do not add any new words or phrases.
- Do not rewrite any candidate.
- Keep an item only if you are highly confident it is correct Western Armenian.
- Use the most common everyday sense when the original input has no context.
- Do not mix literal, figurative, technical, or unrelated senses.
- A synonym must be naturally substitutable for the original in the same sense and grammatical role.
- Similar intensity alone is not enough to make something a synonym.
- For example, words meaning tall, strong, powerful, intense, important, or enormous are not automatically synonyms for a word meaning big.
- An antonym must be a direct semantic opposite of the same sense and grammatical role.
- Do not keep merely contrasting or context-dependent words as antonyms.
- Alternative phrasing must preserve the same communicative meaning and be natural Western Armenian.
- Remove the exact original input if it appears in any candidate list.
- Prefer an empty or short list instead of a questionable item.
- Preserve the exact spelling of every candidate you keep.

Return ONLY one valid JSON object:
{
  "synonyms": ["only retained candidates"],
  "antonyms": ["only retained candidates"],
  "alternatives": ["only retained candidates"]
}
`.trim();

      const validationPayload =
        JSON.stringify({
          input: text,
          candidates: result,
        });

      const validationResponse =
        await client.responses.create({
          model,

          instructions:
            validationInstructions,

          input: [
            {
              role: "user",
              content: [
                {
                  type:
                    "input_text",
                  text:
                    validationPayload,
                },
              ],
            },
          ],

          max_output_tokens:
            1000,

          ...(reasoning
            ? {
                reasoning,
              }
            : {}),

          store: false,
        });

      const validationRaw =
        validationResponse
          .output_text
          ?.trim();

      if (!validationRaw) {
        throw new Error(
          "EMPTY_THESAURUS_VALIDATION_RESPONSE",
        );
      }

      let validated:
        ThesaurusResult;

      try {
        validated =
          parseResult(
            validationRaw,
          );
      } catch {
        return json(
          {
            success: false,
            error:
              "The thesaurus results could not be validated. Please try again.",
            code:
              "invalid_validation_response",
          },
          502,
          cors,
        );
      }

      const normalizedInput =
        text
          .trim()
          .toLocaleLowerCase();

      const removeInput = (
        items: string[],
      ) =>
        items.filter(
          (item) =>
            item
              .trim()
              .toLocaleLowerCase() !==
            normalizedInput,
        );

      const synonyms =
        removeInput(
          validated.synonyms,
        );

      const antonyms =
        removeInput(
          validated.antonyms,
        );

      const alternatives =
        removeInput(
          validated.alternatives,
        );

      const historyResult =
        await admin
          .from("thesaurus_history")
          .insert({
            user_id:
              user.id,
            input_text:
              text,
            synonyms,
            antonyms,
            alternatives,
          });

      if (historyResult.error) {
        console.error(
          "Unable to save Thesaurus history",
          historyResult.error,
        );
      }

      return json(
        {
          success: true,
          input: text,
          synonyms,
          antonyms,
          alternatives,
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
