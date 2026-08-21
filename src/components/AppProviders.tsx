"use client";

import type { ReactNode } from "react";

import { AuthProvider } from "@/contexts/AuthContext";
import {
  SystemFeatureToggleProvider,
} from "@/contexts/SystemFeatureToggleContext";
import {
  SystemFeatureRouteGate,
} from "@/components/SystemFeatureRouteGate";
import {
  RolePlayVoiceFeedbackOffer,
} from "@/components/RolePlayVoiceFeedbackOffer";

export function AppProviders({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AuthProvider>
      <SystemFeatureToggleProvider>
        <SystemFeatureRouteGate>
          {children}
          <RolePlayVoiceFeedbackOffer />
        </SystemFeatureRouteGate>
      </SystemFeatureToggleProvider>
    </AuthProvider>
  );
}
