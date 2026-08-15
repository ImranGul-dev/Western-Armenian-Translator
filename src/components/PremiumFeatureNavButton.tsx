"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
} from "react";

import { useAuth } from "@/contexts/AuthContext";

interface PremiumFeatureNavButtonProps {
  label: string;
  description: string;
}

export function PremiumFeatureNavButton({
  label,
  description,
}: PremiumFeatureNavButtonProps) {
  const {
    user,
    plan,
    loading,
  } = useAuth();

  const [
    open,
    setOpen,
  ] = useState(false);

  const hasPremiumAccess =
    plan?.slug === "premium" ||
    plan?.slug === "business" ||
    plan?.slug === "admin";

  const locked =
    !user ||
    !hasPremiumAccess;

  useEffect(() => {
    if (!open) {
      return;
    }

    const keyDown = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key === "Escape"
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

  return (
    <>
      <button
        type="button"
        className="nav-link premium-feature-nav-link"
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

        {locked && (
          <span
            className="premium-nav-lock"
            aria-label="Premium feature"
            title="Premium feature"
          >
            {"\uD83D\uDD12"}
          </span>
        )}
      </button>

      {open && (
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
                  Premium feature
                </p>

                <h2 id="premium-feature-title">
                  Unlock {label}
                </h2>

                <p
                  id="premium-feature-description"
                  className="upgrade-modal-copy"
                >
                  {description} This is
                  being prepared as a
                  premium Tun feature.
                </p>

                <ul className="upgrade-modal-features">
                  <li>
                    Available to eligible
                    paid accounts when
                    launched
                  </li>

                  <li>
                    Designed for deeper
                    Western Armenian
                    learning and practice
                  </li>

                  <li>
                    Your existing
                    translator remains
                    available separately
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
                    <Link
                      href="/login"
                      className="upgrade-modal-secondary premium-modal-link"
                      onClick={() =>
                        setOpen(false)
                      }
                    >
                      Log in
                    </Link>
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
                  The full {label} feature
                  is still being developed.
                </p>
              </>
            ) : (
              <>
                <p className="eyebrow">
                  Premium feature
                </p>

                <h2 id="premium-feature-title">
                  {label} is coming soon
                </h2>

                <p
                  id="premium-feature-description"
                  className="upgrade-modal-copy"
                >
                  Your current plan is
                  eligible for premium
                  features. We are
                  preparing the full{" "}
                  {label} experience now.
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
      )}
    </>
  );
}