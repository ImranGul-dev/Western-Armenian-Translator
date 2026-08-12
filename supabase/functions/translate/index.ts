import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import {
  currentCharacters,
  resolveAccount,
} from "../_shared/account.ts";

import {
  buildCorsHeaders,
  isOriginAllowed,
} from "../_shared/cors.ts";

import { getRuntimeConfig } from "../_shared/env.ts";

import { findRelevantContext } from "../_shared/knowledge-base.ts";

import {
  friendlyOpenAIError,
  translateWithOpenAI,
} from "../_shared/openai-translation.ts";

import { consumeRateLimit } from "../_shared/rate-limit.ts";

import {
  getClientFingerprintInput,
  isPublishableKeyAccepted,
  sha256Hex,
} from "../_shared/security.ts";

import { buildTranslationInstructions } from "../_shared/translation-prompt.ts";

import {
  countCharacters,
  MAX_REQUEST_BYTES,
  validateTranslationRequest,
  ValidationError,
} from "../_shared/validation.ts";

import type {
  AccountContext,
  LanguageCode,
} from "../_shared/types.ts";

function json(
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string>,
) {
  return Response.json(body, {
    status,
    headers,
  });
}

async function usageEvent(
  admin: SupabaseClient,
  account: AccountContext,
  values: {
    requestId: string;
    clientHash: string;
    source: LanguageCode;
    target: LanguageCode;
    characters: number;
    status: string;
    success: boolean;
    processed: boolean;
    latency: number;
    model: string;
    estimatedCost: number | null;
    errorCode?: string;
  },
) {
  await admin.from("usage_events").insert({
    request_id: values.requestId,

    user_id: account.userId,

    anonymous_client_hash: account.userId
      ? null
      : values.clientHash,

    source_language: values.source,
    target_language: values.target,

    character_count: values.characters,

    status: values.status,
    success: values.success,
    openai_processed: values.processed,

    latency_ms: values.latency,
    model: values.model,

    plan_id: account.plan.id,
    plan_slug: account.plan.slug,

    estimated_cost_usd:
      values.estimatedCost,

    error_code:
      values.errorCode || null,
  });
}

async function increment(
  admin: SupabaseClient,
  account: AccountContext,
  characters: number,
  success: boolean,
) {
  await admin.rpc(
    "increment_monthly_usage",
    {
      p_identity_key:
        account.identityKey,

      p_user_id:
        account.userId,

      p_plan_id:
        account.plan.id,

      p_plan_slug:
        account.plan.slug,

      p_characters:
        characters,

      p_success:
        success,
    },
  );
}

async function saveHistory(
  admin: SupabaseClient,
  account: AccountContext,
  requestId: string,
  payload: {
    text: string;
    sourceLanguage: LanguageCode;
    targetLanguage: LanguageCode;
  },
  translation: string,
  characters: number,
) {
  if (
    !account.userId ||
    !account.historyEnabled
  ) {
    return false;
  }

  const { error } = await admin
    .from("translation_history")
    .insert({
      user_id:
        account.userId,

      request_id:
        requestId,

      source_language:
        payload.sourceLanguage,

      target_language:
        payload.targetLanguage,

      source_text:
        payload.text,

      translated_text:
        translation,

      character_count:
        characters,

      admin_visible:
        account.queryReviewConsent,
    });

  if (error) {
    return false;
  }

  if (account.plan.historyLimit) {
    const { data } = await admin
      .from("translation_history")
      .select("id")
      .eq(
        "user_id",
        account.userId,
      )
      .order(
        "created_at",
        {
          ascending: false,
        },
      )
      .range(
        account.plan.historyLimit,
        account.plan.historyLimit + 250,
      );

    const ids = (data || []).map(
      (item: { id: string }) =>
        item.id,
    );

    if (ids.length) {
      await admin
        .from("translation_history")
        .delete()
        .in("id", ids);
    }
  }

  return true;
}

