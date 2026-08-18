"use client";

import type {
  ReactNode,
} from "react";

import {
  usePathname,
} from "next/navigation";

import {
  DailyPracticePhraseCard,
} from "@/components/DailyPracticePhraseCard";

import {
  DashboardNav,
} from "@/components/DashboardNav";

import {
  SiteFrame,
} from "@/components/SiteFrame";

export function DashboardShell({
  children,
  title,
  description,
  admin = false,
}: {
  children: ReactNode;
  title: string;
  description: string;
  admin?: boolean;
}) {
  const pathname =
    usePathname();

  const showDailyPractice =
    !admin &&
    pathname === "/dashboard";

  return (
    <SiteFrame compact>
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">
            {admin
              ? "Administration"
              : "Your account"}
          </p>

          <h1>
            {title}
          </h1>

          <p>
            {description}
          </p>
        </div>
      </div>

      <DashboardNav
        admin={admin}
      />

      <div className="dashboard-content">
        {showDailyPractice ? (
          <DailyPracticePhraseCard />
        ) : null}

        {children}
      </div>
    </SiteFrame>
  );
}
