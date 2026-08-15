"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { SpeechToTextButton } from "@/components/SpeechToTextButton";
import { StatusMessage } from "@/components/StatusMessage";
import { SwapLanguagesButton } from "@/components/SwapLanguagesButton";
import { TranslationPanel } from "@/components/TranslationPanel";
import { TranslationFeedback } from "@/components/TranslationFeedback";
import { PremiumFeatureNavButton } from "@/components/PremiumFeatureNavButton";
import { UsageMeter } from "@/components/UsageMeter";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAuth } from "@/contexts/AuthContext";

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

import {
  requestTranslation,
  type GuestUsage,
  type TranslationApiError,
} from "@/lib/translation-api";

import { countMeaningfulCharacters } from "@/lib/validation";
import {
  hasLatinWesternArmenianInput,
  latinToWesternArmenian,
} from "@/lib/western-armenian-input";
import { transliterateWesternArmenian } from "@/lib/western-armenian-transliteration";

import type { UsageSummary } from "@/types/database";

const AUTO_TRANSLATE_DELAY_MS = 180;
const GUEST_FREE_TRANSLATION_LIMIT = 5;

function requestSignature(
  text: string,
  source: LanguageCode,
  target: LanguageCode,
) {
  return `${source}\0${target}\0${text}`;
}

