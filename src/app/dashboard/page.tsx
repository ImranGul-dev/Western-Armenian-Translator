"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
} from "react";

import {
  ProtectedRoute,
} from "@/components/ProtectedRoute";

import {
  DashboardShell,
} from "@/components/DashboardShell";

import {
  UsageMeter,
} from "@/components/UsageMeter";

import {
  useAuth,
} from "@/contexts/AuthContext";

import {
  hasPaidFeatureAccess,
} from "@/lib/paid-feature-access";

import {
  loadPracticeStreak,
  type PracticeStreak,
} from "@/lib/practice-streak-api";

import {
  getSupabaseBrowserClient,
} from "@/lib/supabase/client";

import type {
  UsageSummary,
} from "@/types/database";

import styles from "./dashboard-overview.module.css";


const LANGUAGE_LABELS:
  Record<string, string> = {
    en:
      "English",
    english:
      "English",

    hyw:
      "Western Armenian",
    "western-armenian":
      "Western Armenian",
    western_armenian:
      "Western Armenian",
    "western armenian":
      "Western Armenian",

    hye:
      "Eastern Armenian",
    hy:
      "Eastern Armenian",
    "eastern-armenian":
      "Eastern Armenian",
    eastern_armenian:
      "Eastern Armenian",
    "eastern armenian":
      "Eastern Armenian",
  };


function getLanguageLabel(
  language:
    string | null | undefined,
) {
  if (!language) {
    return "Unknown";
  }

  const normalizedLanguage =
    language
      .trim()
      .toLowerCase();

  return LANGUAGE_LABELS[
    normalizedLanguage
  ] || language;
}


function formatTranslationDate(
  value:
    string | null | undefined,
) {
  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  const day =
    new Intl.DateTimeFormat(
      "en-AU",
      {
        day:
          "numeric",
      },
    ).format(date);

  const month =
    new Intl.DateTimeFormat(
      "en-AU",
      {
        month:
          "long",
      },
    ).format(date);

  const year =
    new Intl.DateTimeFormat(
      "en-AU",
      {
        year:
          "numeric",
      },
    ).format(date);

  return `${day} ${month}, ${year}`;
}


function formatPracticeDate(
  value: string | null,
): string {
  if (!value) {
    return "No practice yet";
  }

  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/u.exec(
      value,
    );

  if (!match) {
    return value;
  }

  const year =
    Number(match[1]);

  const month =
    Number(match[2]);

  const day =
    Number(match[3]);

  const date =
    new Date(
      year,
      month - 1,
      day,
    );

  return new Intl.DateTimeFormat(
    "en-AU",
    {
      day:
        "numeric",
      month:
        "short",
      year:
        "numeric",
    },
  ).format(date);
}


function dayLabel(
  value: number,
): string {
  return value === 1
    ? "day"
    : "days";
}


function reviewLabel(
  value: number,
): string {
  return value === 1
    ? "review"
    : "reviews";
}


