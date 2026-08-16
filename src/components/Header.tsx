"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PremiumFeatureNavButton } from "@/components/PremiumFeatureNavButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { hasPaidFeatureAccess } from "@/lib/paid-feature-access";
import { useAuth } from "@/contexts/AuthContext";

const TUN_LOGO_URL =
  "https://tunapp.com/wp-content/uploads/2020/09/Tun-Logo_Web-Black_80.png";

export function Header() {
  const pathname =
    usePathname();

  const {
    user,
    profile,
    plan,
    loading,
    signOut,
  } = useAuth();

  const isEditor =
    profile?.role ===
      "language_editor" ||
    profile?.role ===
      "admin";

  const hasThesaurusAccess =
    hasPaidFeatureAccess(
      "thesaurus",
      {
        isAuthenticated:
          Boolean(user),

        role:
          profile?.role,

        planSlug:
          plan?.slug,
      },
    );

  const navClass = (
    href: string,
  ) =>
    pathname === href ||
    (
      href !== "/" &&
      pathname.startsWith(
        href,
      )
    )
      ? "nav-link active"
      : "nav-link";

  return (
    <>
      <div className="brand-strip">
        <div className="shell brand-strip-inner">
          <span>
            Western Armenian language technology by Tun
          </span>

          <span className="brand-strip-note">
            English · Western Armenian · Eastern Armenian
          </span>
        </div>
      </div>

      <header className="site-header">
        <div className="shell header-inner">
          <div className="brand-group">
            <Link
              className="tun-logo-link"
              href="/"
              aria-label="Western Armenian Translator home"
            >
              <img
                className="tun-logo-image"
                src={TUN_LOGO_URL}
                width="105"
                height="56"
                alt="Tun"
                fetchPriority="high"
              />
            </Link>

            <span
              className="brand-divider"
              aria-hidden="true"
            />

            <div className="brand-copy">
              <span className="brand-title">
                Western Armenian Translator
              </span>

              <span className="brand-subtitle">
                Translate with Tun
              </span>
            </div>
          </div>

          <nav
            className="main-nav"
            aria-label="Main navigation"
          >
            <Link
              href="/"
              className={
                navClass("/")
              }
            >
              Translator
            </Link>

            {hasThesaurusAccess ? (
              <Link
                href="/thesaurus"
                className={
                  navClass(
                    "/thesaurus",
                  )
                }
              >
                Thesaurus
              </Link>
            ) : (
              <PremiumFeatureNavButton
                feature="thesaurus"
                label="Thesaurus"
                description="Explore Western Armenian synonyms, antonyms and alternative ways to express words and phrases."
              />
            )}

            <PremiumFeatureNavButton
              feature="role_play"
              label="Role-Play"
              description="Practise real-world Western Armenian conversations through interactive learning scenarios."
              href="/role-play"
              className={`${navClass("/role-play")} premium-feature-nav-link`}
            />

            {!user && (
              <Link
                href="/pricing"
                className={
                  navClass(
                    "/pricing",
                  )
                }
              >
                Pricing
              </Link>
            )}

            {user && (
              <Link
                href="/dashboard"
                className={
                  navClass(
                    "/dashboard",
                  )
                }
              >
                Dashboard
              </Link>
            )}

            {isEditor && (
              <Link
                href="/admin"
                className={
                  navClass(
                    "/admin",
                  )
                }
              >
                Admin
              </Link>
            )}
          </nav>

          <div className="header-actions">
            {!loading &&
              (
                user ? (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() =>
                      void signOut()
                    }
                  >
                    Log out
                  </button>
                ) : (
                  <Link
                    className="text-button"
                    href="/login"
                  >
                    Log in
                  </Link>
                )
              )}

            <ThemeToggle />
          </div>
        </div>
      </header>
    </>
  );
}