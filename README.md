# Western Armenian Translator

A production-oriented Tun-branded translation SaaS built with Next.js App Router, React, TypeScript, Supabase Auth/Postgres/RLS/Edge Functions, OpenAI Responses API, direct Stripe Billing, and Netlify.

## Preserved product areas

The application supports English ↔ Western Armenian and Eastern Armenian → Western Armenian, approved glossary/rule/example retrieval, prompt-injection safeguards, anonymous and account usage limits, history, favorites, feedback, roles, privacy-controlled query review, knowledge administration, direct Stripe Checkout/Portal/webhooks/refunds, billing-disabled mode, manual plan grants, and secure website widgets.

## New production features

- Centralized effective-plan resolution: admin, active manual override, valid Stripe subscription, then Free.
- Auditable manual Free/Premium/Business access without fake Stripe records.
- Customer widget dashboard at `/dashboard/widget`.
- Administrator widget dashboard at `/admin/widgets`.
- Domain-locked public widget script at `/tun-translator-widget.js`.
- Public no-JWT `widget-translate` Edge Function with its own origin, entitlement, site-limit, character-limit, rate-limit, and privacy controls.

## Local setup

```bash
npm install
cp .env.example .env.local
npx supabase start
npx supabase db reset
npm run supabase:functions
npm run dev
```

Keep only browser-safe `NEXT_PUBLIC_*` values in `.env.local`. Put OpenAI, Stripe, rate-limit salt, site URL, and service credentials in Supabase Edge Function Secrets or `supabase/functions/.env.local` for local function serving. Never commit either local env file.

## Verification

```bash
npm run lint
npm run test
npm run verify
npm run build
npm run zip
```

Live endpoint smoke testing requires configured local or remote Supabase values:

```bash
npm run test:edge
```

## Deployment

Apply all forward migrations, deploy all Edge Functions with `npm run supabase:functions:deploy`, configure Supabase Auth redirect URLs, deploy Next.js to Netlify, then configure Stripe live products, portal, and webhook. See `PROJECT_SETUP_GUIDE.md`, `SUPABASE_SETUP_GUIDE.md`, `NETLIFY_DEPLOYMENT_GUIDE.md`, `EMBED_WIDGET_GUIDE.md`, and `PRODUCTION_DEPLOYMENT_CHECKLIST.md`.
