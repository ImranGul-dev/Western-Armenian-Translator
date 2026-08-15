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

function getTranscriptionSettings(
  language: string,
) {
  if (language === "hyw") {
    return {
      languages: ["hy"],

      prompt:
        "Western Armenian speech. Transcribe faithfully in Armenian script. Prefer Western Armenian wording and spelling where appropriate. Do not translate.",
    };
  }

  if (language === "hye") {
    return {
      languages: ["hy"],

      prompt:
        "Eastern Armenian speech. Transcribe faithfully in Armenian script. Do not translate.",
    };
  }

  return {
    languages: ["en"],

    prompt:
      "English speech. Transcribe faithfully. Do not translate.",
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

    const headers = {
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
        headers,
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
          headers,
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
          ...headers,
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
        headers,
      );
    }

    if (
      !config.openAiApiKey
    ) {
      return json(
        {
          success: false,
          error:
            "OPENAI_API_KEY is not configured for speech recognition.",
          requestId,
        },
        500,
        headers,
      );
    }

    let body:
      Record<string, unknown> = {};

    try {
      const parsed =
        await request.json();

      if (
        parsed &&
        typeof parsed ===
          "object" &&
        !Array.isArray(parsed)
      ) {
        body =
          parsed as Record<
            string,
            unknown
          >;
      }
    } catch {
      return json(
        {
          success: false,
          error:
            "The request contains invalid JSON.",
          requestId,
        },
        400,
        headers,
      );
    }

    const language =
      body.language === "hyw" ||
      body.language === "hye"
        ? body.language
        : "en";

    const settings =
      getTranscriptionSettings(
        language,
      );

    /*
     * Keep a privacy-preserving identifier for
     * OpenAI Realtime safety handling.
     */
    let safetyIdentifier:
      string | null = null;

    if (config.rateLimitSalt) {
      safetyIdentifier =
        await sha256Hex(
          `${config.rateLimitSalt}|voice-stt|${
            getClientFingerprintInput(
              request,
              "voice-stt",
            )
          }`,
        );
    }

    const openAiHeaders:
      Record<string, string> = {
        Authorization:
          `Bearer ${config.openAiApiKey}`,

        "Content-Type":
          "application/json",
      };

    if (safetyIdentifier) {
      openAiHeaders[
        "OpenAI-Safety-Identifier"
      ] =
        safetyIdentifier;
    }

    const sessionRequest = {
      /*
       * Keep this configuration intentionally
       * small while establishing the realtime
       * transcription connection.
       */
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

            transcription: {
              model:
                "gpt-live-transcribe",

              languages:
                settings.languages,

              prompt:
                settings.prompt,
            },

            turn_detection: null,
          },
        },
      },
    };

    let upstream:
      Response;

    try {
      upstream =
        await fetch(
          "https://api.openai.com/v1/realtime/client_secrets",
          {
            method:
              "POST",

            headers:
              openAiHeaders,

            body:
              JSON.stringify(
                sessionRequest,
              ),

            signal:
              request.signal,
          },
        );
    } catch (error) {
      console.error(
        "OpenAI realtime client secret request failed",
        error,
      );

      return json(
        {
          success: false,

          error:
            "Could not connect to OpenAI speech recognition.",

          code:
            "openai_connection_failed",

          requestId,
        },
        503,
        headers,
      );
    }

    if (!upstream.ok) {
      let openAiMessage =
        "OpenAI rejected the speech recognition session.";

      let openAiCode:
        string | null = null;

      let openAiType:
        string | null = null;

      try {
        const raw =
          await upstream.text();

        console.error(
          "OpenAI realtime client secret error",
          upstream.status,
          raw,
        );

        try {
          const parsed =
            JSON.parse(raw) as {
              error?: {
                message?: unknown;
                code?: unknown;
                type?: unknown;
              };
            };

          if (
            typeof parsed.error
              ?.message ===
            "string"
          ) {
            openAiMessage =
              parsed.error.message;
          }

          if (
            typeof parsed.error
              ?.code ===
            "string"
          ) {
            openAiCode =
              parsed.error.code;
          }

          if (
            typeof parsed.error
              ?.type ===
            "string"
          ) {
            openAiType =
              parsed.error.type;
          }
        } catch {
          // Upstream response was not JSON.
        }
      } catch {
        // Could not read upstream body.
      }

      return json(
        {
          success: false,

          error:
            openAiMessage,

          code:
            openAiCode ||
            "openai_realtime_error",

          type:
            openAiType,

          upstreamStatus:
            upstream.status,

          requestId,
        },
        upstream.status >= 400 &&
          upstream.status < 600
          ? upstream.status
          : 502,
        headers,
      );
    }

    let token:
      Record<
        string,
        unknown
      >;

    try {
      token =
        await upstream.json();
    } catch {
      return json(
        {
          success: false,

          error:
            "OpenAI returned an invalid speech recognition session.",

          code:
            "invalid_openai_response",

          requestId,
        },
        502,
        headers,
      );
    }

    const value =
      typeof token.value ===
        "string"
        ? token.value
        : "";

    if (!value) {
      console.error(
        "Realtime client secret missing value",
        token,
      );

      return json(
        {
          success: false,

          error:
            "OpenAI did not return a speech recognition client secret.",

          code:
            "missing_client_secret",

          requestId,
        },
        502,
        headers,
      );
    }

    return json(
      {
        success: true,

        value,

        expiresAt:
          typeof token.expires_at ===
            "number"
            ? token.expires_at
            : null,

        requestId,
      },
      200,
      headers,
    );
  },
};