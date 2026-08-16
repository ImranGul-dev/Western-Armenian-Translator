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
  requestWordBreakdown,
  type WordBreakdownResult,
  type WordBreakdownWord,
} from "@/lib/word-breakdown-api";

import {
  transliterateWesternArmenian,
} from "@/lib/western-armenian-transliteration";

function normalizedMeaning(
  value: string,
): string {
  return value
    .trim()
    .replace(
      /\s+/gu,
      " ",
    )
    .toLocaleLowerCase();
}

function ArmenianText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const transliteration =
    transliterateWesternArmenian(
      text,
    );

  return (
    <div className="word-breakdown-armenian">
      <span
        className={`armenian-text ${className}`.trim()}
      >
        {text}
      </span>

      {transliteration &&
      transliteration !== text ? (
        <span className="transliteration-text word-breakdown-transliteration">
          {transliteration}
        </span>
      ) : null}
    </div>
  );
}

function WordCard({
  word,
}: {
  word: WordBreakdownWord;
}) {
  return (
    <article className="word-breakdown-word-card">
      <div className="word-breakdown-word-heading">
        <ArmenianText
          text={word.text}
          className="word-breakdown-word"
        />

        {word.partOfSpeech ? (
          <span className="word-breakdown-part">
            {word.partOfSpeech}
          </span>
        ) : null}
      </div>

      <div className="word-breakdown-word-details">
        <div>
          <span className="word-breakdown-detail-label">
            Meaning
          </span>

          <strong>
            {word.meaning}
          </strong>
        </div>

        {word.baseForm ? (
          <div>
            <span className="word-breakdown-detail-label">
              Base form
            </span>

            <ArmenianText
              text={word.baseForm}
              className="word-breakdown-base-form"
            />
          </div>
        ) : null}

        {word.grammarNote ? (
          <div className="word-breakdown-grammar-note">
            <span className="word-breakdown-detail-label">
              Grammar
            </span>

            <p>
              {word.grammarNote}
            </p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function WordBreakdownPage() {
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
  ] =
    useState("");

  const [
    result,
    setResult,
  ] =
    useState<WordBreakdownResult | null>(
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

    if (!prefill) {
      return;
    }

    setText(
      Array.from(prefill)
        .slice(
          0,
          500,
        )
        .join(""),
    );
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const hasAccess =
    hasPaidFeatureAccess(
      "word_breakdown",
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
    setResult(null);

    try {
      const next =
        await requestWordBreakdown(
          value,
          session.access_token,
          controller.signal,
        );

      setResult(
        next,
      );
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
          : "Word Breakdown failed. Please try again.",
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

  const showLiteralMeaning =
    Boolean(
      result?.literalMeaning,
    ) &&
    normalizedMeaning(
      result?.literalMeaning ??
        "",
    ) !==
      normalizedMeaning(
        result?.naturalMeaning ??
          "",
      );

  return (
    <ProtectedRoute>
      <SiteFrame compact>
        <main className="word-breakdown-page">
          <section className="word-breakdown-hero">
            <p className="eyebrow">
              Paid learning tool
            </p>

            <h1>
              Western Armenian Word Breakdown
            </h1>

            <p>
              Understand how a Western Armenian word,
              phrase or short sentence works through
              contextual meanings, base forms and
              concise grammar explanations.
            </p>
          </section>

          {!authLoading &&
          !hasAccess ? (
            <section className="word-breakdown-access-card">
              <div>
                <p className="eyebrow">
                  Paid feature
                </p>

                <h2>
                  Unlock Word Breakdown
                </h2>

                <p>
                  Word Breakdown is included with
                  Person and Schools access.
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
              <section className="word-breakdown-search-card">
                <form
                  className="word-breakdown-form"
                  onSubmit={submit}
                >
                  <label
                    htmlFor="word-breakdown-text"
                  >
                    Western Armenian text
                  </label>

                  <textarea
                    id="word-breakdown-text"
                    className="word-breakdown-input armenian-text"
                    value={text}
                    maxLength={500}
                    rows={4}
                    placeholder="Enter or paste a Western Armenian word, phrase or short sentence"
                    onChange={(event) =>
                      setText(
                        event.target.value,
                      )
                    }
                  />

                  <div className="word-breakdown-form-footer">
                    <span className="word-breakdown-helper">
                      Tip: open Word Breakdown directly
                      from a Western Armenian translation.
                    </span>

                    <span className="word-breakdown-counter">
                      {Array.from(text).length}/500
                    </span>
                  </div>

                  <button
                    type="submit"
                    className="primary-button word-breakdown-submit"
                    disabled={
                      loading ||
                      !text.trim()
                    }
                  >
                    {loading
                      ? "Breaking down..."
                      : "Break down text"}
                  </button>
                </form>
              </section>

              {error ? (
                <div
                  className="word-breakdown-message word-breakdown-error"
                  role="alert"
                >
                  {error}
                </div>
              ) : null}

              {result ? (
                <section className="word-breakdown-results">
                  <div className="word-breakdown-query-summary">
                    <span className="word-breakdown-query-label">
                      Breakdown for
                    </span>

                    <ArmenianText
                      text={result.input}
                      className="word-breakdown-query-text"
                    />
                  </div>

                  <div className="word-breakdown-meaning-grid">
                    <article className="word-breakdown-meaning-card">
                      <span className="word-breakdown-detail-label">
                        Natural meaning
                      </span>

                      <p>
                        {result.naturalMeaning}
                      </p>
                    </article>

                    {showLiteralMeaning ? (
                      <article className="word-breakdown-meaning-card">
                        <span className="word-breakdown-detail-label">
                          Literal meaning
                        </span>

                        <p>
                          {result.literalMeaning}
                        </p>
                      </article>
                    ) : null}
                  </div>

                  <section className="word-breakdown-section">
                    <div className="word-breakdown-section-heading">
                      <div>
                        <p className="eyebrow">
                          Word by word
                        </p>

                        <h2>
                          How the expression is built
                        </h2>
                      </div>

                      <span className="word-breakdown-count">
                        {result.words.length}{" "}
                        {result.words.length === 1
                          ? "item"
                          : "items"}
                      </span>
                    </div>

                    <div className="word-breakdown-word-grid">
                      {result.words.map(
                        (
                          word,
                          index,
                        ) => (
                          <WordCard
                            key={`${word.text}-${index}`}
                            word={word}
                          />
                        ),
                      )}
                    </div>
                  </section>

                  {result.notes.length ? (
                    <section className="word-breakdown-section word-breakdown-notes">
                      <div className="word-breakdown-section-heading">
                        <div>
                          <p className="eyebrow">
                            Learning notes
                          </p>

                          <h2>
                            Useful context
                          </h2>
                        </div>
                      </div>

                      <ul>
                        {result.notes.map(
                          (
                            note,
                            index,
                          ) => (
                            <li
                              key={`${note}-${index}`}
                            >
                              {note}
                            </li>
                          ),
                        )}
                      </ul>
                    </section>
                  ) : null}
                </section>
              ) : null}
            </>
          )}
        </main>
      </SiteFrame>
    </ProtectedRoute>
  );
}