export default {
  async fetch(
    request: Request,
  ): Promise<Response> {
    const requestId =
      crypto.randomUUID();

    const started =
      Date.now();

    const config =
      getRuntimeConfig();

    const origin =
      request.headers.get("origin");

    const cors =
      buildCorsHeaders(origin);

    const base = {
      ...cors,
      "X-Request-Id": requestId,
    };

    /*
     * Basic request validation is intentionally performed
     * before any database or OpenAI work.
     */

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
            "This website origin is not allowed to use the translation service.",

          requestId,
        },
        403,
        {
          "Cache-Control": "no-store",
          "X-Request-Id": requestId,
        },
      );
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: base,
      });
    }

    if (request.method !== "POST") {
      return json(
        {
          success: false,
          error:
            "Only POST requests are supported.",
          requestId,
        },
        405,
        {
          ...base,
          Allow: "POST, OPTIONS",
        },
      );
    }

    if (
      !isPublishableKeyAccepted(
        request.headers.get("apikey"),
        config.publishableKeys,
      )
    ) {
      return json(
        {
          success: false,

          error:
            "The Supabase project key is missing or invalid.",

          requestId,
        },
        401,
        base,
      );
    }

    if (
      !config.openAiApiKey ||
      !config.supabaseUrl ||
      !config.adminKey ||
      !config.rateLimitSalt
    ) {
      return json(
        {
          success: false,

          error:
            "The translation backend is missing required environment variables.",

          requestId,
        },
        500,
        base,
      );
    }

    const contentType =
      (
        request.headers.get(
          "content-type",
        ) || ""
      ).toLowerCase();

    if (
      !contentType.includes(
        "application/json",
      )
    ) {
      return json(
        {
          success: false,
          error:
            "Send the request as JSON.",
          requestId,
        },
        415,
        base,
      );
    }

    const length =
      Number.parseInt(
        request.headers.get(
          "content-length",
        ) || "0",
        10,
      );

    if (
      Number.isFinite(length) &&
      length > MAX_REQUEST_BYTES
    ) {
      return json(
        {
          success: false,

          error:
            "The translation request is too large.",

          requestId,
        },
        413,
        base,
      );
    }

    let raw: unknown;

    try {
      raw =
        await request.json();
    } catch {
      return json(
        {
          success: false,

          error:
            "The request contains invalid JSON.",

          requestId,
        },
        400,
        base,
      );
    }

    let payload;

    try {
      payload =
        validateTranslationRequest(
          raw,
        );
    } catch (error) {
      return json(
        {
          success: false,

          error:
            error instanceof ValidationError
              ? error.message
              : "The translation request is not valid.",

          requestId,
        },
        400,
        base,
      );
    }

    const anonymousId =
      (
        request.headers.get(
          "x-client-id",
        ) || "anonymous"
      ).slice(0, 160);

    const clientHash =
      await sha256Hex(
        `${config.rateLimitSalt}|${getClientFingerprintInput(
          request,
          anonymousId,
        )}`,
      );

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

    /*
     * Account resolution still must happen first because
     * plan limits and identity are required for the rest
     * of the request.
     */
    const account =
      await resolveAccount(
        admin,
        request,
        clientHash,
      );

    const characters =
      countCharacters(
        payload.text,
      );

    if (
      characters >
      account.plan
        .maxCharactersPerRequest
    ) {
      return json(
        {
          success: false,

          error:
            `This text is longer than your current plan allows (${account.plan.maxCharactersPerRequest.toLocaleString()} characters).`,

          code:
            "request_limit",

          upgradeRecommended:
            account.plan.slug !==
              "business" &&
            account.plan.slug !==
              "admin",

          requestId,
        },
        413,
        base,
      );
    }

    /*
     * LATENCY OPTIMIZATION
     *
     * These three operations are independent once the
     * account is known:
     *
     * 1. Current monthly character usage
     * 2. Approved translation context retrieval
     * 3. Rate-limit identifier hashing
     *
     * Previously they happened mostly one after another.
     * Run them concurrently.
     */

    const usagePromise =
      currentCharacters(
        admin,
        account.identityKey,
      )
        .then((used) => ({
          success: true as const,
          used,
        }))
        .catch(() => ({
          success: false as const,
          used: 0,
        }));

    const contextPromise =
      findRelevantContext(
        admin,
        payload.text,
        payload.sourceLanguage,
        payload.targetLanguage,
      );

    const rateIdentifierPromise =
      account.userId
        ? sha256Hex(
            `${config.rateLimitSalt}|${account.identityKey}`,
          )
        : Promise.resolve(
            clientHash,
          );

    const [
      usageResult,
      context,
      rateIdentifier,
    ] = await Promise.all([
      usagePromise,
      contextPromise,
      rateIdentifierPromise,
    ]);

    if (!usageResult.success) {
      return json(
        {
          success: false,

          error:
            "Usage metering is temporarily unavailable. Please try again.",

          code:
            "usage_unavailable",

          requestId,
        },
        503,
        base,
      );
    }

    const used =
      usageResult.used;

    if (
      used + characters >
      account.plan
        .monthlyCharacterLimit
    ) {
      return json(
        {
          success: false,

          error:
            "You have reached your monthly translation limit.",

          code:
            "monthly_limit",

          upgradeRecommended:
            account.plan.slug !==
              "business" &&
            account.plan.slug !==
              "admin",

          requestId,
        },
        429,
        base,
      );
    }

    /*
     * Rate limiting remains enforced before OpenAI.
     * We intentionally do not run this before checking the
     * monthly quota so quota-blocked requests do not consume
     * a normal translation rate-limit slot.
     */

    let rate;

    try {
      rate =
        await consumeRateLimit(
          admin,
          rateIdentifier,
          account.plan
            .rateLimitPerMinute,
          60,
        );
    } catch {
      return json(
        {
          success: false,

          error:
            "The translation service is temporarily unavailable. Please try again.",

          requestId,
        },
        503,
        base,
      );
    }

    const rateHeaders = {
      ...base,

      "X-RateLimit-Limit":
        String(
          account.plan
            .rateLimitPerMinute,
        ),

      "X-RateLimit-Remaining":
        String(
          rate.remaining,
        ),

      "X-RateLimit-Reset":
        rate.resetAt,
    };

    if (!rate.allowed) {
      return json(
        {
          success: false,

          error:
            "Too many translation requests. Please wait a moment and try again.",

          code:
            "rate_limit",

          requestId,
        },
        429,
        {
          ...rateHeaders,
          "Retry-After": "60",
        },
      );
    }

    const instructions =
      buildTranslationInstructions(
        payload.sourceLanguage,
        payload.targetLanguage,
        context,
      );

    /*
     * Keep the OpenAI request isolated from database
     * post-processing. Only genuine OpenAI failures should
     * be converted through friendlyOpenAIError().
     */

    let result;

    try {
      result =
        await translateWithOpenAI(
          {
            apiKey:
              config.openAiApiKey,

            model:
              config.openAiModel,

            timeoutMs:
              config.openAiTimeoutMs,

            inputCostPerMillion:
              config.inputCostPerMillion,

            outputCostPerMillion:
              config.outputCostPerMillion,
          },

          instructions,
          payload.text,
        );
    } catch (error) {
      const friendly =
        friendlyOpenAIError(
          error,
        );

      /*
       * Failure telemetry operations are independent.
       * Run them concurrently rather than sequentially.
       */
      await Promise.all([
        usageEvent(
          admin,
          account,
          {
            requestId,
            clientHash,

            source:
              payload.sourceLanguage,

            target:
              payload.targetLanguage,

            characters,

            status:
              friendly.code,

            success: false,

            processed: false,

            latency:
              Date.now() -
              started,

            model:
              config.openAiModel,

            estimatedCost:
              null,

            errorCode:
              friendly.code,
          },
        ),

        increment(
          admin,
          account,
          0,
          false,
        ),

        admin
          .from("system_errors")
          .insert({
            request_id:
              requestId,

            error_code:
              friendly.code,

            safe_message:
              friendly.message,

            function_name:
              "translate",
          }),
      ]);

      return json(
        {
          success: false,
          error:
            friendly.message,
          code:
            friendly.code,
          requestId,
        },
        friendly.status,
        rateHeaders,
      );
    }

    /*
     * OPENAI HAS FINISHED.
     *
     * Previously the browser waited for:
     *
     * usage event
     *   ↓
     * monthly increment
     *   ↓
     * history save/prune
     *   ↓
     * profile update
     *
     * These operations are independent and can run at the
     * same time.
     */

    const completedLatency =
      Date.now() - started;

    const profileUpdate =
      account.userId
        ? admin
            .from("profiles")
            .update({
              last_active_at:
                new Date().toISOString(),
            })
            .eq(
              "id",
              account.userId,
            )
        : Promise.resolve(null);

    const [
      ,
      ,
      historySaved,
    ] = await Promise.all([
      usageEvent(
        admin,
        account,
        {
          requestId,
          clientHash,

          source:
            payload.sourceLanguage,

          target:
            payload.targetLanguage,

          characters,

          status:
            "success",

          success: true,

          processed: true,

          latency:
            completedLatency,

          model:
            config.openAiModel,

          estimatedCost:
            result.estimatedCost,
        },
      ),

      increment(
        admin,
        account,
        characters,
        true,
      ),

      saveHistory(
        admin,
        account,
        requestId,
        payload,
        result.translation,
        characters,
      ),

      profileUpdate,
    ]);

    const nextUsed =
      used + characters;

    const limit =
      account.plan
        .monthlyCharacterLimit;

    return json(
      {
        success: true,

        translation:
          result.translation,

        sourceLanguage:
          payload.sourceLanguage,

        targetLanguage:
          payload.targetLanguage,

        characterCount:
          characters,

        requestId,

        historySaved,

        usage: {
          used:
            nextUsed,

          limit,

          remaining:
            Math.max(
              0,
              limit - nextUsed,
            ),

          percentage:
            limit
              ? (nextUsed /
                  limit) *
                100
              : 0,

          plan:
            account.plan.slug,
        },
      },
      200,
      rateHeaders,
    );
  },
};