"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
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
  hasPaidFeatureAccess,
} from "@/lib/paid-feature-access";
import {
  loadPracticeAnalytics,
  type PracticeAnalytics,
  type PracticeAnalyticsPeriod,
} from "@/lib/practice-analytics-api";
import {
  getBrowserTimeZone,
} from "@/lib/practice-streak-api";

import styles from "./practice-analytics.module.css";


const PERIODS: ReadonlyArray<{
  value: PracticeAnalyticsPeriod;
  label: string;
}> = [
  {
    value: 7,
    label: "7 days",
  },
  {
    value: 30,
    label: "30 days",
  },
  {
    value: 90,
    label: "90 days",
  },
];


const RATING_ROWS = [
  {
    key: "again",
    label: "Again",
    className: styles.ratingAgain,
  },
  {
    key: "hard",
    label: "Hard",
    className: styles.ratingHard,
  },
  {
    key: "good",
    label: "Good",
    className: styles.ratingGood,
  },
  {
    key: "easy",
    label: "Easy",
    className: styles.ratingEasy,
  },
] as const;


function formatPracticeDate(
  value: string,
): string {
  const parts =
    value
      .split("-")
      .map(Number);

  if (
    parts.length !== 3 ||
    parts.some(
      (part) =>
        !Number.isFinite(part),
    )
  ) {
    return value;
  }

  const [
    year,
    month,
    day,
  ] = parts;

  const date =
    new Date(
      year,
      month - 1,
      day,
    );

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle: "medium",
    },
  ).format(date);
}


function compactDate(
  value: string,
): string {
  const parts =
    value
      .split("-")
      .map(Number);

  if (
    parts.length !== 3 ||
    parts.some(
      (part) =>
        !Number.isFinite(part),
    )
  ) {
    return value;
  }

  const [
    year,
    month,
    day,
  ] = parts;

  return new Intl.DateTimeFormat(
    undefined,
    {
      month: "short",
      day: "numeric",
    },
  ).format(
    new Date(
      year,
      month - 1,
      day,
    ),
  );
}


function metricNumber(
  value: number,
): string {
  return new Intl.NumberFormat().format(
    value,
  );
}


function masteryChangeLabel(
  value: number,
): string {
  const rounded =
    Math.round(
      value * 100,
    ) / 100;

  if (rounded > 0) {
    return `+${rounded}`;
  }

  return String(rounded);
}


