"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { StatusMessage } from "@/components/StatusMessage";
import { SwapLanguagesButton } from "@/components/SwapLanguagesButton";
import { TranslationFeedback } from "@/components/TranslationFeedback";
import { TranslationPanel } from "@/components/TranslationPanel";
import { UsageMeter } from "@/components/UsageMeter";
import { useAuth } from "@/contexts/AuthContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  canSwapLanguages,
  getSourcesForTarget,
  getTargetsForSource,
  type LanguageCode,
} from "@/lib/languages";
import {
  FALLBACK_PUBLIC_TRANSLATION_SETTINGS,
  maxCharactersFor,
  type PublicTranslationSettings,
} from "@/lib/plans";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { requestTranslation } from "@/lib/translation-api";
import {
  requestSpeechAudio,
  requestSpeechTranscription,
} from "@/lib/voice-api";
import { countMeaningfulCharacters } from "@/lib/validation";
import type { UsageSummary } from "@/types/database";

const MAX_RECORDING_DURATION_MS = 60_000;

function requestSignature(
  text: string,
  source: LanguageCode,
  target: LanguageCode,
) {
  return `${source}\0${target}\0${text}`;
}

function getSupportedRecordingMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return undefined;
  }

  const preferredTypes = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];

  return preferredTypes.find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

