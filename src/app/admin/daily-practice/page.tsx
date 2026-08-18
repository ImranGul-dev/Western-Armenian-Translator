"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { DashboardShell } from "@/components/DashboardShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import {
  changeAdminDailyPracticePhraseState,
  createAdminDailyPracticePhrase,
  listAdminDailyPracticePhrases,
  updateAdminDailyPracticePhrase,
  type DailyPracticeAdminPhrase,
  type DailyPracticeAdminPhraseInput,
  type DailyPracticeAdminStateAction,
  type DailyPracticeDifficulty,
} from "@/lib/daily-practice-phrase-api";
import {
  transliterateWesternArmenian,
} from "@/lib/western-armenian-transliteration";

import styles from "./daily-practice.module.css";

type StatusFilter =
  | "all"
  | "published"
  | "draft"
  | "archived";

interface PhraseForm {
  practiceDate: string;
  westernArmenianText: string;
  englishText: string;
  category: string;
  difficulty: DailyPracticeDifficulty;
  teachingNote: string;
  published: boolean;
}

function todayDateInput(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function blankPhrase(): PhraseForm {
  return {
    practiceDate: todayDateInput(),
    westernArmenianText: "",
    englishText: "",
    category: "everyday",
    difficulty: "beginner",
    teachingNote: "",
    published: false,
  };
}

function phraseToForm(
  phrase: DailyPracticeAdminPhrase,
): PhraseForm {
  return {
    practiceDate: phrase.practiceDate,
    westernArmenianText: phrase.westernArmenianText,
    englishText: phrase.englishText,
    category: phrase.category,
    difficulty: phrase.difficulty,
    teachingNote: phrase.teachingNote,
    published: phrase.published,
  };
}

function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);

  if (!match) {
    return value;
  }

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );

  return new Intl.DateTimeFormat(
    "en-AU",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    },
  ).format(date);
}