export default function PracticeAnalyticsPage() {
  const {
    session,
    user,
    profile,
    plan,
    loading: authLoading,
  } = useAuth();

  const [
    period,
    setPeriod,
  ] =
    useState<PracticeAnalyticsPeriod>(
      30,
    );

  const [
    analytics,
    setAnalytics,
  ] =
    useState<PracticeAnalytics | null>(
      null,
    );

  const [
    timezone,
    setTimezone,
  ] =
    useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const hasAccess =
    hasPaidFeatureAccess(
      "practice_analytics",
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
          !hasAccess ||
          !accessToken
        ) {
          setAnalytics(null);
          setTimezone("");
          setError("");
          return;
        }

        setLoading(true);
        setError("");

        try {
          const result =
            await loadPracticeAnalytics(
              accessToken,
              period,
              getBrowserTimeZone(),
              signal,
            );

          setAnalytics(
            result.analytics,
          );
          setTimezone(
            result.timezone,
          );
        } catch (cause) {
          if (
            cause instanceof DOMException &&
            cause.name === "AbortError"
          ) {
            return;
          }

          setAnalytics(null);
          setError(
            cause instanceof Error
              ? cause.message
              : "Practice Analytics could not be loaded.",
          );
        } finally {
          if (!signal?.aborted) {
            setLoading(false);
          }
        }
      },
      [
        hasAccess,
        period,
        session?.access_token,
      ],
    );


  useEffect(() => {
    if (
      authLoading ||
      !hasAccess ||
      !session?.access_token
    ) {
      return;
    }

    const controller =
      new AbortController();

    void load(
      controller.signal,
    );

    return () => {
      controller.abort();
    };
  }, [
    authLoading,
    hasAccess,
    load,
    session?.access_token,
  ]);


  const maxReviews =
    useMemo(
      () =>
        Math.max(
          0,
          ...(
            analytics?.dailyActivity.map(
              (item) =>
                item.reviews,
            ) ??
            []
          ),
        ),
      [analytics],
    );

  const totalRatings =
    analytics
      ? analytics.ratings.again +
        analytics.ratings.hard +
        analytics.ratings.good +
        analytics.ratings.easy
      : 0;

  const hasActivity =
    Boolean(
      analytics &&
      analytics.totalReviews > 0,
    );

  const masteryChangeClass =
    analytics?.averageMasteryChange &&
    analytics.averageMasteryChange < 0
      ? styles.negative
      : analytics?.averageMasteryChange &&
          analytics.averageMasteryChange > 0
        ? styles.positive
        : "";


  return (
    <ProtectedRoute>
      <DashboardShell
        title="Practice Analytics"
        description="See how consistently you practise, how your Flashcard ratings are distributed and how your mastery changes over time."
      >
        {authLoading ? (
          <div className={styles.stateCard}>
            Loading Practice Analytics...
          </div>
        ) : !hasAccess ? (
          <div
            className={`${styles.stateCard} ${styles.lockedCard}`}
          >
            <strong>
              Practice Analytics is a paid feature
            </strong>
            <p>
              Person and Schools access can track review activity, practice sessions, recall rate and mastery progress.
            </p>
            <Link href="/pricing">
              View plans
            </Link>
          </div>
        ) : (
          <div className={styles.page}>
            <section className={styles.toolbar}>
              <div
                className={styles.periodControl}
                aria-label="Analytics period"
              >
                {PERIODS.map(
                  (option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`${styles.periodButton} ${
                        period === option.value
                          ? styles.periodButtonActive
                          : ""
                      }`}
                      aria-pressed={
                        period === option.value
                      }
                      onClick={() => {
                        setPeriod(
                          option.value,
                        );
                      }}
                    >
                      {option.label}
                    </button>
                  ),
                )}
              </div>

              {analytics ? (
                <div className={styles.periodMeta}>
                  <strong>
                    {formatPracticeDate(
                      analytics.periodStartDate,
                    )}
                    {" – "}
                    {formatPracticeDate(
                      analytics.periodEndDate,
                    )}
                  </strong>
                  <span>
                    {timezone || "UTC"}
                  </span>
                </div>
              ) : null}
            </section>

            {loading && !analytics ? (
              <div className={styles.stateCard}>
                Loading your practice data...
              </div>
            ) : error ? (
              <div
                className={`${styles.stateCard} ${styles.errorCard}`}
              >
                <strong>
                  Practice Analytics is unavailable
                </strong>
                <p>{error}</p>
                <button
                  type="button"
                  className={styles.retryButton}
                  onClick={() => {
                    void load();
                  }}
                >
                  Try again
                </button>
              </div>
            ) : analytics ? (
              <>
                <section
                  className={styles.metricsGrid}
                  aria-label="Practice summary"
                >
                  <article className={styles.metricCard}>
                    <span className={styles.metricLabel}>
                      Reviews
                    </span>
                    <strong className={styles.metricValue}>
                      {metricNumber(
                        analytics.totalReviews,
                      )}
                    </strong>
                    <span className={styles.metricHint}>
                      Flashcards rated in this period
                    </span>
                  </article>

                  <article className={styles.metricCard}>
                    <span className={styles.metricLabel}>
                      Practice days
                    </span>
                    <strong className={styles.metricValue}>
                      {metricNumber(
                        analytics.practiceDays,
                      )}
                    </strong>
                    <span className={styles.metricHint}>
                      Unique local calendar days
                    </span>
                  </article>

                  <article className={styles.metricCard}>
                    <span className={styles.metricLabel}>
                      Sessions
                    </span>
                    <strong className={styles.metricValue}>
                      {metricNumber(
                        analytics.practiceSessions,
                      )}
                    </strong>
                    <span className={styles.metricHint}>
                      Separate Flashcard study runs
                    </span>
                  </article>

                  <article className={styles.metricCard}>
                    <span className={styles.metricLabel}>
                      Recall rate
                    </span>
                    <strong className={styles.metricValue}>
                      {analytics.recallRate.toFixed(1)}%
                    </strong>
                    <span className={styles.metricHint}>
                      Hard, Good or Easy ratings
                    </span>
                  </article>

                  <article className={styles.metricCard}>
                    <span className={styles.metricLabel}>
                      Avg. mastery change
                    </span>
                    <strong
                      className={`${styles.metricValue} ${masteryChangeClass}`}
                    >
                      {masteryChangeLabel(
                        analytics.averageMasteryChange,
                      )}
                    </strong>
                    <span className={styles.metricHint}>
                      Average score change per review
                    </span>
                  </article>
                </section>

                <section className={styles.analyticsGrid}>
                  <article className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div>
                        <h2>Daily activity</h2>
                        <p>
                          Flashcard reviews by local calendar day.
                        </p>
                      </div>
                      <span className={styles.cardBadge}>
                        Last {analytics.periodDays} days
                      </span>
                    </div>

                    {hasActivity ? (
                      <>
                        <div className={styles.activityViewport}>
                          <div
                            className={styles.activityChart}
                            role="img"
                            aria-label={`Daily Flashcard review activity for the last ${analytics.periodDays} days`}
                          >
                            {analytics.dailyActivity.map(
                              (item) => {
                                const height =
                                  item.reviews > 0 &&
                                  maxReviews > 0
                                    ? Math.max(
                                        7,
                                        Math.round(
                                          (
                                            item.reviews /
                                            maxReviews
                                          ) * 100,
                                        ),
                                      )
                                    : 2;

                                return (
                                  <div
                                    key={item.date}
                                    className={styles.activityBarWrap}
                                    title={`${formatPracticeDate(
                                      item.date,
                                    )}: ${item.reviews} review${
                                      item.reviews === 1
                                        ? ""
                                        : "s"
                                    }`}
                                  >
                                    <div
                                      className={`${styles.activityBar} ${
                                        item.reviews === 0
                                          ? styles.activityBarZero
                                          : ""
                                      }`}
                                      style={{
                                        height: `${height}%`,
                                      }}
                                    />
                                  </div>
                                );
                              },
                            )}
                          </div>
                        </div>

                        <div className={styles.chartFooter}>
                          <span>
                            {compactDate(
                              analytics.periodStartDate,
                            )}
                          </span>
                          <span>
                            {compactDate(
                              analytics.periodEndDate,
                            )}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className={styles.emptyState}>
                        <strong>
                          No practice activity yet
                        </strong>
                        <p>
                          Complete a Flashcard review to start building your analytics. Each Again, Hard, Good or Easy rating is recorded as practice.
                        </p>
                        <Link
                          href="/dashboard/flashcards"
                          className={styles.practiceLink}
                        >
                          Practice with Flashcards
                        </Link>
                      </div>
                    )}
                  </article>

                  <article className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div>
                        <h2>Rating breakdown</h2>
                        <p>
                          How you rated your recall after revealing each card.
                        </p>
                      </div>
                    </div>

                    <div className={styles.ratingList}>
                      {RATING_ROWS.map(
                        (row) => {
                          const count =
                            analytics.ratings[
                              row.key
                            ];

                          const percentage =
                            totalRatings > 0
                              ? Math.round(
                                  (
                                    count /
                                    totalRatings
                                  ) * 100,
                                )
                              : 0;

                          return (
                            <div
                              key={row.key}
                              className={styles.ratingRow}
                            >
                              <div className={styles.ratingMeta}>
                                <strong>{row.label}</strong>
                                <span>
                                  {metricNumber(count)} · {percentage}%
                                </span>
                              </div>
                              <div className={styles.ratingTrack}>
                                <div
                                  className={`${styles.ratingFill} ${row.className}`}
                                  style={{
                                    width: `${percentage}%`,
                                  }}
                                />
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>

                    <p className={styles.ratingNote}>
                      Recall rate treats Hard, Good and Easy as successful recall. Again means the card was not remembered and lowers the rate.
                    </p>
                  </article>
                </section>
              </>
            ) : null}
          </div>
        )}
      </DashboardShell>
    </ProtectedRoute>
  );
}
