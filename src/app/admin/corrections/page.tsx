"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { DashboardShell } from "@/components/DashboardShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { transliterateWesternArmenian } from "@/lib/western-armenian-transliteration";

type FeedbackRow = {
  id: string;
  user_id: string | null;
  request_id: string;
  source_language: string;
  target_language: string;
  source_text: string;
  generated_translation: string;
  rating: string;
  suggested_translation: string | null;
  comment: string | null;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type SubmitterProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
};

function languageName(code: string) {
  if (code === "en") {
    return "English";
  }

  if (code === "hyw") {
    return "Western Armenian";
  }

  if (code === "hye") {
    return "Eastern Armenian";
  }

  return code;
}

function feedbackType(value: string) {
  if (value === "helpful") {
    return "Helpful";
  }

  if (value === "not_accurate") {
    return "Not accurate";
  }

  if (value === "correction") {
    return "Correction submitted";
  }

  return value.replaceAll("_", " ");
}

function statusName(value: string) {
  if (value === "pending") {
    return "Waiting for review";
  }

  if (value === "approved") {
    return "Approved";
  }

  if (value === "rejected") {
    return "Rejected";
  }

  return value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(
    "en-AU",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(new Date(value));
}

function ArmenianText({
  text,
  language,
}: {
  text: string | null | undefined;
  language: string;
}) {
  if (!text) {
    return <>—</>;
  }

  const showTransliteration =
    language === "hyw";

  const transliteration =
    showTransliteration
      ? transliterateWesternArmenian(text)
      : "";

  return (
    <>
      <div
        className={
          language === "hyw" ||
          language === "hye"
            ? "armenian-text"
            : undefined
        }
      >
        {text}
      </div>

      {showTransliteration &&
        transliteration &&
        transliteration !== text && (
          <div className="form-help">
            <strong>
              Latin transliteration:
            </strong>{" "}
            <span className="transliteration-text">
              {transliteration}
            </span>
          </div>
        )}
    </>
  );
}

export default function Corrections() {
  const { user } = useAuth();

  const [rows, setRows] =
    useState<FeedbackRow[]>([]);

  const [profiles, setProfiles] =
    useState<
      Record<string, SubmitterProfile>
    >({});

  const [msg, setMsg] =
    useState("");

  const [workingId, setWorkingId] =
    useState<string | null>(null);

  const load = useCallback(
    async () => {
      const supabase =
        getSupabaseBrowserClient();

      setMsg("");

      const {
        data,
        error,
      } = await supabase
        .from("translation_feedback")
        .select("*")
        .order(
          "created_at",
          {
            ascending: false,
          },
        )
        .limit(200);

      if (error) {
        setMsg(error.message);
        return;
      }

      const feedbackRows =
        (data || []) as FeedbackRow[];

      setRows(feedbackRows);

      const userIds = [
        ...new Set(
          feedbackRows
            .map(
              (row) =>
                row.user_id,
            )
            .filter(
              (
                id,
              ): id is string =>
                Boolean(id),
            ),
        ),
      ];

      if (!userIds.length) {
        setProfiles({});
        return;
      }

      const {
        data: profileRows,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select(
          "id,email,display_name",
        )
        .in(
          "id",
          userIds,
        );

      if (profileError) {
        setProfiles({});

        setMsg(
          `Corrections loaded, but submitter details could not be loaded: ${profileError.message}`,
        );

        return;
      }

      const profileMap =
        Object.fromEntries(
          (
            (profileRows ||
              []) as SubmitterProfile[]
          ).map(
            (profile) => [
              profile.id,
              profile,
            ],
          ),
        );

      setProfiles(profileMap);
    },
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function review(
    row: FeedbackRow,
    status:
      | "approved"
      | "rejected",
    promote = false,
  ) {
    const supabase =
      getSupabaseBrowserClient();

    setWorkingId(row.id);
    setMsg("");

    try {
      if (
        promote &&
        row.suggested_translation
      ) {
        const {
          error: promoteError,
        } = await supabase
          .from(
            "approved_translation_examples",
          )
          .insert({
            source_language:
              row.source_language,

            target_language:
              row.target_language,

            source_text:
              row.source_text,

            translated_text:
              row.suggested_translation,

            category:
              "user correction",

            notes:
              row.comment,

            source_name:
              "User-submitted correction",

            copyright_status:
              "User-submitted and editor-approved",

            commercial_use_allowed:
              true,

            approved:
              true,

            created_by:
              user?.id ?? null,

            approved_by:
              user?.id ?? null,

            approved_at:
              new Date()
                .toISOString(),
          });

        if (promoteError) {
          setMsg(
            promoteError.message,
          );

          return;
        }
      }

      const {
        error,
      } = await supabase
        .from(
          "translation_feedback",
        )
        .update({
          status,

          reviewed_by:
            user?.id ?? null,

          reviewed_at:
            new Date()
              .toISOString(),
        })
        .eq(
          "id",
          row.id,
        );

      if (error) {
        setMsg(error.message);
        return;
      }

      if (status === "rejected") {
        setMsg(
          "Correction rejected.",
        );
      } else if (promote) {
        setMsg(
          "Correction approved and added to Examples for translation guidance.",
        );
      } else {
        setMsg(
          "Feedback approved. The suggested translation was not added to Examples.",
        );
      }

      await load();
    } finally {
      setWorkingId(null);
    }
  }

  function submitter(
    row: FeedbackRow,
  ) {
    if (!row.user_id) {
      return {
        name: "Account unavailable",
        email: null,
      };
    }

    const profile =
      profiles[row.user_id];

    if (!profile) {
      return {
        name: "User profile unavailable",
        email: null,
      };
    }

    const displayName =
      profile.display_name?.trim();

    return {
      name:
        displayName ||
        profile.email ||
        "Registered user",

      email:
        displayName &&
        profile.email
          ? profile.email
          : null,
    };
  }

  return (
    <ProtectedRoute
      roles={[
        "language_editor",
        "admin",
      ]}
    >
      <DashboardShell
        admin
        title="Corrections"
        description="Review translation feedback submitted by registered users and decide whether trusted corrections should become approved translation examples."
      >
        <div className="info-banner">
          <strong>
            How to review corrections:
          </strong>{" "}
          Compare the original text, generated translation and the user's suggested correction. Check the comment and submitter details before making a decision.
          <br />
          <br />

          <strong>
            Approve feedback only
          </strong>{" "}
          marks the submission as reviewed and approved, but does <strong>not</strong> add the suggested translation to the translation knowledge base.
          <br />

          <strong>
            Approve &amp; add to Examples
          </strong>{" "}
          marks it approved and saves the suggested translation as an approved Example that can be used as translation guidance.
          <br />

          <strong>
            Reject
          </strong>{" "}
          marks the submission as rejected and does not add it to Examples.
        </div>

        {msg && (
          <p className="form-message">
            {msg}
          </p>
        )}

        <div className="correction-list">
          {rows.length ? (
            rows.map(
              (row) => {
                const author =
                  submitter(row);

                const working =
                  workingId ===
                  row.id;

                return (
                  <article
                    className="dashboard-card"
                    key={row.id}
                  >
                    <div className="card-heading">
                      <div className="row-actions">
                        <span
                          className={`status-chip ${row.status}`}
                        >
                          {statusName(
                            row.status,
                          )}
                        </span>

                        <span className="status-chip">
                          {feedbackType(
                            row.rating,
                          )}
                        </span>
                      </div>

                      <span>
                        {formatDate(
                          row.created_at,
                        )}
                      </span>
                    </div>

                    <dl>
                      <dt>
                        Submitted by
                      </dt>

                      <dd>
                        <strong>
                          {author.name}
                        </strong>

                        {author.email && (
                          <small>
                            {author.email}
                          </small>
                        )}
                      </dd>

                      <dt>
                        Language direction
                      </dt>

                      <dd>
                        {languageName(
                          row.source_language,
                        )}{" "}
                        →{" "}
                        {languageName(
                          row.target_language,
                        )}
                      </dd>

                      <dt>
                        Feedback type
                      </dt>

                      <dd>
                        {feedbackType(
                          row.rating,
                        )}
                      </dd>

                      <dt>
                        Original text
                      </dt>

                      <dd>
                        <ArmenianText
                          text={
                            row.source_text
                          }
                          language={
                            row.source_language
                          }
                        />
                      </dd>

                      <dt>
                        Generated translation
                      </dt>

                      <dd>
                        <ArmenianText
                          text={
                            row.generated_translation
                          }
                          language={
                            row.target_language
                          }
                        />
                      </dd>

                      <dt>
                        Suggested correction
                      </dt>

                      <dd>
                        <ArmenianText
                          text={
                            row.suggested_translation
                          }
                          language={
                            row.target_language
                          }
                        />
                      </dd>

                      <dt>
                        User comment
                      </dt>

                      <dd>
                        {row.comment ||
                          "No comment provided."}
                      </dd>

                      {row.reviewed_at && (
                        <>
                          <dt>
                            Reviewed
                          </dt>

                          <dd>
                            {formatDate(
                              row.reviewed_at,
                            )}
                          </dd>
                        </>
                      )}
                    </dl>

                    {row.status ===
                      "pending" && (
                      <>
                        <div className="info-banner">
                          <strong>
                            Review decision:
                          </strong>{" "}
                          Only add a suggested correction to Examples after you have checked that the Western Armenian translation is accurate and appropriate.
                        </div>

                        <div className="row-actions">
                          <button
                            type="button"
                            disabled={
                              working
                            }
                            onClick={() =>
                              void review(
                                row,
                                "approved",
                              )
                            }
                          >
                            {working
                              ? "Saving..."
                              : "Approve feedback only"}
                          </button>

                          <button
                            type="button"
                            className="danger-button"
                            disabled={
                              working
                            }
                            onClick={() =>
                              void review(
                                row,
                                "rejected",
                              )
                            }
                          >
                            Reject
                          </button>

                          {row.suggested_translation && (
                            <button
                              type="button"
                              className="primary-button"
                              disabled={
                                working
                              }
                              onClick={() =>
                                void review(
                                  row,
                                  "approved",
                                  true,
                                )
                              }
                            >
                              {working
                                ? "Saving..."
                                : "Approve & add to Examples"}
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </article>
                );
              },
            )
          ) : (
            <div className="empty-state">
              No translation corrections or feedback have been submitted yet.
            </div>
          )}
        </div>
      </DashboardShell>
    </ProtectedRoute>
  );
}