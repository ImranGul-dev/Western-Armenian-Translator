"use client";

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
  getSupabaseBrowserClient,
} from "@/lib/supabase/client";

import styles from "./analytics.module.css";


type AnalyticsDays = 7 | 30 | 60 | 90;

interface AnalyticsTotals {
  translation_requests: number;
  successful_translations: number;
  failed_translations: number;
  characters: number;
  estimated_cost_usd: number;
  active_users: number;
  new_users: number;
  widget_requests: number;
  system_errors: number;
  audit_events: number;
}

interface DailyRow {
  date: string;
  translation_requests: number;
  successful_translations: number;
  failed_translations: number;
  characters: number;
  estimated_cost_usd: number;
  widget_requests: number;
  widget_successful: number;
  widget_failed: number;
  new_users: number;
  system_errors: number;
  audit_events: number;
}

interface DirectionRow {
  source_language: string;
  target_language: string;
  requests: number;
}

interface PlanRow {
  plan: string;
  requests: number;
  characters: number;
}

interface ErrorRow {
  id: string;
  error_code: string | null;
  safe_message: string;
  function_name: string | null;
  created_at: string;
}

interface AnalyticsPayload {
  days: AnalyticsDays;
  generated_at: string;
  totals: AnalyticsTotals;
  daily: DailyRow[];
  directions: DirectionRow[];
  plans: PlanRow[];
  recent_errors: ErrorRow[];
}

interface AuditRow {
  id: string;
  admin_user_id: string | null;
  admin_email: string | null;
  admin_display_name: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  safe_details: Record<string, unknown>;
  created_at: string;
}

const EMPTY_TOTALS: AnalyticsTotals = {
  translation_requests: 0,
  successful_translations: 0,
  failed_translations: 0,
  characters: 0,
  estimated_cost_usd: 0,
  active_users: 0,
  new_users: 0,
  widget_requests: 0,
  system_errors: 0,
  audit_events: 0,
};

const AUDIT_PAGE_SIZE = 50;

