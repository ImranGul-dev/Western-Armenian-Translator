"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseConfig } from "@/lib/supabase/client";
import { loadWidgetDashboard, mutateWidget } from "@/lib/widget-api";
import type { EffectivePlan, WidgetSite, WidgetTheme } from "@/types/database";

const PAIRS = [
  { source: "en" as const, target: "hyw" as const, label: "English → Western Armenian" },
  { source: "hyw" as const, target: "en" as const, label: "Western Armenian → English" },
  { source: "hye" as const, target: "hyw" as const, label: "Eastern Armenian → Western Armenian" },
  { source: "en" as const, target: "hye" as const, label: "English → Eastern Armenian" },
  { source: "hye" as const, target: "en" as const, label: "Eastern Armenian → English" }
];

interface Draft {
  name: string;
  allowed_domain: string;
  active: boolean;
  theme: WidgetTheme;
  pair: string;
  show_branding: boolean;
}

function pairValue(site: Pick<WidgetSite, "default_source_language" | "default_target_language">): string {
  return `${site.default_source_language}:${site.default_target_language}`;
}

function embedCode(site: WidgetSite): string {
  const { url, key } = getSupabaseConfig();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "https://YOUR_TRANSLATOR_DOMAIN.com")).replace(/\/+$/u, "");
  return `<div id="tun-western-armenian-translator-${site.id}"></div>\n<script\n  src="${siteUrl}/tun-translator-widget.js"\n  data-widget-key="${site.public_key}"\n  data-container="tun-western-armenian-translator-${site.id}"\n  data-endpoint="${url.replace(/\/+$/u, "")}/functions/v1/widget-translate"\n  data-supabase-key="${key}"\n  data-theme="${site.theme}"\n  data-source-language="${site.default_source_language}"\n  data-target-language="${site.default_target_language}"\n  data-show-branding="${site.show_branding}"\n  defer\n></script>`;
}

function WidgetCard({ site, brandingRemovable, onChanged, setMessage }: { site: WidgetSite; brandingRemovable: boolean; onChanged: () => Promise<void>; setMessage: (value: string) => void }) {
  const [draft, setDraft] = useState<Draft>({ name: site.name, allowed_domain: site.allowed_domain, active: site.active, theme: site.theme, pair: pairValue(site), show_branding: site.show_branding });
  const [busy, setBusy] = useState("");
  const code = useMemo(() => embedCode(site), [site]);

  async function run(action: "update" | "rotate" | "delete" | "set_active") {
    if (action === "rotate" && !window.confirm("Rotate this public widget key? The existing embed code will stop working immediately.")) return;
    if (action === "delete" && !window.confirm("Delete this widget installation? Its current key will stop working immediately.")) return;
    setBusy(action);
    setMessage("");
    try {
      const [sourceLanguage, targetLanguage] = draft.pair.split(":") as ["en" | "hyw" | "hye", "en" | "hyw" | "hye"];
      await mutateWidget({
        action,
        widgetId: site.id,
        name: action === "update" ? draft.name : null,
        allowedDomain: action === "update" ? draft.allowed_domain : null,
        active: action === "set_active" ? !site.active : action === "update" ? draft.active : null,
        theme: action === "update" ? draft.theme : null,
        sourceLanguage: action === "update" ? sourceLanguage : null,
        targetLanguage: action === "update" ? targetLanguage : null,
        showBranding: action === "update" ? draft.show_branding : null
      });
      setMessage(action === "rotate" ? "Widget key rotated. Replace the embed code on the customer website." : action === "delete" ? "Widget deleted." : "Widget saved.");
      await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The widget action failed.");
    } finally {
      setBusy("");
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setMessage("Embed code copied.");
    } catch {
      setMessage("Copy failed. Select the code and copy it manually.");
    }
  }

  return <article className="dashboard-card widget-card">
    <div className="card-heading"><div><h2>{site.name}</h2><p>{site.allowed_domain}</p></div><span className={`status-chip ${site.active ? "approved" : "pending"}`}>{site.active ? "Enabled" : "Disabled"}</span></div>
    <div className="stats-grid compact-stats">
      <div className="stat-card"><span>Translations this month</span><strong>{Number(site.monthly_translations || 0).toLocaleString()}</strong></div>
      <div className="stat-card"><span>Characters this month</span><strong>{Number(site.monthly_characters || 0).toLocaleString()}</strong></div>
      <div className="stat-card"><span>Last used</span><strong>{site.last_used_at ? new Date(site.last_used_at).toLocaleString() : "Never"}</strong></div>
    </div>
    <div className="settings-grid">
      <label>Widget name<input value={draft.name} maxLength={100} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></label>
      <label>Allowed domain<input value={draft.allowed_domain} placeholder="www.example.com" onChange={event => setDraft(current => ({ ...current, allowed_domain: event.target.value }))} /></label>
      <label>Theme<select value={draft.theme} onChange={event => setDraft(current => ({ ...current, theme: event.target.value as WidgetTheme }))}><option value="auto">Automatic</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <label>Default direction<select value={draft.pair} onChange={event => setDraft(current => ({ ...current, pair: event.target.value }))}>{PAIRS.map(pair => <option key={`${pair.source}:${pair.target}`} value={`${pair.source}:${pair.target}`}>{pair.label}</option>)}</select></label>
      <label className="checkbox-label"><input type="checkbox" checked={draft.active} onChange={event => setDraft(current => ({ ...current, active: event.target.checked }))} />Widget enabled</label>
      <label className="checkbox-label"><input type="checkbox" checked={draft.show_branding} disabled={!brandingRemovable} onChange={event => setDraft(current => ({ ...current, show_branding: event.target.checked }))} />Show Tun branding{!brandingRemovable && " (required by plan)"}</label>
    </div>
    <div className="button-row"><button className="primary-button" disabled={!!busy} onClick={() => void run("update")}>{busy === "update" ? "Saving…" : "Save changes"}</button><button disabled={!!busy} onClick={() => void run("set_active")}>{site.active ? "Disable" : "Enable"}</button><button disabled={!!busy} onClick={() => void run("rotate")}>Rotate key</button><button className="danger-button" disabled={!!busy} onClick={() => void run("delete")}>Delete</button></div>
    <div className="embed-code-block"><div className="card-heading"><div><h3>Embed code</h3><p>Replace the previous code after rotating the key.</p></div><button onClick={() => void copyCode()}>Copy code</button></div><pre>{code}</pre></div>
  </article>;
}

