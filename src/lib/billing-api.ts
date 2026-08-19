import type { Session } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/client";

export type PortalAction = "home" | "payment_method_update" | "subscription_update" | "subscription_cancel";
export type AdminBillingAction = "pause" | "resume" | "cancel_at_period_end" | "reactivate" | "cancel_now" | "change_plan" | "refund" | "sync";

export interface BillingConfigurationStatus {
  billing_enabled: boolean;
  stripe_secret_configured: boolean;
  webhook_secret_configured: boolean;
  portal_configuration_configured: boolean;
  site_url: string;
  tax_enabled: boolean;
  plans: Array<{
    slug: string;
    name: string;
    price_monthly_cents: number;
    currency: string;
    billing_interval: string;
    stripe_price_id: string | null;
    active: boolean;
    stripe_price_configured: boolean;
  }>;
}

async function callFunction<T>(name: string, session: Session, body: Record<string, unknown>): Promise<T> {
  const { url, key } = getSupabaseConfig();
  const response = await fetch(`${url}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "The billing request failed.");
  return data;
}

export async function startCheckout(session: Session, plan: "premium" | "business"): Promise<string> {
  const data = await callFunction<{ url?: string }>("woocommerce-checkout", session, { plan });
  if (!data.url) throw new Error("WooCommerce did not return a checkout URL.");
  return data.url;
}

// Legacy Stripe portal helpers remain available for historical/admin records
// until the customer billing page is migrated fully to WooCommerce management.
export async function openBillingPortal(session: Session, action: PortalAction = "home"): Promise<string> {
  const data = await callFunction<{ url?: string }>("stripe-portal", session, { action });
  if (!data.url) throw new Error("Stripe did not return a portal URL.");
  return data.url;
}

export async function getBillingConfigurationStatus(session: Session): Promise<BillingConfigurationStatus> {
  const data = await callFunction<{ status: BillingConfigurationStatus }>("stripe-admin", session, { action: "configuration_status" });
  return data.status;
}

export async function runAdminBillingAction(
  session: Session,
  payload: {
    action: AdminBillingAction;
    subscriptionId?: string;
    paymentId?: string;
    plan?: "premium" | "business";
    prorationBehavior?: "always_invoice" | "create_prorations" | "none";
    reason?: string;
  }
): Promise<string> {
  const data = await callFunction<{ message?: string }>("stripe-admin", session, payload);
  return data.message || "Billing action completed.";
}
