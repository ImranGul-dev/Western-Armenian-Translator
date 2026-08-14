"use client";

import { AdminKnowledgeManager } from "@/components/AdminKnowledgeManager";
import { DashboardShell } from "@/components/DashboardShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export default function Page() {
  return (
    <ProtectedRoute roles={["language_editor", "admin"]}>
      <DashboardShell
        admin
        title="Glossary"
        description="Manage preferred terminology that can guide the translator toward consistent Western Armenian wording."
      >
        <AdminKnowledgeManager kind="glossary" />
      </DashboardShell>
    </ProtectedRoute>
  );
}