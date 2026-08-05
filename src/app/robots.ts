import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return {
    rules: [
      { userAgent: "*", allow: ["/", "/pricing", "/privacy", "/terms"], disallow: ["/admin/", "/dashboard/", "/login", "/signup", "/forgot-password", "/reset-password"] }
    ],
    sitemap: `${siteUrl.replace(/\/$/u, "")}/sitemap.xml`
  };
}
