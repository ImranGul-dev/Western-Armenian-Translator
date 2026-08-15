"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { getCountryName } from "@/lib/countries";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { EffectivePlan, PlanSlug, ProfileRole, UserPlanOverride } from "@/types/database";

interface UserSubscriptionSummary {
  id: string;
  plan_slug: PlanSlug | null;
  status: string;
  access_suspended: boolean;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

interface UserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  country_code: string | null;
  role: ProfileRole;
  created_at: string;
  last_active_at: string | null;
  effective_plan: EffectivePlan;
  subscription: UserSubscriptionSummary | null;
  override: UserPlanOverride | null;
}

interface OverrideDraft {
  selection: "billing" | PlanSlug;
  expiresAt: string;
  reason: string;
}

function dateTimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function UserPlanControl({ row, onSaved, setMessage }: { row: UserRow; onSaved: () => Promise<void>; setMessage: (value: string) => void }) {
  const [draft, setDraft] = useState<OverrideDraft>({
    selection: row.override?.plan_slug || "billing",
    expiresAt: dateTimeLocal(row.override?.expires_at),
    reason: row.override?.reason || ""
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setDraft({
      selection: row.override?.plan_slug || "billing",
      expiresAt: dateTimeLocal(row.override?.expires_at),
      reason: row.override?.reason || ""
    });
  }, [row.override?.expires_at, row.override?.plan_slug, row.override?.reason]);
  const stripeCharging = Boolean(row.subscription && ["active", "trialing", "past_due"].includes(row.subscription.status) && !row.subscription.access_suspended);

  async function save() {
    const removing = draft.selection === "billing";
    const warning = draft.selection === "free" && stripeCharging
      ? "Stripe may still be charging this user. A manual Free override changes application access only and does not cancel billing. Continue?"
      : removing
        ? "Remove the manual override and return this user to Stripe/default plan resolution?"
        : `Grant the ${draft.selection} application plan${draft.expiresAt ? " until the selected expiration" : " without an expiration"}?`;
    if (!window.confirm(warning)) return;

    setBusy(true);
    setMessage("");
    const expiresAt = draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null;
    const { error } = await getSupabaseBrowserClient().rpc("admin_set_user_plan_override", {
      p_user_id: row.id,
      p_plan_slug: draft.selection,
      p_expires_at: expiresAt,
      p_reason: draft.reason.trim() || null
    });
    setBusy(false);
    if (error) setMessage(error.message);
    else {
      setMessage(removing ? "Manual override removed. Billing/default plan resolution is active." : `Manual ${draft.selection} plan saved.`);
      await onSaved();
    }
  }

  return <div className="manual-plan-control">
    <select aria-label={`Manual plan for ${row.email || row.id}`} value={draft.selection} onChange={event => setDraft(current => ({ ...current, selection: event.target.value as OverrideDraft["selection"] }))}>
      <option value="billing">Use billing/default</option><option value="free">Free</option><option value="premium">Person</option><option value="business">Schools</option>
    </select>
    <input type="datetime-local" aria-label="Override expiration" value={draft.expiresAt} onChange={event => setDraft(current => ({ ...current, expiresAt: event.target.value }))} />
    <input aria-label="Internal reason" placeholder="Internal reason / note" maxLength={1000} value={draft.reason} onChange={event => setDraft(current => ({ ...current, reason: event.target.value }))} />
    {draft.selection === "free" && stripeCharging && <small className="warning-text">This does not cancel the active Stripe subscription.</small>}
    <button className="primary-button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save plan control"}</button>
  </div>;
}

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [subscriberFilter, setSubscriberFilter] = useState("all");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await getSupabaseBrowserClient().rpc("admin_users_with_effective_plans");
    if (error) setMessage(error.message);
    else setRows((data as UserRow[]) || []);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const initial = new URLSearchParams(window.location.search).get("search");
      if (initial) setSearch(initial);
    }
    void load();
  }, [load]);

  const visible = useMemo(() => rows.filter(row => {
    const needle = search.trim().toLocaleLowerCase();
    const paid = row.effective_plan.source === "stripe";
    const manual = row.effective_plan.source === "manual";
    const matchesSubscriber = subscriberFilter === "all" || (subscriberFilter === "paid" ? paid : subscriberFilter === "manual" ? manual : row.effective_plan.slug === "free");
    const countryName = getCountryName(row.country_code).toLocaleLowerCase();

    return matchesSubscriber && (
      !needle ||
      row.id.includes(needle) ||
      row.email?.toLocaleLowerCase().includes(needle) ||
      row.display_name?.toLocaleLowerCase().includes(needle) ||
      row.country_code?.toLocaleLowerCase().includes(needle) ||
      countryName.includes(needle)
    );
  }), [rows, search, subscriberFilter]);

  async function updateRole(id: string, role: ProfileRole) {
    if (!window.confirm(`Change this account role to ${role.replace("_", " ")}?`)) return;
    const { error } = await getSupabaseBrowserClient().from("profiles").update({ role }).eq("id", id);
    setMessage(error?.message || "Role updated.");
    if (!error) await load();
  }

  return <ProtectedRoute roles={["admin"]}><DashboardShell admin title="Users and plan access" description="Review Stripe state, effective application plans, manual grants, activity and roles without creating fake billing records.">
    {message && <div className="info-banner">{message}</div>}
    <section className="dashboard-card">
      <div className="card-heading"><div><h2>User directory</h2><p>{visible.length} matching users.</p></div><div className="table-actions"><input placeholder="Search name, email, country or user ID" value={search} onChange={event => setSearch(event.target.value)} /><select value={subscriberFilter} onChange={event => setSubscriberFilter(event.target.value)}><option value="all">All users</option><option value="paid">Stripe plan</option><option value="manual">Manual plan</option><option value="free">Effective Free</option></select><button onClick={() => void load()}>Refresh</button></div></div>
      <div className="admin-table-wrap"><table className="admin-table users-plan-table"><thead><tr><th>User</th><th>Country</th><th>Activity</th><th>Stripe subscription</th><th>Effective plan</th><th>Manual plan control</th><th>Role</th></tr></thead><tbody>{visible.map(row => <tr key={row.id}>
        <td><strong>{row.display_name || "Unnamed user"}</strong><small>{row.email || row.id}</small></td>
        <td>
          <strong>{getCountryName(row.country_code)}</strong>
          {row.country_code && <small>{row.country_code}</small>}
        </td>
        <td><small>Joined: {new Date(row.created_at).toLocaleDateString()}</small><small>Last active: {row.last_active_at ? new Date(row.last_active_at).toLocaleString() : "Never"}</small></td>
        <td><strong>{row.subscription?.plan_slug || "None"}</strong><span className="status-pill">{row.subscription?.access_suspended ? "paused" : row.subscription?.status || "none"}</span>{row.subscription?.cancel_at_period_end && <small>Cancels at period end</small>}</td>
        <td><strong>{row.effective_plan.name}</strong><small>Source: {row.effective_plan.source}</small>{row.override && <small>Override record: {row.override.plan_slug}{row.override.expires_at ? ` · ${new Date(row.override.expires_at).getTime() <= Date.now() ? "expired" : "expires"} ${new Date(row.override.expires_at).toLocaleString()}` : " · no expiration"}</small>}<small>Widget: {row.effective_plan.widget_enabled ? `Eligible (${row.effective_plan.widget_site_limit} sites)` : "Not eligible"}</small></td>
        <td>{row.role === "admin" ? <small>Administrator limits take priority over billing and manual overrides.</small> : <UserPlanControl row={row} onSaved={load} setMessage={setMessage} />}</td>
        <td><select value={row.role} onChange={event => void updateRole(row.id, event.target.value as ProfileRole)}><option value="user">User</option><option value="language_editor">Language editor</option><option value="admin">Admin</option></select></td>
      </tr>)}</tbody></table></div>
      {!visible.length && <div className="empty-state">No users match these filters.</div>}
    </section>
  </DashboardShell></ProtectedRoute>;
}
