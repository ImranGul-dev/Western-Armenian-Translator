import fs from "node:fs";

const footer = fs.readFileSync("src/components/Footer.tsx", "utf8");
const css = fs.readFileSync("src/components/Footer.module.css", "utf8");

const requiredFooterSnippets = [
  'className={styles.newsletter}',
  'className={styles.newsletterForm}',
  'action="https://tunapp.us5.list-manage.com/subscribe/post?u=cf919aa58fa15934e1e2a04a0&amp;id=3feeed30f4&amp;f_id=00a043edf0"',
  'name="EMAIL"',
  'placeholder="Enter your email here"',
  'name="b_cf919aa58fa15934e1e2a04a0_3feeed30f4"',
  'Join the community',
];

for (const snippet of requiredFooterSnippets) {
  if (!footer.includes(snippet)) {
    throw new Error(`Footer community signup missing: ${snippet}`);
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
