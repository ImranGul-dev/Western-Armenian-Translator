import type { EffectivePlan, Plan, PlanSlug, ProfileRole } from "@/types/database";

export interface PublicTranslationSettings {
  anonymous: { monthly_character_limit: number; max_characters_per_request: number; rate_limit_per_minute: number };
  free_plan: { monthly_character_limit: number; max_characters_per_request: number; rate_limit_per_minute: number };
}

export const FALLBACK_PUBLIC_TRANSLATION_SETTINGS: PublicTranslationSettings = {
  anonymous: { monthly_character_limit: 20_000, max_characters_per_request: 1_500, rate_limit_per_minute: 10 },
  free_plan: { monthly_character_limit: 20_000, max_characters_per_request: 1_500, rate_limit_per_minute: 20 }
};

export const FALLBACK_PLANS: Record<PlanSlug, Omit<Plan, "id">> = {
  free: {
    slug: "free", name: "Free", price_monthly_cents: 0, monthly_character_limit: 20_000,
    max_characters_per_request: 1_500, history_limit: 20, rate_limit_per_minute: 20,
    features: ["20,000 characters per month", "1,500 characters per request", "Last 20 translations", "Tun branding"],
    active: true, sort_order: 1, currency: "usd", billing_interval: "month",
    widget_enabled: false, widget_site_limit: 0, widget_monthly_character_limit: null, widget_branding_removable: false
  },
  premium: {
    slug: "premium", name: "Person", price_monthly_cents: 900, monthly_character_limit: 300_000,
    max_characters_per_request: 5_000, history_limit: null, rate_limit_per_minute: 60,
    features: ["300,000 characters per month", "5,000 characters per request", "Full history", "Saved favourites", "One embeddable translator site", "Priority processing"],
    active: true, sort_order: 2, currency: "usd", billing_interval: "month",
    widget_enabled: true, widget_site_limit: 1, widget_monthly_character_limit: null, widget_branding_removable: false
  },
  business: {
    slug: "business", name: "Schools", price_monthly_cents: 2_900, monthly_character_limit: 1_500_000,
    max_characters_per_request: 10_000, history_limit: null, rate_limit_per_minute: 120,
    features: ["1,500,000 characters per month", "10,000 characters per request", "Full history", "Usage dashboard", "Five embeddable translator sites", "Optional widget branding"],
    active: true, sort_order: 3, currency: "usd", billing_interval: "month",
    widget_enabled: true, widget_site_limit: 5, widget_monthly_character_limit: null, widget_branding_removable: true
  }
};

export function maxCharactersFor(plan: Plan | EffectivePlan | null | undefined, role?: ProfileRole | null, anonymousMax = 1_500): number {
  if (role === "admin") return 10_000;
  if (plan?.max_characters_per_request && Number.isFinite(plan.max_characters_per_request)) return plan.max_characters_per_request;
  return anonymousMax;
}
