"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useAuth,
} from "@/contexts/AuthContext";

import {
  loadVocabularyMastery,
  type VocabularyMastery,
} from "@/lib/vocabulary-mastery-api";

import styles from
  "./VocabularyMasteryBadge.module.css";


interface PendingRequest {
  phraseId: string;
  resolve: (
    mastery: VocabularyMastery,
  ) => void;
  reject: (
    error: unknown,
  ) => void;
}


interface BatchState {
  pending: PendingRequest[];
  scheduled: boolean;
}


const batches =
  new Map<string, BatchState>();


const EMPTY_MASTERY: VocabularyMastery = {
  score: 0,
  reviewCount: 0,
  successfulReviewCount: 0,
  currentRecallStreak: 0,
  lastRating: null,
  lastReviewedAt: null,
};


function masteryLevel(
  mastery: VocabularyMastery,
): {
  label: string;
  className: string;
} {
  if (
    mastery.reviewCount ===
      0
  ) {
    return {
      label: "New",
      className: "learning",
    };
  }

  if (
    mastery.score >=
      90
  ) {
    return {
      label: "Mastered",
      className: "mastered",
    };
  }

  if (
    mastery.score >=
      70
  ) {
    return {
      label: "Strong",
      className: "strong",
    };
  }

  if (
    mastery.score >=
      40
  ) {
    return {
      label: "Developing",
      className: "developing",
    };
  }

  return {
    label: "Learning",
    className: "learning",
  };
}


function requestMastery(
  accessToken: string,
  phraseId: string,
): Promise<VocabularyMastery> {
  return new Promise(
    (
      resolve,
      reject,
    ) => {
      const batch =
        batches.get(
          accessToken,
        ) ?? {
          pending: [],
          scheduled: false,
        };

      batch.pending.push({
        phraseId,
        resolve,
        reject,
      });

      batches.set(
        accessToken,
        batch,
      );

      if (batch.scheduled) {
        return;
      }

      batch.scheduled =
        true;

      window.setTimeout(
        async () => {
          const current =
            batches.get(
              accessToken,
            );

          if (!current) {
            return;
          }

          batches.delete(
            accessToken,
          );

          const requests =
            current.pending;

          const phraseIds =
            Array.from(
              new Set(
                requests.map(
                  (request) =>
                    request.phraseId,
                ),
              ),
            ).slice(
              0,
              100,
            );

          try {
            const items =
              await loadVocabularyMastery(
                accessToken,
                phraseIds,
              );

            const byId =
              new Map(
                items.map(
                  (item) => [
                    item.savedPhraseId,
                    item.mastery,
                  ],
                ),
              );

            for (
              const request of
              requests
            ) {
              request.resolve(
                byId.get(
                  request.phraseId,
                ) ??
                  EMPTY_MASTERY,
              );
            }
          } catch (error) {
            for (
              const request of
              requests
            ) {
              request.reject(
                error,
              );
            }
          }
        },
        0,
      );
    },
  );
}


export function VocabularyMasteryBadge({
  savedPhraseId,
}: {
  savedPhraseId: string;
}) {
  const {
    session,
  } = useAuth();

  const [
    mastery,
    setMastery,
  ] =
    useState<VocabularyMastery | null>(
      null,
    );


  useEffect(() => {
    const accessToken =
      session?.access_token;

    let cancelled =
      false;

    setMastery(
      null,
    );

    if (
      !accessToken ||
      !savedPhraseId
    ) {
      return () => {
        cancelled =
          true;
      };
    }

    void requestMastery(
      accessToken,
      savedPhraseId,
    )
      .then(
        (value) => {
          if (!cancelled) {
            setMastery(
              value,
            );
          }
        },
      )
      .catch(() => {
        if (!cancelled) {
          setMastery(
            EMPTY_MASTERY,
          );
        }
      });

    return () => {
      cancelled =
        true;
    };
  }, [
    savedPhraseId,
    session?.access_token,
  ]);


  if (!mastery) {
    return (
      <span
        className={`${styles.badge} ${styles.loading}`}
        aria-label="Loading Vocabulary Mastery"
      >
        Mastery
        <strong>
          --/100
        </strong>
      </span>
    );
  }


  const level =
    masteryLevel(
      mastery,
    );

  const lastRating =
    mastery.lastRating
      ? mastery.lastRating
          .charAt(0)
          .toUpperCase() +
        mastery.lastRating.slice(1)
      : "Not reviewed";


  return (
    <span
      className={`${styles.badge} ${styles[level.className]}`}
      title={`Reviews: ${mastery.reviewCount}. Last rating: ${lastRating}.`}
      aria-label={`Mastery ${mastery.score} out of 100, ${level.label}`}
    >
      Mastery
      <strong>
        {mastery.score}/100
      </strong>
      <span className={styles.level}>
        {level.label}
      </span>
    </span>
  );
}
