# Complete Stripe Billing Setup Guide

This guide configures signup, recurring subscriptions, payment history, card updates, upgrades, downgrades, customer cancellation, the complete customer billing portal, admin pause/resume/cancel/refund actions, and webhook synchronization.

Keep `BILLING_ENABLED=false` until every test-mode step is complete.

## 1. Apply the Phase 3 database migration

From the project folder:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

The new migration is:

```text
supabase/migrations/20260805000100_complete_billing_portal.sql
```

It adds:

- Stripe plan identifiers.
- Detailed subscription synchronization fields.
- `billing_payments`.
- `admin_audit_log`.
- Query-review consent and admin visibility.
- Billing and query-review RLS policies.
- `admin_commercial_stats()`.

## 2. Create the Stripe product and recurring prices

Use Stripe **test mode**.

Create one product:

```text
Western Armenian Translator
```

Add two monthly recurring prices to that product:

### Premium price

- Price nickname: `Premium`
- Initial configurable price: USD 9.00 per month
- Optional lookup key: `wat_premium_monthly`

### Business price

- Price nickname: `Business`
- Initial configurable price: USD 29.00 per month
- Optional lookup key: `wat_business_monthly`

Keeping both prices on the same Stripe product is recommended because Stripe's portal can schedule end-of-period downgrades between prices belonging to the same product. Immediate upgrades and ordinary plan switching also remain available.

Copy the two Price IDs. They begin with `price_`. Do not use the Product ID where the application asks for a Price ID.

## 3. Configure local currencies

The simplest configuration is one default recurring currency. For additional local currencies, add currency options to each Stripe Price when supported by the account and subscription configuration.

Stripe may offer Adaptive Pricing in the Dashboard depending on account eligibility and the active Checkout configuration. Enable it only after confirming how subscription currency is presented in test mode. Do not promise automatic currency localization until it has been tested for the client's Stripe account and countries.

## 4. Configure the Stripe Customer Portal

In Stripe test mode, open Customer Portal settings and enable:

- Invoice history.
- Payment-method updates.
- Customer billing-information updates.
- Subscription cancellation.
- Cancellation reasons.
- Plan switching.
- Proration for upgrades.
- End-of-period behavior for downgrades, where appropriate.
- Premium and Business as allowed switchable products/prices.

Recommended behavior:

- Upgrade: apply immediately and invoice the proration.
- Downgrade: schedule for the end of the billing period.
- Cancellation: at the end of the billing period by default.

Copy the Portal Configuration ID if you create a dedicated configuration. It begins with `bpc_`. Leaving this environment value blank uses the Stripe account's default portal configuration.

## 5. Add Supabase Edge Function secrets

Create a local file only for setting secrets:

```text
supabase/functions/.env.local
```

Use:

```env
OPENAI_API_KEY=YOUR_OPENAI_KEY
OPENAI_MODEL=gpt-5-mini
ALLOWED_ORIGINS=http://localhost:3000,https://YOUR_NETLIFY_SITE.netlify.app,https://YOUR_DOMAIN.com
RATE_LIMIT_SALT=YOUR_LONG_RANDOM_SECRET
SITE_URL=http://localhost:3000

BILLING_ENABLED=false
STRIPE_SECRET_KEY=sk_test_REPLACE_ME
STRIPE_WEBHOOK_SECRET=whsec_REPLACE_AFTER_WEBHOOK_CREATION
STRIPE_PRICE_PREMIUM_MONTHLY=price_REPLACE_ME
STRIPE_PRICE_BUSINESS_MONTHLY=price_REPLACE_ME
STRIPE_PORTAL_CONFIGURATION_ID=bpc_REPLACE_ME
STRIPE_TAX_ENABLED=false
```

Set the secrets:

```bash
npx supabase secrets set --env-file supabase/functions/.env.local
```

Never commit `.env.local` or `supabase/functions/.env.local`.

## 6. Deploy all Edge Functions

```bash
npm run supabase:functions:deploy
```

This deploys:

```text
translate
stripe-checkout
stripe-portal
stripe-webhook
stripe-admin
delete-account
```

## 7. Create the Stripe webhook endpoint

Use this endpoint:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook
```

Subscribe to:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.paused
customer.subscription.resumed
invoice.created
invoice.finalized
invoice.finalization_failed
invoice.updated
invoice.paid
invoice.payment_succeeded
invoice.payment_action_required
invoice.payment_failed
invoice.voided
invoice.marked_uncollectible
charge.refunded
```

