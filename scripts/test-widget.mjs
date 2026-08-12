import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { originMatchesDomain, normalizeOriginHost } from "../supabase/functions/_shared/widget-domain.ts";

const migration = fs.readFileSync("supabase/migrations/20260805000300_embed_widget_and_manual_plan_overrides.sql", "utf8");
const edge = fs.readFileSync("supabase/functions/widget-translate/index.ts", "utf8");
const script = fs.readFileSync("public/tun-translator-widget.js", "utf8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
new vm.Script(script, { filename: "public/tun-translator-widget.js" });

assert.equal(normalizeOriginHost("https://Example.com/path"), "example.com");
assert.equal(normalizeOriginHost("http://localhost:8080"), "localhost:8080");
assert.equal(originMatchesDomain("https://example.com", "example.com"), true);
assert.equal(originMatchesDomain("https://sub.example.com", "example.com"), false);
assert.equal(originMatchesDomain("https://evil.example", "example.com"), false);

for (const term of ["widget_sites", "widget_usage_events", "widget_enabled", "widget_site_limit", "widget_monthly_character_limit", "widget_branding_removable", "manage_widget_site", "get_my_widget_sites", "admin_widget_sites"]) {
  assert.ok(migration.includes(term), `Widget migration missing ${term}`);
}
for (const term of ["originMatchesDomain", "resolveEffectivePlan", "findRelevantContext", "buildTranslationInstructions", "translateWithOpenAI", "monthly_limit", "rate_limit", "widget_usage_events", "request.method === \"GET\""]) {
  assert.ok(edge.includes(term), `Widget Edge Function missing ${term}`);
}
assert.ok(edge.includes('request.headers.get("origin")'), "Widget Edge Function must read Origin");
assert.ok(edge.includes("if (!origin)"), "Widget Edge Function must reject missing Origin");
assert.ok(!migration.match(/widget_usage_events[\s\S]{0,1200}(source_text|translated_text)/u), "Widget usage schema must not store translation text");
assert.ok(script.includes("attachShadow"), "Widget script must use Shadow DOM");
assert.ok(script.includes("data-widget-key"), "Widget script must accept a public widget key");
assert.ok(script.includes("navigator.clipboard"), "Widget script must include copy support");
assert.ok(script.includes('en: ["hyw", "hye"]'), "Widget script must support English → Eastern Armenian");
assert.ok(script.includes('hye: ["hyw", "en"]'), "Widget script must support Eastern Armenian → English");
assert.ok(script.includes("transliterateWesternArmenian"), "Widget script must display Western Armenian Latin transliteration");

assert.ok(script.includes("loadServerConfiguration"), "Widget script must load server-authoritative branding configuration");
assert.ok(script.includes("setBrandingVisible(resultValue.data.showBranding !== false)"), "Widget branding must follow the validated server response");
assert.ok(!script.includes("innerHTML"), "Widget script must not use innerHTML");
assert.ok(packageJson.scripts["supabase:functions:deploy"].includes("widget-translate"), "Deployment script must deploy widget-translate");

console.log("Widget domain unit tests and static entitlement, privacy, shared-prompt, rate-limit and browser-isolation checks passed.");
