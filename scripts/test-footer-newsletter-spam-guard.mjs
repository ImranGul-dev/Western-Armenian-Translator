import assert from "node:assert/strict";
import fs from "node:fs";

const guardUrl = new URL("../src/lib/newsletter-spam.ts", import.meta.url);
const footerPath = new URL("../src/components/Footer.tsx", import.meta.url);
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

const footer = fs.readFileSync(footerPath, "utf8");
if (!footer.includes('action="/api/newsletter"')) {
  throw new Error("Footer newsletter form must post through /api/newsletter");
}
if (!footer.includes('name="_newsletter_started_at"')) {
  throw new Error("Footer newsletter form must include the hidden timing field");
}
if (!fs.existsSync(routePath)) {
  throw new Error("Newsletter API route is missing");
}

console.log("Footer newsletter spam-guard checks passed.");
