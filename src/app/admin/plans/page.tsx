"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { getBillingConfigurationStatus, type BillingConfigurationStatus } from "@/lib/billing-api";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Plan, PlanSlug } from "@/types/database";

interface EditablePlan extends Plan {
  price_monthly: string;
  features_text: string;
  history_limit_text: string;
}

interface AnonymousUsageForm {
  monthly_character_limit: number;
  max_characters_per_request: number;
  rate_limit_per_minute: number;
}

const DEFAULT_ANONYMOUS: AnonymousUsageForm = {
  monthly_character_limit: 20_000,
  max_characters_per_request: 1_500,
  rate_limit_per_minute: 10
};

function toEditable(plan: Plan): EditablePlan {
  return {
    ...plan,
    price_monthly: (plan.price_monthly_cents / 100).toFixed(2),
    features_text: plan.features.join("\n"),
    history_limit_text: plan.history_limit === null ? "" : String(plan.history_limit)
  };
}

function statusLabel(value: boolean): string {
  return value ? "Ready" : "Not configured";
}

export default function AdminPlansPage() {
  const { session } = useAuth();
  const [plans, setPlans] = useState<EditablePlan[]>([]);
  const [anonymous, setAnonymous] = useState<AnonymousUsageForm>(DEFAULT_ANONYMOUS);
  const [billingStatus, setBillingStatus] = useState<BillingConfigurationStatus | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const [{ data: planRows, error: plansError }, { data: settingRow, error: settingError }] = await Promise.all([
      supabase.from("plans").select("*").order("sort_order"),
      supabase.from("platform_settings").select("value").eq("key", "anonymous_usage").maybeSingle()
    ]);

    if (plansError || settingError) {
      setMessage(plansError?.message || settingError?.message || "Could not load plan settings.");
    }
    setPlans(((planRows as Plan[]) || []).map(toEditable));
    const value = settingRow?.value;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      setAnonymous({
        monthly_character_limit: Number(record.monthly_character_limit || DEFAULT_ANONYMOUS.monthly_character_limit),
        max_characters_per_request: Number(record.max_characters_per_request || DEFAULT_ANONYMOUS.max_characters_per_request),
        rate_limit_per_minute: Number(record.rate_limit_per_minute || DEFAULT_ANONYMOUS.rate_limit_per_minute)
      });
    }
  }, []);

  const loadBillingStatus = useCallback(async () => {
    if (!session) return;
    try {
      setBillingStatus(await getBillingConfigurationStatus(session));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not check Stripe configuration.");
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadBillingStatus();
  }, [loadBillingStatus]);

  const billingPlanStatus = useMemo(() => Object.fromEntries(
    (billingStatus?.plans || []).map(plan => [plan.slug, plan])
  ), [billingStatus]);

  function updatePlan(slug: PlanSlug, patch: Partial<EditablePlan>) {
    setPlans(current => current.map(plan => plan.slug === slug ? { ...plan, ...patch } : plan));
  }

  async function savePlan(plan: EditablePlan) {
    const priceMonthly = Number(plan.price_monthly);
    if (!Number.isFinite(priceMonthly) || priceMonthly < 0) {
      setMessage("Enter a valid monthly price.");
      return;
    }
    if (plan.monthly_character_limit < 1 || plan.max_characters_per_request < 100 || plan.max_characters_per_request > 10_000) {
      setMessage("Check the monthly and per-request character limits.");
      return;
    }
    if (plan.rate_limit_per_minute < 1 || plan.rate_limit_per_minute > 1_000) {
      setMessage("The rate limit must be between 1 and 1,000 requests per minute.");
      return;
    }
    if (plan.widget_site_limit < 0 || plan.widget_site_limit > 1_000 || (plan.widget_enabled && plan.widget_site_limit < 1)) {
      setMessage("Widget-enabled plans need a site limit between 1 and 1,000.");
      return;
    }

    setBusy(plan.slug);
    setMessage("");
    const payload = {
      name: plan.name.trim(),
      price_monthly_cents: Math.round(priceMonthly * 100),
      monthly_character_limit: Math.round(plan.monthly_character_limit),
      max_characters_per_request: Math.round(plan.max_characters_per_request),
      history_limit: plan.history_limit_text.trim() ? Math.max(1, Number.parseInt(plan.history_limit_text, 10)) : null,
      rate_limit_per_minute: Math.round(plan.rate_limit_per_minute),
      features: plan.features_text.split("\n").map(item => item.trim()).filter(Boolean),
      active: plan.slug === "free" ? true : plan.active,
      currency: (plan.currency || "usd").trim().toLowerCase(),
      billing_interval: plan.billing_interval || "month",
      stripe_product_id: plan.stripe_product_id?.trim() || null,
      stripe_price_id: plan.slug === "free" ? null : plan.stripe_price_id?.trim() || null,
      widget_enabled: plan.widget_enabled,
      widget_site_limit: Math.round(plan.widget_site_limit),
      widget_monthly_character_limit: plan.widget_monthly_character_limit == null ? null : Math.round(plan.widget_monthly_character_limit),
      widget_branding_removable: plan.widget_branding_removable
    };
    const { error } = await getSupabaseBrowserClient().from("plans").update(payload).eq("id", plan.id);
    setBusy(null);
    setMessage(error?.message || `${plan.name} saved.`);
    if (!error) {
      await load();
      await loadBillingStatus();
    }
  }

  async function saveAnonymousLimits() {
    if (
      anonymous.monthly_character_limit < 1
      || anonymous.max_characters_per_request < 100
      || anonymous.max_characters_per_request > 10_000
      || anonymous.rate_limit_per_minute < 1
      || anonymous.rate_limit_per_minute > 1_000
    ) {
      setMessage("Check the anonymous visitor limits before saving.");
      return;
    }
    setBusy("anonymous");
    setMessage("");
    const { error } = await getSupabaseBrowserClient().from("platform_settings").upsert({
      key: "anonymous_usage",
      value: anonymous,
      description: "Public translator limits for visitors who are not signed in."
    }, { onConflict: "key" });
    setBusy(null);
    setMessage(error?.message || "Anonymous visitor limits saved.");
  }

  return (
    <ProtectedRoute roles={["admin"]}>
      <DashboardShell
        admin
        title="Plans and usage limits"
        description="Control public access, account allowances, pricing display and the Stripe Price IDs used at checkout."
      >
        {message && <div className="info-banner">{message}</div>}

        <section className="dashboard-card">
          <div className="card-heading">
            <div>
              <h2>Anonymous visitor limits</h2>
              <p>These limits apply before a visitor creates an account.</p>
            </div>
          </div>
          <div className="settings-grid">
            <label>Monthly character allowance<input type="number" min={1} value={anonymous.monthly_character_limit} onChange={event => setAnonymous(current => ({ ...current, monthly_character_limit: Number(event.target.value) }))} /></label>
            <label>Characters per request<input type="number" min={100} max={10000} value={anonymous.max_characters_per_request} onChange={event => setAnonymous(current => ({ ...current, max_characters_per_request: Number(event.target.value) }))} /></label>
            <label>Requests per minute<input type="number" min={1} max={1000} value={anonymous.rate_limit_per_minute} onChange={event => setAnonymous(current => ({ ...current, rate_limit_per_minute: Number(event.target.value) }))} /></label>
          </div>
          <button className="primary-button inline-button" type="button" disabled={busy === "anonymous"} onClick={() => void saveAnonymousLimits()}>
            {busy === "anonymous" ? "Saving…" : "Save visitor limits"}
          </button>
        </section>

        <section className="plan-admin-grid">
          {plans.map(plan => {
            const stripeState = billingPlanStatus[plan.slug];
            return (
              <article className="dashboard-card plan-admin-card" key={plan.id}>
                <div className="card-heading">
                  <div><span className="plan-label">{plan.slug}</span><h2>{plan.name}</h2></div>
                  {plan.slug !== "free" && <span className={`status-chip ${stripeState?.stripe_price_configured ? "approved" : "pending"}`}>{stripeState?.stripe_price_configured ? "Stripe price connected" : "Stripe price required"}</span>}
                </div>
                <div className="settings-grid single-column">
                  <label>Plan name<input value={plan.name} onChange={event => updatePlan(plan.slug, { name: event.target.value })} /></label>
                  <label>Monthly price<input inputMode="decimal" value={plan.price_monthly} onChange={event => updatePlan(plan.slug, { price_monthly: event.target.value })} disabled={plan.slug === "free"} /></label>
                  <label>Currency<input value={plan.currency || "usd"} maxLength={3} onChange={event => updatePlan(plan.slug, { currency: event.target.value.toLowerCase() })} disabled={plan.slug === "free"} /></label>
                  <label>Billing interval<select value={plan.billing_interval || "month"} onChange={event => updatePlan(plan.slug, { billing_interval: event.target.value })} disabled={plan.slug === "free"}><option value="month">Monthly</option><option value="year">Yearly</option><option value="week">Weekly</option><option value="day">Daily</option></select></label>
                  <label>Monthly character allowance<input type="number" min={1} value={plan.monthly_character_limit} onChange={event => updatePlan(plan.slug, { monthly_character_limit: Number(event.target.value) })} /></label>
                  <label>Characters per request<input type="number" min={100} max={10000} value={plan.max_characters_per_request} onChange={event => updatePlan(plan.slug, { max_characters_per_request: Number(event.target.value) })} /></label>
                  <label>Requests per minute<input type="number" min={1} max={1000} value={plan.rate_limit_per_minute} onChange={event => updatePlan(plan.slug, { rate_limit_per_minute: Number(event.target.value) })} /></label>
                  <label>History item limit<input type="number" min={1} placeholder="Blank for unlimited" value={plan.history_limit_text} onChange={event => updatePlan(plan.slug, { history_limit_text: event.target.value })} /></label>
                  <label>Widget site limit<input type="number" min={0} max={1000} value={plan.widget_site_limit} onChange={event => updatePlan(plan.slug, { widget_site_limit: Number(event.target.value) })} disabled={!plan.widget_enabled} /></label>
                  <label>Separate widget monthly limit<input type="number" min={1} placeholder="Blank shares plan allowance" value={plan.widget_monthly_character_limit ?? ""} onChange={event => updatePlan(plan.slug, { widget_monthly_character_limit: event.target.value ? Number(event.target.value) : null })} disabled={!plan.widget_enabled} /></label>
                  <label className="checkbox-label"><input type="checkbox" checked={plan.widget_enabled} onChange={event => updatePlan(plan.slug, { widget_enabled: event.target.checked, widget_site_limit: event.target.checked ? Math.max(1, plan.widget_site_limit) : 0 })} />Embeddable website widget enabled</label>
                  <label className="checkbox-label"><input type="checkbox" checked={plan.widget_branding_removable} disabled={!plan.widget_enabled} onChange={event => updatePlan(plan.slug, { widget_branding_removable: event.target.checked })} />Customers may remove Tun branding</label>
                  <label className="span-full">Features, one per line<textarea value={plan.features_text} onChange={event => updatePlan(plan.slug, { features_text: event.target.value })} /></label>
                  {plan.slug !== "free" && (
                    <>
                      <label className="span-full">Stripe Product ID<input placeholder="prod_... (optional)" value={plan.stripe_product_id || ""} onChange={event => updatePlan(plan.slug, { stripe_product_id: event.target.value })} /></label>
                      <label className="span-full">Stripe recurring Price ID<input placeholder="price_..." value={plan.stripe_price_id || ""} onChange={event => updatePlan(plan.slug, { stripe_price_id: event.target.value })} /></label>
                      <label className="checkbox-label"><input type="checkbox" checked={plan.active} onChange={event => updatePlan(plan.slug, { active: event.target.checked })} />Plan available for purchase</label>
                    </>
                  )}
                </div>
                {plan.slug !== "free" && <p className="form-help">Create a matching recurring Stripe Price first. Checkout verifies that its amount, currency and interval match this plan.</p>}
                <button className="primary-button inline-button" type="button" disabled={busy === plan.slug} onClick={() => void savePlan(plan)}>
                  {busy === plan.slug ? "Saving…" : `Save ${plan.name}`}
                </button>
              </article>
            );
          })}
        </section>

        <section className="dashboard-card">
          <div className="card-heading"><div><h2>Stripe production readiness</h2><p>Private values stay in Supabase Edge Function Secrets.</p></div><button type="button" onClick={() => void loadBillingStatus()}>Refresh status</button></div>
          {billingStatus ? (
            <div className="readiness-grid">
              <div><span>Billing switch</span><strong>{billingStatus.billing_enabled ? "Enabled" : "Disabled"}</strong></div>
              <div><span>Stripe secret key</span><strong>{statusLabel(billingStatus.stripe_secret_configured)}</strong></div>
              <div><span>Webhook signing secret</span><strong>{statusLabel(billingStatus.webhook_secret_configured)}</strong></div>
              <div><span>Customer Portal</span><strong>{statusLabel(billingStatus.portal_configuration_configured)}</strong></div>
              <div><span>Site URL</span><strong>{billingStatus.site_url}</strong></div>
              <div><span>Automatic tax</span><strong>{billingStatus.tax_enabled ? "Enabled" : "Disabled"}</strong></div>
            </div>
          ) : <div className="empty-state">Billing status has not been loaded.</div>}
        </section>
      </DashboardShell>
    </ProtectedRoute>
  );
}
