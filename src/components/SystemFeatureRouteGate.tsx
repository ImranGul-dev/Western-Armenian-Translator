"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { SiteFrame } from "@/components/SiteFrame";
import {
  useSystemFeatureToggles,
} from "@/contexts/SystemFeatureToggleContext";
import type {
  SystemFeatureToggle,
} from "@/lib/system-feature-toggles";

interface RouteFeature {
  match: (pathname: string) => boolean;
  feature: SystemFeatureToggle;
  label: string;
}

const ROUTE_FEATURES: readonly RouteFeature[] = [
  {
    match: (pathname) => pathname === "/",
    feature: "translation",
    label: "Translation",
  },
  {
    match: (pathname) => pathname.startsWith("/thesaurus"),
    feature: "thesaurus",
    label: "Thesaurus",
  },
  {
    match: (pathname) => pathname.startsWith("/word-breakdown"),
    feature: "word_breakdown",
    label: "Word Breakdown",
  },
  {
    match: (pathname) => pathname.startsWith("/role-play"),
    feature: "role_play",
    label: "Role-Play",
  },
  {
    match: (pathname) => pathname.startsWith("/dashboard/saved-phrases"),
    feature: "saved_phrases",
    label: "Saved Phrases",
  },
  {
    match: (pathname) => pathname.startsWith("/dashboard/vocabulary-decks"),
    feature: "vocabulary_decks",
    label: "Vocabulary Decks",
  },
  {
    match: (pathname) => pathname.startsWith("/dashboard/flashcards"),
    feature: "flashcards",
    label: "Flashcards",
  },
  {
    match: (pathname) => pathname.startsWith("/dashboard/history"),
    feature: "history",
    label: "History",
  },
  {
    match: (pathname) => pathname.startsWith("/dashboard/practice-analytics"),
    feature: "practice_analytics",
    label: "Practice Analytics",
  },
  {
    match: (pathname) => pathname.startsWith("/dashboard/widget"),
    feature: "embeddable_widgets",
    label: "Embeddable Widgets",
  },
];

export function SystemFeatureRouteGate({
  children,
}: {
  children: ReactNode;
}) {
  const pathname =
    usePathname();

  const {
    toggles,
    loading,
  } = useSystemFeatureToggles();

  const routeFeature =
    ROUTE_FEATURES.find(
      (item) => item.match(pathname),
    );

  if (
    loading ||
    !routeFeature ||
    toggles[routeFeature.feature]
  ) {
    return <>{children}</>;
  }

  return (
    <SiteFrame compact>
      <main
        style={{
          width: "min(760px, calc(100% - 32px))",
          margin: "64px auto",
        }}
      >
        <section className="dashboard-card">
          <p className="eyebrow">
            Temporarily unavailable
          </p>

          <h1>
            {routeFeature.label} is currently unavailable
          </h1>

          <p>
            This feature has been temporarily disabled by the Tun administrator. Your account, plan and saved data are unchanged. Please check back later.
          </p>
        </section>
      </main>
    </SiteFrame>
  );
}
