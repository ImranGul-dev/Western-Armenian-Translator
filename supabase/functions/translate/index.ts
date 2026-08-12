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
  translateWithOpenAIStream,
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

    anonymous_client_hash:
      account.userId
        ? null
        : values.clientHash,

    source_language:
      values.source,

    target_language:
      values.target,

    character_count:
      values.characters,

    status:
      values.status,

    success:
      values.success,

    openai_processed:
      values.processed,

    latency_ms:
      values.latency,

    model:
      values.model,

    plan_id:
      account.plan.id,

    plan_slug:
      account.plan.slug,

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

function encodeStreamMessage(
  encoder: TextEncoder,
  message: Record<string, unknown>,
): Uint8Array {
  /*
   * Each message is one JSON object followed by a newline.
   *
   * This is NDJSON and is straightforward for fetch() to
   * consume progressively in the browser.
   */
  return encoder.encode(
    `${JSON.stringify(message)}\n`,
  );
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
      "X-Request-Id":
        requestId,
    };

    /*
     * Validate everything possible before opening a streaming
     * response. Normal HTTP error status codes can therefore
     * still be returned for invalid requests.
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
          "Cache-Control":
            "no-store",

          "X-Request-Id":
            requestId,
        },
      );
    }

    if (
      request.method ===
      "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status: 204,
          headers: base,
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
            "Only POST requests are supported.",

          requestId,
        },
        405,
        {
          ...base,

          Allow:
            "POST, OPTIONS",
        },
      );
    }

    if (
      !isPublishableKeyAccepted(
        request.headers.get(
          "apikey",
        ),
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
      length >
        MAX_REQUEST_BYTES
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
            error instanceof
              ValidationError
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
      ).slice(
        0,
        160,
      );

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
            persistSession:
              false,

            autoRefreshToken:
              false,
          },
        },
      );

    /*
     * Account resolution must remain before quota/rate-limit
     * checks because those limits depend on the active plan.
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
     * These operations are independent, so perform them
     * concurrently.
     */
    const usagePromise =
      currentCharacters(
        admin,
        account.identityKey,
      )
        .then(
          (used) => ({
            success:
              true as const,

            used,
          }),
        )
        .catch(
          () => ({
            success:
              false as const,

            used: 0,
          }),
        );

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
    ] =
      await Promise.all([
        usagePromise,
        contextPromise,
        rateIdentifierPromise,
      ]);

    if (
      !usageResult.success
    ) {
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
     * Rate limiting remains before OpenAI so rejected requests
     * do not consume model tokens.
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

          "Retry-After":
            "60",
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
     * At this point all validation, quota checks and rate
     * limiting have succeeded.
     *
     * Open a streaming response to the browser.
     */
    const encoder =
      new TextEncoder();

    const stream =
      new ReadableStream<Uint8Array>(
        {
          start(controller) {
            /*
             * Do not return this async Promise from start().
             *
             * Running it independently lets the Response be
             * returned immediately while the stream continues
             * producing translation chunks.
             */
            void (async () => {
              let streamedText =
                "";

              try {
                controller.enqueue(
                  encodeStreamMessage(
                    encoder,
                    {
                      type:
                        "start",

                      requestId,

                      sourceLanguage:
                        payload.sourceLanguage,

                      targetLanguage:
                        payload.targetLanguage,

                      characterCount:
                        characters,
                    },
                  ),
                );

                /*
                 * Start the OpenAI streaming request.
                 *
                 * Each output_text delta is forwarded to the
                 * browser as soon as it arrives.
                 */
                const result =
                  await translateWithOpenAIStream(
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

                    async (
                      delta,
                    ) => {
                      /*
                       * If the browser canceled the request
                       * because the user typed something new,
                       * stop forwarding the old translation.
                       */
                      if (
                        request.signal
                          .aborted
                      ) {
                        throw new DOMException(
                          "Translation request was cancelled.",
                          "AbortError",
                        );
                      }

                      streamedText +=
                        delta;

                      controller.enqueue(
                        encodeStreamMessage(
                          encoder,
                          {
                            type:
                              "delta",

                            delta,
                          },
                        ),
                      );
                    },
                  );

                /*
                 * Use the canonical finished translation from
                 * the OpenAI helper. The accumulated delta
                 * string exists only as an additional sanity
                 * check/debug aid.
                 */
                const translation =
                  result.translation ||
                  streamedText.trim();

                const completedLatency =
                  Date.now() -
                  started;

                const profileUpdate =
                  account.userId
                    ? admin
                        .from(
                          "profiles",
                        )
                        .update({
                          last_active_at:
                            new Date().toISOString(),
                        })
                        .eq(
                          "id",
                          account.userId,
                        )
                    : Promise.resolve(
                        null,
                      );

                /*
                 * The translated text is already visible to
                 * the browser while these bookkeeping
                 * operations run.
                 *
                 * Use allSettled so a noncritical history or
                 * telemetry problem does not replace a valid
                 * translation with an error after it has
                 * already been streamed.
                 */
                const postResults =
                  await Promise.allSettled(
                    [
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

                          success:
                            true,

                          processed:
                            true,

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
                        translation,
                        characters,
                      ),

                      profileUpdate,
                    ],
                  );

                const historyResult =
                  postResults[2];

                const historySaved =
                  historyResult.status ===
                  "fulfilled"
                    ? historyResult.value
                    : false;

                /*
                 * Log bookkeeping failures without breaking
                 * the successful translation stream.
                 */
                for (
                  const resultItem of
                  postResults
                ) {
                  if (
                    resultItem.status ===
                    "rejected"
                  ) {
                    console.error(
                      "Translation post-processing failed",
                      resultItem.reason,
                    );
                  }
                }

                const nextUsed =
                  used +
                  characters;

                const limit =
                  account.plan
                    .monthlyCharacterLimit;

                /*
                 * Final message contains the same metadata the
                 * old JSON response returned.
                 */
                controller.enqueue(
                  encodeStreamMessage(
                    encoder,
                    {
                      type:
                        "complete",

                      success:
                        true,

                      translation,

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
                            limit -
                              nextUsed,
                          ),

                        percentage:
                          limit
                            ? (
                                nextUsed /
                                limit
                              ) *
                              100
                            : 0,

                        plan:
                          account.plan
                            .slug,
                      },
                    },
                  ),
                );

                controller.close();
              } catch (error) {
                /*
                 * Cancellation caused by the user typing a new
                 * value is expected and should not be recorded
                 * as a platform/OpenAI failure.
                 */
                if (
                  request.signal
                    .aborted
                ) {
                  try {
                    controller.close();
                  } catch {
                    // Stream may already have been cancelled.
                  }

                  return;
                }

                const friendly =
                  friendlyOpenAIError(
                    error,
                  );

                /*
                 * Failure telemetry is independent and should
                 * not prevent the error frame from eventually
                 * reaching the browser.
                 */
                await Promise.allSettled(
                  [
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

                        success:
                          false,

                        processed:
                          false,

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
                      .from(
                        "system_errors",
                      )
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
                  ],
                );

                try {
                  controller.enqueue(
                    encodeStreamMessage(
                      encoder,
                      {
                        type:
                          "error",

                        success:
                          false,

                        status:
                          friendly.status,

                        error:
                          friendly.message,

                        code:
                          friendly.code,

                        requestId,
                      },
                    ),
                  );

                  controller.close();
                } catch {
                  /*
                   * The browser may have disconnected before
                   * the error could be sent.
                   */
                }
              }
            })();
          },
        },
      );

    /*
     * NDJSON is used rather than one final JSON document.
     *
     * The next frontend change will consume response.body with
     * getReader() and process each newline-delimited message as
     * it arrives.
     */
    return new Response(
      stream,
      {
        status: 200,

        headers: {
          ...rateHeaders,

          "Content-Type":
            "application/x-ndjson; charset=utf-8",

          "Cache-Control":
            "no-store, no-transform",

          "X-Content-Type-Options":
            "nosniff",
        },
      },
    );
  },
};