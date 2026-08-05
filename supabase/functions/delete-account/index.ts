import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { getRuntimeConfig } from "../_shared/env.ts";
import { requireUser } from "../_shared/function-auth.ts";
import { isPublishableKeyAccepted } from "../_shared/security.ts";

function reply(body: Record<string, unknown>, status: number, headers: Record<string, string>) {
  return Response.json(body, { status, headers });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const config = getRuntimeConfig();
    const origin = request.headers.get("origin");
    const headers = buildCorsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return reply({ error: "POST required." }, 405, headers);
    if (!isOriginAllowed(origin, config.allowedOrigins) || !isPublishableKeyAccepted(request.headers.get("apikey"), config.publishableKeys)) {
      return reply({ error: "Unauthorized." }, 401, headers);
    }

    const admin = createClient(config.supabaseUrl, config.adminKey, { auth: { persistSession: false } });
    try {
      const user = await requireUser(admin, request);
      const { data: subscription } = await admin.from("subscriptions")
        .select("status,stripe_subscription_id,cancel_at_period_end,current_period_end")
        .eq("user_id", user.id)
        .maybeSingle();
      if (subscription?.stripe_subscription_id && ["active", "trialing", "past_due"].includes(subscription.status)) {
        return reply({
          error: subscription.cancel_at_period_end
            ? `Your subscription remains active until ${subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : "the end of the billing period"}. Delete the account after it ends, or contact support for immediate cancellation.`
            : "Cancel the active subscription from Billing before deleting the account."
        }, 409, headers);
      }

      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) throw error;
      return reply({ success: true }, 200, headers);
    } catch (error) {
      const authFailure = error instanceof Error && error.message === "AUTH_REQUIRED";
      return reply({ error: authFailure ? "Please log in first." : "Account deletion failed." }, authFailure ? 401 : 500, headers);
    }
  }
};
