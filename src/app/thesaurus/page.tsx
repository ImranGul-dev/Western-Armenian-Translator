"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ProtectedRoute,
} from "@/components/ProtectedRoute";

import {
  SiteFrame,
} from "@/components/SiteFrame";

import {
  useAuth,
} from "@/contexts/AuthContext";

import {
  hasPaidFeatureAccess,
} from "@/lib/paid-feature-access";

import {
  saveSavedPhrase,
} from "@/lib/saved-phrases-api";

import {
  requestThesaurus,
  type ThesaurusItem,
  type ThesaurusLanguage,
  type ThesaurusResult,
} from "@/lib/thesaurus-api";

import {
  transliterateWesternArmenian,
} from "@/lib/western-armenian-transliteration";

import "./thesaurus-upgrades.css";

function ArmenianResult({
  item,
  language,
  saving,
  saved,
  onSave,
}: {
  item: ThesaurusItem;
  language: ThesaurusLanguage;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
}) {
  const transliteration =
    language === "hyw"
      ? transliterateWesternArmenian(
          item.text,
        )
      : "";

  return (
    <div className="thesaurus-result-item">
      <div className="thesaurus-result-copy">
        <span className="armenian-text thesaurus-result-word">
          {item.text}
        </span>

        {transliteration &&
          transliteration !== item.text && (
            <span className="transliteration-text thesaurus-result-transliteration">
              {transliteration}
            </span>
          )}

        {item.meaning ? (
          <span className="thesaurus-result-meaning">
            {item.meaning}
          </span>
        ) : null}
      </div>

      <button
        type="button"
        className={`thesaurus-save-button ${
          saved
            ? "thesaurus-save-button-saved"
            : ""
        }`}
        disabled={saving || saved}
        onClick={onSave}
        aria-label={
          saved
            ? `${item.text} saved`
            : `Save ${item.text}`
        }
        title={
          saved
            ? "Saved"
            : "Save to Saved Phrases"
        }
      >
        <span aria-hidden="true">
          {saved ? "✓" : "+"}
        </span>
        <span>
          {saved
            ? "Saved"
            : saving
              ? "Saving..."
              : "Save"}
        </span>
      </button>
    </div>
  );
}

function ResultSection({
  title,
  description,
  items,
  emptyMessage,
  language,
  savingKey,
  savedKeys,
  onSave,
}: {
  title: string;
  description: string;
  items: ThesaurusItem[];
  emptyMessage: string;
  language: ThesaurusLanguage;
  savingKey: string;
  savedKeys: Set<string>;
  onSave: (item: ThesaurusItem) => void;
}) {
  return (
    <section className="thesaurus-result-card">
      <div className="thesaurus-result-card-heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>

      {items.length ? (
        <div className="thesaurus-result-list">
          {items.map(
            (
              item,
              index,
            ) => {
              const key =
                `${language}:${item.text}:${item.meaning}`;

              return (
                <ArmenianResult
                  key={`${item.text}-${index}`}
                  item={item}
                  language={language}
                  saving={savingKey === key}
                  saved={savedKeys.has(key)}
                  onSave={() => onSave(item)}
                />
              );
            },
          )}
        </div>
      ) : (
        <p className="thesaurus-empty">
          {emptyMessage}
        </p>
      )}
    </section>
  );
}

