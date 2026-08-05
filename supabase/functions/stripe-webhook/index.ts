import { createClient } from "@supabase/supabase-js";
import { getRuntimeConfig } from "../_shared/env.ts";
import { stripeInvoiceSubscriptionId, syncStripeInvoice, syncStripeSubscription } from "../_shared/billing-sync.ts";
import { constructStripeEvent, createStripeClient, stripeId, type Stripe } from "../_shared/stripe.ts";

async function markEvent(admin: ReturnType<typeof createClient>, eventId: string, values: Record<string, unknown>) {
  await admin.from("stripe_webhook_events").update(values).eq("event_id", eventId);
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const config = getRuntimeConfig();
    if (!config.billingEnabled || !config.stripeSecretKey || !config.stripeWebhookSecret || !config.supabaseUrl || !config.adminKey) {
      return new Response("Billing not configured", { status: 503 });
    }

    const signature = request.headers.get("stripe-signature") || "";
    const rawBody = await request.text();
    let event: Stripe.Event;
    try {
      event = await constructStripeEvent(config.stripeSecretKey, rawBody, signature, config.stripeWebhookSecret);
    } catch {
      return new Response("Invalid signature", { status: 400 });
    }

    const admin = createClient(config.supabaseUrl, config.adminKey, { auth: { persistSession: false } });
    const { data: existing } = await admin.from("stripe_webhook_events")
      .select("processing_status")
      .eq("event_id", event.id)
      .maybeSingle();
    if (existing?.processing_status === "completed") return Response.json({ received: true, duplicate: true });

    const { error: lockError } = await admin.from("stripe_webhook_events").upsert({
      event_id: event.id,
      event_type: event.type,
      processing_status: "processing",
      last_error: null,
      processed_at: null
    }, { onConflict: "event_id" });
    if (lockError) return new Response("Could not record event", { status: 500 });

    try {
      const stripe = createStripeClient(config.stripeSecretKey);
      const object = event.data.object;

      if (event.type === "checkout.session.completed") {
        const session = object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id || session.client_reference_id || "";
        const customerId = stripeId(session.customer);
        const subscriptionId = stripeId(session.subscription);
        if (userId) {
          await admin.from("subscriptions").upsert({
            user_id: userId,
            stripe_customer_id: customerId || null,
            stripe_subscription_id: subscriptionId || null,
            status: "processing",
            billing_provider: "stripe",
            synced_at: new Date().toISOString()
          }, { onConflict: "user_id" });
        }
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] });
          await syncStripeSubscription(admin, subscription, config);
        }
      } else if (event.type.startsWith("customer.subscription.")) {
        await syncStripeSubscription(admin, object as Stripe.Subscription, config);
      } else if (
        event.type === "invoice.created" ||
        event.type === "invoice.finalized" ||
        event.type === "invoice.finalization_failed" ||
        event.type === "invoice.updated" ||
        event.type === "invoice.paid" ||
        event.type === "invoice.payment_succeeded" ||
        event.type === "invoice.payment_action_required" ||
        event.type === "invoice.payment_failed" ||
        event.type === "invoice.voided" ||
        event.type === "invoice.marked_uncollectible"
      ) {
        await syncStripeInvoice(admin, object as Stripe.Invoice);
        const subscriptionId = stripeInvoiceSubscriptionId(object);
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] });
          await syncStripeSubscription(admin, subscription, config);
        }
      } else if (event.type === "charge.refunded") {
        const charge = object as Stripe.Charge;
        const paymentIntentId = stripeId(charge.payment_intent);
        await admin.from("billing_payments").update({ refunded_amount: charge.amount_refunded }).eq("stripe_charge_id", charge.id);
        if (paymentIntentId) {
          await admin.from("billing_payments").update({ refunded_amount: charge.amount_refunded }).eq("stripe_payment_intent_id", paymentIntentId);
        }
      }

      await markEvent(admin, event.id, {
        processing_status: "completed",
        processed_at: new Date().toISOString(),
        last_error: null
      });
      return Response.json({ received: true });
    } catch (error) {
      await markEvent(admin, event.id, {
        processing_status: "failed",
        last_error: error instanceof Error ? error.message.slice(0, 500) : "Verified event processing failed. Safe to retry."
      });
      await admin.from("system_errors").insert({
        error_code: "stripe_webhook_processing",
        safe_message: "A verified Stripe event could not be processed.",
        function_name: "stripe-webhook"
      });
      return new Response("Processing failed", { status: 500 });
    }
  }
};
