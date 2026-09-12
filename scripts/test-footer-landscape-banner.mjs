import fs from "node:fs";

const footer = fs.readFileSync("src/components/Footer.tsx", "utf8");
const cssPath = "src/components/Footer.module.css";
const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf8") : "";

for (const required of [
  "/tun-footer-translate.png",
  "tunapp-footer-curve",
  "tunapp-footer-scene",
  "tunapp-footer-artwork",
  "tunapp-footer-bar",
  "Copyright © 2026, Tun Online Armenian School. All rights reserved. For every Armenian who loves their home.",
]) {
  if (!footer.includes(required)) {
    throw new Error(`TunApp footer missing required markup: ${required}`);
  }
}

if (footer.includes("new Date().getFullYear()")) {
  throw new Error("TunApp footer copyright year must be fixed to 2026");
}

const footerLinks = [
  ["Learn Armenian Online", "https://tunapp.com/get-started"],
  ["Courses, Flashcards and Workbooks", "https://tunapp.com/shop"],
  ["Armenian Social Network", "https://armeniansocialnetwork.com"],
  ["Western Armenian Tutors", "https://tunapp.com/western-armenian-tutoring"],
  ["Armenian Translation Tool", "https://translatearmenian.com"],
  ["Armenian Verb Conjugations", "https://armenianverbs.com"],
  ["Armenian Keyboard", "https://armeniankeyboard.com"],
  ["Armenian ChatGPT", "https://tunapp.com/chatbot"],
  ["My Account", "https://tunapp.com/my-account/"],
  ["Downloads", "https://tunapp.com/my-account/downloads/"],
  ["Subscriptions", "https://tunapp.com/my-account/subscriptions/"],
  ["Payment Methods", "https://tunapp.com/my-account/payment-methods/"],
  ["Password Recovery", "https://tunapp.com/login/"],
  ["Privacy Policy", "https://tunapp.com/privacy-policy/"],
  ["Website Terms", "https://tunapp.com/website-terms/"],
  ["Affiliate Program", "https://tunapp.com/ambassadors/"],
  ["Blog", "https://tunapp.com/blog"],
  ["Quizzes", "https://tunapp.com/armenian-quizzes"],
  ["Contact Us", "mailto:hello@tunapp.com"],
];

if (footer.includes('["My Lessons", "https://tunapp.com/lessons"]')) {
  throw new Error("TunApp footer Learn column must not include My Lessons");
}

for (const heading of ["Learn", "Account", "Company"]) {
  if (!footer.includes(`heading: "${heading}"`)) {
    throw new Error(`TunApp footer missing column heading: ${heading}`);
  }
}

for (const [label, href] of footerLinks) {
  if (!footer.includes(`["${label}", "${href}"]`)) {
    throw new Error(`TunApp footer missing link: ${label} -> ${href}`);
  }
}

const blogIndex = footer.indexOf('["Blog", "https://tunapp.com/blog"]');
const quizzesIndex = footer.indexOf('["Quizzes", "https://tunapp.com/armenian-quizzes"]');
const contactIndex = footer.indexOf('["Contact Us", "mailto:hello@tunapp.com"]');

if (!(blogIndex < quizzesIndex && quizzesIndex < contactIndex)) {
  throw new Error("TunApp footer Company column must place Quizzes after Blog and before Contact Us");
}

for (const required of [
  'target="_blank"',
  'rel="noopener noreferrer"',
  "className={styles.footerLink}",
]) {
  if (!footer.includes(required)) {
    throw new Error(`TunApp footer link template missing required markup: ${required}`);
  }
}

const socialLinks = [
  ["Instagram", "https://instagram.com/tun.armenian"],
  ["TikTok", "https://www.tiktok.com/@tun.armenian"],
  ["YouTube", "https://www.youtube.com/@TunOnlineArmenianSchool"],
];

for (const [label, href] of socialLinks) {
  const hrefIndex = footer.indexOf(`href="${href}"`);
  if (hrefIndex === -1) {
    throw new Error(`TunApp footer missing social link: ${label}`);
  }

  const anchorStart = footer.lastIndexOf("<a", hrefIndex);
  const anchorEnd = footer.indexOf("</a>", hrefIndex);
  const anchorMarkup = footer.slice(anchorStart, anchorEnd + 4);

  for (const required of [
    `aria-label="${label}"`,
    'target="_blank"',
    'rel="noopener noreferrer"',
  ]) {
    if (!anchorMarkup.includes(required)) {
      throw new Error(`TunApp footer ${label} social link missing: ${required}`);
    }
  }
}

for (const required of [
  ".root",
  "padding-top: 32px",
  ".curve",
  ".scene",
  ".artwork",
  "width: min(100%, 1600px)",
  "right: 0",
  ".footerBar",
  "background: #1f1f1f",
  ".footerContent",
  ".footerLinks",
  "grid-template-columns: repeat(3, minmax(0, 1fr))",
  ".footerColumn",
  ".footerHeading",
  ".footerLink",
  ".socialLinks",
  ".socialLink",
  "display: flex",
  ".copyright",
  "@media (max-width: 700px)",
  "min-height: 240px",
  "padding-top: 24px",
]) {
  if (!css.includes(required)) {
    throw new Error(`TunApp footer styling missing CSS: ${required}`);
  }
}

for (const removed of [
  "clip-path: ellipse(72% 100% at 50% 100%)",
  "clip-path: ellipse(82% 100% at 50% 100%)",
  "background: #e9e9e9",
]) {
  if (css.includes(removed)) {
    throw new Error(`TunApp footer should not include the old curved gray scene: ${removed}`);
  }
}

const pageBackgroundUses = css.match(/background: var\(--background\);/g) ?? [];
if (pageBackgroundUses.length < 2) {
  throw new Error("TunApp footer root and curve must use the shared page background");
}

for (const selector of ["root", "curve"]) {
  const block = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  if (block.includes("background: #ffffff;")) {
    throw new Error(`TunApp footer ${selector} should not force a white background`);
  }
}

console.log("TunApp footer artwork, link columns, social links and copyright checks passed.");
