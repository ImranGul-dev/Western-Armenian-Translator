import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { getRuntimeConfig } from "../_shared/env.ts";
import { requireUser } from "../_shared/function-auth.ts";
import { isPublishableKeyAccepted } from "../_shared/security.ts";
import { createStripeClient, safeStripeMessage } from "../_shared/stripe.ts";

function reply(body: Record<string, unknown>, status: number, headers: Record<string, string>) {
  return Response.json(body, { status, headers });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const config = getRuntimeConfig();
    const origin = request.headers.get("origin");
    const headers = buildCorsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return reply({ error: "Only POST is supported." }, 405, headers);
    if (!isOriginAllowed(origin, config.allowedOrigins)) return reply({ error: "Origin not allowed." }, 403, headers);
    if (!isPublishableKeyAccepted(request.headers.get("apikey"), config.publishableKeys)) return reply({ error: "Invalid project key." }, 401, headers);
    if (!config.billingEnabled) return reply({ error: "Billing is not enabled yet." }, 503, headers);
    if (!config.stripeSecretKey) return reply({ error: "Stripe is not configured." }, 500, headers);

    const admin = createClient(config.supabaseUrl, config.adminKey, { auth: { persistSession: false } });
    try {
      const user = await requireUser(admin, request);
      const body = await request.json() as { plan?: string };
      if (body.plan !== "premium" && body.plan !== "business") {
        return reply({ error: "Choose Premium or Business." }, 400, headers);
      }

      const { data: plan, error: planError } = await admin
        .from("plans")
        .select("id,slug,name,price_monthly_cents,currency,billing_interval,stripe_price_id,active")
        .eq("slug", body.plan)
        .maybeSingle();
      if (planError || !plan || !plan.active) return reply({ error: "The selected plan is not available." }, 404, headers);

      const fallbackPrice = body.plan === "premium" ? config.stripePremiumPrice : config.stripeBusinessPrice;
      const priceId = plan.stripe_price_id || fallbackPrice;
      if (!priceId) return reply({ error: "The selected Stripe price is not configured." }, 500, headers);

      const stripe = createStripeClient(config.stripeSecretKey);
      const stripePrice = await stripe.prices.retrieve(priceId);
      const expectedCurrency = String(plan.currency || "usd").toLowerCase();
      const expectedInterval = String(plan.billing_interval || "month");
      if (
        !stripePrice.active
        || stripePrice.type !== "recurring"
        || stripePrice.recurring?.interval !== expectedInterval
        || stripePrice.currency.toLowerCase() !== expectedCurrency
        || stripePrice.unit_amount !== plan.price_monthly_cents
      ) {
        return reply({ error: "The Stripe price does not match the plan configuration. Update the plan or Stripe Price ID before checkout." }, 409, headers);
      }

      const { data: existing } = await admin.from("subscriptions")
        .select("stripe_customer_id,stripe_subscription_id,status")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing?.stripe_subscription_id && ["active", "trialing", "past_due"].includes(existing.status)) {
        return reply({ error: "This account already has a subscription. Use Manage billing to change plans." }, 409, headers);
      }

      let customerId = existing?.stripe_customer_id || "";
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          name: typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name : undefined,
          metadata: { user_id: user.id, application: "western_armenian_translator" }
        }, { idempotencyKey: `wat-customer-${user.id}` });
        customerId = customer.id;
        await admin.from("subscriptions").upsert({
          user_id: user.id,
          stripe_customer_id: customerId,
          status: "inactive",
          billing_provider: "stripe",
          plan_slug: "free",
          synced_at: new Date().toISOString()
        }, { onConflict: "user_id" });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${config.siteUrl}/dashboard/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${config.siteUrl}/pricing?checkout=cancelled`,
        client_reference_id: user.id,
        allow_promotion_codes: true,
        billing_address_collection: "auto",
        customer_update: { address: "auto", name: "auto" },
        automatic_tax: { enabled: config.stripeTaxEnabled },
        metadata: { user_id: user.id, plan: body.plan, local_plan_id: plan.id },
        subscription_data: { metadata: { user_id: user.id, plan: body.plan, local_plan_id: plan.id } }
      }, { idempotencyKey: `wat-checkout-${user.id}-${body.plan}-${new Date().toISOString().slice(0, 13)}` });

      return reply({ url: session.url }, 200, headers);
    } catch (error) {
      const authFailure = error instanceof Error && error.message === "AUTH_REQUIRED";
      return reply({ error: authFailure ? "Please log in first." : safeStripeMessage(error) }, authFailure ? 401 : 500, headers);
    }
  }
};
