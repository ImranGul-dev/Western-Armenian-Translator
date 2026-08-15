"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SettingsPage() {
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [history, setHistory] = useState(true);
  const [queryReviewConsent, setQueryReviewConsent] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setName(profile?.display_name || "");
    setCountryCode(profile?.country_code || "");
    setHistory(profile?.history_enabled ?? true);
    setQueryReviewConsent(profile?.query_review_consent ?? false);
  }, [profile]);

  async function save(event: React.FormEvent) {
    event.preventDefault();

    if (!profile?.id) return;

    const supabase = getSupabaseBrowserClient();
    const allowAdminReview = history && queryReviewConsent;

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: name,
        country_code: countryCode || null,
        history_enabled: history,
        query_review_consent: allowAdminReview,
      })
      .eq("id", profile.id);

    if (!error && !allowAdminReview) {
      const { error: historyError } = await supabase
        .from("translation_history")
        .update({ admin_visible: false })
        .eq("user_id", profile.id);

      if (historyError) {
        setMessage(historyError.message);
        return;
      }
    }

    setMessage(error ? error.message : "Settings saved.");

    if (!error) {
      await refreshProfile();
    }
  }

  return (
    <ProtectedRoute>
      <DashboardShell
        title="Account settings"
        description="Control your profile and translation history privacy."
      >
        <form className="dashboard-card form-grid" onSubmit={save}>
          <label>
            Display name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label>
            Country
            <select
              value={countryCode}
              onChange={(event) => setCountryCode(event.target.value)}
              autoComplete="country"
            >
              <option value="">Not set</option>
              {COUNTRY_OPTIONS.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={history}
              onChange={(event) => {
                setHistory(event.target.checked);

                if (!event.target.checked) {
                  setQueryReviewConsent(false);
                }
              }}
            />
            <span>Save translation history for my signed-in account</span>
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={queryReviewConsent}
              disabled={!history}
              onChange={(event) =>
                setQueryReviewConsent(event.target.checked)
              }
            />
            <span>
              Allow administrators to review future saved translations to
              improve translation quality
            </span>
          </label>

          <p className="form-help">
            This consent is optional. Turning it off removes existing saved
            translations from the administrator query-review area.
          </p>

          <button className="primary-button" type="submit">
            Save settings
          </button>

          {message && <p className="form-message">{message}</p>}
        </form>

        <section className="dashboard-card">
          <h2>Billing</h2>

          <p>
            View invoices, update your payment method, manage your plan or
            cancel your subscription from Billing.
          </p>

          <Link
            className="primary-button inline-button"
            href="/dashboard/billing"
          >
            Open billing settings
          </Link>
        </section>
      </DashboardShell>
    </ProtectedRoute>
  );
}
