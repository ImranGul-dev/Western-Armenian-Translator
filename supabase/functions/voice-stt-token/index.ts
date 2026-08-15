import {
  buildCorsHeaders,
  isOriginAllowed,
} from "../_shared/cors.ts";

import {
  getRuntimeConfig,
} from "../_shared/env.ts";

import {
  getClientFingerprintInput,
  isPublishableKeyAccepted,
  sha256Hex,
} from "../_shared/security.ts";

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

function transcriptionSettings(
  language: string,
) {
  if (language === "hyw") {
    return {
      languages: ["hy"],

      prompt:
        "Western Armenian speech for a Western Armenian translation application. Transcribe the speaker faithfully in Armenian script using Western Armenian wording and spelling where appropriate. Do not translate the speech.",
    };
  }

  if (language === "hye") {
    return {
      languages: ["hy"],

      prompt:
        "Eastern Armenian speech for an Armenian translation application. Transcribe the speaker faithfully in Armenian script. Do not translate the speech.",
    };
  }

  return {
    languages: ["en"],

    prompt:
      "English speech for an English and Armenian translation application. Transcribe the speaker faithfully. Do not translate the speech.",
  };
}

export default {
  async fetch(
    request: Request,
  ): Promise<Response> {
    const requestId =
      crypto.randomUUID();

    const config =
      getRuntimeConfig();

    const origin =
      request.headers.get(
        "origin",
      );

    const cors =
      buildCorsHeaders(
        origin,
      );

    const baseHeaders = {
      ...cors,

      "X-Request-Id":
        requestId,

      "Cache-Control":
        "no-store",
    };

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
            "This website origin is not allowed to use speech recognition.",

          requestId,
        },
        403,
        baseHeaders,
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
          headers: baseHeaders,
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
          ...baseHeaders,

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
        baseHeaders,
      );
    }

    if (
      !config.openAiApiKey ||
      !config.rateLimitSalt
    ) {
      return json(
        {
          success: false,

          error:
            "Speech recognition is not configured.",

          requestId,
        },
        500,
        baseHeaders,
      );
    }

    let body: unknown;

    try {
      body =
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
        baseHeaders,
      );
    }

    const values =
      body &&
      typeof body === "object" &&
      !Array.isArray(body)
        ? body as Record<
            string,
            unknown
          >
        : {};

    const language =
      values.language === "hyw" ||
      values.language === "hye"
        ? values.language
        : "en";

    const settings =
      transcriptionSettings(
        language,
      );

    /*
     * Hash the requester identity before sending
     * it as an OpenAI safety identifier.
     *
     * The raw public IP is never sent as the
     * identifier.
     */
    const safetyIdentifier =
      await sha256Hex(
        `${config.rateLimitSalt}|voice-stt|${
          getClientFingerprintInput(
            request,
            "voice-stt",
          )
        }`,
      );

    let upstream:
      Response;

    try {
      upstream =
        await fetch(
          "https://api.openai.com/v1/realtime/client_secrets",
          {
            method: "POST",

            headers: {
              Authorization:
                `Bearer ${config.openAiApiKey}`,

              "Content-Type":
                "application/json",

              "OpenAI-Safety-Identifier":
                safetyIdentifier,
            },

            body:
              JSON.stringify({
                expires_after: {
                  anchor:
                    "created_at",

                  seconds:
                    120,
                },

                session: {
                  type:
                    "transcription",

                  audio: {
                    input: {
                      format: {
                        type:
                          "audio/pcm",

                        rate:
                          24000,
                      },

                      noise_reduction: {
                        type:
                          "near_field",
                      },

                      transcription: {
                        model:
                          "gpt-live-transcribe",

                        languages:
                          settings.languages,

                        prompt:
                          settings.prompt,
                      },

                      /*
                       * A short silence window keeps
                       * speech-to-text feeling fast.
                       */
                      turn_detection: {
                        type:
                          "server_vad",

                        threshold:
                          0.5,

                        prefix_padding_ms:
                          300,

                        silence_duration_ms:
                          400,
                      },
                    },
                  },
                },
              }),

            signal:
              request.signal,
          },
        );
    } catch (error) {
      console.error(
        "Realtime transcription token request failed",
        error,
      );

      return json(
        {
          success: false,

          error:
            "Speech recognition is temporarily unavailable.",

          requestId,
        },
        503,
        baseHeaders,
      );
    }

    if (!upstream.ok) {
      try {
        console.error(
          "OpenAI realtime token error",
          await upstream.text(),
        );
      } catch {
        // Logging failed.
      }

      return json(
        {
          success: false,

          error:
            "Could not start speech recognition.",

          requestId,
        },
        upstream.status >= 400 &&
          upstream.status < 600
          ? upstream.status
          : 502,
        baseHeaders,
      );
    }

    const token =
      await upstream.json() as {
        value?: string;
        expires_at?: number;
      };

    if (!token.value) {
      return json(
        {
          success: false,

          error:
            "Speech recognition session could not be created.",

          requestId,
        },
        502,
        baseHeaders,
      );
    }

    return json(
      {
        success: true,

        value:
          token.value,

        expiresAt:
          token.expires_at ?? null,

        requestId,
      },
      200,
      baseHeaders,
    );
  },
};