function number(value: unknown): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function formatAction(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function formatTarget(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function languageLabel(code: string) {
  if (code === "en") return "English";
  if (code === "hyw") return "Western Armenian";
  if (code === "hye") return "Eastern Armenian";
  return code || "Unknown";
}

function successRate(totals: AnalyticsTotals) {
  if (!totals.translation_requests) {
    return 0;
  }

  return (
    totals.successful_translations /
    totals.translation_requests
  ) * 100;
}

export default function AdminAnalyticsPage() {
  const [days, setDays] =
    useState<AnalyticsDays>(30);

  const [analytics, setAnalytics] =
    useState<AnalyticsPayload | null>(null);

  const [auditRows, setAuditRows] =
    useState<AuditRow[]>([]);

  const [auditOffset, setAuditOffset] =
    useState(0);

  const [auditAction, setAuditAction] =
    useState("");

  const [auditTarget, setAuditTarget] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [message, setMessage] =
    useState("");

  const loadAnalytics = useCallback(
    async () => {
      const { data, error } =
        await getSupabaseBrowserClient()
          .rpc(
            "admin_operations_analytics",
            {
              p_days: days,
            },
          );

      if (error) {
        throw new Error(error.message);
      }

      const payload =
        (data ?? {}) as Partial<AnalyticsPayload>;

      setAnalytics({
        days,
        generated_at:
          payload.generated_at ??
          new Date().toISOString(),
        totals: {
          ...EMPTY_TOTALS,
          ...(payload.totals ?? {}),
        },
        daily:
          payload.daily ?? [],
        directions:
          payload.directions ?? [],
        plans:
          payload.plans ?? [],
        recent_errors:
          payload.recent_errors ?? [],
      });
    },
    [days],
  );

  const loadAudit = useCallback(
    async () => {
      const { data, error } =
        await getSupabaseBrowserClient()
          .rpc(
            "admin_audit_feed",
            {
              p_limit:
                AUDIT_PAGE_SIZE,
              p_offset:
                auditOffset,
              p_action:
                auditAction.trim() || null,
              p_target_type:
                auditTarget.trim() || null,
            },
          );

      if (error) {
        throw new Error(error.message);
      }

      setAuditRows(
        (data ?? []) as AuditRow[],
      );
    },
    [
      auditAction,
      auditOffset,
      auditTarget,
    ],
  );

  const loadAll = useCallback(
    async () => {
      setLoading(true);
      setMessage("");

      try {
        await Promise.all([
          loadAnalytics(),
          loadAudit(),
        ]);
      } catch (cause) {
        setMessage(
          cause instanceof Error
            ? cause.message
            : "Admin analytics could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    },
    [loadAnalytics, loadAudit],
  );

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const totals =
    analytics?.totals ??
    EMPTY_TOTALS;

  const rate =
    successRate(totals);

  const maxRequests =
    useMemo(
      () =>
        Math.max(
          1,
          ...(
            analytics?.daily ??
            []
          ).map(
            (row) =>
              number(
                row.translation_requests,
              ),
          ),
        ),
      [analytics?.daily],
    );

  const actionOptions =
    useMemo(
      () =>
        Array.from(
          new Set(
            auditRows.map(
              (row) => row.action,
            ),
          ),
        ).sort(),
      [auditRows],
    );

  const targetOptions =
    useMemo(
      () =>
        Array.from(
          new Set(
            auditRows.map(
              (row) => row.target_type,
            ),
          ),
        ).sort(),
      [auditRows],
    );

  function applyAuditFilters() {
    if (auditOffset !== 0) {
      setAuditOffset(0);
      return;
    }

    void loadAudit();
  }

  return (
    <ProtectedRoute roles={["admin"]}>
      <DashboardShell
        admin
        title="Analytics & audit logs"
        description="Monitor platform activity, operational health and administrator changes without exposing translation text."
      >
        <div className={styles.pageStack}>
          <section className="dashboard-card">
            <div className={styles.toolbar}>
              <div className={styles.toolbarCopy}>
                <strong>
                  Operational analytics
                </strong>
                <span>
                  Privacy-safe metadata only. Translation source and output text are not included in these analytics.
                </span>
              </div>

              <div className={styles.toolbarActions}>
                <select
                  className={styles.select}
                  aria-label="Analytics date range"
                  value={days}
                  onChange={(event) =>
                    setDays(
                      Number(
                        event.target.value,
                      ) as AnalyticsDays,
                    )
                  }
                >
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={60}>Last 60 days</option>
                  <option value={90}>Last 90 days</option>
                </select>

                <button
                  type="button"
                  className={styles.refreshButton}
                  disabled={loading}
                  onClick={() => void loadAll()}
                >
                  {loading
                    ? "Refreshing..."
                    : "Refresh"}
                </button>
              </div>
            </div>
          </section>

          {message ? (
            <div
              className={styles.message}
              role="alert"
            >
              {message}
            </div>
          ) : null}

          <div className={styles.statsGrid}>
            <article className={styles.statCard}>
              <span>Translation requests</span>
              <strong>
                {number(
                  totals.translation_requests,
                ).toLocaleString()}
              </strong>
              <small>
                Selected period
              </small>
            </article>

            <article className={styles.statCard}>
              <span>Success rate</span>
              <strong
                className={
                  rate >= 95
                    ? styles.good
                    : rate < 85 && totals.translation_requests
                      ? styles.warning
                      : undefined
                }
              >
                {rate.toFixed(1)}%
              </strong>
              <small>
                {number(
                  totals.failed_translations,
                ).toLocaleString()} failed requests
              </small>
            </article>

            <article className={styles.statCard}>
              <span>Characters processed</span>
              <strong>
                {number(
                  totals.characters,
                ).toLocaleString()}
              </strong>
              <small>
                Translation usage
              </small>
            </article>

            <article className={styles.statCard}>
              <span>Estimated AI cost</span>
              <strong>
                ${number(
                  totals.estimated_cost_usd,
                ).toFixed(2)}
              </strong>
              <small>
                Operational estimate
              </small>
            </article>

            <article className={styles.statCard}>
              <span>Active users</span>
              <strong>
                {number(
                  totals.active_users,
                ).toLocaleString()}
              </strong>
              <small>
                Active within selected period
              </small>
            </article>

            <article className={styles.statCard}>
              <span>New users</span>
              <strong>
                {number(
                  totals.new_users,
                ).toLocaleString()}
              </strong>
              <small>
                Registered in selected period
              </small>
            </article>

            <article className={styles.statCard}>
              <span>Widget requests</span>
              <strong>
                {number(
                  totals.widget_requests,
                ).toLocaleString()}
              </strong>
              <small>
                Embedded translator activity
              </small>
            </article>

            <article className={styles.statCard}>
              <span>System errors</span>
              <strong
                className={
                  totals.system_errors > 0
                    ? styles.warning
                    : styles.good
                }
              >
                {number(
                  totals.system_errors,
                ).toLocaleString()}
              </strong>
              <small>
                Safe logged errors
              </small>
            </article>
          </div>

          <div className={styles.gridTwo}>
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2>Translation activity</h2>
                  <p>
                    Daily request volume across the selected period.
                  </p>
                </div>
              </div>

              {analytics?.daily.length ? (
                <div className={styles.cardBody}>
                  <div className={styles.trendWrap}>
                    <div
                      className={styles.trend}
                      aria-label="Daily translation request trend"
                    >
                      {analytics.daily.map(
                        (row) => {
                          const requests =
                            number(
                              row.translation_requests,
                            );

                          const height =
                            Math.max(
                              3,
                              Math.round(
                                (requests /
                                  maxRequests) *
                                  145,
                              ),
                            );

                          return (
                            <div
                              className={styles.trendDay}
                              key={row.date}
                              title={`${row.date}: ${requests.toLocaleString()} requests`}
                            >
                              <span
                                className={styles.trendValue}
                              >
                                {requests}
                              </span>

                              <span
                                className={styles.trendBar}
                                style={{
                                  height: `${height}px`,
                                }}
                              />

                              <span
                                className={styles.trendLabel}
                              >
                                {new Date(
                                  `${row.date}T00:00:00`,
                                ).toLocaleDateString(
                                  undefined,
                                  {
                                    month: "short",
                                    day: "numeric",
                                  },
                                )}
                              </span>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className={styles.empty}>
                  No translation activity is available for this period.
                </div>
              )}
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2>Top language directions</h2>
                  <p>
                    Most-used translation pairs.
                  </p>
                </div>
              </div>

              <div className={styles.cardBody}>
                {analytics?.directions.length ? (
                  <div className={styles.splitList}>
                    {analytics.directions.map(
                      (row) => (
                        <div
                          className={styles.splitRow}
                          key={`${row.source_language}-${row.target_language}`}
                        >
                          <div>
                            <strong>
                              {languageLabel(
                                row.source_language,
                              )} → {languageLabel(
                                row.target_language,
                              )}
                            </strong>
                            <span>
                              Translation direction
                            </span>
                          </div>

                          <span className={styles.splitValue}>
                            {number(
                              row.requests,
                            ).toLocaleString()}
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <div className={styles.empty}>
                    No direction data yet.
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className={styles.gridTwo}>
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2>Usage by plan</h2>
                  <p>
                    Translation volume grouped by recorded plan.
                  </p>
                </div>
              </div>

              <div className={styles.cardBody}>
                {analytics?.plans.length ? (
                  <div className={styles.splitList}>
                    {analytics.plans.map(
                      (row) => (
                        <div
                          className={styles.splitRow}
                          key={row.plan}
                        >
                          <div>
                            <strong>
                              {row.plan === "premium"
                                ? "Person"
                                : row.plan === "business"
                                  ? "Schools"
                                  : row.plan === "free"
                                    ? "Free"
                                    : row.plan}
                            </strong>
                            <span>
                              {number(
                                row.characters,
                              ).toLocaleString()} characters
                            </span>
                          </div>

                          <span className={styles.splitValue}>
                            {number(
                              row.requests,
                            ).toLocaleString()} requests
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <div className={styles.empty}>
                    No plan usage data yet.
                  </div>
                )}
              </div>
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2>Administration activity</h2>
                  <p>
                    Audit events captured in this period.
                  </p>
                </div>
              </div>

              <div className={styles.cardBody}>
                <div className={styles.splitList}>
                  <div className={styles.splitRow}>
                    <div>
                      <strong>Audit events</strong>
                      <span>Admin/editor changes recorded</span>
                    </div>
                    <span className={styles.splitValue}>
                      {number(
                        totals.audit_events,
                      ).toLocaleString()}
                    </span>
                  </div>

                  <div className={styles.splitRow}>
                    <div>
                      <strong>System errors</strong>
                      <span>Safe operational error records</span>
                    </div>
                    <span className={styles.splitValue}>
                      {number(
                        totals.system_errors,
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h2>Recent system errors</h2>
                <p>
                  Safe operational messages only. Translation text is not included.
                </p>
              </div>
            </div>

            {analytics?.recent_errors.length ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Function</th>
                      <th>Error code</th>
                      <th>Safe message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.recent_errors.map(
                      (row) => (
                        <tr key={row.id}>
                          <td>
                            {new Date(
                              row.created_at,
                            ).toLocaleString()}
                          </td>
                          <td>
                            {row.function_name || "—"}
                          </td>
                          <td>
                            <span className={styles.errorCode}>
                              {row.error_code || "—"}
                            </span>
                          </td>
                          <td>{row.safe_message}</td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.empty}>
                No system errors were logged in this period.
              </div>
            )}
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h2>Admin audit log</h2>
                <p>
                  Review who changed administrative or language-management records and when.
                </p>
              </div>

              <div className={styles.auditToolbar}>
                <div className={styles.field}>
                  <label htmlFor="audit-action">
                    Action
                  </label>
                  <input
                    id="audit-action"
                    className={styles.input}
                    list="audit-actions"
                    placeholder="All actions"
                    value={auditAction}
                    onChange={(event) =>
                      setAuditAction(
                        event.target.value,
                      )
                    }
                  />
                  <datalist id="audit-actions">
                    {actionOptions.map(
                      (item) => (
                        <option
                          key={item}
                          value={item}
                        />
                      ),
                    )}
                  </datalist>
                </div>

                <div className={styles.field}>
                  <label htmlFor="audit-target">
                    Target type
                  </label>
                  <input
                    id="audit-target"
                    className={styles.input}
                    list="audit-targets"
                    placeholder="All targets"
                    value={auditTarget}
                    onChange={(event) =>
                      setAuditTarget(
                        event.target.value,
                      )
                    }
                  />
                  <datalist id="audit-targets">
                    {targetOptions.map(
                      (item) => (
                        <option
                          key={item}
                          value={item}
                        />
                      ),
                    )}
                  </datalist>
                </div>

                <button
                  type="button"
                  className={styles.refreshButton}
                  disabled={loading}
                  onClick={applyAuditFilters}
                >
                  Apply filters
                </button>
              </div>
            </div>

            {auditRows.length ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Target</th>
                      <th>Safe details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditRows.map(
                      (row) => (
                        <tr key={row.id}>
                          <td>
                            {new Date(
                              row.created_at,
                            ).toLocaleString()}
                          </td>
                          <td>
                            <strong>
                              {row.admin_display_name ||
                                row.admin_email ||
                                "System / unknown"}
                            </strong>
                            {row.admin_display_name &&
                            row.admin_email ? (
                              <div>{row.admin_email}</div>
                            ) : null}
                          </td>
                          <td>
                            <span className={styles.pill}>
                              {formatAction(row.action)}
                            </span>
                          </td>
                          <td>
                            <strong>
                              {formatTarget(
                                row.target_type,
                              )}
                            </strong>
                            {row.target_id ? (
                              <div>
                                {row.target_id.length > 24
                                  ? `${row.target_id.slice(0, 24)}…`
                                  : row.target_id}
                              </div>
                            ) : null}
                          </td>
                          <td>
                            <div className={styles.auditDetails}>
                              <code>
                                {Object.keys(
                                  row.safe_details ?? {},
                                ).length
                                  ? JSON.stringify(
                                      row.safe_details,
                                      null,
                                      2,
                                    )
                                  : "No extra details"}
                              </code>
                            </div>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.empty}>
                No audit entries match these filters.
              </div>
            )}

            <div className={styles.pagination}>
              <button
                type="button"
                className={styles.pageButton}
                disabled={
                  loading ||
                  auditOffset === 0
                }
                onClick={() =>
                  setAuditOffset(
                    Math.max(
                      0,
                      auditOffset -
                        AUDIT_PAGE_SIZE,
                    ),
                  )
                }
              >
                Previous
              </button>

              <span>
                Showing {auditOffset + 1}–{auditOffset + auditRows.length}
              </span>

              <button
                type="button"
                className={styles.pageButton}
                disabled={
                  loading ||
                  auditRows.length <
                    AUDIT_PAGE_SIZE
                }
                onClick={() =>
                  setAuditOffset(
                    auditOffset +
                      AUDIT_PAGE_SIZE,
                  )
                }
              >
                Next
              </button>
            </div>
          </section>
        </div>
      </DashboardShell>
    </ProtectedRoute>
  );
}
