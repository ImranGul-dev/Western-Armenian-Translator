"use client";

import { useEffect, useRef, useState } from "react";
import { SiteFrame } from "@/components/SiteFrame";
import { useAuth } from "@/contexts/AuthContext";
import { openBillingPortal, startCheckout } from "@/lib/billing-api";
import { FALLBACK_PLANS } from "@/lib/plans";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Plan } from "@/types/database";

function requestedPlan(): "premium" | "business" | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("plan");
  return value === "premium" || value === "business" ? value : null;
}

function formatPrice(plan: Plan): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: (plan.currency || "usd").toUpperCase(),
    maximumFractionDigits: plan.price_monthly_cents % 100 === 0 ? 0 : 2
  }).format(plan.price_monthly_cents / 100);
}

export default function PricingPage() {
  const { session, plan: current, loading: authLoading } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const automaticCheckoutStarted = useRef(false);
  const billingEnabled = process.env.NEXT_PUBLIC_BILLING_ENABLED === "true";

  useEffect(() => {
    void getSupabaseBrowserClient().from("plans").select("*").eq("active", true).order("sort_order")
      .then(({ data }) => setPlans((data as Plan[]) || []));
  }, []);

  const display = plans.length
    ? plans
    : Object.values(FALLBACK_PLANS).map((plan, index) => ({ ...plan, id: `${plan.slug}${index}` }));

  async function beginBilling(slug: "premium" | "business") {
    if (!billingEnabled) {
      setMessage("Online subscription checkout is disabled until Stripe billing is activated.");
      return;
    }
    if (!session) {
      const next = `/pricing?plan=${slug}`;
      location.href = `/signup?next=${encodeURIComponent(next)}`;
      return;
    }

    setBusy(slug);
    setMessage("");
    try {
      if (current?.source === "stripe" && (current.slug === "premium" || current.slug === "business")) {
        location.href = await openBillingPortal(session, "subscription_update");
      } else {
        // Manual application access remains separate. Checkout creates a real Stripe subscription
        // while the manual override continues to take priority until it is removed or expires.
        location.href = await startCheckout(session, slug);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open billing.");
      setBusy(null);
    }
  }

  useEffect(() => {
    const plan = requestedPlan();
    if (authLoading || !session || !plan || automaticCheckoutStarted.current || !billingEnabled) return;
    automaticCheckoutStarted.current = true;
    void beginBilling(plan);
    // beginBilling intentionally depends on live auth state and is executed only once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, billingEnabled, session]);

  return (
    <SiteFrame>
      <section className="page-intro">
        <p className="eyebrow">Plans</p>
        <h1>Choose your translation plan</h1>
        <p>Upgrade for a larger monthly allowance, longer requests and expanded account features.</p>
      </section>
      {message && <div className="info-banner">{message}</div>}
      <div className="pricing-grid">
        {display.map(plan => {
          const sameEffectivePlan = current?.slug === plan.slug;
          const sameStripePlan = sameEffectivePlan && current?.source === "stripe";
          return (
            <article className={`pricing-card ${sameEffectivePlan ? "current" : ""}`} key={plan.slug}>
              <div>
                <span className="plan-label">
                  {sameStripePlan ? "Current plan" : sameEffectivePlan && current?.source === "manual" ? "Manual access" : plan.name}
                </span>
                <h2>{plan.name}</h2>
                <div className="price">{formatPrice(plan)}<span>/{plan.billing_interval || "month"}</span></div>
              </div>
              <ul>{plan.features.map(feature => <li key={feature}>✓ {feature}</li>)}</ul>
              <button
                className="primary-button full-button"
                disabled={sameStripePlan || plan.slug === "free" || !!busy}
                onClick={() => plan.slug !== "free" && void beginBilling(plan.slug)}
              >
                {sameStripePlan
                  ? "Current plan"
                  : plan.slug === "free"
                    ? "Included"
                    : !billingEnabled
                      ? "Billing disabled"
                      : busy === plan.slug
                        ? "Opening billing…"
                        : sameEffectivePlan && current?.source === "manual"
                          ? "Subscribe with Stripe"
                          : current?.source === "stripe" && (current.slug === "premium" || current.slug === "business")
                            ? "Change plan"
                            : "Choose plan"}
              </button>
            </article>
          );
        })}
      </div>
    </SiteFrame>
  );
}
