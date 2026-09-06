import fs from "node:fs";

const header = fs.readFileSync("src/components/Header.tsx", "utf8");
const footer = fs.readFileSync("src/components/Footer.tsx", "utf8");

for (const assetPath of [
  "public/tun-logo.png",
  "public/tun-footer-translate.png",
]) {
  if (!fs.existsSync(assetPath)) {
    throw new Error(`Local brand asset is missing: ${assetPath}`);
  }
}

if (!header.includes('const TUN_LOGO_URL = "/tun-logo.png";')) {
  throw new Error("Header must use the local Tun logo asset");
}

if (!footer.includes('src="/tun-footer-translate.png"')) {
  throw new Error("Footer must use the local Tun footer artwork");
}

if (header.includes("Tun-Logo_Web-Black_80.png")) {
  throw new Error("Header must not hotlink the Tun logo from tunapp.com");
}

if (footer.includes("Tun-Footer-Translate__.png")) {
  throw new Error("Footer must not hotlink the footer artwork from tunapp.com");
}

console.log("Local Tun brand asset checks passed.");
