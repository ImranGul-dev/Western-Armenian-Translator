# Project Setup Guide

## Requirements

- Node.js 20.9 or newer (Netlify is configured for Node 22)
- npm
- Supabase CLI
- A Supabase project for remote deployment

## Install and configure

```bash
npm install
cp .env.example .env.local
```

Set only:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_LOCAL_PUBLIC_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_BILLING_ENABLED=false
```

Start and reset local Supabase:

```bash
npx supabase start
npx supabase db reset
```

Create `supabase/functions/.env.local` from its example, using local/private development values, then run:

```bash
npm run supabase:functions
npm run dev
```

Do not commit `.env.local`, `supabase/functions/.env.local`, OpenAI keys, Stripe keys, webhook secrets, database passwords, or service-role keys.

## Local widget host

Create an eligible manual plan or update a local plan through Studio, create a widget for `localhost:8080`, replace the placeholders in `examples/widget-host-test.html`, then run:

```bash
python3 -m http.server 8080 --directory examples
```

Open `http://localhost:8080/widget-host-test.html`.
