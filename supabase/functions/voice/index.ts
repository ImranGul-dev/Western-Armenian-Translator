import { createClient } from "npm:@supabase/supabase-js@2.95.0";

import { resolveAccount } from "../_shared/account.ts";
import {
  buildCorsHeaders,
  isOriginAllowed,
} from "../_shared/cors.ts";
import { getRuntimeConfig } from "../_shared/env.ts";
import { consumeRateLimit } from "../_shared/rate-limit.ts";
import {
  getClientFingerprintInput,
  isPublishableKeyAccepted,
  sha256Hex,
} from "../_shared/security.ts";
import {
  LANGUAGE_CODES,
  type AccountContext,
  type LanguageCode,
} from "../_shared/types.ts";

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const MAX_MULTIPART_REQUEST_BYTES =
  16 * 1024 * 1024;
const MAX_JSON_REQUEST_BYTES = 64 * 1024;
const MAX_SPEECH_CHARACTERS = 4_096;

const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  "flac",
  "m4a",
  "mp3",
  "mp4",
  "mpeg",
  "mpga",
  "ogg",
  "wav",
  "webm",
]);

interface VoiceFailure {
  code: string;
  message: string;
  status: number;
}

interface SpeakPayload {
  action: "speak";
  text: string;
  language: LanguageCode;
}

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

function isLanguageCode(
  value: unknown,
): value is LanguageCode {
  return (
    typeof value === "string" &&
    LANGUAGE_CODES.includes(
      value as LanguageCode,
    )
  );
}

function audioExtension(file: File): string {
  const name = file.name.toLowerCase();
  const dot = name.lastIndexOf(".");

  return dot >= 0 ? name.slice(dot + 1) : "";
}

function isSupportedAudio(file: File): boolean {
  const extension = audioExtension(file);

  return (
    SUPPORTED_AUDIO_EXTENSIONS.has(extension) &&
    file.type.toLowerCase().startsWith("audio/")
  );
}

function transcriptionLanguage(
  language: LanguageCode,
): string {
  return language === "en" ? "en" : "hy";
}

function speechInstructions(
  language: LanguageCode,
): string {
  if (language === "hyw") {
    return [
      "Speak clearly and naturally in Western Armenian.",
      "Use Western Armenian pronunciation.",
      "Read the supplied text exactly as written.",
      "Do not translate, summarize, or add commentary.",
    ].join(" ");
  }

  if (language === "hye") {
    return [
      "Speak clearly and naturally in Eastern Armenian.",
      "Use Eastern Armenian pronunciation.",
      "Read the supplied text exactly as written.",
      "Do not translate, summarize, or add commentary.",
    ].join(" ");
  }

  return [
    "Speak clearly and naturally in English.",
    "Read the supplied text exactly as written.",
    "Do not translate, summarize, or add commentary.",
  ].join(" ");
}

function voiceRateLimit(
  account: AccountContext,
): number {
  switch (account.plan.slug) {
    case "admin":
      return 30;

    case "business":
      return 20;

    case "premium":
      return 12;

    case "free":
      return 6;

    default:
      return 3;
  }
}

function friendlyOpenAIStatus(
  status: number,
): VoiceFailure {
  if (status === 429) {
    return {
      code: "voice_rate_limited",
      message:
        "The voice service is busy. Please wait a moment and try again.",
      status: 429,
    };
  }

  if (
    status === 400 ||
    status === 413 ||
    status === 415 ||
    status === 422
  ) {
    return {
      code: "voice_processing_failed",
      message:
        "The voice service could not process this audio or text.",
      status: 400,
    };
  }

  if (status === 401 || status === 403) {
    return {
      code: "voice_configuration_error",
      message:
        "The voice service is temporarily unavailable.",
      status: 503,
    };
  }

  return {
    code: "voice_service_unavailable",
    message:
      "The voice service is temporarily unavailable. Please try again.",
    status: 503,
  };
}

