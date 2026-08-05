import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { getRuntimeConfig } from "../_shared/env.ts";
import { requireUser } from "../_shared/function-auth.ts";
import { isPublishableKeyAccepted } from "../_shared/security.ts";
import { createStripeClient, safeStripeMessage } from "../_shared/stripe.ts";

function reply(body: Record<string, unknown>, status: number, headers: Record<string, string>) {
  return Response.json(body, { status, headers });
}

type PortalAction = "home" | "payment_method_update" | "subscription_update" | "subscription_cancel";

export default {
  async fetch(request: Request): Promise<Response> {
    const config = getRuntimeConfig();
    const origin = request.headers.get("origin");
    const headers = buildCorsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return reply({ error: "Only POST is supported." }, 405, headers);
    if (!isOriginAllowed(origin, config.allowedOrigins)) return reply({ error: "Origin not allowed." }, 403, headers);
    if (!isPublishableKeyAccepted(request.headers.get("apikey"), config.publishableKeys)) return reply({ error: "Invalid project key." }, 401, headers);
    if (!config.billingEnabled || !config.stripeSecretKey) return reply({ error: "Billing is not enabled yet." }, 503, headers);

    const admin = createClient(config.supabaseUrl, config.adminKey, { auth: { persistSession: false } });
    try {
      const user = await requireUser(admin, request);
      const body = await request.json().catch(() => ({})) as { action?: PortalAction };
      const action: PortalAction = ["home", "payment_method_update", "subscription_update", "subscription_cancel"].includes(body.action || "")
        ? body.action as PortalAction
        : "home";

      const { data } = await admin.from("subscriptions")
        .select("stripe_customer_id,stripe_subscription_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!data?.stripe_customer_id) return reply({ error: "No Stripe customer exists for this account." }, 404, headers);

      const stripe = createStripeClient(config.stripeSecretKey);
      const params: Record<string, unknown> = {
        customer: data.stripe_customer_id,
        return_url: `${config.siteUrl}/dashboard/billing`
      };
      if (config.stripePortalConfiguration) params.configuration = config.stripePortalConfiguration;

      if (action === "payment_method_update") {
        params.flow_data = {
          type: "payment_method_update",
          after_completion: { type: "redirect", redirect: { return_url: `${config.siteUrl}/dashboard/billing?updated=payment-method` } }
        };
      } else if (action === "subscription_update") {
        if (!data.stripe_subscription_id) return reply({ error: "No active subscription exists." }, 404, headers);
        params.flow_data = {
          type: "subscription_update",
          subscription_update: { subscription: data.stripe_subscription_id },
          after_completion: { type: "redirect", redirect: { return_url: `${config.siteUrl}/dashboard/billing?updated=plan` } }
        };
      } else if (action === "subscription_cancel") {
        if (!data.stripe_subscription_id) return reply({ error: "No active subscription exists." }, 404, headers);
        params.flow_data = {
          type: "subscription_cancel",
          subscription_cancel: { subscription: data.stripe_subscription_id },
          after_completion: { type: "redirect", redirect: { return_url: `${config.siteUrl}/dashboard/billing?updated=cancellation` } }
        };
      }

      const portal = await stripe.billingPortal.sessions.create(params as never);
      return reply({ url: portal.url }, 200, headers);
    } catch (error) {
      const authFailure = error instanceof Error && error.message === "AUTH_REQUIRED";
      return reply({ error: authFailure ? "Please log in first." : safeStripeMessage(error) }, authFailure ? 401 : 500, headers);
    }
  }
};
