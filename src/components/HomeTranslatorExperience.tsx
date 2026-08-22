"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PremiumFeatureNavButton } from "@/components/PremiumFeatureNavButton";
import { Translator } from "@/components/Translator";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./HomeTranslatorExperience.module.css";
import finalPolish from "./HomeTranslatorFinalPolish.module.css";

interface RecentTranslation {
  id: string;
  source_text: string;
  translated_text: string;
  created_at: string;
}

const EXAMPLES = [
  { label: "Parev tsez (Hello)", text: "Hello" },
  { label: "Shnorhakalutyun (Thank you)", text: "Thank you" },
  { label: "Inch'pes es? (How are you?)", text: "How are you?" },
  { label: "Yes (Yes)", text: "Yes" },
  { label: "Voch (No)", text: "No" },
] as const;

function findButtonByText(selector: string, text: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>(selector))
    .find((button) => button.textContent?.toLowerCase().includes(text.toLowerCase()));
}

function clickVoiceInput() {
  document.querySelector<HTMLButtonElement>(".input-panel .speech-input-button")?.click();
}

function clickPaste() {
  document.querySelector<HTMLButtonElement>('.input-panel button[aria-label="Paste text"]')?.click();
}

function clickClear() {
  findButtonByText(".input-panel .panel-actions button", "clear")?.click();
}

function clickTextToSpeech() {
  document.querySelector<HTMLButtonElement>(".output-panel .panel-header .voice-listen-control button")?.click();
}

function currentTranslationText() {
  const result = document.querySelector<HTMLElement>(".translation-output");
  if (!result || result.querySelector(".output-placeholder")) return "";
  return result.textContent?.trim() || "";
}

