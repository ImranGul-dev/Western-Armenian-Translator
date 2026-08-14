"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { DashboardShell } from "@/components/DashboardShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function value(
  stats: Record<string, unknown>,
  key: string,
): string {
  const item = stats[key];

  return typeof item === "number"
    ? item.toLocaleString()
    : String(item ?? "0");
}

export default function AdminOverviewPage() {
  const [
    stats,
    setStats,
  ] = useState<Record<string, unknown>>({});

  const [
    commercial,
    setCommercial,
  ] = useState<Record<string, unknown>>({});

  const [
    message,
    setMessage,
  ] = useState("");

  useEffect(() => {
    const supabase =
      getSupabaseBrowserClient();

    void Promise.all([
      supabase.rpc(
        "admin_dashboard_stats",
      ),
      supabase.rpc(
        "admin_commercial_stats",
      ),
    ]).then(
      ([base, billing]) => {
        if (
          base.error ||
          billing.error
        ) {
          setMessage(
            base.error?.message ||
              billing.error?.message ||
              "Could not load statistics.",
          );
        }

        if (base.data) {
          setStats(
            base.data as Record<
              string,
              unknown
            >,
          );
        }

        if (billing.data) {
          setCommercial(
            billing.data as Record<
              string,
              unknown
            >,
          );
        }
      },
    );
  }, []);

  return (
    <ProtectedRoute
      roles={["admin"]}
    >
      <DashboardShell
        admin
        title="Admin dashboard"
        description="Live information about users, translations, language quality and subscriptions."
      >
        {message && (
          <div className="info-banner">
            {message}
          </div>
        )}

        <div className="stats-grid">
          <article className="stat-card">
            <span>
              Registered users
            </span>

            <strong>
              {value(
                commercial,
                "registered_users",
              )}
            </strong>

            <Link href="/admin/users">
              View users
            </Link>
          </article>

          <article className="stat-card">
            <span>
              Guest users today
            </span>

            <strong>
              {value(
                stats,
                "guest_users_today",
              )}
            </strong>

            <span>
              Not logged in
            </span>
          </article>

          <article className="stat-card">
            <span>
              Active subscribers
            </span>

            <strong>
              {value(
                commercial,
                "active_subscribers",
              )}
            </strong>

            <Link href="/admin/subscriptions">
              View subscriptions
            </Link>
          </article>

          <article className="stat-card">
            <span>
              Past-due subscriptions
            </span>

            <strong>
              {value(
                commercial,
                "past_due_subscribers",
              )}
            </strong>

            <Link href="/admin/subscriptions">
              Review
            </Link>
          </article>

          <article className="stat-card">
            <span>
              Payments this month
            </span>

            <strong>
              {value(
                commercial,
                "payments_month",
              )}
            </strong>

            <Link href="/admin/payments">
              View payments
            </Link>
          </article>

          <article className="stat-card">
            <span>
              Translations today
            </span>

            <strong>
              {value(
                stats,
                "translations_today",
              )}
            </strong>
          </article>

          <article className="stat-card">
            <span>
              Translations this month
            </span>

            <strong>
              {value(
                stats,
                "translations_month",
              )}
            </strong>
          </article>

          <article className="stat-card">
            <span>
              Characters this month
            </span>

            <strong>
              {value(
                stats,
                "characters_month",
              )}
            </strong>
          </article>

          <article className="stat-card">
            <span>
              Failed translation requests
            </span>

            <strong>
              {value(
                stats,
                "failed_requests",
              )}
            </strong>
          </article>

          <article className="stat-card">
            <span>
              Pending corrections
            </span>

            <strong>
              {value(
                stats,
                "pending_corrections",
              )}
            </strong>

            <Link href="/admin/corrections">
              Review
            </Link>
          </article>

          <article className="stat-card">
            <span>
              Pending glossary approvals
            </span>

            <strong>
              {value(
                stats,
                "pending_glossary",
              )}
            </strong>

            <Link href="/admin/glossary">
              Review
            </Link>
          </article>

          <article className="stat-card">
            <span>Translations available for review</span>

            <strong>
              {value(
                commercial,
                "reviewable_queries",
              )}
            </strong>

            <Link href="/admin/queries">
              Review translations
            </Link>
          </article>

          <article className="stat-card">
            <span>
              Estimated AI cost
            </span>

            <strong>
              $
              {Number(
                stats.estimated_cost_usd ||
                  0,
              ).toFixed(2)}
            </strong>
          </article>
        </div>
      </DashboardShell>
    </ProtectedRoute>
  );
}