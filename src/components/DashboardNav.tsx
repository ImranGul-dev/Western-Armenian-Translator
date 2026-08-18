"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AdminHelp } from "@/components/AdminHelp";
import { useAuth } from "@/contexts/AuthContext";

const ADMIN_ITEMS = [
  {
    href: "/admin",
    label: "Overview",
    description:
      "Use this page to check the overall health of the translator. Look here first for user activity, translation activity, pending language work and operational issues.",
    example:
      "If Pending corrections shows 4, open Corrections and review those submissions.",
  },
  {
    href: "/admin/glossary",
    label: "Glossary",
    description:
      "Use this section to manage preferred words and terminology. Add or approve terms when you want the translator to consistently prefer a specific Western Armenian wording.",
    example:
      "If the preferred Western Armenian translation for 'hello' should always use one approved form, manage that term here.",
  },
  {
    href: "/admin/grammar",
    label: "Grammar",
    description:
      "Use this section to store approved Western Armenian grammar guidance. Add rules when the translator needs clear instructions about correct grammar, structure or language usage.",
    example:
      "Add a rule explaining that a particular Eastern Armenian grammatical form should not be used in Western Armenian.",
  },
  {
    href: "/admin/examples",
    label: "Examples",
    description:
      "Use this section to save high-quality source and translation examples. These examples help guide the translator toward approved wording and style when similar text is translated.",
    example:
      "Save an approved translation of 'How are you?' so it can be used as a quality reference for similar translations.",
  },
  {
    href: "/admin/daily-practice",
    label: "Daily Practice",
    description:
      "Schedule and manage the Western Armenian phrase learners see for each calendar day. Use drafts for unfinished content, publish only reviewed phrases, and archive old entries rather than deleting them.",
    example:
      "Create tomorrow's phrase with its English meaning and a short teaching note, review the learner preview, then publish it.",
  },
  {
    href: "/admin/role-play",
    label: "Role-Play",
    description:
      "Create and manage the preset practice scenarios available in the paid Role-Play feature. Publish only scenarios that are ready for learners; archive old scenarios instead of deleting them.",
    example:
      "Edit the Ordering Food scenario, review its Western Armenian opening message and AI instructions, then publish the updated scenario.",
  },
  {
    href: "/admin/corrections",
    label: "Corrections",
    description:
      "Use this section to review translation corrections submitted through the application. Compare the original translation with the suggested correction before deciding what should be accepted or used for quality improvement.",
    example:
      "A user reports that a sentence was translated incorrectly and submits a better version. Review both versions here.",
  },
  {
    href: "/admin/queries",
    label: "Translations",
    description:
      "Use this section to review saved translations that registered users have allowed administrators to see. Use it for translation quality checking, not as a list of every translation made on the site.",
    example:
      "A user has admin review enabled and translates 'Good morning'. You can inspect that saved translation here.",
  },
  {
    href: "/admin/users",
    label: "Users",
    description:
      "Use this section to find registered accounts and review their access, plan and relevant account information. Use manual access controls only when there is a clear support or testing reason.",
    example:
      "Search for a customer's email to check their current plan or give temporary manual access for support.",
  },
  {
    href: "/admin/widgets",
    label: "Widgets",
    description:
      "Use this section to manage website translator widgets. This is for administrator-controlled website or school widget access, not normal individual customer accounts.",
    example:
      "Create or review a widget that will be embedded on an approved school or test website.",
  },
  {
    href: "/admin/plans",
    label: "Plans",
    description:
      "Use this section to review and manage application plan settings and feature limits. Be careful when changing plan settings because they can affect user access and translation limits.",
    example:
      "Check which translation limit or feature access is assigned to the Free plan before changing it.",
  },
  {
    href: "/admin/subscriptions",
    label: "Subscriptions",
    description:
      "Use this section to review subscription records and paid access status. Use it when checking whether a customer's paid entitlement is active, cancelled, past due or expired.",
    example:
      "A customer says their paid features are unavailable. Check their subscription status here before changing access manually.",
  },
  {
    href: "/admin/payments",
    label: "Payments",
    description:
      "Use this section to review payment and invoice records received by the application. Use it mainly for billing support and payment troubleshooting.",
    example:
      "A customer says they paid but access was not updated. Check whether their payment record appears here.",
  },
  {
    href: "/admin/usage",
    label: "Usage",
    description:
      "Use this section to review translation usage and system consumption. Use it to understand activity levels, investigate unusually high usage and monitor plan limits.",
    example:
      "If translation usage suddenly increases, review this section to see where the activity is coming from.",
  },
] as const;

const USER_ITEMS = [
  ["/dashboard", "Overview"],
  ["/dashboard/saved-phrases", "Saved Phrases"],
  ["/dashboard/vocabulary-decks", "Vocabulary Decks"],
  ["/dashboard/flashcards", "Flashcards"],
  ["/dashboard/practice-analytics", "Practice Analytics"],
  ["/dashboard/history", "History"],
  ["/dashboard/billing", "Billing"],
  ["/dashboard/settings", "Settings"],
] as const;

export function DashboardNav({
  admin = false,
}: {
  admin?: boolean;
}) {
  const pathname = usePathname();
  const { profile } = useAuth();

  if (admin) {
    return (
      <nav
        className="dashboard-nav admin-dashboard-nav"
        aria-label="Admin navigation"
      >
        {ADMIN_ITEMS
          .filter(
            ({ href }) =>
              href !== "/admin/role-play" ||
              profile?.role === "admin",
          )
          .map(
          ({
            href,
            label,
            description,
            example,
          }) => (
            <span
              className="dashboard-nav-item"
              key={href}
            >
              <AdminHelp
                title={label}
                description={description}
                example={example}
              />

              <Link
                href={href}
                className={
                  pathname === href
                    ? "active"
                    : ""
                }
              >
                {label}
              </Link>
            </span>
          ),
        )}
      </nav>
    );
  }

  return (
    <nav
      className="dashboard-nav"
      aria-label="Dashboard navigation"
    >
      {USER_ITEMS.map(
        ([href, label]) => (
          <Link
            key={href}
            href={href}
            className={
              pathname === href
                ? "active"
                : ""
            }
          >
            {label}
          </Link>
        ),
      )}
    </nav>
  );
}
