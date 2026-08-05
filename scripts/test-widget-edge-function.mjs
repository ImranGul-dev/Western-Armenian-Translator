import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";

function parseEnv(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

async function localEnv() {
  try { return parseEnv(await fs.readFile(path.join(process.cwd(), ".env.local"), "utf8")); }
  catch { return {}; }
}

const fileEnv = await localEnv();
const value = name => process.env[name] || fileEnv[name] || "";
const supabaseUrl = value("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/u, "");
const publishableKey = value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || value("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const widgetKey = value("WIDGET_TEST_KEY");
const origin = value("WIDGET_TEST_ORIGIN");
const wrongOrigin = value("WIDGET_TEST_WRONG_ORIGIN") || "https://unauthorized-widget-test.invalid";

if (!supabaseUrl || !publishableKey || !widgetKey || !origin) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, WIDGET_TEST_KEY and WIDGET_TEST_ORIGIN before running this live test.");
  process.exit(1);
}

const endpoint = `${supabaseUrl}/functions/v1/widget-translate?widget_key=${encodeURIComponent(widgetKey)}`;
const body = JSON.stringify({ text: "Hello from the widget smoke test", sourceLanguage: "en", targetLanguage: "hyw" });
const headers = testOrigin => ({ "Content-Type": "application/json", apikey: publishableKey, Origin: testOrigin });

const valid = await fetch(endpoint, { method: "POST", headers: headers(origin), body });
const validJson = await valid.json().catch(() => ({}));
assert.equal(valid.ok, true, validJson.error || `Expected valid origin to succeed, received HTTP ${valid.status}`);
assert.equal(validJson.success, true, "Valid widget response did not report success");
assert.equal(valid.headers.get("access-control-allow-origin"), origin, "Valid origin was not echoed in CORS");

const wrong = await fetch(endpoint, { method: "POST", headers: headers(wrongOrigin), body });
assert.equal(wrong.status, 403, `Expected wrong origin HTTP 403, received ${wrong.status}`);
assert.equal(wrong.headers.get("access-control-allow-origin"), null, "Wrong origin must not receive CORS permission");

const missing = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", apikey: publishableKey }, body });
assert.equal(missing.status, 403, `Expected missing Origin HTTP 403, received ${missing.status}`);

const malformed = await fetch(endpoint, {
  method: "POST",
  headers: headers(origin),
  body: JSON.stringify({ text: "Hello", sourceLanguage: "en", targetLanguage: "en" })
});
assert.equal(malformed.status, 400, `Expected unsupported pair HTTP 400, received ${malformed.status}`);

console.log("Live widget success, wrong-origin, missing-origin and malformed-request checks passed.");
