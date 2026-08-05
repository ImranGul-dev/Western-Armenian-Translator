import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoots = [path.join(root, "src"), path.join(root, "supabase", "functions")];
const forbidden = [
  { pattern: /\beval\s*\(/gu, message: "eval() is not allowed" },
  { pattern: /dangerouslySetInnerHTML/gu, message: "dangerouslySetInnerHTML is not allowed" },
  { pattern: /console\.log\s*\(/gu, message: "console.log() is not allowed in application source" }
];

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else if (/\.(ts|tsx|css)$/u.test(entry.name)) files.push(fullPath);
  }
  return files;
}

const violations = [];
for (const sourceRoot of sourceRoots) {
  for (const file of await walk(sourceRoot)) {
    const content = await fs.readFile(file, "utf8");
    for (const rule of forbidden) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(content)) violations.push(`${path.relative(root, file)}: ${rule.message}`);
    }
  }
}

if (violations.length) {
  console.error("Static lint failed:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("Static source lint passed.");