Copy the signing secret beginning with `whsec_`, update `STRIPE_WEBHOOK_SECRET`, and run the secrets command again.

The webhook function must remain configured with `verify_jwt = false` because Stripe authenticates using its signature. The function verifies that signature itself.

## 8. Turn on billing in test mode

Update the Supabase secret:

```env
BILLING_ENABLED=true
```

Run:

```bash
npx supabase secrets set --env-file supabase/functions/.env.local
```

In the frontend `.env.local`, set:

```env
NEXT_PUBLIC_BILLING_ENABLED=true
```

Restart the local Next.js server after changing `.env.local`.

## 9. Create the first admin

1. Create a normal account at `/signup`.
2. Copy the user UUID from Supabase Authentication → Users.
3. Run in Supabase SQL Editor:

```sql
update public.profiles
set role = 'admin'
where id = 'PASTE_USER_UUID';
```

Log out and back in so the interface reloads the role.

## 10. Test the complete customer flow

Use a fresh non-admin account.

1. Sign up and confirm the email if confirmation is enabled.
2. Open `/pricing`.
3. Choose Premium.
4. Complete Stripe Checkout with a Stripe test card.
5. Return to `/dashboard/billing`.
6. Confirm the subscription shows Active.
7. Confirm an invoice appears after the webhook arrives.
8. Open the complete billing portal.
9. Test payment-method update.
10. Test Premium ↔ Business switching.
11. Test end-of-period cancellation.
12. Undo the cancellation before the period ends.

Use Stripe's official test cards and test clocks where applicable. Never test with a real card in test mode.

## 11. Test the admin flow

Log in as an admin and open:

```text
/admin/users
/admin/subscriptions
/admin/payments
/admin/queries
```

Verify:

- Users show free or subscriber state.
- The subscription appears with plan and dates.
- Sync updates the local record.
- Pause suspends app access and pauses Stripe collection.
- Resume restores access and collection.
- Cancel at period end sets the scheduled cancellation flag.
- Cancel now immediately terminates the subscription.
- Refund creates a Stripe refund and records the action.
- Every admin billing action creates an `admin_audit_log` row.

Use separate disposable test subscriptions when testing destructive actions.

## 12. Test query-review consent

1. Log in as a normal user.
2. Open `/dashboard/settings`.
3. Enable saved history.
4. Enable administrator review consent.
5. Run a translation.
6. Log in as admin and open `/admin/queries`.
7. Confirm the translation appears.
8. Turn consent off.
9. Confirm existing saved translations disappear from the administrator query-review screen.
10. Run another translation and confirm it also remains private.

Anonymous translation text should never appear there.

## Stripe API-version compatibility

The synchronization code supports current Stripe invoicing shapes where:

- The originating subscription is read from `invoice.parent.subscription_details.subscription`.
- PaymentIntent or Charge identifiers are read from `invoice.payments.data[].payment`.
- Subscription billing periods are read from subscription items.

Legacy top-level field fallbacks are retained so older Stripe account versions and test fixtures continue to synchronize.

## 13. Production launch

Repeat the Stripe configuration in **live mode**:

- Create or activate live products and prices.
- Configure the live Customer Portal.
- Create a live webhook endpoint.
- Replace all `sk_test_`, `price_`, `bpc_`, and `whsec_` test values with live-mode values.
- Set `SITE_URL` to the final HTTPS domain.
- Update `ALLOWED_ORIGINS` with the final Netlify and custom domains.
- Set `NEXT_PUBLIC_SITE_URL` to the final HTTPS domain.
- Test one real low-value subscription and refund with client approval.

Do not mix test-mode and live-mode Price IDs or webhook secrets.

## 14. Stripe Dashboard settings to review before launch

- Business name, support email, logo and brand colors.
- Statement descriptor.
- Invoice email settings.
- Failed-payment retry and dunning settings.
- Customer Portal cancellation policy.
- Tax registration and Stripe Tax decision.
- Supported payment methods.
- Refund policy.
- Privacy policy and terms URLs.
- Local-currency behavior.

The client must approve pricing, refund policy, cancellation behavior, taxes, currencies, and customer-facing legal text before production billing is enabled.

## Administrator-managed plan configuration

After applying `20260805000200_production_branding_and_plan_admin.sql`, open `/admin/plans`. Use this page as the primary source for displayed prices, plan allowances, rate limits, features, and Stripe Price IDs. Create the Stripe Price first, then enter its identifiers and matching amount, currency, and interval. The checkout function rejects mismatched configuration.
