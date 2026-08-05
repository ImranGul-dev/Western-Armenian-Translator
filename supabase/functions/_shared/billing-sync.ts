import type { SupabaseClient } from "@supabase/supabase-js";
import type { Stripe } from "./stripe.ts";
import { priceToPlan, stripeId, unixToIso } from "./stripe.ts";
import type { getRuntimeConfig } from "./env.ts";

type RuntimeConfig = ReturnType<typeof getRuntimeConfig>;
type AnyRecord = Record<string, unknown>;

function record(value: unknown): AnyRecord {
  return value && typeof value === "object" ? value as AnyRecord : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function stripeInvoiceSubscriptionId(invoice: unknown): string {
  const raw = record(invoice);
  const parent = record(raw.parent);
  const subscriptionDetails = record(parent.subscription_details);
  return stripeId(
    (subscriptionDetails.subscription ?? raw.subscription) as string | { id: string } | null
  );
}

async function planId(admin: SupabaseClient, slug: "free" | "premium" | "business"): Promise<string | null> {
  const { data } = await admin.from("plans").select("id").eq("slug", slug).maybeSingle();
  return typeof data?.id === "string" ? data.id : null;
}

async function planSlugFromPrice(
  admin: SupabaseClient,
  priceId: string,
  config: RuntimeConfig
): Promise<"free" | "premium" | "business"> {
  if (priceId) {
    const { data } = await admin.from("plans").select("slug").eq("stripe_price_id", priceId).maybeSingle();
    if (data?.slug === "premium" || data?.slug === "business") return data.slug;
  }
  return priceToPlan(priceId, config.stripePremiumPrice, config.stripeBusinessPrice);
}

export async function userIdFromCustomer(admin: SupabaseClient, customerId: string): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await admin.from("subscriptions").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
  return typeof data?.user_id === "string" ? data.user_id : null;
}

export async function syncStripeSubscription(
  admin: SupabaseClient,
  subscription: Stripe.Subscription,
  config: RuntimeConfig
): Promise<{ userId: string | null; planSlug: "free" | "premium" | "business" }> {
  const raw = subscription as unknown as AnyRecord;
  const metadata = record(raw.metadata);
  const customerId = stripeId(raw.customer as string | { id: string } | null);
  const metadataUserId = stringValue(metadata.user_id);
  const userId = metadataUserId || await userIdFromCustomer(admin, customerId);
  const itemsContainer = record(raw.items);
  const items = Array.isArray(itemsContainer.data) ? itemsContainer.data as AnyRecord[] : [];
  const firstItem = record(items[0]);
  const price = record(firstItem.price);
  const recurring = record(price.recurring);
  const priceId = stringValue(price.id);
  const planSlug = await planSlugFromPrice(admin, priceId, config);
  const status = stringValue(raw.status) || "inactive";
  const pauseCollection = record(raw.pause_collection);
  // Stripe API versions expose the billing period on the subscription item.
  // Keep the top-level fallback so older accounts and fixture payloads still sync.
  const currentPeriodStart = numberValue(firstItem.current_period_start) ?? numberValue(raw.current_period_start);
  const currentPeriodEnd = numberValue(firstItem.current_period_end) ?? numberValue(raw.current_period_end);

  if (!userId) return { userId: null, planSlug };

  const existing = await admin.from("subscriptions")
    .select("access_suspended,access_suspended_reason")
    .eq("user_id", userId)
    .maybeSingle();

  const planId = await planId(admin, planSlug);
  const payload = {
    user_id: userId,
    plan_id: planId,
    plan_slug: planSlug,
    billing_provider: "stripe",
    stripe_customer_id: customerId || null,
    stripe_subscription_id: stringValue(raw.id) || null,
    stripe_subscription_item_id: stringValue(firstItem.id) || null,
    stripe_price_id: priceId || null,
    status,
    amount_cents: numberValue(price.unit_amount),
    currency: stringValue(price.currency) || null,
    billing_interval: stringValue(recurring.interval) || null,
    billing_interval_count: numberValue(recurring.interval_count),
    quantity: numberValue(firstItem.quantity) || 1,
    current_period_start: unixToIso(currentPeriodStart),
    current_period_end: unixToIso(currentPeriodEnd),
    next_payment_at: unixToIso(currentPeriodEnd),
    cancel_at_period_end: raw.cancel_at_period_end === true,
    canceled_at: unixToIso(numberValue(raw.canceled_at)),
    ended_at: unixToIso(numberValue(raw.ended_at)),
    trial_end: unixToIso(numberValue(raw.trial_end)),
    pause_collection_behavior: stringValue(pauseCollection.behavior) || null,
    pause_resumes_at: unixToIso(numberValue(pauseCollection.resumes_at)),
    access_suspended: existing.data?.access_suspended === true,
    access_suspended_reason: existing.data?.access_suspended_reason || null,
    synced_at: new Date().toISOString(),
    metadata: {
      livemode: raw.livemode === true,
      collection_method: stringValue(raw.collection_method),
      automatic_tax_enabled: record(raw.automatic_tax).enabled === true
    }
  };

  await admin.from("subscriptions").upsert(payload, { onConflict: "user_id" });

  const paidStatuses = new Set(["active", "trialing", "past_due"]);
  const accessSuspended = existing.data?.access_suspended === true;
  const effectiveSlug = paidStatuses.has(status) && !accessSuspended ? planSlug : "free";
  const effectivePlanId = await planId(admin, effectiveSlug);
  if (effectivePlanId) {
    await admin.from("profiles").update({ current_plan_id: effectivePlanId }).eq("id", userId);
  }

  return { userId, planSlug };
}

