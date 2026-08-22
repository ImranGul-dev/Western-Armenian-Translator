"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Profile, Subscription } from "@/types/database";

function planName(slug: Subscription["plan_slug"]): string {
  if (slug === "premium") return "Person";
  if (slug === "business") return "Elite";
  return "Free";
}

function providerLabel(provider: Subscription["billing_provider"]): string {
  if (provider === "woocommerce") return "WooCommerce";
  if (provider) return "Legacy billing";
  return "—";
}

export default function AdminSubscriptionsPage() {
  const [rows, setRows] = useState<Subscription[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Pick<Profile, "email" | "display_name">>>({});
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const [{ data: subscriptions, error }, { data: users }] = await Promise.all([
      supabase.from("subscriptions").select("*").order("updated_at", { ascending: false }),
      supabase.from("profiles").select("id,email,display_name")
    ]);

    if (error) setMessage(error.message);
    else setMessage("");

    setRows((subscriptions as Subscription[]) || []);
    setProfiles(Object.fromEntries((users || []).map(user => [user.id, user])));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => filter === "all" ? rows : rows.filter(row => row.status === filter || (filter === "paused" && row.access_suspended)),
    [filter, rows]
  );

  return (
    <ProtectedRoute roles={["admin"]}>
      <DashboardShell
        admin
        title="Subscriptions"
        description="Review subscription records synchronized from Tun WooCommerce. Billing changes are managed on Tun; this page is for access and support checks."
      >
        {message && <div className="info-banner">{message}</div>}

        <section className="dashboard-card">
          <div className="card-heading">
            <div>
              <h2>Subscriber records</h2>
              <p>WooCommerce subscription status is the source of truth for paid access.</p>
            </div>

            <div className="table-actions">
              <select value={filter} onChange={event => setFilter(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="on-hold">On hold</option>
                <option value="pending-cancel">Pending cancel</option>
                <option value="cancelled">Cancelled</option>
                <option value="expired">Expired</option>
                <option value="paused">Access paused</option>
              </select>
              <button onClick={() => void load()}>Refresh</button>
            </div>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Provider</th>
                  <th>WooCommerce</th>
                  <th>Dates</th>
                </tr>
              </thead>

              <tbody>
                {visible.map(row => {
                  const person = profiles[row.user_id];

                  return (
                    <tr key={row.id}>
                      <td>
                        <strong>{person?.display_name || "Unnamed user"}</strong>
                        <small>{person?.email || row.user_id}</small>
                      </td>

                      <td>
                        <strong>{planName(row.plan_slug)}</strong>
                      </td>

                      <td>
                        <span className="status-pill">{row.access_suspended ? "paused" : row.status}</span>
                        {row.access_suspended_reason && <small>{row.access_suspended_reason}</small>}
                      </td>

                      <td>
                        <strong>{providerLabel(row.billing_provider)}</strong>
                      </td>

                      <td>
                        <small>Subscription: {row.woocommerce_subscription_id || "—"}</small>
                        <small>Customer: {row.woocommerce_customer_id || "—"}</small>
                        <small>Order: {row.woocommerce_order_id || "—"}</small>
                        <small>Product: {row.woocommerce_product_id || "—"}</small>
                      </td>

                      <td>
                        <small>Last update: {new Date(row.updated_at).toLocaleString()}</small>
                        <small>Next payment: {row.next_payment_at ? new Date(row.next_payment_at).toLocaleDateString() : "—"}</small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!visible.length && <div className="empty-state">No subscriptions match this filter.</div>}
        </section>
      </DashboardShell>
    </ProtectedRoute>
  );
}
