# Verb Conjugator Newsletter Protection and Source Tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Verb Conjugator's direct Mailchimp footer POST with the same protected local newsletter flow used by the Translator reference implementation and add the fixed `Verb Conjugator` Mailchimp source tag.

**Architecture:** Add a local `/api/newsletter` route, pure newsletter validation helpers, isolated Turnstile and Mailchimp API helpers, and a small client newsletter form component extracted from the current Footer. Keep the footer CSS and visual structure unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Node `crypto`/`dns`, Cloudflare Turnstile Siteverify, Mailchimp Marketing API.

**Spec:** `docs/superpowers/specs/2026-09-12-newsletter-spam-source-tags-design.md`

## Global Constraints

- Immediate newsletter subscription; no double opt-in.
- Mailchimp audience stays `3feeed30f4`.
- Exact source tag is `Verb Conjugator`.
- Production Turnstile hostname is `armenianverbs.com`.
- Footer visuals, copy, classes, and button text remain unchanged.
- No shared central service, new database, Redis, or persistent rate-limit dependency.
- Do not merge without explicit approval.

---

### Task 1: Add failing newsletter validation and service tests

**Files:**
- Create: `src/newsletter.test.ts`
- Create: `src/lib/newsletter-spam.ts`
- Create: `src/lib/newsletter-turnstile.ts`
- Create: `src/lib/newsletter-mailchimp.ts`

**Interfaces:**
- Produces: `normalizeNewsletterEmail(value: string): string`
- Produces: `validateNewsletterSubmission(input)`
- Produces: `hasMailExchange(domain, resolver?)`
- Produces: `NewsletterRateLimiter`
- Produces: `verifyTurnstileToken(input): Promise<boolean>`
- Produces: `mailchimpSubscriberHash(email): string`
- Produces: `subscribeAndTagMailchimp(input)`

- [ ] **Step 1: Write `src/newsletter.test.ts` before production helpers exist**

The test must cover:

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

- `" Learner@Example.COM "` normalizes to `learner@example.com`.
- malformed email returns `invalid_email`.
- filled honeypot returns `honeypot`.
- form age under 1200ms returns `too_fast`.
- `mailinator.com` and subdomains are disposable.
- Gmail is not disposable.
- MX records return true; no MX returns false; `ENOTFOUND` returns false; `EAI_AGAIN` returns true.
- limiter permits first N calls, blocks N+1, and resets after window.
- Turnstile succeeds only for `{ success: true, hostname: "armenianverbs.com" }`.
- Turnstile hostname mismatch returns false.
- Mailchimp helper performs member upsert and second tag request.
- Tag JSON is exactly `{ tags: [{ name: "Verb Conjugator", status: "active" }] }`.
- Member failure returns `{ ok: false, stage: "member" }`.
- Tag failure returns `{ ok: false, stage: "tag" }`.

Use injected fake fetch functions rather than real external calls.

- [ ] **Step 2: Run the focused test to verify RED**

```bash
npm test -- src/newsletter.test.ts
```

Expected: FAIL because the newsletter modules do not exist.

- [ ] **Step 3: Implement `src/lib/newsletter-spam.ts`**

Port the proven Translator behavior:

- trim/lowercase email
- basic email regex and maximum lengths
- existing Mailchimp honeypot string handled by route/form
- 1200ms minimum age
- conservative disposable-domain set
- MX lookup using `node:dns/promises`
- `ENOTFOUND`, `ENODATA`, `ESERVFAIL` -> false
- other transient resolver failures -> true
- in-memory `NewsletterRateLimiter`

- [ ] **Step 4: Implement `src/lib/newsletter-turnstile.ts`**

Use the same helper contract as the Translator plan, 5-second timeout, POST to Siteverify, and exact hostname comparison.

- [ ] **Step 5: Implement `src/lib/newsletter-mailchimp.ts`**

Use the same helper contract as the Translator reference implementation:

- normalized email MD5 subscriber hash
- member PUT with `status_if_new: "subscribed"`, `status: "subscribed"`
- separate tags POST
- Basic auth
- 5-second timeout
- no deletion/archive behavior

- [ ] **Step 6: Run focused and full tests**

```bash
npm test -- src/newsletter.test.ts
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/newsletter.test.ts src/lib/newsletter-spam.ts src/lib/newsletter-turnstile.ts src/lib/newsletter-mailchimp.ts
git commit -m "feat: add protected newsletter services"
```

---

### Task 2: Create the local newsletter API route

**Files:**
- Create: `src/app/api/newsletter/route.ts`
- Modify: `src/newsletter.test.ts`

**Interfaces:**
- Produces POST `/api/newsletter`
- Fixed source tag: `Verb Conjugator`
- Expected hostname: `armenianverbs.com`

- [ ] **Step 1: Add failing route source assertions**

Read the route source in `src/newsletter.test.ts` and assert it contains:

