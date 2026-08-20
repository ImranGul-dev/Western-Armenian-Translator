"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { PremiumFeatureNavButton } from "@/components/PremiumFeatureNavButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { hasPaidFeatureAccess } from "@/lib/paid-feature-access";
import { useAuth } from "@/contexts/AuthContext";

const TUN_LOGO_URL =
  "https://tunapp.com/wp-content/uploads/2020/09/Tun-Logo_Web-Black_80.png";

export function Header() {
  const pathname =
    usePathname();

  const [
    mobileMenuOpen,
    setMobileMenuOpen,
  ] = useState(false);

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

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }

    const handleEscape = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener(
      "keydown",
      handleEscape,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleEscape,
      );
    };
  }, [mobileMenuOpen]);

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
            id="site-main-navigation"
            className={`main-nav${
              mobileMenuOpen
                ? " mobile-open"
                : ""
            }`}
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
              feature="word_breakdown"
              label="Word Breakdown"
              description="Understand Western Armenian word-by-word meanings, base forms and grammar."
              href="/word-breakdown"
              className={`${navClass("/word-breakdown")} premium-feature-nav-link`}
            />

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
                    className="text-button header-session-action"
                    type="button"
                    onClick={() =>
                      void signOut()
                    }
                  >
                    Log out
                  </button>
                ) : (
                  <Link
                    className="text-button header-session-action"
                    href="/login"
                  >
                    Log in
                  </Link>
                )
              )}

            <ThemeToggle />

            <button
              type="button"
              className="mobile-nav-toggle"
              aria-controls="site-main-navigation"
              aria-expanded={mobileMenuOpen}
              aria-label={
                mobileMenuOpen
                  ? "Close navigation menu"
                  : "Open navigation menu"
              }
              onClick={() =>
                setMobileMenuOpen(
                  (open) => !open,
                )
              }
            >
              <span
                className="mobile-nav-toggle-label"
                aria-hidden="true"
              >
                Menu
              </span>

              <span
                className="mobile-nav-toggle-icon"
                aria-hidden="true"
              >
                <span />
                <span />
                <span />
              </span>
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
