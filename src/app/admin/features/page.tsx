"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  DashboardShell,
} from "@/components/DashboardShell";

import {
  ProtectedRoute,
} from "@/components/ProtectedRoute";

import {
  SYSTEM_FEATURE_TOGGLES_UPDATED_EVENT,
} from "@/contexts/SystemFeatureToggleContext";

import {
  DEFAULT_SYSTEM_FEATURE_TOGGLES,
  SYSTEM_FEATURE_TOGGLE_DEFINITIONS,
  loadSystemFeatureToggles,
  saveSystemFeatureToggles,
  type SystemFeatureToggle,
  type SystemFeatureToggles,
} from "@/lib/system-feature-toggles";

import styles from "./features.module.css";


const AREA_ORDER = [
  "Core",
  "Learning",
  "Account",
  "Content",
  "Platform",
] as const;


function sameToggles(
  first: SystemFeatureToggles,
  second: SystemFeatureToggles,
) {
  return Object.keys(
    DEFAULT_SYSTEM_FEATURE_TOGGLES,
  ).every(
    (key) =>
      first[key as SystemFeatureToggle] ===
      second[key as SystemFeatureToggle],
  );
}


export default function AdminFeaturesPage() {
  const [saved, setSaved] =
    useState<SystemFeatureToggles>(
      DEFAULT_SYSTEM_FEATURE_TOGGLES,
    );

  const [draft, setDraft] =
    useState<SystemFeatureToggles>(
      DEFAULT_SYSTEM_FEATURE_TOGGLES,
    );

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [tone, setTone] =
    useState<"success" | "error" | "">("");

  const dirty =
    !sameToggles(saved, draft);

  const enabledCount =
    Object.values(draft)
      .filter(Boolean)
      .length;

  const disabledCount =
    Object.values(draft).length -
    enabledCount;

  const grouped =
    useMemo(
      () =>
        AREA_ORDER.map(
          (area) => ({
            area,
            items:
              SYSTEM_FEATURE_TOGGLE_DEFINITIONS
                .filter(
                  (item) =>
                    item.area === area,
                ),
          }),
        ),
      [],
    );

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setMessage("");
      setTone("");

      try {
        const toggles =
          await loadSystemFeatureToggles();

        if (!active) {
          return;
        }

        setSaved(toggles);
        setDraft(toggles);
      } catch (cause) {
        if (!active) {
          return;
        }

        setTone("error");
        setMessage(
          cause instanceof Error
            ? cause.message
            : "System feature toggles could not be loaded.",
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  function changeToggle(
    key: SystemFeatureToggle,
    enabled: boolean,
  ) {
    setDraft(
      (current) => ({
        ...current,
        [key]: enabled,
      }),
    );

    setMessage("");
    setTone("");
  }

  function discard() {
    setDraft(saved);
    setMessage("");
    setTone("");
  }

  async function save() {
    if (!dirty || saving) {
      return;
    }

    if (
      saved.translation &&
      !draft.translation
    ) {
      const confirmed =
        window.confirm(
          "Disable the core Translation feature? Users will be unable to open the translator until this is enabled again.",
        );

      if (!confirmed) {
        return;
      }
    }

    setSaving(true);
    setMessage("");
    setTone("");

    try {
      const next =
        await saveSystemFeatureToggles(
          draft,
        );

      setSaved(next);
      setDraft(next);

      window.dispatchEvent(
        new CustomEvent(
          SYSTEM_FEATURE_TOGGLES_UPDATED_EVENT,
          {
            detail: next,
          },
        ),
      );

      setTone("success");
      setMessage(
        "System feature toggles saved and applied. The change has also been recorded in Admin Audit Logs.",
      );
    } catch (cause) {
      setTone("error");
      setMessage(
        cause instanceof Error
          ? cause.message
          : "System feature toggles could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedRoute roles={["admin"]}>
      <DashboardShell
        admin
        title="System feature toggles"
        description="Temporarily disable selected product features for maintenance, staged releases or operational incidents without changing plan entitlements."
      >
        <div className={styles.stack}>
          <div className={styles.notice}>
            <strong>
              These are global kill switches, not plan controls.
            </strong>{" "}
            Turning a feature off makes that feature unavailable even to accounts that normally have access. Turning it on never grants access beyond the user&apos;s existing plan and role.
          </div>

          {message ? (
            <div
              className={`${styles.message} ${
                tone === "error"
                  ? styles.error
                  : styles.success
              }`}
              role={
                tone === "error"
                  ? "alert"
                  : "status"
              }
            >
              {message}
            </div>
          ) : dirty ? (
            <div
              className={`${styles.message} ${styles.dirty}`}
              role="status"
            >
              You have unsaved feature-toggle changes. Nothing changes globally until you click Save changes.
            </div>
          ) : null}

          <section className="dashboard-card">
            <div className={styles.toolbar}>
              <div className={styles.toolbarCopy}>
                <strong>
                  Runtime controls
                </strong>
                <span>
                  All features default to enabled. Disabled content and user data remain stored and can be restored by re-enabling the feature.
                </span>
              </div>

              <div className={styles.toolbarActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={
                    loading ||
                    saving ||
                    !dirty
                  }
                  onClick={discard}
                >
                  Discard changes
                </button>

                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={
                    loading ||
                    saving ||
                    !dirty
                  }
                  onClick={() => void save()}
                >
                  {saving
                    ? "Saving..."
                    : "Save changes"}
                </button>
              </div>
            </div>
          </section>

          <div className={styles.summaryGrid}>
            <article className={styles.summaryCard}>
              <span>Total controls</span>
              <strong>
                {Object.keys(draft).length}
              </strong>
            </article>

            <article className={styles.summaryCard}>
              <span>Enabled</span>
              <strong>
                {enabledCount}
              </strong>
            </article>

            <article className={styles.summaryCard}>
              <span>Disabled</span>
              <strong>
                {disabledCount}
              </strong>
            </article>
          </div>

          <div className={styles.groups}>
            {grouped.map(
              ({ area, items }) => (
                <section
                  className={styles.group}
                  key={area}
                >
                  <div className={styles.groupHeader}>
                    <h2>{area}</h2>
                    <span>
                      {items.length} {items.length === 1 ? "control" : "controls"}
                    </span>
                  </div>

                  <div className={styles.rows}>
                    {items.map(
                      (item) => {
                        const enabled =
                          draft[item.key];

                        return (
                          <div
                            className={styles.row}
                            key={item.key}
                          >
                            <div className={styles.rowCopy}>
                              <div className={styles.rowTitle}>
                                <strong>
                                  {item.label}
                                </strong>

                                <span
                                  className={`${styles.status} ${
                                    enabled
                                      ? styles.statusOn
                                      : styles.statusOff
                                  }`}
                                >
                                  {enabled
                                    ? "Enabled"
                                    : "Disabled"}
                                </span>
                              </div>

                              <p>
                                {item.description}
                              </p>

                              {item.warning ? (
                                <p className={styles.warning}>
                                  {item.warning}
                                </p>
                              ) : null}
                            </div>

                            <label className={styles.switch}>
                              <input
                                type="checkbox"
                                checked={enabled}
                                disabled={loading || saving}
                                aria-label={`${item.label} ${enabled ? "enabled" : "disabled"}`}
                                onChange={(event) =>
                                  changeToggle(
                                    item.key,
                                    event.target.checked,
                                  )
                                }
                              />

                              <span
                                className={styles.track}
                                aria-hidden="true"
                              />

                              <span className={styles.switchText}>
                                {enabled
                                  ? "On"
                                  : "Off"}
                              </span>
                            </label>
                          </div>
                        );
                      },
                    )}
                  </div>
                </section>
              ),
            )}
          </div>
        </div>
      </DashboardShell>
    </ProtectedRoute>
  );
}
