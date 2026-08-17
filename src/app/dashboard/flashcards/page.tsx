"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  DashboardShell,
} from "@/components/DashboardShell";

import {
  ProtectedRoute,
} from "@/components/ProtectedRoute";

import {
  useAuth,
} from "@/contexts/AuthContext";

import {
  loadFlashcardDeck,
  type FlashcardDeckResult,
} from "@/lib/flashcards-api";

import {
  LANGUAGES,
  type LanguageCode,
} from "@/lib/languages";

import {
  hasPaidFeatureAccess,
} from "@/lib/paid-feature-access";

import {
  listVocabularyDecks,
  type VocabularyDeck,
  type VocabularyDeckPhrase,
} from "@/lib/vocabulary-decks-api";

import {
  transliterateWesternArmenian,
} from "@/lib/western-armenian-transliteration";


const MAX_LOADED_DECKS =
  100;

const MAX_FLASHCARDS =
  100;


function languageName(
  language: LanguageCode,
): string {
  return LANGUAGES[
    language
  ].name;
}


function isArmenianLanguage(
  language: LanguageCode,
): boolean {
  return (
    language === "hyw" ||
    language === "hye"
  );
}


function westernTransliteration(
  text: string,
  language: LanguageCode,
): string {
  if (
    language !== "hyw"
  ) {
    return "";
  }

  return transliterateWesternArmenian(
    text,
  );
}


