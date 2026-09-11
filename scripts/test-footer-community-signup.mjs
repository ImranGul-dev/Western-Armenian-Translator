import fs from "node:fs";

const footer = fs.readFileSync("src/components/Footer.tsx", "utf8");
const form = fs.readFileSync("src/components/FooterNewsletterForm.tsx", "utf8");
const css = fs.readFileSync("src/components/Footer.module.css", "utf8");

const requiredFooterSnippets = [
  'className={styles.newsletter}',
  '<FooterNewsletterForm />',
];

for (const snippet of requiredFooterSnippets) {
  if (!footer.includes(snippet)) {
    throw new Error(`Footer community signup missing: ${snippet}`);
  }
}

const requiredFormSnippets = [
  'className={styles.newsletterForm}',
  'action="/api/newsletter"',
  'name="EMAIL"',
  'placeholder="Enter your email here"',
  'name="b_cf919aa58fa15934e1e2a04a0_3feeed30f4"',
  'name="_newsletter_started_at"',
  'Join the community',
];

for (const snippet of requiredFormSnippets) {
  if (!form.includes(snippet)) {
    throw new Error(`Footer community signup form missing: ${snippet}`);
  }
}

for (const selector of [
  ".newsletter {",
  ".newsletterForm {",
  ".newsletterEmail {",
  ".newsletterButton {",
  ".newsletterHoneypot {",
]) {
  if (!css.includes(selector)) {
    throw new Error(`Footer community signup styles missing: ${selector}`);
  }
}

if (!css.includes("@media (max-width: 430px)")) {
  throw new Error("Footer community signup is missing the small-mobile stacking rule");
}

console.log("Footer community signup checks passed.");
