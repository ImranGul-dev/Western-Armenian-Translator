# Security and Client Handoff

## Exposed credentials

Any password or API key pasted into chat or sent in plain text must be treated as exposed. Revoke the old OpenAI key, create a new project-scoped key, rotate shared passwords, enable MFA and review active sessions.

## Correct secret locations

### Root `.env.local` and Netlify — browser-safe only

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_BILLING_ENABLED
```

### Supabase Edge Function secrets — private

```text
OPENAI_API_KEY
OPENAI_MODEL
RATE_LIMIT_SALT
ALLOWED_ORIGINS
BILLING_ENABLED
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_PREMIUM_MONTHLY
STRIPE_PRICE_BUSINESS_MONTHLY
SITE_URL
```

Never expose the Supabase service-role/secret key, OpenAI key or Stripe secret key in browser code.

## Database security

- Supabase Row Level Security protects profiles, history, feedback, usage, knowledge resources, subscriptions and settings.
- Role checks are enforced in PostgreSQL, not only by hiding buttons.
- Anonymous translation text is not saved in usage tables.
- Signed-in history is saved only when the user enables history.
- OpenAI Responses API storage is disabled with `store: false`.
- Stripe plans are granted only from verified webhook events.

## Collaboration and ownership

Use GitHub collaborators, Netlify team members, Supabase organization members and OpenAI project roles instead of sharing passwords. Production GitHub, Netlify, Supabase, OpenAI, Stripe, domain and DNS resources should ultimately be client-owned.

If a secret is ever committed, revoke it immediately, remove it from current files, rewrite Git history with a secret-removal tool, coordinate any force-push and rotate the secret again afterward.
