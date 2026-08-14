"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DashboardShell } from "@/components/DashboardShell";
import { UsageMeter } from "@/components/UsageMeter";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { UsageSummary } from "@/types/database";

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  english: "English",

  hyw: "Western Armenian",
  "western-armenian": "Western Armenian",
  western_armenian: "Western Armenian",
  "western armenian": "Western Armenian",

  hye: "Eastern Armenian",
  hy: "Eastern Armenian",
  "eastern-armenian": "Eastern Armenian",
  eastern_armenian: "Eastern Armenian",
  "eastern armenian": "Eastern Armenian",
};

function getLanguageLabel(language: string | null | undefined) {
  if (!language) {
    return "Unknown";
  }

  const normalizedLanguage = language.trim().toLowerCase();

  return LANGUAGE_LABELS[normalizedLanguage] || language;
}

function formatTranslationDate(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const day = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
  }).format(date);

  const month = new Intl.DateTimeFormat("en-AU", {
    month: "long",
  }).format(date);

  const year = new Intl.DateTimeFormat("en-AU", {
    year: "numeric",
  }).format(date);

  return `${day} ${month}, ${year}`;
}

export default function Dashboard() {
  const { profile, plan } = useAuth();
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!profile) return;

    const s = getSupabaseBrowserClient();

    void s.rpc("get_current_usage").then(({ data }) => {
      const r = Array.isArray(data) ? data[0] : data;

      if (r) {
        setUsage({
          used: Number(r.characters_used || 0),
          limit: Number(
            r.character_limit || plan?.monthly_character_limit || 20000,
          ),
          remaining: Math.max(
            0,
            Number(r.character_limit || 20000) -
              Number(r.characters_used || 0),
          ),
          percentage: Number(r.character_limit)
            ? (Number(r.characters_used || 0) /
                Number(r.character_limit)) *
              100
            : 0,
          plan: (plan?.slug || "free") as any,
        });
      }
    });

    void s
      .from("translation_history")
      .select(
        "id,source_text,translated_text,source_language,target_language,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => setHistory(data || []));
  }, [plan, profile]);

  return (
    <ProtectedRoute>
      <DashboardShell
        title={`Welcome${profile?.display_name ? `, ${profile.display_name}` : ""}`}
        description="Your translation plan, monthly usage and recent saved work."
      >
        <div className="stats-grid">
          <article className="stat-card">
            <span>Current plan</span>
            <strong>{plan?.name || "Free"}</strong>
            <small>Source: {plan?.source || "default"}</small>
            <Link href="/pricing">Compare plans</Link>
          </article>

          <article className="stat-card">
            <span>History</span>
            <strong>{profile?.history_enabled ? "Enabled" : "Disabled"}</strong>
            <Link href="/dashboard/settings">Change setting</Link>
          </article>

          <article className="stat-card">
            <span>Account role</span>
            <strong>{profile?.role.replace("_", " ")}</strong>
          </article>
        </div>

        {usage && (
          <section className="dashboard-card">
            <h2>Monthly usage</h2>
            <UsageMeter usage={usage} />
          </section>
        )}

        <section className="dashboard-card">
          <div className="card-heading">
            <h2>Recent translations</h2>
            <Link href="/dashboard/history">View all</Link>
          </div>

          {history.length ? (
            <div className="history-list">
              {history.map((h) => (
                <article key={h.id}>
                  <div>
                    <strong>
                      {getLanguageLabel(h.source_language)} →{" "}
                      {getLanguageLabel(h.target_language)}
                    </strong>

                    <span>{formatTranslationDate(h.created_at)}</span>
                  </div>

                  <p>{h.source_text}</p>
                  <p className="armenian-text">{h.translated_text}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">No saved translations yet.</div>
          )}
        </section>
      </DashboardShell>
    </ProtectedRoute>
  );
}
