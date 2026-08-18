import type {
  ChangeEvent,
  KeyboardEvent,
  ReactNode,
} from "react";

import {
  CharacterCounter,
} from "@/components/CharacterCounter";

import {
  CopyButton,
} from "@/components/CopyButton";

import {
  GrammarTooltipPanel,
} from "@/components/GrammarTooltipPanel";

import {
  LanguageSelector,
} from "@/components/LanguageSelector";

import {
  VoiceListenButton,
} from "@/components/VoiceListenButton";

import {
  type LanguageCode,
} from "@/lib/languages";

interface BasePanelProps {
  languageLabel: string;
  languageId: string;
  language: LanguageCode;
  languageOptions: LanguageCode[];
  onLanguageChange:
    (language: LanguageCode) => void;
  panelActions?: ReactNode;
}

interface InputPanelProps
  extends BasePanelProps {
  mode: "input";
  value: string;
  onChange:
    (value: string) => void;
  onKeyDown:
    (
      event:
        KeyboardEvent<HTMLTextAreaElement>,
    ) => void;
  onClear: () => void;
  onPaste: () => void;
  maxCharacters: number;
  keyboardHint?: string;
  mobileFooterAction?: ReactNode;
}

interface OutputPanelProps
  extends BasePanelProps {
  mode: "output";
  value: string;
  loading: boolean;
  transliteration?: string;
  secondaryActions?: ReactNode;
}

type Props =
  | InputPanelProps
  | OutputPanelProps;

export function TranslationPanel(
  props: Props,
) {
  const armenian =
    props.language === "hyw" ||
    props.language === "hye";

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
          options={
            props.languageOptions
          }
          onChange={
            props.onLanguageChange
          }
        />

        <div className="panel-actions">
          {props.mode ===
          "input" ? (
            <>
              <button
                type="button"
                onClick={
                  props.onPaste
                }
                className="panel-action"
                aria-label="Paste text"
              >
                <span>
                  {"\u25A3"}
                </span>

                <span>
                  Paste
                </span>
              </button>

              <button
                type="button"
                onClick={
                  props.onClear
                }
                disabled={
                  !props.value
                }
                className="panel-action"
              >
                <span>
                  {"\u00D7"}
                </span>

                <span>
                  Clear
                </span>
              </button>
            </>
          ) : (
            <>
              <VoiceListenButton
                text={props.value}
                language={
                  props.language
                }
                disabled={
                  props.loading ||
                  !props.value
                }
              />

              <CopyButton
                text={props.value}
                disabled={
                  props.loading &&
                  !props.value
                }
              />
            </>
          )}

          {props.panelActions}
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
              event:
                ChangeEvent<HTMLTextAreaElement>,
            ) =>
              props.onChange(
                event.target.value,
              )
            }
            onKeyDown={
              props.onKeyDown
            }
            maxLength={
              props.maxCharacters
            }
            className={
              armenian
                ? "armenian-text"
                : undefined
            }
            placeholder="Enter or paste text..."
            spellCheck
          />

          <div className="panel-footer-row">
            <span className="keyboard-hint">
              {props.keyboardHint
                ? `${props.keyboardHint} - `
                : ""}
              limit{" "}
              {props.maxCharacters.toLocaleString()}
            </span>

            <CharacterCounter
              count={
                Array.from(
                  props.value,
                ).length
              }
              max={
                props.maxCharacters
              }
            />
          </div>

          {props.mobileFooterAction ? (
            <div className="mobile-source-translate-wrap">
              {props.mobileFooterAction}
            </div>
          ) : null}
        </div>
      ) : (
        <div
          className="panel-body output-body"
          aria-busy={
            props.loading
          }
        >
          <div
            className={`translation-output ${
              armenian
                ? "armenian-text"
                : ""
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

          {props.language ===
            "hyw" &&
          props.transliteration ? (
            <div
              className="transliteration-block"
              aria-live="polite"
            >
              <div className="transliteration-heading-row">
                <span className="transliteration-label">
                  Latin transliteration
                </span>

                <VoiceListenButton
                  text={props.transliteration}
                  language="hyw"
                  mode="pronunciation"
                  defaultSpeed={0.75}
                  disabled={
                    props.loading ||
                    !props.transliteration
                  }
                  label="Pronunciation"
                  compact
                />
              </div>

              <span className="transliteration-text">
                {
                  props.transliteration
                }
              </span>
            </div>
          ) : null}

          <GrammarTooltipPanel
            text={props.value}
            language={props.language}
            loading={props.loading}
          />

          {props.secondaryActions ? (
            <div className="output-secondary-actions">
              {props.secondaryActions}
            </div>
          ) : null}

          <div className="panel-footer-row output-footer">
            <span>
              {props.value
                ? "Audio playback is available on paid plans"
                : ""}
            </span>

            <CharacterCounter
              count={
                Array.from(
                  props.value,
                ).length
              }
            />
          </div>
        </div>
      )}
    </section>
  );
}