export default function WidgetDashboardPage() {
  const { plan: authPlan } = useAuth();
  const [effectivePlan, setEffectivePlan] = useState<EffectivePlan | null>(null);
  const [sites, setSites] = useState<WidgetSite[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Draft>({ name: "Website translator", allowed_domain: "", active: true, theme: "auto", pair: "en:hyw", show_branding: true });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadWidgetDashboard();
      setEffectivePlan(data.effective_plan || null);
      setSites(data.sites || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load widgets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createWidget() {
    setCreating(true);
    setMessage("");
    try {
      const [sourceLanguage, targetLanguage] = form.pair.split(":") as ["en" | "hyw" | "hye", "en" | "hyw" | "hye"];
      await mutateWidget({ action: "create", name: form.name, allowedDomain: form.allowed_domain, active: form.active, theme: form.theme, sourceLanguage, targetLanguage, showBranding: plan?.widget_branding_removable ? form.show_branding : true });
      setForm({ name: "Website translator", allowed_domain: "", active: true, theme: "auto", pair: "en:hyw", show_branding: true });
      setMessage("Widget created. Copy its embed code to the registered website.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the widget.");
    } finally {
      setCreating(false);
    }
  }

  const plan = effectivePlan || authPlan;
  const remaining = Math.max(0, Number(plan?.widget_site_limit || 0) - sites.length);
  return <ProtectedRoute><DashboardShell title="Website translator widget" description="Create secure, domain-locked translator installations for your websites.">
    {message && <div className="info-banner">{message}</div>}
    <section className="dashboard-card">
      <div className="card-heading"><div><h2>Widget access</h2><p>Access follows your effective application plan, including active manual grants.</p></div><span className={`status-chip ${plan?.widget_enabled ? "approved" : "pending"}`}>{plan?.widget_enabled ? "Included" : "Not included"}</span></div>
      <div className="stats-grid compact-stats"><div className="stat-card"><span>Effective plan</span><strong>{plan?.name || "Free"}</strong><small>Source: {plan?.source || "default"}</small></div><div className="stat-card"><span>Site allowance</span><strong>{plan?.widget_site_limit || 0}</strong></div><div className="stat-card"><span>Remaining installations</span><strong>{remaining}</strong></div></div>
      {!plan?.widget_enabled && <p>This plan does not currently include website widgets. <Link href="/pricing">Compare plans</Link>.</p>}
    </section>

    {plan?.widget_enabled && remaining > 0 && <section className="dashboard-card">
      <div className="card-heading"><div><h2>Create a widget installation</h2><p>Register the exact host, including a port for localhost testing.</p></div></div>
      <div className="settings-grid">
        <label>Website / widget name<input value={form.name} maxLength={100} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></label>
        <label>Allowed domain<input value={form.allowed_domain} placeholder="www.example.com or localhost:8080" onChange={event => setForm(current => ({ ...current, allowed_domain: event.target.value }))} /></label>
        <label>Theme<select value={form.theme} onChange={event => setForm(current => ({ ...current, theme: event.target.value as WidgetTheme }))}><option value="auto">Automatic</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <label>Default direction<select value={form.pair} onChange={event => setForm(current => ({ ...current, pair: event.target.value }))}>{PAIRS.map(pair => <option key={`${pair.source}:${pair.target}`} value={`${pair.source}:${pair.target}`}>{pair.label}</option>)}</select></label>
        {plan.widget_branding_removable && <label className="checkbox-label"><input type="checkbox" checked={form.show_branding} onChange={event => setForm(current => ({ ...current, show_branding: event.target.checked }))} />Show Tun branding</label>}
      </div>
      <button className="primary-button" disabled={creating || !form.name.trim() || !form.allowed_domain.trim()} onClick={() => void createWidget()}>{creating ? "Creating…" : "Create widget"}</button>
    </section>}

    {loading ? <div className="page-state"><span className="spinner" /> Loading widgets…</div> : sites.length ? sites.map(site => <WidgetCard key={site.id} site={site} brandingRemovable={Boolean(plan?.widget_branding_removable)} onChanged={load} setMessage={setMessage} />) : <div className="empty-state">No widget installations have been created.</div>}
  </DashboardShell></ProtectedRoute>;
}
