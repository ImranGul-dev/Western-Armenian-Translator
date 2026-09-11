# Translator Newsletter Protection and Source Tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Translator footer newsletter flow to use Cloudflare Turnstile plus the Mailchimp Marketing API, subscribe immediately, and add the fixed `Translation Tool` source tag without changing the footer design.

**Architecture:** Keep the existing local `/api/newsletter` boundary. Extend the existing validation layer, add isolated Turnstile and Mailchimp helpers with injected `fetch` for deterministic tests, and keep the route as the orchestrator. The client form stays visually identical and only adds Turnstile plus the existing hidden timing/honeypot fields.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Node `crypto`/`dns`, Cloudflare Turnstile Siteverify, Mailchimp Marketing API, existing Node script test harness.

**Spec:** `docs/superpowers/specs/2026-09-12-newsletter-spam-source-tags-design.md`

## Global Constraints

- This is an immediate newsletter subscription, not account signup.
- Mailchimp audience remains `3feeed30f4`.
- Exact source tag is `Translation Tool`.
- Footer visuals, layout, copy, and button text remain unchanged.
- No double opt-in.
- No new database, Redis, Upstash, or persistent rate-limit service.
- Secrets stay server-side; only `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is browser-visible.
- Production hostname for Turnstile verification is `translatearmenian.com`.
- Do not merge without explicit approval.

---

### Task 1: Define Turnstile and Mailchimp helper contracts with failing tests

**Files:**
- Create: `src/lib/newsletter-turnstile.ts`
- Create: `src/lib/newsletter-mailchimp.ts`
- Create: `scripts/test-footer-newsletter-services.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `verifyTurnstileToken(input): Promise<boolean>`
- Produces: `mailchimpSubscriberHash(email): string`
- Produces: `subscribeAndTagMailchimp(input): Promise<{ ok: true } | { ok: false; stage: "member" | "tag" }>`

- [ ] **Step 1: Add the failing service test script**

Create `scripts/test-footer-newsletter-services.mjs` that imports the two helper modules and asserts these exact behaviors:

```js
import assert from "node:assert/strict";

const turnstileUrl = new URL("../src/lib/newsletter-turnstile.ts", import.meta.url);
const mailchimpUrl = new URL("../src/lib/newsletter-mailchimp.ts", import.meta.url);

const { verifyTurnstileToken } = await import(turnstileUrl.href);
const { mailchimpSubscriberHash, subscribeAndTagMailchimp } = await import(mailchimpUrl.href);

assert.equal(mailchimpSubscriberHash("Learner@Example.COM"), "d2d865b7b3f669e8dcbe4a3e1e4a9f5d");

const goodTurnstileFetch = async (_url, init) => {
  assert.equal(init.method, "POST");
  assert.match(String(init.body), /secret=test-secret/);
  assert.match(String(init.body), /response=test-token/);
  return new Response(JSON.stringify({ success: true, hostname: "translatearmenian.com" }), { status: 200 });
};
assert.equal(await verifyTurnstileToken({
  token: "test-token",
  secret: "test-secret",
  remoteIp: "203.0.113.10",
  expectedHostname: "translatearmenian.com",
  fetchImpl: goodTurnstileFetch,
}), true);

assert.equal(await verifyTurnstileToken({
  token: "test-token",
  secret: "test-secret",
  remoteIp: "203.0.113.10",
  expectedHostname: "translatearmenian.com",
  fetchImpl: async () => new Response(JSON.stringify({ success: true, hostname: "evil.example" }), { status: 200 }),
}), false);

const calls = [];
const mailchimpFetch = async (url, init) => {
  calls.push({ url: String(url), init });
  return new Response("{}", { status: 200 });
};
const result = await subscribeAndTagMailchimp({
  email: "learner@example.com",
  apiKey: "key-us5",
  serverPrefix: "us5",
  audienceId: "3feeed30f4",
  sourceTag: "Translation Tool",
  fetchImpl: mailchimpFetch,
});
assert.deepEqual(result, { ok: true });
assert.equal(calls.length, 2);
assert.match(calls[0].url, /lists\/3feeed30f4\/members\//);
assert.equal(JSON.parse(calls[0].init.body).status_if_new, "subscribed");
assert.equal(JSON.parse(calls[0].init.body).status, "subscribed");
assert.deepEqual(JSON.parse(calls[1].init.body), { tags: [{ name: "Translation Tool", status: "active" }] });
```

Use the correct MD5 expected value produced by Node for `learner@example.com`; if the literal above differs, compute it once with `createHash("md5")` and lock the verified value into the test.

- [ ] **Step 2: Add the test to `npm test` and verify RED**

Append:

```json
"node --experimental-strip-types scripts/test-footer-newsletter-services.mjs"
```

to the existing `test` command.

Run:

```bash
npm test
```

Expected: existing tests pass until the new service test fails because the helper modules/functions do not exist yet.

