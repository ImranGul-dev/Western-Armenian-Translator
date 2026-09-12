import assert from "node:assert/strict";

const turnstileUrl = new URL("../src/lib/newsletter-turnstile.ts", import.meta.url);
const mailchimpUrl = new URL("../src/lib/newsletter-mailchimp.ts", import.meta.url);

const { verifyTurnstileToken } = await import(turnstileUrl.href);
const { mailchimpSubscriberHash, subscribeAndTagMailchimp } = await import(mailchimpUrl.href);

assert.equal(
  mailchimpSubscriberHash("Learner@Example.COM"),
  "d62f0f9be3b74a18cd1e01044d91c5d7",
  "subscriber hash must use normalized lowercase email",
);

const goodTurnstileFetch = async (_url, init) => {
  assert.equal(init.method, "POST");
  assert.match(String(init.body), /secret=test-secret/);
  assert.match(String(init.body), /response=test-token/);
  return new Response(
    JSON.stringify({
      success: true,
      hostname: "translatearmenian.com",
      action: "newsletter_signup",
    }),
    { status: 200 },
  );
};

assert.equal(
  await verifyTurnstileToken({
    token: "test-token",
    secret: "test-secret",
    remoteIp: "203.0.113.10",
    allowedHostnames: ["translatearmenian.com"],
    expectedAction: "newsletter_signup",
    fetchImpl: goodTurnstileFetch,
  }),
  true,
  "valid Turnstile response from the production hostname must pass",
);

assert.equal(
  await verifyTurnstileToken({
    token: "test-token",
    secret: "test-secret",
    remoteIp: "203.0.113.10",
    allowedHostnames: ["translatearmenian.com"],
    expectedAction: "newsletter_signup",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          success: true,
          hostname: "evil.example",
          action: "newsletter_signup",
        }),
        { status: 200 },
      ),
  }),
  false,
  "Turnstile hostname mismatch must fail",
);

assert.equal(
  await verifyTurnstileToken({
    token: "",
    secret: "test-secret",
    remoteIp: "203.0.113.10",
    allowedHostnames: ["translatearmenian.com"],
    expectedAction: "newsletter_signup",
    fetchImpl: goodTurnstileFetch,
  }),
  false,
  "missing Turnstile token must fail",
);

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

assert.deepEqual(result, { ok: true, tagged: true });
assert.equal(calls.length, 2, "member upsert and tag request are both required");
assert.match(calls[0].url, /lists\/3feeed30f4\/members\/d62f0f9be3b74a18cd1e01044d91c5d7$/);
assert.equal(calls[0].init.method, "PUT");
assert.equal(JSON.parse(calls[0].init.body).email_address, "learner@example.com");
assert.equal(JSON.parse(calls[0].init.body).status_if_new, "subscribed");
assert.equal(
  "status" in JSON.parse(calls[0].init.body),
  false,
  "member upsert must preserve an existing contact's subscription status",
);
assert.match(calls[0].init.headers.authorization, /^Basic /);
assert.match(calls[1].url, /\/tags$/);
assert.equal(calls[1].init.method, "POST");
assert.deepEqual(JSON.parse(calls[1].init.body), {
  tags: [{ name: "Translation Tool", status: "active" }],
});

const memberFailure = await subscribeAndTagMailchimp({
  email: "learner@example.com",
  apiKey: "key-us5",
  serverPrefix: "us5",
  audienceId: "3feeed30f4",
  sourceTag: "Translation Tool",
  fetchImpl: async () => new Response("{}", { status: 400 }),
});
assert.deepEqual(memberFailure, { ok: false, stage: "member" });

let requestNumber = 0;
const tagFailure = await subscribeAndTagMailchimp({
  email: "learner@example.com",
  apiKey: "key-us5",
  serverPrefix: "us5",
  audienceId: "3feeed30f4",
  sourceTag: "Translation Tool",
  fetchImpl: async () => {
    requestNumber += 1;
    return new Response("{}", { status: requestNumber === 1 ? 200 : 500 });
  },
});
assert.deepEqual(tagFailure, { ok: true, tagged: false });
assert.equal(requestNumber, 4, "tagging must be retried three times after the member upsert");

assert.equal(
  await verifyTurnstileToken({
    token: "test-token",
    secret: "test-secret",
    remoteIp: "203.0.113.10",
    allowedHostnames: ["translatearmenian.com"],
    expectedAction: "newsletter_signup",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          success: true,
          hostname: "translatearmenian.com",
          action: "other_form",
        }),
        { status: 200 },
      ),
  }),
  false,
  "Turnstile action mismatch must fail",
);

console.log("Footer newsletter service checks passed.");
