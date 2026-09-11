# Cross-App Newsletter Spam Protection and Source Tagging Design

## Goal
Standardize the footer newsletter flow across these three Tun apps so newsletter subscriptions are protected against automated spam and each Mailchimp contact records which app(s) they subscribed from:

- `elleynote/Western-Armenian-Translator` / `translatearmenian.com`
- `elleynote/word-conjugation` / `armenianverbs.com`
- `elleynote/keybord` / `armeniankeyboard.com`

This is a newsletter subscription flow. It is not account signup, authentication, or user registration.

## Product decisions

- Subscription is immediate after all server-side checks pass.
- No double opt-in confirmation email is required.
- All three apps continue using the same existing Mailchimp audience: `3feeed30f4`.
- Footer visuals, copy, layout, and button text stay unchanged.
- Each app owns its own `/api/newsletter` endpoint. There is no single shared central newsletter service.
- Each app has a fixed source tag controlled by server code. The browser must not be able to choose or override the source tag.

### Exact Mailchimp source tags

| App | Source tag |
| --- | --- |
| Western Armenian Translator | `Translation Tool` |
| Word Conjugator | `Verb Conjugator` |
| Armenian Keyboard | `Armenian Keyboard` |

Tags are additive. If one email subscribes from multiple apps, all relevant source tags remain active. No app removes a source tag written by another app.

## Existing state

### Western Armenian Translator
The Translator already posts its footer form to a local `/api/newsletter` route and currently performs:

- email normalization and format checks
- Mailchimp honeypot check
- minimum form-fill-time check
- small disposable-domain blocklist
- MX/domain mail check
- best-effort in-memory IP/email rate limiting
- server-side forwarding to Mailchimp's public embedded-form endpoint

The current rate limiter is process memory only and is not a strong distributed control in a serverless environment. The Mailchimp public form endpoint also does not give the app reliable control over contact source tagging.

### Word Conjugator and Armenian Keyboard
Both currently post the footer newsletter form directly to the same Mailchimp embedded-form URL. They have Mailchimp's honeypot field but do not have the Translator's server-side validation flow.

## Recommended architecture

Each app implements the same logical flow locally:

`Footer newsletter form -> /api/newsletter -> validation -> Turnstile Siteverify -> Mailchimp Marketing API -> source tag`

The implementation can be copied/adapted per repository, but each repository owns and tests its own code. This avoids making all three apps dependent on one central service.

## Newsletter form behavior

The visible footer design must remain unchanged.

The form will:

1. continue collecting only the email address from the visitor
2. retain a hidden honeypot field
3. record a hidden form-start timestamp
4. obtain a Cloudflare Turnstile token
5. POST to the same app's `/api/newsletter` endpoint

Use a Cloudflare Turnstile **Managed** widget with `appearance: "interaction-only"` so the footer normally looks unchanged. Most visitors should not see a challenge; if Cloudflare decides interaction is required, the verification UI may appear temporarily.

The Turnstile token is security input only. It is never sent to Mailchimp.

## Server-side anti-spam checks

The `/api/newsletter` route must reject or absorb submissions in this order:

1. Parse the form safely.
2. Normalize the email with trim + lowercase.
3. Reject malformed/oversized email addresses.
4. If the honeypot is filled, return a generic success response without calling Mailchimp. Do not reveal the trap to bots.
5. Reject forms submitted unrealistically quickly.
6. Reject known disposable/temporary email domains.
7. Apply best-effort IP and normalized-email rate limits.
8. Verify the Turnstile token server-side with Cloudflare Siteverify.
9. Verify the Siteverify response is successful and belongs to the expected production hostname for that app.
10. Check that the email domain has a usable mail exchange record.
11. Only then call Mailchimp.

Turnstile validation is mandatory. A client-side widget without server-side Siteverify validation is not considered protection.

### Rate limiting

Keep local rate limiting as a secondary layer, not the primary bot defense. The existing in-memory limiter may be retained or slightly improved because Turnstile is the primary distributed anti-bot control. Do not introduce Redis, Upstash, a database, or another paid persistence dependency solely for this newsletter task.

