import {
  hasMailExchange,
  newsletterRateLimiter,
  validateNewsletterSubmission,
} from "@/lib/newsletter-spam";
import { subscribeAndTagMailchimp } from "@/lib/newsletter-mailchimp";
import { verifyTurnstileToken } from "@/lib/newsletter-turnstile";

export const runtime = "nodejs";

const MAILCHIMP_HONEYPOT = "b_cf919aa58fa15934e1e2a04a0_3feeed30f4";
const NEWSLETTER_SOURCE_TAG = "Translation Tool";
const EXPECTED_TURNSTILE_HOSTNAME = "translatearmenian.com";

function htmlResponse(message: string, status: number) {
  const safeMessage = message.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });

  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tun newsletter</title></head><body><main><p>${safeMessage}</p></main></body></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

function requestIp(request: Request): string {
  const netlifyIp = request.headers.get("x-nf-client-connection-ip");
  if (netlifyIp) return netlifyIp.trim();

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";

  return "unknown";
}

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return htmlResponse("Please enter a valid email address and try again.", 400);
  }

  const validation = validateNewsletterSubmission({
    email: String(formData.get("EMAIL") ?? ""),
    honeypot: String(formData.get(MAILCHIMP_HONEYPOT) ?? ""),
    startedAt: String(formData.get("_newsletter_started_at") ?? ""),
  });

  if (!validation.ok) {
    if (validation.reason === "honeypot") {
      return htmlResponse("Thanks. You're on the newsletter.", 200);
    }

    if (validation.reason === "disposable_domain") {
      return htmlResponse("Please use a permanent email address to join the newsletter.", 400);
    }

    return htmlResponse("Please enter a valid email address and try again.", 400);
  }

  const ip = requestIp(request);
  const now = Date.now();
  const ipAllowed = newsletterRateLimiter.allow(`ip:${ip}`, 5, 15 * 60_000, now);
  const emailAllowed = newsletterRateLimiter.allow(`email:${validation.email}`, 3, 60 * 60_000, now);

  if (!ipAllowed || !emailAllowed) {
    return htmlResponse("Too many attempts. Please wait a little and try again.", 429);
  }

  const mailchimpApiKey = process.env.MAILCHIMP_API_KEY;
  const mailchimpServerPrefix = process.env.MAILCHIMP_SERVER_PREFIX;
  const mailchimpAudienceId = process.env.MAILCHIMP_AUDIENCE_ID;
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;

  if (!mailchimpApiKey || !mailchimpServerPrefix || !mailchimpAudienceId || !turnstileSecret) {
    return htmlResponse("We could not add you to the newsletter right now. Please try again shortly.", 503);
  }

  const turnstileToken = String(formData.get("cf-turnstile-response") ?? "");
  const turnstileOk = await verifyTurnstileToken({
    token: turnstileToken,
    secret: turnstileSecret,
    remoteIp: ip,
    expectedHostname: EXPECTED_TURNSTILE_HOSTNAME,
  });

  if (!turnstileOk) {
    return htmlResponse("We could not verify this request. Please try again.", 400);
  }

  if (!(await hasMailExchange(validation.domain))) {
    return htmlResponse("Please use an email domain that can receive email.", 400);
  }

  const result = await subscribeAndTagMailchimp({
    email: validation.email,
    apiKey: mailchimpApiKey,
    serverPrefix: mailchimpServerPrefix,
    audienceId: mailchimpAudienceId,
    sourceTag: NEWSLETTER_SOURCE_TAG,
  });

  if (!result.ok) {
    return htmlResponse("We could not add you to the newsletter right now. Please try again shortly.", 502);
  }

  return htmlResponse("Thanks. You're on the newsletter.", 200);
}
