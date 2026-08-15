"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { runAdminBillingAction, type AdminBillingAction } from "@/lib/billing-api";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Profile, Subscription } from "@/types/database";

function money(amount: number | null, currency: string | null): string {
  return amount == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: (currency || "USD").toUpperCase() }).format(amount / 100);
}

export default function AdminSubscriptionsPage() {
  const { session } = useAuth();
  const [rows, setRows] = useState<Subscription[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Pick<Profile, "email" | "display_name">>>({});
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const [{ data: subscriptions, error }, { data: users }] = await Promise.all([
      supabase.from("subscriptions").select("*").order("updated_at", { ascending: false }),
      supabase.from("profiles").select("id,email,display_name")
    ]);
    if (error) setMessage(error.message);
    setRows((subscriptions as Subscription[]) || []);
    setProfiles(Object.fromEntries((users || []).map(user => [user.id, user])));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => filter === "all" ? rows : rows.filter(row => row.status === filter || (filter === "paused" && row.access_suspended)), [filter, rows]);

  async function act(row: Subscription, action: AdminBillingAction, extra: Record<string, unknown> = {}) {
    if (!session) return;
    const destructive = action === "cancel_now" || action === "refund";
    if (destructive && !confirm("This action is immediate and may affect customer access or money. Continue?")) return;
    setBusy(`${row.id}:${action}`);
    setMessage("");
    try {
      setMessage(await runAdminBillingAction(session, { action, subscriptionId: row.id, ...extra }));
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Billing action failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ProtectedRoute roles={["admin"]}>
      <DashboardShell admin title="Subscriptions" description="View Stripe subscribers and securely pause, resume, change, cancel or re-synchronize subscriptions.">
        {message && <div className="info-banner">{message}</div>}
        <section className="dashboard-card">
          <div className="card-heading">
            <div><h2>Subscriber records</h2><p>Stripe webhooks are the source of truth. Use Sync when a record looks stale.</p></div>
            <div className="table-actions"><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="trialing">Trialing</option><option value="past_due">Past due</option><option value="canceled">Canceled</option><option value="paused">Access paused</option></select><button onClick={() => void load()}>Refresh</button></div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Customer</th><th>Plan</th><th>Status</th><th>Billing</th><th>Dates</th><th>Actions</th></tr></thead>
              <tbody>{visible.map(row => {
                const person = profiles[row.user_id];
                return <tr key={row.id}>
                  <td><strong>{person?.display_name || "Unnamed user"}</strong><small>{person?.email || row.user_id}</small></td>
                  <td><strong>{row.plan_slug || "Free"}</strong><small>{money(row.amount_cents, row.currency)} / {row.billing_interval || "month"}</small></td>
                  <td><span className="status-pill">{row.access_suspended ? "paused" : row.status}</span>{row.cancel_at_period_end && <small>Cancels at period end</small>}{row.access_suspended_reason && <small>{row.access_suspended_reason}</small>}</td>
                  <td><small>Customer: {row.stripe_customer_id || "—"}</small><small>Subscription: {row.stripe_subscription_id || "—"}</small></td>
                  <td><small>Last: {row.last_payment_at ? new Date(row.last_payment_at).toLocaleDateString() : "—"}</small><small>Next: {row.next_payment_at ? new Date(row.next_payment_at).toLocaleDateString() : "—"}</small></td>
                  <td><div className="table-actions vertical-actions">
                    <button disabled={!!busy} onClick={() => void act(row, "sync")}>Sync</button>
                    {row.access_suspended ? <button disabled={!!busy} onClick={() => void act(row, "resume")}>Resume</button> : <button disabled={!!busy} onClick={() => void act(row, "pause", { reason: "Paused by administrator" })}>Pause</button>}
                    {row.cancel_at_period_end ? <button disabled={!!busy} onClick={() => void act(row, "reactivate")}>Undo cancellation</button> : <button disabled={!!busy} onClick={() => void act(row, "cancel_at_period_end")}>Cancel at period end</button>}
                    <button disabled={!!busy || row.plan_slug === "premium"} onClick={() => void act(row, "change_plan", { plan: "premium", prorationBehavior: "create_prorations" })}>Set Premium</button>
                    <button disabled={!!busy || row.plan_slug === "business"} onClick={() => void act(row, "change_plan", { plan: "business", prorationBehavior: "always_invoice" })}>Set Schools</button>
                    <button className="danger-button" disabled={!!busy || row.status === "canceled"} onClick={() => void act(row, "cancel_now")}>Cancel now</button>
                  </div></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          {!visible.length && <div className="empty-state">No subscriptions match this filter.</div>}
        </section>
      </DashboardShell>
    </ProtectedRoute>
  );
}
