"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
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
  useAuth,
} from "@/contexts/AuthContext";
import {
  clearHistory,
  deleteHistoryItem,
  listHistory,
  type HistoryFilter,
  type HistoryItem,
  type HistoryType,
} from "@/lib/history-api";
import {
  hasPaidFeatureAccess,
} from "@/lib/paid-feature-access";


const PAGE_SIZE = 12;

const FILTERS: Array<{
  value: HistoryFilter;
  label: string;
}> = [
  {
    value: "all",
    label: "All",
  },
  {
    value: "translation",
    label: "Translations",
  },
  {
    value: "thesaurus",
    label: "Thesaurus",
  },
  {
    value: "role_play",
    label: "Role-Play",
  },
];


function typeLabel(
  type: HistoryType,
): string {
  if (type === "translation") {
    return "Translation";
  }

  if (type === "thesaurus") {
    return "Thesaurus";
  }

  return "Role-Play";
}


function languageLabel(
  value: string,
): string {
  if (value === "en") {
    return "English";
  }

  if (value === "hyw") {
    return "Western Armenian";
  }

  if (value === "hye") {
    return "Eastern Armenian";
  }

  return value;
}


function formatDate(
  value: string,
): string {
  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(date);
}


function displayList(
  values: string[],
): string {
  return values.length
    ? values.join(" · ")
    : "None saved";
}


