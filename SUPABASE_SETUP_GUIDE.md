# Supabase Setup Guide

## Link and apply migrations

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

`db push` applies the existing migrations plus:

```text
20260805000300_embed_widget_and_manual_plan_overrides.sql
```

Do not edit already-applied migrations. Make future schema fixes in a new timestamped migration.

## Edge Function secrets

In Supabase Dashboard open **Project Settings → Edge Functions → Secrets**, or create a local uncommitted file and run:

```bash
npm run supabase:secrets
```

Required production values:

```dotenv
OPENAI_API_KEY=YOUR_PRIVATE_KEY
OPENAI_MODEL=gpt-5-mini
ALLOWED_ORIGINS=https://YOUR_NETLIFY_SITE.netlify.app,https://YOUR_DOMAIN.com
RATE_LIMIT_SALT=LONG_RANDOM_SECRET
SITE_URL=https://YOUR_DOMAIN.com
BILLING_ENABLED=false
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PORTAL_CONFIGURATION_ID=
STRIPE_TAX_ENABLED=false
```

No extra widget secret is required. Widget keys are publishable identifiers; security comes from high entropy, rotation, exact origin validation, entitlement checks, RLS, and service-role-only public validation.

## Deploy all functions

```bash
npm run supabase:functions:deploy
```

Equivalent explicit commands:

```bash
npx supabase functions deploy translate --no-verify-jwt
npx supabase functions deploy widget-translate --no-verify-jwt
npx supabase functions deploy stripe-checkout --no-verify-jwt
npx supabase functions deploy stripe-portal --no-verify-jwt
npx supabase functions deploy stripe-webhook --no-verify-jwt
npx supabase functions deploy stripe-admin --no-verify-jwt
npx supabase functions deploy delete-account --no-verify-jwt
```

## Auth redirect URLs

In **Authentication → URL Configuration** set the production Site URL to the canonical Netlify/custom domain and add:

```text
https://YOUR_DOMAIN.com/**
https://YOUR_NETLIFY_SITE.netlify.app/**
http://localhost:3000/**
```

At minimum ensure password reset can return to `/reset-password` and login/signup flows can return to `/dashboard` and `/pricing`.
