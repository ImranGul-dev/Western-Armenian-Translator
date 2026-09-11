import { resolveMx } from "node:dns/promises";

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "10minutemail.com",
  "dispostable.com",
  "guerrillamail.com",
  "guerrillamailblock.com",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "moakt.com",
  "sharklasers.com",
  "temp-mail.org",
  "tempmail.com",
  "throwawaymail.com",
  "yopmail.com",
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MINIMUM_FORM_AGE_MS = 1_200;

type MxRecord = { exchange: string; priority: number };
type ResolveMx = (domain: string) => Promise<MxRecord[]>;

export type NewsletterValidationResult =
  | { ok: true; email: string; domain: string }
  | { ok: false; reason: "invalid_email" | "honeypot" | "too_fast" | "disposable_domain" };

export function normalizeNewsletterEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isDisposableEmailDomain(domain: string): boolean {
  const normalized = domain.trim().toLowerCase().replace(/\.$/, "");
  if (!normalized) return false;

  for (const blockedDomain of DISPOSABLE_EMAIL_DOMAINS) {
    if (normalized === blockedDomain || normalized.endsWith(`.${blockedDomain}`)) {
      return true;
    }
  }

  return false;
}

export function validateNewsletterSubmission(input: {
  email: string;
  honeypot: string;
  startedAt: string;
  now?: number;
}): NewsletterValidationResult {
  const email = normalizeNewsletterEmail(input.email);

  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return { ok: false, reason: "invalid_email" };
  }

  if (input.honeypot.trim()) {
    return { ok: false, reason: "honeypot" };
  }

  const domain = email.slice(email.lastIndexOf("@") + 1);
  if (!domain || domain.length > 253) {
    return { ok: false, reason: "invalid_email" };
  }

  if (isDisposableEmailDomain(domain)) {
    return { ok: false, reason: "disposable_domain" };
  }

  const now = input.now ?? Date.now();
  const startedAt = Number(input.startedAt);
  if (!Number.isFinite(startedAt) || startedAt <= 0 || startedAt > now || now - startedAt < MINIMUM_FORM_AGE_MS) {
    return { ok: false, reason: "too_fast" };
  }

  return { ok: true, email, domain };
}

export async function hasMailExchange(domain: string, resolver: ResolveMx = resolveMx): Promise<boolean> {
  try {
    const records = await resolver(domain);
    return records.some((record) => Boolean(record.exchange));
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "ESERVFAIL") {
      return false;
    }

    // DNS can fail transiently. Do not reject a legitimate visitor because
    // the resolver is temporarily unavailable.
    return true;
  }
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class NewsletterRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();

  allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
    const current = this.entries.get(key);

    if (!current || current.resetAt <= now) {
      this.entries.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    if (current.count >= limit) {
      return false;
    }

    current.count += 1;
    return true;
  }
}

export const newsletterRateLimiter = new NewsletterRateLimiter();
