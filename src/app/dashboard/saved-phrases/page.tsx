"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
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
  VocabularyMasteryBadge,
} from "@/components/VocabularyMasteryBadge";

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
  deleteSavedPhrase,
  listSavedPhrases,
  setSavedPhraseFavorite,
  type SavedPhraseItem,
} from "@/lib/saved-phrases-api";

import {
  addSavedPhraseToVocabularyDeck,
  listVocabularyDecks,
  type VocabularyDeck,
} from "@/lib/vocabulary-decks-api";

import {
  transliterateWesternArmenian,
} from "@/lib/western-armenian-transliteration";

const MAX_LOADED_PHRASES =
  100;

const MAX_LOADED_DECKS =
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
        "long",

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

export default function SavedPhrasesPage() {
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
    favoritesOnly,
    setFavoritesOnly,
  ] =
    useState(false);

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    items,
    setItems,
  ] =
    useState<SavedPhraseItem[]>(
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
    error,
    setError,
  ] =
    useState("");

  const [
    busyId,
    setBusyId,
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
    message,
    setMessage,
  ] =
    useState("");

  const [
    deckPickerItem,
    setDeckPickerItem,
  ] =
    useState<SavedPhraseItem | null>(
      null,
    );

  const [
    deckOptions,
    setDeckOptions,
  ] =
    useState<VocabularyDeck[]>(
      [],
    );

  const [
    selectedDeckId,
    setSelectedDeckId,
  ] =
    useState("");

  const [
    deckPickerLoading,
    setDeckPickerLoading,
  ] =
    useState(false);

  const [
    deckPickerError,
    setDeckPickerError,
  ] =
    useState("");


  const hasAccess =
    hasPaidFeatureAccess(
      "saved_phrases",
      {
        isAuthenticated:
          Boolean(user),

        role:
          profile?.role,

        planSlug:
          plan?.slug,
      },
    );

  const load =
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
          setItems([]);
          setTotal(0);

          return;
        }

        setPageLoading(
          true,
        );

        setError("");

        try {
          const result =
            await listSavedPhrases(
              accessToken,
              {
                limit:
                  MAX_LOADED_PHRASES,

                offset:
                  0,

                favoritesOnly,
              },
              signal,
            );

          setItems(
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
              : "Saved Phrases could not be loaded.",
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
        favoritesOnly,
        hasAccess,
        session?.access_token,
      ],
    );

  useEffect(() => {
    const controller =
      new AbortController();

    void load(
      controller.signal,
    );

    return () => {
      controller.abort();
    };
  }, [load]);

  const visibleItems =
    useMemo(
      () => {
        const query =
          search
            .trim()
            .toLocaleLowerCase();

        if (!query) {
          return items;
        }

        return items.filter(
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

            const haystack = [
              item.sourceText,
              item.translatedText,
              sourceTransliteration,
              targetTransliteration,
              languageName(
                item.sourceLanguage,
              ),
              languageName(
                item.targetLanguage,
              ),
            ]
              .join(" ")
              .toLocaleLowerCase();

            return haystack.includes(
              query,
            );
          },
        );
      },
      [
        items,
        search,
      ],
    );

  async function toggleFavorite(
    item: SavedPhraseItem,
  ) {
    const accessToken =
      session?.access_token;

    if (
      !accessToken ||
      busyId
    ) {
      return;
    }

    setBusyId(
      item.id,
    );

    setError("");

    try {
      const updated =
        await setSavedPhraseFavorite(
          accessToken,
          item.id,
          !item.isFavorite,
        );

      if (
        favoritesOnly &&
        !updated.isFavorite
      ) {
        setItems(
          (current) =>
            current.filter(
              (row) =>
                row.id !==
                item.id,
            ),
        );

        setTotal(
          (current) =>
            Math.max(
              0,
              current - 1,
            ),
        );
      } else {
        setItems(
          (current) =>
            current.map(
              (row) =>
                row.id ===
                updated.id
                  ? updated
                  : row,
            ),
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The favourite could not be updated.",
      );
    } finally {
      setBusyId(
        null,
      );
    }
  }

  async function removePhrase(
    item: SavedPhraseItem,
  ) {
    const accessToken =
      session?.access_token;

    if (
      !accessToken ||
      busyId
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        "Delete this saved phrase? This does not delete your translation history.",
      );

    if (!confirmed) {
      return;
    }

    setBusyId(
      item.id,
    );

    setError("");

    try {
      await deleteSavedPhrase(
        accessToken,
        item.id,
      );

      setItems(
        (current) =>
          current.filter(
            (row) =>
              row.id !==
              item.id,
          ),
      );

      setTotal(
        (current) =>
          Math.max(
            0,
            current - 1,
          ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The saved phrase could not be deleted.",
      );
    } finally {
      setBusyId(
        null,
      );
    }
  }

  async function copyTranslation(
    item: SavedPhraseItem,
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
    item: SavedPhraseItem,
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


  function closeDeckPicker() {
    setDeckPickerItem(
      null,
    );

    setDeckOptions([]);
    setSelectedDeckId("");
    setDeckPickerError("");
    setDeckPickerLoading(
      false,
    );
  }


  async function openDeckPicker(
    item: SavedPhraseItem,
  ) {
    const accessToken =
      session?.access_token;

    if (
      !accessToken ||
      busyId ||
      deckPickerLoading
    ) {
      return;
    }

    setDeckPickerItem(
      item,
    );

    setDeckOptions([]);
    setSelectedDeckId("");

    setDeckPickerError("");
    setError("");
    setMessage("");

    setDeckPickerLoading(
      true,
    );

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
        );

      setDeckOptions(
        result.items,
      );

      setSelectedDeckId(
        result.items[0]?.id ??
          "",
      );
    } catch (cause) {
      setDeckPickerError(
        cause instanceof Error
          ? cause.message
          : "Vocabulary Decks could not be loaded.",
      );
    } finally {
      setDeckPickerLoading(
        false,
      );
    }
  }


  async function addToSelectedDeck() {
    const accessToken =
      session?.access_token;

    const item =
      deckPickerItem;

    const deck =
      deckOptions.find(
        (option) =>
          option.id ===
          selectedDeckId,
      );

    if (
      !accessToken ||
      !item ||
      !deck ||
      busyId
    ) {
      return;
    }

    setBusyId(
      item.id,
    );

    setDeckPickerError("");
    setError("");
    setMessage("");

    try {
      const result =
        await addSavedPhraseToVocabularyDeck(
          accessToken,
          deck.id,
          item.id,
        );

      closeDeckPicker();

      setMessage(
        result.created
          ? `Added to "${deck.name}".`
          : `This phrase is already in "${deck.name}".`,
      );
    } catch (cause) {
      setDeckPickerError(
        cause instanceof Error
          ? cause.message
          : "The phrase could not be added to this Vocabulary Deck.",
      );
    } finally {
      setBusyId(
        null,
      );
    }
  }


  if (
    authLoading
  ) {
    return (
      <ProtectedRoute>
        <DashboardShell
          title="Saved Phrases"
          description="Keep useful translations and favourites together for later practice."
        >
          <div className="page-state">
            Loading Saved Phrases...
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
          title="Saved Phrases"
          description="Keep useful translations and favourites together for later practice."
        >
          <section className="saved-phrases-access-card dashboard-card">
            <div>
              <p className="eyebrow">
                Paid feature
              </p>

              <h2>
                Unlock Saved Phrases
              </h2>

              <p>
                Save useful translations, mark important phrases as favourites and return to them whenever you want to practise.
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
        title="Saved Phrases"
        description="Search your saved translations, keep favourites and quickly return to phrases you want to practise."
      >
        <div className="saved-phrases-page">
          <section className="saved-phrases-toolbar dashboard-card">
            <div
              className="saved-phrases-tabs"
              aria-label="Saved phrase filter"
            >
              <button
                type="button"
                className={
                  !favoritesOnly
                    ? "active"
                    : ""
                }
                aria-pressed={
                  !favoritesOnly
                }
                onClick={() => {
                  setFavoritesOnly(
                    false,
                  );

                  setSearch("");
                }}
              >
                All
              </button>

              <button
                type="button"
                className={
                  favoritesOnly
                    ? "active"
                    : ""
                }
                aria-pressed={
                  favoritesOnly
                }
                onClick={() => {
                  setFavoritesOnly(
                    true,
                  );

                  setSearch("");
                }}
              >
                <span
                  aria-hidden="true"
                >
                  {"\u2605"}
                </span>

                Favourites
              </button>
            </div>

            <label className="saved-phrases-search">
              <span className="sr-only">
                Search saved phrases
              </span>

              <input
                type="search"
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value,
                  )
                }
                placeholder="Search saved phrases..."
                aria-label="Search saved phrases"
              />
            </label>

            <div className="saved-phrases-summary">
              <strong>
                {total.toLocaleString()}
              </strong>

              <span>
                {favoritesOnly
                  ? total === 1
                    ? "favourite"
                    : "favourites"
                  : total === 1
                    ? "saved phrase"
                    : "saved phrases"}
              </span>
            </div>
          </section>

          {total >
          MAX_LOADED_PHRASES ? (
            <div className="info-banner">
              Showing the newest{" "}
              {MAX_LOADED_PHRASES.toLocaleString()}{" "}
              items. Search currently applies to these loaded phrases.
            </div>
          ) : null}

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

          {pageLoading ? (
            <div className="page-state">
              Loading saved phrases...
            </div>
          ) : visibleItems.length ? (
            <div className="saved-phrases-list">
              {visibleItems.map(
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
                    busyId ===
                    item.id;

                  return (
                    <article
                      className="saved-phrase-card"
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
                          <VocabularyMasteryBadge
                            savedPhraseId={
                              item.id
                            }
                          />

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
                              item.createdAt
                            }
                          >
                            {formatDate(
                              item.createdAt,
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

                      <footer className="saved-phrase-actions">
                        <button
                          type="button"
                          onClick={() =>
                            void copyTranslation(
                              item,
                            )
                          }
                          disabled={busy}
                        >
                          {copiedId ===
                          item.id
                            ? "Copied"
                            : "Copy translation"}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            runAgain(
                              item,
                            )
                          }
                          disabled={busy}
                        >
                          Run again
                        </button>

                        <button
                          type="button"
                          className={
                            item.isFavorite
                              ? "saved-phrase-favourite-action active"
                              : "saved-phrase-favourite-action"
                          }
                          onClick={() =>
                            void toggleFavorite(
                              item,
                            )
                          }
                          disabled={busy}
                        >
                          <span
                            aria-hidden="true"
                          >
                            {item.isFavorite
                              ? "\u2605"
                              : "\u2606"}
                          </span>

                          {busy
                            ? "Updating..."
                            : item.isFavorite
                              ? "Unfavourite"
                              : "Favourite"}
                        </button>

                        <button
                          type="button"
                          className="saved-phrase-deck-action"
                          onClick={() =>
                            void openDeckPicker(
                              item,
                            )
                          }
                          disabled={
                            Boolean(
                              busyId,
                            )
                          }
                        >
                          Add to deck
                        </button>

                        <button
                          type="button"
                          className="saved-phrase-delete-action"
                          onClick={() =>
                            void removePhrase(
                              item,
                            )
                          }
                          disabled={busy}
                        >
                          Delete
                        </button>
                      </footer>
                    </article>
                  );
                },
              )}
            </div>
          ) : (
            <div className="empty-state saved-phrases-empty">
              {search
                ? "No saved phrases match your search."
                : favoritesOnly
                  ? "You have not added any favourites yet."
                  : "You have not saved any phrases yet. Save a translation from the Translator to see it here."}
            </div>
          )}
        </div>

        {deckPickerItem ? (
          <div
            className="upgrade-modal-backdrop saved-phrase-deck-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (
                event.target ===
                  event.currentTarget &&
                !busyId
              ) {
                closeDeckPicker();
              }
            }}
          >
            <section
              className="upgrade-modal saved-phrase-deck-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="saved-phrase-deck-modal-title"
            >
              <button
                type="button"
                className="upgrade-modal-close"
                aria-label="Close Add to Deck"
                disabled={
                  Boolean(
                    busyId,
                  )
                }
                onClick={
                  closeDeckPicker
                }
              >
                {"\u00d7"}
              </button>

              <p className="eyebrow">
                Vocabulary Decks
              </p>

              <h2 id="saved-phrase-deck-modal-title">
                Add to deck
              </h2>

              <p className="upgrade-modal-copy">
                Choose the Vocabulary Deck where you want to practise this Saved Phrase.
              </p>

              {deckPickerLoading ? (
                <div className="page-state saved-phrase-deck-loading">
                  Loading your decks...
                </div>
              ) : deckOptions.length ? (
                <div className="saved-phrase-deck-picker">
                  <label>
                    <span>
                      Vocabulary Deck
                    </span>

                    <select
                      value={
                        selectedDeckId
                      }
                      disabled={
                        Boolean(
                          busyId,
                        )
                      }
                      onChange={(event) =>
                        setSelectedDeckId(
                          event.target.value,
                        )
                      }
                    >
                      {deckOptions.map(
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

                  {deckPickerError ? (
                    <div
                      className="form-message error saved-phrase-deck-error"
                      role="alert"
                    >
                      {deckPickerError}
                    </div>
                  ) : null}

                  <div className="saved-phrase-deck-modal-actions">
                    <button
                      type="button"
                      className="upgrade-modal-secondary"
                      disabled={
                        Boolean(
                          busyId,
                        )
                      }
                      onClick={
                        closeDeckPicker
                      }
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      className="primary-button"
                      disabled={
                        !selectedDeckId ||
                        Boolean(
                          busyId,
                        )
                      }
                      onClick={() =>
                        void addToSelectedDeck()
                      }
                    >
                      {busyId ===
                      deckPickerItem.id
                        ? "Adding..."
                        : "Add to deck"}
                    </button>
                  </div>
                </div>
              ) : deckPickerError ? (
                <div className="saved-phrase-deck-empty">
                  <p>
                    {deckPickerError}
                  </p>

                  <div className="saved-phrase-deck-modal-actions">
                    <button
                      type="button"
                      className="upgrade-modal-secondary"
                      onClick={
                        closeDeckPicker
                      }
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      className="primary-button"
                      onClick={() =>
                        void openDeckPicker(
                          deckPickerItem,
                        )
                      }
                    >
                      Try again
                    </button>
                  </div>
                </div>
              ) : (
                <div className="saved-phrase-deck-empty">
                  <p>
                    You do not have any Vocabulary Decks yet. Create a deck first, then return here to add this phrase.
                  </p>

                  <div className="saved-phrase-deck-modal-actions">
                    <button
                      type="button"
                      className="upgrade-modal-secondary"
                      onClick={
                        closeDeckPicker
                      }
                    >
                      Cancel
                    </button>

                    <Link
                      href="/dashboard/vocabulary-decks"
                      className="primary-button inline-button"
                    >
                      Create a deck
                    </Link>
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : null}
      </DashboardShell>
    </ProtectedRoute>
  );
}
