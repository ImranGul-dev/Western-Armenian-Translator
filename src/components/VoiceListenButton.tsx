"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  LanguageCode,
} from "@/lib/languages";

import {
  getSupabaseConfig,
} from "@/lib/supabase/client";

type VoiceState =
  | "idle"
  | "loading"
  | "playing";

type VoiceSpeed =
  | 0.75
  | 1
  | 1.25
  | 1.5;

interface VoiceListenButtonProps {
  text: string;
  language: LanguageCode;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
}

function voiceFunctionUrl() {
  const { url } =
    getSupabaseConfig();

  if (!url) {
    throw new Error(
      "Supabase is not configured.",
    );
  }

  return `${url}/functions/v1/voice-tts`;
}

export function VoiceListenButton({
  text,
  language,
  disabled = false,
  label = "Listen",
  compact = false,
}: VoiceListenButtonProps) {
  const [
    state,
    setState,
  ] = useState<VoiceState>(
    "idle",
  );

  const [
    speed,
    setSpeed,
  ] = useState<VoiceSpeed>(
    1,
  );

  const [
    error,
    setError,
  ] = useState("");

  const controllerRef =
    useRef<AbortController | null>(
      null,
    );

  const contextRef =
    useRef<AudioContext | null>(
      null,
    );

  const sourceRef =
    useRef<AudioBufferSourceNode | null>(
      null,
    );

  function stopAudio() {
    controllerRef.current?.abort();

    controllerRef.current =
      null;

    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        // Audio already stopped.
      }

      sourceRef.current =
        null;
    }

    if (contextRef.current) {
      void contextRef.current.close();

      contextRef.current =
        null;
    }

    setState("idle");
  }

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();

      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
        } catch {
          // Audio already stopped.
        }
      }

      if (contextRef.current) {
        void contextRef.current.close();
      }
    };
  }, [text]);

  async function listen() {
    if (
      state === "loading" ||
      state === "playing"
    ) {
      stopAudio();
      return;
    }

    if (!text.trim()) {
      return;
    }

    setError("");
    setState("loading");

    const controller =
      new AbortController();

    controllerRef.current =
      controller;

    const context =
      new AudioContext();

    contextRef.current =
      context;

    try {
      await context.resume();

      const { key } =
        getSupabaseConfig();

      if (!key) {
        throw new Error(
          "Supabase publishable key is missing.",
        );
      }

      const response =
        await fetch(
          voiceFunctionUrl(),
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              Accept:
                "audio/wav, application/json",

              apikey:
                key,
            },

            body:
              JSON.stringify({
                text,
                language,
                voice:
                  "marin",
                speed,
              }),

            cache:
              "no-store",

            signal:
              controller.signal,
          },
        );

      if (!response.ok) {
        let message =
          "Voice generation failed.";

        try {
          const data =
            await response.json();

          if (
            data &&
            typeof data.error ===
              "string"
          ) {
            message =
              data.error;
          }
        } catch {
          // Keep generic error.
        }

        throw new Error(
          message,
        );
      }

      const audioData =
        await response.arrayBuffer();

      if (
        controller.signal.aborted
      ) {
        return;
      }

      const audioBuffer =
        await context.decodeAudioData(
          audioData.slice(0),
        );

      if (
        controller.signal.aborted
      ) {
        return;
      }

      const source =
        context.createBufferSource();

      source.buffer =
        audioBuffer;

      source.connect(
        context.destination,
      );

      sourceRef.current =
        source;

      source.onended = () => {
        if (
          sourceRef.current ===
          source
        ) {
          sourceRef.current =
            null;

          controllerRef.current =
            null;

          setState("idle");

          if (
            contextRef.current ===
            context
          ) {
            contextRef.current =
              null;

            void context.close();
          }
        }
      };

      source.start();

      setState("playing");
    } catch (cause) {
      if (
        controller.signal.aborted
      ) {
        return;
      }

      console.error(
        "Voice playback failed",
        cause,
      );

      setError(
        cause instanceof Error
          ? cause.message
          : "Voice playback failed.",
      );

      setState("idle");

      if (
        contextRef.current ===
        context
      ) {
        contextRef.current =
          null;

        void context.close();
      }
    }
  }

  return (
    <span
      className={`voice-listen-control ${
        compact
          ? "voice-listen-control-compact"
          : ""
      }`}
    >
      <button
        type="button"
        className="panel-action"
        disabled={
          disabled ||
          !text.trim()
        }
        onClick={() =>
          void listen()
        }
        title={
          error ||
          "AI-generated voice"
        }
      >
        <span aria-hidden="true">
          {"\uD83D\uDD0A"}
        </span>

        <span>
          {state === "loading"
            ? "Preparing..."
            : state === "playing"
              ? "Stop"
              : error
                ? "Try again"
                : label}
        </span>
      </button>

      <select
        className="voice-speed-select"
        aria-label="Voice speed"
        value={speed}
        disabled={
          state === "loading"
        }
        onChange={(event) =>
          setSpeed(
            Number(
              event.target.value,
            ) as VoiceSpeed,
          )
        }
        title="Voice speed"
      >
        <option value="0.75">
          0.75x
        </option>

        <option value="1">
          1x
        </option>

        <option value="1.25">
          1.25x
        </option>

        <option value="1.5">
          1.5x
        </option>
      </select>
    </span>
  );
}