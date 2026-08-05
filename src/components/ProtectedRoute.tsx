"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import type { ProfileRole } from "@/types/database";

export function ProtectedRoute({ children, roles }: { children: ReactNode; roles?: ProfileRole[] }) {
  const router = useRouter();
  const { user, profile, loading } = useAuth();

  const allowed = !roles || (profile && roles.includes(profile.role));

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (!allowed) router.replace("/dashboard");
  }, [allowed, loading, router, user]);

  if (loading) return <div className="page-state"><span className="spinner" /> Loading account…</div>;
  if (!user || !allowed) return <div className="page-state">Checking access…</div>;
  return <>{children}</>;
}
