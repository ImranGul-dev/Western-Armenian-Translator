import {
  hasMailExchange,
  newsletterRateLimiter,
  validateNewsletterSubmission,
} from "@/lib/newsletter-spam";

export const runtime = "nodejs";

const MAILCHIMP_ACTION =
  "https://tunapp.us5.list-manage.com/subscribe/post?u=cf919aa58fa15934e1e2a04a0&id=3feeed30f4&f_id=00a043edf0";
const MAILCHIMP_HONEYPOT = "b_cf919aa58fa15934e1e2a04a0_3feeed30f4";

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
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tun community signup</title></head><body><main><p>${safeMessage}</p></main></body></html>`,
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
      // Do not give bots useful feedback about the trap.
      return htmlResponse("Thanks. Your signup was submitted.", 200);
    }

    if (validation.reason === "disposable_domain") {
      return htmlResponse("Please use a permanent email address to join the community.", 400);
    }

    return htmlResponse("Please enter a valid email address and try again.", 400);
  }

  const ip = requestIp(request);
  const now = Date.now();
  const ipAllowed = newsletterRateLimiter.allow(`ip:${ip}`, 5, 15 * 60_000, now);
  const emailAllowed = newsletterRateLimiter.allow(`email:${validation.email}`, 3, 60 * 60_000, now);

  if (!ipAllowed || !emailAllowed) {
    return htmlResponse("Too many signup attempts. Please wait a little and try again.", 429);
  }

  if (!(await hasMailExchange(validation.domain))) {
    return htmlResponse("Please use an email domain that can receive email.", 400);
  }

  const body = new URLSearchParams({
    EMAIL: validation.email,
    [MAILCHIMP_HONEYPOT]: "",
    subscribe: "Join the community",
  });

  try {
    const response = await fetch(MAILCHIMP_ACTION, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      redirect: "follow",
      cache: "no-store",
    });

    if (!response.ok) {
      return htmlResponse("We could not submit your signup right now. Please try again shortly.", 502);
    }

    return htmlResponse("Thanks. Your signup was submitted.", 200);
  } catch {
    return htmlResponse("We could not submit your signup right now. Please try again shortly.", 502);
  }
}