function friendlyUnexpectedError(
  error: unknown,
): VoiceFailure {
  if (
    error instanceof DOMException &&
    error.name === "AbortError"
  ) {
    return {
      code: "voice_timeout",
      message:
        "The voice request took too long. Please try again.",
      status: 504,
    };
  }

  return {
    code: "voice_service_unavailable",
    message:
      "The voice service is temporarily unavailable. Please try again.",
    status: 503,
  };
}

async function openAIFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  clientSignal: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();

  const abortFromClient = () => {
    controller.abort();
  };

  clientSignal.addEventListener(
    "abort",
    abortFromClient,
    { once: true },
  );

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);

    clientSignal.removeEventListener(
      "abort",
      abortFromClient,
    );
  }
}

async function recordSystemError(
  admin: ReturnType<typeof createClient>,
  requestId: string,
  failure: VoiceFailure,
) {
  try {
    await admin.from("system_errors").insert({
      request_id: requestId,
      error_code: failure.code,
      safe_message: failure.message,
      function_name: "voice",
    });
  } catch {
    // Logging failure must not expose private details
    // or replace the safe response.
  }
}

async function transcribeAudio(
  request: Request,
  config: ReturnType<typeof getRuntimeConfig>,
): Promise<
  | { success: true; text: string }
  | { success: false; failure: VoiceFailure }