export default function FlashcardsPage() {
  const {
    session,
    user,
    profile,
    plan,
    loading:
      authLoading,
  } = useAuth();


  const [
    decks,
    setDecks,
  ] =
    useState<VocabularyDeck[]>(
      [],
    );

  const [
    deckTotal,
    setDeckTotal,
  ] =
    useState(0);

  const [
    deckListLoading,
    setDeckListLoading,
  ] =
    useState(false);

  const [
    selectedDeckId,
    setSelectedDeckId,
  ] =
    useState("");

  const [
    flashcardDeck,
    setFlashcardDeck,
  ] =
    useState<FlashcardDeckResult | null>(
      null,
    );

  const [
    deckLoading,
    setDeckLoading,
  ] =
    useState(false);

  const [
    started,
    setStarted,
  ] =
    useState(false);

  const [
    complete,
    setComplete,
  ] =
    useState(false);

  const [
    currentIndex,
    setCurrentIndex,
  ] =
    useState(0);

  const [
    revealed,
    setRevealed,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");


  const hasAccess =
    hasPaidFeatureAccess(
      "flashcards",
      {
        isAuthenticated:
          Boolean(user),

        role:
          profile?.role,

        planSlug:
          plan?.slug,
      },
    );


  const loadDeckList =
    useCallback(
      async (
        signal?: AbortSignal,
      ) => {
        const accessToken =
          session?.access_token;

        if (
          !accessToken ||
          !hasAccess
        ) {
          setDecks([]);
          setDeckTotal(0);

          return;
        }

        setDeckListLoading(
          true,
        );

        setError("");

        try {
          const result =
            await listVocabularyDecks(
              accessToken,
              {
                limit:
                  MAX_LOADED_DECKS,

                offset:
                  0,
              },
              signal,
            );

          setDecks(
            result.items,
          );

          setDeckTotal(
            result.total,
          );

          setSelectedDeckId(
            (current) =>
              current
                ? current
                : result.items[0]
                    ?.id ??
                  "",
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
              : "Vocabulary Decks could not be loaded.",
          );
        } finally {
          if (
            !signal?.aborted
          ) {
            setDeckListLoading(
              false,
            );
          }
        }
      },
      [
        hasAccess,
        session?.access_token,
      ],
    );


  const loadDeckForStudy =
    useCallback(
      async (
        deckId: string,
        signal?: AbortSignal,
      ) => {
        const accessToken =
          session?.access_token;

        if (
          !accessToken ||
          !deckId ||
          !hasAccess
        ) {
          return;
        }

        setDeckLoading(
          true,
        );

        setError("");
        setFlashcardDeck(
          null,
        );

        setStarted(
          false,
        );

        setComplete(
          false,
        );

        setCurrentIndex(
          0,
        );

        setRevealed(
          false,
        );

        try {
          const result =
            await loadFlashcardDeck(
              accessToken,
              deckId,
              {
                limit:
                  MAX_FLASHCARDS,

                offset:
                  0,
              },
              signal,
            );

          setFlashcardDeck(
            result,
          );

          setSelectedDeckId(
            result.deck.id,
          );

          setDecks(
            (current) =>
              current.some(
                (deck) =>
                  deck.id ===
                  result.deck.id,
              )
                ? current
                : [
                    result.deck,
                    ...current,
                  ],
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
              : "The Flashcards could not be loaded.",
          );
        } finally {
          if (
            !signal?.aborted
          ) {
            setDeckLoading(
              false,
            );
          }
        }
      },
      [
        hasAccess,
        session?.access_token,
      ],
    );


  useEffect(() => {
    const controller =
      new AbortController();

    void loadDeckList(
      controller.signal,
    );

    return () => {
      controller.abort();
    };
  }, [loadDeckList]);


  useEffect(() => {
    if (
      !hasAccess ||
      !session?.access_token
    ) {
      return;
    }

    const params =
      new URLSearchParams(
        window.location.search,
      );

    const requestedDeck =
      params
        .get(
          "deck",
        )
        ?.trim() ??
      "";

    if (
      !requestedDeck
    ) {
      return;
    }

    const controller =
      new AbortController();

    setSelectedDeckId(
      requestedDeck,
    );

    void loadDeckForStudy(
      requestedDeck,
      controller.signal,
    );

    return () => {
      controller.abort();
    };
  }, [
    hasAccess,
    loadDeckForStudy,
    session?.access_token,
  ]);


  function chooseDeck(
    deckId: string,
  ) {
    setSelectedDeckId(
      deckId,
    );

    setFlashcardDeck(
      null,
    );

    setStarted(
      false,
    );

    setComplete(
      false,
    );

    setCurrentIndex(
      0,
    );

    setRevealed(
      false,
    );

    setError("");
  }


  function startSession() {
    if (
      !flashcardDeck?.items.length
    ) {
      return;
    }

    setStarted(
      true,
    );

    setComplete(
      false,
    );

    setCurrentIndex(
      0,
    );

    setRevealed(
      false,
    );

    window.setTimeout(
      () => {
        document
          .getElementById(
            "flashcard-study-session",
          )
          ?.scrollIntoView({
            behavior:
              "smooth",

            block:
              "nearest",
          });
      },
      0,
    );
  }


  function exitSession() {
    setStarted(
      false,
    );

    setComplete(
      false,
    );

    setCurrentIndex(
      0,
    );

    setRevealed(
      false,
    );
  }


  function previousCard() {
    if (
      currentIndex <=
        0
    ) {
      return;
    }

    setCurrentIndex(
      (current) =>
        Math.max(
          0,
          current - 1,
        ),
    );

    setRevealed(
      false,
    );
  }


  function continueSession() {
    if (
      !flashcardDeck ||
      !revealed
    ) {
      return;
    }

    if (
      currentIndex >=
      flashcardDeck.items.length -
        1
    ) {
      setComplete(
        true,
      );

      return;
    }

    setCurrentIndex(
      (current) =>
        current + 1,
    );

    setRevealed(
      false,
    );
  }


  function restartSession() {
    setComplete(
      false,
    );

    setStarted(
      true,
    );

    setCurrentIndex(
      0,
    );

    setRevealed(
      false,
    );
  }


  const currentItem:
    VocabularyDeckPhrase | null =
    flashcardDeck
      ?.items[
        currentIndex
      ] ??
    null;


  const progress =
    flashcardDeck?.items.length
      ? (
          (
            currentIndex +
            1
          ) /
          flashcardDeck.items.length
        ) *
        100
      : 0;


  if (
    authLoading
  ) {
    return (
      <ProtectedRoute>
        <DashboardShell
          title="Flashcards"
          description="Practise the Saved Phrases inside your Vocabulary Decks one card at a time."
        >
          <div className="page-state">
            Loading Flashcards...
          </div>
        </DashboardShell>
      </ProtectedRoute>
    );
  }


  if (
    !hasAccess
  ) {
    return (
      <ProtectedRoute>
        <DashboardShell
          title="Flashcards"
          description="Practise the Saved Phrases inside your Vocabulary Decks one card at a time."
        >
          <section className="flashcards-access-card dashboard-card">
            <div>
              <p className="eyebrow">
                Paid feature
              </p>

              <h2>
                Unlock Flashcards
              </h2>

              <p>
                Review your Vocabulary Decks card by card with Western Armenian learning support.
              </p>
            </div>

            <Link
              href="/pricing"
              className="primary-button inline-button"
            >
              View Person & Schools plans
            </Link>
          </section>
        </DashboardShell>
      </ProtectedRoute>
    );
  }


  return (
    <ProtectedRoute>
      <DashboardShell
        title="Flashcards"
        description="Practise the Saved Phrases inside your Vocabulary Decks one card at a time."
      >
        <div className="flashcards-page">
          <section className="flashcards-deck-picker-card dashboard-card">
            <div className="flashcards-section-heading">
              <div>
                <p className="eyebrow">
                  Choose practice material
                </p>

                <h2>
                  Select a Vocabulary Deck
                </h2>

                <p>
                  Open a deck, then start a focused Flashcards session.
                </p>
              </div>

              <div className="flashcards-deck-summary">
                <strong>
                  {deckTotal.toLocaleString()}
                </strong>

                <span>
                  {deckTotal === 1
                    ? "deck"
                    : "decks"}
                </span>
              </div>
            </div>

            {deckListLoading ? (
              <div className="page-state flashcards-inline-state">
                Loading Vocabulary Decks...
              </div>
            ) : decks.length ? (
              <div className="flashcards-deck-picker">
                <label>
                  <span>
                    Vocabulary Deck
                  </span>

                  <select
                    value={
                      selectedDeckId
                    }
                    disabled={
                      deckLoading
                    }
                    onChange={(event) =>
                      chooseDeck(
                        event.target.value,
                      )
                    }
                  >
                    {decks.map(
                      (deck) => (
                        <option
                          key={
                            deck.id
                          }
                          value={
                            deck.id
                          }
                        >
                          {deck.name} ({deck.phraseCount}{" "}
                          {deck.phraseCount === 1
                            ? "phrase"
                            : "phrases"})
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <button
                  type="button"
                  className="primary-button"
                  disabled={
                    !selectedDeckId ||
                    deckLoading
                  }
                  onClick={() =>
                    void loadDeckForStudy(
                      selectedDeckId,
                    )
                  }
                >
                  {deckLoading
                    ? "Loading..."
                    : "Open for practice"}
                </button>
              </div>
            ) : (
              <div className="empty-state flashcards-picker-empty">
                <p>
                  You do not have any Vocabulary Decks yet.
                </p>

                <Link
                  href="/dashboard/vocabulary-decks"
                  className="primary-button inline-button"
                >
                  Create a Vocabulary Deck
                </Link>
              </div>
            )}

            {deckTotal >
            MAX_LOADED_DECKS ? (
              <div className="info-banner flashcards-deck-notice">
                Showing the newest{" "}
                {MAX_LOADED_DECKS.toLocaleString()}{" "}
                Vocabulary Decks.
              </div>
            ) : null}
          </section>


          {error ? (
            <div
              className="form-message error"
              role="alert"
            >
              {error}
            </div>
          ) : null}


          {deckLoading ? (
            <div className="page-state">
              Loading Flashcards...
            </div>
          ) : null}


          {flashcardDeck &&
          !started ? (
            <section className="flashcards-ready-card dashboard-card">
              <div className="flashcards-ready-heading">
                <div>
                  <p className="eyebrow">
                    Ready to practise
                  </p>

                  <h2>
                    {flashcardDeck.deck.name}
                  </h2>

                  {flashcardDeck.deck.description ? (
                    <p>
                      {flashcardDeck.deck.description}
                    </p>
                  ) : null}
                </div>

                <div className="flashcards-ready-count">
                  <strong>
                    {flashcardDeck.total.toLocaleString()}
                  </strong>

                  <span>
                    {flashcardDeck.total === 1
                      ? "card"
                      : "cards"}
                  </span>
                </div>
              </div>

              {flashcardDeck.total >
              MAX_FLASHCARDS ? (
                <div className="info-banner">
                  This session contains the newest{" "}
                  {MAX_FLASHCARDS.toLocaleString()}{" "}
                  cards from the deck.
                </div>
              ) : null}

              {flashcardDeck.items.length ? (
                <div className="flashcards-ready-actions">
                  <button
                    type="button"
                    className="primary-button flashcards-start-button"
                    onClick={
                      startSession
                    }
                  >
                    Start Flashcards
                  </button>

                  <Link
                    href="/dashboard/vocabulary-decks"
                    className="vocabulary-deck-text-link"
                  >
                    Manage Vocabulary Decks
                  </Link>
                </div>
              ) : (
                <div className="empty-state flashcards-empty-deck">
                  <p>
                    This Vocabulary Deck does not contain any Saved Phrases yet.
                  </p>

                  <Link
                    href="/dashboard/saved-phrases"
                    className="primary-button inline-button"
                  >
                    View Saved Phrases
                  </Link>
                </div>
              )}
            </section>
          ) : null}


          {flashcardDeck &&
          started &&
          !complete &&
          currentItem ? (
            <section
              id="flashcard-study-session"
              className="flashcard-session dashboard-card"
            >
              <header className="flashcard-session-header">
                <div>
                  <p className="eyebrow">
                    {flashcardDeck.deck.name}
                  </p>

                  <h2>
                    Card{" "}
                    {(
                      currentIndex +
                      1
                    ).toLocaleString()}{" "}
                    of{" "}
                    {flashcardDeck.items.length.toLocaleString()}
                  </h2>
                </div>

                <button
                  type="button"
                  className="vocabulary-deck-secondary-button"
                  onClick={
                    exitSession
                  }
                >
                  Exit session
                </button>
              </header>

              <div
                className="flashcard-progress"
                aria-label={`Flashcard ${
                  currentIndex + 1
                } of ${
                  flashcardDeck.items.length
                }`}
              >
                <span
                  style={{
                    width:
                      `${progress}%`,
                  }}
                />
              </div>

              <article className="flashcard-study-card">
                <section className="flashcard-study-front">
                  <div className="flashcard-side-heading">
                    <span>
                      Prompt
                    </span>

                    <strong>
                      {languageName(
                        currentItem.sourceLanguage,
                      )}
                    </strong>
                  </div>

                  <p
                    className={
                      isArmenianLanguage(
                        currentItem.sourceLanguage,
                      )
                        ? "armenian-text flashcard-main-text"
                        : "flashcard-main-text"
                    }
                  >
                    {currentItem.sourceText}
                  </p>

                  {westernTransliteration(
                    currentItem.sourceText,
                    currentItem.sourceLanguage,
                  ) ? (
                    <p className="flashcard-transliteration">
                      {westernTransliteration(
                        currentItem.sourceText,
                        currentItem.sourceLanguage,
                      )}
                    </p>
                  ) : null}
                </section>

                {revealed ? (
                  <section
                    className="flashcard-study-answer"
                    aria-live="polite"
                  >
                    <div className="flashcard-side-heading">
                      <span>
                        Answer
                      </span>

                      <strong>
                        {languageName(
                          currentItem.targetLanguage,
                        )}
                      </strong>
                    </div>

                    <p
                      className={
                        isArmenianLanguage(
                          currentItem.targetLanguage,
                        )
                          ? "armenian-text flashcard-main-text"
                          : "flashcard-main-text"
                      }
                    >
                      {currentItem.translatedText}
                    </p>

                    {westernTransliteration(
                      currentItem.translatedText,
                      currentItem.targetLanguage,
                    ) ? (
                      <p className="flashcard-transliteration">
                        {westernTransliteration(
                          currentItem.translatedText,
                          currentItem.targetLanguage,
                        )}
                      </p>
                    ) : null}
                  </section>
                ) : (
                  <section className="flashcard-study-hidden-answer">
                    <span aria-hidden="true">
                      {"?"}
                    </span>

                    <p>
                      Think of the translation, then reveal the answer.
                    </p>
                  </section>
                )}
              </article>

              <footer className="flashcard-session-controls">
                <button
                  type="button"
                  className="vocabulary-deck-secondary-button"
                  disabled={
                    currentIndex ===
                    0
                  }
                  onClick={
                    previousCard
                  }
                >
                  Previous
                </button>

                {!revealed ? (
                  <button
                    type="button"
                    className="primary-button flashcards-reveal-button"
                    onClick={() =>
                      setRevealed(
                        true,
                      )
                    }
                  >
                    Reveal answer
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary-button flashcards-next-button"
                    onClick={
                      continueSession
                    }
                  >
                    {currentIndex ===
                    flashcardDeck.items.length -
                      1
                      ? "Finish session"
                      : "Next card"}
                  </button>
                )}
              </footer>
            </section>
          ) : null}


          {flashcardDeck &&
          started &&
          complete ? (
            <section className="flashcards-complete-card dashboard-card">
              <div className="flashcards-complete-icon">
                <span
                  aria-hidden="true"
                >
                  {"\u2713"}
                </span>
              </div>

              <p className="eyebrow">
                Session complete
              </p>

              <h2>
                Nice work
              </h2>

              <p>
                You reviewed{" "}
                <strong>
                  {flashcardDeck.items.length.toLocaleString()}
                </strong>{" "}
                {flashcardDeck.items.length ===
                1
                  ? "card"
                  : "cards"}{" "}
                from{" "}
                <strong>
                  {flashcardDeck.deck.name}
                </strong>.
              </p>

              <div className="flashcards-complete-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={
                    restartSession
                  }
                >
                  Restart deck
                </button>

                <button
                  type="button"
                  className="vocabulary-deck-secondary-button"
                  onClick={
                    exitSession
                  }
                >
                  Choose another deck
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </DashboardShell>
    </ProtectedRoute>
  );
}