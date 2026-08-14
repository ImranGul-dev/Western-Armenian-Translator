"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { openBillingPortal, type PortalAction } from "@/lib/billing-api";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { BillingPayment, Subscription } from "@/types/database";

function money(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: (currency || "USD").toUpperCase(),
  }).format((amount || 0) / 100);
}

export default function BillingPage() {
  const { session, plan } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [payments, setPayments] = useState<BillingPayment[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<PortalAction | "">("");

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();

    const [
      { data: sub, error: subError },
      { data: invoiceRows, error: invoiceError },
    ] = await Promise.all([
      supabase.from("subscriptions").select("*").maybeSingle(),
      supabase
        .from("billing_payments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (subError) setMessage(subError.message);
    else setSubscription(sub as Subscription | null);

    if (invoiceError) setMessage(invoiceError.message);
    else setPayments((invoiceRows as BillingPayment[]) || []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function portal(action: PortalAction) {
    if (!session) return;

    setBusy(action);
    setMessage("");

    try {
      location.href = await openBillingPortal(session, action);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Billing portal unavailable.",
      );
      setBusy("");
    }
  }

  const hasCustomer = Boolean(subscription?.stripe_customer_id);
  const active = Boolean(
    subscription &&
      ["active", "trialing", "past_due"].includes(subscription.status),
  );

  return (
    <ProtectedRoute>
      <DashboardShell
        title="Billing and subscription"
        description="Manage your plan, payment method, invoices and subscription."
      >
        {message && <div className="info-banner">{message}</div>}

        <div className="stats-grid">
          <article className="stat-card">
            <span>Effective plan</span>
            <strong>{plan?.name || "Free"}</strong>
            <small>Source: {plan?.source || "default"}</small>
          </article>

          <article className="stat-card">
            <span>Status</span>
            <strong>
              {subscription?.access_suspended
                ? "Paused"
                : subscription?.status || "No subscription"}
            </strong>
          </article>

          <article className="stat-card">
            <span>Recurring price</span>
            <strong>
              {subscription?.amount_cents != null
                ? money(subscription.amount_cents, subscription.currency)
                : "—"}
            </strong>
          </article>

          <article className="stat-card">
            <span>Next payment</span>
            <strong>
              {subscription?.next_payment_at
                ? new Date(subscription.next_payment_at).toLocaleDateString()
                : "—"}
            </strong>
          </article>
        </div>

        {plan?.source === "manual" && (
          <div className="info-banner">
            Your application plan is currently granted manually
            {plan.override_expires_at
              ? ` until ${new Date(plan.override_expires_at).toLocaleString()}`
              : ""}
            . No paid subscription was created for this manual grant.
          </div>
        )}

        <section className="dashboard-card">
          <div className="card-heading">
            <h2>Billing portal</h2>
          </div>

          <p>
            Manage your payment methods, invoices, plan changes and
            subscription cancellation.
          </p>

          <div className="button-row">
            <button
              className="primary-button"
              disabled={!hasCustomer || !!busy}
              onClick={() => void portal("home")}
            >
              {busy === "home" ? "Opening…" : "Open billing portal"}
            </button>

            <button
              disabled={!hasCustomer || !!busy}
              onClick={() => void portal("payment_method_update")}
            >
              Update payment method
            </button>

            <button
              disabled={!active || !!busy}
              onClick={() => void portal("subscription_update")}
            >
              Upgrade or downgrade
            </button>

            <button
              className="danger-button"
              disabled={!active || !!busy}
              onClick={() => void portal("subscription_cancel")}
            >
              Cancel subscription
            </button>
          </div>

          {subscription?.cancel_at_period_end && (
            <p className="form-message">
              Cancellation is scheduled for the end of the current billing
              period.
            </p>
          )}

          {subscription?.access_suspended && (
            <p className="form-message">
              Access is currently paused by an administrator. Contact support
              for assistance.
            </p>
          )}
        </section>

        <section className="dashboard-card">
          <div className="card-heading">
            <h2>Payment history</h2>
            <button onClick={() => void load()}>Refresh</button>
          </div>

          {payments.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Amount</th>
                    <th>Documents</th>
                  </tr>
                </thead>

                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{payment.invoice_number || payment.stripe_invoice_id}</td>
                      <td>{new Date(payment.paid_at || payment.created_at).toLocaleString()}</td>
                      <td>
                        <span className="status-pill">{payment.status}</span>
                        {payment.failure_message && <small>{payment.failure_message}</small>}
                      </td>
                      <td>
                        {money(payment.amount_paid, payment.currency)}
                        {payment.refunded_amount > 0 && (
                          <small>
                            Refunded {money(payment.refunded_amount, payment.currency)}
                          </small>
                        )}
                      </td>
                      <td>
                        <div className="table-actions">
                          {payment.hosted_invoice_url && (
                            <a href={payment.hosted_invoice_url} target="_blank" rel="noreferrer">
                              View
                            </a>
                          )}
                          {payment.invoice_pdf && (
                            <a href={payment.invoice_pdf} target="_blank" rel="noreferrer">
                              PDF
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">No invoices have been added yet.</div>
          )}
        </section>
      </DashboardShell>
    </ProtectedRoute>
  );
}
