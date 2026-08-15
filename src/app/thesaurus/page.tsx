"use client";

import Link from "next/link";
import {
  FormEvent,
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
  requestThesaurus,
  type ThesaurusResult,
} from "@/lib/thesaurus-api";

import {
  transliterateWesternArmenian,
} from "@/lib/western-armenian-transliteration";

function ArmenianResult({
  text,
}: {
  text: string;
}) {
  const transliteration =
    transliterateWesternArmenian(
      text,
    );

  return (
    <div className="thesaurus-result-item">
      <span className="armenian-text thesaurus-result-word">
        {text}
      </span>

      {transliteration &&
        transliteration !== text && (
          <span className="transliteration-text thesaurus-result-transliteration">
            {transliteration}
          </span>
        )}
    </div>
  );
}

function ResultSection({
  title,
  description,
  items,
  emptyMessage,
}: {
  title: string;
  description: string;
  items: string[];
  emptyMessage: string;
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
            ) => (
              <ArmenianResult
                key={`${item}-${index}`}
                text={item}
              />
            ),
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
    loading,
    setLoading,
  ] =
    useState(false);

  const abortRef =
    useRef<AbortController | null>(
      null,
    );

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
    setResult(null);

    try {
      const next =
        await requestThesaurus(
          value,
          session.access_token,
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

  return (
    <ProtectedRoute>
      <SiteFrame compact>
        <main className="thesaurus-page">
          <section className="thesaurus-hero">
            <p className="eyebrow">
              Paid learning tool
            </p>

            <h1>
              Western Armenian Thesaurus
            </h1>

            <p>
              Explore synonyms,
              antonyms and natural
              alternative ways to
              express Western Armenian
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
                <form
                  className="thesaurus-form"
                  onSubmit={submit}
                >
                  <label
                    htmlFor="thesaurus-text"
                  >
                    Western Armenian
                    word or phrase
                  </label>

                  <div className="thesaurus-search-row">
                    <input
                      id="thesaurus-text"
                      className="thesaurus-input"
                      type="text"
                      value={text}
                      maxLength={200}
                      autoComplete="off"
                      placeholder="Enter or paste Western Armenian text"
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
                    Tip: paste a word or
                    phrase directly from
                    your Western Armenian
                    translation.
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

              {result && (
                <section className="thesaurus-results">
                  <div className="thesaurus-query-summary">
                    <span className="thesaurus-query-label">
                      Results for
                    </span>

                    <strong className="armenian-text">
                      {result.input}
                    </strong>

                    {(() => {
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
                    />

                    <ResultSection
                      title="Antonyms"
                      description="Words with an opposite meaning where a natural antonym exists."
                      items={
                        result.antonyms
                      }
                      emptyMessage="No clear antonyms were found for this word or phrase."
                    />

                    <ResultSection
                      title="Alternative phrasing"
                      description="Natural Western Armenian ways to express the same idea."
                      items={
                        result.alternatives
                      }
                      emptyMessage="No alternative phrasing was found."
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