> {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return {
      success: false,
      failure: {
        code: "invalid_voice_form",
        message:
          "The voice request could not be read.",
        status: 400,
      },
    };
  }

  const action = formData.get("action");
  const language = formData.get("language");
  const audio = formData.get("audio");

  if (action !== "transcribe") {
    return {
      success: false,
      failure: {
        code: "invalid_voice_action",
        message:
          "The voice request action is not valid.",
        status: 400,
      },
    };
  }

  if (!isLanguageCode(language)) {
    return {
      success: false,
      failure: {
        code: "invalid_voice_language",
        message:
          "The selected recording language is not supported.",
        status: 400,
      },
    };
  }

  if (!(audio instanceof File)) {
    return {
      success: false,
      failure: {
        code: "missing_audio",
        message:
          "No recorded audio was provided.",
        status: 400,
      },
    };
  }

  if (!audio.size) {
    return {
      success: false,
      failure: {
        code: "empty_audio",
        message:
          "The recording was empty. Please try again.",
        status: 400,
      },
    };
  }

  if (audio.size > MAX_AUDIO_BYTES) {
    return {
      success: false,
      failure: {
        code: "audio_too_large",
        message:
          "The recording is too large. Record a shorter message and try again.",
        status: 413,
      },
    };
  }

  if (!isSupportedAudio(audio)) {
    return {
      success: false,
      failure: {
        code: "unsupported_audio",
        message:
          "This browser produced an unsupported audio format.",
        status: 415,
      },
    };
  }

  const openAIForm = new FormData();

  openAIForm.append(
    "file",
    audio,
    audio.name || "recording.webm",
  );
  openAIForm.append(
    "model",
    config.openAiTranscriptionModel,
  );
  openAIForm.append("response_format", "json");
  openAIForm.append(
    "language",
    transcriptionLanguage(language),
  );

  try {
    const response = await openAIFetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openAiApiKey}`,
        },
        body: openAIForm,
      },
      config.openAiVoiceTimeoutMs,
      request.signal,
    );

    if (!response.ok) {
      return {
        success: false,
        failure: friendlyOpenAIStatus(
          response.status,
        ),
      };
    }

    let result: unknown;

    try {
      result = await response.json();
    } catch {
      return {
        success: false,
        failure: {
          code: "invalid_transcription_response",
          message:
            "The voice service returned an invalid transcription.",
          status: 502,
        },
      };
    }

    if (
      !result ||
      typeof result !== "object" ||
      !("text" in result) ||
      typeof result.text !== "string"
    ) {
      return {
        success: false,
        failure: {
          code: "invalid_transcription_response",
          message:
            "The voice service returned an invalid transcription.",
          status: 502,
        },
      };
    }

    const text = result.text.trim();

    if (!text) {
      return {
        success: false,
        failure: {
          code: "speech_not_recognized",
          message:
            "No speech was recognized. Please speak clearly and try again.",
          status: 422,
        },
      };
    }

    return {
      success: true,
      text,
    };
  } catch (error) {
    return {
      success: false,
      failure: friendlyUnexpectedError(error),
    };
  }
}

function validateSpeakPayload(
  raw: unknown,
): SpeakPayload | VoiceFailure {
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw)
  ) {
    return {
      code: "invalid_voice_request",
      message:
        "The translated-audio request is not valid.",
      status: 400,
    };
  }

  const payload = raw as Record<string, unknown>;

  if (payload.action !== "speak") {
    return {
      code: "invalid_voice_action",
      message:
        "The voice request action is not valid.",
      status: 400,
    };
  }

  if (
    typeof payload.text !== "string" ||
    !payload.text.trim()
  ) {
    return {
      code: "missing_speech_text",
      message:
        "There is no translated text to read aloud.",
      status: 400,
    };
  }

  if (!isLanguageCode(payload.language)) {
    return {
      code: "invalid_voice_language",
      message:
        "The selected speech language is not supported.",
      status: 400,
    };
  }

  return {
    action: "speak",
    text: payload.text.trim(),
    language: payload.language,
  };
}

async function generateSpeech(
  request: Request,
  config: ReturnType<typeof getRuntimeConfig>,
  payload: SpeakPayload,
): Promise<
  | { success: true; audio: ArrayBuffer }
  | { success: false; failure: VoiceFailure }
> {
  try {
    const response = await openAIFetch(
      "https://api.openai.com/v1/audio/speech",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openAiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.openAiSpeechModel,
          voice: config.openAiSpeechVoice,
          input: payload.text,
          instructions: speechInstructions(
            payload.language,
          ),
          response_format: "mp3",
          speed: config.openAiSpeechSpeed,
        }),
      },
      config.openAiVoiceTimeoutMs,
      request.signal,
    );

    if (!response.ok) {
      return {
        success: false,
        failure: friendlyOpenAIStatus(
          response.status,
        ),
      };
    }

    const audio = await response.arrayBuffer();

    if (!audio.byteLength) {
      return {
        success: false,
        failure: {
          code: "empty_speech_response",
          message:
            "The voice service returned empty audio.",
          status: 502,
        },
      };
    }

    return {
      success: true,
      audio,
    };
  } catch (error) {
    return {
      success: false,
      failure: friendlyUnexpectedError(error),
    };
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const requestId = crypto.randomUUID();
    const config = getRuntimeConfig();
    const origin = request.headers.get("origin");
    const cors = buildCorsHeaders(origin);

    const baseHeaders = {
      ...cors,
      "X-Request-Id": requestId,
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
        {
          "Cache-Control": "no-store",
          "X-Request-Id": requestId,
        },
      );
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: baseHeaders,
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
          ...baseHeaders,
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
        baseHeaders,
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
            "The voice backend is missing required environment variables.",
          requestId,
        },
        500,
        baseHeaders,
      );
    }

    const contentType = (
      request.headers.get("content-type") || ""
    ).toLowerCase();

    const contentLength = Number.parseInt(
      request.headers.get("content-length") ||
        "0",
      10,
    );

    const isMultipart =
      contentType.includes(
        "multipart/form-data",
      );

    const isJson =
      contentType.includes("application/json");

    if (!isMultipart && !isJson) {
      return json(
        {
          success: false,
          error:
            "Send recordings as form data or speech requests as JSON.",
          requestId,
        },
        415,
        baseHeaders,
      );
    }

    const requestLimit = isMultipart
      ? MAX_MULTIPART_REQUEST_BYTES
      : MAX_JSON_REQUEST_BYTES;

    if (
      Number.isFinite(contentLength) &&
      contentLength > requestLimit
    ) {
      return json(
        {
          success: false,
          error:
            "The voice request is too large.",
          requestId,
        },
        413,
        baseHeaders,
      );
    }

    const anonymousId = (
      request.headers.get("x-client-id") ||
      "anonymous"
    ).slice(0, 160);

    const clientHash = await sha256Hex(
      `${config.rateLimitSalt}|${getClientFingerprintInput(
        request,
        anonymousId,
      )}`,
    );

    const admin = createClient(
      config.supabaseUrl,
      config.adminKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const account = await resolveAccount(
      admin,
      request,
      clientHash,
    );

    const rateLimit = voiceRateLimit(account);

    const rateIdentifier =
      await sha256Hex(
        account.userId
          ? `${config.rateLimitSalt}|voice|${account.identityKey}`
          : `${config.rateLimitSalt}|voice|${clientHash}`,
      );

    let rate;

    try {
      rate = await consumeRateLimit(
        admin,
        rateIdentifier,
        rateLimit,
        60,
      );
    } catch {
      return json(
        {
          success: false,
          error:
            "The voice service is temporarily unavailable. Please try again.",
          requestId,
        },
        503,
        baseHeaders,
      );
    }

    const rateHeaders = {
      ...baseHeaders,
      "X-RateLimit-Limit": String(rateLimit),
      "X-RateLimit-Remaining": String(
        rate.remaining,
      ),
      "X-RateLimit-Reset": rate.resetAt,
    };

    if (!rate.allowed) {
      return json(
        {
          success: false,
          error:
            "Too many voice requests. Please wait a moment and try again.",
          code: "rate_limit",
          requestId,
        },
        429,
        {
          ...rateHeaders,
          "Retry-After": "60",
        },
      );
    }

    if (isMultipart) {
      const result = await transcribeAudio(
        request,
        config,
      );

      if (!result.success) {
        await recordSystemError(
          admin,
          requestId,
          result.failure,
        );

        return json(
          {
            success: false,
            error: result.failure.message,
            code: result.failure.code,
            requestId,
          },
          result.failure.status,
          rateHeaders,
        );
      }

      return json(
        {
          success: true,
          text: result.text,
          requestId,
        },
        200,
        rateHeaders,
      );
    }

    let raw: unknown;

    try {
      raw = await request.json();
    } catch {
      return json(
        {
          success: false,
          error:
            "The request contains invalid JSON.",
          requestId,
        },
        400,
        rateHeaders,
      );
    }

    const payload =
      validateSpeakPayload(raw);

    if ("code" in payload) {
      return json(
        {
          success: false,
          error: payload.message,
          code: payload.code,
          requestId,
        },
        payload.status,
        rateHeaders,
      );
    }

    const speechCharacterLimit = Math.min(
      MAX_SPEECH_CHARACTERS,
      account.plan.maxCharactersPerRequest,
    );

    if (
      Array.from(payload.text).length >
      speechCharacterLimit
    ) {
      return json(
        {
          success: false,
          error: `Translated audio is limited to ${speechCharacterLimit.toLocaleString()} characters on your current plan.`,
          code: "speech_text_too_long",
          upgradeRecommended:
            account.plan.slug !== "business" &&
            account.plan.slug !== "admin",
          requestId,
        },
        413,
        rateHeaders,
      );
    }

    const result = await generateSpeech(
      request,
      config,
      payload,
    );

    if (!result.success) {
      await recordSystemError(
        admin,
        requestId,
        result.failure,
      );

      return json(
        {
          success: false,
          error: result.failure.message,
          code: result.failure.code,
          requestId,
        },
        result.failure.status,
        rateHeaders,
      );
    }

    return new Response(result.audio, {
      status: 200,
      headers: {
        ...rateHeaders,
        "Content-Type": "audio/mpeg",
        "Content-Disposition":
          'inline; filename="translation.mp3"',
        "Content-Length": String(
          result.audio.byteLength,
        ),
      },
    });
  },
};