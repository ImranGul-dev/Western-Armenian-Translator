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

interface VoiceListenButtonProps {
  text: string;
  language: LanguageCode;
  disabled?: boolean;
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

function voiceInstructions(
  language: LanguageCode,
) {
  if (language === "hyw") {
    return "Western Armenian";
  }

  if (language === "hye") {
    return "Eastern Armenian";
  }

  return "English";
}

export function VoiceListenButton({
  text,
  language,
  disabled = false,
}: VoiceListenButtonProps) {
  const [
    state,
    setState,
  ] = useState<VoiceState>("idle");

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
    controllerRef.current = null;

    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        // Audio may already have finished.
      }

      sourceRef.current = null;
    }

    if (contextRef.current) {
      void contextRef.current.close();
      contextRef.current = null;
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
          // Audio may already have finished.
        }
      }

      if (contextRef.current) {
        void contextRef.current.close();
      }
    };
  }, [text]);

  async function listen() {
    if (
      state === "playing" ||
      state === "loading"
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

    /*
     * Create/resume the AudioContext directly
     * from the user's click. This avoids browser
     * autoplay restrictions after the network
     * request finishes.
     */
    const AudioContextClass =
      window.AudioContext;

    const context =
      new AudioContextClass();

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

                voice:
                  "marin",

                language:
                  voiceInstructions(
                    language,
                  ),
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

      const message =
        cause instanceof Error
          ? cause.message
          : "Voice playback failed.";

      setError(message);
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

  const label =
    state === "loading"
      ? "Preparing..."
      : state === "playing"
        ? "Stop"
        : error
          ? "Try voice again"
          : "Listen";

  return (
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
      aria-label={
        state === "playing"
          ? "Stop AI-generated voice"
          : "Listen to AI-generated voice"
      }
      title={
        error ||
        "Listen using an AI-generated voice"
      }
    >
      <span aria-hidden="true">
        {"\uD83D\uDD0A"}
      </span>

      <span>
        {label}
      </span>
    </button>
  );
}