function statusFor(
  phrase: DailyPracticeAdminPhrase,
): {
  label: string;
  className: string;
} {
  if (phrase.archivedAt) {
    return {
      label: "Archived",
      className: styles.statusArchived,
    };
  }

  if (phrase.published) {
    return {
      label: "Published",
      className: styles.statusPublished,
    };
  }

  return {
    label: "Draft",
    className: styles.statusDraft,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

export default function AdminDailyPracticePage() {
  const { session } = useAuth();

  const [phrases, setPhrases] = useState<DailyPracticeAdminPhrase[]>([]);
  const [form, setForm] = useState<PhraseForm>(blankPhrase);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const accessToken = session?.access_token ?? "";

  const load = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const rows = await listAdminDailyPracticePhrases(accessToken);
      setPhrases(rows);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredPhrases = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return phrases.filter((phrase) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "published" &&
          phrase.published &&
          !phrase.archivedAt) ||
        (statusFilter === "draft" &&
          !phrase.published &&
          !phrase.archivedAt) ||
        (statusFilter === "archived" &&
          Boolean(phrase.archivedAt));

      if (!matchesStatus) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [
        phrase.practiceDate,
        phrase.westernArmenianText,
        phrase.englishText,
        phrase.category,
        phrase.difficulty,
        phrase.teachingNote,
      ].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      );
    });
  }, [phrases, query, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: phrases.length,
      published: phrases.filter(
        (phrase) => phrase.published && !phrase.archivedAt,
      ).length,
      drafts: phrases.filter(
        (phrase) => !phrase.published && !phrase.archivedAt,
      ).length,
      archived: phrases.filter((phrase) => Boolean(phrase.archivedAt)).length,
    };
  }, [phrases]);

  const previewTransliteration = useMemo(() => {
    const text = form.westernArmenianText.trim();

    return text
      ? transliterateWesternArmenian(text)
      : "";
  }, [form.westernArmenianText]);

  function resetForm() {
    setEditingId(null);
    setForm(blankPhrase());
    setMessage("");
    setError("");
  }

  function beginEdit(phrase: DailyPracticeAdminPhrase) {
    setEditingId(phrase.id);
    setForm(phraseToForm(phrase));
    setMessage("");
    setError("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken) {
      return;
    }

    const payload: DailyPracticeAdminPhraseInput = {
      practiceDate: form.practiceDate.trim(),
      westernArmenianText: form.westernArmenianText.trim(),
      englishText: form.englishText.trim(),
      category: form.category.trim(),
      difficulty: form.difficulty,
      teachingNote: form.teachingNote.trim(),
      published: form.published,
    };

    if (
      !payload.practiceDate ||
      !payload.westernArmenianText ||
      !payload.englishText ||
      !payload.category
    ) {
      setError("Date, Western Armenian, English and category are required.");
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const saved = editingId
        ? await updateAdminDailyPracticePhrase(
            editingId,
            payload,
            accessToken,
          )
        : await createAdminDailyPracticePhrase(
            payload,
            accessToken,
          );

      setPhrases((current) => {
        const next = current.filter((phrase) => phrase.id !== saved.id);
        next.push(saved);
        next.sort((a, b) => b.practiceDate.localeCompare(a.practiceDate));
        return next;
      });

      setMessage(
        editingId
          ? "Daily Practice Phrase updated."
          : "Daily Practice Phrase created.",
      );

      setEditingId(saved.id);
      setForm(phraseToForm(saved));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function changeState(
    phrase: DailyPracticeAdminPhrase,
    action: DailyPracticeAdminStateAction,
  ) {
    if (!accessToken) {
      return;
    }

    setWorkingId(phrase.id);
    setMessage("");
    setError("");

    try {
      const updated = await changeAdminDailyPracticePhraseState(
        phrase.id,
        action,
        accessToken,
      );

      setPhrases((current) =>
        current.map((item) =>
          item.id === updated.id
            ? updated
            : item,
        ),
      );

      if (editingId === updated.id) {
        setForm(phraseToForm(updated));
      }

      const stateMessage: Record<DailyPracticeAdminStateAction, string> = {
        admin_publish: "Phrase published.",
        admin_unpublish: "Phrase moved back to draft.",
        admin_archive: "Phrase archived.",
        admin_restore: "Phrase restored as a draft.",
      };

      setMessage(stateMessage[action]);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <ProtectedRoute roles={["admin"]}>
      <DashboardShell
        admin
        title="Daily Practice Phrases"
        description="Schedule and manage the Western Armenian phrase learners see for each calendar day."
      >
        <div className={styles.pageStack}>
          <section className={styles.summaryGrid} aria-label="Daily Practice Phrase summary">
            <article className={styles.summaryCard}>
              <span>Total phrases</span>
              <strong>{stats.total.toLocaleString()}</strong>
            </article>

            <article className={styles.summaryCard}>
              <span>Published</span>
              <strong>{stats.published.toLocaleString()}</strong>
            </article>

            <article className={styles.summaryCard}>
              <span>Drafts</span>
              <strong>{stats.drafts.toLocaleString()}</strong>
            </article>

            <article className={styles.summaryCard}>
              <span>Archived</span>
              <strong>{stats.archived.toLocaleString()}</strong>
            </article>
          </section>

          {message && (
            <div className={styles.message} role="status">
              {message}
            </div>
          )}

          {error && (
            <div className={styles.errorMessage} role="alert">
              {error}
            </div>
          )}

          <section className={styles.editorGrid}>
            <form className={styles.editorCard} onSubmit={submit}>
              <div className={styles.cardHeading}>
                <div>
                  <h2>{editingId ? "Edit scheduled phrase" : "Schedule a phrase"}</h2>
                  <p>Only one phrase can be assigned to a calendar date.</p>
                </div>

                {editingId && (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={resetForm}
                  >
                    New phrase
                  </button>
                )}
              </div>

              <div className={styles.formGrid}>
                <div className={styles.formField}>
                  <label htmlFor="daily-practice-date">Practice date</label>
                  <input
                    id="daily-practice-date"
                    className={styles.input}
                    type="date"
                    value={form.practiceDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        practiceDate: event.target.value,
                      }))
                    }
                    required
                  />
                  <span className={styles.helper}>
                    Learners receive this phrase when that date is current in their browser timezone.
                  </span>
                </div>

                <div className={styles.formField}>
                  <label htmlFor="daily-practice-category">Category</label>
                  <input
                    id="daily-practice-category"
                    className={styles.input}
                    value={form.category}
                    maxLength={60}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        category: event.target.value,
                      }))
                    }
                    placeholder="everyday"
                    required
                  />
                </div>

                <div className={styles.formField}>
                  <label htmlFor="daily-practice-difficulty">Difficulty</label>
                  <select
                    id="daily-practice-difficulty"
                    className={styles.select}
                    value={form.difficulty}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        difficulty: event.target.value as DailyPracticeDifficulty,
                      }))
                    }
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>

                <div className={`${styles.formField} ${styles.formFieldFull}`}>
                  <label htmlFor="daily-practice-western">Western Armenian</label>
                  <textarea
                    id="daily-practice-western"
                    className={styles.textarea}
                    value={form.westernArmenianText}
                    maxLength={500}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        westernArmenianText: event.target.value,
                      }))
                    }
                    placeholder="Enter the learner-facing Western Armenian phrase"
                    required
                  />
                </div>

                <div className={`${styles.formField} ${styles.formFieldFull}`}>
                  <label htmlFor="daily-practice-english">English meaning</label>
                  <textarea
                    id="daily-practice-english"
                    className={styles.textarea}
                    value={form.englishText}
                    maxLength={500}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        englishText: event.target.value,
                      }))
                    }
                    placeholder="Enter the English meaning"
                    required
                  />
                </div>

                <div className={`${styles.formField} ${styles.formFieldFull}`}>
                  <label htmlFor="daily-practice-note">Teaching note</label>
                  <textarea
                    id="daily-practice-note"
                    className={styles.textarea}
                    value={form.teachingNote}
                    maxLength={1200}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        teachingNote: event.target.value,
                      }))
                    }
                    placeholder="Optional short explanation, usage note or learning tip"
                  />
                </div>

                <label className={`${styles.checkboxRow} ${styles.formFieldFull}`}>
                  <input
                    type="checkbox"
                    checked={form.published}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        published: event.target.checked,
                      }))
                    }
                  />

                  <span className={styles.checkboxCopy}>
                    <strong>Publish this phrase</strong>
                    <span>
                      Published phrases are eligible to appear to learners on their scheduled date. Drafts remain admin-only.
                    </span>
                  </span>
                </label>
              </div>

              <div className={styles.formActions}>
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editingId
                      ? "Save changes"
                      : "Create phrase"}
                </button>

                {editingId && (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={saving}
                    onClick={resetForm}
                  >
                    Cancel editing
                  </button>
                )}
              </div>
            </form>

            <aside className={styles.previewCard}>
              <div className={styles.cardHeading}>
                <div>
                  <h2>Learner preview</h2>
                  <p>Preview the core phrase content before publishing.</p>
                </div>
              </div>

              {form.westernArmenianText.trim() || form.englishText.trim() ? (
                <div className={styles.previewPhrase}>
                  <div className={styles.previewMeta}>
                    <span className={styles.badge}>
                      {form.practiceDate
                        ? formatDate(form.practiceDate)
                        : "No date"}
                    </span>
                    <span className={styles.badge}>{form.category || "Uncategorised"}</span>
                    <span className={styles.badge}>{form.difficulty}</span>
                    <span
                      className={`${styles.statusBadge} ${
                        form.published
                          ? styles.statusPublished
                          : styles.statusDraft
                      }`}
                    >
                      {form.published ? "Published" : "Draft"}
                    </span>
                  </div>

                  <p className={styles.armenianText}>
                    {form.westernArmenianText || "Western Armenian phrase"}
                  </p>

                  {previewTransliteration && (
                    <p className={styles.transliteration}>
                      {previewTransliteration}
                    </p>
                  )}

                  <p className={styles.englishText}>
                    {form.englishText || "English meaning"}
                  </p>

                  {form.teachingNote.trim() && (
                    <div className={styles.noteBox}>
                      <strong>Teaching note</strong>
                      <p>{form.teachingNote}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className={styles.emptyPreview}>
                  Add Western Armenian and English text to preview the learner card.
                </div>
              )}
            </aside>
          </section>

          <section className={styles.listCard}>
            <div className={styles.listHeading}>
              <div>
                <h2>Scheduled phrases</h2>
                <p>Search, edit and control publication status without deleting historical content.</p>
              </div>
              <span className={styles.count}>
                {filteredPhrases.length.toLocaleString()} shown
              </span>
            </div>

            <div className={styles.toolbar} style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)" }}>
              <div className={styles.filters}>
                <div className={styles.fieldWide}>
                  <label htmlFor="daily-practice-search">Search</label>
                  <input
                    id="daily-practice-search"
                    className={styles.input}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search date, Armenian, English, category or note"
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="daily-practice-status">Status</label>
                  <select
                    id="daily-practice-status"
                    className={styles.select}
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as StatusFilter)
                    }
                  >
                    <option value="all">All</option>
                    <option value="published">Published</option>
                    <option value="draft">Drafts</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void load()}
                disabled={loading}
              >
                Refresh
              </button>
            </div>

            {loading ? (
              <div className={styles.loading}>Loading Daily Practice Phrases...</div>
            ) : filteredPhrases.length ? (
              <div className={styles.phraseList}>
                {filteredPhrases.map((phrase) => {
                  const status = statusFor(phrase);
                  const working = workingId === phrase.id;

                  return (
                    <article className={styles.phraseRow} key={phrase.id}>
                      <div className={styles.dateColumn}>
                        <strong>{formatDate(phrase.practiceDate)}</strong>
                        <span className={`${styles.statusBadge} ${status.className}`}>
                          {status.label}
                        </span>
                      </div>

                      <div className={styles.contentColumn}>
                        <h3>{phrase.westernArmenianText}</h3>
                        <p>{phrase.englishText}</p>
                        <div className={styles.rowMeta}>
                          <span className={styles.badge}>{phrase.category}</span>
                          <span className={styles.badge}>{phrase.difficulty}</span>
                        </div>
                      </div>

                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className={styles.smallButton}
                          onClick={() => beginEdit(phrase)}
                          disabled={working}
                        >
                          Edit
                        </button>

                        {!phrase.archivedAt && phrase.published && (
                          <button
                            type="button"
                            className={`${styles.smallButton} ${styles.smallButtonAccent}`}
                            onClick={() =>
                              void changeState(phrase, "admin_unpublish")
                            }
                            disabled={working}
                          >
                            {working ? "Working..." : "Unpublish"}
                          </button>
                        )}

                        {!phrase.archivedAt && !phrase.published && (
                          <button
                            type="button"
                            className={`${styles.smallButton} ${styles.smallButtonAccent}`}
                            onClick={() =>
                              void changeState(phrase, "admin_publish")
                            }
                            disabled={working}
                          >
                            {working ? "Working..." : "Publish"}
                          </button>
                        )}

                        {!phrase.archivedAt ? (
                          <button
                            type="button"
                            className={`${styles.smallButton} ${styles.smallButtonDanger}`}
                            onClick={() =>
                              void changeState(phrase, "admin_archive")
                            }
                            disabled={working}
                          >
                            {working ? "Working..." : "Archive"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={`${styles.smallButton} ${styles.smallButtonAccent}`}
                            onClick={() =>
                              void changeState(phrase, "admin_restore")
                            }
                            disabled={working}
                          >
                            {working ? "Working..." : "Restore"}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyList}>
                No Daily Practice Phrases match the current filters.
              </div>
            )}
          </section>
        </div>
      </DashboardShell>
    </ProtectedRoute>
  );
}
