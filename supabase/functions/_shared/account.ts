import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AccountContext, PlanConfig, RateLimitResult } from "./types.ts";
import { sha256Hex } from "./security.ts";

const FALLBACK_FREE: PlanConfig = {
  id: null,
  slug: "free",
  name: "Free",
  source: "default",
  monthlyCharacterLimit: 20_000,
  maxCharactersPerRequest: 1_500,
  historyLimit: 20,
  rateLimitPerMinute: 20,
  widgetEnabled: false,
  widgetSiteLimit: 0,
  widgetMonthlyCharacterLimit: null,
  widgetBrandingRemovable: false,
  overrideExpiresAt: null,
  billingProvider: null,
  subscriptionStatus: null,
  stripeStatus: null,
  stripeSubscriptionId: null,
  stripeCustomerId: null,
  woocommerceSubscriptionId: null,
  woocommerceCustomerId: null,
};

const FALLBACK_ANONYMOUS: PlanConfig = {
  ...FALLBACK_FREE,
  slug: "anonymous",
  name: "Anonymous",
  source: "anonymous",
  historyLimit: 0,
  rateLimitPerMinute: 10,
};

let anonymousPlanCache: { value: PlanConfig; expiresAt: number } | null = null;
const ANONYMOUS_PLAN_CACHE_MS = 30_000;

function numberValue(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function planFromEffective(value: unknown): PlanConfig {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || typeof raw !== "object") return FALLBACK_FREE;

  const plan = raw as Record<string, unknown>;
  const slug = plan.slug === "premium" || plan.slug === "business" || plan.slug === "admin" || plan.slug === "anonymous"
    ? plan.slug
    : "free";
  const source = plan.source === "manual" || plan.source === "stripe" || plan.source === "woocommerce" || plan.source === "admin" || plan.source === "anonymous"
    ? plan.source
    : "default";
  const billingProvider = plan.billing_provider === "stripe" || plan.billing_provider === "woocommerce"
    ? plan.billing_provider
    : null;

  return {
    id: typeof plan.id === "string" ? plan.id : null,
    slug,
    name: typeof plan.name === "string" ? plan.name : slug === "admin" ? "Administrator" : slug === "anonymous" ? "Anonymous" : "Free",
    source,
    monthlyCharacterLimit: numberValue(plan.monthly_character_limit, FALLBACK_FREE.monthlyCharacterLimit),
    maxCharactersPerRequest: numberValue(plan.max_characters_per_request, FALLBACK_FREE.maxCharactersPerRequest),
    historyLimit: nullableNumber(plan.history_limit),
    rateLimitPerMinute: numberValue(plan.rate_limit_per_minute, slug === "anonymous" ? FALLBACK_ANONYMOUS.rateLimitPerMinute : FALLBACK_FREE.rateLimitPerMinute),
    widgetEnabled: plan.widget_enabled === true,
    widgetSiteLimit: numberValue(plan.widget_site_limit, 0),
    widgetMonthlyCharacterLimit: nullableNumber(plan.widget_monthly_character_limit),
    widgetBrandingRemovable: plan.widget_branding_removable === true,
    overrideExpiresAt: typeof plan.override_expires_at === "string" ? plan.override_expires_at : null,
    billingProvider,
    subscriptionStatus: typeof plan.subscription_status === "string" ? plan.subscription_status : null,
    stripeStatus: typeof plan.stripe_status === "string" ? plan.stripe_status : null,
    stripeSubscriptionId: typeof plan.stripe_subscription_id === "string" ? plan.stripe_subscription_id : null,
    stripeCustomerId: typeof plan.stripe_customer_id === "string" ? plan.stripe_customer_id : null,
    woocommerceSubscriptionId: nullableNumber(plan.woocommerce_subscription_id),
    woocommerceCustomerId: nullableNumber(plan.woocommerce_customer_id),
  };
}

