"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseBrowserClient, getSupabaseConfig } from "@/lib/supabase/client";

export default function SettingsPage() {
  const { profile, session, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState("");
  const [history, setHistory] = useState(true);
  const [queryReviewConsent, setQueryReviewConsent] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  useEffect(() => {
    setName(profile?.display_name || "");
    setHistory(profile?.history_enabled ?? true);
    setQueryReviewConsent(profile?.query_review_consent ?? false);
  }, [profile]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!profile?.id) return;
    const supabase = getSupabaseBrowserClient();
    const allowAdminReview = history && queryReviewConsent;
    const { error } = await supabase.from("profiles").update({
      display_name: name,
      history_enabled: history,
      query_review_consent: allowAdminReview
    }).eq("id", profile.id);

    if (!error && !allowAdminReview) {
      const { error: historyError } = await supabase.from("translation_history")
        .update({ admin_visible: false })
        .eq("user_id", profile.id);
      if (historyError) {
        setMessage(historyError.message);
        return;
      }
    }

    setMessage(error ? error.message : "Settings saved.");
    if (!error) await refreshProfile();
  }

  async function deleteAccount() {
    if (!session || !confirm("Permanently delete your account, saved translations, feedback and billing link? Active Stripe subscriptions should be cancelled first.")) return;
    const { url, key } = getSupabaseConfig();
    const response = await fetch(`${url}/functions/v1/delete-account`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${session.access_token}` }
    });
    if (response.ok) {
      await signOut();
      router.push("/");
    } else {
      const data = await response.json() as { error?: string };
      setMessage(data.error || "Could not delete account.");
    }
  }

  return (
    <ProtectedRoute>
      <DashboardShell title="Account settings" description="Control your profile, history privacy and account lifecycle.">
        <form className="dashboard-card form-grid" onSubmit={save}>
          <label>Display name<input value={name} onChange={event => setName(event.target.value)} /></label>
          <label className="checkbox-label"><input type="checkbox" checked={history} onChange={event => { setHistory(event.target.checked); if (!event.target.checked) setQueryReviewConsent(false); }} /><span>Save translation history for my signed-in account</span></label>
          <label className="checkbox-label"><input type="checkbox" checked={queryReviewConsent} disabled={!history} onChange={event => setQueryReviewConsent(event.target.checked)} /><span>Allow administrators to review future saved translations to improve translation quality</span></label>
          <p className="form-help">This consent is optional. Turning it off removes existing saved translations from the administrator query-review area.</p>
          <button className="primary-button" type="submit">Save settings</button>
          {message && <p className="form-message">{message}</p>}
        </form>

        <section className="dashboard-card"><h2>Billing</h2><p>View invoices, update your card, change plan or cancel through Stripe’s secure customer portal.</p><Link className="primary-button inline-button" href="/dashboard/billing">Open billing settings</Link></section>

        <section className="dashboard-card danger-zone"><h2>Delete account</h2><p>This permanently deletes your application account and saved data. Cancel any active subscription from Billing first.</p><button className="danger-button" onClick={() => void deleteAccount()}>Delete my account</button></section>
      </DashboardShell>
    </ProtectedRoute>
  );
}