export function Translator() {
  const { session, profile, plan } = useAuth();

  const [sourceLanguage, setSourceLanguage] =
    useState<LanguageCode>("en");
  const [targetLanguage, setTargetLanguage] =
    useState<LanguageCode>("hyw");
  const [sourceText, setSourceText] = useState("");
  const [translation, setTranslation] = useState("");
  const [requestId, setRequestId] = useState("");
  const [usage, setUsage] = useState<UsageSummary | null>(
    null,
  );
  const [publicSettings, setPublicSettings] =
    useState<PublicTranslationSettings>(
      FALLBACK_PUBLIC_TRANSLATION_SETTINGS,
    );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [upgrade, setUpgrade] = useState(false);

  const [voiceInputSupported, setVoiceInputSupported] =
    useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] =
    useState(false);
  const [isSpeechLoading, setIsSpeechLoading] =
    useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const debouncedText = useDebouncedValue(sourceText, 700);

  const abortRef = useRef<AbortController | null>(null);
  const transcriptionAbortRef =
    useRef<AbortController | null>(null);
  const speechAbortRef =
    useRef<AbortController | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(
    null,
  );
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const seq = useRef(0);
  const last = useRef("");

  const maxCharacters = maxCharactersFor(
    plan,
    profile?.role,
    publicSettings.anonymous.max_characters_per_request,
  );

  useEffect(() => {
    const supported =
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== "undefined";

    setVoiceInputSupported(supported);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    void supabase
      .rpc("get_public_translation_settings")
      .then(({ data }) => {
        if (data && typeof data === "object") {
          setPublicSettings(
            data as PublicTranslationSettings,
          );
        }
      });
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("wat-prefill");

      if (raw) {
        const parsed = JSON.parse(raw) as {
          text?: string;
          source?: LanguageCode;
          target?: LanguageCode;
        };

        if (parsed.text) {
          setSourceText(parsed.text);

          if (parsed.source) {
            setSourceLanguage(parsed.source);
          }

          if (parsed.target) {
            setTargetLanguage(parsed.target);
          }
        }

        localStorage.removeItem("wat-prefill");
      }
    } catch {
      // Invalid local prefill data is safely ignored.
    }
  }, []);

  const cleanupRecordingStream = useCallback(() => {
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

    mediaStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });

    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  const cleanupAudio = useCallback(() => {
    const audio = audioRef.current;

    if (audio) {
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
      audio.src = "";
    }

    audioRef.current = null;

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    setIsSpeaking(false);
    setIsSpeechLoading(false);
  }, []);

  const stopSpeech = useCallback(() => {
    speechAbortRef.current?.abort();
    speechAbortRef.current = null;
    cleanupAudio();
  }, [cleanupAudio]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    seq.current += 1;
    setLoading(false);
  }, []);

  const translate = useCallback(
    async (text: string, force = false) => {
      if (
        !text.trim() ||
        countMeaningfulCharacters(text) < 2
      ) {
        cancel();
        setError("");

        if (!text.trim()) {
          setTranslation("");
          setRequestId("");
          stopSpeech();
        }

        return;
      }

      if (Array.from(text).length > maxCharacters) {
        setError(
          `This text is longer than your current plan allows (${maxCharacters.toLocaleString()} characters).`,
        );
        setUpgrade(true);
        return;
      }

      const signature = requestSignature(
        text,
        sourceLanguage,
        targetLanguage,
      );

      if (!force && signature === last.current) {
        return;
      }

      stopSpeech();
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;

      const current = ++seq.current;

      setLoading(true);
      setError("");
      setUpgrade(false);

      try {
        const data = await requestTranslation(
          {
            text,
            sourceLanguage,
            targetLanguage,
          },
          controller.signal,
          session?.access_token,
        );

        if (current !== seq.current) {
          return;
        }

        last.current = signature;
        setTranslation(data.translation);
        setRequestId(data.requestId);
        setUsage(data.usage ?? null);
      } catch (cause) {
        if (
          controller.signal.aborted ||
          current !== seq.current
        ) {
          return;
        }

        const failure = cause as Error & {
          upgradeRecommended?: boolean;
        };

        setError(
          failure.message || "Translation failed.",
        );
        setUpgrade(
          Boolean(failure.upgradeRecommended),
        );
      } finally {
        if (current === seq.current) {
          abortRef.current = null;
          setLoading(false);
        }
      }
    },
    [
      cancel,
      maxCharacters,
      session?.access_token,
      sourceLanguage,
      stopSpeech,
      targetLanguage,
    ],
  );

  useEffect(() => {
    if (debouncedText === sourceText) {
      void translate(debouncedText);
    }
  }, [
    debouncedText,
    sourceText,
    sourceLanguage,
    targetLanguage,
    translate,
  ]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      transcriptionAbortRef.current?.abort();
      speechAbortRef.current?.abort();

      seq.current += 1;

      const recorder = mediaRecorderRef.current;

      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;

        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      }

      cleanupRecordingStream();

      const audio = audioRef.current;

      if (audio) {
        audio.pause();
        audio.onended = null;
        audio.onerror = null;
        audio.src = "";
      }

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    },
    [cleanupRecordingStream],
  );

  function reset() {
    cancel();
    stopSpeech();

    last.current = "";

    setError("");
    setRequestId("");
    setUpgrade(false);
  }

  function sourceChange(language: LanguageCode) {
    if (isRecording || isTranscribing) {
      return;
    }

    reset();

    const targets = getTargetsForSource(language);

    setSourceLanguage(language);

    if (!targets.includes(targetLanguage)) {
      setTargetLanguage(targets[0]);
    }
  }

  function targetChange(language: LanguageCode) {
    reset();

    const sources = getSourcesForTarget(language);

    setTargetLanguage(language);

    if (!sources.includes(sourceLanguage)) {
      setSourceLanguage(sources[0]);
    }
  }

  function textChange(value: string) {
    cancel();
    stopSpeech();

    last.current = "";

    const limitedValue = Array.from(value)
      .slice(0, maxCharacters)
      .join("");

    setSourceText(limitedValue);
    setError("");
    setRequestId("");

    if (!limitedValue.trim()) {
      setTranslation("");
    }
  }

  async function paste() {
    try {
      const clipboardText =
        await navigator.clipboard.readText();

      textChange(clipboardText);
    } catch {
      setError(
        "Clipboard access was blocked. Use Ctrl + V.",
      );
    }
  }

  function swap() {
    if (
      isRecording ||
      isTranscribing ||
      !canSwapLanguages(
        sourceLanguage,
        targetLanguage,
      )
    ) {
      return;
    }

    reset();

    setSourceLanguage(targetLanguage);
    setTargetLanguage(sourceLanguage);
    setSourceText(translation || sourceText);
    setTranslation(translation ? sourceText : "");
  }

  function keyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (event.ctrlKey && event.key === "Enter") {
      event.preventDefault();
      void translate(sourceText, true);
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;

    if (
      recorder &&
      recorder.state !== "inactive"
    ) {
      recorder.stop();
    }
  }

  async function startRecording() {
    if (
      !voiceInputSupported ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError(
        "Voice recording is not supported by this browser.",
      );
      return;
    }

    if (isTranscribing) {
      return;
    }

    stopSpeech();
    cancel();

    setError("");
    setUpgrade(false);

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

      mediaStreamRef.current = stream;
      recordedChunksRef.current = [];

      const mimeType =
        getSupportedRecordingMimeType();

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      const recordingLanguage = sourceLanguage;

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setError(
          "The browser could not record audio. Check your microphone permission and try again.",
        );

        setIsRecording(false);
        cleanupRecordingStream();
      };

      recorder.onstop = () => {
        const chunks = [
          ...recordedChunksRef.current,
        ];

        recordedChunksRef.current = [];

        const recordedMimeType =
          recorder.mimeType ||
          mimeType ||
          "audio/webm";

        cleanupRecordingStream();
        setIsRecording(false);

        if (!chunks.length) {
          setError(
            "No audio was captured. Please try speaking again.",
          );
          return;
        }

        const audioBlob = new Blob(chunks, {
          type: recordedMimeType,
        });

        if (!audioBlob.size) {
          setError(
            "No audio was captured. Please try speaking again.",
          );
          return;
        }

        const controller = new AbortController();

        transcriptionAbortRef.current?.abort();
        transcriptionAbortRef.current = controller;

        setIsTranscribing(true);
        setError("");

        void requestSpeechTranscription(
          {
            audio: audioBlob,
            language: recordingLanguage,
          },
          controller.signal,
          session?.access_token,
        )
          .then((result) => {
            if (controller.signal.aborted) {
              return;
            }

            const transcript = result.text.trim();

            if (!transcript) {
              throw new Error(
                "No speech was recognized. Please try again.",
              );
            }

            textChange(transcript);
          })
          .catch((cause) => {
            if (controller.signal.aborted) {
              return;
            }

            const failure = cause as Error;

            setError(
              failure.message ||
                "Speech could not be converted to text.",
            );
          })
          .finally(() => {
            if (
              transcriptionAbortRef.current ===
              controller
            ) {
              transcriptionAbortRef.current = null;
              setIsTranscribing(false);
            }
          });
      };

      recorder.start(250);
      setIsRecording(true);

      recordingTimeoutRef.current = setTimeout(() => {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      }, MAX_RECORDING_DURATION_MS);
    } catch (cause) {
      cleanupRecordingStream();
      setIsRecording(false);

      const failure = cause as DOMException;

      if (
        failure.name === "NotAllowedError" ||
        failure.name === "PermissionDeniedError"
      ) {
        setError(
          "Microphone access was denied. Allow microphone access in your browser settings and try again.",
        );
        return;
      }

      if (
        failure.name === "NotFoundError" ||
        failure.name === "DevicesNotFoundError"
      ) {
        setError(
          "No microphone was found on this device.",
        );
        return;
      }

      setError(
        "The microphone could not be started. Please try again.",
      );
    }
  }

  function toggleRecording() {
    if (isRecording) {
      stopRecording();
      return;
    }

    void startRecording();
  }

  async function toggleSpeech() {
    if (isSpeaking || isSpeechLoading) {
      stopSpeech();
      return;
    }

    if (!translation.trim()) {
      return;
    }

    stopSpeech();

    const controller = new AbortController();
    speechAbortRef.current = controller;

    setIsSpeechLoading(true);
    setError("");

    try {
      const audioBlob = await requestSpeechAudio(
        {
          text: translation,
          language: targetLanguage,
        },
        controller.signal,
        session?.access_token,
      );

      if (controller.signal.aborted) {
        return;
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audioUrlRef.current = audioUrl;
      audioRef.current = audio;

      audio.preload = "auto";

      audio.onended = () => {
        cleanupAudio();
      };

      audio.onerror = () => {
        cleanupAudio();
        setError(
          "The translated audio could not be played.",
        );
      };

      await audio.play();

      if (!controller.signal.aborted) {
        setIsSpeechLoading(false);
        setIsSpeaking(true);
      }
    } catch (cause) {
      if (controller.signal.aborted) {
        return;
      }

      cleanupAudio();

      const failure = cause as Error;

      setError(
        failure.message ||
          "Translated audio could not be generated.",
      );
    } finally {
      if (speechAbortRef.current === controller) {
        speechAbortRef.current = null;
      }
    }
  }

  return (
    <>
      <div className="translator-wrap">
        <div className="translator-toolbar">
          <div>
            <span className="toolbar-kicker">
              Translation workspace
            </span>

            <span className="toolbar-note">
              {profile
                ? `${plan?.name ?? "Free"} plan · history ${
                    profile.history_enabled
                      ? "on"
                      : "off"
                  }`
                : "Free access · sign in to save history"}
            </span>
          </div>

          <button
            className="primary-button desktop-translate-button"
            type="button"
            onClick={() =>
              void translate(sourceText, true)
            }
            disabled={
              loading ||
              isRecording ||
              isTranscribing ||
              countMeaningfulCharacters(sourceText) < 2
            }
          >
            {loading ? "Translating…" : "Translate"}
          </button>
        </div>

        <div className="translator-grid">
          <TranslationPanel
            mode="input"
            languageLabel="Translate from"
            languageId="source-language"
            language={sourceLanguage}
            languageOptions={["en", "hyw", "hye"]}
            onLanguageChange={sourceChange}
            value={sourceText}
            onChange={textChange}
            onKeyDown={keyDown}
            onClear={() => {
              reset();
              setSourceText("");
              setTranslation("");
            }}
            onPaste={paste}
            maxCharacters={maxCharacters}
            voiceInputSupported={voiceInputSupported}
            isRecording={isRecording}
            isTranscribing={isTranscribing}
            onToggleRecording={toggleRecording}
          />

          <div className="swap-control-wrap">
            <SwapLanguagesButton
              disabled={
                isRecording ||
                isTranscribing ||
                !canSwapLanguages(
                  sourceLanguage,
                  targetLanguage,
                )
              }
              onSwap={swap}
            />
          </div>

          <TranslationPanel
            mode="output"
            languageLabel="Translate to"
            languageId="target-language"
            language={targetLanguage}
            languageOptions={getTargetsForSource(
              sourceLanguage,
            )}
            onLanguageChange={targetChange}
            value={translation}
            loading={loading}
            isSpeechLoading={isSpeechLoading}
            isSpeaking={isSpeaking}
            onToggleSpeech={toggleSpeech}
          />
        </div>

        <div className="translator-bottom-bar">
          <StatusMessage
            loading={
              loading ||
              isTranscribing ||
              isSpeechLoading
            }
            error={error}
            hasTranslation={Boolean(translation)}
            onRetry={() =>
              void translate(sourceText, true)
            }
          />

          <button
            className="primary-button mobile-translate-button"
            type="button"
            onClick={() =>
              void translate(sourceText, true)
            }
            disabled={
              loading ||
              isRecording ||
              isTranscribing ||
              countMeaningfulCharacters(sourceText) < 2
            }
          >
            {loading ? "Translating…" : "Translate"}
          </button>
        </div>
      </div>

      {upgrade && (
        <div className="upgrade-notice">
          Your current limit blocked this request.{" "}
          {profile ? (
            <Link href="/pricing">
              Compare plans
            </Link>
          ) : (
            <Link href="/signup?next=%2Fpricing">
              Create an account and choose a plan
            </Link>
          )}
          .
        </div>
      )}

      {usage && profile && (
        <div className="translator-usage">
          <UsageMeter usage={usage} compact />
        </div>
      )}

      {requestId && translation && (
        <TranslationFeedback
          requestId={requestId}
          sourceText={sourceText}
          translation={translation}
          sourceLanguage={sourceLanguage}
          targetLanguage={targetLanguage}
        />
      )}
    </>
  );
}