- [ ] **Step 3: Implement `newsletter-turnstile.ts` minimally**

Implement:

```ts
type FetchLike = typeof fetch;

export async function verifyTurnstileToken(input: {
  token: string;
  secret: string;
  remoteIp: string;
  expectedHostname: string;
  fetchImpl?: FetchLike;
}): Promise<boolean> {
  if (!input.token || !input.secret) return false;
  const body = new URLSearchParams({ secret: input.secret, response: input.token });
  if (input.remoteIp && input.remoteIp !== "unknown") body.set("remoteip", input.remoteIp);

  try {
    const response = await (input.fetchImpl ?? fetch)(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) return false;
    const data = (await response.json()) as { success?: boolean; hostname?: string };
    return data.success === true && data.hostname === input.expectedHostname;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Implement `newsletter-mailchimp.ts` minimally**

Implement `mailchimpSubscriberHash()` with Node `createHash("md5")` over the normalized lowercase email. Implement `subscribeAndTagMailchimp()` so it:

1. PUTs to `https://${serverPrefix}.api.mailchimp.com/3.0/lists/${audienceId}/members/${hash}`.
2. Sends JSON `{ email_address: email, status_if_new: "subscribed", status: "subscribed" }`.
3. Uses Basic auth via `Buffer.from(`newsletter:${apiKey}`).toString("base64")`.
4. Returns `{ ok: false, stage: "member" }` on any non-2xx member response/network failure.
5. POSTs `{ tags: [{ name: sourceTag, status: "active" }] }` to `/members/${hash}/tags`.
6. Returns `{ ok: false, stage: "tag" }` if tagging fails.
7. Returns `{ ok: true }` only when both operations succeed.
8. Uses a finite 5-second timeout on each external request.

- [ ] **Step 5: Run the service test and full suite**

Run:

```bash
node --experimental-strip-types scripts/test-footer-newsletter-services.mjs
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/newsletter-turnstile.ts src/lib/newsletter-mailchimp.ts scripts/test-footer-newsletter-services.mjs package.json
git commit -m "feat: add newsletter verification services"
```

---

### Task 2: Upgrade the newsletter route to Turnstile + Mailchimp tagging

**Files:**
- Modify: `src/app/api/newsletter/route.ts`
- Modify: `scripts/test-footer-newsletter-spam-guard.mjs`

**Interfaces:**
- Consumes: `validateNewsletterSubmission`, `newsletterRateLimiter`, `hasMailExchange`
- Consumes: `verifyTurnstileToken`
- Consumes: `subscribeAndTagMailchimp`
- Produces: POST `/api/newsletter`

- [ ] **Step 1: Extend the failing route/source assertions**

Add source assertions to `scripts/test-footer-newsletter-spam-guard.mjs` requiring:

```js
const route = fs.readFileSync(routePath, "utf8");
assert.match(route, /NEWSLETTER_SOURCE_TAG\s*=\s*["']Translation Tool["']/);
assert.match(route, /EXPECTED_TURNSTILE_HOSTNAME\s*=\s*["']translatearmenian\.com["']/);
assert.match(route, /cf-turnstile-response/);
assert.match(route, /verifyTurnstileToken/);
assert.match(route, /subscribeAndTagMailchimp/);
assert.doesNotMatch(route, /tunapp\.us5\.list-manage\.com\/subscribe\/post/);
```

Run the script and verify it fails because the route still forwards to the public Mailchimp form endpoint.

- [ ] **Step 2: Replace public form forwarding in the route**

In `src/app/api/newsletter/route.ts`:

- remove `MAILCHIMP_ACTION`
- keep the existing honeypot constant
- add:

```ts
const NEWSLETTER_SOURCE_TAG = "Translation Tool";
const EXPECTED_TURNSTILE_HOSTNAME = "translatearmenian.com";
```

Read these required environment variables at request time:

```ts
MAILCHIMP_API_KEY
MAILCHIMP_SERVER_PREFIX
MAILCHIMP_AUDIENCE_ID
TURNSTILE_SECRET_KEY
```

If any are missing, return the generic service failure with HTTP 503.

Read the Turnstile token from:

```ts
String(formData.get("cf-turnstile-response") ?? "")
```

Keep the existing validation order through rate limiting, then call `verifyTurnstileToken()` before MX and Mailchimp. On verification failure return HTTP 400 with `We could not verify this request. Please try again.`

After MX succeeds, call:

```ts
await subscribeAndTagMailchimp({
  email: validation.email,
  apiKey: process.env.MAILCHIMP_API_KEY!,
  serverPrefix: process.env.MAILCHIMP_SERVER_PREFIX!,
  audienceId: process.env.MAILCHIMP_AUDIENCE_ID!,
  sourceTag: NEWSLETTER_SOURCE_TAG,
});
```

Return success only for `{ ok: true }`. Member or tag failure returns HTTP 502 with `We could not add you to the newsletter right now. Please try again shortly.`

