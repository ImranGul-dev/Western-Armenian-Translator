import { createClient } from "@supabase/supabase-js";
import { recordAdminAudit, syncStripeInvoice, syncStripeSubscription } from "../_shared/billing-sync.ts";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { getRuntimeConfig } from "../_shared/env.ts";
import { requireUser } from "../_shared/function-auth.ts";
import { isPublishableKeyAccepted } from "../_shared/security.ts";
import { createStripeClient, safeStripeMessage } from "../_shared/stripe.ts";

function reply(body: Record<string, unknown>, status: number, headers: Record<string, string>) {
  return Response.json(body, { status, headers });
}

type Action =
  | "configuration_status"
  | "pause"
  | "resume"
  | "cancel_at_period_end"
  | "reactivate"
  | "cancel_now"
  | "change_plan"
  | "refund"
  | "sync";

export default {
  async fetch(request: Request): Promise<Response> {
    const config = getRuntimeConfig();
    const origin = request.headers.get("origin");
    const headers = buildCorsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return reply({ error: "Only POST is supported." }, 405, headers);
    if (!isOriginAllowed(origin, config.allowedOrigins)) return reply({ error: "Origin not allowed." }, 403, headers);
    if (!isPublishableKeyAccepted(request.headers.get("apikey"), config.publishableKeys)) return reply({ error: "Invalid project key." }, 401, headers);

    const admin = createClient(config.supabaseUrl, config.adminKey, { auth: { persistSession: false } });
    try {
      const user = await requireUser(admin, request);
      const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (profile?.role !== "admin") return reply({ error: "Administrator access is required." }, 403, headers);

      const body = await request.json() as {
        action?: Action;
        subscriptionId?: string;
        paymentId?: string;
        plan?: "premium" | "business";
        prorationBehavior?: "always_invoice" | "create_prorations" | "none";
        reason?: string;
      };
      const action = body.action;
      if (!action) return reply({ error: "A billing action is required." }, 400, headers);

      if (action === "configuration_status") {
        const { data: plans } = await admin
          .from("plans")
          .select("slug,name,price_monthly_cents,currency,billing_interval,stripe_price_id,active")
          .in("slug", ["premium", "business"])
          .order("sort_order");
        const paidPlans = (plans || []).map(plan => ({
          ...plan,
          stripe_price_configured: Boolean(plan.stripe_price_id || (plan.slug === "premium" ? config.stripePremiumPrice : config.stripeBusinessPrice))
        }));
        return reply({
          success: true,
          status: {
            billing_enabled: config.billingEnabled,
            stripe_secret_configured: Boolean(config.stripeSecretKey),
            webhook_secret_configured: Boolean(config.stripeWebhookSecret),
            portal_configuration_configured: Boolean(config.stripePortalConfiguration),
            site_url: config.siteUrl,
            tax_enabled: config.stripeTaxEnabled,
            plans: paidPlans
          }
        }, 200, headers);
      }

      if (!config.billingEnabled || !config.stripeSecretKey) {
        return reply({ error: "Billing is not enabled." }, 503, headers);
      }
      const stripe = createStripeClient(config.stripeSecretKey);

      if (action === "refund") {
        if (!body.paymentId) return reply({ error: "Payment ID is required." }, 400, headers);
        const { data: payment } = await admin.from("billing_payments")
          .select("id,stripe_invoice_id,stripe_payment_intent_id,stripe_charge_id,amount_paid,refunded_amount")
          .eq("id", body.paymentId)
          .maybeSingle();
        if (!payment) return reply({ error: "Payment not found." }, 404, headers);
        if (!payment.stripe_payment_intent_id && !payment.stripe_charge_id) {
          return reply({ error: "This invoice has no refundable Stripe payment." }, 409, headers);
        }
        const refundableAmount = Math.max(0, payment.amount_paid - payment.refunded_amount);
        if (!refundableAmount) return reply({ error: "This payment has already been fully refunded." }, 409, headers);
        const refund = await stripe.refunds.create({
          payment_intent: payment.stripe_payment_intent_id || undefined,
          charge: payment.stripe_payment_intent_id ? undefined : payment.stripe_charge_id || undefined,
          amount: refundableAmount,
          reason: "requested_by_customer",
          metadata: { admin_user_id: user.id, local_payment_id: payment.id }
        }, { idempotencyKey: `wat-refund-${payment.id}-${refundableAmount}` });
        await admin.from("billing_payments").update({ refunded_amount: payment.refunded_amount + refund.amount }).eq("id", payment.id);
        await recordAdminAudit(admin, user.id, "refund_payment", "billing_payment", payment.id, {
          stripe_invoice_id: payment.stripe_invoice_id,
          amount: refund.amount,
          status: refund.status
        });
        return reply({ success: true, message: "Refund submitted to Stripe." }, 200, headers);
      }

      if (!body.subscriptionId) return reply({ error: "Subscription ID is required." }, 400, headers);
      const { data: local } = await admin.from("subscriptions")
        .select("id,user_id,stripe_subscription_id,stripe_subscription_item_id")
        .eq("id", body.subscriptionId)
        .maybeSingle();
      if (!local?.stripe_subscription_id) return reply({ error: "Subscription not found." }, 404, headers);

      let subscription;
      if (action === "pause") {
        subscription = await stripe.subscriptions.update(local.stripe_subscription_id, {
          pause_collection: { behavior: "void" },
          metadata: { admin_pause_reason: (body.reason || "Paused by administrator").slice(0, 200) }
        });
        await admin.from("subscriptions").update({
          access_suspended: true,
          access_suspended_reason: (body.reason || "Paused by administrator").slice(0, 500)
        }).eq("id", local.id);
      } else if (action === "resume") {
        subscription = await stripe.subscriptions.update(local.stripe_subscription_id, {
          pause_collection: null as never,
          metadata: { admin_pause_reason: "" }
        });
        await admin.from("subscriptions").update({ access_suspended: false, access_suspended_reason: null }).eq("id", local.id);
      } else if (action === "cancel_at_period_end") {
        subscription = await stripe.subscriptions.update(local.stripe_subscription_id, { cancel_at_period_end: true });
      } else if (action === "reactivate") {
        subscription = await stripe.subscriptions.update(local.stripe_subscription_id, { cancel_at_period_end: false });
      } else if (action === "cancel_now") {
        subscription = await stripe.subscriptions.cancel(local.stripe_subscription_id, { invoice_now: false, prorate: false });
        await admin.from("subscriptions").update({
          access_suspended: true,
          access_suspended_reason: "Cancelled immediately by administrator"
        }).eq("id", local.id);
      } else if (action === "change_plan") {
        if (body.plan !== "premium" && body.plan !== "business") {
          return reply({ error: "Choose Premium or Business." }, 400, headers);
        }
        const { data: targetPlan } = await admin
          .from("plans")
          .select("price_monthly_cents,currency,billing_interval,stripe_price_id,active")
          .eq("slug", body.plan)
          .maybeSingle();
        if (!targetPlan?.active) return reply({ error: "The target plan is not active." }, 409, headers);
        const fallbackPrice = body.plan === "premium" ? config.stripePremiumPrice : config.stripeBusinessPrice;
        const priceId = targetPlan.stripe_price_id || fallbackPrice;
        if (!priceId) return reply({ error: "The target Stripe price is not configured." }, 500, headers);
        const price = await stripe.prices.retrieve(priceId);
        if (
          !price.active
          || price.type !== "recurring"
          || price.unit_amount !== targetPlan.price_monthly_cents
          || price.currency.toLowerCase() !== String(targetPlan.currency || "usd").toLowerCase()
          || price.recurring?.interval !== String(targetPlan.billing_interval || "month")
        ) {
          return reply({ error: "The target Stripe price does not match the plan configuration." }, 409, headers);
        }
        const current = await stripe.subscriptions.retrieve(local.stripe_subscription_id);
        const itemId = local.stripe_subscription_item_id || current.items.data[0]?.id;
        if (!itemId) return reply({ error: "The Stripe subscription item is missing." }, 409, headers);
        subscription = await stripe.subscriptions.update(local.stripe_subscription_id, {
          items: [{ id: itemId, price: priceId }],
          proration_behavior: body.prorationBehavior || "create_prorations",
          metadata: { user_id: local.user_id, plan: body.plan }
        });
      } else {
        subscription = await stripe.subscriptions.retrieve(local.stripe_subscription_id, { expand: ["items.data.price"] });
        const invoices = await stripe.invoices.list({
          subscription: local.stripe_subscription_id,
          limit: 25,
          expand: ["data.payments"]
        });
        for (const invoice of invoices.data) await syncStripeInvoice(admin, invoice);
      }

      await syncStripeSubscription(admin, subscription, config);
      await recordAdminAudit(admin, user.id, action, "subscription", local.id, {
        stripe_subscription_id: local.stripe_subscription_id,
        target_plan: body.plan || null,
        proration_behavior: body.prorationBehavior || null
      });
      return reply({ success: true, message: "Billing action completed." }, 200, headers);
    } catch (error) {
      const authFailure = error instanceof Error && error.message === "AUTH_REQUIRED";
      return reply({ error: authFailure ? "Please log in first." : safeStripeMessage(error) }, authFailure ? 401 : 500, headers);
    }
  }
};
