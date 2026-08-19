"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useSystemFeatureToggles,
} from "@/contexts/SystemFeatureToggleContext";

import {
  loadGrammarTooltipsForTarget,
  type GrammarTooltip,
} from "@/lib/grammar-tooltip-api";

import type {
  LanguageCode,
} from "@/lib/languages";

import styles from "./GrammarTooltipPanel.module.css";


export function GrammarTooltipPanel({
  text,
  language,
  loading = false,
}: {
  text: string;
  language: LanguageCode;
  loading?: boolean;
}) {
  const {
    toggles,
  } =
    useSystemFeatureToggles();

  const [
    tooltips,
    setTooltips,
  ] = useState<GrammarTooltip[]>([]);

  const [
    open,
    setOpen,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");


  useEffect(() => {
    if (
      !toggles.grammar_tooltips ||
      loading ||
      !text.trim()
    ) {
      setTooltips([]);
      setOpen(false);
      setError("");
      return;
    }

    const controller =
      new AbortController();

    setError("");

    void loadGrammarTooltipsForTarget(
      text,
      language,
      8,
    )
      .then((result) => {
        if (
          controller.signal.aborted
        ) {
          return;
        }

        setTooltips(result);

        if (!result.length) {
          setOpen(false);
        }
      })
      .catch((cause) => {
        if (
          controller.signal.aborted
        ) {
          return;
        }

        setTooltips([]);
        setOpen(false);
        setError(
          cause instanceof Error
            ? cause.message
            : "Grammar tips could not be loaded.",
        );
      });

    return () => {
      controller.abort();
    };
  }, [
    language,
    loading,
    text,
    toggles.grammar_tooltips,
  ]);


  if (
    !toggles.grammar_tooltips ||
    loading ||
    !text.trim()
  ) {
    return null;
  }

  if (!tooltips.length) {
    return error ? (
      <div
        className={styles.error}
        role="status"
      >
        Grammar tips are temporarily unavailable.
      </div>
    ) : null;
  }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        onClick={() =>
          setOpen((value) =>
            !value,
          )
        }
      >
        <span aria-hidden="true">
          {"\uD83D\uDCA1"}
        </span>

        <span>
          Grammar {tooltips.length === 1
            ? "tip"
            : "tips"}
        </span>

        <span className={styles.count}>
          {tooltips.length}
        </span>
      </button>

      {open ? (
        <div
          className={styles.panel}
          aria-label="Grammar tips"
        >
          {tooltips.map(
            (tooltip) => (
              <article
                className={styles.tip}
                key={`${tooltip.ruleId}-${tooltip.matchedTrigger}`}
              >
                <div className={styles.tipHeader}>
                  <h4>
                    {tooltip.title}
                  </h4>

                  {tooltip.ruleCategory ? (
                    <span className={styles.badge}>
                      {tooltip.ruleCategory}
                    </span>
                  ) : null}
                </div>

                <p>
                  {tooltip.explanation}
                </p>

                {tooltip.example ? (
                  <div className={styles.example}>
                    {tooltip.example}
                  </div>
                ) : null}

                <span className={styles.matched}>
                  Matched: {tooltip.matchedTrigger}
                </span>
              </article>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