Update wording from `community signup` to newsletter language where it appears in response messages/title, while leaving the visible footer button unchanged.

- [ ] **Step 3: Preserve honeypot fake success**

Ensure a filled honeypot still returns HTTP 200 with the same success copy as a legitimate newsletter subscription and does not reach Turnstile/Mailchimp.

- [ ] **Step 4: Run tests**

```bash
node --experimental-strip-types scripts/test-footer-newsletter-spam-guard.mjs
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/newsletter/route.ts scripts/test-footer-newsletter-spam-guard.mjs
git commit -m "feat: tag translator newsletter subscriptions"
```

---

### Task 3: Add Turnstile to the existing footer form without visual redesign

**Files:**
- Modify: `src/components/FooterNewsletterForm.tsx`
- Modify: `scripts/test-footer-newsletter-spam-guard.mjs`
- Do not modify: `src/components/Footer.module.css`

**Interfaces:**
- Produces: browser form POST to `/api/newsletter` including `EMAIL`, honeypot, `_newsletter_started_at`, and `cf-turnstile-response`

- [ ] **Step 1: Add failing form source assertions**

Require the form source to contain:

```js
assert.match(form, /next\/script/);
assert.match(form, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/);
assert.match(form, /NEXT_PUBLIC_TURNSTILE_SITE_KEY/);
assert.match(form, /data-appearance=["']interaction-only["']/);
```

Run the test and verify RED.

- [ ] **Step 2: Add the Turnstile script/widget**

Import:

```ts
import Script from "next/script";
```

Inside the form component, keep every existing visible field/class/button unchanged and add:

```tsx
<Script
  src="https://challenges.cloudflare.com/turnstile/v0/api.js"
  strategy="afterInteractive"
/>
<div
  className="cf-turnstile"
  data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
  data-appearance="interaction-only"
/>
```

Do not add CSS unless the challenge visibly breaks the layout during preview review.

- [ ] **Step 3: Verify the CSS file is byte-for-byte unchanged**

Before and after the task, compare:

```bash
git diff -- src/components/Footer.module.css
```

Expected: no diff.

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/FooterNewsletterForm.tsx scripts/test-footer-newsletter-spam-guard.mjs
git commit -m "feat: protect translator newsletter with turnstile"
```

---

### Task 4: Document required Netlify environment variables

**Files:**
- Modify: `.env.example`

**Interfaces:**
- Produces documented configuration names only; no real secret values.

- [ ] **Step 1: Add placeholders**

Append:

```dotenv
# Footer newsletter protection and Mailchimp source tagging.
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
MAILCHIMP_API_KEY=
MAILCHIMP_SERVER_PREFIX=us5
MAILCHIMP_AUDIENCE_ID=3feeed30f4
```

Do not put a real Mailchimp key or Turnstile secret in source control.

- [ ] **Step 2: Verify no secret-looking value was committed**

```bash
git diff -- .env.example
```

Expected: only names/placeholders plus the non-secret `us5` and audience ID.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: add newsletter environment variables"
```

---

### Task 5: Full verification and Draft PR

**Files:**
- No production-file changes expected.

- [ ] **Step 1: Run full verification from latest feature head**

```bash
npm run lint
npm test
npm run verify
npm run build
```

Expected: all commands pass. If an unrelated baseline failure appears, stop, compare against current `main`, and document evidence before deciding whether it is out of scope.

- [ ] **Step 2: Review the final diff**

```bash
git diff main...HEAD -- src/components/FooterNewsletterForm.tsx src/components/Footer.module.css src/app/api/newsletter/route.ts src/lib/newsletter-spam.ts src/lib/newsletter-turnstile.ts src/lib/newsletter-mailchimp.ts .env.example scripts package.json
```

Confirm:

- `Footer.module.css` has no changes
- source tag is exactly `Translation Tool`
- production hostname is exactly `translatearmenian.com`
- no public Mailchimp embedded-form POST remains in the newsletter route
- no secrets are committed

- [ ] **Step 3: Create a Draft PR**

PR title:

```text
Protect translator newsletter and add source tag
```

PR body must state:

- immediate newsletter subscription
- Turnstile + existing local spam checks
- Mailchimp Marketing API
- exact `Translation Tool` tag
- no footer design changes
- required Netlify environment variables
- no double opt-in

- [ ] **Step 4: Configure preview/production environment outside Git**

In Netlify, add the five environment variables from Task 4. Use the production Turnstile widget restricted to `translatearmenian.com`. Do not paste secret values into PR comments or source files.

- [ ] **Step 5: Preview smoke test**

Verify:

1. Footer looks unchanged before interaction.
2. A valid newsletter email can complete Turnstile and receives the success response.
3. Mailchimp contains/updates the contact immediately.
4. The contact has active tag `Translation Tool`.
5. A known disposable address is blocked.
6. A filled honeypot returns generic success but creates no Mailchimp contact.

Do not merge until explicit approval.
