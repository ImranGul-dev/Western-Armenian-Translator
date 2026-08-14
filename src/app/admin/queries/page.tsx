"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminHelp } from "@/components/AdminHelp";
import { DashboardShell } from "@/components/DashboardShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

import type { Profile } from "@/types/database";

interface QueryRow {
  id: string;
  user_id: string;
  request_id: string;
  source_language: string;
  target_language: string;
  source_text: string;
  translated_text: string;
  character_count: number;
  created_at: string;
}

function languageName(code: string): string {
  switch (code) {
    case "en":
      return "English";

    case "hyw":
      return "Western Armenian";

    case "hye":
      return "Eastern Armenian";

    default:
      return code;
  }
}

export default function AdminQueriesPage() {
  const [rows, setRows] =
    useState<QueryRow[]>([]);

  const [profiles, setProfiles] =
    useState<
      Record<
        string,
        Pick<
          Profile,
          "email" | "display_name"
        >
      >
    >({});

  const [search, setSearch] =
    useState("");

  const [direction, setDirection] =
    useState("all");

  const [message, setMessage] =
    useState("");

  const load = useCallback(async () => {
    const supabase =
      getSupabaseBrowserClient();

    const [
      {
        data: translations,
        error,
      },
      {
        data: users,
      },
    ] = await Promise.all([
      supabase
        .from("translation_history")
        .select(
          "id,user_id,request_id,source_language,target_language,source_text,translated_text,character_count,created_at",
        )
        .eq(
          "admin_visible",
          true,
        )
        .order(
          "created_at",
          {
            ascending: false,
          },
        )
        .limit(250),

      supabase
        .from("profiles")
        .select(
          "id,email,display_name",
        ),
    ]);

    if (error) {
      setMessage(
        error.message,
      );
    }

    setRows(
      (translations as QueryRow[]) ||
        [],
    );

    setProfiles(
      Object.fromEntries(
        (users || []).map(
          (user) => [
            user.id,
            user,
          ],
        ),
      ),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible =
    useMemo(
      () =>
        rows.filter((row) => {
          const matchesDirection =
            direction === "all" ||
            `${row.source_language}-${row.target_language}` ===
              direction;

          const needle =
            search
              .trim()
              .toLocaleLowerCase();

          const person =
            profiles[row.user_id];

          const matchesSearch =
            !needle ||
            [
              row.source_text,
              row.translated_text,
              person?.email,
              person?.display_name,
              row.request_id,
            ].some((item) =>
              item
                ?.toLocaleLowerCase()
                .includes(needle),
            );

          return (
            matchesDirection &&
            matchesSearch
          );
        }),
      [
        direction,
        profiles,
        rows,
        search,
      ],
    );

  return (
    <ProtectedRoute
      roles={["admin"]}
    >
      <DashboardShell
        admin
        title="Translation review"
        description="Review saved translations that registered users have allowed administrators to see for translation quality checking."
      >
        <div className="info-banner">
          Privacy rule: this page only shows saved translations that users have allowed administrators to review. If a user turns review consent off in Account settings, their saved translations are removed from this admin review view.
        </div>

        {message && (
          <div className="info-banner">
            {message}
          </div>
        )}

        <section className="dashboard-card">
          <div className="card-heading">
            <div>
              <div className="admin-section-title">
                <h2>
                  Translations available for review
                </h2>

                <AdminHelp
                  label="About translation review"
                  description="This area lets administrators review saved translations that registered users have explicitly made available for quality checking. It does not automatically contain every translation made on the site."
                  example="A user translates 'How are you?' and has admin review enabled. The source and translated result can appear here so an administrator can check translation quality."
                />
              </div>

              <p>
                {visible.length} visible records from the most recent 250 translations available for review.
              </p>
            </div>

            <div className="table-actions">
              <input
                aria-label="Search translations"
                placeholder="Search text, email or request ID"
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value,
                  )
                }
              />

              <select
                value={direction}
                onChange={(event) =>
                  setDirection(
                    event.target.value,
                  )
                }
              >
                <option value="all">
                  All directions
                </option>

                <option value="en-hyw">
                  English to Western Armenian
                </option>

                <option value="hyw-en">
                  Western Armenian to English
                </option>

                <option value="hye-hyw">
                  Eastern Armenian to Western Armenian
                </option>

                <option value="en-hye">
                  English to Eastern Armenian
                </option>

                <option value="hye-en">
                  Eastern Armenian to English
                </option>
              </select>

              <button
                type="button"
                onClick={() =>
                  void load()
                }
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="query-review-list">
            {visible.map((row) => {
              const person =
                profiles[row.user_id];

              return (
                <article
                  className="query-review-card"
                  key={row.id}
                >
                  <div className="card-heading">
                    <div>
                      <strong>
                        {languageName(
                          row.source_language,
                        )}{" "}
                        to{" "}
                        {languageName(
                          row.target_language,
                        )}
                      </strong>

                      <small>
                        {person?.display_name ||
                          person?.email ||
                          row.user_id}
                      </small>
                    </div>

                    <div>
                      <small>
                        {new Date(
                          row.created_at,
                        ).toLocaleString()}
                      </small>

                      <small>
                        {row.character_count.toLocaleString()}{" "}
                        characters
                      </small>
                    </div>
                  </div>

                  <div className="query-columns">
                    <div>
                      <span>
                        Source text
                      </span>

                      <p>
                        {row.source_text}
                      </p>
                    </div>

                    <div>
                      <span>
                        Translation
                      </span>

                      <p className="armenian-text">
                        {
                          row.translated_text
                        }
                      </p>
                    </div>
                  </div>

                  <small>
                    Request ID:{" "}
                    {row.request_id}
                  </small>
                </article>
              );
            })}
          </div>

          {!visible.length && (
            <div className="empty-state">
              No translations available for review match these filters.
            </div>
          )}
        </section>
      </DashboardShell>
    </ProtectedRoute>
  );
}