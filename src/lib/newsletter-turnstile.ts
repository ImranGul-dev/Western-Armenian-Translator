type FetchLike = typeof fetch;

export async function verifyTurnstileToken(input: {
  token: string;
  secret: string;
  remoteIp: string;
  allowedHostnames: string[];
  expectedAction: string;
  fetchImpl?: FetchLike;
}): Promise<boolean> {
  if (!input.token || !input.secret) return false;

  const body = new URLSearchParams({
    secret: input.secret,
    response: input.token,
  });

  if (input.remoteIp && input.remoteIp !== "unknown") {
    body.set("remoteip", input.remoteIp);
  }

  try {
    const response = await (input.fetchImpl ?? fetch)(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
        signal: AbortSignal.timeout(5_000),
      },
    );

    if (!response.ok) return false;

    const data = (await response.json()) as {
      success?: boolean;
      hostname?: string;
      action?: string;
    };

    return (
      data.success === true &&
      typeof data.hostname === "string" &&
      input.allowedHostnames.includes(data.hostname.toLowerCase()) &&
      data.action === input.expectedAction
    );
  } catch {
    return false;
  }
}
