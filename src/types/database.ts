export type ProfileRole = "user" | "language_editor" | "admin";
export type PlanSlug = "free" | "premium" | "business";
export type EffectivePlanSlug = PlanSlug | "admin" | "anonymous";
export type PlanSource = "anonymous" | "default" | "stripe" | "manual" | "admin";
export type WidgetTheme = "light" | "dark" | "auto";

export interface Plan {
  id: string;
  slug: PlanSlug;
  name: string;
  price_monthly_cents: number;
  monthly_character_limit: number;
  max_characters_per_request: number;
  history_limit: number | null;
  rate_limit_per_minute: number;
  features: string[];
  active: boolean;
  sort_order: number;
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
  currency?: string;
  billing_interval?: string;
  widget_enabled: boolean;
  widget_site_limit: number;
  widget_monthly_character_limit: number | null;
  widget_branding_removable: boolean;
}

export interface EffectivePlan {
  id: string | null;
  slug: EffectivePlanSlug;
  name: string;
  source: PlanSource;
  monthly_character_limit: number;
  max_characters_per_request: number;
  history_limit: number | null;
  rate_limit_per_minute: number;
  widget_enabled: boolean;
  widget_site_limit: number;
  widget_monthly_character_limit: number | null;
  widget_branding_removable: boolean;
  override_expires_at: string | null;
  stripe_status: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
}

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  country_code: string | null;
  role: ProfileRole;
  history_enabled: boolean;
  query_review_consent: boolean;
  current_plan_id: string | null;
  last_active_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string | null;
  plan_slug: PlanSlug | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  status: string;
  amount_cents: number | null;
  currency: string | null;
  billing_interval: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  next_payment_at: string | null;
  last_payment_at: string | null;
  cancel_at_period_end: boolean;
  pause_collection_behavior: string | null;
  pause_resumes_at: string | null;
  access_suspended: boolean;
  access_suspended_reason: string | null;
  created_at: string;
  updated_at: string;
  profiles?: Pick<Profile, "email" | "display_name"> | Pick<Profile, "email" | "display_name">[] | null;
  plans?: Pick<Plan, "name" | "slug"> | Pick<Plan, "name" | "slug">[] | null;
}

export interface BillingPayment {
  id: string;
  user_id: string | null;
  subscription_id: string | null;
  stripe_invoice_id: string;
  invoice_number: string | null;
  status: string;
  billing_reason: string | null;
  amount_due: number;
  amount_paid: number;
  amount_remaining: number;
  refunded_amount: number;
  currency: string;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  failure_message: string | null;
  period_start: string | null;
  period_end: string | null;
  paid_at: string | null;
  created_at: string;
  profiles?: Pick<Profile, "email" | "display_name"> | Pick<Profile, "email" | "display_name">[] | null;
}

export interface UserPlanOverride {
  id: string;
  user_id: string;
  plan_slug: PlanSlug;
  active: boolean;
  starts_at: string;
  expires_at: string | null;
  reason: string | null;
  assigned_by: string | null;
}

export interface WidgetSite {
  id: string;
  name: string;
  allowed_domain: string;
  public_key: string;
  active: boolean;
  theme: WidgetTheme;
  default_source_language: "en" | "hyw" | "hye";
  default_target_language: "en" | "hyw" | "hye";
  show_branding: boolean;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  monthly_translations: number;
  monthly_characters: number;
  blocked_requests?: number;
  owner?: { id: string; email: string | null; display_name: string | null };
  effective_plan?: EffectivePlan;
}

export interface UsageSummary {
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
  plan: EffectivePlanSlug;
}
