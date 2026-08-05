# Netlify Deployment Guide

## GitHub

```bash
git init
git add .
git commit -m "Add secure embed widgets and manual plan overrides"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

Confirm no `.env.local`, `supabase/functions/.env.local`, `.next`, `node_modules`, logs, or ZIP files are staged.

## Create the Netlify site

1. Netlify → Add new site → Import an existing project.
2. Select the GitHub repository and `main` branch.
3. Build command: `npm run build`.
4. Publish directory: `.next`.
5. Node version is already set to 22 in `netlify.toml`.

## Public environment variables

Set only:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_BROWSER_SAFE_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL=https://YOUR_NETLIFY_SITE.netlify.app
NEXT_PUBLIC_BILLING_ENABLED=false
```

Do not place OpenAI, Stripe, webhook, database, or Supabase service-role secrets in Netlify.

Deploy, note the final HTTPS URL, then update `NEXT_PUBLIC_SITE_URL`, Supabase Auth URLs, and Supabase Edge Function `SITE_URL`/`ALLOWED_ORIGINS` to the canonical domain. Trigger a new Netlify deploy after changing public variables.

## Stripe after the frontend URL is final

1. Create live recurring Premium and Business products/prices.
2. Enter Price IDs in Admin → Plans and ensure amount/currency/interval match.
3. Configure the Stripe Customer Portal for payment methods, invoices, plan changes, and cancellation.
4. Create a webhook endpoint at `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook` for the events documented in `STRIPE_SETUP_GUIDE.md`.
5. Save the live `STRIPE_SECRET_KEY`, webhook signing secret, and portal configuration ID in Supabase Edge Function Secrets.
6. Set Edge Function `SITE_URL` and `ALLOWED_ORIGINS` to production values.
7. Set Edge Function `BILLING_ENABLED=true`.
8. Set Netlify `NEXT_PUBLIC_BILLING_ENABLED=true` and redeploy.
9. Complete a real low-risk live checkout and verify subscription, payment, portal, webhook idempotency, upgrade/downgrade, cancellation, and refund behavior.