export default function ThesaurusPage() {
  const {
    user,
    profile,
    plan,
    session,
    loading: authLoading,
  } = useAuth();

  const [
    text,
    setText,
  ] = useState("");

  const [
    language,
    setLanguage,
  ] =
    useState<ThesaurusLanguage>(
      "hyw",
    );

  const [
    result,
    setResult,
  ] =
    useState<ThesaurusResult | null>(
      null,
    );

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    saveMessage,
    setSaveMessage,
  ] = useState("");

  const [
    savingKey,
    setSavingKey,
  ] = useState("");

  const [
    savedKeys,
    setSavedKeys,
  ] = useState<Set<string>>(
    () => new Set(),
  );

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const abortRef =
    useRef<AbortController | null>(
      null,
    );

  useEffect(() => {
    const params =
      new URLSearchParams(
        window.location.search,
      );

    const prefill =
      params
        .get("text")
        ?.trim();

    const requestedLanguage =
      params.get("language");

    if (
      requestedLanguage === "hye" ||
      requestedLanguage === "hyw"
    ) {
      setLanguage(
        requestedLanguage,
      );
    }

    if (!prefill) {
      return;
    }

    setText(
      Array.from(prefill)
        .slice(0, 200)
        .join(""),
    );
  }, []);

  const hasAccess =
    hasPaidFeatureAccess(
      "thesaurus",
      {
        isAuthenticated:
          Boolean(user),

        role:
          profile?.role,

        planSlug:
          plan?.slug,
      },
    );

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const value =
      text.trim();

    if (
      !value ||
      !session?.access_token ||
      loading
    ) {
      return;
    }

    abortRef.current?.abort();

    const controller =
      new AbortController();

    abortRef.current =
      controller;

    setLoading(true);
    setError(null);
    setSaveMessage("");
    setSavedKeys(new Set());
    setResult(null);

    try {
      const next =
        await requestThesaurus(
          value,
          session.access_token,
          language,
          controller.signal,
        );

      setResult(next);
    } catch (cause) {
      if (
        cause instanceof DOMException &&
        cause.name ===
          "AbortError"
      ) {
        return;
      }

      setError(
        cause instanceof Error
          ? cause.message
          : "Thesaurus lookup failed. Please try again.",
      );
    } finally {
      if (
        abortRef.current ===
        controller
      ) {
        abortRef.current =
          null;

        setLoading(false);
      }
    }
  }

  async function saveItem(
    item: ThesaurusItem,
  ) {
    if (
      !session?.access_token ||
      !item.text.trim() ||
      !item.meaning.trim()
    ) {
      return;
    }

    const key =
      `${language}:${item.text}:${item.meaning}`;

    if (
      savingKey ||
      savedKeys.has(key)
    ) {
      return;
    }

    setSavingKey(key);
    setSaveMessage("");

    try {
      await saveSavedPhrase(
        session.access_token,
        {
          sourceText:
            item.text,
          translatedText:
            item.meaning,
          sourceLanguage:
            language,
          targetLanguage:
            "en",
        },
      );

      setSavedKeys(
        (current) => {
          const next =
            new Set(current);

          next.add(key);
          return next;
        },
      );

      setSaveMessage(
        `Saved ${item.text} to Saved Phrases.`,
      );
    } catch (cause) {
      setSaveMessage(
        cause instanceof Error
          ? cause.message
          : "Could not save this word. Please try again.",
      );
    } finally {
      setSavingKey("");
    }
  }

  const dialectLabel =
    language === "hye"
      ? "Eastern Armenian"
      : "Western Armenian";

  return (
    <ProtectedRoute>
      <SiteFrame compact>
        <main className="thesaurus-page">
          <section className="thesaurus-hero">
            <p className="eyebrow">
              Paid learning tool
            </p>

            <h1>
              Armenian Thesaurus
            </h1>

            <p>
              Explore synonyms,
              antonyms, English meanings
              and natural alternative
              ways to express Armenian
              words and phrases.
            </p>
          </section>

          {!authLoading &&
          !hasAccess ? (
            <section className="thesaurus-access-card">
              <div>
                <p className="eyebrow">
                  Paid feature
                </p>

                <h2>
                  Unlock the Thesaurus
                </h2>

                <p>
                  Thesaurus access is
                  included with Person
                  and Schools access.
                </p>
              </div>

              <Link
                href="/pricing"
                className="primary-button"
              >
                View plans
              </Link>
            </section>
          ) : (
            <>
              <section className="thesaurus-search-card">
                <div
                  className="thesaurus-language-toggle"
                  role="group"
                  aria-label="Armenian dialect"
                >
                  <button
                    type="button"
                    className={
                      language === "hyw"
                        ? "active"
                        : ""
                    }
                    onClick={() => {
                      setLanguage("hyw");
                      setResult(null);
                      setError(null);
                    }}
                  >
                    Western Armenian
                  </button>

                  <button
                    type="button"
                    className={
                      language === "hye"
                        ? "active"
                        : ""
                    }
                    onClick={() => {
                      setLanguage("hye");
                      setResult(null);
                      setError(null);
                    }}
                  >
                    Eastern Armenian
                  </button>
                </div>

                <form
                  className="thesaurus-form"
                  onSubmit={submit}
                >
                  <label
                    htmlFor="thesaurus-text"
                  >
                    {dialectLabel} word or phrase
                  </label>

                  <div className="thesaurus-search-row">
                    <input
                      id="thesaurus-text"
                      className="thesaurus-input"
                      type="text"
                      value={text}
                      maxLength={200}
                      autoComplete="off"
                      placeholder="Armenian script, Latin transliteration, or English"
                      onChange={(
                        event,
                      ) =>
                        setText(
                          event.target
                            .value,
                        )
                      }
                    />

                    <button
                      type="submit"
                      className="primary-button thesaurus-search-button"
                      disabled={
                        loading ||
                        !text.trim()
                      }
                    >
                      {loading
                        ? "Searching..."
                        : "Find alternatives"}
                    </button>
                  </div>

                  <p className="thesaurus-helper">
                    You can type Armenian,
                    phonetic Latin Armenian,
                    or an English word such
                    as “happy”.
                  </p>
                </form>
              </section>

              {error && (
                <div
                  className="thesaurus-message thesaurus-error"
                  role="alert"
                >
                  {error}
                </div>
              )}

              {saveMessage ? (
                <div
                  className="thesaurus-message thesaurus-save-message"
                  role="status"
                >
                  {saveMessage}
                </div>
              ) : null}

              {result && (
                <section className="thesaurus-results">
                  <div className="thesaurus-query-summary">
                    <span className="thesaurus-query-label">
                      Results for
                    </span>

                    <strong className="armenian-text">
                      {result.input}
                    </strong>

                    {result.inputMeaning ? (
                      <span className="thesaurus-query-meaning">
                        {result.inputMeaning}
                      </span>
                    ) : null}

                    {result.language === "hyw" &&
                    (() => {
                      const latin =
                        transliterateWesternArmenian(
                          result.input,
                        );

                      return latin &&
                        latin !==
                          result.input ? (
                        <span className="transliteration-text">
                          {latin}
                        </span>
                      ) : null;
                    })()}
                  </div>

                  <div className="thesaurus-results-grid">
                    <ResultSection
                      title="Synonyms"
                      description="Words with the same or a closely related meaning."
                      items={
                        result.synonyms
                      }
                      emptyMessage="No clear synonyms were found."
                      language={result.language}
                      savingKey={savingKey}
                      savedKeys={savedKeys}
                      onSave={(item) => void saveItem(item)}
                    />

                    <ResultSection
                      title="Antonyms"
                      description="Words with an opposite meaning where a natural antonym exists."
                      items={
                        result.antonyms
                      }
                      emptyMessage="No clear antonyms were found for this word or phrase."
                      language={result.language}
                      savingKey={savingKey}
                      savedKeys={savedKeys}
                      onSave={(item) => void saveItem(item)}
                    />

                    <ResultSection
                      title="Alternative phrasing"
                      description={`Natural ${dialectLabel} ways to express the same idea.`}
                      items={
                        result.alternatives
                      }
                      emptyMessage="No alternative phrasing was found."
                      language={result.language}
                      savingKey={savingKey}
                      savedKeys={savedKeys}
                      onSave={(item) => void saveItem(item)}
                    />
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      </SiteFrame>
    </ProtectedRoute>
  );
}
