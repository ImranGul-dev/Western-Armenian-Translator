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

type ThesaurusLanguage =
  | "hyw"
  | "hye";

interface ThesaurusRequest {
  text?: unknown;
  language?: unknown;
}

interface ThesaurusItem {
  text: string;
  meaning: string;
}

interface ThesaurusResult {
  input: string;
  inputMeaning: string;
  synonyms: ThesaurusItem[];
  antonyms: ThesaurusItem[];
  alternatives: ThesaurusItem[];
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

function cleanItem(
  value: unknown,
): ThesaurusItem | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const raw =
    value as Record<string, unknown>;

  const text =
    typeof raw.text === "string"
      ? raw.text.trim()
      : "";

  const meaning =
    typeof raw.meaning === "string"
      ? raw.meaning.trim()
      : "";

  if (!text) {
    return null;
  }

  return {
    text,
    meaning,
  };
}

function cleanList(
  value: unknown,
): ThesaurusItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen =
    new Set<string>();

  const items:
    ThesaurusItem[] = [];

  for (const raw of value) {
    const item =
      cleanItem(raw);

    if (!item) {
      continue;
    }

    const key =
      item.text.toLocaleLowerCase();

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
    input:
      typeof parsed.input === "string"
        ? parsed.input.trim()
        : "",

    inputMeaning:
      typeof parsed.inputMeaning === "string"
        ? parsed.inputMeaning.trim()
        : "",

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
            "Please enter an Armenian or English word or phrase.",
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

    const language:
      ThesaurusLanguage =
      payload.language === "hye"
        ? "hye"
        : "hyw";

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
              : "Please enter an Armenian or English word or phrase.",
          code:
            "invalid_text",
        },
        400,
        cors,
      );
    }

    const dialectName =
      language === "hye"
        ? "Eastern Armenian"
        : "Western Armenian";

    const orthographyRule =
      language === "hye"
        ? "Use standard modern Eastern Armenian spelling and vocabulary."
        : "Use traditional Western Armenian orthography and Western Armenian vocabulary.";

    const instructions = `
You are the ${dialectName} Thesaurus for the Tun Armenian language platform.

The user may enter:
- Armenian script;
- Armenian written phonetically with the Latin alphabet;
- or an English word or short phrase whose Armenian alternatives they want.

First determine the intended everyday meaning. If the input is Latin-script Armenian transliteration, interpret it phonetically as Armenian rather than treating it as an English spelling. If it is clearly ordinary English, translate the concept into ${dialectName} before finding alternatives.

Requirements:
- ${orthographyRule}
- Return the normalized Armenian input in the "input" field.
- Return a short natural English gloss for that input in "inputMeaning".
- Every synonym, antonym and alternative must include a concise English meaning.
- Return only vocabulary and phrasing that you are highly confident is natural and semantically correct in ${dialectName}.
- Never guess. If uncertain, omit the item.
- If a standalone word has several possible meanings and no context is provided, use its most common everyday meaning.
- Do not mix literal, figurative, technical or context-specific senses in the same result.
- Synonyms and antonyms must match the same sense and grammatical role as the normalized Armenian input.
- A synonym must be naturally substitutable for the input in ordinary usage, not merely associated with it.
- Antonyms must be direct semantic opposites. If there is no natural antonym, return an empty array.
- Alternative phrasing must preserve the same communicative meaning.
- Never return the normalized input itself in any result list.
- Do not invent Armenian words.
- Prefer fewer high-confidence results over weak filler.
- Avoid duplicate or near-duplicate items.
- Return no more than 5 items in each list.
- Do not include markdown, code fences, headings, commentary or transliteration in the response.

Return ONLY one valid JSON object in exactly this structure:
{
  "input": "normalized Armenian input",
  "inputMeaning": "short English meaning",
  "synonyms": [{"text": "Armenian", "meaning": "English meaning"}],
  "antonyms": [{"text": "Armenian", "meaning": "English meaning"}],
  "alternatives": [{"text": "Armenian", "meaning": "English meaning"}]
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
            1800,

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

      if (!result.input) {
        return json(
          {
            success: false,
            error:
              "The thesaurus could not confidently identify that word or phrase. Please check the spelling or add more context.",
            code:
              "unrecognized_input",
          },
          422,
          cors,
        );
      }

      const validationInstructions = `
You are the quality-control reviewer for a ${dialectName} thesaurus.

You receive the original user input plus a normalized Armenian input and candidate synonym, antonym and alternative objects. Each object contains Armenian text and an English meaning.

Strict rules:
- Do not add new candidates.
- Do not rewrite Armenian candidate text.
- You may correct or shorten an English meaning only when needed for accuracy.
- Keep an item only if you are highly confident it is correct ${dialectName} for the same intended sense and grammatical role.
- ${orthographyRule}
- Remove the normalized input if it appears in any candidate list.
- Remove weak, misleading, duplicated, Eastern/Western-dialect-mismatched or contextually unrelated candidates.
- Prefer an empty or short list over questionable results.
- Preserve the normalized Armenian input and its English meaning.

Return ONLY one valid JSON object with this exact structure:
{
  "input": "normalized Armenian input",
  "inputMeaning": "short English meaning",
  "synonyms": [{"text": "retained Armenian", "meaning": "English meaning"}],
  "antonyms": [{"text": "retained Armenian", "meaning": "English meaning"}],
  "alternatives": [{"text": "retained Armenian", "meaning": "English meaning"}]
}
`.trim();

      const validationPayload =
        JSON.stringify({
          originalInput: text,
          language,
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
            1600,

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
        validated.input
          .trim()
          .toLocaleLowerCase();

      const removeInput = (
        items: ThesaurusItem[],
      ) =>
        items.filter(
          (item) =>
            item.text
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
            synonyms:
              synonyms.map(
                (item) => item.text,
              ),
            antonyms:
              antonyms.map(
                (item) => item.text,
              ),
            alternatives:
              alternatives.map(
                (item) => item.text,
              ),
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
          input:
            validated.input,
          inputMeaning:
            validated.inputMeaning,
          originalInput: text,
          language,
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