function downloadText(text: string, filename: string) {
  if (!text) return;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadCurrentTranslation() {
  downloadText(currentTranslationText(), "tun-western-armenian-translation.txt");
}

function formatRelativeTime(createdAt: string) {
  const created = new Date(createdAt).getTime();
  const diffSeconds = Math.max(0, Math.round((Date.now() - created) / 1000));

  if (diffSeconds < 45) return "just now";

  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function useCurrentTranslationReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const update = () => setReady(Boolean(currentTranslationText()));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return ready;
}

export function HomeTranslatorExperience() {
  const { profile } = useAuth();
  const [recent, setRecent] = useState<RecentTranslation[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const translationReady = useCurrentTranslationReady();

  useEffect(() => {
    if (!profile?.id || !profile.history_enabled) {
      setRecent([]);
      return;
    }

    void getSupabaseBrowserClient()
      .from("translation_history")
      .select("id,source_text,translated_text,created_at")
      .order("created_at", { ascending: false })
      .limit(3)
      .then(({ data }) => setRecent((data as RecentTranslation[]) || []));
  }, [profile?.history_enabled, profile?.id]);

  const historyMessage = useMemo(() => {
    if (!profile) return "Log in to keep recent translations.";
    if (!profile.history_enabled) return "Translation history is turned off in Settings.";
    return "Your recent translations will appear here.";
  }, [profile]);

  function useExample(text: string) {
    localStorage.setItem("wat-prefill", JSON.stringify({ text, source: "en", target: "hyw" }));
    location.reload();
  }

  async function copyRecentTranslation(item: RecentTranslation) {
    await navigator.clipboard.writeText(item.translated_text);
    setCopiedId(item.id);
    window.setTimeout(() => setCopiedId(current => current === item.id ? null : current), 1400);
  }

  function downloadRecentTranslation(item: RecentTranslation) {
    downloadText(
      `${item.source_text}\n\n${item.translated_text}`,
      "tun-recent-translation.txt",
    );
  }

  return (
    <div className={`${styles.experience} ${finalPolish.experiencePolish}`}>
      <section className={styles.workspace} aria-label="Western Armenian translation workspace">
        <div className={styles.translatorColumn}>
          <Translator />

          <div className={styles.quickActions} aria-label="Quick actions">
            <button type="button" className={styles.quickAction} onClick={clickVoiceInput}>
              <span className={styles.quickIcon} aria-hidden="true">🎤</span>
              <span><strong>Voice Input</strong><small>Speak to translate</small></span>
            </button>

            <button type="button" className={styles.quickAction} onClick={clickPaste}>
              <span className={styles.quickIcon} aria-hidden="true">▣</span>
              <span><strong>Paste Text</strong><small>Paste from clipboard</small></span>
            </button>

            <button type="button" className={styles.quickAction} onClick={clickClear}>
              <span className={styles.quickIcon} aria-hidden="true">×</span>
              <span><strong>Clear All</strong><small>Reset both fields</small></span>
            </button>

            <button type="button" className={styles.quickAction} disabled={!translationReady} onClick={downloadCurrentTranslation}>
              <span className={styles.quickIcon} aria-hidden="true">⇩</span>
              <span><strong>Download</strong><small>Save as a .txt file</small></span>
            </button>
          </div>
        </div>

        <aside className={styles.aiCard}>
          <div className={styles.aiTopRow}>
            <span className={styles.aiIcon} aria-hidden="true">☵</span>
            <span className={styles.newBadge}>New</span>
          </div>
          <h2>Practice Armenian with AI Chatbot</h2>
          <p>Have real conversations, practise speaking, and get helpful feedback.</p>
          <PremiumFeatureNavButton
            feature="role_play"
            label="Start a Conversation →"
            description="Practise real-world Western Armenian conversations with voice or text."
            href="/role-play"
            className={styles.aiButton}
          />
          <ul>
            <li>Realistic conversations</li>
            <li>Corrects and explains</li>
            <li>Helps you improve</li>
          </ul>
          <div className={styles.aiFooter}>
            <span aria-hidden="true">💬</span>
            <span>Բարի՛ եկար</span>
          </div>
        </aside>
      </section>

      <section className={styles.lowerGrid}>
        <div className={styles.learningColumn}>
          <section className={styles.learningCard}>
            <div className={styles.sectionHeading}>
              <span aria-hidden="true">✦</span>
              <h2>Smart Learning Tools</h2>
            </div>

            <div className={styles.learningTools}>
              <PremiumFeatureNavButton
                feature="thesaurus"
                label="Thesaurus"
                description="Find Western Armenian synonyms, antonyms and related words."
                href="/thesaurus"
                className={styles.learningTool}
              />

              <button type="button" className={styles.learningTool} onClick={clickTextToSpeech} disabled={!translationReady}>
                <strong>Text to Speech</strong>
                <small>Listen to the translation in a natural Western Armenian voice</small>
                <span aria-hidden="true">›</span>
              </button>

              <PremiumFeatureNavButton
                feature="word_breakdown"
                label="Word Breakdown"
                description="Explore word-by-word meaning, structure and grammar."
                href="/word-breakdown"
                className={styles.learningTool}
              />
            </div>
          </section>

          <section className={styles.exampleCard}>
            <div className={styles.sectionHeading}>
              <span aria-hidden="true">✦</span>
              <h2>Try an example</h2>
            </div>
            <div className={styles.exampleChips}>
              {EXAMPLES.map((example) => (
                <button key={example.text} type="button" onClick={() => useExample(example.text)}>{example.label}</button>
              ))}
            </div>
          </section>
        </div>

        <section className={styles.historyCard}>
          <div className={styles.historyHeading}>
            <div className={styles.sectionHeading}>
              <span aria-hidden="true">◷</span>
              <h2>Recent Translations</h2>
            </div>
            {profile && <Link href="/dashboard/history">View all history</Link>}
          </div>

          {recent.length ? (
            <div className={`${styles.historyList} ${finalPolish.historyListPolish}`}>
              {recent.map((item) => (
                <article key={item.id}>
                  <span className={finalPolish.historySource}>{item.source_text}</span>
                  <strong className={finalPolish.historyTranslation}>{item.translated_text}</strong>
                  <div className={finalPolish.historyActions}>
                    <button
                      type="button"
                      className={finalPolish.historyActionButton}
                      aria-label="Copy translated text"
                      title={copiedId === item.id ? "Copied" : "Copy translation"}
                      onClick={() => void copyRecentTranslation(item)}
                    >
                      {copiedId === item.id ? "✓" : "▣"}
                    </button>
                    <button
                      type="button"
                      className={finalPolish.historyActionButton}
                      aria-label="Download translation"
                      title="Download translation"
                      onClick={() => downloadRecentTranslation(item)}
                    >
                      ⇩
                    </button>
                  </div>
                  <small className={finalPolish.historyTime}>{formatRelativeTime(item.created_at)}</small>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.emptyHistory}>{historyMessage}</div>
          )}
        </section>
      </section>
    </div>
  );
}
