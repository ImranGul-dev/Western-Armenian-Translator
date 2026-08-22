"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Subscription } from "@/types/database";

function planName(slug: Subscription["plan_slug"]): string {
  if (slug === "premium") return "Person";
  if (slug === "business") return "Elite";
  return "Free";
}

export default function BillingPage() {
  const { plan } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await getSupabaseBrowserClient()
      .from("subscriptions")
      .select("*")
      .maybeSingle();

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("");
    setSubscription(data as Subscription | null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const wooSubscription = subscription?.billing_provider === "woocommerce";

  return (
    <ProtectedRoute>
      <DashboardShell
        title="Billing and subscription"
        description="Review your current plan and subscription status. Paid billing is managed securely on Tun through WooCommerce."
      >
        {message && <div className="info-banner">{message}</div>}

        <div className="stats-grid">
          <article className="stat-card">
            <span>Effective plan</span>
            <strong>{plan?.name || planName(subscription?.plan_slug || null)}</strong>
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
            <span>Billing provider</span>
            <strong>{wooSubscription ? "WooCommerce" : subscription ? "Billing record" : "—"}</strong>
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
            <div>
              <h2>Manage billing on Tun</h2>
              <p>Payments, invoices, payment methods, renewals and cancellations are handled on Tun through WooCommerce.</p>
            </div>
          </div>

          {wooSubscription && (
            <div className="readiness-grid">
              <div>
                <span>Plan</span>
                <strong>{planName(subscription?.plan_slug || null)}</strong>
              </div>
              <div>
                <span>Subscription ID</span>
                <strong>{subscription?.woocommerce_subscription_id || "—"}</strong>
              </div>
              <div>
                <span>Order ID</span>
                <strong>{subscription?.woocommerce_order_id || "—"}</strong>
              </div>
              <div>
                <span>Product ID</span>
                <strong>{subscription?.woocommerce_product_id || "—"}</strong>
              </div>
            </div>
          )}

          <div className="button-row">
            <a
              className="primary-button"
              href="https://tunapp.com/"
              target="_blank"
              rel="noreferrer"
            >
              Open Tun
            </a>

            <Link href="/pricing">
              Compare plans
            </Link>

            <button type="button" onClick={() => void load()}>
              Refresh status
            </button>
          </div>

          {subscription?.access_suspended && (
            <p className="form-message">
              Access is currently paused by an administrator. Contact support for assistance.
            </p>
          )}
        </section>
      </DashboardShell>
    </ProtectedRoute>
  );
}