export async function syncStripeInvoice(
  admin: SupabaseClient,
  invoice: Stripe.Invoice
): Promise<{ userId: string | null; invoiceId: string }> {
  const raw = invoice as unknown as AnyRecord;
  const customerId = stripeId(raw.customer as string | { id: string } | null);
  const stripeSubscriptionId = stripeInvoiceSubscriptionId(raw);
  const userId = await userIdFromCustomer(admin, customerId);
  const { data: localSubscription } = stripeSubscriptionId
    ? await admin.from("subscriptions").select("id,user_id").eq("stripe_subscription_id", stripeSubscriptionId).maybeSingle()
    : { data: null };
  const resolvedUserId = userId || (typeof localSubscription?.user_id === "string" ? localSubscription.user_id : null);
  const statusTransitions = record(raw.status_transitions);
  const periodStart = numberValue(raw.period_start);
  const periodEnd = numberValue(raw.period_end);

  // Current Stripe Invoice objects expose the associated PaymentIntent/Charge
  // through invoice.payments.data[].payment. Keep the legacy top-level fields
  // as fallbacks for older API versions and local test fixtures.
  const paymentsContainer = record(raw.payments);
  const payments = Array.isArray(paymentsContainer.data) ? paymentsContainer.data as AnyRecord[] : [];
  const invoicePayment = record(payments[0]);
  const paymentDetails = record(invoicePayment.payment);
  const paymentIntentId = stripeId(
    (paymentDetails.payment_intent ?? raw.payment_intent) as string | { id: string } | null
  );
  const chargeId = stripeId(
    (paymentDetails.charge ?? raw.charge) as string | { id: string } | null
  );
  const invoicePaymentTransitions = record(invoicePayment.status_transitions);
  const paidAtUnix = numberValue(statusTransitions.paid_at) ?? numberValue(invoicePaymentTransitions.paid_at);
  const lastError = record(raw.last_finalization_error);
  const invoiceId = stringValue(raw.id);

  await admin.from("billing_payments").upsert({
    user_id: resolvedUserId,
    subscription_id: typeof localSubscription?.id === "string" ? localSubscription.id : null,
    stripe_customer_id: customerId || null,
    stripe_subscription_id: stripeSubscriptionId || null,
    stripe_invoice_id: invoiceId,
    stripe_payment_intent_id: paymentIntentId || null,
    stripe_charge_id: chargeId || null,
    invoice_number: stringValue(raw.number) || null,
    status: stringValue(raw.status) || "draft",
    billing_reason: stringValue(raw.billing_reason) || null,
    amount_due: numberValue(raw.amount_due) || 0,
    amount_paid: numberValue(raw.amount_paid) || 0,
    amount_remaining: numberValue(raw.amount_remaining) || 0,
    currency: stringValue(raw.currency) || "usd",
    hosted_invoice_url: stringValue(raw.hosted_invoice_url) || null,
    invoice_pdf: stringValue(raw.invoice_pdf) || null,
    failure_code: stringValue(lastError.code) || null,
    failure_message: stringValue(lastError.message) || null,
    period_start: unixToIso(periodStart),
    period_end: unixToIso(periodEnd),
    paid_at: unixToIso(paidAtUnix),
    created_at: unixToIso(numberValue(raw.created)) || new Date().toISOString(),
    raw_summary: {
      attempt_count: numberValue(raw.attempt_count) || 0,
      attempted: raw.attempted === true,
      auto_advance: raw.auto_advance === true,
      livemode: raw.livemode === true
    }
  }, { onConflict: "stripe_invoice_id" });

  if (stripeSubscriptionId) {
    const update: Record<string, unknown> = {
      latest_invoice_id: invoiceId || null,
      synced_at: new Date().toISOString()
    };
    const paidAt = unixToIso(paidAtUnix);
    if (paidAt) update.last_payment_at = paidAt;
    if (periodEnd) update.next_payment_at = unixToIso(periodEnd);
    await admin.from("subscriptions").update(update).eq("stripe_subscription_id", stripeSubscriptionId);
  }

  return { userId: resolvedUserId, invoiceId };
}

export async function recordAdminAudit(
  admin: SupabaseClient,
  adminUserId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  safeDetails: Record<string, unknown> = {}
): Promise<void> {
  await admin.from("admin_audit_log").insert({
    admin_user_id: adminUserId,
    action,
    target_type: targetType,
    target_id: targetId,
    safe_details: safeDetails
  });
}
