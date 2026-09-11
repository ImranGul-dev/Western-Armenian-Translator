# Armenian Keyboard Newsletter Protection and Source Tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Armenian Keyboard's direct Mailchimp footer POST with a protected local newsletter flow and add the fixed `Armenian Keyboard` Mailchimp source tag without changing the footer design or keyboard/alphabet pages.

**Architecture:** Inside the nested `armenian-keyboard/` Next.js app, add local validation, Turnstile verification, Mailchimp member/tag helpers, a local `/api/newsletter` route, and a small client form component. Preserve existing footer styling and page behavior.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Node `crypto`/`dns`, Cloudflare Turnstile Siteverify, Mailchimp Marketing API, Netlify Next runtime.

**Spec:** Cross-project design stored in `elleynote/Western-Armenian-Translator` at `docs/superpowers/specs/2026-09-12-newsletter-spam-source-tags-design.md`.

## Global Constraints

- Immediate newsletter subscription; no double opt-in.
- Mailchimp audience remains `3feeed30f4`.
- Exact source tag is `Armenian Keyboard`.
- Production Turnstile hostname is `armeniankeyboard.com`.
- Do not change the keyboard page, Armenian Alphabet page, header, footer visuals, or global design.
- No central newsletter service, new DB, Redis, Upstash, or persistent rate-limit dependency.
- Work from the latest `main`; do not reuse the prior SEO/alphabet feature branches.
- Do not merge without explicit approval.

---

### Task 1: Add newsletter validation and external-service tests first

**Files:**
- Create: `armenian-keyboard/src/newsletter.test.ts`
- Create: `armenian-keyboard/src/lib/newsletter-spam.ts`
- Create: `armenian-keyboard/src/lib/newsletter-turnstile.ts`
- Create: `armenian-keyboard/src/lib/newsletter-mailchimp.ts`

**Interfaces:**
- Produces validation helpers equivalent to the Translator reference implementation.
- Produces `verifyTurnstileToken(input): Promise<boolean>`.
- Produces `subscribeAndTagMailchimp(input)`.

- [ ] **Step 1: Write `src/newsletter.test.ts` before implementation exists**

Cover all of these behaviors with Vitest:

```ts
import { describe, expect, it } from "vitest";
import {
  NewsletterRateLimiter,
  hasMailExchange,
  isDisposableEmailDomain,
  normalizeNewsletterEmail,
  validateNewsletterSubmission,
} from "@/lib/newsletter-spam";
import { verifyTurnstileToken } from "@/lib/newsletter-turnstile";
import { subscribeAndTagMailchimp } from "@/lib/newsletter-mailchimp";
```

Assertions:

- normalize trim/lowercase
- malformed email rejection
- honeypot rejection
- under-1200ms submission rejection
- disposable domain/subdomain rejection
- Gmail accepted by disposable check
- MX/no-MX/ENOTFOUND/transient-DNS behavior
- in-memory limiter block/reset behavior
- Turnstile succeeds only with `hostname: "armeniankeyboard.com"`
- hostname mismatch fails
- Mailchimp uses normalized subscriber hash, audience `3feeed30f4`, subscribed status, and a separate tag call
- tag body is exactly `{ tags: [{ name: "Armenian Keyboard", status: "active" }] }`
- member and tag failures return different failure stages

All external calls use injected fake fetch functions.

- [ ] **Step 2: Verify RED**

From `armenian-keyboard/` run:

```bash
npm test -- src/newsletter.test.ts
```

Expected: FAIL because newsletter helper modules are missing.

- [ ] **Step 3: Implement `src/lib/newsletter-spam.ts`**

Port the approved behavior exactly:

- email normalization and length validation
- 1200ms minimum form age
- conservative disposable-domain blocklist
- MX lookup with definitive missing-domain failures rejected and transient DNS failures fail-open
- best-effort in-memory rate limiter

- [ ] **Step 4: Implement `src/lib/newsletter-turnstile.ts`**

POST URL-encoded `secret`, `response`, and optional `remoteip` to Cloudflare Siteverify, use a 5-second timeout, fail closed, and require exact hostname match.

- [ ] **Step 5: Implement `src/lib/newsletter-mailchimp.ts`**

- normalize/lowercase email for MD5
- PUT member with `status_if_new: "subscribed"` and `status: "subscribed"`
- Basic auth using API key
- POST source tag separately with status `active`
- do not delete/archive/remove other tags
- use 5-second timeout

- [ ] **Step 6: Verify GREEN**

```bash
npm test -- src/newsletter.test.ts
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/newsletter.test.ts src/lib/newsletter-spam.ts src/lib/newsletter-turnstile.ts src/lib/newsletter-mailchimp.ts
git commit -m "feat: add keyboard newsletter services"
```

---

### Task 2: Add the local newsletter route

**Files:**
- Create: `armenian-keyboard/src/app/api/newsletter/route.ts`
- Modify: `armenian-keyboard/src/newsletter.test.ts`

**Interfaces:**
- POST `/api/newsletter`
- Fixed tag `Armenian Keyboard`
- Expected hostname `armeniankeyboard.com`

- [ ] **Step 1: Add failing route assertions**

Require the source to contain:

```ts
expect(routeSource).toContain('const NEWSLETTER_SOURCE_TAG = "Armenian Keyboard"');
expect(routeSource).toContain('const EXPECTED_TURNSTILE_HOSTNAME = "armeniankeyboard.com"');
expect(routeSource).toContain('formData.get("cf-turnstile-response")');
expect(routeSource).toContain("verifyTurnstileToken");
expect(routeSource).toContain("subscribeAndTagMailchimp");
expect(routeSource).not.toContain("list-manage.com/subscribe/post");
```

