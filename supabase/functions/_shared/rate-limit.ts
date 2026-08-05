import type { SupabaseClient } from "@supabase/supabase-js";
import type { RateLimitResult } from "./types.ts";

export async function consumeRateLimit(
  supabaseAdmin: SupabaseClient,
  identifierHash: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const { data, error } = await supabaseAdmin.rpc("consume_translation_rate_limit", {
    p_identifier_hash: identifierHash,
    p_limit: limit,
    p_window_seconds: windowSeconds
  });

  if (error || !Array.isArray(data) || !data[0]) {
    throw new Error("RATE_LIMIT_UNAVAILABLE");
  }

  const row = data[0] as Record<string, unknown>;
  return {
    allowed: row.allowed === true,
    remaining: typeof row.remaining === "number" ? row.remaining : 0,
    resetAt: typeof row.reset_at === "string" ? row.reset_at : new Date(Date.now() + windowSeconds * 1000).toISOString()
  };
}
