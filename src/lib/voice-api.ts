import type { LanguageCode } from "@/lib/languages";
import { getSupabaseConfig } from "@/lib/supabase/client";

const CLIENT_ID_STORAGE_KEY = "wat-anonymous-client-id";
const MAX_AUDIO_FILE_SIZE_BYTES = 15 * 1024 * 1024;

interface SpeechTranscriptionRequest {
  audio: Blob;
  language: LanguageCode;
}

interface SpeechTranscriptionResponse {
  text: string;
}

interface SpeechAudioRequest {
  text: string;
  language: LanguageCode;
}

interface VoiceErrorResponse {
  success?: false;
  error?: string;
  code?: string;
  upgradeRecommended?: boolean;
}

type VoiceRequestError = Error & {
  code?: string;
  upgradeRecommended?: boolean;
};

function createClientId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `client-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function getClientId(): string {
  if (typeof window === "undefined") {
    return createClientId();
  }

  try {
    const existing = localStorage.getItem(
      CLIENT_ID_STORAGE_KEY,
    );

    if (existing) {
      return existing;
    }

    const id = createClientId();

    localStorage.setItem(CLIENT_ID_STORAGE_KEY, id);

    return id;
  } catch {
    return createClientId();
  }
}

function getVoiceFunctionUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_VOICE_FUNCTION_URL?.trim();

  if (explicit) {
    return explicit.replace(/\/+$/u, "");
  }

  const { url } = getSupabaseConfig();

  if (!url) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL to .env.local.",
    );
  }

  return `${url}/functions/v1/voice`;
}

function getRequestHeaders(
  accessToken?: string | null,
): Record<string, string> {
  const { key } = getSupabaseConfig();

  if (!key) {
    throw new Error(
      "Supabase is not configured. Add the publishable key to .env.local.",
    );
  }

  const headers: Record<string, string> = {
    apikey: key,
    "x-client-id": getClientId(),
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

async function parseVoiceError(
  response: Response,
  fallbackMessage: string,
): Promise<VoiceRequestError> {
  let payload: VoiceErrorResponse | null = null;

  try {
    payload =
      (await response.json()) as VoiceErrorResponse;
  } catch {
    payload = null;
  }

  const error = new Error(
    payload?.error || fallbackMessage,
  ) as VoiceRequestError;

  if (payload?.code) {
    error.code = payload.code;
  }

  if (payload?.upgradeRecommended) {
    error.upgradeRecommended = true;
  }

  return error;
}

function getAudioFilename(audio: Blob): string {
  const mimeType = audio.type.toLowerCase();

  if (mimeType.includes("mp4")) {
    return "recording.mp4";
  }

  if (mimeType.includes("mpeg")) {
    return "recording.mp3";
  }

  if (mimeType.includes("ogg")) {
    return "recording.ogg";
  }

  if (mimeType.includes("wav")) {
    return "recording.wav";
  }

  return "recording.webm";
}

export async function requestSpeechTranscription(
  payload: SpeechTranscriptionRequest,
  signal: AbortSignal,
  accessToken?: string | null,
): Promise<SpeechTranscriptionResponse> {
  if (!payload.audio.size) {
    throw new Error(
      "No recorded audio was provided.",
    );
  }

  if (
    payload.audio.size >
    MAX_AUDIO_FILE_SIZE_BYTES
  ) {
    throw new Error(
      "The recording is too large. Record a shorter message and try again.",
    );
  }

  const formData = new FormData();

  formData.append("action", "transcribe");
  formData.append("language", payload.language);
  formData.append(
    "audio",
    payload.audio,
    getAudioFilename(payload.audio),
  );

  const response = await fetch(
    getVoiceFunctionUrl(),
    {
      method: "POST",
      headers: getRequestHeaders(accessToken),
      body: formData,
      cache: "no-store",
      signal,
    },
  );

  if (!response.ok) {
    throw await parseVoiceError(
      response,
      "Speech could not be converted to text.",
    );
  }

  let data: unknown;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The voice service returned an invalid transcription response.",
    );
  }

  if (
    !data ||
    typeof data !== "object" ||
    !("text" in data) ||
    typeof data.text !== "string"
  ) {
    throw new Error(
      "The voice service returned an invalid transcription response.",
    );
  }

  return {
    text: data.text,
  };
}

export async function requestSpeechAudio(
  payload: SpeechAudioRequest,
  signal: AbortSignal,
  accessToken?: string | null,
): Promise<Blob> {
  const text = payload.text.trim();

  if (!text) {
    throw new Error(
      "There is no translated text to read aloud.",
    );
  }

  const response = await fetch(
    getVoiceFunctionUrl(),
    {
      method: "POST",
      headers: {
        ...getRequestHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "speak",
        text,
        language: payload.language,
      }),
      cache: "no-store",
      signal,
    },
  );

  if (!response.ok) {
    throw await parseVoiceError(
      response,
      "Translated audio could not be generated.",
    );
  }

  const contentType =
    response.headers.get("content-type") || "";

  if (!contentType.toLowerCase().startsWith("audio/")) {
    throw new Error(
      "The voice service returned an invalid audio response.",
    );
  }

  const audio = await response.blob();

  if (!audio.size) {
    throw new Error(
      "The voice service returned an empty audio response.",
    );
  }

  return audio;
}