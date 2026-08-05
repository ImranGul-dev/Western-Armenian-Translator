import type {
  ChangeEvent,
  KeyboardEvent,
  ReactNode,
} from "react";

import { CharacterCounter } from "@/components/CharacterCounter";
import { CopyButton } from "@/components/CopyButton";
import { LanguageSelector } from "@/components/LanguageSelector";
import {
  LANGUAGES,
  type LanguageCode,
} from "@/lib/languages";

interface BasePanelProps {
  languageLabel: string;
  languageId: string;
  language: LanguageCode;
  languageOptions: LanguageCode[];
  onLanguageChange: (language: LanguageCode) => void;
  panelActions?: ReactNode;
}

interface InputPanelProps extends BasePanelProps {
  mode: "input";
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onClear: () => void;
  onPaste: () => void;
  maxCharacters: number;

  voiceInputSupported: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  onToggleRecording: () => void;
}

interface OutputPanelProps extends BasePanelProps {
  mode: "output";
  value: string;
  loading: boolean;

  isSpeechLoading: boolean;
  isSpeaking: boolean;
  onToggleSpeech: () => void;
}

type Props = InputPanelProps | OutputPanelProps;

function MicrophoneIcon() {
  return (
    <svg
      className="panel-action-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-5 9a1 1 0 0 0-2 0 7 7 0 0 0 6 6.93V21H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-2.07A7 7 0 0 0 19 12a1 1 0 1 0-2 0 5 5 0 0 1-10 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg
      className="panel-action-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M14.5 4.6a1 1 0 0 0-1.08.16L8.65 8.5H5a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h3.65l4.77 3.74A1 1 0 0 0 15 18.45V5.55a1 1 0 0 0-.5-.95Zm3.7 3.02a1 1 0 0 0-1.4 1.43 4.1 4.1 0 0 1 0 5.9 1 1 0 1 0 1.4 1.43 6.1 6.1 0 0 0 0-8.76Z"
        fill="currentColor"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      className="panel-action-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="6"
        y="6"
        width="12"
        height="12"
        rx="2"
        fill="currentColor"
      />
    </svg>
  );
}

export function TranslationPanel(props: Props) {
  const armenian =
    props.language === "hyw" || props.language === "hye";

  return (
    <section
      className={`translation-panel ${
        props.mode === "output"
          ? "output-panel"
          : "input-panel"
      }`}
    >
      <div className="panel-header">
        <LanguageSelector
          id={props.languageId}
          label={props.languageLabel}
          value={props.language}
          options={props.languageOptions}
          onChange={props.onLanguageChange}
        />

        <div className="panel-actions">
          {props.mode === "input" ? (
            <>
              <button
                type="button"
                onClick={props.onToggleRecording}
                disabled={
                  !props.voiceInputSupported ||
                  props.isTranscribing
                }
                className={`panel-action ${
                  props.isRecording
                    ? "panel-action-active"
                    : ""
                }`}
                aria-label={
                  props.isRecording
                    ? "Stop voice recording"
                    : "Start voice recording"
                }
                aria-pressed={props.isRecording}
                title={
                  !props.voiceInputSupported
                    ? "Voice recording is not supported by this browser."
                    : props.isRecording
                      ? "Stop recording"
                      : "Speak your text"
                }
              >
                {props.isRecording ? (
                  <StopIcon />
                ) : (
                  <MicrophoneIcon />
                )}

                <span>
                  {props.isTranscribing
                    ? "Processing…"
                    : props.isRecording
                      ? "Stop"
                      : "Speak"}
                </span>
              </button>

              <button
                type="button"
                onClick={props.onPaste}
                className="panel-action"
                aria-label="Paste text"
                disabled={
                  props.isRecording ||
                  props.isTranscribing
                }
              >
                <span aria-hidden="true">▣</span>
                <span>Paste</span>
              </button>

              <button
                type="button"
                onClick={props.onClear}
                disabled={
                  !props.value ||
                  props.isRecording ||
                  props.isTranscribing
                }
                className="panel-action"
              >
                <span aria-hidden="true">×</span>
                <span>Clear</span>
              </button>

              {props.panelActions}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={props.onToggleSpeech}
                disabled={
                  !props.value ||
                  props.loading ||
                  props.isSpeechLoading
                }
                className={`panel-action ${
                  props.isSpeaking
                    ? "panel-action-active"
                    : ""
                }`}
                aria-label={
                  props.isSpeaking
                    ? "Stop translated audio"
                    : "Listen to translated text"
                }
                aria-pressed={props.isSpeaking}
                title={
                  props.isSpeaking
                    ? "Stop AI-generated voice"
                    : "Play AI-generated voice"
                }
              >
                {props.isSpeaking ? (
                  <StopIcon />
                ) : (
                  <SpeakerIcon />
                )}

                <span>
                  {props.isSpeechLoading
                    ? "Preparing…"
                    : props.isSpeaking
                      ? "Stop"
                      : "Listen"}
                </span>
              </button>

              <CopyButton
                text={props.value}
                disabled={
                  props.loading && !props.value
                }
              />

              {props.panelActions}
            </>
          )}
        </div>
      </div>

      {props.mode === "input" ? (
        <div className="panel-body">
          <label
            className="sr-only"
            htmlFor="source-text"
          >
            Text to translate
          </label>

          <textarea
            id="source-text"
            value={props.value}
            onChange={(
              event: ChangeEvent<HTMLTextAreaElement>,
            ) => props.onChange(event.target.value)}
            onKeyDown={props.onKeyDown}
            maxLength={props.maxCharacters}
            className={
              armenian ? "armenian-text" : undefined
            }
            placeholder="Enter, paste, or speak text…"
            spellCheck
            disabled={
              props.isRecording ||
              props.isTranscribing
            }
          />

          <div className="panel-footer-row">
            <span
              className={`keyboard-hint ${
                props.isRecording
                  ? "voice-status-active"
                  : ""
              }`}
              role="status"
              aria-live="polite"
            >
              {props.isRecording
                ? "Listening… click Stop when finished"
                : props.isTranscribing
                  ? "Converting speech to text…"
                  : `Ctrl + Enter · limit ${props.maxCharacters.toLocaleString()}`}
            </span>

            <CharacterCounter
              count={Array.from(props.value).length}
              max={props.maxCharacters}
            />
          </div>
        </div>
      ) : (
        <div
          className="panel-body output-body"
          aria-busy={
            props.loading || props.isSpeechLoading
          }
        >
          <div
            className={`translation-output ${
              armenian ? "armenian-text" : ""
            }`}
            role="region"
            aria-label="Translation result"
            aria-live="polite"
          >
            {props.value || (
              <span className="output-placeholder">
                Your translation will appear here.
              </span>
            )}
          </div>

          <div className="panel-footer-row output-footer">
            <span>
              {props.value
                ? `${LANGUAGES[props.language].name} · AI voice`
                : ""}
            </span>

            <CharacterCounter
              count={Array.from(props.value).length}
            />
          </div>
        </div>
      )}
    </section>
  );
}