export default function HistoryPage() {
  const {
    user,
    profile,
    plan,
    session,
    loading: authLoading,
  } = useAuth();

  const router = useRouter();

  const [
    items,
    setItems,
  ] = useState<HistoryItem[]>([]);

  const [
    filter,
    setFilter,
  ] = useState<HistoryFilter>("all");

  const [
    searchInput,
    setSearchInput,
  ] = useState("");

  const [
    query,
    setQuery,
  ] = useState("");

  const [
    page,
    setPage,
  ] = useState(0);

  const [
    hasMore,
    setHasMore,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    mutating,
    setMutating,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  const [
    message,
    setMessage,
  ] = useState<string | null>(null);

  const requestAbortRef =
    useRef<AbortController | null>(null);

  const hasAccess =
    hasPaidFeatureAccess(
      "history",
      {
        isAuthenticated:
          Boolean(user),
        role:
          profile?.role,
        planSlug:
          plan?.slug,
      },
    );


  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        setPage(0);
        setQuery(
          searchInput.trim(),
        );
      },
      300,
    );

    return () => {
      window.clearTimeout(timer);
    };
  }, [searchInput]);


  const load = useCallback(
    async () => {
      if (
        authLoading ||
        !hasAccess ||
        !session?.access_token
      ) {
        return;
      }

      requestAbortRef.current?.abort();

      const controller =
        new AbortController();

      requestAbortRef.current =
        controller;

      setLoading(true);
      setError(null);

      try {
        const result =
          await listHistory(
            session.access_token,
            {
              type: filter,
              query,
              limit: PAGE_SIZE,
              offset:
                page * PAGE_SIZE,
              signal:
                controller.signal,
            },
          );

        setItems(result.items);
        setHasMore(result.hasMore);
      } catch (cause) {
        if (
          cause instanceof DOMException &&
          cause.name === "AbortError"
        ) {
          return;
        }

        setItems([]);
        setHasMore(false);
        setError(
          cause instanceof Error
            ? cause.message
            : "History could not be loaded. Please try again.",
        );
      } finally {
        if (
          requestAbortRef.current ===
          controller
        ) {
          requestAbortRef.current = null;
          setLoading(false);
        }
      }
    },
    [
      authLoading,
      filter,
      hasAccess,
      page,
      query,
      session?.access_token,
    ],
  );


  useEffect(() => {
    void load();

    return () => {
      requestAbortRef.current?.abort();
    };
  }, [load]);


  function changeFilter(
    next: HistoryFilter,
  ) {
    setMessage(null);
    setPage(0);
    setFilter(next);
  }


  async function copyText(
    value: string,
  ) {
    try {
      await navigator.clipboard.writeText(
        value,
      );
      setMessage("Copied to clipboard.");
    } catch {
      setError(
        "Could not copy to the clipboard.",
      );
    }
  }


  function rerunTranslation(
    item: Extract<
      HistoryItem,
      {
        type: "translation";
      }
    >,
  ) {
    localStorage.setItem(
      "wat-prefill",
      JSON.stringify({
        text:
          item.data.sourceText,
        source:
          item.data.sourceLanguage,
        target:
          item.data.targetLanguage,
      }),
    );

    router.push("/");
  }


  function reopenThesaurus(
    input: string,
  ) {
    router.push(
      `/thesaurus?text=${encodeURIComponent(
        input,
      )}`,
    );
  }


  function practiceRolePlayAgain() {
    router.push("/role-play");
  }


  async function removeItem(
    item: HistoryItem,
  ) {
    if (
      !session?.access_token ||
      mutating
    ) {
      return;
    }

    if (
      !window.confirm(
        `Delete this ${typeLabel(
          item.type,
        ).toLowerCase()} history item?`,
      )
    ) {
      return;
    }

    setMutating(true);
    setError(null);
    setMessage(null);

    try {
      await deleteHistoryItem(
        session.access_token,
        item.type,
        item.id,
      );

      if (
        items.length === 1 &&
        page > 0
      ) {
        setPage(
          (current) =>
            Math.max(0, current - 1),
        );
      } else {
        await load();
      }

      setMessage("History item deleted.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not delete this History item.",
      );
    } finally {
      setMutating(false);
    }
  }


  async function clearVisibleHistory() {
    if (
      !session?.access_token ||
      mutating
    ) {
      return;
    }

    const description =
      filter === "all"
        ? "all Translation, Thesaurus and Role-Play history"
        : `all ${typeLabel(
            filter,
          )} history`;

    if (
      !window.confirm(
        `Permanently delete ${description}? This cannot be undone.`,
      )
    ) {
      return;
    }

    setMutating(true);
    setError(null);
    setMessage(null);

    try {
      await clearHistory(
        session.access_token,
        filter,
      );

      setPage(0);
      setItems([]);
      setHasMore(false);
      setMessage(
        filter === "all"
          ? "All History cleared."
          : `${typeLabel(filter)} History cleared.`,
      );

      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not clear History.",
      );
    } finally {
      setMutating(false);
    }
  }


  function renderItem(
    item: HistoryItem,
  ) {
    if (item.type === "translation") {
      return (
        <article
          key={`${item.type}-${item.id}`}
          className="history-card"
        >
          <div className="history-card-header">
            <div className="history-card-heading">
              <span className="history-type-badge">
                Translation
              </span>

              <span className="history-language-pair">
                {languageLabel(
                  item.data.sourceLanguage,
                )}
                {" → "}
                {languageLabel(
                  item.data.targetLanguage,
                )}
              </span>
            </div>

            <time dateTime={item.createdAt}>
              {formatDate(item.createdAt)}
            </time>
          </div>

          <p className="history-source">
            {item.data.sourceText}
          </p>

          <p className="history-result armenian-text">
            {item.data.translatedText}
          </p>

          <div className="history-card-actions">
            <button
              type="button"
              onClick={() =>
                void copyText(
                  item.data.translatedText,
                )
              }
            >
              Copy translation
            </button>

            <button
              type="button"
              className="history-primary-action"
              onClick={() =>
                rerunTranslation(item)
              }
            >
              Run again
            </button>

            <button
              type="button"
              className="history-delete-action"
              disabled={mutating}
              onClick={() =>
                void removeItem(item)
              }
            >
              Delete
            </button>
          </div>
        </article>
      );
    }

    if (item.type === "thesaurus") {
      return (
        <article
          key={`${item.type}-${item.id}`}
          className="history-card"
        >
          <div className="history-card-header">
            <div className="history-card-heading">
              <span className="history-type-badge">
                Thesaurus
              </span>
            </div>

            <time dateTime={item.createdAt}>
              {formatDate(item.createdAt)}
            </time>
          </div>

          <p className="history-thesaurus-input armenian-text">
            {item.data.input}
          </p>

          <div className="history-thesaurus-groups">
            <div className="history-thesaurus-group">
              <strong>Synonyms</strong>
              <p className="armenian-text">
                {displayList(
                  item.data.synonyms,
                )}
              </p>
            </div>

            <div className="history-thesaurus-group">
              <strong>Antonyms</strong>
              <p className="armenian-text">
                {displayList(
                  item.data.antonyms,
                )}
              </p>
            </div>

            <div className="history-thesaurus-group">
              <strong>
                Alternative phrasing
              </strong>
              <p className="armenian-text">
                {displayList(
                  item.data.alternatives,
                )}
              </p>
            </div>
          </div>

          <div className="history-card-actions">
            <button
              type="button"
              onClick={() =>
                void copyText(
                  [
                    item.data.input,
                    `Synonyms: ${displayList(
                      item.data.synonyms,
                    )}`,
                    `Antonyms: ${displayList(
                      item.data.antonyms,
                    )}`,
                    `Alternative phrasing: ${displayList(
                      item.data.alternatives,
                    )}`,
                  ].join("\n"),
                )
              }
            >
              Copy results
            </button>

            <button
              type="button"
              className="history-primary-action"
              onClick={() =>
                reopenThesaurus(
                  item.data.input,
                )
              }
            >
              Open in Thesaurus
            </button>

            <button
              type="button"
              className="history-delete-action"
              disabled={mutating}
              onClick={() =>
                void removeItem(item)
              }
            >
              Delete
            </button>
          </div>
        </article>
      );
    }

    return (
      <article
        key={`${item.type}-${item.id}`}
        className="history-card"
      >
        <div className="history-card-header">
          <div className="history-card-heading">
            <span className="history-type-badge">
              Role-Play
            </span>

            <span className="history-role-play-meta">
              {item.data.messageCount.toLocaleString()}
              {item.data.messageCount === 1
                ? " message"
                : " messages"}
              {" · "}
              {item.data.status}
            </span>
          </div>

          <time dateTime={item.data.lastActivityAt}>
            {formatDate(
              item.data.lastActivityAt,
            )}
          </time>
        </div>

        <p className="history-role-play-title">
          {item.data.scenarioTitle}
        </p>

        <p className="history-role-play-meta">
          Started {formatDate(
            item.data.startedAt,
          )}
          {" · "}
          {item.data.interactionMode}
        </p>

        <div className="history-card-actions">
          <button
            type="button"
            className="history-primary-action"
            onClick={practiceRolePlayAgain}
          >
            Practice again
          </button>

          <button
            type="button"
            className="history-delete-action"
            disabled={mutating}
            onClick={() =>
              void removeItem(item)
            }
          >
            Delete
          </button>
        </div>
      </article>
    );
  }


  return (
    <ProtectedRoute>
      <DashboardShell
        title="History"
        description="Search your recent translations, Thesaurus lookups and Role-Play practice in one private activity timeline."
      >
        {!authLoading &&
        !hasAccess ? (
          <section className="history-access-card">
            <div>
              <p className="eyebrow">
                Paid feature
              </p>

              <h2>
                Unlock searchable History
              </h2>

              <p>
                Unified Translation, Thesaurus and Role-Play History is included with Person and Schools access.
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
            <section className="history-toolbar">
              <div className="history-search-row">
                <input
                  className="history-search-input"
                  type="search"
                  value={searchInput}
                  maxLength={200}
                  placeholder="Search source text, translations, Thesaurus results or Role-Play scenarios"
                  aria-label="Search History"
                  onChange={(event) =>
                    setSearchInput(
                      event.target.value,
                    )
                  }
                />

                <button
                  type="button"
                  className="danger-button"
                  disabled={mutating}
                  onClick={() =>
                    void clearVisibleHistory()
                  }
                >
                  {filter === "all"
                    ? "Clear all History"
                    : `Clear ${typeLabel(
                        filter,
                      )}`}
                </button>
              </div>

              <div className="history-toolbar-actions">
                <div
                  className="history-filter-row"
                  aria-label="History type filters"
                >
                  {FILTERS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={
                        filter === option.value
                          ? "history-filter-button active"
                          : "history-filter-button"
                      }
                      aria-pressed={
                        filter === option.value
                      }
                      onClick={() =>
                        changeFilter(
                          option.value,
                        )
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <span className="history-results-meta">
                  {query
                    ? `Searching for “${query}”`
                    : filter === "all"
                      ? "All activity"
                      : `${typeLabel(filter)} activity`}
                  {page > 0
                    ? ` · Page ${page + 1}`
                    : ""}
                </span>
              </div>
            </section>

            {error && (
              <div
                className="history-message error"
                role="alert"
              >
                {error}
              </div>
            )}

            {message && (
              <div
                className="history-message"
                role="status"
              >
                {message}
              </div>
            )}

            {loading ? (
              <div className="history-loading">
                Loading History...
              </div>
            ) : items.length ? (
              <div className="history-list unified">
                {items.map(renderItem)}
              </div>
            ) : (
              <div className="history-empty">
                {query
                  ? "No History items match this search."
                  : filter === "all"
                    ? "No History items yet. Your translations, Thesaurus lookups and Role-Play sessions will appear here."
                    : `No ${typeLabel(
                        filter,
                      )} History items found.`}
              </div>
            )}

            <div className="history-pagination">
              <button
                type="button"
                disabled={
                  loading ||
                  page === 0
                }
                onClick={() =>
                  setPage(
                    (current) =>
                      Math.max(
                        0,
                        current - 1,
                      ),
                  )
                }
              >
                Previous
              </button>

              <button
                type="button"
                disabled={
                  loading ||
                  !hasMore
                }
                onClick={() =>
                  setPage(
                    (current) =>
                      current + 1,
                  )
                }
              >
                Next
              </button>
            </div>
          </>
        )}
      </DashboardShell>
    </ProtectedRoute>
  );
}