export default function Dashboard() {
  const {
    session,
    user,
    profile,
    plan,
  } = useAuth();

  const [
    usage,
    setUsage,
  ] =
    useState<UsageSummary | null>(
      null,
    );

  const [
    history,
    setHistory,
  ] =
    useState<any[]>([]);

  const [
    practiceStreak,
    setPracticeStreak,
  ] =
    useState<PracticeStreak | null>(
      null,
    );

  const [
    practiceTimezone,
    setPracticeTimezone,
  ] =
    useState("");

  const [
    practiceStreakLoading,
    setPracticeStreakLoading,
  ] =
    useState(false);

  const [
    practiceStreakError,
    setPracticeStreakError,
  ] =
    useState("");


  const hasPracticeStreakAccess =
    hasPaidFeatureAccess(
      "practice_streak",
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
    if (!profile) {
      return;
    }

    const s =
      getSupabaseBrowserClient();

    void s
      .rpc(
        "get_current_usage",
      )
      .then(
        ({ data }) => {
          const r =
            Array.isArray(data)
              ? data[0]
              : data;

          if (r) {
            setUsage({
              used:
                Number(
                  r.characters_used ||
                    0,
                ),

              limit:
                Number(
                  r.character_limit ||
                    plan?.monthly_character_limit ||
                    20000,
                ),

              remaining:
                Math.max(
                  0,
                  Number(
                    r.character_limit ||
                      20000,
                  ) -
                    Number(
                      r.characters_used ||
                        0,
                    ),
                ),

              percentage:
                Number(
                  r.character_limit,
                )
                  ? (
                      Number(
                        r.characters_used ||
                          0,
                      ) /
                      Number(
                        r.character_limit,
                      )
                    ) *
                    100
                  : 0,

              plan:
                (
                  plan?.slug ||
                  "free"
                ) as any,
            });
          }
        },
      );

    void s
      .from(
        "translation_history",
      )
      .select(
        "id,source_text,translated_text,source_language,target_language,created_at",
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        },
      )
      .limit(5)
      .then(
        ({ data }) =>
          setHistory(
            data || [],
          ),
      );
  }, [
    plan,
    profile,
  ]);


  useEffect(() => {
    const accessToken =
      session?.access_token;

    if (
      !hasPracticeStreakAccess ||
      !accessToken
    ) {
      setPracticeStreak(
        null,
      );
      setPracticeTimezone("");
      setPracticeStreakLoading(
        false,
      );
      setPracticeStreakError("");

      return;
    }

    const controller =
      new AbortController();

    setPracticeStreakLoading(
      true,
    );
    setPracticeStreakError("");

    void loadPracticeStreak(
      accessToken,
      undefined,
      controller.signal,
    )
      .then(
        (result) => {
          if (
            controller.signal.aborted
          ) {
            return;
          }

          setPracticeStreak(
            result.streak,
          );
          setPracticeTimezone(
            result.timezone,
          );
        },
      )
      .catch(
        (cause) => {
          if (
            cause instanceof DOMException &&
            cause.name ===
              "AbortError"
          ) {
            return;
          }

          if (
            controller.signal.aborted
          ) {
            return;
          }

          setPracticeStreak(
            null,
          );
          setPracticeTimezone("");
          setPracticeStreakError(
            cause instanceof Error
              ? cause.message
              : "Practice Streak could not be loaded.",
          );
        },
      )
      .finally(() => {
        if (
          !controller.signal.aborted
        ) {
          setPracticeStreakLoading(
            false,
          );
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    hasPracticeStreakAccess,
    session?.access_token,
  ]);


  const currentStreakMessage =
    practiceStreak?.practicedToday
      ? "Today's practice is complete. Your streak is safe for today."
      : practiceStreak?.currentStreak
        ? "Practise today to keep your current streak going."
        : "Complete a Flashcard review to start your daily practice streak.";


  return (
    <ProtectedRoute>
      <DashboardShell
        title={`Welcome${
          profile?.display_name
            ? `, ${profile.display_name}`
            : ""
        }`}
        description="Your translation plan, practice progress, monthly usage and recent saved work."
      >
        <div className="stats-grid">
          <article className="stat-card">
            <span>
              Current plan
            </span>

            <strong>
              {plan?.name ||
                "Free"}
            </strong>

            <small>
              Source:{" "}
              {plan?.source ||
                "default"}
            </small>

            <Link href="/pricing">
              Compare plans
            </Link>
          </article>

          <article className="stat-card">
            <span>
              History
            </span>

            <strong>
              {profile?.history_enabled
                ? "Enabled"
                : "Disabled"}
            </strong>

            <Link href="/dashboard/settings">
              Change setting
            </Link>
          </article>

          <article className="stat-card">
            <span>
              Account role
            </span>

            <strong>
              {profile?.role.replace(
                "_",
                " ",
              )}
            </strong>
          </article>
        </div>


        <section
          className={`dashboard-card ${styles.streakCard}`}
        >
          <div className={styles.streakHeading}>
            <div>
              <h2>
                Practice streak
              </h2>

              <p>
                Keep your Western Armenian practice consistent with daily Flashcard reviews.
              </p>
            </div>

            {hasPracticeStreakAccess &&
            practiceStreak ? (
              <span
                className={`${styles.streakStatus} ${
                  practiceStreak.practicedToday
                    ? styles.streakStatusDone
                    : ""
                }`}
              >
                <span
                  className={styles.streakStatusDot}
                  aria-hidden="true"
                />

                {practiceStreak.practicedToday
                  ? "Practised today"
                  : "Practice due today"}
              </span>
            ) : null}
          </div>

          {!hasPracticeStreakAccess ? (
            <div className={styles.streakLocked}>
              <div>
                <strong>
                  Daily Practice Streak is a paid feature
                </strong>

                <p>
                  Person and Schools access can track daily Flashcard practice and streak progress.
                </p>
              </div>

              <Link href="/pricing">
                View plans
              </Link>
            </div>
          ) : practiceStreakLoading ? (
            <div className={styles.streakLoading}>
              Loading your practice streak...
            </div>
          ) : practiceStreakError ? (
            <div
              className={styles.streakError}
              role="alert"
            >
              <strong>
                Practice streak unavailable
              </strong>

              <p>
                {practiceStreakError}
              </p>
            </div>
          ) : practiceStreak ? (
            <>
              <div className={styles.streakOverview}>
                <div className={styles.currentStreak}>
                  <span>
                    Current streak
                  </span>

                  <div className={styles.currentStreakValue}>
                    <strong>
                      {practiceStreak.currentStreak.toLocaleString()}
                    </strong>

                    <span>
                      {dayLabel(
                        practiceStreak.currentStreak,
                      )}
                    </span>
                  </div>

                  <p>
                    {currentStreakMessage}
                  </p>

                  <Link href="/dashboard/flashcards">
                    {practiceStreak.practicedToday
                      ? "Continue practising"
                      : "Practice with Flashcards"}
                  </Link>
                </div>

                <div className={styles.streakMetrics}>
                  <div className={styles.streakMetric}>
                    <span>
                      Longest streak
                    </span>

                    <strong>
                      {practiceStreak.longestStreak.toLocaleString()}{" "}
                      {dayLabel(
                        practiceStreak.longestStreak,
                      )}
                    </strong>

                    <small>
                      Your best consecutive practice run.
                    </small>
                  </div>

                  <div className={styles.streakMetric}>
                    <span>
                      Today&apos;s practice
                    </span>

                    <strong>
                      {practiceStreak.practicedToday
                        ? "Done"
                        : "Not yet"}
                    </strong>

                    <small>
                      {practiceStreak.practicedToday
                        ? "At least one Flashcard review completed today."
                        : "Complete one Flashcard review today."}
                    </small>
                  </div>

                  <div className={styles.streakMetric}>
                    <span>
                      Reviews today
                    </span>

                    <strong>
                      {practiceStreak.todayReviewCount.toLocaleString()}
                    </strong>

                    <small>
                      {practiceStreak.todayReviewCount.toLocaleString()}{" "}
                      {reviewLabel(
                        practiceStreak.todayReviewCount,
                      )}{" "}
                      recorded today.
                    </small>
                  </div>
                </div>
              </div>

              <div className={styles.streakFooter}>
                <span>
                  Last practice:{" "}
                  {formatPracticeDate(
                    practiceStreak.lastPracticeDate,
                  )}
                </span>

                <span>
                  {practiceStreak.totalPracticeDays.toLocaleString()}{" "}
                  total practice{" "}
                  {dayLabel(
                    practiceStreak.totalPracticeDays,
                  )}
                  {practiceTimezone
                    ? ` · ${practiceTimezone}`
                    : ""}
                </span>
              </div>
            </>
          ) : null}
        </section>


        {usage && (
          <section className="dashboard-card">
            <h2>
              Monthly usage
            </h2>

            <UsageMeter
              usage={usage}
            />
          </section>
        )}


        <section className="dashboard-card">
          <div className="card-heading">
            <h2>
              Recent translations
            </h2>

            <Link href="/dashboard/history">
              View all
            </Link>
          </div>

          {history.length ? (
            <div className="history-list">
              {history.map(
                (h) => (
                  <article key={h.id}>
                    <div>
                      <strong>
                        {getLanguageLabel(
                          h.source_language,
                        )}{" "}
                        {"\u2192"}{" "}
                        {getLanguageLabel(
                          h.target_language,
                        )}
                      </strong>

                      <span>
                        {formatTranslationDate(
                          h.created_at,
                        )}
                      </span>
                    </div>

                    <p>
                      {h.source_text}
                    </p>

                    <p className="armenian-text">
                      {h.translated_text}
                    </p>
                  </article>
                ),
              )}
            </div>
          ) : (
            <div className="empty-state">
              No saved translations yet.
            </div>
          )}
        </section>
      </DashboardShell>
    </ProtectedRoute>
  );
}
