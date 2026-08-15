"use client";

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { EffectivePlan, Profile } from "@/types/database";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  plan: EffectivePlan | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function parseEffectivePlan(value: unknown): EffectivePlan | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const plan = row as Record<string, unknown>;
  const slug = plan.slug === "premium" || plan.slug === "business" || plan.slug === "admin" || plan.slug === "anonymous" ? plan.slug : "free";
  const source = plan.source === "manual" || plan.source === "stripe" || plan.source === "admin" || plan.source === "anonymous" ? plan.source : "default";
  return {
    id: typeof plan.id === "string" ? plan.id : null,
    slug,
    name: typeof plan.name === "string" ? plan.name : slug === "admin" ? "Administrator" : "Free",
    source,
    monthly_character_limit: Number(plan.monthly_character_limit || 20_000),
    max_characters_per_request: Number(plan.max_characters_per_request || 1_500),
    history_limit: plan.history_limit === null ? null : Number(plan.history_limit || 20),
    rate_limit_per_minute: Number(plan.rate_limit_per_minute || 20),
    widget_enabled: plan.widget_enabled === true,
    widget_site_limit: Number(plan.widget_site_limit || 0),
    widget_monthly_character_limit: plan.widget_monthly_character_limit == null ? null : Number(plan.widget_monthly_character_limit),
    widget_branding_removable: plan.widget_branding_removable === true,
    override_expires_at: typeof plan.override_expires_at === "string" ? plan.override_expires_at : null,
    stripe_status: typeof plan.stripe_status === "string" ? plan.stripe_status : null,
    stripe_subscription_id: typeof plan.stripe_subscription_id === "string" ? plan.stripe_subscription_id : null,
    stripe_customer_id: typeof plan.stripe_customer_id === "string" ? plan.stripe_customer_id : null
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [plan, setPlan] = useState<EffectivePlan | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (user: User | null) => {
    if (!user) {
      setProfile(null);
      setPlan(null);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const [{ data: profileRow, error: profileError }, { data: effectiveRow, error: effectiveError }] = await Promise.all([
      supabase.from("profiles").select("id,email,display_name,country_code,role,history_enabled,query_review_consent,current_plan_id,last_active_at,created_at,updated_at").eq("id", user.id).maybeSingle(),
      supabase.rpc("get_my_effective_plan")
    ]);

    if (profileError || effectiveError) {
      setProfile(profileRow ? profileRow as Profile : null);
      setPlan(null);
      return;
    }
    setProfile(profileRow as Profile);
    setPlan(parseEffectivePlan(effectiveRow));
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadProfile(session?.user ?? null);
  }, [loadProfile, session]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let active = true;

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user ?? null);
      if (active) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void loadProfile(nextSession?.user ?? null).finally(() => setLoading(false));
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setPlan(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    profile,
    plan,
    loading,
    refreshProfile,
    signOut
  }), [loading, plan, profile, refreshProfile, session, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