function anonymousFromSettings(freePlan: PlanConfig, value: unknown): PlanConfig {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  return {
    ...freePlan,
    slug: "anonymous",
    name: "Anonymous",
    source: "anonymous",
    monthlyCharacterLimit: numberValue(raw.monthly_character_limit, freePlan.monthlyCharacterLimit),
    maxCharactersPerRequest: numberValue(raw.max_characters_per_request, freePlan.maxCharactersPerRequest),
    historyLimit: 0,
    rateLimitPerMinute: numberValue(raw.rate_limit_per_minute, FALLBACK_ANONYMOUS.rateLimitPerMinute),
    widgetEnabled: false,
    widgetSiteLimit: 0,
  };
}

async function authenticatedUserId(admin: SupabaseClient, request: Request): Promise<string | null> {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const jwt = match[1];

  // Newer supabase-js versions can verify asymmetric JWTs from cached JWKS,
  // avoiding an Auth-server round trip. Keep getUser() as a compatibility and
  // legacy-HS256 fallback for this project's pinned SDK/runtime.
  const authWithClaims = admin.auth as unknown as {
    getClaims?: (token?: string) => Promise<{
      data?: { claims?: Record<string, unknown> } | null;
      error?: unknown;
    }>;
  };

  if (typeof authWithClaims.getClaims === "function") {
    try {
      const { data, error } = await authWithClaims.getClaims(jwt);
      const sub = data?.claims?.sub;
      if (!error && typeof sub === "string" && sub) return sub;
    } catch {
      // Fall through to the authoritative Auth API check.
    }
  }

  const { data, error } = await admin.auth.getUser(jwt);
  return error ? null : data.user?.id ?? null;
}

async function anonymousPlan(admin: SupabaseClient): Promise<PlanConfig> {
  if (anonymousPlanCache && anonymousPlanCache.expiresAt > Date.now()) {
    return anonymousPlanCache.value;
  }

  // Fast path installed by the speed migration: one Postgres RPC instead of
  // two separate REST queries.
  const rpc = await admin.rpc("anonymous_translation_plan");
  if (!rpc.error && rpc.data && typeof rpc.data === "object" && !Array.isArray(rpc.data)) {
    const value = planFromEffective(rpc.data);
    anonymousPlanCache = { value, expiresAt: Date.now() + ANONYMOUS_PLAN_CACHE_MS };
    return value;
  }

  // Backward-compatible fallback if the Edge Function is deployed before the
  // database migration.
  const [{ data: freeRow }, { data: settingRow }] = await Promise.all([
    admin
      .from("plans")
      .select("id,slug,name,monthly_character_limit,max_characters_per_request,history_limit,rate_limit_per_minute,widget_enabled,widget_site_limit,widget_monthly_character_limit,widget_branding_removable")
      .eq("slug", "free")
      .maybeSingle(),
    admin
      .from("platform_settings")
      .select("value")
      .eq("key", "anonymous_usage")
      .maybeSingle(),
  ]);

  const value = anonymousFromSettings(planFromEffective(freeRow), settingRow?.value);
  anonymousPlanCache = { value, expiresAt: Date.now() + ANONYMOUS_PLAN_CACHE_MS };
  return value;
}

export async function resolveEffectivePlan(admin: SupabaseClient, userId: string): Promise<PlanConfig> {
  const { data, error } = await admin.rpc("effective_plan_for_user", { p_user_id: userId });
  return error ? FALLBACK_FREE : planFromEffective(data);
}

