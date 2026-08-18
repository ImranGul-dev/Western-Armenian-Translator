"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CopyButton,
} from "@/components/CopyButton";

import {
  VoiceListenButton,
} from "@/components/VoiceListenButton";

import {
  useAuth,
} from "@/contexts/AuthContext";

import {
  loadDailyPracticePhrase,
  type DailyPracticePhrase,
} from "@/lib/daily-practice-phrase-api";

import {
  transliterateWesternArmenian,
} from "@/lib/western-armenian-transliteration";

import styles from "./DailyPracticePhraseCard.module.css";

function formatPracticeDate(
  value: string,
): string {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/u.exec(
      value,
    );

  if (!match) {
    return value;
  }

  const date =
    new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    );

  return new Intl.DateTimeFormat(
    "en-AU",
    {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    },
  ).format(date);
}

export function DailyPracticePhraseCard() {
  const {
    session,
  } = useAuth();

  const [
    phrase,
    setPhrase,
  ] =
    useState<DailyPracticePhrase | null>(
      null,
    );

  const [
    timezone,
    setTimezone,
  ] =
    useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  useEffect(() => {
    const accessToken =
      session?.access_token;

    if (!accessToken) {
      setPhrase(null);
      setTimezone("");
      setLoading(false);
      setError("");
      return;
    }

    const controller =
      new AbortController();

    setLoading(true);
    setError("");

    void loadDailyPracticePhrase(
      accessToken,
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (
          controller.signal.aborted
        ) {
          return;
        }

        setPhrase(
          result.phrase,
        );
        setTimezone(
          result.timezone,
        );
      })
      .catch((cause) => {
        if (
          controller.signal.aborted
        ) {
          return;
        }

        if (
          cause instanceof DOMException &&
          cause.name === "AbortError"
        ) {
          return;
        }

        setPhrase(null);
        setTimezone("");
        setError(
          cause instanceof Error
            ? cause.message
            : "Today's practice phrase could not be loaded.",
        );
      })
      .finally(() => {
        if (
          !controller.signal.aborted
        ) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [session?.access_token]);

  const transliteration =
    useMemo(
      () =>
        phrase
          ? transliterateWesternArmenian(
              phrase.westernArmenianText,
            )
          : "",
      [phrase],
    );

  return (
    <section className={styles.card}>
      <div className={styles.heading}>
        <div className={styles.headingCopy}>
          <p className={styles.eyebrow}>
            Daily practice
          </p>

          <h2>
            Phrase of the day
          </h2>

          <p>
            Read it, listen to it and say it aloud once or twice today.
          </p>
        </div>

        {phrase ? (
          <span className={styles.dateBadge}>
            {formatPracticeDate(
              phrase.practiceDate,
            )}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className={styles.loading}>
          Loading today&apos;s practice phrase...
        </div>
      ) : error ? (
        <div
          className={styles.error}
          role="alert"
        >
          {error}
        </div>
      ) : !phrase ? (
        <div className={styles.empty}>
          No practice phrase has been published for today yet.
        </div>
      ) : (
        <>
          <div className={styles.body}>
            <div className={styles.phrasePanel}>
              <div className={styles.meta}>
                <span className={styles.badge}>
                  {phrase.category}
                </span>

                <span className={styles.badge}>
                  {phrase.difficulty}
                </span>
              </div>

              <p className={styles.armenian}>
                {phrase.westernArmenianText}
              </p>

              <p className={styles.english}>
                {phrase.englishText}
              </p>

              {transliteration ? (
                <div className={styles.transliterationBlock}>
                  <div className={styles.transliterationHeader}>
                    <span className={styles.transliterationLabel}>
                      Latin transliteration
                    </span>

                    <VoiceListenButton
                      text={transliteration}
                      language="hyw"
                      mode="pronunciation"
                      defaultSpeed={0.75}
                      label="Pronunciation"
                      compact
                    />
                  </div>

                  <span className={styles.transliteration}>
                    {transliteration}
                  </span>
                </div>
              ) : null}

              <div className={styles.audioActions}>
                <VoiceListenButton
                  text={phrase.westernArmenianText}
                  language="hyw"
                  label="Listen"
                />

                <CopyButton
                  text={phrase.westernArmenianText}
                />
              </div>
            </div>

            <aside className={styles.learningPanel}>
              <h3>
                Teaching note
              </h3>

              {phrase.teachingNote ? (
                <div className={styles.note}>
                  <p>
                    {phrase.teachingNote}
                  </p>
                </div>
              ) : (
                <p className={styles.noNote}>
                  No extra note for today. Focus on saying the phrase naturally and clearly.
                </p>
              )}
            </aside>
          </div>

          <div className={styles.footer}>
            <span>
              Published for your local practice day.
            </span>

            {timezone ? (
              <span>
                Time zone: {timezone}
              </span>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
