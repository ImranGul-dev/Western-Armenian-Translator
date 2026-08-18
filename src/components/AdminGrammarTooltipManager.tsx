"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getSupabaseBrowserClient,
} from "@/lib/supabase/client";

import styles from "./AdminGrammarTooltipManager.module.css";

interface GrammarRuleRow {
  id: string;
  title: string;
  description: string;
  source_language: string;
  target_language: string;
  rule_category: string | null;
  priority: number;
  approved: boolean;
  commercial_use_allowed: boolean;
  tooltip_enabled: boolean;
  tooltip_text: string;
  tooltip_example: string;
  tooltip_triggers: string[];
}

interface TooltipForm {
  enabled: boolean;
  text: string;
  example: string;
  triggers: string;
}

function formFromRule(
  rule: GrammarRuleRow,
): TooltipForm {
  return {
    enabled:
      Boolean(rule.tooltip_enabled),
    text:
      rule.tooltip_text || "",
    example:
      rule.tooltip_example || "",
    triggers:
      Array.isArray(rule.tooltip_triggers)
        ? rule.tooltip_triggers.join("\n")
        : "",
  };
}

function emptyForm(): TooltipForm {
  return {
    enabled: false,
    text: "",
    example: "",
    triggers: "",
  };
}

function languageLabel(
  value: string,
): string {
  if (value === "en") {
    return "English";
  }

  if (value === "hyw") {
    return "Western Armenian";
  }

  if (value === "hye") {
    return "Eastern Armenian";
  }

  return value;
}

