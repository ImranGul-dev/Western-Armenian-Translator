"use client";

import { AdminKnowledgeManager } from "@/components/AdminKnowledgeManager";
import { DashboardShell } from "@/components/DashboardShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export default function Page() {
  return (
    <ProtectedRoute roles={["language_editor", "admin"]}>
      <DashboardShell
        admin
        title="Examples"
        description="Manage approved source and translation pairs that can guide the translator toward verified wording, phrasing and style."
      >
        <AdminKnowledgeManager kind="examples" />
      </DashboardShell>
    </ProtectedRoute>
  );
}