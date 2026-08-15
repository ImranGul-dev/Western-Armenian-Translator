import {
  buildCorsHeaders,
  isOriginAllowed,
} from "../_shared/cors.ts";

import {
  getRuntimeConfig,
} from "../_shared/env.ts";

const MAX_TTS_CHARACTERS = 4000;

const ALLOWED_VOICES = new Set([
  "marin",
  "cedar",
]);

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

function isAllowedPublishableKey(
  suppliedKey: string | null,
  acceptedKeys: Set<string>,
) {
  if (
    !suppliedKey ||
    acceptedKeys.size === 0
  ) {
    return false;
  }

  return acceptedKeys.has(
    suppliedKey.trim(),
  );
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
            "This website origin is not allowed to use the voice service.",

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
          Allow: "POST, OPTIONS",
        },
      );
    }

    if (
      !isAllowedPublishableKey(
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
      !config.openAiApiKey
    ) {
      return json(
        {
          success: false,

          error:
            "The voice backend is missing the OpenAI API key.",

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

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return json(
        {
          success: false,

          error:
            "The voice request is invalid.",

          requestId,
        },
        400,
        baseHeaders,
      );
    }

    const values =
      body as Record<
        string,
        unknown
      >;

    const text =
      typeof values.text ===
        "string"
        ? values.text.trim()
        : "";

    const requestedVoice =
      typeof values.voice ===
        "string"
        ? values.voice
        : "marin";

    if (!text) {
      return json(
        {
          success: false,

          error:
            "Text is required.",

          requestId,
        },
        400,
        baseHeaders,
      );
    }

    if (
      text.length >
      MAX_TTS_CHARACTERS
    ) {
      return json(
        {
          success: false,

          error:
            `Voice playback currently supports up to ${MAX_TTS_CHARACTERS.toLocaleString()} characters at a time.`,

          requestId,
        },
        413,
        baseHeaders,
      );
    }

    const voice =
      ALLOWED_VOICES.has(
        requestedVoice,
      )
        ? requestedVoice
        : "marin";

    let openAiResponse:
      Response;

    try {
      openAiResponse =
        await fetch(
          "https://api.openai.com/v1/audio/speech",
          {
            method: "POST",

            headers: {
              Authorization:
                `Bearer ${config.openAiApiKey}`,

              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                model:
                  "gpt-4o-mini-tts",

                voice,

                input:
                  text,

                instructions:
                  "Speak clearly and naturally. The supplied text may be Western Armenian. Preserve the supplied words exactly. Do not translate, rewrite, add, remove, or explain anything. Use natural, careful pronunciation and a comfortable conversational speaking speed.",

                response_format:
                  "wav",

                stream_format:
                  "audio",

                speed:
                  1.0,
              }),

            signal:
              request.signal,
          },
        );
    } catch (error) {
      console.error(
        "OpenAI TTS request failed",
        error,
      );

      return json(
        {
          success: false,

          error:
            "Voice generation is temporarily unavailable. Please try again.",

          requestId,
        },
        503,
        baseHeaders,
      );
    }

    if (
      !openAiResponse.ok ||
      !openAiResponse.body
    ) {
      let detail =
        "OpenAI voice generation failed.";

      try {
        const errorBody =
          await openAiResponse.json();

        if (
          errorBody &&
          typeof errorBody ===
            "object"
        ) {
          const record =
            errorBody as Record<
              string,
              unknown
            >;

          const errorRecord =
            record.error &&
            typeof record.error ===
              "object"
              ? record.error as Record<
                  string,
                  unknown
                >
              : null;

          if (
            errorRecord &&
            typeof errorRecord.message ===
              "string"
          ) {
            console.error(
              "OpenAI TTS error",
              errorRecord.message,
            );
          }
        }
      } catch {
        // Do not expose upstream details to the browser.
      }

      return json(
        {
          success: false,
          error: detail,
          requestId,
        },
        openAiResponse.status >=
          400 &&
        openAiResponse.status <
          600
          ? openAiResponse.status
          : 502,
        baseHeaders,
      );
    }

    /*
     * Important:
     *
     * We do not buffer the generated audio here.
     * The OpenAI response stream is passed directly
     * through the Supabase Edge Function.
     */
    return new Response(
      openAiResponse.body,
      {
        status: 200,

        headers: {
          ...baseHeaders,

          "Content-Type":
            "audio/wav",

          "X-Voice":
            voice,

          "X-Content-Type-Options":
            "nosniff",
        },
      },
    );
  },
};