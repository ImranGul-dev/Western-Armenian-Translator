function parseNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function firstStringValue(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  for (const candidate of Object.values(value as Record<string, unknown>)) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
}

function getKeyFromJsonMap(name: string): string | undefined {
  const raw = Deno.env.get(name);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return typeof parsed.default === "string" ? parsed.default : firstStringValue(parsed);
  } catch {
    return undefined;
  }
}

export function getRuntimeConfig() {
  const publishableKeys = new Set<string>();
  const legacy = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  if (legacy) publishableKeys.add(legacy);
  const map = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (map) {
    try {
      for (const value of Object.values(JSON.parse(map) as Record<string, unknown>)) {
        if (typeof value === "string" && value.trim()) publishableKeys.add(value.trim());
      }
    } catch {
      // Supabase controls this value. An invalid map simply leaves the explicit legacy key available.
    }
  }

  return {
    openAiApiKey: Deno.env.get("OPENAI_API_KEY")?.trim() ?? "",
    openAiModel: Deno.env.get("OPENAI_MODEL")?.trim() || "gpt-5-mini",
    openAiTimeoutMs: parseNumber(Deno.env.get("OPENAI_TIMEOUT_MS"), 30_000, 5_000, 120_000),
    inputCostPerMillion: parseNumber(Deno.env.get("OPENAI_INPUT_COST_PER_MILLION"), 0, 0, 1000),
    outputCostPerMillion: parseNumber(Deno.env.get("OPENAI_OUTPUT_COST_PER_MILLION"), 0, 0, 1000),
    supabaseUrl: Deno.env.get("SUPABASE_URL")?.trim() ?? "",
    adminKey: (getKeyFromJsonMap("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim(),
    publishableKeys,
    allowedOrigins: Deno.env.get("ALLOWED_ORIGINS")?.trim() || "http://localhost:3000,http://127.0.0.1:3000",
    rateLimitSalt: Deno.env.get("RATE_LIMIT_SALT")?.trim() || "",
    siteUrl: Deno.env.get("SITE_URL")?.trim() || "http://localhost:3000",
    billingEnabled: Deno.env.get("BILLING_ENABLED") === "true",
    stripeSecretKey: Deno.env.get("STRIPE_SECRET_KEY")?.trim() || "",
    stripeWebhookSecret: Deno.env.get("STRIPE_WEBHOOK_SECRET")?.trim() || "",
    stripePremiumPrice: Deno.env.get("STRIPE_PRICE_PREMIUM_MONTHLY")?.trim() || "",
    stripeBusinessPrice: Deno.env.get("STRIPE_PRICE_BUSINESS_MONTHLY")?.trim() || "",
    stripePortalConfiguration: Deno.env.get("STRIPE_PORTAL_CONFIGURATION_ID")?.trim() || "",
    stripeTaxEnabled: Deno.env.get("STRIPE_TAX_ENABLED") === "true"
  };
}
