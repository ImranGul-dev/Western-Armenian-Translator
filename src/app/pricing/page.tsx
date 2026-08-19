"use client";

import { useEffect, useRef, useState } from "react";
import { SiteFrame } from "@/components/SiteFrame";
import { useAuth } from "@/contexts/AuthContext";
import { startCheckout } from "@/lib/billing-api";
import { FALLBACK_PLANS } from "@/lib/plans";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Plan, PlanSlug } from "@/types/database";

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

function pricingPlanName(slug: PlanSlug): string {
  if (slug === "premium") return "Person";
  if (slug === "business") return "Elite";
  return "Free";
}

export default function PricingPage() {
  const { session, plan: current, loading: authLoading } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const automaticCheckoutStarted = useRef(false);

  useEffect(() => {
    void getSupabaseBrowserClient().from("plans").select("*").eq("active", true).order("sort_order")
      .then(({ data }) => setPlans((data as Plan[]) || []));
  }, []);

  const display = plans.length
    ? plans
    : Object.values(FALLBACK_PLANS).map((plan, index) => ({ ...plan, id: `${plan.slug}${index}` }));

  async function beginBilling(slug: "premium" | "business") {
    if (!session) {
      const next = `/pricing?plan=${slug}`;
      location.href = `/signup?next=${encodeURIComponent(next)}`;
      return;
    }

    setBusy(slug);
    setMessage("");

    try {
      location.href = await startCheckout(session, slug);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open subscription checkout.");
      setBusy(null);
    }
  }

  useEffect(() => {
    const plan = requestedPlan();
    if (authLoading || !session || !plan || automaticCheckoutStarted.current) return;
    automaticCheckoutStarted.current = true;
    void beginBilling(plan);
    // beginBilling intentionally depends on live auth state and is executed only once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session]);

  return (
    <SiteFrame>
      <section className="page-intro">
        <p className="eyebrow">Plans</p>
        <h1>Choose your translation plan</h1>
        <p>Upgrade for a larger monthly allowance, longer requests and expanded account features.</p>
        <p>Paid subscriptions are billed annually on Tun&apos;s secure WooCommerce checkout, where the current price, tax and available payment methods are shown before payment.</p>
      </section>

      {message && <div className="info-banner">{message}</div>}

      <div className="pricing-grid">
        {display.map(plan => {
          const sameEffectivePlan = current?.slug === plan.slug;
          const sameWooPlan = sameEffectivePlan && current?.source === "woocommerce";
          const displayName = pricingPlanName(plan.slug);
          const isPaidPlan = plan.slug === "premium" || plan.slug === "business";

          return (
            <article className={`pricing-card ${sameEffectivePlan ? "current" : ""}`} key={plan.slug}>
              <div>
                <span className="plan-label">
                  {sameWooPlan
                    ? "Current plan"
                    : sameEffectivePlan && current?.source === "manual"
                      ? "Manual access"
                      : displayName}
                </span>

                <h2>{displayName}</h2>

                <div className="price">
                  {isPaidPlan ? "Annual" : formatPrice(plan)}
                  <span>{isPaidPlan ? " subscription" : ""}</span>
                </div>
              </div>

              <ul>
                {plan.features.map(feature => <li key={feature}>✓ {feature}</li>)}
              </ul>

              <button
                className="primary-button full-button"
                disabled={sameWooPlan || plan.slug === "free" || !!busy}
                onClick={() => plan.slug !== "free" && void beginBilling(plan.slug)}
              >
                {sameWooPlan
                  ? "Current plan"
                  : plan.slug === "free"
                    ? "Included"
                    : !session
                      ? "Choose plan"
                      : busy === plan.slug
                        ? "Opening checkout…"
                        : sameEffectivePlan && current?.source === "manual"
                          ? "Subscribe"
                          : "Choose plan"}
              </button>
            </article>
          );
        })}
      </div>
    </SiteFrame>
  );
}
