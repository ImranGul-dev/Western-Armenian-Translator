import fs from "node:fs";

const header = fs.readFileSync("src/components/Header.tsx", "utf8");
const footer = fs.readFileSync("src/components/Footer.tsx", "utf8");
const redirects = fs.readFileSync("public/_redirects", "utf8");

if (!header.includes('const TUN_LOGO_URL = "/tun-logo.png";')) {
  throw new Error("Header must use the same-origin Tun logo route");
}

if (!footer.includes('src="/tun-footer-translate.png"')) {
  throw new Error("Footer must use the same-origin Tun footer artwork route");
}

for (const requiredRedirect of [
  "/tun-logo.png https://tunapp.com/wp-content/uploads/2020/09/Tun-Logo_Web-Black_80.png 200",
  "/tun-footer-translate.png https://tunapp.com/wp-content/uploads/2026/09/Tun-Footer-Translate__.png 200",
]) {
  if (!redirects.includes(requiredRedirect)) {
    throw new Error(`Brand asset proxy is missing: ${requiredRedirect}`);
  }
}

console.log("Same-origin Tun brand asset proxy checks passed.");
