"use client";

import Link from "next/link";
import {
  FormEvent,
  KeyboardEvent,
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
  endRolePlaySession,
  listRolePlayScenarios,
  sendRolePlayMessage,
  startRolePlaySession,
  type RolePlayScenario,
  type RolePlaySession,
  type RolePlayTurn,
} from "@/lib/role-play-api";

import {
  transliterateWesternArmenian,
} from "@/lib/western-armenian-transliteration";


function formatDifficulty(
  value: RolePlayScenario["difficulty"],
): string {
  return value.charAt(0).toUpperCase() +
    value.slice(1);
}


function AssistantMessage({
  content,
}: {
  content: string;
}) {
  const transliteration =
    transliterateWesternArmenian(
      content,
    );

  return (
    <div className="role-play-assistant-content">
      <div className="armenian-text role-play-armenian-message">
        {content}
      </div>

      {transliteration &&
        transliteration !== content && (
          <div className="transliteration-text role-play-transliteration">
            {transliteration}
          </div>
        )}
    </div>
  );
}


export default function RolePlayPage() {
  const {
    user,
    profile,
    plan,
    session,
    loading: authLoading,
  } = useAuth();

  const hasAccess =
    hasPaidFeatureAccess(
      "role_play",
      {
        isAuthenticated:
          Boolean(user),

        role:
          profile?.role,

        planSlug:
          plan?.slug,
      },
    );

  const [
    scenarios,
    setScenarios,
  ] =
    useState<RolePlayScenario[]>(
      [],
    );

  const [
    selectedSlug,
    setSelectedSlug,
  ] =
    useState("");

  const [
    activeScenario,
    setActiveScenario,
  ] =
    useState<RolePlayScenario | null>(
      null,
    );

  const [
    roleSession,
    setRoleSession,
  ] =
    useState<RolePlaySession | null>(
      null,
    );

  const [
    turns,
    setTurns,
  ] =
    useState<RolePlayTurn[]>(
      [],
    );

  const [
    draft,
    setDraft,
  ] =
    useState("");

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    loadingScenarios,
    setLoadingScenarios,
  ] =
    useState(false);

  const [
    starting,
    setStarting,
  ] =
    useState(false);

  const [
    sending,
    setSending,
  ] =
    useState(false);

  const [
    ending,
    setEnding,
  ] =
    useState(false);

  const listAbortRef =
    useRef<AbortController | null>(
      null,
    );

  const actionAbortRef =
    useRef<AbortController | null>(
      null,
    );

  const bottomRef =
    useRef<HTMLDivElement | null>(
      null,
    );


  useEffect(() => {
    if (
      authLoading ||
      !hasAccess ||
      !session?.access_token
    ) {
      return;
    }

    listAbortRef.current?.abort();

    const controller =
      new AbortController();

    listAbortRef.current =
      controller;

    setLoadingScenarios(true);
    setError(null);

    void listRolePlayScenarios(
      session.access_token,
      controller.signal,
    )
      .then((next) => {
        setScenarios(
          next,
        );

        setSelectedSlug(
          (current) =>
            current ||
            next[0]?.slug ||
            "",
        );
      })
      .catch((cause) => {
        if (
          cause instanceof DOMException &&
          cause.name === "AbortError"
        ) {
          return;
        }

        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load Role-Play scenarios.",
        );
      })
      .finally(() => {
        if (
          listAbortRef.current ===
          controller
        ) {
          listAbortRef.current =
            null;

          setLoadingScenarios(
            false,
          );
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    authLoading,
    hasAccess,
    session?.access_token,
  ]);


  useEffect(() => {
    bottomRef.current?.scrollIntoView(
      {
        behavior:
          "smooth",

        block:
          "nearest",
      },
    );
  }, [
    turns,
    sending,
  ]);


  useEffect(() => {
    return () => {
      listAbortRef.current?.abort();
      actionAbortRef.current?.abort();
    };
  }, []);


  const selectedScenario =
    scenarios.find(
      (scenario) =>
        scenario.slug ===
        selectedSlug,
    ) ?? null;


  async function startScenario() {
    if (
      !selectedScenario ||
      !session?.access_token ||
      starting
    ) {
      return;
    }

    actionAbortRef.current?.abort();

    const controller =
      new AbortController();

    actionAbortRef.current =
      controller;

    setStarting(true);
    setError(null);

    try {
      const result =
        await startRolePlaySession(
          selectedScenario.slug,
          session.access_token,
          "text",
          controller.signal,
        );

      setActiveScenario(
        result.scenario,
      );

      setRoleSession(
        result.session,
      );

      setTurns([
        result.turn,
      ]);

      setDraft("");
    } catch (cause) {
      if (
        cause instanceof DOMException &&
        cause.name === "AbortError"
      ) {
        return;
      }

      setError(
        cause instanceof Error
          ? cause.message
          : "Could not start the Role-Play session.",
      );
    } finally {
      if (
        actionAbortRef.current ===
        controller
      ) {
        actionAbortRef.current =
          null;

        setStarting(false);
      }
    }
  }


  async function submitMessage(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const value =
      draft.trim();

    if (
      !value ||
      !roleSession ||
      roleSession.status !== "active" ||
      !session?.access_token ||
      sending
    ) {
      return;
    }

    actionAbortRef.current?.abort();

    const controller =
      new AbortController();

    actionAbortRef.current =
      controller;

    setSending(true);
    setError(null);

    try {
      const result =
        await sendRolePlayMessage(
          roleSession.id,
          value,
          session.access_token,
          "text",
          controller.signal,
        );

      setRoleSession(
        result.session,
      );

      setTurns(
        (current) => [
          ...current,
          result.userTurn,
          result.assistantTurn,
        ],
      );

      setDraft("");
    } catch (cause) {
      if (
        cause instanceof DOMException &&
        cause.name === "AbortError"
      ) {
        return;
      }

      setError(
        cause instanceof Error
          ? cause.message
          : "Could not send your message.",
      );
    } finally {
      if (
        actionAbortRef.current ===
        controller
      ) {
        actionAbortRef.current =
          null;

        setSending(false);
      }
    }
  }


  function handleComposerKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();

      event.currentTarget
        .form
        ?.requestSubmit();
    }
  }


  async function endSession() {
    if (
      !roleSession ||
      roleSession.status !== "active" ||
      !session?.access_token ||
      ending
    ) {
      return;
    }

    actionAbortRef.current?.abort();

    const controller =
      new AbortController();

    actionAbortRef.current =
      controller;

    setEnding(true);
    setError(null);

    try {
      const result =
        await endRolePlaySession(
          roleSession.id,
          session.access_token,
          controller.signal,
        );

      setRoleSession(
        result.session,
      );
    } catch (cause) {
      if (
        cause instanceof DOMException &&
        cause.name === "AbortError"
      ) {
        return;
      }

      setError(
        cause instanceof Error
          ? cause.message
          : "Could not end the Role-Play session.",
      );
    } finally {
      if (
        actionAbortRef.current ===
        controller
      ) {
        actionAbortRef.current =
          null;

        setEnding(false);
      }
    }
  }


  function chooseAnotherScenario() {
    actionAbortRef.current?.abort();

    setActiveScenario(
      null,
    );

    setRoleSession(
      null,
    );

    setTurns(
      [],
    );

    setDraft(
      "",
    );

    setError(
      null,
    );
  }


  return (
    <ProtectedRoute>
      <SiteFrame compact>
        <main className="role-play-page">
          <section className="role-play-hero">
            <p className="eyebrow">
              Paid conversation practice
            </p>

            <h1>
              AI Role-Play
            </h1>

            <p>
              Practise real-world Western Armenian
              conversations through guided scenarios
              designed for everyday speaking.
            </p>
          </section>

          {!authLoading &&
          !hasAccess ? (
            <section className="role-play-access-card">
              <div>
                <p className="eyebrow">
                  Paid feature
                </p>

                <h2>
                  Unlock AI Role-Play
                </h2>

                <p>
                  Interactive Western Armenian
                  conversation practice is included
                  with Person and Schools access.
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
              {error && (
                <div
                  className="role-play-message role-play-error"
                  role="alert"
                >
                  {error}
                </div>
              )}

              {!roleSession ? (
                <section className="role-play-scenario-panel">
                  <div className="role-play-section-heading">
                    <div>
                      <p className="eyebrow">
                        Choose a situation
                      </p>

                      <h2>
                        Practice scenarios
                      </h2>

                      <p>
                        Pick a real-world setting and
                        start a guided text conversation.
                      </p>
                    </div>

                    <span className="role-play-mode-badge">
                      Text practice
                    </span>
                  </div>

                  {loadingScenarios ? (
                    <div className="role-play-loading-card">
                      Loading scenarios...
                    </div>
                  ) : scenarios.length ? (
                    <>
                      <div className="role-play-scenario-grid">
                        {scenarios.map(
                          (scenario) => {
                            const selected =
                              selectedSlug ===
                              scenario.slug;

                            return (
                              <button
                                key={
                                  scenario.id
                                }
                                type="button"
                                className={
                                  selected
                                    ? "role-play-scenario-card selected"
                                    : "role-play-scenario-card"
                                }
                                aria-pressed={
                                  selected
                                }
                                onClick={() =>
                                  setSelectedSlug(
                                    scenario.slug,
                                  )
                                }
                              >
                                <div className="role-play-scenario-card-top">
                                  <span className="role-play-scenario-category">
                                    {
                                      scenario.category
                                    }
                                  </span>

                                  <span className="role-play-difficulty">
                                    {
                                      formatDifficulty(
                                        scenario.difficulty,
                                      )
                                    }
                                  </span>
                                </div>

                                <h3>
                                  {
                                    scenario.title
                                  }
                                </h3>

                                <p>
                                  {
                                    scenario.description
                                  }
                                </p>

                                <div className="role-play-scenario-goal">
                                  <strong>
                                    Your role:
                                  </strong>{" "}
                                  {
                                    scenario.userRole
                                  }
                                </div>
                              </button>
                            );
                          },
                        )}
                      </div>

                      {selectedScenario && (
                        <div className="role-play-start-panel">
                          <div>
                            <span className="role-play-start-label">
                              Ready to practise
                            </span>

                            <strong>
                              {
                                selectedScenario.title
                              }
                            </strong>

                            <span>
                              {
                                selectedScenario.setting
                              }
                            </span>
                          </div>

                          <button
                            type="button"
                            className="primary-button role-play-start-button"
                            disabled={
                              starting
                            }
                            onClick={() =>
                              void startScenario()
                            }
                          >
                            {starting
                              ? "Starting..."
                              : "Start conversation"}
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="role-play-loading-card">
                      No published Role-Play scenarios
                      are available yet.
                    </div>
                  )}
                </section>
              ) : (
                <section className="role-play-conversation">
                  <header className="role-play-conversation-header">
                    <div>
                      <div className="role-play-conversation-meta">
                        <span className="role-play-mode-badge">
                          Text practice
                        </span>

                        <span
                          className={
                            roleSession.status ===
                            "active"
                              ? "role-play-status active"
                              : "role-play-status completed"
                          }
                        >
                          {
                            roleSession.status ===
                            "active"
                              ? "Active session"
                              : "Session complete"
                          }
                        </span>
                      </div>

                      <h2>
                        {activeScenario?.title ??
                          roleSession.scenarioTitle}
                      </h2>

                      {activeScenario && (
                        <p>
                          {
                            activeScenario.description
                          }
                        </p>
                      )}
                    </div>

                    {roleSession.status ===
                      "active" && (
                      <button
                        type="button"
                        className="role-play-end-button"
                        disabled={
                          ending ||
                          sending
                        }
                        onClick={() =>
                          void endSession()
                        }
                      >
                        {ending
                          ? "Ending..."
                          : "End session"}
                      </button>
                    )}
                  </header>

                  <div
                    className="role-play-transcript"
                    role="log"
                    aria-live="polite"
                    aria-label="Role-Play conversation"
                  >
                    {turns.map(
                      (turn) => (
                        <article
                          key={
                            turn.turnIndex
                          }
                          className={
                            turn.speaker ===
                            "assistant"
                              ? "role-play-turn assistant"
                              : "role-play-turn user"
                          }
                        >
                          <div className="role-play-turn-label">
                            {turn.speaker ===
                            "assistant"
                              ? "Role-Play"
                              : "You"}
                          </div>

                          <div className="role-play-bubble">
                            {turn.speaker ===
                            "assistant" ? (
                              <AssistantMessage
                                content={
                                  turn.content
                                }
                              />
                            ) : (
                              <div className="role-play-user-message">
                                {
                                  turn.content
                                }
                              </div>
                            )}
                          </div>
                        </article>
                      ),
                    )}

                    {sending && (
                      <article className="role-play-turn assistant">
                        <div className="role-play-turn-label">
                          Role-Play
                        </div>

                        <div className="role-play-bubble role-play-thinking">
                          Thinking...
                        </div>
                      </article>
                    )}

                    <div
                      ref={
                        bottomRef
                      }
                    />
                  </div>

                  {roleSession.status ===
                  "active" ? (
                    <form
                      className="role-play-composer"
                      onSubmit={
                        submitMessage
                      }
                    >
                      <label
                        htmlFor="role-play-message"
                        className="role-play-composer-label"
                      >
                        Your message
                      </label>

                      <textarea
                        id="role-play-message"
                        value={
                          draft
                        }
                        maxLength={
                          5000
                        }
                        rows={
                          3
                        }
                        disabled={
                          sending ||
                          ending
                        }
                        placeholder="Reply in English, Western Armenian, or Latin Armenian..."
                        onChange={(
                          event,
                        ) =>
                          setDraft(
                            event.target
                              .value,
                          )
                        }
                        onKeyDown={
                          handleComposerKeyDown
                        }
                      />

                      <div className="role-play-composer-footer">
                        <span>
                          Press Enter to send.
                          Shift + Enter adds a new line.
                        </span>

                        <button
                          type="submit"
                          className="primary-button role-play-send-button"
                          disabled={
                            sending ||
                            ending ||
                            !draft.trim()
                          }
                        >
                          {sending
                            ? "Sending..."
                            : "Send"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="role-play-complete-panel">
                      <div>
                        <strong>
                          Practice session complete
                        </strong>

                        <span>
                          Your conversation has been
                          saved for future practice
                          history and analytics.
                        </span>
                      </div>

                      <button
                        type="button"
                        className="primary-button"
                        onClick={
                          chooseAnotherScenario
                        }
                      >
                        Choose another scenario
                      </button>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </main>
      </SiteFrame>
    </ProtectedRoute>
  );
}