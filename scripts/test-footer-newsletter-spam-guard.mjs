import assert from "node:assert/strict";
import fs from "node:fs";

const guardUrl = new URL("../src/lib/newsletter-spam.ts", import.meta.url);
const formPath = new URL("../src/components/FooterNewsletterForm.tsx", import.meta.url);
const routePath = new URL("../src/app/api/newsletter/route.ts", import.meta.url);

if (!fs.existsSync(guardUrl)) {
  throw new Error("Newsletter spam guard implementation is missing");
}

const {
  NewsletterRateLimiter,
  hasMailExchange,
  isDisposableEmailDomain,
  normalizeNewsletterEmail,
  validateNewsletterSubmission,
} = await import(guardUrl.href);

const now = 1_800_000_000_000;

assert.equal(
  normalizeNewsletterEmail("  Learner@Example.COM  "),
  "learner@example.com",
  "email normalization should trim and lowercase the address",
);

assert.equal(
  isDisposableEmailDomain("mailinator.com"),
  true,
  "known disposable email domains should be blocked",
);
assert.equal(
  isDisposableEmailDomain("sub.mailinator.com"),
  true,
  "subdomains of disposable providers should be blocked",
);
assert.equal(
  isDisposableEmailDomain("gmail.com"),
  false,
  "normal email providers should not be blocked",
);

assert.deepEqual(
  validateNewsletterSubmission({
    email: "not-an-email",
    honeypot: "",
    startedAt: String(now - 5_000),
    now,
  }),
  { ok: false, reason: "invalid_email" },
  "malformed email addresses should be rejected",
);

assert.deepEqual(
  validateNewsletterSubmission({
    email: "person@gmail.com",
    honeypot: "filled-by-bot",
    startedAt: String(now - 5_000),
    now,
  }),
  { ok: false, reason: "honeypot" },
  "filled honeypot submissions should be rejected",
);

assert.deepEqual(
  validateNewsletterSubmission({
    email: "person@gmail.com",
    honeypot: "",
    startedAt: String(now - 250),
    now,
  }),
  { ok: false, reason: "too_fast" },
  "submissions made unrealistically fast should be rejected",
);

assert.deepEqual(
  validateNewsletterSubmission({
    email: "person@mailinator.com",
    honeypot: "",
    startedAt: String(now - 5_000),
    now,
  }),
  { ok: false, reason: "disposable_domain" },
  "disposable email domains should be rejected",
);

assert.deepEqual(
  validateNewsletterSubmission({
    email: "Person@Gmail.com",
    honeypot: "",
    startedAt: String(now - 5_000),
    now,
  }),
  { ok: true, email: "person@gmail.com", domain: "gmail.com" },
  "normal submissions should pass local validation",
);

assert.equal(
  await hasMailExchange("example.com", async () => [{ exchange: "mx.example.com", priority: 10 }]),
  true,
  "domains with MX records should be accepted",
);
assert.equal(
  await hasMailExchange("example.invalid", async () => []),
  false,
  "domains without MX records should be rejected",
);
assert.equal(
  await hasMailExchange("missing.invalid", async () => {
    const error = new Error("not found");
    error.code = "ENOTFOUND";
    throw error;
  }),
  false,
  "definitively missing domains should be rejected",
);
assert.equal(
  await hasMailExchange("temporary.example", async () => {
    const error = new Error("temporary dns failure");
    error.code = "EAI_AGAIN";
    throw error;
  }),
  true,
  "temporary DNS failures should fail open rather than block real users",
);

const limiter = new NewsletterRateLimiter();
assert.equal(limiter.allow("ip:203.0.113.10", 2, 60_000, now), true);
assert.equal(limiter.allow("ip:203.0.113.10", 2, 60_000, now + 100), true);
assert.equal(limiter.allow("ip:203.0.113.10", 2, 60_000, now + 200), false);
assert.equal(limiter.allow("ip:203.0.113.10", 2, 60_000, now + 60_001), true);

const form = fs.readFileSync(formPath, "utf8");
if (!form.includes('action="/api/newsletter"')) {
  throw new Error("Footer newsletter form must post through /api/newsletter");
}
if (!form.includes('name="_newsletter_started_at"')) {
  throw new Error("Footer newsletter form must include the hidden timing field");
}
if (!form.includes('name="b_cf919aa58fa15934e1e2a04a0_3feeed30f4"')) {
  throw new Error("Footer newsletter form must preserve the Mailchimp honeypot");
}
assert.match(form, /next\/script/, "footer form must load Turnstile through Next Script");
assert.match(form, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/, "footer form must load the Turnstile client");
assert.match(form, /NEXT_PUBLIC_TURNSTILE_SITE_KEY/, "footer form must use the configured public Turnstile site key");
assert.match(form, /data-appearance=["']interaction-only["']/, "Turnstile should remain visually unobtrusive unless interaction is needed");
assert.match(form, /data-action=["']newsletter_signup["']/, "footer form must bind the newsletter Turnstile action");

if (!fs.existsSync(routePath)) {
  throw new Error("Newsletter API route is missing");
}
const route = fs.readFileSync(routePath, "utf8");
assert.match(route, /MAILCHIMP_SOURCE_TAG/, "translator route must use the configured Mailchimp source tag");
assert.match(route, /TURNSTILE_ALLOWED_HOSTNAMES/, "translator route must use a configured hostname allowlist");
assert.match(route, /TURNSTILE_ACTION\s*=\s*["']newsletter_signup["']/, "translator route must verify the newsletter Turnstile action");
assert.match(route, /cf-turnstile-response/, "route must read the Turnstile token");
assert.match(route, /verifyTurnstileToken/, "route must verify Turnstile server-side");
assert.match(route, /subscribeAndTagMailchimp/, "route must use the Mailchimp API helper");
assert.doesNotMatch(route, /tunapp\.us5\.list-manage\.com\/subscribe\/post/, "route must stop forwarding to the public Mailchimp form endpoint");

console.log("Footer newsletter spam-guard checks passed.");