Recommended limits remain conservative:

- IP: 5 accepted attempts per 15 minutes
- normalized email: 3 attempts per hour

These limits are best effort in a serverless runtime and must not be described as globally exact.

## Mailchimp integration

Replace the public embedded-form forwarding with the Mailchimp Marketing API.

### Server-only configuration

Each Netlify site receives these environment variables:

- `MAILCHIMP_API_KEY`
- `MAILCHIMP_SERVER_PREFIX` (expected value for this account: `us5`)
- `MAILCHIMP_AUDIENCE_ID` (expected value: `3feeed30f4`)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`

Secrets must never be committed. `.env.example` may contain variable names/placeholders only.

Use a separate production Turnstile widget/key pair for each production app so hostname restrictions, analytics, rotation, and incident isolation stay app-specific.

### Contact upsert

For a validated newsletter request:

1. Compute Mailchimp's subscriber hash from the normalized lowercase email using MD5.
2. Call the Mailchimp add-or-update-member endpoint for the configured audience.
3. Treat this form submission as an immediate newsletter opt-in and request `subscribed` status for a valid contact.
4. If Mailchimp refuses a cleaned, permanently deleted, compliance-blocked, or otherwise non-resubscribable address, return a friendly generic error and do not bypass Mailchimp's restriction.
5. Never archive or delete contacts as part of this flow.

### Source tag

After the member exists and is subscribed, call Mailchimp's member-tags endpoint with exactly one app-specific tag set to `active`:

- Translator: `Translation Tool`
- Verb app: `Verb Conjugator`
- Keyboard: `Armenian Keyboard`

Do not remove other tags.

If the member update succeeds but the tag request fails, return a temporary-error response. A retry is safe: the member upsert is idempotent and the tag can then be applied. This prevents silently reporting full success when the client-required source attribution was not saved.

## Source integrity

The source tag must be a server-side constant in each repository, for example:

- `const NEWSLETTER_SOURCE_TAG = "Translation Tool"`
- `const NEWSLETTER_SOURCE_TAG = "Verb Conjugator"`
- `const NEWSLETTER_SOURCE_TAG = "Armenian Keyboard"`

Do not accept `source`, `tag`, or similar values from submitted form data.

## User-facing responses

Preserve the current simple footer interaction and `Join the community` button text.

Suggested responses:

- success: `Thanks. You're on the newsletter.`
- disposable email: `Please use a permanent email address to join the newsletter.`
- invalid email: `Please enter a valid email address and try again.`
- bot/Turnstile failure: `We could not verify this request. Please try again.`
- rate limit: `Too many attempts. Please wait a little and try again.`
- Mailchimp/service failure: `We could not add you to the newsletter right now. Please try again shortly.`

Honeypot submissions return the same success response as legitimate submissions but perform no Mailchimp write.

Do not expose Cloudflare error codes, Mailchimp API responses, API keys, internal hostnames, or stack traces to visitors.

## Error handling and timeouts

- Use finite request timeouts for Cloudflare and Mailchimp calls.
- Treat invalid/expired/replayed Turnstile tokens as verification failures.
- Turnstile tokens are single-use and short-lived, so the client must obtain/reset a token when required before another submission.
- Fail closed if Turnstile validation cannot be completed: do not add the email to Mailchimp.
- DNS/MX lookup may continue to fail open only for clearly transient resolver failures, matching the Translator's existing behavior; nonexistent/no-data domains remain rejected.
- Mailchimp failures fail closed and return a generic retry message.

## Security and privacy

- Mailchimp API keys and Turnstile secret keys exist only in server-side environment variables.
- The public Turnstile site key may be exposed to the browser.
- Never log API keys, Turnstile tokens, or full Mailchimp responses containing contact data.
- Avoid logging raw email addresses. If diagnostic logging is necessary, log only non-identifying status/reason information.
- Restrict each production Turnstile widget to its production hostname.

