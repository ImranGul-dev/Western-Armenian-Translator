import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppProviders } from "@/components/AppProviders";
import "./globals.css";
import "./responsive-polish.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const favicon32 = "https://tunapp.com/wp-content/uploads/2020/09/cropped-Tun_Site-Icon-32x32.png";
const favicon192 = "https://tunapp.com/wp-content/uploads/2020/09/cropped-Tun_Site-Icon-192x192.png";
const appleIcon = "https://tunapp.com/wp-content/uploads/2020/09/cropped-Tun_Site-Icon-180x180.png";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Western Armenian Translator | Tun", template: "%s | Tun Translator" },
  description: "Translate between English, Western Armenian and Eastern Armenian with Tun.",
  applicationName: "Western Armenian Translator",
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: favicon32, sizes: "32x32", type: "image/png" },
      { url: favicon192, sizes: "192x192", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" }
    ],
    apple: [{ url: appleIcon, sizes: "180x180", type: "image/png" }]
  },
  openGraph: {
    title: "Western Armenian Translator",
    description: "Translate between English, Western Armenian and Eastern Armenian.",
    type: "website"
  }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script src="/theme-init.js" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://tunapp.com" />
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&family=Noto+Sans+Armenian:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body><AppProviders>{children}</AppProviders></body>
    </html>
  );
}
