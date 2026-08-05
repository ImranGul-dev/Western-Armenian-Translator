"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";

interface QueryRow {
  id: string;
  user_id: string;
  request_id: string;
  source_language: string;
  target_language: string;
  source_text: string;
  translated_text: string;
  character_count: number;
  created_at: string;
}

export default function AdminQueriesPage() {
  const [rows, setRows] = useState<QueryRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Pick<Profile, "email" | "display_name">>>({});
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState("all");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const [{ data: queries, error }, { data: users }] = await Promise.all([
      supabase.from("translation_history")
        .select("id,user_id,request_id,source_language,target_language,source_text,translated_text,character_count,created_at")
        .eq("admin_visible", true)
        .order("created_at", { ascending: false })
        .limit(250),
      supabase.from("profiles").select("id,email,display_name")
    ]);
    if (error) setMessage(error.message);
    setRows((queries as QueryRow[]) || []);
    setProfiles(Object.fromEntries((users || []).map(user => [user.id, user])));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => rows.filter(row => {
    const matchesDirection = direction === "all" || `${row.source_language}-${row.target_language}` === direction;
    const needle = search.trim().toLocaleLowerCase();
    const person = profiles[row.user_id];
    const matchesSearch = !needle || [row.source_text, row.translated_text, person?.email, person?.display_name, row.request_id]
      .some(value => value?.toLocaleLowerCase().includes(needle));
    return matchesDirection && matchesSearch;
  }), [direction, profiles, rows, search]);

  return (
    <ProtectedRoute roles={["admin"]}>
      <DashboardShell admin title="Translation query review" description="Review saved translations that account holders have made available for quality improvement.">
        <div className="info-banner">Privacy rule: users control this through Account settings. Turning consent off prevents future history items from appearing in this view; existing visible entries can be removed by deleting history.</div>
        {message && <div className="info-banner">{message}</div>}
        <section className="dashboard-card">
          <div className="card-heading"><div><h2>Consented queries</h2><p>{visible.length} visible records from the most recent 250 consented translations.</p></div><div className="table-actions"><input aria-label="Search queries" placeholder="Search text, email or request ID" value={search} onChange={event => setSearch(event.target.value)} /><select value={direction} onChange={event => setDirection(event.target.value)}><option value="all">All directions</option><option value="en-hyw">English → Western Armenian</option><option value="hyw-en">Western Armenian → English</option><option value="hye-hyw">Eastern → Western Armenian</option><option value="hyw-hye">Western → Eastern Armenian</option></select><button onClick={() => void load()}>Refresh</button></div></div>
          <div className="query-review-list">{visible.map(row => {
            const person = profiles[row.user_id];
            return <article className="query-review-card" key={row.id}>
              <div className="card-heading"><div><strong>{row.source_language} → {row.target_language}</strong><small>{person?.display_name || person?.email || row.user_id}</small></div><div><small>{new Date(row.created_at).toLocaleString()}</small><small>{row.character_count.toLocaleString()} characters</small></div></div>
              <div className="query-columns"><div><span>Source query</span><p>{row.source_text}</p></div><div><span>Translation</span><p className="armenian-text">{row.translated_text}</p></div></div>
              <small>Request ID: {row.request_id}</small>
            </article>;
          })}</div>
          {!visible.length && <div className="empty-state">No consented translation queries match these filters.</div>}
        </section>
      </DashboardShell>
    </ProtectedRoute>
  );
}