## Immediate opt-in limitation

Because the client explicitly chose immediate newsletter subscription instead of double opt-in, the system cannot cryptographically prove that the visitor owns the email address they entered. Turnstile and the other checks greatly reduce automated abuse, but they do not prove mailbox ownership. Double opt-in would be required to verify ownership by email; it is intentionally out of scope.

## Repository-specific implementation shape

### 1. Western Armenian Translator

Keep the existing component/route structure and upgrade it:

- `src/components/FooterNewsletterForm.tsx`
  - add Turnstile token acquisition while preserving visible footer styling
- `src/app/api/newsletter/route.ts`
  - replace public Mailchimp form forwarding with Marketing API upsert + tag
  - validate Turnstile before Mailchimp
- `src/lib/newsletter-spam.ts`
  - retain/refine pure validation helpers and existing tests
- add focused Mailchimp/Turnstile helpers only if needed to keep route logic small and testable
- update `.env.example` with names/placeholders only

Server-side source tag: `Translation Tool`.

### 2. Word Conjugator

Create the same server-side newsletter flow using this repository's existing Next.js conventions:

- replace direct Mailchimp submission in `src/components/Footer.tsx`
- extract a small client newsletter component if Turnstile requires client behavior
- add `src/app/api/newsletter/route.ts`
- add focused validation / Mailchimp / Turnstile helper modules as appropriate
- add tests and `.env.example` placeholders

Server-side source tag: `Verb Conjugator`.

Do not redesign the footer.

### 3. Armenian Keyboard

Create the same server-side newsletter flow inside the nested `armenian-keyboard/` Next.js app:

- replace direct Mailchimp submission in `armenian-keyboard/src/components/Footer.tsx`
- extract a small client newsletter component if Turnstile requires client behavior
- add `armenian-keyboard/src/app/api/newsletter/route.ts`
- add focused validation / Mailchimp / Turnstile helper modules as appropriate
- add tests and environment-variable documentation in the keyboard app's existing configuration structure

Server-side source tag: `Armenian Keyboard`.

Do not alter the keyboard page, Armenian Alphabet page, header, or footer visuals.

## Testing strategy

Use test-driven development in each repository.

At minimum verify:

- email normalization
- malformed email rejection
- honeypot fake-success behavior without Mailchimp call
- too-fast submission rejection
- disposable domain rejection
- MX/no-mail-domain rejection
- rate-limit rejection
- missing/invalid/expired Turnstile token rejection
- Turnstile hostname mismatch rejection
- valid Turnstile token accepted
- Mailchimp member upsert uses normalized email and configured audience
- exact app source tag is sent as `active`
- existing source tags are not removed
- Mailchimp member failure returns a generic error
- tag failure does not report full success
- footer posts to local `/api/newsletter`, not directly to the Mailchimp embedded-form URL
- footer visual CSS is unchanged

Use Cloudflare's documented Turnstile testing keys/tokens for integration-style test configuration where appropriate; production secrets are never used in tests.

## Verification and rollout

Implement and verify one repository at a time so failures are isolated.

Recommended order:

1. Western Armenian Translator — upgrade the existing protected flow and establish the reference implementation.
2. Word Conjugator — port the verified pattern.
3. Armenian Keyboard — port the verified pattern.

For each repository:

- start from latest `main`
- use a fresh feature branch
- write failing tests first
- make the smallest production changes
- run existing tests, new newsletter tests, typecheck/lint where available, and production build
- create a Draft PR
- verify Netlify deploy preview
- do not merge until explicitly approved

Do not deploy secrets through source control. Netlify environment variables must be configured separately before production verification can exercise real Turnstile and Mailchimp calls.

## Out of scope

- double opt-in
- account registration/login changes
- newsletter redesign
- changing Mailchimp audience
- deleting existing spam contacts from Mailchimp
- bulk cleanup of the current audience
- marketing automation/campaign changes
- a centralized cross-app newsletter microservice
- a new database or persistent rate-limit service
