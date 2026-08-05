"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export function DashboardNav({ admin = false }: { admin?: boolean }) {
  const pathname = usePathname();
  const { plan } = useAuth();
  const items = admin
    ? [
        ["/admin", "Overview"],
        ["/admin/glossary", "Glossary"],
        ["/admin/grammar", "Grammar"],
        ["/admin/examples", "Examples"],
        ["/admin/corrections", "Corrections"],
        ["/admin/queries", "Queries"],
        ["/admin/users", "Users"],
        ["/admin/widgets", "Widgets"],
        ["/admin/plans", "Plans"],
        ["/admin/subscriptions", "Subscriptions"],
        ["/admin/payments", "Payments"],
        ["/admin/usage", "Usage"]
      ]
    : [
        ["/dashboard", "Overview"],
        ["/dashboard/history", "History"],
        ...(plan?.widget_enabled ? [["/dashboard/widget", "Website widget"]] : []),
        ["/dashboard/billing", "Billing"],
        ["/dashboard/settings", "Settings"]
      ];
  return <nav className="dashboard-nav">{items.map(([href, label]) => <Link key={href} href={href} className={pathname === href ? "active" : ""}>{label}</Link>)}</nav>;
}
