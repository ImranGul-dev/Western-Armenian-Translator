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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

async function loadLocalEnv() {
  try {
    const file = await fs.readFile(path.join(process.cwd(), ".env.local"), "utf8");
    return parseEnv(file);
  } catch {
    return {};
  }
}

const localEnv = await loadLocalEnv();
const supabaseUrl = (
  process.env.NEXT_PUBLIC_SUPABASE_URL
  || localEnv.NEXT_PUBLIC_SUPABASE_URL
  || ""
).replace(/\/+$/u, "");
const explicitFunctionUrl = process.env.NEXT_PUBLIC_TRANSLATION_FUNCTION_URL
  || localEnv.NEXT_PUBLIC_TRANSLATION_FUNCTION_URL;
const functionUrl = explicitFunctionUrl || (supabaseUrl ? `${supabaseUrl}/functions/v1/translate` : "");
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  || localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || localEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!functionUrl || !publishableKey) {
  console.error("Missing Supabase frontend values. Add them to .env.local before running this test.");
  process.exit(1);
}

const response = await fetch(functionUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: publishableKey,
    "x-client-id": "command-line-smoke-test"
  },
  body: JSON.stringify({
    text: "Hello, how are you today?",
    sourceLanguage: "en",
    targetLanguage: "hyw"
  })
});

let result;
try {
  result = await response.json();
} catch {
  result = { success: false, error: "The endpoint did not return JSON." };
}

console.log(`HTTP ${response.status}`);
if (response.ok && result.success) {
  console.log("Translation endpoint is working.");
  console.log(result.translation);
} else {
  console.error(result.error || "Translation endpoint test failed.");
  process.exit(1);
}
