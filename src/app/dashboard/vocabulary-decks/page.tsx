"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import {
  useRouter,
} from "next/navigation";

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
  LANGUAGES,
  type LanguageCode,
} from "@/lib/languages";

import {
  hasPaidFeatureAccess,
} from "@/lib/paid-feature-access";

import {
  createVocabularyDeck,
  deleteVocabularyDeck,
  getVocabularyDeck,
  listVocabularyDecks,
  removeSavedPhraseFromVocabularyDeck,
  updateVocabularyDeck,
  type VocabularyDeck,
  type VocabularyDeckPhrase,
} from "@/lib/vocabulary-decks-api";

import {
  transliterateWesternArmenian,
} from "@/lib/western-armenian-transliteration";


const MAX_LOADED_DECKS =
  100;

const MAX_LOADED_PHRASES =
  100;


function formatDate(
  value: string,
): string {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "";
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      day:
        "numeric",

      month:
        "short",

      year:
        "numeric",

      hour:
        "numeric",

      minute:
        "2-digit",
    },
  ).format(date);
}


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


export default function VocabularyDecksPage() {
  const router =
    useRouter();

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
    total,
    setTotal,
  ] =
    useState(0);

  const [
    pageLoading,
    setPageLoading,
  ] =
    useState(false);

  const [
    selectedDeck,
    setSelectedDeck,
  ] =
    useState<VocabularyDeck | null>(
      null,
    );

  const [
    deckItems,
    setDeckItems,
  ] =
    useState<VocabularyDeckPhrase[]>(
      [],
    );

  const [
    detailTotal,
    setDetailTotal,
  ] =
    useState(0);

  const [
    detailLoading,
    setDetailLoading,
  ] =
    useState(false);

  const [
    createName,
    setCreateName,
  ] =
    useState("");

  const [
    createDescription,
    setCreateDescription,
  ] =
    useState("");

  const [
    editName,
    setEditName,
  ] =
    useState("");

  const [
    editDescription,
    setEditDescription,
  ] =
    useState("");

  const [
    creating,
    setCreating,
  ] =
    useState(false);

  const [
    busyAction,
    setBusyAction,
  ] =
    useState<string | null>(
      null,
    );

  const [
    copiedId,
    setCopiedId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    message,
    setMessage,
  ] =
    useState("");


  const hasAccess =
    hasPaidFeatureAccess(
      "vocabulary_decks",
      {
        isAuthenticated:
          Boolean(user),

        role:
          profile?.role,

        planSlug:
          plan?.slug,
      },
    );


  const loadDecks =
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
          setTotal(0);

          return;
        }

        setPageLoading(
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

          setTotal(
            result.total,
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
            setPageLoading(
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

    void loadDecks(
      controller.signal,
    );

    return () => {
      controller.abort();
    };
  }, [loadDecks]);


  async function openDeck(
    deckId: string,
  ) {
    const accessToken =
      session?.access_token;

    if (
      !accessToken ||
      busyAction
    ) {
      return;
    }

    setDetailLoading(
      true,
    );

    setError("");
    setMessage("");

    try {
      const result =
        await getVocabularyDeck(
          accessToken,
          deckId,
          {
            limit:
              MAX_LOADED_PHRASES,

            offset:
              0,
          },
        );

      setSelectedDeck(
        result.deck,
      );

      setDeckItems(
        result.items,
      );

      setDetailTotal(
        result.total,
      );

      setEditName(
        result.deck.name,
      );

      setEditDescription(
        result.deck.description ??
          "",
      );

      window.setTimeout(
        () => {
          document
            .getElementById(
              "vocabulary-deck-detail",
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
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The Vocabulary Deck could not be opened.",
      );
    } finally {
      setDetailLoading(
        false,
      );
    }
  }


  async function createDeck(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const accessToken =
      session?.access_token;

    const name =
      createName.trim();

    if (
      !accessToken ||
      creating ||
      busyAction
    ) {
      return;
    }

    if (!name) {
      setError(
        "Enter a name for the Vocabulary Deck.",
      );

      return;
    }

    setCreating(
      true,
    );

    setError("");
    setMessage("");

    try {
      const created =
        await createVocabularyDeck(
          accessToken,
          {
            name,

            description:
              createDescription.trim() ||
              null,
          },
        );

      setDecks(
        (current) => [
          created,
          ...current.filter(
            (deck) =>
              deck.id !==
              created.id,
          ),
        ],
      );

      setTotal(
        (current) =>
          current + 1,
      );

      setCreateName("");
      setCreateDescription("");

      await openDeck(
        created.id,
      );

      setMessage(
        "Vocabulary Deck created.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The Vocabulary Deck could not be created.",
      );
    } finally {
      setCreating(
        false,
      );
    }
  }


  async function saveDeck(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const accessToken =
      session?.access_token;

    const deck =
      selectedDeck;

    const name =
      editName.trim();

    if (
      !accessToken ||
      !deck ||
      busyAction
    ) {
      return;
    }

    if (!name) {
      setError(
        "A Vocabulary Deck name is required.",
      );

      return;
    }

    const actionKey =
      `edit:${deck.id}`;

    setBusyAction(
      actionKey,
    );

    setError("");
    setMessage("");

    try {
      const updated =
        await updateVocabularyDeck(
          accessToken,
          deck.id,
          {
            name,

            description:
              editDescription.trim() ||
              null,
          },
        );

      setSelectedDeck(
        updated,
      );

      setEditName(
        updated.name,
      );

      setEditDescription(
        updated.description ??
          "",
      );

      setDecks(
        (current) => [
          updated,
          ...current.filter(
            (item) =>
              item.id !==
              updated.id,
          ),
        ],
      );

      setMessage(
        "Vocabulary Deck updated.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The Vocabulary Deck could not be updated.",
      );
    } finally {
      setBusyAction(
        null,
      );
    }
  }


  async function removeDeck(
    deck: VocabularyDeck,
  ) {
    const accessToken =
      session?.access_token;

    if (
      !accessToken ||
      busyAction
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        `Delete "${deck.name}"? The deck will be removed, but its Saved Phrases will remain in Saved Phrases.`,
      );

    if (!confirmed) {
      return;
    }

    const actionKey =
      `delete:${deck.id}`;

    setBusyAction(
      actionKey,
    );

    setError("");
    setMessage("");

    try {
      await deleteVocabularyDeck(
        accessToken,
        deck.id,
      );

      setDecks(
        (current) =>
          current.filter(
            (item) =>
              item.id !==
              deck.id,
          ),
      );

      setTotal(
        (current) =>
          Math.max(
            0,
            current - 1,
          ),
      );

      if (
        selectedDeck?.id ===
        deck.id
      ) {
        setSelectedDeck(
          null,
        );

        setDeckItems([]);
        setDetailTotal(0);
        setEditName("");
        setEditDescription("");
      }

      setMessage(
        "Vocabulary Deck deleted. Its Saved Phrases were not deleted.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The Vocabulary Deck could not be deleted.",
      );
    } finally {
      setBusyAction(
        null,
      );
    }
  }


  async function removePhraseFromDeck(
    item: VocabularyDeckPhrase,
  ) {
    const accessToken =
      session?.access_token;

    const deck =
      selectedDeck;

    if (
      !accessToken ||
      !deck ||
      busyAction
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        "Remove this phrase from the Vocabulary Deck? It will remain in Saved Phrases.",
      );

    if (!confirmed) {
      return;
    }

    const actionKey =
      `phrase:${item.id}`;

    setBusyAction(
      actionKey,
    );

    setError("");
    setMessage("");

    try {
      await removeSavedPhraseFromVocabularyDeck(
        accessToken,
        deck.id,
        item.id,
      );

      const refreshed =
        await getVocabularyDeck(
          accessToken,
          deck.id,
          {
            limit:
              MAX_LOADED_PHRASES,

            offset:
              0,
          },
        );

      setSelectedDeck(
        refreshed.deck,
      );

      setDeckItems(
        refreshed.items,
      );

      setDetailTotal(
        refreshed.total,
      );

      setDecks(
        (current) =>
          current.map(
            (currentDeck) =>
              currentDeck.id ===
              refreshed.deck.id
                ? refreshed.deck
                : currentDeck,
          ),
      );

      setMessage(
        "Phrase removed from this deck. It is still available in Saved Phrases.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The phrase could not be removed from this deck.",
      );
    } finally {
      setBusyAction(
        null,
      );
    }
  }


  async function copyTranslation(
    item: VocabularyDeckPhrase,
  ) {
    try {
      await navigator
        .clipboard
        .writeText(
          item.translatedText,
        );

      setCopiedId(
        item.id,
      );

      window.setTimeout(
        () => {
          setCopiedId(
            (current) =>
              current ===
                item.id
                ? null
                : current,
          );
        },
        1400,
      );
    } catch {
      setError(
        "Clipboard access was blocked.",
      );
    }
  }


  function runAgain(
    item: VocabularyDeckPhrase,
  ) {
    localStorage.setItem(
      "wat-prefill",
      JSON.stringify({
        text:
          item.sourceText,

        source:
          item.sourceLanguage,

        target:
          item.targetLanguage,
      }),
    );

    router.push("/");
  }


  if (
    authLoading
  ) {
    return (
      <ProtectedRoute>
        <DashboardShell
          title="Vocabulary Decks"
          description="Organise Saved Phrases into focused collections for practice."
        >
          <div className="page-state">
            Loading Vocabulary Decks...
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
          title="Vocabulary Decks"
          description="Organise Saved Phrases into focused collections for practice."
        >
          <section className="vocabulary-decks-access-card dashboard-card">
            <div>
              <p className="eyebrow">
                Paid feature
              </p>

              <h2>
                Unlock Vocabulary Decks
              </h2>

              <p>
                Build your own practice collections from Saved Phrases and keep related vocabulary together.
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
        title="Vocabulary Decks"
        description="Create focused practice collections, organise Saved Phrases and manage the phrases inside each deck."
      >
        <div className="vocabulary-decks-page">
          <section className="vocabulary-deck-create-card dashboard-card">
            <div className="vocabulary-decks-section-heading">
              <div>
                <p className="eyebrow">
                  Organise practice
                </p>

                <h2>
                  Create a deck
                </h2>

                <p>
                  Group Saved Phrases by topic, lesson or learning goal.
                </p>
              </div>

              <div className="vocabulary-decks-summary">
                <strong>
                  {total.toLocaleString()}
                </strong>

                <span>
                  {total === 1
                    ? "deck"
                    : "decks"}
                </span>
              </div>
            </div>

            <form
              className="vocabulary-deck-create-form"
              onSubmit={
                (event) =>
                  void createDeck(
                    event,
                  )
              }
            >
              <label>
                <span>
                  Deck name
                </span>

                <input
                  type="text"
                  value={createName}
                  maxLength={100}
                  required
                  placeholder="e.g. Travel"
                  onChange={(event) =>
                    setCreateName(
                      event.target.value,
                    )
                  }
                />
              </label>

              <label>
                <span>
                  Description
                </span>

                <input
                  type="text"
                  value={createDescription}
                  maxLength={500}
                  placeholder="Optional"
                  onChange={(event) =>
                    setCreateDescription(
                      event.target.value,
                    )
                  }
                />
              </label>

              <button
                type="submit"
                className="primary-button"
                disabled={
                  creating ||
                  Boolean(
                    busyAction,
                  )
                }
              >
                {creating
                  ? "Creating..."
                  : "Create deck"}
              </button>
            </form>
          </section>

          {error ? (
            <div
              className="form-message error"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          {message ? (
            <div
              className="form-message success"
              role="status"
            >
              {message}
            </div>
          ) : null}

          {total >
          MAX_LOADED_DECKS ? (
            <div className="info-banner">
              Showing the newest{" "}
              {MAX_LOADED_DECKS.toLocaleString()}{" "}
              Vocabulary Decks.
            </div>
          ) : null}

          <div className="vocabulary-decks-workspace">
            <section className="vocabulary-deck-list-card dashboard-card">
              <div className="vocabulary-deck-panel-heading">
                <div>
                  <p className="eyebrow">
                    Your decks
                  </p>

                  <h2>
                    Practice collections
                  </h2>
                </div>

                <span className="vocabulary-deck-count-badge">
                  {total.toLocaleString()}
                </span>
              </div>

              {pageLoading ? (
                <div className="page-state vocabulary-deck-inline-state">
                  Loading decks...
                </div>
              ) : decks.length ? (
                <div className="vocabulary-deck-list">
                  {decks.map(
                    (deck) => {
                      const selected =
                        selectedDeck?.id ===
                        deck.id;

                      const deleting =
                        busyAction ===
                        `delete:${deck.id}`;

                      return (
                        <article
                          key={deck.id}
                          className={
                            selected
                              ? "vocabulary-deck-card selected"
                              : "vocabulary-deck-card"
                          }
                        >
                          <div className="vocabulary-deck-card-main">
                            <div className="vocabulary-deck-card-title-row">
                              <h3>
                                {deck.name}
                              </h3>

                              <span>
                                {deck.phraseCount.toLocaleString()}{" "}
                                {deck.phraseCount ===
                                1
                                  ? "phrase"
                                  : "phrases"}
                              </span>
                            </div>

                            {deck.description ? (
                              <p>
                                {deck.description}
                              </p>
                            ) : (
                              <p className="vocabulary-deck-muted">
                                No description
                              </p>
                            )}

                            <small>
                              Updated{" "}
                              {formatDate(
                                deck.updatedAt,
                              )}
                            </small>
                          </div>

                          <div className="vocabulary-deck-card-actions">
                            <button
                              type="button"
                              className="vocabulary-deck-secondary-button"
                              disabled={
                                Boolean(
                                  busyAction,
                                ) ||
                                detailLoading
                              }
                              onClick={() =>
                                void openDeck(
                                  deck.id,
                                )
                              }
                            >
                              {selected
                                ? "Refresh"
                                : "Open"}
                            </button>

                            <button
                              type="button"
                              className="vocabulary-deck-danger-button"
                              disabled={
                                Boolean(
                                  busyAction,
                                )
                              }
                              onClick={() =>
                                void removeDeck(
                                  deck,
                                )
                              }
                            >
                              {deleting
                                ? "Deleting..."
                                : "Delete"}
                            </button>
                          </div>
                        </article>
                      );
                    },
                  )}
                </div>
              ) : (
                <div className="empty-state vocabulary-deck-inline-state">
                  You have not created any Vocabulary Decks yet.
                </div>
              )}
            </section>

            <section
              id="vocabulary-deck-detail"
              className="vocabulary-deck-detail-card dashboard-card"
            >
              {detailLoading ? (
                <div className="page-state vocabulary-deck-inline-state">
                  Loading deck...
                </div>
              ) : selectedDeck ? (
                <>
                  <div className="vocabulary-deck-detail-heading">
                    <div>
                      <p className="eyebrow">
                        Open deck
                      </p>

                      <h2>
                        {selectedDeck.name}
                      </h2>

                      <p>
                        {detailTotal.toLocaleString()}{" "}
                        {detailTotal === 1
                          ? "Saved Phrase"
                          : "Saved Phrases"}
                      </p>
                    </div>

                    <button
                      type="button"
                      className="vocabulary-deck-secondary-button vocabulary-deck-close-button"
                      onClick={() => {
                        setSelectedDeck(
                          null,
                        );

                        setDeckItems([]);
                        setDetailTotal(0);
                        setEditName("");
                        setEditDescription("");
                        setError("");
                        setMessage("");
                      }}
                    >
                      Close
                    </button>
                  </div>

                  <form
                    className="vocabulary-deck-edit-form"
                    onSubmit={
                      (event) =>
                        void saveDeck(
                          event,
                        )
                    }
                  >
                    <label>
                      <span>
                        Deck name
                      </span>

                      <input
                        type="text"
                        value={editName}
                        maxLength={100}
                        required
                        disabled={
                          Boolean(
                            busyAction,
                          )
                        }
                        onChange={(event) =>
                          setEditName(
                            event.target.value,
                          )
                        }
                      />
                    </label>

                    <label>
                      <span>
                        Description
                      </span>

                      <textarea
                        value={editDescription}
                        maxLength={500}
                        rows={3}
                        placeholder="Optional"
                        disabled={
                          Boolean(
                            busyAction,
                          )
                        }
                        onChange={(event) =>
                          setEditDescription(
                            event.target.value,
                          )
                        }
                      />
                    </label>

                    <button
                      type="submit"
                      className="primary-button"
                      disabled={
                        Boolean(
                          busyAction,
                        )
                      }
                    >
                      {busyAction ===
                      `edit:${selectedDeck.id}`
                        ? "Saving..."
                        : "Save changes"}
                    </button>
                  </form>

                  <div className="vocabulary-deck-phrase-heading">
                    <div>
                      <h3>
                        Phrases
                      </h3>

                      <p>
                        Removing a phrase here does not delete it from Saved Phrases.
                      </p>
                    </div>

                    <Link
                      href="/dashboard/saved-phrases"
                      className="vocabulary-deck-text-link"
                    >
                      View Saved Phrases
                    </Link>
                  </div>

                  {detailTotal >
                  MAX_LOADED_PHRASES ? (
                    <div className="info-banner vocabulary-deck-detail-notice">
                      Showing the newest{" "}
                      {MAX_LOADED_PHRASES.toLocaleString()}{" "}
                      phrases in this deck.
                    </div>
                  ) : null}

                  {deckItems.length ? (
                    <div className="vocabulary-deck-phrase-list">
                      {deckItems.map(
                        (item) => {
                          const sourceTransliteration =
                            westernTransliteration(
                              item.sourceText,
                              item.sourceLanguage,
                            );

                          const targetTransliteration =
                            westernTransliteration(
                              item.translatedText,
                              item.targetLanguage,
                            );

                          const busy =
                            busyAction ===
                            `phrase:${item.id}`;

                          return (
                            <article
                              className="saved-phrase-card vocabulary-deck-phrase-card"
                              key={item.id}
                            >
                              <header className="saved-phrase-card-header">
                                <div className="saved-phrase-language-pair">
                                  <strong>
                                    {languageName(
                                      item.sourceLanguage,
                                    )}
                                  </strong>

                                  <span
                                    aria-hidden="true"
                                  >
                                    {"\u2192"}
                                  </span>

                                  <strong>
                                    {languageName(
                                      item.targetLanguage,
                                    )}
                                  </strong>
                                </div>

                                <div className="saved-phrase-card-meta">
                                  {item.isFavorite ? (
                                    <span className="saved-phrase-favourite-badge">
                                      <span
                                        aria-hidden="true"
                                      >
                                        {"\u2605"}
                                      </span>

                                      Favourite
                                    </span>
                                  ) : null}

                                  <time
                                    dateTime={
                                      item.addedAt
                                    }
                                  >
                                    Added{" "}
                                    {formatDate(
                                      item.addedAt,
                                    )}
                                  </time>
                                </div>
                              </header>

                              <div className="saved-phrase-text-grid">
                                <section className="saved-phrase-text-block">
                                  <span className="saved-phrase-field-label">
                                    Original
                                  </span>

                                  <p
                                    className={
                                      isArmenianLanguage(
                                        item.sourceLanguage,
                                      )
                                        ? "armenian-text saved-phrase-main-text"
                                        : "saved-phrase-main-text"
                                    }
                                  >
                                    {item.sourceText}
                                  </p>

                                  {sourceTransliteration ? (
                                    <p className="saved-phrase-transliteration">
                                      {sourceTransliteration}
                                    </p>
                                  ) : null}
                                </section>

                                <section className="saved-phrase-text-block saved-phrase-result-block">
                                  <span className="saved-phrase-field-label">
                                    Translation
                                  </span>

                                  <p
                                    className={
                                      isArmenianLanguage(
                                        item.targetLanguage,
                                      )
                                        ? "armenian-text saved-phrase-main-text"
                                        : "saved-phrase-main-text"
                                    }
                                  >
                                    {item.translatedText}
                                  </p>

                                  {targetTransliteration ? (
                                    <p className="saved-phrase-transliteration">
                                      {targetTransliteration}
                                    </p>
                                  ) : null}
                                </section>
                              </div>

                              <footer className="saved-phrase-actions vocabulary-deck-phrase-actions">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void copyTranslation(
                                      item,
                                    )
                                  }
                                >
                                  {copiedId ===
                                  item.id
                                    ? "Copied"
                                    : "Copy translation"}
                                </button>

                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    runAgain(
                                      item,
                                    )
                                  }
                                >
                                  Run again
                                </button>

                                <button
                                  type="button"
                                  className="saved-phrase-delete-action"
                                  disabled={
                                    Boolean(
                                      busyAction,
                                    )
                                  }
                                  onClick={() =>
                                    void removePhraseFromDeck(
                                      item,
                                    )
                                  }
                                >
                                  {busy
                                    ? "Removing..."
                                    : "Remove from deck"}
                                </button>
                              </footer>
                            </article>
                          );
                        },
                      )}
                    </div>
                  ) : (
                    <div className="empty-state vocabulary-deck-detail-empty">
                      <p>
                        This deck does not contain any Saved Phrases yet.
                      </p>

                      <Link
                        href="/dashboard/saved-phrases"
                        className="primary-button inline-button"
                      >
                        View Saved Phrases
                      </Link>
                    </div>
                  )}
                </>
              ) : (
                <div className="vocabulary-deck-detail-placeholder">
                  <div>
                    <span
                      className="vocabulary-deck-placeholder-icon"
                      aria-hidden="true"
                    >
                      {"\u2630"}
                    </span>

                    <h2>
                      Open a Vocabulary Deck
                    </h2>

                    <p>
                      Choose a deck to rename it, update its description or review the Saved Phrases inside it.
                    </p>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </DashboardShell>
    </ProtectedRoute>
  );
}
