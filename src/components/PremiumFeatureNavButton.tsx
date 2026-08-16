"use client";

import Link from "next/link";

import {
  useEffect,
  useState,
} from "react";

import {
  useAuth,
} from "@/contexts/AuthContext";

import {
  hasPaidFeatureAccess,
  type PaidFeature,
} from "@/lib/paid-feature-access";

interface PremiumFeatureNavButtonProps {
  feature: PaidFeature;
  label: string;
  description: string;
  href?: string;
  className?: string;
  onActivate?: () => void;
  disabled?: boolean;
}

const FEATURE_BULLETS:
  Partial<
    Record<
      PaidFeature,
      readonly string[]
    >
  > = {
  thesaurus: [
    "Western Armenian synonyms and antonyms",
    "Natural alternative wording and phrasing",
  ],

  role_play: [
    "Voice and text conversation practice",
    "Real-world Western Armenian scenarios",
  ],

  word_breakdown: [
    "Word-by-word contextual meanings",
    "Base forms and concise grammar explanations",
  ],

  audio: [
    "Natural Western Armenian audio playback",
    "Listening support for translated text",
  ],

  pronunciation: [
    "Western Armenian pronunciation support",
    "Slower playback for language practice",
  ],

  saved_phrases: [
    "Save useful Western Armenian phrases",
    "Keep learning material organised",
  ],

  vocabulary_decks: [
    "Build personal vocabulary collections",
    "Organise words and phrases for practice",
  ],

  flashcards: [
    "Practise vocabulary with flashcards",
    "Review saved learning material",
  ],

  practice_analytics: [
    "Review language-practice activity",
    "Track learning progress over time",
  ],
};

export function PremiumFeatureNavButton({
  feature,
  label,
  description,
  href,
  className,
  onActivate,
  disabled = false,
}: PremiumFeatureNavButtonProps) {
  const {
    user,
    profile,
    plan,
    loading,
  } = useAuth();

  const [
    open,
    setOpen,
  ] =
    useState(false);

  const hasFeatureAccess =
    hasPaidFeatureAccess(
      feature,
      {
        isAuthenticated:
          Boolean(user),

        role:
          profile?.role,

        planSlug:
          plan?.slug,
      },
    );

  const locked =
    !hasFeatureAccess;

  const featureBullets =
    FEATURE_BULLETS[
      feature
    ] ?? [
      "Premium Western Armenian learning tools",
      "Expanded language-learning functionality",
    ];

  const controlClassName =
    className ??
    "nav-link premium-feature-nav-link";

  useEffect(() => {
    if (!open) {
      return;
    }

    const keyDown = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key ===
        "Escape"
      ) {
        setOpen(false);
      }
    };

    window.addEventListener(
      "keydown",
      keyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        keyDown,
      );
    };
  }, [open]);

  if (
    !locked &&
    onActivate
  ) {
    return (
      <button
        type="button"
        className={
          controlClassName
        }
        disabled={
          loading ||
          disabled
        }
        onClick={
          onActivate
        }
      >
        {label}
      </button>
    );
  }

  if (
    !locked &&
    href
  ) {
    return (
      <Link
        href={href}
        className={
          controlClassName
        }
      >
        {label}
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        className={controlClassName}
        disabled={loading}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() =>
          setOpen(true)
        }
      >
        <span>
          {label}
        </span>

        {locked ? (
          <span
            className="premium-nav-lock"
            aria-label="Paid feature"
            title="Paid feature"
          >
            {"\uD83D\uDD12"}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="upgrade-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setOpen(false);
            }
          }}
        >
          <section
            className="upgrade-modal premium-feature-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="premium-feature-title"
            aria-describedby="premium-feature-description"
          >
            <button
              type="button"
              className="upgrade-modal-close"
              aria-label="Close"
              onClick={() =>
                setOpen(false)
              }
            >
              {"\u00D7"}
            </button>

            {locked ? (
              <>
                <p className="eyebrow">
                  Paid feature
                </p>

                <h2 id="premium-feature-title">
                  Unlock {label}
                </h2>

                <p
                  id="premium-feature-description"
                  className="upgrade-modal-copy"
                >
                  {description}
                </p>

                <ul className="upgrade-modal-features">
                  <li>
                    Available to paid users
                  </li>

                  {featureBullets.map(
                    (item) => (
                      <li key={item}>
                        {item}
                      </li>
                    ),
                  )}

                  <li>
                    Upgrade to Person or Schools for paid access
                  </li>
                </ul>

                <div className="upgrade-modal-actions">
                  <Link
                    href="/pricing"
                    className="primary-button upgrade-modal-primary"
                    onClick={() =>
                      setOpen(false)
                    }
                  >
                    View plans
                  </Link>

                  {!user ? (
                    <>
                      <Link
                        href="/signup?next=%2Fpricing"
                        className="upgrade-modal-secondary premium-modal-link"
                        onClick={() =>
                          setOpen(false)
                        }
                      >
                        Sign up
                      </Link>

                      <Link
                        href="/login"
                        className="upgrade-modal-secondary premium-modal-link"
                        onClick={() =>
                          setOpen(false)
                        }
                      >
                        Log in
                      </Link>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="upgrade-modal-secondary"
                      onClick={() =>
                        setOpen(false)
                      }
                    >
                      Maybe later
                    </button>
                  )}
                </div>

                <p className="upgrade-modal-note">
                  {!user
                    ? "Create an account or log in to continue."
                    : "Your Free account can upgrade to Person or Schools for paid feature access."}
                </p>
              </>
            ) : (
              <>
                <p className="eyebrow">
                  Paid feature
                </p>

                <h2 id="premium-feature-title">
                  {label}
                </h2>

                <p
                  id="premium-feature-description"
                  className="upgrade-modal-copy"
                >
                  {description}
                </p>

                <ul className="upgrade-modal-features">
                  <li>
                    Included for paid users
                  </li>

                  {featureBullets.map(
                    (item) => (
                      <li key={item}>
                        {item}
                      </li>
                    ),
                  )}
                </ul>

                <p className="upgrade-modal-note">
                  This feature is currently being developed.
                </p>

                <div className="upgrade-modal-actions">
                  <button
                    type="button"
                    className="primary-button upgrade-modal-primary"
                    onClick={() =>
                      setOpen(false)
                    }
                  >
                    Got it
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