export async function resolveAccount(
  admin: SupabaseClient,
  request: Request,
  anonymousHash: string,
): Promise<AccountContext> {
  const userId = await authenticatedUserId(admin, request);

  if (!userId) {
    return {
      userId: null,
      role: "anonymous",
      historyEnabled: false,
      queryReviewConsent: false,
      identityKey: `anon:${anonymousHash}`,
      plan: await anonymousPlan(admin),
    };
  }

  // Fast path: profile flags + effective plan in one database request.
  const snapshot = await admin.rpc("translation_account_for_user", { p_user_id: userId });
  if (!snapshot.error && snapshot.data && typeof snapshot.data === "object" && !Array.isArray(snapshot.data)) {
    const row = snapshot.data as Record<string, unknown>;
    const role = row.role === "admin" ? "admin" : row.role === "language_editor" ? "language_editor" : "user";
    return {
      userId,
      role,
      historyEnabled: row.history_enabled !== false,
      queryReviewConsent: row.query_review_consent === true,
      identityKey: `user:${userId}`,
      plan: planFromEffective(row.plan),
    };
  }

  // Backward-compatible fallback for deployments where the migration has not
  // yet been applied.
  const [profileResult, effectivePlan] = await Promise.all([
    admin
      .from("profiles")
      .select("role,history_enabled,query_review_consent")
      .eq("id", userId)
      .maybeSingle(),
    resolveEffectivePlan(admin, userId),
  ]);

  const row = (profileResult.data || {}) as Record<string, unknown>;
  const role = row.role === "admin" ? "admin" : row.role === "language_editor" ? "language_editor" : "user";

  return {
    userId,
    role,
    historyEnabled: row.history_enabled !== false,
    queryReviewConsent: row.query_review_consent === true,
    identityKey: `user:${userId}`,
    plan: effectivePlan,
  };
}


export interface PreparedAccountRequest {
  account: AccountContext;
  requestAllowed: boolean;
  charactersUsed: number;
  monthlyAllowed: boolean;
  rate: RateLimitResult;
}

/**
 * Preferred translation request path. After local/cached JWT verification it
 * resolves the effective account, monthly quota and rate limit in one Postgres
 * RPC. Returning null keeps deployment order backward compatible.
 */
export async function resolvePreparedAccount(
  admin: SupabaseClient,
  request: Request,
  anonymousHash: string,
  rateLimitSalt: string,
  characters: number,
): Promise<PreparedAccountRequest | null> {
  const userId = await authenticatedUserId(admin, request);
  const identityKey = userId ? `user:${userId}` : `anon:${anonymousHash}`;
  const rateIdentifier = userId
    ? await sha256Hex(`${rateLimitSalt}|${identityKey}`)
    : anonymousHash;

  const { data, error } = await admin.rpc("prepare_translation_account", {
    p_user_id: userId,
    p_anonymous_identity_key: userId ? null : identityKey,
    p_character_count: characters,
    p_rate_identifier_hash: rateIdentifier,
  });

  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  const plan = planFromEffective(row.plan);
  const role = row.role === "admin"
    ? "admin"
    : row.role === "language_editor"
      ? "language_editor"
      : userId
        ? "user"
        : "anonymous";

  const resetAt = typeof row.rate_reset_at === "string"
    ? row.rate_reset_at
    : new Date(Date.now() + 60_000).toISOString();

  return {
    account: {
      userId,
      role,
      historyEnabled: userId ? row.history_enabled !== false : false,
      queryReviewConsent: userId ? row.query_review_consent === true : false,
      identityKey,
      plan,
    },
    requestAllowed: row.request_allowed !== false,
    charactersUsed: Number(row.characters_used || 0),
    monthlyAllowed: row.monthly_allowed === true,
    rate: {
      allowed: row.rate_allowed === true,
      remaining: Number(row.rate_remaining || 0),
      resetAt,
    },
  };
}

export async function currentCharacters(admin: SupabaseClient, identityKey: string): Promise<number> {
  const month = `${new Date().toISOString().slice(0, 7)}-01`;
  const { data, error } = await admin
    .from("monthly_usage")
    .select("character_count")
    .eq("identity_key", identityKey)
    .eq("month", month)
    .maybeSingle();

  if (error) throw new Error("USAGE_UNAVAILABLE");
  return Number((data as { character_count?: number } | null)?.character_count || 0);
}
