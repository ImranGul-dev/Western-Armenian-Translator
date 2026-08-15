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

const ALLOWED_SPEEDS = new Set([
  0.75,
  1,
  1.25,
  1.5,
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
          Allow:
            "POST, OPTIONS",
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

    const requestedSpeed =
      typeof values.speed ===
        "number"
        ? values.speed
        : 1;

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

    const speed =
      ALLOWED_SPEEDS.has(
        requestedSpeed,
      )
        ? requestedSpeed
        : 1;

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
                  "Speak clearly and naturally. The supplied text may be Western Armenian. Preserve the supplied words exactly. Do not translate, rewrite, add, remove, or explain anything. Use careful Armenian pronunciation and natural conversational pacing.",

                response_format:
                  "wav",

                stream_format:
                  "audio",

                speed,
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
      try {
        const upstreamError =
          await openAiResponse.text();

        console.error(
          "OpenAI TTS error",
          upstreamError,
        );
      } catch {
        // Ignore logging failure.
      }

      return json(
        {
          success: false,
          error:
            "Voice generation failed. Please try again.",
          requestId,
        },
        openAiResponse.status >= 400 &&
          openAiResponse.status < 600
          ? openAiResponse.status
          : 502,
        baseHeaders,
      );
    }

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

          "X-Voice-Speed":
            String(speed),

          "X-Content-Type-Options":
            "nosniff",
        },
      },
    );
  },
};