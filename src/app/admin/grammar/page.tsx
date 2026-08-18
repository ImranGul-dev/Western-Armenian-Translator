"use client";

import { AdminGrammarTooltipManager } from "@/components/AdminGrammarTooltipManager";
import { AdminKnowledgeManager } from "@/components/AdminKnowledgeManager";
import { DashboardShell } from "@/components/DashboardShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export default function Page() {
  return (
    <ProtectedRoute roles={["language_editor", "admin"]}>
      <DashboardShell
        admin
        title="Grammar"
        description="Manage Western Armenian grammar guidance that can help the translator use the correct structure, forms and language conventions."
      >
        <AdminKnowledgeManager kind="grammar" />
        <AdminGrammarTooltipManager />
      </DashboardShell>
    </ProtectedRoute>
  );
}
