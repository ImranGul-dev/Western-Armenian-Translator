"use client";

import type { ReactNode } from "react";

import { AuthProvider } from "@/contexts/AuthContext";
import {
  SystemFeatureToggleProvider,
} from "@/contexts/SystemFeatureToggleContext";
import {
  SystemFeatureRouteGate,
} from "@/components/SystemFeatureRouteGate";

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
        </SystemFeatureRouteGate>
      </SystemFeatureToggleProvider>
    </AuthProvider>
  );
}
