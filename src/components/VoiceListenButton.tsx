"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeLearningPreferences } from "@/lib/learning-preferences";
import { hasPaidFeatureAccess } from "@/lib/paid-feature-access";
import type { LanguageCode } from "@/lib/languages";
import { getSupabaseConfig } from "@/lib/supabase/client";

type VoiceState = "idle" | "loading" | "playing";
type VoiceSpeed = 0.75 | 1 | 1.25 | 1.5;
type VoiceMode = "natural" | "pronunciation";

interface VoiceListenButtonProps {
  text: string;
  language: LanguageCode;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
  mode?: VoiceMode;
  defaultSpeed?: VoiceSpeed;
}

function voiceFunctionUrl() {
  const { url } = getSupabaseConfig();
  if (!url) throw new Error("Supabase is not configured.");
  return `${url}/functions/v1/voice-tts`;
}

export function VoiceListenButton({
  text,
  language,
  disabled = false,
  label = "Listen",
  compact = false,
  mode = "natural",
  defaultSpeed = 1,
}: VoiceListenButtonProps) {
  const { user, profile, plan, session, loading: authLoading } = useAuth();
  const learningPreferences = normalizeLearningPreferences(profile?.learning_preferences);
  const preferredSpeed: VoiceSpeed = profile
    ? mode === "pronunciation"
      ? learningPreferences.pronunciation_speed
      : learningPreferences.audio_speed
    : defaultSpeed;
  const preferredVoice = profile ? learningPreferences.tts_voice : "marin";

  const [state, setState] = useState<VoiceState>("idle");
  const [speed, setSpeed] = useState<VoiceSpeed>(preferredSpeed);
  const [error, setError] = useState("");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const voiceFeature = mode === "pronunciation" ? "pronunciation" : "audio";
  const hasPaidVoiceAccess = hasPaidFeatureAccess(voiceFeature, {
    isAuthenticated: Boolean(user),
    role: profile?.role,
    planSlug: plan?.slug,
  });
  const locked = !authLoading && !hasPaidVoiceAccess;

  function stopAudio() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
      sourceRef.current = null;
    }
    if (contextRef.current) {
      void contextRef.current.close();
      contextRef.current = null;
    }
    setState("idle");
  }

  useEffect(() => setSpeed(preferredSpeed), [preferredSpeed]);
  useEffect(() => () => {
    controllerRef.current?.abort();
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
    }
    if (contextRef.current) void contextRef.current.close();
  }, [text]);

  useEffect(() => {
    if (!upgradeOpen) return;
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setUpgradeOpen(false);
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [upgradeOpen]);

  async function listen() {
    if (!hasPaidVoiceAccess) {
      setUpgradeOpen(true);
      return;
    }
    if (!session?.access_token) {
      setError("Please log in again to use audio.");
      return;
    }
    if (state === "loading" || state === "playing") {
      stopAudio();
      return;
    }
    if (!text.trim()) return;

    setError("");
    setState("loading");
    const controller = new AbortController();
    controllerRef.current = controller;
    const context = new AudioContext();
    contextRef.current = context;

    try {
      await context.resume();
      const { key } = getSupabaseConfig();
      if (!key) throw new Error("Supabase publishable key is missing.");

      const response = await fetch(voiceFunctionUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "audio/wav, application/json",
          apikey: key,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ text, language, mode, voice: preferredVoice, speed }),
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        let message = "Voice generation failed.";
        try {
          const data = await response.json();
          if (data && typeof data.error === "string") message = data.error;
        } catch {}
        throw new Error(message);
      }

      const audioData = await response.arrayBuffer();
      if (controller.signal.aborted) return;
      const audioBuffer = await context.decodeAudioData(audioData.slice(0));
      if (controller.signal.aborted) return;
      const source = context.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(context.destination);
      sourceRef.current = source;
      source.onended = () => {
        if (sourceRef.current === source) {
          sourceRef.current = null;
          controllerRef.current = null;
          setState("idle");
          if (contextRef.current === context) {
            contextRef.current = null;
            void context.close();
          }
        }
      };
      source.start();
      setState("playing");
    } catch (cause) {
      if (controller.signal.aborted) return;
      console.error("Voice playback failed", cause);
      setError(cause instanceof Error ? cause.message : "Voice playback failed.");
      setState("idle");
      if (contextRef.current === context) {
        contextRef.current = null;
        void context.close();
      }
    }
  }

  const featureName = mode === "pronunciation" ? "Pronunciation" : "Audio";

  return (
    <>
      <span className={`voice-listen-control ${compact ? "voice-listen-control-compact" : ""}`}>
        <button
          type="button"
          className="panel-action"
          disabled={disabled || authLoading || !text.trim()}
          onClick={() => {
            if (locked) {
              setUpgradeOpen(true);
              return;
            }
            void listen();
          }}
          title={locked ? `${featureName} is available to paid users` : error || (mode === "pronunciation" ? "Hear Western Armenian pronunciation from the Latin transliteration" : "Listen using an AI-generated voice")}
          data-translator-action={mode === "pronunciation" ? "pronunciation" : "text-to-speech"}
        >
          <span aria-hidden="true">{locked ? "\uD83D\uDD12" : "\uD83D\uDD0A"}</span>
          <span>{locked ? label : state === "loading" ? "Preparing..." : state === "playing" ? "Stop" : error ? "Try again" : label}</span>
        </button>

        <select
          className="voice-speed-select"
          aria-label={mode === "pronunciation" ? "Pronunciation speed" : "Voice speed"}
          value={speed}
          disabled={locked || authLoading || state === "loading"}
          onChange={(event) => setSpeed(Number(event.target.value) as VoiceSpeed)}
        >
          <option value={0.75}>0.75x</option>
          <option value={1}>1x</option>
          <option value={1.25}>1.25x</option>
          <option value={1.5}>1.5x</option>
        </select>
      </span>

      {upgradeOpen && (
        <div className="premium-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setUpgradeOpen(false);
        }}>
          <section className="premium-modal" role="dialog" aria-modal="true" aria-labelledby="voice-upgrade-title">
            <button type="button" className="premium-modal-close" aria-label="Close" onClick={() => setUpgradeOpen(false)}>×</button>
            <p className="eyebrow">Paid feature</p>
            <h2 id="voice-upgrade-title">Unlock {featureName}</h2>
            <p>{featureName} is available on paid Tun plans.</p>
            <div className="premium-modal-actions">
              <Link href="/pricing" className="primary-button" onClick={() => setUpgradeOpen(false)}>View plans</Link>
              {!user && <Link href="/login" className="premium-modal-link" onClick={() => setUpgradeOpen(false)}>Log in</Link>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
