"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { runAdminBillingAction } from "@/lib/billing-api";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { BillingPayment, Profile } from "@/types/database";

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
}

export default function AdminPaymentsPage() {
  const { session } = useAuth();
  const [rows, setRows] = useState<BillingPayment[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Pick<Profile, "email" | "display_name">>>({});
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const [{ data: payments, error }, { data: users }] = await Promise.all([
      supabase.from("billing_payments").select("*").order("created_at", { ascending: false }).limit(250),
      supabase.from("profiles").select("id,email,display_name")
    ]);
    if (error) setMessage(error.message);
    setRows((payments as BillingPayment[]) || []);
    setProfiles(Object.fromEntries((users || []).map(user => [user.id, user])));
  }, []);

  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => filter === "all" ? rows : rows.filter(row => row.status === filter), [filter, rows]);

  async function refund(payment: BillingPayment) {
    if (!session || !confirm(`Refund ${money(payment.amount_paid, payment.currency)} for invoice ${payment.invoice_number || payment.stripe_invoice_id}?`)) return;
    setBusy(payment.id);
    setMessage("");
    try {
      setMessage(await runAdminBillingAction(session, { action: "refund", paymentId: payment.id }));
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refund failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ProtectedRoute roles={["admin"]}>
      <DashboardShell admin title="Payments" description="Invoice and recurring-payment history synchronized from verified Stripe webhooks.">
        {message && <div className="info-banner">{message}</div>}
        <section className="dashboard-card">
          <div className="card-heading"><div><h2>Invoice payments</h2><p>Amounts are stored in each currency’s smallest unit and formatted for display.</p></div><div className="table-actions"><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All statuses</option><option value="paid">Paid</option><option value="open">Open / failed</option><option value="void">Void</option><option value="uncollectible">Uncollectible</option></select><button onClick={() => void load()}>Refresh</button></div></div>
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Customer</th><th>Invoice</th><th>Date</th><th>Status</th><th>Amount</th><th>Links and actions</th></tr></thead><tbody>{visible.map(payment => {
            const person = payment.user_id ? profiles[payment.user_id] : undefined;
            const refundable = payment.status === "paid" && payment.amount_paid > payment.refunded_amount;
            return <tr key={payment.id}>
              <td><strong>{person?.display_name || "Unknown customer"}</strong><small>{person?.email || payment.user_id || "Unlinked Stripe customer"}</small></td>
              <td><strong>{payment.invoice_number || payment.stripe_invoice_id}</strong><small>{payment.billing_reason || "Invoice"}</small></td>
              <td>{new Date(payment.paid_at || payment.created_at).toLocaleString()}</td>
              <td><span className="status-pill">{payment.status}</span>{payment.failure_message && <small>{payment.failure_message}</small>}</td>
              <td><strong>{money(payment.amount_paid, payment.currency)}</strong>{payment.refunded_amount > 0 && <small>Refunded: {money(payment.refunded_amount, payment.currency)}</small>}</td>
              <td><div className="table-actions vertical-actions">{payment.hosted_invoice_url && <a href={payment.hosted_invoice_url} target="_blank" rel="noreferrer">Hosted invoice</a>}{payment.invoice_pdf && <a href={payment.invoice_pdf} target="_blank" rel="noreferrer">Download PDF</a>}<button className="danger-button" disabled={!refundable || busy === payment.id} onClick={() => void refund(payment)}>{busy === payment.id ? "Refunding…" : "Refund"}</button></div></td>
            </tr>;
          })}</tbody></table></div>
          {!visible.length && <div className="empty-state">No synchronized invoices match this filter.</div>}
        </section>
      </DashboardShell>
    </ProtectedRoute>
  );
}
