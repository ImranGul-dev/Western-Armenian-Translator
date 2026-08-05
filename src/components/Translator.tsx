"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { StatusMessage } from "@/components/StatusMessage";
import { SwapLanguagesButton } from "@/components/SwapLanguagesButton";
import { TranslationPanel } from "@/components/TranslationPanel";
import { TranslationFeedback } from "@/components/TranslationFeedback";
import { UsageMeter } from "@/components/UsageMeter";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAuth } from "@/contexts/AuthContext";
import { canSwapLanguages, getSourcesForTarget, getTargetsForSource, type LanguageCode } from "@/lib/languages";
import { FALLBACK_PUBLIC_TRANSLATION_SETTINGS, maxCharactersFor, type PublicTranslationSettings } from "@/lib/plans";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { requestTranslation } from "@/lib/translation-api";
import { countMeaningfulCharacters } from "@/lib/validation";
import type { UsageSummary } from "@/types/database";

function requestSignature(text: string, source: LanguageCode, target: LanguageCode) {
  return `${source}\0${target}\0${text}`;
}

export function Translator() {
  const { session, profile, plan } = useAuth();
  const [sourceLanguage, setSourceLanguage] = useState<LanguageCode>("en");
  const [targetLanguage, setTargetLanguage] = useState<LanguageCode>("hyw");
  const [sourceText, setSourceText] = useState("");
  const [translation, setTranslation] = useState("");
  const [requestId, setRequestId] = useState("");
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [publicSettings, setPublicSettings] = useState<PublicTranslationSettings>(FALLBACK_PUBLIC_TRANSLATION_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [upgrade, setUpgrade] = useState(false);
  const debouncedText = useDebouncedValue(sourceText, 700);
  const abortRef = useRef<AbortController | null>(null);
  const seq = useRef(0);
  const last = useRef("");
  const maxCharacters = maxCharactersFor(plan, profile?.role, publicSettings.anonymous.max_characters_per_request);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase.rpc("get_public_translation_settings").then(({ data }) => {
      if (data && typeof data === "object") {
        setPublicSettings(data as PublicTranslationSettings);
      }
    });
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("wat-prefill");
      if (raw) {
        const parsed = JSON.parse(raw) as { text?: string; source?: LanguageCode; target?: LanguageCode };
        if (parsed.text) {
          setSourceText(parsed.text);
          if (parsed.source) setSourceLanguage(parsed.source);
          if (parsed.target) setTargetLanguage(parsed.target);
        }
        localStorage.removeItem("wat-prefill");
      }
    } catch {
      // Invalid local prefill data is safely ignored.
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    seq.current += 1;
    setLoading(false);
  }, []);

  const translate = useCallback(async (text: string, force = false) => {
    if (!text.trim() || countMeaningfulCharacters(text) < 2) {
      cancel();
      setError("");
      if (!text.trim()) {
        setTranslation("");
        setRequestId("");
      }
      return;
    }
    if (Array.from(text).length > maxCharacters) {
      setError(`This text is longer than your current plan allows (${maxCharacters.toLocaleString()} characters).`);
      setUpgrade(true);
      return;
    }

    const signature = requestSignature(text, sourceLanguage, targetLanguage);
    if (!force && signature === last.current) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const current = ++seq.current;
    setLoading(true);
    setError("");
    setUpgrade(false);

    try {
      const data = await requestTranslation(
        { text, sourceLanguage, targetLanguage },
        controller.signal,
        session?.access_token
      );
      if (current !== seq.current) return;
      last.current = signature;
      setTranslation(data.translation);
      setRequestId(data.requestId);
      setUsage(data.usage ?? null);
    } catch (cause) {
      if (controller.signal.aborted || current !== seq.current) return;
      const failure = cause as Error & { upgradeRecommended?: boolean };
      setError(failure.message || "Translation failed.");
      setUpgrade(Boolean(failure.upgradeRecommended));
    } finally {
      if (current === seq.current) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  }, [cancel, maxCharacters, session?.access_token, sourceLanguage, targetLanguage]);

  useEffect(() => {
    if (debouncedText === sourceText) void translate(debouncedText);
  }, [debouncedText, sourceText, sourceLanguage, targetLanguage, translate]);

  useEffect(() => () => {
    abortRef.current?.abort();
    seq.current += 1;
  }, []);

  function reset() {
    cancel();
    last.current = "";
    setError("");
    setRequestId("");
    setUpgrade(false);
  }

  function sourceChange(language: LanguageCode) {
    reset();
    const targets = getTargetsForSource(language);
    setSourceLanguage(language);
    if (!targets.includes(targetLanguage)) setTargetLanguage(targets[0]);
  }

  function targetChange(language: LanguageCode) {
    reset();
    const sources = getSourcesForTarget(language);
    setTargetLanguage(language);
    if (!sources.includes(sourceLanguage)) setSourceLanguage(sources[0]);
  }

  function textChange(value: string) {
    cancel();
    last.current = "";
    setSourceText(Array.from(value).slice(0, maxCharacters).join(""));
    setError("");
    setRequestId("");
    if (!value.trim()) setTranslation("");
  }

  async function paste() {
    try {
      textChange(await navigator.clipboard.readText());
    } catch {
      setError("Clipboard access was blocked. Use Ctrl + V.");
    }
  }

  function swap() {
    if (!canSwapLanguages(sourceLanguage, targetLanguage)) return;
    reset();
    setSourceLanguage(targetLanguage);
    setTargetLanguage(sourceLanguage);
    setSourceText(translation || sourceText);
    setTranslation(translation ? sourceText : "");
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.ctrlKey && event.key === "Enter") {
      event.preventDefault();
      void translate(sourceText, true);
    }
  }

  return (
    <>
      <div className="translator-wrap">
        <div className="translator-toolbar">
          <div>
            <span className="toolbar-kicker">Translation workspace</span>
            <span className="toolbar-note">
              {profile ? `${plan?.name ?? "Free"} plan · history ${profile.history_enabled ? "on" : "off"}` : "Free access · sign in to save history"}
            </span>
          </div>
          <button
            className="primary-button desktop-translate-button"
            type="button"
            onClick={() => void translate(sourceText, true)}
            disabled={loading || countMeaningfulCharacters(sourceText) < 2}
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
          />
          <div className="swap-control-wrap">
            <SwapLanguagesButton disabled={!canSwapLanguages(sourceLanguage, targetLanguage)} onSwap={swap} />
          </div>
          <TranslationPanel
            mode="output"
            languageLabel="Translate to"
            languageId="target-language"
            language={targetLanguage}
            languageOptions={getTargetsForSource(sourceLanguage)}
            onLanguageChange={targetChange}
            value={translation}
            loading={loading}
          />
        </div>
        <div className="translator-bottom-bar">
          <StatusMessage
            loading={loading}
            error={error}
            hasTranslation={Boolean(translation)}
            onRetry={() => void translate(sourceText, true)}
          />
          <button
            className="primary-button mobile-translate-button"
            type="button"
            onClick={() => void translate(sourceText, true)}
            disabled={loading || countMeaningfulCharacters(sourceText) < 2}
          >
            {loading ? "Translating…" : "Translate"}
          </button>
        </div>
      </div>
      {upgrade && (
        <div className="upgrade-notice">
          Your current limit blocked this request. {profile
            ? <Link href="/pricing">Compare plans</Link>
            : <Link href="/signup?next=%2Fpricing">Create an account and choose a plan</Link>}.
        </div>
      )}
      {usage && profile && <div className="translator-usage"><UsageMeter usage={usage} compact /></div>}
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
