"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { mutateWidget } from "@/lib/widget-api";
import type { WidgetSite } from "@/types/database";

export default function AdminWidgetsPage() {
  const [rows, setRows] = useState<WidgetSite[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await getSupabaseBrowserClient().rpc("admin_widget_sites");
    if (error) setMessage(error.message);
    else setRows((data as WidgetSite[]) || []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => rows.filter(row => {
    const needle = search.trim().toLowerCase();
    const matchesText = !needle || [row.name, row.allowed_domain, row.owner?.email || "", row.owner?.display_name || ""].some(value => value.toLowerCase().includes(needle));
    const matchesStatus = status === "all" || (status === "active" ? row.active && !row.deleted_at : status === "disabled" ? !row.active && !row.deleted_at : Boolean(row.deleted_at));
    return matchesText && matchesStatus;
  }), [rows, search, status]);

  async function action(row: WidgetSite, type: "rotate" | "delete" | "set_active") {
    if (type === "rotate" && !window.confirm(`Rotate the key for ${row.name}? The existing embed code will stop working.`)) return;
    if (type === "delete" && !window.confirm(`Delete ${row.name}? Its current key will stop working immediately.`)) return;
    setBusy(row.id);
    setMessage("");
    try {
      await mutateWidget({ action: type, widgetId: row.id, active: type === "set_active" ? !row.active : null });
      setMessage(type === "rotate" ? "Widget key rotated." : type === "delete" ? "Widget deleted." : `Widget ${row.active ? "disabled" : "enabled"}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Widget action failed.");
    } finally {
      setBusy(null);
    }
  }

  return <ProtectedRoute roles={["admin"]}><DashboardShell admin title="Widget installations" description="Search, inspect and secure every customer website translator installation.">
    {message && <div className="info-banner">{message}</div>}
    <section className="dashboard-card">
      <div className="card-heading"><div><h2>All widgets</h2><p>{visible.length} matching installations.</p></div><div className="table-actions"><input placeholder="Search user, widget or domain" value={search} onChange={event => setSearch(event.target.value)} /><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="disabled">Disabled</option><option value="deleted">Deleted</option></select><button onClick={() => void load()}>Refresh</button></div></div>
      <div className="admin-table-wrap"><table className="admin-table widget-admin-table"><thead><tr><th>Widget / owner</th><th>Domain</th><th>Effective plan</th><th>Monthly usage</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visible.map(row => <tr key={row.id}>
        <td><strong>{row.name}</strong><small>{row.owner?.display_name || "Unnamed user"}</small><small>{row.owner?.email || row.owner?.id}</small></td>
        <td><strong>{row.allowed_domain}</strong><small>Last used: {row.last_used_at ? new Date(row.last_used_at).toLocaleString() : "Never"}</small></td>
        <td><strong>{row.effective_plan?.name || "Free"}</strong><small>Source: {row.effective_plan?.source || "default"}</small><small>Sites allowed: {row.effective_plan?.widget_site_limit || 0}</small></td>
        <td><strong>{Number(row.monthly_translations || 0).toLocaleString()} translations</strong><small>{Number(row.monthly_characters || 0).toLocaleString()} characters</small><small>{Number(row.blocked_requests || 0).toLocaleString()} blocked / failed</small></td>
        <td><span className={`status-chip ${row.active && !row.deleted_at ? "approved" : "pending"}`}>{row.deleted_at ? "Deleted" : row.active ? "Enabled" : "Disabled"}</span></td>
        <td><div className="table-actions vertical-actions">{row.owner?.email && <Link href={`/admin/users?search=${encodeURIComponent(row.owner.email)}`}>Open user</Link>}{!row.deleted_at && <><button disabled={busy === row.id} onClick={() => void action(row, "set_active")}>{row.active ? "Disable" : "Enable"}</button><button disabled={busy === row.id} onClick={() => void action(row, "rotate")}>Rotate key</button><button className="danger-button" disabled={busy === row.id} onClick={() => void action(row, "delete")}>Delete</button></>}</div></td>
      </tr>)}</tbody></table></div>
      {!visible.length && <div className="empty-state">No widget installations match the current filters.</div>}
    </section>
  </DashboardShell></ProtectedRoute>;
}
