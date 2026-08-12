import type {
  SupabaseClient,
  User,
} from "@supabase/supabase-js";

import type {
  AccountContext,
  PlanConfig,
} from "./types.ts";

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
  stripeStatus: null,
  stripeSubscriptionId: null,
  stripeCustomerId: null,
};

const FALLBACK_ANONYMOUS: PlanConfig = {
  ...FALLBACK_FREE,
  slug: "anonymous",
  name: "Anonymous",
  source: "anonymous",
  historyLimit: 0,
  rateLimitPerMinute: 10,
};

function numberValue(
  value: unknown,
  fallback: number,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function nullableNumber(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

export function planFromEffective(
  value: unknown,
): PlanConfig {
  const raw = Array.isArray(value)
    ? value[0]
    : value;

  if (
    !raw ||
    typeof raw !== "object"
  ) {
    return FALLBACK_FREE;
  }

  const plan =
    raw as Record<string, unknown>;

  const slug =
    plan.slug === "premium" ||
    plan.slug === "business" ||
    plan.slug === "admin"
      ? plan.slug
      : "free";

  const source =
    plan.source === "manual" ||
    plan.source === "stripe" ||
    plan.source === "admin"
      ? plan.source
      : "default";

  return {
    id:
      typeof plan.id === "string"
        ? plan.id
        : null,

    slug,

    name:
      typeof plan.name === "string"
        ? plan.name
        : slug === "admin"
          ? "Administrator"
          : "Free",

    source,

    monthlyCharacterLimit: numberValue(
      plan.monthly_character_limit,
      FALLBACK_FREE.monthlyCharacterLimit,
    ),

    maxCharactersPerRequest: numberValue(
      plan.max_characters_per_request,
      FALLBACK_FREE.maxCharactersPerRequest,
    ),

    historyLimit: nullableNumber(
      plan.history_limit,
    ),

    rateLimitPerMinute: numberValue(
      plan.rate_limit_per_minute,
      FALLBACK_FREE.rateLimitPerMinute,
    ),

    widgetEnabled:
      plan.widget_enabled === true,

    widgetSiteLimit: numberValue(
      plan.widget_site_limit,
      0,
    ),

    widgetMonthlyCharacterLimit:
      nullableNumber(
        plan.widget_monthly_character_limit,
      ),

    widgetBrandingRemovable:
      plan.widget_branding_removable === true,

    overrideExpiresAt:
      typeof plan.override_expires_at ===
      "string"
        ? plan.override_expires_at
        : null,

    stripeStatus:
      typeof plan.stripe_status === "string"
        ? plan.stripe_status
        : null,

    stripeSubscriptionId:
      typeof plan.stripe_subscription_id ===
      "string"
        ? plan.stripe_subscription_id
        : null,

    stripeCustomerId:
      typeof plan.stripe_customer_id ===
      "string"
        ? plan.stripe_customer_id
        : null,
  };
}

function anonymousFromSettings(
  freePlan: PlanConfig,
  value: unknown,
): PlanConfig {
  const raw =
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    ...freePlan,

    slug: "anonymous",
    name: "Anonymous",
    source: "anonymous",

    monthlyCharacterLimit: numberValue(
      raw.monthly_character_limit,
      freePlan.monthlyCharacterLimit,
    ),

    maxCharactersPerRequest: numberValue(
      raw.max_characters_per_request,
      freePlan.maxCharactersPerRequest,
    ),

    historyLimit: 0,

    rateLimitPerMinute: numberValue(
      raw.rate_limit_per_minute,
      FALLBACK_ANONYMOUS.rateLimitPerMinute,
    ),

    widgetEnabled: false,
    widgetSiteLimit: 0,
  };
}

async function authenticatedUser(
  admin: SupabaseClient,
  request: Request,
): Promise<User | null> {
  const header =
    request.headers.get("authorization") ||
    "";

  const match =
    header.match(/^Bearer\s+(.+)$/i);

  /*
   * Anonymous requests avoid an unnecessary Auth request
   * completely.
   */
  if (!match) {
    return null;
  }

  const { data, error } =
    await admin.auth.getUser(match[1]);

  return error
    ? null
    : data.user;
}

async function anonymousPlan(
  admin: SupabaseClient,
): Promise<PlanConfig> {
  /*
   * These queries are independent, so keep them parallel.
   */
  const [
    { data: freeRow },
    { data: settingRow },
  ] = await Promise.all([
    admin
      .from("plans")
      .select(
        "id,slug,name,monthly_character_limit,max_characters_per_request,history_limit,rate_limit_per_minute,widget_enabled,widget_site_limit,widget_monthly_character_limit,widget_branding_removable",
      )
      .eq("slug", "free")
      .maybeSingle(),

    admin
      .from("platform_settings")
      .select("value")
      .eq("key", "anonymous_usage")
      .maybeSingle(),
  ]);

  const freePlan =
    planFromEffective(freeRow);

  return anonymousFromSettings(
    freePlan,
    settingRow?.value,
  );
}

export async function resolveEffectivePlan(
  admin: SupabaseClient,
  userId: string,
): Promise<PlanConfig> {
  const { data, error } =
    await admin.rpc(
      "effective_plan_for_user",
      {
        p_user_id: userId,
      },
    );

  if (error) {
    return FALLBACK_FREE;
  }

  return planFromEffective(data);
}

export async function resolveAccount(
  admin: SupabaseClient,
  request: Request,
  anonymousHash: string,
): Promise<AccountContext> {
  const user =
    await authenticatedUser(
      admin,
      request,
    );

  if (!user) {
    return {
      userId: null,
      role: "anonymous",
      historyEnabled: false,
      queryReviewConsent: false,
      identityKey: `anon:${anonymousHash}`,
      plan: await anonymousPlan(admin),
    };
  }

  /*
   * Important latency optimization:
   *
   * Profile information and effective-plan resolution are
   * independent once we know the authenticated user ID.
   *
   * Previously these happened sequentially:
   *
   *   profile query
   *       ↓
   *   effective-plan RPC
   *
   * Running them together removes one database round trip
   * from the signed-in translation path.
   */
  const [
    profileResult,
    effectivePlan,
  ] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "role,history_enabled,query_review_consent",
      )
      .eq("id", user.id)
      .maybeSingle(),

    resolveEffectivePlan(
      admin,
      user.id,
    ),
  ]);

  const row =
    (profileResult.data || {}) as Record<
      string,
      unknown
    >;

  const role =
    row.role === "admin"
      ? "admin"
      : row.role === "language_editor"
        ? "language_editor"
        : "user";

  return {
    userId: user.id,
    role,

    historyEnabled:
      row.history_enabled !== false,

    queryReviewConsent:
      row.query_review_consent === true,

    identityKey: `user:${user.id}`,

    plan: effectivePlan,
  };
}

export async function currentCharacters(
  admin: SupabaseClient,
  identityKey: string,
): Promise<number> {
  const month =
    `${new Date()
      .toISOString()
      .slice(0, 7)}-01`;

  const { data, error } =
    await admin
      .from("monthly_usage")
      .select("character_count")
      .eq(
        "identity_key",
        identityKey,
      )
      .eq("month", month)
      .maybeSingle();

  if (error) {
    throw new Error(
      "USAGE_UNAVAILABLE",
    );
  }

  return Number(
    (
      data as {
        character_count?: number;
      } | null
    )?.character_count || 0,
  );
}