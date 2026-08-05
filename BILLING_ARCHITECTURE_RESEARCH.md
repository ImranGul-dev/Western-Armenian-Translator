# Billing Architecture Research and Decision

Research date: 5 August 2026

## Decision

Use **Stripe Billing directly** as the billing source of truth for the custom Next.js/Supabase application.

The application keeps:

- Supabase Auth for application accounts and roles.
- Supabase Postgres for plans, access state, synchronized subscription summaries, invoices, payment history, usage, and audit records.
- Stripe Checkout for the first paid subscription.
- Stripe Customer Portal for updating cards, invoices, upgrades, downgrades, and self-service cancellation.
- Stripe webhooks for authoritative access changes.
- A custom admin Edge Function for pause, resume, plan changes, cancellation, refund, and manual synchronization.

## Why direct Stripe is the best fit

Stripe's hosted Customer Portal already supports the exact customer features requested:

- Update billing information and payment methods.
- View, download, and pay current and past invoices.
- Upgrade or downgrade subscriptions.
- Cancel immediately or at the end of the billing period.
- Use focused deep links for payment-method updates, subscription changes, and cancellation.

Stripe's Subscriptions API supports administrator plan changes with explicit proration behavior, end-of-period cancellation, and paused payment collection. Stripe Checkout provides a secure hosted signup and payment page. Stripe webhooks make the server—not the browser—the authority for paid access.

For portal-managed Premium and Business switching, both recurring prices should be configured on one Stripe product. This preserves immediate upgrades and allows end-of-period downgrade scheduling under Stripe's current portal rules.

## Why WooCommerce was not selected as the primary billing engine

WooCommerce Subscriptions can provide subscriptions, renewal orders, payment-method changes, switching, cancellation, and store-manager controls. It is a valid solution when the product itself is a WordPress/WooCommerce application.

For this project, WooCommerce would introduce a second account system in WordPress in addition to Supabase Auth. A seamless flow would therefore require custom account linking or single sign-on, a WordPress bridge plugin, WooCommerce REST credentials, subscription webhooks, retry/reconciliation logic, and a decision about whether the WordPress or Supabase account owns identity. Customer billing management would also happen in the WooCommerce My Account area unless a custom proxy were built.

**Engineering inference:** because the translator is already a separate Next.js/Supabase application, direct Stripe removes the duplicate identity system and synchronization layer while preserving the subscription and portal capabilities the client demonstrated in WooCommerce.

WooCommerce can still be used later for unrelated store products. It should not own translator access unless the client explicitly accepts a separate WordPress billing account and the extra integration maintenance.

## Implemented flow

```text
Anonymous visitor
  -> limited translator usage
  -> account signup with Supabase Auth
  -> plan selection
  -> Stripe Checkout
  -> verified Stripe webhook
  -> Supabase subscription and plan synchronized
  -> paid translation limits unlocked

Signed-in subscriber
  -> Billing dashboard
  -> Stripe Customer Portal
  -> update card / invoices / plan switch / cancellation
  -> verified webhook
  -> Supabase access synchronized

Administrator
  -> Subscriptions page
  -> pause/resume/change/cancel/sync
  -> stripe-admin Edge Function
  -> Stripe API
  -> audit log + local synchronization
```

## Security model

- Stripe secret and webhook secrets are stored only in Supabase Edge Function Secrets.
- Browser code receives only the Supabase publishable key.
- Customer card data is collected and displayed only by Stripe-hosted pages.
- Stripe webhook signatures are verified against the raw request body.
- Webhook event IDs are stored to make event processing idempotent.
- Frontend route protection is supplemented by Supabase Row Level Security and backend role checks.
- Administrator billing actions are recorded in `admin_audit_log`.
- Paid access is derived from synchronized subscription status, not a frontend success page.

## Query-review privacy decision

The client requested a way to view translation queries. The implementation is privacy-controlled:

- Anonymous translation text is not stored.
- Signed-in users can save private history.
- Users have a separate, optional consent setting allowing saved translations to appear in the admin query-review screen.
- Administrators can only read history rows marked `admin_visible`.
- Withdrawing consent hides existing saved translations from the admin review area and keeps future translations private.
- Users can delete their history.

This gives the client a quality-review workflow without silently exposing every user's private translation text.

## Current Stripe API compatibility

Stripe's newer invoicing model moved the invoice-to-subscription relationship under `invoice.parent.subscription_details.subscription`, payment associations under `invoice.payments.data[].payment`, and billing-period timestamps to subscription items. The Edge Functions read these current locations and retain older-field fallbacks for Stripe accounts on earlier API versions.

## Official research sources

Stripe:

- Customer Portal overview: https://docs.stripe.com/customer-management
- Customer Portal configuration: https://docs.stripe.com/customer-management/configure-portal
- Customer Portal deep links: https://docs.stripe.com/customer-management/portal-deep-links
- Subscription updates and prorations: https://docs.stripe.com/api/subscriptions/update
- Modify subscriptions: https://docs.stripe.com/billing/subscriptions/change
- Stripe Checkout: https://docs.stripe.com/payments/checkout
- Localized currencies and Adaptive Pricing: https://docs.stripe.com/payments/currencies/localize-prices

Supabase:

- Edge Functions: https://supabase.com/docs/guides/functions
- Securing Edge Functions and external webhooks: https://supabase.com/docs/guides/functions/auth
- Stripe webhook example: https://supabase.com/docs/guides/functions/examples/stripe-webhooks

WooCommerce comparison:

- WooCommerce Subscriptions overview: https://woocommerce.com/document/subscriptions/
- Subscriber account features: https://woocommerce.com/document/subscriptions/customers-view/
- Payment-method management: https://woocommerce.com/document/subscriptions/customers-view/subscriber-payment-methods/
- Subscription switching: https://woocommerce.com/document/subscriptions/switching-guide/
- Subscriptions REST API: https://woocommerce.github.io/subscriptions-rest-api-docs/
- WooCommerce webhooks: https://woocommerce.com/document/webhooks/
