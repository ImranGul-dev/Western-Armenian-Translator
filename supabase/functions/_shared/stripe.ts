import Stripe from "npm:stripe@22.0.0";

export function createStripeClient(secretKey: string): Stripe {
  if (!secretKey) throw new Error("Stripe is not configured.");
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
    timeout: 20_000
  });
}

export function priceToPlan(priceId: string | null | undefined, premium: string, business: string): "free" | "premium" | "business" {
  if (priceId && premium && priceId === premium) return "premium";
  if (priceId && business && priceId === business) return "business";
  return "free";
}

export function unixToIso(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}

export function stripeId(value: string | { id: string } | null | undefined): string {
  if (typeof value === "string") return value;
  return value?.id ?? "";
}

export function safeStripeMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "Stripe request failed.";
  const record = error as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  const code = typeof record.code === "string" ? record.code : "";
  if (type.includes("StripeCardError") || code === "card_declined") return "The payment method was declined.";
  if (code === "resource_missing") return "The requested billing record no longer exists.";
  if (code === "rate_limit") return "Stripe is temporarily busy. Please try again.";
  return "The billing request could not be completed.";
}

export async function constructStripeEvent(secretKey: string, rawBody: string, signature: string, webhookSecret: string): Promise<Stripe.Event> {
  const stripe = createStripeClient(secretKey);
  const cryptoProvider = Stripe.createSubtleCryptoProvider();
  return await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret, undefined, cryptoProvider);
}

export type { Stripe };
