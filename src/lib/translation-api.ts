import type {
  TranslationRequest,
  TranslationResponse,
  TranslationSuccessResponse,
} from "@/types/translation";

import { getSupabaseConfig } from "@/lib/supabase/client";

const CLIENT_ID_STORAGE_KEY =
  "wat-anonymous-client-id";

type StreamStartMessage = {
  type: "start";
  requestId?: string;
};

type StreamDeltaMessage = {
  type: "delta";
  delta?: string;
};

type StreamCompleteMessage = {
  type: "complete";
  success: true;
  translation: string;
  sourceLanguage: TranslationSuccessResponse["sourceLanguage"];
  targetLanguage: TranslationSuccessResponse["targetLanguage"];
  characterCount: number;
  requestId: string;
  historySaved?: boolean;
  usage?: TranslationSuccessResponse["usage"];
};

type StreamErrorMessage = {
  type: "error";
  success: false;
  status?: number;
  error?: string;
  code?: string;
  requestId?: string;
  upgradeRecommended?: boolean;
};

type StreamMessage =
  | StreamStartMessage
  | StreamDeltaMessage
  | StreamCompleteMessage
  | StreamErrorMessage;

export type TranslationProgressHandler = (
  translation: string,
) => void;

function createClientId(): string {
  return typeof crypto !== "undefined" &&
    crypto.randomUUID
    ? crypto.randomUUID()
    : `client-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;
}

function getClientId(): string {
  if (typeof window === "undefined") {
    return createClientId();
  }

  try {
    const existing =
      localStorage.getItem(
        CLIENT_ID_STORAGE_KEY,
      );

    if (existing) {
      return existing;
    }

    const id =
      createClientId();

    localStorage.setItem(
      CLIENT_ID_STORAGE_KEY,
      id,
    );

    return id;
  } catch {
    return createClientId();
  }
}

function getFunctionUrl(): string {
  const explicit =
    process.env
      .NEXT_PUBLIC_TRANSLATION_FUNCTION_URL
      ?.trim();

  if (explicit) {
    return explicit.replace(
      /\/+$/u,
      "",
    );
  }

  const { url } =
    getSupabaseConfig();

  if (!url) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL to .env.local.",
    );
  }

  return `${url}/functions/v1/translate`;
}

function translationError(
  message: string,
  values?: {
    code?: string;
    upgradeRecommended?: boolean;
  },
): Error & {
  code?: string;
  upgradeRecommended?: boolean;
} {
  const error =
    new Error(message) as Error & {
      code?: string;
      upgradeRecommended?: boolean;
    };

  error.code =
    values?.code;

  error.upgradeRecommended =
    values?.upgradeRecommended;

  return error;
}

async function readJsonResponse(
  response: Response,
): Promise<TranslationSuccessResponse> {
  let data: TranslationResponse;

  try {
    data =
      (await response.json()) as TranslationResponse;
  } catch {
    throw new Error(
      "The translation service returned an invalid response.",
    );
  }

  if (
    !response.ok ||
    !data.success
  ) {
    const message =
      data.success
        ? "Translation failed. Please try again."
        : data.error;

    throw translationError(
      message,
      !data.success
        ? {
            code:
              data.code,

            upgradeRecommended:
              data.upgradeRecommended,
          }
        : undefined,
    );
  }

  return data;
}

function parseStreamMessage(
  line: string,
): StreamMessage {
  try {
    return JSON.parse(
      line,
    ) as StreamMessage;
  } catch {
    throw new Error(
      "The translation service returned an invalid streaming response.",
    );
  }
}

async function readStreamingResponse(
  response: Response,
  signal: AbortSignal,
  onProgress?: TranslationProgressHandler,
): Promise<TranslationSuccessResponse> {
  if (!response.body) {
    throw new Error(
      "The translation service did not return a response stream.",
    );
  }

  const reader =
    response.body.getReader();

  const decoder =
    new TextDecoder();

  let buffer = "";
  let translation = "";
  let completed:
    | TranslationSuccessResponse
    | null = null;

  try {
    while (true) {
      if (signal.aborted) {
        await reader.cancel();

        throw new DOMException(
          "Translation request was cancelled.",
          "AbortError",
        );
      }

      const {
        done,
        value,
      } = await reader.read();

      if (done) {
        break;
      }

      buffer +=
        decoder.decode(
          value,
          {
            stream: true,
          },
        );

      const lines =
        buffer.split("\n");

      /*
       * The last item may be only part of a JSON line.
       * Keep it for the next network chunk.
       */
      buffer =
        lines.pop() ?? "";

      for (
        const rawLine of lines
      ) {
        const line =
          rawLine.trim();

        if (!line) {
          continue;
        }

        const message =
          parseStreamMessage(
            line,
          );

        if (
          message.type ===
          "start"
        ) {
          continue;
        }

        if (
          message.type ===
          "delta"
        ) {
          if (
            typeof message.delta ===
              "string" &&
            message.delta
          ) {
            translation +=
              message.delta;

            onProgress?.(
              translation,
            );
          }

          continue;
        }

        if (
          message.type ===
          "error"
        ) {
          throw translationError(
            message.error ||
              "Translation failed. Please try again.",
            {
              code:
                message.code,

              upgradeRecommended:
                message.upgradeRecommended,
            },
          );
        }

        if (
          message.type ===
          "complete"
        ) {
          /*
           * Use the backend's canonical final translation.
           * The locally accumulated deltas are only used for
           * progressive display.
           */
          completed = {
            success: true,

            translation:
              message.translation,

            sourceLanguage:
              message.sourceLanguage,

            targetLanguage:
              message.targetLanguage,

            characterCount:
              message.characterCount,

            requestId:
              message.requestId,

            historySaved:
              message.historySaved,

            usage:
              message.usage,
          };

          /*
           * Ensure the final rendered value exactly matches
           * the backend's completed translation.
           */
          onProgress?.(
            message.translation,
          );
        }
      }
    }

    /*
     * Flush any remaining decoded UTF-8 data.
     */
    buffer +=
      decoder.decode();

    const remaining =
      buffer.trim();

    if (
      remaining &&
      !completed
    ) {
      const message =
        parseStreamMessage(
          remaining,
        );

      if (
        message.type ===
        "error"
      ) {
        throw translationError(
          message.error ||
            "Translation failed. Please try again.",
          {
            code:
              message.code,

            upgradeRecommended:
              message.upgradeRecommended,
          },
        );
      }

      if (
        message.type ===
        "delta" &&
        message.delta
      ) {
        translation +=
          message.delta;

        onProgress?.(
          translation,
        );
      }

      if (
        message.type ===
        "complete"
      ) {
        completed = {
          success: true,

          translation:
            message.translation,

          sourceLanguage:
            message.sourceLanguage,

          targetLanguage:
            message.targetLanguage,

          characterCount:
            message.characterCount,

          requestId:
            message.requestId,

          historySaved:
            message.historySaved,

          usage:
            message.usage,
        };

        onProgress?.(
          message.translation,
        );
      }
    }

    if (!completed) {
      throw new Error(
        "The translation stream ended before the translation was completed.",
      );
    }

    return completed;
  } finally {
    reader.releaseLock();
  }
}

export async function requestTranslation(
  payload: TranslationRequest,
  signal: AbortSignal,
  accessToken?: string | null,
  onProgress?: TranslationProgressHandler,
): Promise<TranslationSuccessResponse> {
  const { key } =
    getSupabaseConfig();

  if (!key) {
    throw new Error(
      "Supabase is not configured. Add the publishable key to .env.local.",
    );
  }

  const headers: Record<
    string,
    string
  > = {
    "Content-Type":
      "application/json",

    apikey:
      key,

    "x-client-id":
      getClientId(),
  };

  if (accessToken) {
    headers.Authorization =
      `Bearer ${accessToken}`;
  }

  const response =
    await fetch(
      getFunctionUrl(),
      {
        method: "POST",

        headers,

        body:
          JSON.stringify(
            payload,
          ),

        cache:
          "no-store",

        signal,
      },
    );

  const contentType =
    (
      response.headers.get(
        "content-type",
      ) || ""
    ).toLowerCase();

  /*
   * Validation/quota/rate-limit errors are returned by the
   * Edge Function as ordinary JSON before streaming begins.
   */
  if (!response.ok) {
    return readJsonResponse(
      response,
    );
  }

  /*
   * Backward compatibility:
   *
   * If the old non-streaming Edge Function is still deployed,
   * continue supporting its normal JSON response.
   */
  if (
    contentType.includes(
      "application/json",
    )
  ) {
    return readJsonResponse(
      response,
    );
  }

  /*
   * New realtime translation path.
   */
  if (
    contentType.includes(
      "application/x-ndjson",
    )
  ) {
    return readStreamingResponse(
      response,
      signal,
      onProgress,
    );
  }

  throw new Error(
    "The translation service returned an unsupported response format.",
  );
}