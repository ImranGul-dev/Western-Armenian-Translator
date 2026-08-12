import type { SupabaseClient } from "@supabase/supabase-js";
import type { RateLimitResult } from "./types.ts";

export interface PreparedTranslationRequest {
  charactersUsed: number;
  monthlyAllowed: boolean;
  rate: RateLimitResult;
}

export async function consumeRateLimit(
  supabaseAdmin: SupabaseClient,
  identifierHash: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const { data, error } = await supabaseAdmin.rpc("consume_translation_rate_limit", {
    p_identifier_hash: identifierHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error || !Array.isArray(data) || !data[0]) throw new Error("RATE_LIMIT_UNAVAILABLE");

  const row = data[0] as Record<string, unknown>;
  return {
    allowed: row.allowed === true,
    remaining: typeof row.remaining === "number" ? row.remaining : Number(row.remaining || 0),
    resetAt: typeof row.reset_at === "string" ? row.reset_at : new Date(Date.now() + windowSeconds * 1000).toISOString(),
  };
}

/**
 * Fast path installed by the speed migration. It checks monthly usage and,
 * only when the monthly quota allows the request, consumes the rate limit in
 * the same Postgres round trip. Returns null when the migration is not yet
 * installed so callers can safely use the legacy two-call path.
 */
export async function prepareTranslationRequest(
  supabaseAdmin: SupabaseClient,
  values: {
    identityKey: string;
    characters: number;
    monthlyCharacterLimit: number;
    rateIdentifier: string;
    rateLimitPerMinute: number;
    windowSeconds?: number;
  },
): Promise<PreparedTranslationRequest | null> {
  const windowSeconds = values.windowSeconds ?? 60;
  const { data, error } = await supabaseAdmin.rpc("prepare_translation_request", {
    p_identity_key: values.identityKey,
    p_character_count: values.characters,
    p_monthly_character_limit: values.monthlyCharacterLimit,
    p_rate_identifier_hash: values.rateIdentifier,
    p_rate_limit: values.rateLimitPerMinute,
    p_window_seconds: windowSeconds,
  });

  if (error || !Array.isArray(data) || !data[0]) return null;
  const row = data[0] as Record<string, unknown>;

  return {
    charactersUsed: Number(row.characters_used || 0),
    monthlyAllowed: row.monthly_allowed === true,
    rate: {
      allowed: row.rate_allowed === true,
      remaining: Number(row.rate_remaining || 0),
      resetAt: typeof row.rate_reset_at === "string"
        ? row.rate_reset_at
        : new Date(Date.now() + windowSeconds * 1000).toISOString(),
    },
  };
}
