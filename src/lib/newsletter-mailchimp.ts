import { createHash } from "node:crypto";

type FetchLike = typeof fetch;

export function mailchimpSubscriberHash(email: string): string {
  return createHash("md5").update(email.trim().toLowerCase()).digest("hex");
}

export async function subscribeAndTagMailchimp(input: {
  email: string;
  apiKey: string;
  serverPrefix: string;
  audienceId: string;
  sourceTag: string;
  fetchImpl?: FetchLike;
}): Promise<{ ok: true; tagged: boolean } | { ok: false; stage: "member" }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const email = input.email.trim().toLowerCase();
  const hash = mailchimpSubscriberHash(email);
  const baseUrl = `https://${input.serverPrefix}.api.mailchimp.com/3.0/lists/${input.audienceId}/members/${hash}`;
  const authorization = `Basic ${Buffer.from(`newsletter:${input.apiKey}`).toString("base64")}`;
  const headers = {
    authorization,
    "content-type": "application/json",
  };

  try {
    const memberResponse = await fetchImpl(baseUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        email_address: email,
        status_if_new: "subscribed",
      }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!memberResponse.ok) {
      return { ok: false, stage: "member" };
    }
  } catch {
    return { ok: false, stage: "member" };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const tagResponse = await fetchImpl(`${baseUrl}/tags`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          tags: [{ name: input.sourceTag, status: "active" }],
        }),
        signal: AbortSignal.timeout(5_000),
      });

      if (tagResponse.ok) {
        return { ok: true, tagged: true };
      }
    } catch {
      // Retry transient tag failures. The member upsert is idempotent.
    }
  }

  return { ok: true, tagged: false };
}
