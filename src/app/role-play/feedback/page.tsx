"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
} from "react";

import {
  ProtectedRoute,
} from "@/components/ProtectedRoute";

import {
  SiteFrame,
} from "@/components/SiteFrame";

import {
  useAuth,
} from "@/contexts/AuthContext";

import {
  getRolePlayVoiceFeedback,
  type RolePlayVoiceFeedbackResult,
} from "@/lib/role-play-voice-feedback-api";

import styles from "./voice-feedback.module.css";

export default function RolePlayVoiceFeedbackPage() {
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
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  async function load(
    markViewed = false,
  ) {
    if (!session?.access_token) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const next =
        await getRolePlayVoiceFeedback(
          session.access_token,
          {
            markViewed,
          },
        );

      setResult(next);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "AI Voice feedback could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session?.access_token) {
      return;
    }

    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  const report =
    result?.report ??
    null;

  const progress =
    Math.min(
      100,
      Math.max(
        0,
        ((result?.streak.currentVoiceStreak ?? 0) / 5) * 100,
      ),
    );

  return (
    <ProtectedRoute>
      <SiteFrame compact>
        <main className={styles.page}>
          <section className={styles.hero}>
            <p className="eyebrow">
              AI Voice practice
            </p>

            <h1>
              Your 5-day speaking feedback
            </h1>

            <p>
              Practise with AI Role-Play using your voice on five days in a row. Tun will then prepare a short personalised report from your recent practice.
            </p>
          </section>

          {loading ? (
            <section className={`${styles.card} ${styles.stateCard}`}>
              <strong>
                Preparing your AI Voice progress...
              </strong>

              <p>
                This may take a moment if your five-day feedback report is being created for the first time.
              </p>
            </section>
          ) : error ? (
            <section className={`${styles.card} ${styles.stateCard}`}>
              <strong className={styles.error}>
                Feedback is temporarily unavailable
              </strong>

              <p>
                {error}
              </p>

              <div className={styles.actions}>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() =>
                    void load(true)
                  }
                >
                  Try again
                </button>

                <Link
                  href="/role-play"
                  className="text-button"
                >
                  Back to AI Role-Play
                </Link>
              </div>
            </section>
          ) : result?.status === "progress" ? (
            <>
              <section className={styles.card}>
                <div className={styles.progressGrid}>
                  <div className={styles.progressStat}>
                    <span>
                      Current voice streak
                    </span>

                    <strong>
                      {result.streak.currentVoiceStreak}
                    </strong>
                  </div>

                  <div className={styles.progressStat}>
                    <span>
                      Days remaining
                    </span>

                    <strong>
                      {result.daysRemaining}
                    </strong>
                  </div>

                  <div className={styles.progressStat}>
                    <span>
                      Best voice streak
                    </span>

                    <strong>
                      {result.streak.longestVoiceStreak}
                    </strong>
                  </div>
                </div>

                <div
                  className={styles.progressTrack}
                  aria-label={`${result.streak.currentVoiceStreak} of 5 practice days completed`}
                >
                  <div
                    className={styles.progressFill}
                    style={{
                      width: `${progress}%`,
                    }}
                  />
                </div>
              </section>

              <section className={`${styles.card} ${styles.stateCard}`}>
                <strong>
                  Keep your voice-practice streak going
                </strong>

                <p>
                  Use the microphone in AI Role-Play on {result.daysRemaining === 1 ? "one more day" : `${result.daysRemaining} more days`} in a row to unlock your personalised feedback report.
                </p>

                <Link
                  href="/role-play"
                  className="primary-button"
                >
                  Continue AI Voice practice
                </Link>
              </section>
            </>
          ) : report ? (
            <>
              <section className={styles.reportCard}>
                <div className={styles.reportHeader}>
                  <div>
                    <p className="eyebrow">
                      Personalised report
                    </p>

                    <h2>
                      Great job — 5 days in a row
                    </h2>
                  </div>

                  <span className={styles.badge}>
                    {report.voicePracticeDays}-day voice streak
                  </span>
                </div>

                <p className={styles.summary}>
                  {report.summary}
                </p>

                <div className={styles.columns}>
                  <section className={styles.section}>
                    <h3>
                      What is improving
                    </h3>

                    <ul>
                      {report.strengths.map(
                        (item) => (
                          <li key={item}>
                            {item}
                          </li>
                        ),
                      )}
                    </ul>
                  </section>

                  <section className={styles.section}>
                    <h3>
                      What to practise next
                    </h3>

                    <ul>
                      {report.focusAreas.map(
                        (item) => (
                          <li key={item}>
                            {item}
                          </li>
                        ),
                      )}
                    </ul>
                  </section>
                </div>

                <p className={styles.pronunciationNote}>
                  <strong>
                    Speaking note: {" "}
                  </strong>
                  {report.pronunciationGuidance}
                </p>
              </section>

              <section className={styles.tutorCard}>
                <div className={styles.tutorCopy}>
                  <p className="eyebrow">
                    Practise this live
                  </p>

                  <h2>
                    Continue with a human Tun tutor
                  </h2>

                  <p>
                    {report.tutorRecommendation}
                  </p>

                  <p>
                    Eligible Tun subscribers may receive a free or discounted 15-minute trial lesson. The final offer is shown on the Tun tutoring page.
                  </p>
                </div>

                <a
                  href={report.tutoringUrl}
                  className="primary-button"
                  target="_blank"
                  rel="noreferrer"
                >
                  Practice with a Tun Tutor
                </a>
              </section>

              <div className={styles.actions}>
                <Link
                  href="/role-play"
                  className="text-button"
                >
                  Continue AI Role-Play
                </Link>
              </div>
            </>
          ) : (
            <section className={`${styles.card} ${styles.stateCard}`}>
              <strong>
                Your report is not ready yet
              </strong>

              <p>
                Continue practising with your voice in AI Role-Play and check again after reaching five consecutive days.
              </p>

              <Link
                href="/role-play"
                className="primary-button"
              >
                Start practising
              </Link>
            </section>
          )}
        </main>
      </SiteFrame>
    </ProtectedRoute>
  );
}