export function Translator() {
  const {
    session,
    profile,
    plan,
  } = useAuth();

  const [
    sourceLanguage,
    setSourceLanguage,
  ] = useState<LanguageCode>("en");

  const [
    targetLanguage,
    setTargetLanguage,
  ] = useState<LanguageCode>("hyw");

  const [
    sourceText,
    setSourceText,
  ] = useState("");

  const [
    translation,
    setTranslation,
  ] = useState("");

  const [
    requestId,
    setRequestId,
  ] = useState("");

  const [
    usage,
    setUsage,
  ] = useState<UsageSummary | null>(
    null,
  );

  const [
    guestUsage,
    setGuestUsage,
  ] = useState<GuestUsage | null>(
    null,
  );

  const [
    publicSettings,
    setPublicSettings,
  ] =
    useState<PublicTranslationSettings>(
      FALLBACK_PUBLIC_TRANSLATION_SETTINGS,
    );

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    speechActive,
    setSpeechActive,
  ] = useState(false);

  const [
    upgrade,
    setUpgrade,
  ] = useState(false);

  const [
    upgradeModalOpen,
    setUpgradeModalOpen,
  ] = useState(false);

  /*
   * Realtime-style automatic translation.
   *
   * 180 ms keeps the paid/logged-in experience
   * very responsive.
   */
  const debouncedText =
    useDebouncedValue(
      sourceText,
      AUTO_TRANSLATE_DELAY_MS,
    );

  const abortRef =
    useRef<AbortController | null>(
      null,
    );

  const seq =
    useRef(0);

  const last =
    useRef("");

  const active =
    useRef("");

  const maxCharacters =
    maxCharactersFor(
      plan,
      profile?.role,
      publicSettings.anonymous
        .max_characters_per_request,
    );

  const transliteration =
    targetLanguage === "hyw" &&
      translation
      ? transliterateWesternArmenian(
          translation,
        )
      : "";

  const guestLimitReached =
    !profile &&
    guestUsage !== null &&
    guestUsage.remaining <= 0;

  useEffect(() => {
    const supabase =
      getSupabaseBrowserClient();

    void supabase
      .rpc(
        "get_public_translation_settings",
      )
      .then(({ data }) => {
        if (
          data &&
          typeof data === "object"
        ) {
          setPublicSettings(
            data as PublicTranslationSettings,
          );
        }
      });
  }, []);

  useEffect(() => {
    try {
      const raw =
        localStorage.getItem(
          "wat-prefill",
        );

      if (raw) {
        const parsed =
          JSON.parse(raw) as {
            text?: string;
            source?: LanguageCode;
            target?: LanguageCode;
          };

        if (parsed.text) {
          setSourceText(
            parsed.text,
          );

          if (parsed.source) {
            setSourceLanguage(
              parsed.source,
            );
          }

          if (parsed.target) {
            setTargetLanguage(
              parsed.target,
            );
          }
        }

        localStorage.removeItem(
          "wat-prefill",
        );
      }
    } catch {
      // Invalid local prefill data is safely ignored.
    }
  }, []);

  /*
   * If a guest signs in without the component
   * remounting, remove the guest-only counter.
   */
  useEffect(() => {
    if (profile) {
      setGuestUsage(null);
      setUpgradeModalOpen(false);
    }
  }, [profile]);

  useEffect(() => {
    if (!upgradeModalOpen) {
      return;
    }

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setUpgradeModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [upgradeModalOpen]);

  const cancel =
    useCallback(() => {
      abortRef.current?.abort();

      abortRef.current =
        null;

      active.current = "";

      seq.current += 1;

      setLoading(false);
    }, []);

  const translate =
    useCallback(
      async (
        inputText: string,
        force = false,
      ) => {
        let text = inputText;

        /*
         * Western Armenian may be entered phonetically with
         * Latin characters.
         *
         * Never send that raw Latin text to the translation
         * backend as though it were already Armenian script.
         * Convert it first, update the visible source box,
         * and continue the normal translation request with
         * the converted Armenian text.
         */
        if (
          sourceLanguage === "hyw" &&
          hasLatinWesternArmenianInput(
            text,
          )
        ) {
          const converted =
            latinToWesternArmenian(
              text,
            );

          if (
            converted !== text
          ) {
            text =
              Array.from(
                converted,
              )
                .slice(
                  0,
                  maxCharacters,
                )
                .join("");

            setSourceText(
              text,
            );
          }
        }

        if (
          !text.trim() ||
          countMeaningfulCharacters(
            text,
          ) < 2
        ) {
          cancel();

          setError("");

          if (!text.trim()) {
            setTranslation("");
            setRequestId("");
          }

          return;
        }

        /*
         * Once a guest has definitely reached
         * five translations, do not keep sending
         * extra requests from the browser.
         *
         * The backend still remains the real
         * security/source-of-truth check.
         */
        if (
          !profile &&
          guestLimitReached
        ) {
          setError("");
          setUpgrade(false);
          setUpgradeModalOpen(true);

          return;
        }

        if (
          Array.from(text).length >
          maxCharacters
        ) {
          setError(
            `This text is longer than your current plan allows (${maxCharacters.toLocaleString()} characters).`,
          );

          setUpgrade(true);

          return;
        }

        const signature =
          requestSignature(
            text,
            sourceLanguage,
            targetLanguage,
          );

        if (
          !force &&
          (
            signature ===
              last.current ||
            signature ===
              active.current
          )
        ) {
          return;
        }

        /*
         * Cancel any previous translation stream.
         *
         * This is important for realtime
         * translation: old OpenAI output must
         * never overwrite translation for newly
         * typed text.
         */
        abortRef.current?.abort();

        const controller =
          new AbortController();

        abortRef.current =
          controller;

        active.current =
          signature;

        const current =
          ++seq.current;

        setLoading(true);
        setError("");
        setUpgrade(false);

        /*
         * Clear the previous completed result so
         * the new streamed response can appear
         * immediately.
         */
        setTranslation("");
        setRequestId("");

        try {
          const data =
            await requestTranslation(
              {
                text,
                sourceLanguage,
                targetLanguage,
              },

              controller.signal,

              session?.access_token,

              /*
               * Streaming callback.
               *
               * This is called repeatedly as
               * OpenAI translation deltas arrive.
               */
              (
                partialTranslation,
              ) => {
                if (
                  current !==
                    seq.current ||
                  controller.signal.aborted
                ) {
                  return;
                }

                setTranslation(
                  partialTranslation,
                );
              },
            );

          if (
            current !==
              seq.current ||
            controller.signal.aborted
          ) {
            return;
          }

          last.current =
            signature;

          setTranslation(
            data.translation,
          );

          setRequestId(
            data.requestId,
          );

          setUsage(
            data.usage ?? null,
          );

          /*
           * Guests receive their successful
           * daily translation count from the
           * backend.
           */
          if (!profile) {
            setGuestUsage(
              data.guestUsage ??
                null,
            );
          } else {
            setGuestUsage(null);
          }
        } catch (cause) {
          if (
            controller.signal.aborted ||
            current !== seq.current
          ) {
            return;
          }

          /*
           * A partial streamed translation must
           * not remain on screen if the request
           * ultimately fails.
           */
          setTranslation("");
          setRequestId("");

          const failure =
            cause as TranslationApiError;

          /*
           * The backend also returns guestUsage
           * when the sixth request is blocked.
           *
           * This makes sure the interface still
           * shows "5 of 5" instead of losing the
           * counter on an error.
           */
          if (
            !profile &&
            failure.guestUsage
          ) {
            setGuestUsage(
              failure.guestUsage,
            );
          }

          if (
            !profile &&
            failure.code === "guest_translation_limit"
          ) {
            setError("");
            setUpgrade(false);
            setUpgradeModalOpen(true);
          } else {
            setError(
              failure.message ||
                "Translation failed.",
            );

            setUpgrade(
              Boolean(
                failure.upgradeRecommended,
              ),
            );
          }
        } finally {
          if (
            current === seq.current
          ) {
            abortRef.current =
              null;

            active.current =
              "";

            setLoading(false);
          }
        }
      },
      [
        cancel,
        guestLimitReached,
        maxCharacters,
        profile,
        session?.access_token,
        sourceLanguage,
        targetLanguage,
      ],
    );

  /*
   * Logged-in users keep realtime automatic
   * translation while typing.
   *
   * Guests use the Translate button, Enter,
   * or Paste so normal typing pauses do not
   * accidentally consume several of their five
   * daily translations.
   */
  useEffect(() => {
    const latinWesternArmenianPending =
      sourceLanguage === "hyw" &&
      hasLatinWesternArmenianInput(
        sourceText,
      );

    /*
     * When Western Armenian is selected and the user is
     * typing phonetically in Latin characters, wait for
     * conversion instead of treating the Latin text as
     * Armenian and sending it to GPT.
     */
    if (
      latinWesternArmenianPending
    ) {
      setTranslation("");
      setRequestId("");
      return;
    }

    if (
      profile &&
      !speechActive &&
      debouncedText === sourceText
    ) {
      void translate(
        debouncedText,
      );
    }
  }, [
    debouncedText,
    sourceText,
    sourceLanguage,
    targetLanguage,
    translate,
    profile,
    speechActive,
  ]);

  /*
   * Abort an active stream when the component
   * leaves the page.
   */
  useEffect(
    () => () => {
      abortRef.current?.abort();

      seq.current += 1;
    },
    [],
  );

  function reset() {
    cancel();

    last.current = "";

    setError("");
    setRequestId("");
    setUpgrade(false);
  }

  function sourceChange(
    language: LanguageCode,
  ) {
    reset();

    const targets =
      getTargetsForSource(
        language,
      );

    setSourceLanguage(
      language,
    );

    if (
      !targets.includes(
        targetLanguage,
      )
    ) {
      setTargetLanguage(
        targets[0],
      );
    }
  }

  function targetChange(
    language: LanguageCode,
  ) {
    reset();

    const sources =
      getSourcesForTarget(
        language,
      );

    setTargetLanguage(
      language,
    );

    if (
      !sources.includes(
        sourceLanguage,
      )
    ) {
      setSourceLanguage(
        sources[0],
      );
    }
  }

  function textChange(
    value: string,
  ) {
    /*
     * Immediately stop the previous stream when
     * another character is typed.
     */
    cancel();

    last.current = "";

    setSourceText(
      Array.from(value)
        .slice(
          0,
          maxCharacters,
        )
        .join(""),
    );

    setError("");
    setRequestId("");

    if (!value.trim()) {
      setTranslation("");
    }
  }

  function convertLatinInput() {
    if (
      sourceLanguage !== "hyw" ||
      !hasLatinWesternArmenianInput(
        sourceText,
      )
    ) {
      return;
    }

    const converted =
      latinToWesternArmenian(
        sourceText,
      );

    if (
      converted === sourceText
    ) {
      return;
    }

    /*
     * Use the existing source-text update path so conversion
     * cancels any stale translation stream and preserves the
     * normal character-limit/error behavior.
     *
     * Logged-in automatic translation will then react to the
     * converted Armenian text through the existing debounce.
     * Guests can press Enter or Translate as usual.
     */
    textChange(converted);
  }

  async function paste() {
    try {
      const pasted =
        Array.from(
          await navigator.clipboard.readText(),
        )
          .slice(
            0,
            maxCharacters,
          )
          .join("");

      textChange(pasted);

      if (
        countMeaningfulCharacters(
          pasted,
        ) >= 2
      ) {
        void translate(
          pasted,
          true,
        );
      }
    } catch {
      setError(
        "Clipboard access was blocked. Use Ctrl + V.",
      );
    }
  }

  function swap() {
    if (
      !canSwapLanguages(
        sourceLanguage,
        targetLanguage,
      )
    ) {
      return;
    }

    reset();

    setSourceLanguage(
      targetLanguage,
    );

    setTargetLanguage(
      sourceLanguage,
    );

    setSourceText(
      translation ||
        sourceText,
    );

    setTranslation(
      translation
        ? sourceText
        : "",
    );
  }

  function keyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (
      !profile &&
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();

      if (loading) {
        return;
      }

      void translate(
        sourceText,
        true,
      );
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
                ? `${
                    plan?.name ??
                    "Free"
                  } plan | history ${
                    profile.history_enabled
                      ? "on"
                      : "off"
                  }`
                : guestUsage
                  ? `${guestUsage.used} of ${guestUsage.limit} free translations used today`
                  : `${GUEST_FREE_TRANSLATION_LIMIT} free translations per day | sign in for more`}
            </span>
          </div>

          <button
            className="primary-button desktop-translate-button"
            type="button"
            onClick={() =>
              void translate(
                sourceText,
                true,
              )
            }
            disabled={
              loading ||
              countMeaningfulCharacters(
                sourceText,
              ) < 2
            }
          >
            {loading
              ? "Translating..."
              : guestLimitReached
                ? "Upgrade to continue"
                : "Translate"}
          </button>
        </div>

        <div className="translator-grid">
          <TranslationPanel
            mode="input"
            languageLabel="Translate from"
            languageId="source-language"
            language={
              sourceLanguage
            }
            languageOptions={[
              "en",
              "hyw",
              "hye",
            ]}
            onLanguageChange={
              sourceChange
            }
            value={sourceText}
            onChange={textChange}
            onKeyDown={keyDown}
            onClear={() => {
              reset();

              setSourceText("");
              setTranslation("");
            }}
            onPaste={paste}
            maxCharacters={
              maxCharacters
            }
            keyboardHint={
              profile
                ? "Automatic translation while typing"
                : "Enter to translate - Shift + Enter for new line"
            }
            mobileFooterAction={
              <button
                className="primary-button mobile-source-translate-button"
                type="button"
                onClick={() =>
                  void translate(
                    sourceText,
                    true,
                  )
                }
                disabled={
                  loading ||
                  countMeaningfulCharacters(
                    sourceText,
                  ) < 2
                }
              >
                {loading
                  ? "Translating..."
                  : guestLimitReached
                    ? "Upgrade to continue"
                    : "Translate"}
              </button>
            }
          panelActions={
              <>
                {sourceLanguage ===
                  "hyw" &&
                hasLatinWesternArmenianInput(
                  sourceText,
                ) ? (
                  <button
                    type="button"
                    className="panel-action"
                    disabled={
                      loading
                    }
                    onClick={
                      convertLatinInput
                    }
                    title="Convert phonetic Latin typing to Western Armenian script"
                  >
                    <span
                      aria-hidden="true"
                    >
                      {"Ա"}
                    </span>

                    <span>
                      Latin → Armenian
                    </span>
                  </button>
                ) : null}

                <SpeechToTextButton
                  language={
                    sourceLanguage
                  }
                  currentText={
                    sourceText
                  }
                  maxCharacters={
                    maxCharacters
                  }
                  disabled={
                    loading
                  }
                  onListeningChange={
                    setSpeechActive
                  }
                  onTranscript={(
                    spokenText,
                    final,
                  ) => {
                    /*
                     * Update the source box while
                     * realtime transcription arrives.
                     */
                    textChange(
                      spokenText,
                    );

                    /*
                     * Logged-in users normally
                     * auto-translate while typing.
                     *
                     * During microphone input we wait
                     * until OpenAI marks the speech
                     * turn complete so partial words
                     * do not repeatedly call GPT-5.4.
                     */
                    if (
                      final &&
                      profile &&
                      countMeaningfulCharacters(
                        spokenText,
                      ) >= 2
                    ) {
                      void translate(
                        spokenText,
                        true,
                      );
                    }
                  }}
                />
              </>
            }
          />

          <div className="swap-control-wrap">
            <SwapLanguagesButton
              disabled={
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
            language={
              targetLanguage
            }
            languageOptions={
              getTargetsForSource(
                sourceLanguage,
              )
            }
            onLanguageChange={
              targetChange
            }
            value={translation}
            loading={loading}
            transliteration={
              transliteration
            }
            panelActions={
              targetLanguage ===
                  "hyw" &&
                translation &&
                Array.from(
                  translation,
                ).length <= 200 ? (
                <PremiumFeatureNavButton
                  feature="thesaurus"
                  label="Thesaurus"
                  description="Explore Western Armenian synonyms, antonyms and alternative ways to express this translation."
                  href={`/thesaurus?text=${encodeURIComponent(
                    translation,
                  )}`}
                  className="panel-action thesaurus-output-action"
                />
              ) : undefined
            }
          />
        </div>

        <div className="translator-bottom-bar">
          <StatusMessage
            loading={loading}
            error={error}
            hasTranslation={
              Boolean(
                translation,
              )
            }
            onRetry={() =>
              void translate(
                sourceText,
                true,
              )
            }
          />

          <button
            className="primary-button mobile-translate-button"
            type="button"
            onClick={() =>
              void translate(
                sourceText,
                true,
              )
            }
            disabled={
              loading ||
              countMeaningfulCharacters(
                sourceText,
              ) < 2
            }
          >
            {loading
              ? "Translating..."
              : guestLimitReached
                ? "Upgrade to continue"
                : "Translate"}
          </button>
        </div>
      </div>

      {upgrade && !guestLimitReached && (
        <div className="upgrade-notice">
          Your current limit blocked this request.{" "}

          {profile ? (
            <Link href="/pricing">
              Compare plans
            </Link>
          ) : (
            <>
              <Link href="/signup?next=%2Fpricing">
                Create an account
              </Link>

              {" or "}

              <Link href="/login">
                log in
              </Link>

              {" to continue"}
            </>
          )}
          .
        </div>
      )}

      {!profile && (
        <div className="translator-usage">
          <div
            className="guest-translation-usage"
            aria-live="polite"
          >
            <div>
              <strong>
                {guestUsage
                  ? `${guestUsage.used} of ${guestUsage.limit}`
                  : `0 of ${GUEST_FREE_TRANSLATION_LIMIT}`}
              </strong>{" "}
              free translations used today
            </div>

            <div className="toolbar-note">
              {guestUsage
                ? guestUsage.remaining > 0
                  ? `${guestUsage.remaining} free ${
                      guestUsage.remaining === 1
                        ? "translation"
                        : "translations"
                    } remaining today`
                  : "Free limit reached. Click Translate to view upgrade options."
                : `${GUEST_FREE_TRANSLATION_LIMIT} free translations available today`}
            </div>
          </div>
        </div>
      )}

      {usage && profile && (
        <div className="translator-usage">
          <UsageMeter
            usage={usage}
            compact
          />
        </div>
      )}

      {upgradeModalOpen && !profile && (
        <div
          className="upgrade-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setUpgradeModalOpen(false);
            }
          }}
        >
          <section
            className="upgrade-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upgrade-modal-title"
            aria-describedby="upgrade-modal-description"
          >
            <button
              type="button"
              className="upgrade-modal-close"
              aria-label="Close upgrade options"
              onClick={() => setUpgradeModalOpen(false)}
            >
              {"\u00D7"}</button>

            <p className="eyebrow">
              Free limit reached
            </p>

            <h2 id="upgrade-modal-title">
              Keep translating with a Person or Schools plan
            </h2>

            <p
              id="upgrade-modal-description"
              className="upgrade-modal-copy"
            >
              You have used your 5 free translations for today.
              Choose a plan to unlock a larger translation allowance
              and expanded account features.
            </p>

            <ul className="upgrade-modal-features">
              <li>Larger translation allowance</li>
              <li>Full translation history</li>
              <li>Saved favourites and expanded account tools</li>
            </ul>

            <div className="upgrade-modal-actions">
              <Link
                href="/pricing"
                className="primary-button upgrade-modal-primary"
                onClick={() => setUpgradeModalOpen(false)}
              >
                View plans
              </Link>

              <Link
                href="/signup?next=%2Fpricing"
                className="upgrade-modal-secondary premium-modal-link"
                onClick={() => setUpgradeModalOpen(false)}
              >
                Sign up
              </Link>

              <Link
                href="/login"
                className="upgrade-modal-secondary premium-modal-link"
                onClick={() => setUpgradeModalOpen(false)}
              >
                Log in
              </Link>
            </div>

            <p className="upgrade-modal-note">
              Create an account or log in to continue with account and plan options.
            </p>
          </section>
        </div>
      )}

      {requestId &&
        translation && (
          <TranslationFeedback
            requestId={
              requestId
            }
            sourceText={
              sourceText
            }
            translation={
              translation
            }
            sourceLanguage={
              sourceLanguage
            }
            targetLanguage={
              targetLanguage
            }
          />
        )}
    </>
  );
}