export function AdminGrammarTooltipManager() {
  const [
    rules,
    setRules,
  ] = useState<GrammarRuleRow[]>([]);

  const [
    query,
    setQuery,
  ] = useState("");

  const [
    selectedId,
    setSelectedId,
  ] = useState<string | null>(null);

  const [
    form,
    setForm,
  ] = useState<TooltipForm>(
    emptyForm,
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  const load = useCallback(
    async () => {
      setLoading(true);
      setError("");

      const {
        data,
        error: loadError,
      } =
        await getSupabaseBrowserClient()
          .from("grammar_rules")
          .select(
            "id,title,description,source_language,target_language,rule_category,priority,approved,commercial_use_allowed,tooltip_enabled,tooltip_text,tooltip_example,tooltip_triggers",
          )
          .order(
            "priority",
            {
              ascending: true,
            },
          )
          .order(
            "title",
            {
              ascending: true,
            },
          )
          .limit(300);

      if (loadError) {
        setError(loadError.message);
        setRules([]);
        setLoading(false);
        return;
      }

      const nextRules =
        (data || []) as GrammarRuleRow[];

      setRules(nextRules);
      setLoading(false);

      if (
        selectedId &&
        !nextRules.some(
          (rule) =>
            rule.id === selectedId,
        )
      ) {
        setSelectedId(null);
        setForm(emptyForm());
      }
    },
    [selectedId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const selectedRule =
    useMemo(
      () =>
        rules.find(
          (rule) =>
            rule.id === selectedId,
        ) || null,
      [rules, selectedId],
    );

  const filteredRules =
    useMemo(
      () => {
        const normalized =
          query.trim().toLowerCase();

        if (!normalized) {
          return rules;
        }

        return rules.filter(
          (rule) =>
            [
              rule.title,
              rule.description,
              rule.rule_category || "",
              ...(rule.tooltip_triggers || []),
            ]
              .join(" ")
              .toLowerCase()
              .includes(normalized),
        );
      },
      [query, rules],
    );

  function selectRule(
    rule: GrammarRuleRow,
  ) {
    setSelectedId(rule.id);
    setForm(formFromRule(rule));
    setMessage("");
    setError("");
  }

  async function save() {
    if (!selectedRule) {
      return;
    }

    const triggers =
      form.triggers
        .split(/\n|,/u)
        .map(
          (item) =>
            item.trim(),
        )
        .filter(Boolean);

    if (
      form.enabled &&
      !form.text.trim()
    ) {
      setError(
        "Add a learner-facing explanation before enabling this tooltip.",
      );
      return;
    }

    if (
      form.enabled &&
      !triggers.length
    ) {
      setError(
        "Add at least one trigger word or phrase before enabling this tooltip.",
      );
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    const {
      error: saveError,
    } =
      await getSupabaseBrowserClient()
        .from("grammar_rules")
        .update({
          tooltip_enabled:
            form.enabled,
          tooltip_text:
            form.text.trim(),
          tooltip_example:
            form.example.trim(),
          tooltip_triggers:
            triggers,
        })
        .eq(
          "id",
          selectedRule.id,
        );

    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    setMessage(
      form.enabled
        ? "Grammar tooltip saved and enabled. It will be learner-visible only when this rule is also approved and commercial-use allowed."
        : "Grammar tooltip settings saved. The learner-facing tooltip is disabled.",
    );

    await load();
  }

  function resetForm() {
    if (!selectedRule) {
      return;
    }

    setForm(
      formFromRule(selectedRule),
    );
    setMessage("");
    setError("");
  }

  const learnerReady =
    Boolean(
      selectedRule &&
      selectedRule.approved &&
      selectedRule.commercial_use_allowed &&
      form.enabled,
    );

  return (
    <section className={styles.section}>
      <div className={styles.heading}>
        <div>
          <h2>
            Learner grammar tooltips
          </h2>

          <p>
            Add short learner-friendly explanations to existing grammar rules. Tooltips are shown only when the rule is approved, commercial-use allowed, enabled here and one of its configured trigger words or phrases appears in the translation output.
          </p>
        </div>
      </div>

      {message ? (
        <div className={styles.message}>
          {message}
        </div>
      ) : null}

      {error ? (
        <div
          className={styles.error}
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.cardHeader}>
            <h3>
              Grammar rules
            </h3>

            <p>
              Choose an existing rule to configure its learner tooltip.
            </p>
          </div>

          <div className={styles.searchWrap}>
            <input
              className={styles.input}
              value={query}
              onChange={
                (event) =>
                  setQuery(
                    event.target.value,
                  )
              }
              placeholder="Search rules or tooltip triggers"
              aria-label="Search grammar rules"
            />
          </div>

          {loading ? (
            <div className={styles.empty}>
              Loading grammar rules...
            </div>
          ) : filteredRules.length ? (
            <div className={styles.ruleList}>
              {filteredRules.map(
                (rule) => (
                  <button
                    key={rule.id}
                    type="button"
                    className={`${styles.ruleButton} ${
                      selectedId === rule.id
                        ? styles.ruleButtonActive
                        : ""
                    }`}
                    onClick={() =>
                      selectRule(rule)
                    }
                  >
                    <span className={styles.ruleTitle}>
                      {rule.title}
                    </span>

                    <span className={styles.ruleMeta}>
                      <span className={styles.badge}>
                        {languageLabel(
                          rule.source_language,
                        )}{" "}
                        →{" "}
                        {languageLabel(
                          rule.target_language,
                        )}
                      </span>

                      <span className={styles.badge}>
                        Priority {rule.priority}
                      </span>

                      <span
                        className={`${styles.badge} ${
                          rule.tooltip_enabled
                            ? styles.badgeOn
                            : ""
                        }`}
                      >
                        {rule.tooltip_enabled
                          ? "Tooltip on"
                          : "Tooltip off"}
                      </span>
                    </span>
                  </button>
                ),
              )}
            </div>
          ) : (
            <div className={styles.empty}>
              No grammar rules match your search.
            </div>
          )}
        </article>

        <article className={styles.card}>
          <div className={styles.cardHeader}>
            <h3>
              Tooltip settings
            </h3>

            <p>
              Keep explanations short and practical for learners. Trigger phrases should match text that may actually appear in Western Armenian output.
            </p>
          </div>

          {!selectedRule ? (
            <div className={styles.empty}>
              Select a grammar rule to configure its tooltip.
            </div>
          ) : (
            <div className={styles.editor}>
              <div className={styles.ruleContext}>
                <strong>
                  {selectedRule.title}
                </strong>

                <p>
                  {selectedRule.description}
                </p>

                <div className={styles.statusRow}>
                  <span
                    className={
                      selectedRule.approved
                        ? styles.statusReady
                        : styles.statusWaiting
                    }
                  >
                    {selectedRule.approved
                      ? "Approved"
                      : "Waiting for approval"}
                  </span>

                  <span
                    className={
                      selectedRule.commercial_use_allowed
                        ? styles.statusReady
                        : styles.statusWaiting
                    }
                  >
                    {selectedRule.commercial_use_allowed
                      ? "Commercial use allowed"
                      : "Commercial use not allowed"}
                  </span>

                  <span
                    className={
                      learnerReady
                        ? styles.statusReady
                        : styles.statusWaiting
                    }
                  >
                    {learnerReady
                      ? "Learner-ready"
                      : "Not learner-ready"}
                  </span>
                </div>
              </div>

              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={
                    (event) =>
                      setForm(
                        (current) => ({
                          ...current,
                          enabled:
                            event.target.checked,
                        }),
                      )
                  }
                />

                <span className={styles.checkboxCopy}>
                  <strong>
                    Enable learner tooltip
                  </strong>

                  <span>
                    Enabling this alone does not publish the tooltip. The grammar rule must also be approved and commercial-use allowed.
                  </span>
                </span>
              </label>

              <div className={styles.field}>
                <label htmlFor="grammar-tooltip-text">
                  Learner explanation
                </label>

                <textarea
                  id="grammar-tooltip-text"
                  className={styles.textarea}
                  maxLength={1200}
                  value={form.text}
                  onChange={
                    (event) =>
                      setForm(
                        (current) => ({
                          ...current,
                          text:
                            event.target.value,
                        }),
                      )
                  }
                  placeholder="Explain the grammar point in simple learner-friendly language."
                />

                <span className={styles.helper}>
                  Maximum 1,200 characters. Avoid internal translator instructions or editorial notes here.
                </span>
              </div>

              <div className={styles.field}>
                <label htmlFor="grammar-tooltip-example">
                  Example
                </label>

                <textarea
                  id="grammar-tooltip-example"
                  className={styles.textarea}
                  maxLength={1000}
                  value={form.example}
                  onChange={
                    (event) =>
                      setForm(
                        (current) => ({
                          ...current,
                          example:
                            event.target.value,
                        }),
                      )
                  }
                  placeholder="Optional short example that helps explain the rule."
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="grammar-tooltip-triggers">
                  Trigger words or phrases
                </label>

                <textarea
                  id="grammar-tooltip-triggers"
                  className={styles.textarea}
                  value={form.triggers}
                  onChange={
                    (event) =>
                      setForm(
                        (current) => ({
                          ...current,
                          triggers:
                            event.target.value,
                        }),
                      )
                  }
                  placeholder={"կը\nպիտի\nինչպէ՞ս"}
                />

                <span className={styles.helper}>
                  Enter one trigger per line, or separate them with commas. Use exact Western Armenian words or short constructions likely to appear in translation output.
                </span>
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={saving}
                  onClick={() =>
                    void save()
                  }
                >
                  {saving
                    ? "Saving..."
                    : "Save tooltip settings"}
                </button>

                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={saving}
                  onClick={resetForm}
                >
                  Reset changes
                </button>
              </div>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
