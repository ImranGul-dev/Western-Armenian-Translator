"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useAuth,
} from "@/contexts/AuthContext";

import {
  getRolePlayVoiceFeedback,
  type RolePlayVoiceFeedbackResult,
} from "@/lib/role-play-voice-feedback-api";

import styles from "./RolePlayVoiceFeedbackOffer.module.css";

const DISMISS_KEY =
  "tun-role-play-voice-feedback-dismissed";

export function RolePlayVoiceFeedbackOffer() {
  const pathname =
    usePathname();

  const {
    session,
  } = useAuth();

  const [
    result,
    setResult,
  ] =
    useState<RolePlayVoiceFeedbackResult | null>(
      null,
    );

  const [
    dismissed,
    setDismissed,
  ] =
    useState(false);

  const requestRef =
    useRef(false);

  useEffect(() => {
    if (
      pathname !== "/role-play" ||
      !session?.access_token
    ) {
      setResult(null);
      return;
    }

    setDismissed(
      window.sessionStorage.getItem(
        DISMISS_KEY,
      ) === "1",
    );

    let active =
      true;

    async function refresh() {
      if (
        !active ||
        requestRef.current ||
        !session?.access_token
      ) {
        return;
      }

      requestRef.current =
        true;

      try {
        const next =
          await getRolePlayVoiceFeedback(
            session.access_token,
          );

        if (active) {
          setResult(next);
        }
      } catch {
        // This offer is supplementary. Role-Play itself should stay usable
        // even if the feedback check is temporarily unavailable.
      } finally {
        requestRef.current =
          false;
      }
    }

    void refresh();

    const interval =
      window.setInterval(
        () => {
          void refresh();
        },
        30_000,
      );

    const onFocus = () => {
      void refresh();
    };

    window.addEventListener(
      "focus",
      onFocus,
    );

    return () => {
      active = false;
      window.clearInterval(
        interval,
      );
      window.removeEventListener(
        "focus",
        onFocus,
      );
    };
  }, [
    pathname,
    session?.access_token,
  ]);

  const report =
    result?.status ===
      "report_ready"
      ? result.report
      : null;

  if (
    pathname !== "/role-play" ||
    dismissed ||
    !report ||
    report.viewedAt
  ) {
    return null;
  }

  function dismiss() {
    setDismissed(true);

    window.sessionStorage.setItem(
      DISMISS_KEY,
      "1",
    );
  }

  return (
    <aside
      className={styles.offer}
      aria-live="polite"
      aria-label="Five-day AI Voice feedback"
    >
      <div className={styles.top}>
        <div className={styles.copy}>
          <span className={styles.eyebrow}>
            5-day voice milestone
          </span>

          <strong>
            Your personalised feedback is ready
          </strong>

          <p>
            Great job keeping your AI Voice practice going. See what is improving, what to practise next, and when a live tutor could help.
          </p>
        </div>

        <button
          type="button"
          className={styles.close}
          aria-label="Dismiss feedback offer"
          onClick={dismiss}
        >
          ×
        </button>
      </div>

      <div className={styles.actions}>
        <Link
          href="/role-play/feedback"
          className="primary-button"
        >
          View my feedback
        </Link>

        <button
          type="button"
          className="text-button"
          onClick={dismiss}
        >
          Maybe later
        </button>
      </div>
    </aside>
  );
}
