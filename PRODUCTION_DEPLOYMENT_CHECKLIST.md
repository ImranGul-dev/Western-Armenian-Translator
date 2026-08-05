# Production Deployment Checklist

## Source and tests

- [ ] `npm install`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run verify`
- [ ] `npm run build`
- [ ] `npm run zip`
- [ ] ZIP excludes secrets, env-local files, dependencies, build output, logs, caches, Git data, and older ZIPs

## Supabase

- [ ] Project linked
- [ ] `npx supabase db push` completed
- [ ] RLS enabled on overrides, widget sites, and widget usage
- [ ] `npm run supabase:functions:deploy` completed
- [ ] OpenAI and rate-limit secrets configured
- [ ] `SITE_URL` uses canonical HTTPS origin
- [ ] `ALLOWED_ORIGINS` includes localhost only for development and exact production frontend origins
- [ ] Auth Site URL and redirect URLs configured

## Manual plans

- [ ] Normal user cannot call admin override RPC
- [ ] Admin can grant Premium
- [ ] Admin can grant Business
- [ ] Admin can force Free and sees Stripe-charge warning
- [ ] Admin can return control to billing/default
- [ ] Expired override falls back automatically
- [ ] Audit rows contain actor, target, previous/new state, expiration, and reason
- [ ] No Stripe records are created by a manual grant

## Widgets

- [ ] Free plan disabled by default
- [ ] Eligible Stripe user can create an installation
- [ ] Eligible manual-plan user can create an installation
- [ ] Correct domain succeeds
- [ ] Incorrect and missing Origin fail before OpenAI
- [ ] Disabled/deleted/old rotated keys fail
- [ ] New rotated key succeeds after embed replacement
- [ ] Request, monthly, and rate limits work
- [ ] Unsupported/malformed requests fail safely
- [ ] Usage stores no source or translated text
- [ ] Host CSS isolation and mobile layout checked with `examples/widget-host-test.html`

## Netlify and Stripe

- [ ] Browser-safe public variables only in Netlify
- [ ] Canonical `NEXT_PUBLIC_SITE_URL` set
- [ ] Live Stripe prices match Admin → Plans
- [ ] Portal configured
- [ ] Webhook endpoint and signing secret configured
- [ ] Billing enabled in Supabase first, then Netlify
- [ ] Checkout, portal, invoice, card update, plan change, cancellation, webhook retry/idempotency, admin action, and refund tested
