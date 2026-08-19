import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AnyRecord = Record<string, unknown>;
type PaidPlan = { planId: string; planSlug: "premium" | "business"; productId: number };
type CheckoutLink = { id: string; userId: string; planId: string; planSlug: "premium" | "business"; productId: number };

function record(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function integerValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isoValue(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function validSignature(rawBody: string, suppliedSignature: string, secret: string): Promise<boolean> {
  if (!suppliedSignature || !secret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return constantTimeEqual(toBase64(new Uint8Array(digest)), suppliedSignature.trim());
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function metadataValue(payload: AnyRecord, keys: string[]): string {
  const metadata = Array.isArray(payload.meta_data) ? payload.meta_data : [];
  for (const item of metadata) {
    const row = record(item);
    if (keys.includes(stringValue(row.key))) return stringValue(row.value);
  }
  return "";
}

function billingEmail(payload: AnyRecord): string {
  return stringValue(record(payload.billing).email).toLowerCase();
}

function productIds(payload: AnyRecord): number[] {
  const result: number[] = [];
  const items = Array.isArray(payload.line_items) ? payload.line_items : [];
  for (const item of items) {
    const row = record(item);
    for (const candidate of [integerValue(row.product_id), integerValue(row.variation_id)]) {
      if (candidate && !result.includes(candidate)) result.push(candidate);
    }
  }
  return result;
}

async function resolvePlan(admin: SupabaseClient, payload: AnyRecord): Promise<PaidPlan | null> {
  for (const productId of productIds(payload)) {
    const { data, error } = await admin
      .from("woocommerce_product_plan_map")
      .select("plan_id,plan_slug,product_id")
      .eq("product_id", productId)
      .eq("active", true)
      .maybeSingle();
    if (!error && data && typeof data.plan_id === "string" && (data.plan_slug === "premium" || data.plan_slug === "business")) {
      return { planId: data.plan_id, planSlug: data.plan_slug, productId };
    }
  }
  return null;
}

async function resolveCheckoutLink(
  admin: SupabaseClient,
  payload: AnyRecord,
  subscriptionId: number,
  plan: PaidPlan | null
): Promise<{ link: CheckoutLink | null; tokenPresent: boolean }> {
  const token = metadataValue(payload, ["_tun_checkout_token", "tun_checkout_token", "tun_checkout"]);
  if (!token) return { link: null, tokenPresent: false };
  if (!/^[a-f0-9]{64}$/u.test(token)) return { link: null, tokenPresent: true };

  const tokenHash = await sha256Hex(token);
  const { data, error } = await admin
    .from("woocommerce_checkout_sessions")
    .select("id,user_id,plan_id,plan_slug,product_id,expires_at,consumed_at,woocommerce_subscription_id")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data || typeof data.user_id !== "string" || typeof data.plan_id !== "string") {
    return { link: null, tokenPresent: true };
  }
  if (data.plan_slug !== "premium" && data.plan_slug !== "business") return { link: null, tokenPresent: true };
  if (!plan || Number(data.product_id) !== plan.productId || data.plan_id !== plan.planId || data.plan_slug !== plan.planSlug) {
    return { link: null, tokenPresent: true };
  }

  const linkedSubscriptionId = integerValue(data.woocommerce_subscription_id);
  if (linkedSubscriptionId && linkedSubscriptionId !== subscriptionId) return { link: null, tokenPresent: true };
  if (!data.consumed_at && new Date(String(data.expires_at)).getTime() <= Date.now()) return { link: null, tokenPresent: true };

  return {
    tokenPresent: true,
    link: {
      id: String(data.id),
      userId: data.user_id,
      planId: data.plan_id,
      planSlug: data.plan_slug,
      productId: Number(data.product_id)
    }
  };
}

async function resolveLegacyUserId(admin: SupabaseClient, payload: AnyRecord): Promise<string | null> {
  const linkedUserId = metadataValue(payload, ["tun_user_id", "_tun_user_id", "supabase_user_id"]);
  if (linkedUserId) {
    const { data, error } = await admin.from("profiles").select("id").eq("id", linkedUserId).maybeSingle();
    if (!error && typeof data?.id === "string") return data.id;
  }

  const email = billingEmail(payload);
  if (!email) return null;
  const { data, error } = await admin.from("profiles").select("id").ilike("email", email).limit(2);
  return !error && Array.isArray(data) && data.length === 1 && typeof data[0]?.id === "string" ? data[0].id : null;
}

async function freePlanId(admin: SupabaseClient): Promise<string | null> {
  const { data } = await admin.from("plans").select("id").eq("slug", "free").maybeSingle();
  return typeof data?.id === "string" ? data.id : null;
}

async function markEvent(admin: SupabaseClient, eventId: string, values: Record<string, unknown>) {
  await admin.from("woocommerce_webhook_events").update(values).eq("event_id", eventId);
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || "";
  const adminKey = (
    Deno.env.get("SUPABASE_SECRET_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    ""
  ).trim();
  const webhookSecret = Deno.env.get("WOOCOMMERCE_WEBHOOK_SECRET")?.trim() || "";
  if (!supabaseUrl || !adminKey || !webhookSecret) {
    return new Response("WooCommerce webhook is not configured", { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-wc-webhook-signature") || "";
  const userAgent = request.headers.get("user-agent") || "";

  // WooCommerce uses a narrow unsigned activation probe when a webhook is
  // first saved. Accept only that probe; real deliveries remain HMAC signed.
  const activationPing = !signature
    && /^webhook_id=\d+$/u.test(rawBody.trim())
    && /WooCommerce\/.+ Hookshot \(WordPress\/.+\)/u.test(userAgent);
  if (activationPing) return json({ received: true, ping: true });

  if (!await validSignature(rawBody, signature, webhookSecret)) {
    return new Response("Invalid webhook signature", { status: 401 });
  }

  let payload: AnyRecord;
  try {
    payload = record(JSON.parse(rawBody || "{}"));
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const admin = createClient(supabaseUrl, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const subscriptionId = integerValue(payload.id);
  const webhookId = request.headers.get("x-wc-webhook-id") || "unknown";
  const deliveryId = request.headers.get("x-wc-webhook-delivery-id") || crypto.randomUUID();
  const topic = request.headers.get("x-wc-webhook-topic") || "unknown";
  const eventId = `${webhookId}:${deliveryId}`;

  const { data: existing } = await admin
    .from("woocommerce_webhook_events")
    .select("processing_status")
    .eq("event_id", eventId)
    .maybeSingle();
  if (existing?.processing_status === "completed") return json({ received: true, duplicate: true });

  const eventType = stringValue(payload.status) || request.headers.get("x-wc-webhook-event") || "unknown";
  const { error: eventError } = await admin.from("woocommerce_webhook_events").upsert({
    event_id: eventId,
    event_type: eventType,
    topic,
    woocommerce_subscription_id: subscriptionId,
    processing_status: "processing",
    last_error: null,
    safe_summary: {
      source: request.headers.get("x-wc-webhook-source") || null,
      resource: request.headers.get("x-wc-webhook-resource") || null
    },
    processed_at: null
  }, { onConflict: "event_id" });
  if (eventError) return new Response("Could not record webhook event", { status: 500 });

  if (!subscriptionId) {
    await markEvent(admin, eventId, {
      processing_status: "ignored",
      processed_at: new Date().toISOString(),
      safe_summary: { reason: "No subscription resource in payload" }
    });
    return json({ received: true, ignored: true });
  }

  try {
    const plan = await resolvePlan(admin, payload);
    const checkout = await resolveCheckoutLink(admin, payload, subscriptionId, plan);

    // A supplied checkout token must validate. Never silently downgrade a bad
    // token to email matching, because the token is the production account link.
    if (checkout.tokenPresent && !checkout.link) {
      await markEvent(admin, eventId, {
        processing_status: "unmatched",
        processed_at: new Date().toISOString(),
        safe_summary: {
          woocommerce_subscription_id: subscriptionId,
          product_ids: productIds(payload),
          checkout_token_present: true,
          checkout_token_valid: false,
          matched_plan: Boolean(plan)
        }
      });
      return json({ received: true, matched: false });
    }

    const userId = checkout.link?.userId || await resolveLegacyUserId(admin, payload);
    if (!userId || !plan) {
      await markEvent(admin, eventId, {
        processing_status: "unmatched",
        processed_at: new Date().toISOString(),
        safe_summary: {
          woocommerce_subscription_id: subscriptionId,
          customer_id: integerValue(payload.customer_id),
          product_ids: productIds(payload),
          checkout_token_present: checkout.tokenPresent,
          billing_email_present: Boolean(billingEmail(payload)),
          matched_user: Boolean(userId),
          matched_plan: Boolean(plan)
        }
      });
      return json({ received: true, matched: false });
    }

    const status = stringValue(payload.status).toLowerCase().replace(/_/gu, "-") || "inactive";
    const active = status === "active";
    const now = new Date().toISOString();
    const customerId = integerValue(payload.customer_id);
    const parentId = integerValue(payload.parent_id);
    const email = billingEmail(payload);
    const { data: localSubscription } = await admin
      .from("subscriptions")
      .select("access_suspended,access_suspended_reason")
      .eq("user_id", userId)
      .maybeSingle();

    const nextPaymentAt = isoValue(record(payload.billing_period).next_payment)
      || isoValue(record(payload.schedule).next_payment)
      || isoValue(payload.next_payment_date);
    const endAt = isoValue(record(payload.schedule).end) || isoValue(payload.end_date);

    const { error: subscriptionError } = await admin.from("subscriptions").upsert({
      user_id: userId,
      plan_id: plan.planId,
      plan_slug: plan.planSlug,
      billing_provider: "woocommerce",
      status,
      woocommerce_subscription_id: subscriptionId,
      woocommerce_order_id: parentId,
      woocommerce_customer_id: customerId,
      woocommerce_product_id: plan.productId,
      woocommerce_billing_email: email || null,
      cancel_at_period_end: status === "pending-cancel",
      next_payment_at: nextPaymentAt,
      ended_at: status === "cancelled" || status === "expired" ? endAt || now : endAt,
      access_suspended: localSubscription?.access_suspended === true,
      access_suspended_reason: localSubscription?.access_suspended_reason || null,
      provider_updated_at: isoValue(payload.date_modified_gmt) || isoValue(payload.date_modified) || now,
      synced_at: now,
      metadata: {
        webhook_topic: topic,
        wc_status: status,
        payment_method: stringValue(payload.payment_method) || null,
        account_link: checkout.link ? "checkout_token" : "legacy_fallback"
      }
    }, { onConflict: "user_id" });
    if (subscriptionError) throw subscriptionError;

    if (checkout.link) {
      const { error: consumeError } = await admin
        .from("woocommerce_checkout_sessions")
        .update({ consumed_at: now, woocommerce_subscription_id: subscriptionId })
        .eq("id", checkout.link.id);
      if (consumeError) throw consumeError;
    }

    const targetPlanId = active ? plan.planId : await freePlanId(admin);
    if (targetPlanId) {
      const { error: profileError } = await admin.from("profiles").update({ current_plan_id: targetPlanId }).eq("id", userId);
      if (profileError) throw profileError;
    }

    await markEvent(admin, eventId, {
      processing_status: "completed",
      processed_at: now,
      last_error: null,
      safe_summary: {
        woocommerce_subscription_id: subscriptionId,
        user_id: userId,
        plan_slug: plan.planSlug,
        product_id: plan.productId,
        status,
        paid_access: active,
        account_link: checkout.link ? "checkout_token" : "legacy_fallback"
      }
    });

    return json({ received: true, matched: true, paidAccess: active });
  } catch (error) {
    const safeMessage = error instanceof Error ? error.message.slice(0, 500) : "Verified WooCommerce webhook processing failed.";
    await markEvent(admin, eventId, { processing_status: "failed", last_error: safeMessage });
    await admin.from("system_errors").insert({
      error_code: "woocommerce_webhook_processing",
      safe_message: "A verified WooCommerce subscription event could not be processed.",
      function_name: "woocommerce-webhook"
    });
    return new Response("Processing failed", { status: 500 });
  }
});