```ts
expect(routeSource).toContain('const NEWSLETTER_SOURCE_TAG = "Verb Conjugator"');
expect(routeSource).toContain('const EXPECTED_TURNSTILE_HOSTNAME = "armenianverbs.com"');
expect(routeSource).toContain('formData.get("cf-turnstile-response")');
expect(routeSource).toContain("verifyTurnstileToken");
expect(routeSource).toContain("subscribeAndTagMailchimp");
expect(routeSource).not.toContain("list-manage.com/subscribe/post");
```

Run focused test and verify RED because the route is missing.

- [ ] **Step 2: Implement the route orchestration**

Create `src/app/api/newsletter/route.ts` with `runtime = "nodejs"` and the same order as the approved design:

1. parse formData
2. local validation
3. honeypot fake-success short circuit
4. IP/email best-effort limits (5/15min, 3/hour)
5. required env presence check
6. Turnstile verification
7. MX check
8. Mailchimp member upsert
9. Mailchimp tag `Verb Conjugator`
10. generic success/error HTML response

Use Netlify `x-nf-client-connection-ip`, fallback first `x-forwarded-for` value.

Required env vars:

```text
MAILCHIMP_API_KEY
MAILCHIMP_SERVER_PREFIX
MAILCHIMP_AUDIENCE_ID
TURNSTILE_SECRET_KEY
```

Response copy follows the approved design.

- [ ] **Step 3: Run tests**

```bash
npm test -- src/newsletter.test.ts
npm test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/newsletter/route.ts src/newsletter.test.ts
git commit -m "feat: add verb newsletter api"
```

---

### Task 3: Extract a protected client newsletter form while preserving the footer

**Files:**
- Create: `src/components/FooterNewsletterForm.tsx`
- Modify: `src/components/Footer.tsx`
- Modify: `src/newsletter.test.ts`
- Do not modify: `src/components/Footer.module.css`

**Interfaces:**
- Client form posts to `/api/newsletter`
- Uses existing footer CSS module class names
- Includes honeypot, `_newsletter_started_at`, Turnstile widget

- [ ] **Step 1: Add failing source assertions**

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

Use `"use client"`, `useEffect`, and `useState` for the start timestamp. Preserve existing CSS classes from `Footer.module.css`:

- `newsletterForm`
- `srOnly`
- `newsletterInput`
- `honeypot`
- `newsletterButton`

Keep placeholder/value/button wording exactly as current footer.

Add:

```tsx
<Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
<div
  className="cf-turnstile"
  data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
  data-appearance="interaction-only"
/>
```

- [ ] **Step 3: Replace only the inline `NewsletterSignup` implementation in `Footer.tsx`**

Import `FooterNewsletterForm` and render it in the same location. Remove `MAILCHIMP_ACTION` and the old inline form function. Do not change footer groups, artwork, social links, CSS class placement, or copy.

- [ ] **Step 4: Confirm CSS is unchanged**

```bash
git diff -- src/components/Footer.module.css
```

Expected: no diff.

- [ ] **Step 5: Run tests**

```bash
npm test -- src/newsletter.test.ts
npm test
```

Expected: PASS, including existing `footerConsistency.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/components/FooterNewsletterForm.tsx src/components/Footer.tsx src/newsletter.test.ts
git commit -m "feat: protect verb newsletter form"
```

---

### Task 4: Add environment-variable documentation

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Append these placeholders**

```dotenv
# Footer newsletter protection and Mailchimp source tagging.
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
MAILCHIMP_API_KEY=
MAILCHIMP_SERVER_PREFIX=us5
MAILCHIMP_AUDIENCE_ID=3feeed30f4
```

- [ ] **Step 2: Review the diff for accidental secrets**

```bash
git diff -- .env.example
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: add newsletter environment variables"
```

---

### Task 5: Verify and open Draft PR

**Files:**
- No production changes expected.

- [ ] **Step 1: Run fresh verification**

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: PASS. If a baseline lint failure already exists on `main`, compare before changing unrelated files.

- [ ] **Step 2: Review diff**

Confirm:

- exact `Verb Conjugator` source tag
- exact `armenianverbs.com` Turnstile hostname
- local `/api/newsletter` form action
- no direct public Mailchimp form action
- `Footer.module.css` unchanged
- no secrets committed

- [ ] **Step 3: Create Draft PR**

Title:

```text
Protect verb newsletter and add source tag
```

PR body should list Turnstile, local validation, Mailchimp API, immediate subscription, exact tag, required Netlify env vars, and no footer design change.

- [ ] **Step 4: Configure Netlify environment variables outside Git**

Use a Turnstile widget/key pair restricted to `armenianverbs.com` and the existing Mailchimp audience.

- [ ] **Step 5: Smoke-test Deploy Preview**

Check normal email success, immediate Mailchimp contact, active `Verb Conjugator` tag, disposable-address rejection, Turnstile behavior, and unchanged footer layout.

Do not merge until explicit approval.
