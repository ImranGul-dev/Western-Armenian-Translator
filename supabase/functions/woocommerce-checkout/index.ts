import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { getRuntimeConfig } from "../_shared/env.ts";
import { requireUser } from "../_shared/function-auth.ts";
import { isPublishableKeyAccepted } from "../_shared/security.ts";

function reply(body: Record<string, unknown>, status: number, headers: Record<string, string>) {
  return Response.json(body, { status, headers: { ...headers, "Cache-Control": "no-store" } });
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request: Request): Promise<Response> {
    const config = getRuntimeConfig();
    const origin = request.headers.get("origin");
    const headers = buildCorsHeaders(origin);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return reply({ error: "Only POST is supported." }, 405, headers);
    if (!isOriginAllowed(origin, config.allowedOrigins)) return reply({ error: "Origin not allowed." }, 403, headers);
    if (!isPublishableKeyAccepted(request.headers.get("apikey"), config.publishableKeys)) {
      return reply({ error: "Invalid project key." }, 401, headers);
    }
    if (!config.supabaseUrl || !config.adminKey) return reply({ error: "Checkout is not configured." }, 503, headers);

    const admin = createClient(config.supabaseUrl, config.adminKey, { auth: { persistSession: false, autoRefreshToken: false } });

    try {
      const user = await requireUser(admin, request);
      const body = await request.json().catch(() => ({})) as { plan?: string };
      if (body.plan !== "premium" && body.plan !== "business") {
        return reply({ error: "Choose Person or Schools." }, 400, headers);
      }

      const { data: mapping, error: mappingError } = await admin
        .from("woocommerce_product_plan_map")
        .select("product_id,plan_id,plan_slug,checkout_url,active")
        .eq("plan_slug", body.plan)
        .eq("active", true)
        .maybeSingle();

      if (mappingError || !mapping || typeof mapping.checkout_url !== "string") {
        return reply({ error: "The selected WooCommerce subscription is not available." }, 404, headers);
      }

      const token = randomToken();
      const tokenHash = await sha256Hex(token);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      const { error: insertError } = await admin.from("woocommerce_checkout_sessions").insert({
        token_hash: tokenHash,
        user_id: user.id,
        plan_id: mapping.plan_id,
        plan_slug: mapping.plan_slug,
        product_id: mapping.product_id,
        expires_at: expiresAt
      });
      if (insertError) throw insertError;

      const url = new URL(mapping.checkout_url);
      url.searchParams.set("tun_checkout", token);

      return reply({ url: url.toString(), expires_at: expiresAt }, 200, headers);
    } catch (error) {
      if (error instanceof Error && error.message === "AUTH_REQUIRED") {
        return reply({ error: "Sign in before starting subscription checkout." }, 401, headers);
      }
      await admin.from("system_errors").insert({
        error_code: "woocommerce_checkout",
        safe_message: "A WooCommerce checkout handoff could not be created.",
        function_name: "woocommerce-checkout"
      });
      return reply({ error: "Could not start subscription checkout." }, 500, headers);
    }
  }
};
