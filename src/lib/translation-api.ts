import type {
  GuestUsage,
  TranslationRequest,
  TranslationResponse,
  TranslationSuccessResponse,
} from "@/types/translation";

import { getSupabaseConfig } from "@/lib/supabase/client";

export type { GuestUsage } from "@/types/translation";

const CLIENT_ID_STORAGE_KEY = "wat-anonymous-client-id";

export type TranslationSuccessWithGuestUsage =
  TranslationSuccessResponse;

interface StreamStartMessage {
  type: "start";
  requestId?: string;
}

interface StreamDeltaMessage {
  type: "delta";
  delta?: string;
}

interface StreamCompleteMessage {
  type: "complete";
  success: true;
  translation: string;
  sourceLanguage: TranslationSuccessResponse["sourceLanguage"];
  targetLanguage: TranslationSuccessResponse["targetLanguage"];
  characterCount: number;
  requestId: string;
  historySaved?: boolean;
  usage?: TranslationSuccessResponse["usage"];
  guestUsage?: GuestUsage | null;
}

interface StreamErrorMessage {
  type: "error";
  success: false;
  status?: number;
  error?: string;
  code?: string;
  requestId?: string;
  upgradeRecommended?: boolean;
  guestUsage?: GuestUsage;
}

type StreamMessage =
  | StreamStartMessage
  | StreamDeltaMessage
  | StreamCompleteMessage
  | StreamErrorMessage;

export type TranslationProgressHandler = (
  translation: string,
) => void;

export type TranslationApiError = Error & {
  code?: string;
  upgradeRecommended?: boolean;
  guestUsage?: GuestUsage;
};

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

    const id = createClientId();

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
    guestUsage?: GuestUsage;
  },
): TranslationApiError {
  const error =
    new Error(
      message,
    ) as TranslationApiError;

  error.code =
    values?.code;

  error.upgradeRecommended =
    values?.upgradeRecommended;

  error.guestUsage =
    values?.guestUsage;

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
    if (data.success) {
      throw translationError(
        "Translation failed. Please try again.",
      );
    }

    throw translationError(
      data.error,
      {
        code:
          data.code,

        upgradeRecommended:
          data.upgradeRecommended,

        guestUsage:
          data.guestUsage,
      },
    );
  }

  return data;
}

function parseStreamMessage(
  value: string,
): StreamMessage {
  try {
    return JSON.parse(
      value,
    ) as StreamMessage;
  } catch {
    throw new Error(
      "The translation service returned an invalid streaming response.",
    );
  }
}

function completeResponse(
  message: StreamCompleteMessage,
): TranslationSuccessResponse {
  return {
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

    guestUsage:
      message.guestUsage,
  };
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

  const contentType =
    (
      response.headers.get(
        "content-type",
      ) || ""
    ).toLowerCase();

  const isSse =
    contentType.includes(
      "text/event-stream",
    );

  let buffer = "";
  let translation = "";

  let completed:
    TranslationSuccessResponse | null =
      null;

  let lastProgressAt = 0;

  /*
   * Show the first streamed output
   * immediately, then limit UI updates
   * slightly so React does not rerender
   * for every tiny model token.
   */
  const emitProgress = (
    value: string,
    force = false,
  ) => {
    if (!onProgress) {
      return;
    }

    const now =
      typeof performance !==
      "undefined"
        ? performance.now()
        : Date.now();

    if (
      force ||
      lastProgressAt === 0 ||
      now - lastProgressAt >= 24
    ) {
      lastProgressAt = now;

      onProgress(value);
    }
  };

  const handleMessage = (
    message: StreamMessage,
  ) => {
    if (
      message.type === "delta" &&
      message.delta
    ) {
      translation +=
        message.delta;

      emitProgress(
        translation,
      );

      return;
    }

    if (
      message.type === "error"
    ) {
      throw translationError(
        message.error ||
          "Translation failed. Please try again.",
        {
          code:
            message.code,

          upgradeRecommended:
            message.upgradeRecommended,

          guestUsage:
            message.guestUsage,
        },
      );
    }

    if (
      message.type === "complete"
    ) {
      completed =
        completeResponse(
          message,
        );

      emitProgress(
        message.translation,
        true,
      );
    }
  };

  const processSseFrame = (
    frame: string,
  ) => {
    if (!frame.trim()) {
      return;
    }

    const data =
      frame
        .split("\n")
        .filter(
          (line) =>
            line.startsWith(
              "data:",
            ),
        )
        .map(
          (line) =>
            line
              .slice(5)
              .trimStart(),
        )
        .join("\n")
        .trim();

    if (data) {
      handleMessage(
        parseStreamMessage(
          data,
        ),
      );
    }
  };

  const consumeSseFrames = (
    final = false,
  ) => {
    const normalized =
      buffer.replace(
        /\r\n/gu,
        "\n",
      );

    const frames =
      normalized.split(
        "\n\n",
      );

    if (final) {
      buffer = "";
    } else {
      buffer =
        frames.pop() ??
        "";
    }

    for (
      const frame of frames
    ) {
      processSseFrame(
        frame,
      );
    }
  };

  const consumeNdjson = (
    final = false,
  ) => {
    const normalized =
      buffer.replace(
        /\r\n/gu,
        "\n",
      );

    const lines =
      normalized.split("\n");

    if (final) {
      buffer = "";
    } else {
      buffer =
        lines.pop() ??
        "";
    }

    for (
      const rawLine of lines
    ) {
      const line =
        rawLine.trim();

      if (line) {
        handleMessage(
          parseStreamMessage(
            line,
          ),
        );
      }
    }
  };

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

      if (isSse) {
        consumeSseFrames();
      } else {
        consumeNdjson();
      }
    }

    buffer +=
      decoder.decode();

    if (isSse) {
      consumeSseFrames(
        true,
      );
    } else {
      consumeNdjson(
        true,
      );
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

  const headers:
    Record<string, string> = {
      "Content-Type":
        "application/json",

      Accept:
        "text/event-stream, application/x-ndjson, application/json",

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
        method:
          "POST",

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

  if (
    !response.ok ||
    contentType.includes(
      "application/json",
    )
  ) {
    return readJsonResponse(
      response,
    );
  }

  if (
    contentType.includes(
      "text/event-stream",
    ) ||
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