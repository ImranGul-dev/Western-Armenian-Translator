"use client";

import type { ReactNode } from "react";

import { AuthProvider } from "@/contexts/AuthContext";
import {
  SystemFeatureToggleProvider,
} from "@/contexts/SystemFeatureToggleContext";

export function AppProviders({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AuthProvider>
      <SystemFeatureToggleProvider>
        {children}
      </SystemFeatureToggleProvider>
    </AuthProvider>
  );
}
