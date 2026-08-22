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

type SpeechState =
  | "idle"
  | "connecting"
  | "listening"
  | "processing";

interface SpeechToTextButtonProps {
  language: LanguageCode;
  currentText: string;
  maxCharacters: number;
  disabled?: boolean;

  onTranscript: (
    value: string,
    final: boolean,
  ) => void;

  onListeningChange?: (
    listening: boolean,
  ) => void;
}

type RealtimeEvent = {
  type?: string;
  delta?: string;
  transcript?: string;

  error?: {
    message?: string;
  };
};

export function SpeechToTextButton({
  language,
  currentText,
  maxCharacters,
  disabled = false,
  onTranscript,
  onListeningChange,
}: SpeechToTextButtonProps) {
  const [state, setState] = useState<SpeechState>("idle");
  const [error, setError] = useState("");
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const baseRef = useRef("");
  const committedRef = useRef("");
  const partialRef = useRef("");

  function emit(value: string, final: boolean) {
    const limited = Array.from(value).slice(0, maxCharacters).join("");
    onTranscript(limited, final);
  }

  function closeSession(updateState = true) {
    if (channelRef.current) {
      try { channelRef.current.close(); } catch {}
      channelRef.current = null;
    }
    if (peerRef.current) {
      try { peerRef.current.close(); } catch {}
      peerRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (updateState) {
      setState("idle");
      onListeningChange?.(false);
    }
  }

  useEffect(() => () => closeSession(false), []);

  async function requestToken() {
    const { url, key } = getSupabaseConfig();
    if (!url || !key) throw new Error("Supabase is not configured.");

    const response = await fetch(`${url}/functions/v1/voice-stt-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({ language }),
      cache: "no-store",
    });

    let data: Record<string, unknown> = {};
    try { data = await response.json(); } catch {}

    if (!response.ok || typeof data.value !== "string") {
      throw new Error(typeof data.error === "string" ? data.error : "Could not start speech recognition.");
    }
    return data.value;
  }

  function commitSpeech() {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== "open") {
      setError("The speech connection is not ready yet.");
      return;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getAudioTracks()) track.enabled = false;
    }

    setState("processing");
    setError("");

    try {
      channel.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    } catch (cause) {
      console.error("Could not commit speech input", cause);
      setError("Could not finish speech recognition. Please try again.");
      closeSession();
    }
  }

  async function start() {
    if (state === "listening") {
      commitSpeech();
      return;
    }
    if (state === "connecting" || state === "processing") {
      closeSession();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Your browser does not support microphone access.");
      return;
    }

    setError("");
    setState("connecting");
    onListeningChange?.(true);
    baseRef.current = currentText.trimEnd() ? `${currentText.trimEnd()} ` : "";
    committedRef.current = "";
    partialRef.current = "";

    try {
      const [stream, ephemeralKey] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        }),
        requestToken(),
      ]);

      streamRef.current = stream;
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      for (const track of stream.getAudioTracks()) peer.addTrack(track, stream);

      const channel = peer.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.onopen = () => setState("listening");
      channel.onmessage = (event) => {
        let message: RealtimeEvent;
        try { message = JSON.parse(event.data) as RealtimeEvent; } catch { return; }

        if (message.type === "conversation.item.input_audio_transcription.delta" && typeof message.delta === "string") {
          partialRef.current += message.delta;
          emit(`${baseRef.current}${committedRef.current}${partialRef.current}`, false);
          return;
        }

        if (message.type === "conversation.item.input_audio_transcription.completed") {
          const transcript = typeof message.transcript === "string" ? message.transcript.trim() : "";
          if (!transcript) return;
          const previous = committedRef.current.trim();
          committedRef.current = previous ? `${previous} ${transcript}` : transcript;
          partialRef.current = "";
          emit(`${baseRef.current}${committedRef.current}`.trimEnd(), true);
          closeSession();
          return;
        }

        if (message.type === "error") {
          setError(message.error?.message || "Speech recognition failed.");
          closeSession();
        }
      };

      channel.onerror = () => {
        setError("The speech recognition connection failed.");
        closeSession();
      };

      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed") {
          setError("The microphone connection failed.");
          closeSession();
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      if (!offer.sdp) throw new Error("Could not initialize microphone audio.");

      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${ephemeralKey}`, "Content-Type": "application/sdp" },
      });
      if (!sdpResponse.ok) throw new Error("Could not connect the microphone to speech recognition.");

      await peer.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });
    } catch (cause) {
      console.error("Speech recognition failed", cause);
      if (cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "PermissionDeniedError")) {
        setError("Microphone permission was blocked. Allow microphone access in your browser and try again.");
      } else {
        setError(cause instanceof Error ? cause.message : "Speech recognition failed.");
      }
      closeSession();
    }
  }

  return (
    <span className="speech-input-control">
      <button
        type="button"
        className={`panel-action speech-input-button ${state === "listening" ? "is-listening" : ""}`}
        disabled={disabled}
        onClick={() => void start()}
        title={error || (state === "idle" ? "Speak instead of typing" : state === "listening" ? "Stop and transcribe" : "Cancel speech input")}
        aria-label={state === "idle" ? "Start speech to text" : state === "listening" ? "Stop and transcribe speech" : "Cancel speech to text"}
        data-translator-action="voice-input"
      >
        <span aria-hidden="true">{"\uD83C\uDFA4"}</span>
        {state === "connecting" ? <span>Connecting...</span> : state === "processing" ? <span>Transcribing...</span> : state === "listening" ? <><span className="speech-live-dot" /><span>Stop</span></> : <span>Speak</span>}
      </button>
      {error && <span className="sr-only" role="alert">{error}</span>}
    </span>
  );
}
