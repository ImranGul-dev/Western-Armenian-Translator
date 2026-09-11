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
}): Promise<{ ok: true } | { ok: false; stage: "member" | "tag" }> {
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
        status: "subscribed",
      }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!memberResponse.ok) {
      return { ok: false, stage: "member" };
    }
  } catch {
    return { ok: false, stage: "member" };
  }

  try {
    const tagResponse = await fetchImpl(`${baseUrl}/tags`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        tags: [{ name: input.sourceTag, status: "active" }],
      }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!tagResponse.ok) {
      return { ok: false, stage: "tag" };
    }
  } catch {
    return { ok: false, stage: "tag" };
  }

  return { ok: true };
}