Run focused test and verify RED.

- [ ] **Step 2: Implement `route.ts`**

Use `runtime = "nodejs"` and orchestrate:

1. safe form parse
2. local validation
3. honeypot fake success
4. rate limits: IP 5/15min, normalized email 3/hour
5. required env check
6. Turnstile validation
7. MX validation
8. Mailchimp immediate member upsert
9. source tag `Armenian Keyboard`
10. generic HTML success/error response

Use Netlify client IP header then `x-forwarded-for` fallback.

Required server env vars:

```text
MAILCHIMP_API_KEY
MAILCHIMP_SERVER_PREFIX
MAILCHIMP_AUDIENCE_ID
TURNSTILE_SECRET_KEY
```

- [ ] **Step 3: Run tests**

```bash
npm test -- src/newsletter.test.ts
npm test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/newsletter/route.ts src/newsletter.test.ts
git commit -m "feat: add keyboard newsletter api"
```

---

### Task 3: Replace the footer's direct Mailchimp form with a protected client component

**Files:**
- Create: `armenian-keyboard/src/components/FooterNewsletterForm.tsx`
- Modify: `armenian-keyboard/src/components/Footer.tsx`
- Modify: `armenian-keyboard/src/newsletter.test.ts`
- Do not modify visual footer CSS/global styles unless preview demonstrates a real Turnstile collision.

**Interfaces:**
- Form posts to `/api/newsletter`.
- Preserves current visible email field/button wording.
- Includes hidden timing/honeypot and Turnstile widget.

- [ ] **Step 1: Add failing form assertions**

Require:

```ts
expect(formSource).toContain('action="/api/newsletter"');
expect(formSource).toContain('name="EMAIL"');
expect(formSource).toContain('name="_newsletter_started_at"');
expect(formSource).toContain("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
expect(formSource).toContain("interaction-only");
expect(formSource).toContain("challenges.cloudflare.com/turnstile/v0/api.js");
expect(footerSource).toContain("<FooterNewsletterForm />");
expect(footerSource).not.toContain("list-manage.com/subscribe/post");
```

Run focused test and verify RED.

- [ ] **Step 2: Create `FooterNewsletterForm.tsx`**

Use `"use client"`, a start timestamp set after hydration, and `next/script` for:

```tsx
<Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
```

Widget:

```tsx
<div
  className="cf-turnstile"
  data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
  data-appearance="interaction-only"
/>
```

Preserve current IDs/classes/placeholder/button wording from the footer wherever possible so existing styling remains stable.

- [ ] **Step 3: Replace only the newsletter form block in `Footer.tsx`**

Import/render the new component in the exact existing footer location. Do not change footer columns, links, social icons, artwork, copyright, or surrounding markup.

- [ ] **Step 4: Confirm unrelated pages are unchanged**

```bash
git diff -- src/app/page.tsx src/app/armenian-alphabet/page.tsx src/components/Header.tsx
```

Expected: no diff.

- [ ] **Step 5: Run tests**

```bash
npm test -- src/newsletter.test.ts
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/FooterNewsletterForm.tsx src/components/Footer.tsx src/newsletter.test.ts
git commit -m "feat: protect keyboard newsletter form"
```

---

### Task 4: Document required environment variables

**Files:**
- Modify: `armenian-keyboard/.env.example`

- [ ] **Step 1: Append**

```dotenv
# Footer newsletter protection and Mailchimp source tagging.
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
MAILCHIMP_API_KEY=
MAILCHIMP_SERVER_PREFIX=us5
MAILCHIMP_AUDIENCE_ID=3feeed30f4
```

- [ ] **Step 2: Verify no real secrets are present**

```bash
git diff -- .env.example
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: add keyboard newsletter environment variables"
```

---

### Task 5: Verify build and open Draft PR

**Files:**
- No production changes expected.

- [ ] **Step 1: Run full feature verification from `armenian-keyboard/`**

```bash
npm test
npm run typecheck
npm run verify:source
npm run build
```

Run targeted lint on all newsletter files and Footer files changed by this branch. Then run full `npm run lint` to document the known existing baseline errors in `Header.tsx` and `KeyboardApp.tsx` if they remain unchanged on current `main`; do not fix unrelated baseline lint as part of this feature.

- [ ] **Step 2: Review final diff**

Confirm:

- exact tag `Armenian Keyboard`
- exact hostname `armeniankeyboard.com`
- no direct Mailchimp public form URL in Footer
- no changes to keyboard page, alphabet page, Header, or visual styling
- no secrets committed

- [ ] **Step 3: Create Draft PR**

Title:

```text
Protect keyboard newsletter and add source tag
```

PR body must call out immediate subscription, Turnstile, Mailchimp API, exact tag, env requirements, untouched keyboard/alphabet pages, and any unchanged baseline lint failures.

- [ ] **Step 4: Configure Netlify environment variables outside Git**

Create/use a production Turnstile widget restricted to `armeniankeyboard.com` and add the five required variables to the Keyboard Netlify site.

- [ ] **Step 5: Smoke-test Deploy Preview**

Verify footer visual parity, valid newsletter subscription, immediate Mailchimp contact, active `Armenian Keyboard` tag, disposable-address blocking, and Turnstile verification.

Do not merge until explicit approval.
