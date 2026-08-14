"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Kind =
  | "glossary"
  | "grammar"
  | "examples";

const configs = {
  glossary: {
    table: "glossary_terms",
    title: "Glossary terms",
    search: [
      "source_term",
      "target_term",
    ],
    fields: [
      "source_language",
      "target_language",
      "source_term",
      "target_term",
      "part_of_speech",
      "definition",
      "notes",
      "source_name",
      "source_url",
      "copyright_status",
    ],
  },

  grammar: {
    table: "grammar_rules",
    title: "Grammar rules",
    search: [
      "title",
      "description",
    ],
    fields: [
      "source_language",
      "target_language",
      "title",
      "description",
      "rule_category",
      "keywords",
      "correct_examples",
      "incorrect_examples",
      "exceptions",
      "notes",
      "source_name",
      "copyright_status",
    ],
  },

  examples: {
    table: "approved_translation_examples",
    title: "Translation examples",
    search: [
      "source_text",
      "translated_text",
    ],
    fields: [
      "source_language",
      "target_language",
      "source_text",
      "translated_text",
      "category",
      "notes",
      "source_name",
    ],
  },
} as const;

const FIELD_LABELS: Record<string, string> = {
  source_language: "Source language",
  target_language: "Target language",

  source_term: "Source word or phrase",
  target_term: "Preferred translation",

  part_of_speech: "Part of speech",
  definition: "Meaning / definition",
  notes: "Notes",

  source_name: "Source / reference name",
  source_url: "Source URL",
  copyright_status: "Copyright / licence status",

  title: "Rule title",
  description: "Rule description",
  rule_category: "Rule category",
  keywords: "Keywords",
  correct_examples: "Correct examples",
  incorrect_examples: "Incorrect examples",
  exceptions: "Exceptions",

  source_text: "Source text",
  translated_text: "Approved translation",
  category: "Category",
};

function blank(kind: Kind) {
  const output: Record<string, any> = {
    source_language: "en",
    target_language: "hyw",
    approved: false,
    commercial_use_allowed: false,
  };

  for (const field of configs[kind].fields) {
    if (!(field in output)) {
      output[field] = "";
    }
  }

  return output;
}

function csvParse(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (
        quoted &&
        text[index + 1] === '"'
      ) {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (
      character === "," &&
      !quoted
    ) {
      row.push(cell);
      cell = "";
    } else if (
      (character === "\n" ||
        character === "\r") &&
      !quoted
    ) {
      if (
        character === "\r" &&
        text[index + 1] === "\n"
      ) {
        index += 1;
      }

      row.push(cell);

      if (row.some(Boolean)) {
        rows.push(row);
      }

      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(cell);

  if (row.some(Boolean)) {
    rows.push(row);
  }

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0];

  return rows
    .slice(1)
    .map((record) =>
      Object.fromEntries(
        headers.map(
          (header, index) => [
            header.trim(),
            record[index] ?? "",
          ],
        ),
      ),
    );
}

function csvEscape(value: unknown) {
  const text =
    typeof value === "object"
      ? JSON.stringify(value)
      : String(value ?? "");

  return `"${text.replaceAll('"', '""')}"`;
}

function languageName(code: string) {
  if (code === "en") {
    return "English";
  }

  if (code === "hyw") {
    return "Western Armenian";
  }

  if (code === "hye") {
    return "Eastern Armenian";
  }

  return code;
}

export function AdminKnowledgeManager({
  kind,
}: {
  kind: Kind;
}) {
  const config = configs[kind];

  const [rows, setRows] =
    useState<any[]>([]);

  const [query, setQuery] =
    useState("");

  const [approval, setApproval] =
    useState("all");

  const [form, setForm] =
    useState<Record<string, any>>(
      blank(kind),
    );

  const [editing, setEditing] =
    useState<string | null>(null);

  const [selected, setSelected] =
    useState<Set<string>>(
      new Set(),
    );

  const [message, setMessage] =
    useState("");

  const load = useCallback(
    async () => {
      let request =
        getSupabaseBrowserClient()
          .from(config.table)
          .select("*")
          .order(
            "updated_at",
            {
              ascending: false,
            },
          )
          .limit(250);

      if (approval !== "all") {
        request = request.eq(
          "approved",
          approval === "approved",
        );
      }

      if (query.trim()) {
        request = request.or(
          config.search
            .map(
              (field) =>
                `${field}.ilike.%${query
                  .trim()
                  .replaceAll(",", "")}%`,
            )
            .join(","),
        );
      }

      const {
        data,
        error,
      } = await request;

      if (error) {
        setMessage(error.message);
      } else {
        setRows(data || []);
      }
    },
    [
      approval,
      config,
      query,
    ],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const fields =
    useMemo(
      () =>
        config.fields as readonly string[],
      [config.fields],
    );

  function normalize() {
    const payload = {
      ...form,
    };

    for (
      const field of [
        "keywords",
        "correct_examples",
        "incorrect_examples",
        "exceptions",
      ]
    ) {
      if (
        field in payload &&
        typeof payload[field] === "string"
      ) {
        payload[field] =
          payload[field]
            .split(/\n|,/)
            .map(
              (item: string) =>
                item.trim(),
            )
            .filter(Boolean);
      }
    }

    payload.commercial_use_allowed =
      Boolean(
        payload.commercial_use_allowed,
      );

    payload.approved =
      Boolean(
        payload.approved,
      );

    return payload;
  }

  async function save(
    event: React.FormEvent,
  ) {
    event.preventDefault();

    const supabase =
      getSupabaseBrowserClient();

    const payload =
      normalize();

    const result = editing
      ? await supabase
          .from(config.table)
          .update(payload)
          .eq("id", editing)
      : await supabase
          .from(config.table)
          .insert(payload);

    if (result.error) {
      setMessage(
        result.error.message,
      );

      return;
    }

    setMessage(
      kind === "glossary"
        ? form.approved
          ? "Glossary term saved and approved for translation use."
          : "Glossary term saved and waiting for approval."
        : kind === "grammar"
          ? form.approved
            ? "Grammar rule saved and approved for translation use."
            : "Grammar rule saved and waiting for approval."
          : "Saved.",
    );

    setEditing(null);
    setForm(blank(kind));

    void load();
  }

  async function action(
    ids: string[],
    values: Record<
      string,
      unknown
    >,
  ) {
    if (!ids.length) {
      return;
    }

    const { error } =
      await getSupabaseBrowserClient()
        .from(config.table)
        .update(values)
        .in("id", ids);

    setMessage(
      error?.message ||
        (values.approved === true
          ? `${ids.length} item(s) approved.`
          : `${ids.length} item(s) marked as unapproved.`),
    );

    setSelected(
      new Set(),
    );

    void load();
  }

  async function remove(
    ids: string[],
  ) {
    if (
      !ids.length ||
      !confirm(
        `Delete ${ids.length} selected item(s)?`,
      )
    ) {
      return;
    }

    const { error } =
      await getSupabaseBrowserClient()
        .from(config.table)
        .delete()
        .in("id", ids);

    setMessage(
      error?.message ||
        "Deleted.",
    );

    setSelected(
      new Set(),
    );

    void load();
  }

  async function importFile(
    file: File,
  ) {
    try {
      const text =
        await file.text();

      const data =
        file.name.endsWith(".json")
          ? JSON.parse(text)
          : csvParse(text);

      if (!Array.isArray(data)) {
        throw new Error(
          "Import must contain an array of rows.",
        );
      }

      const cleaned =
        data.map(
          (row: any) => ({
            ...row,

            approved:
              false,

            commercial_use_allowed:
              row.commercial_use_allowed === true ||
              row.commercial_use_allowed === "true",
          }),
        );

      const { error } =
        await getSupabaseBrowserClient()
          .from(config.table)
          .insert(cleaned);

      if (error) {
        throw error;
      }

      setMessage(
        kind === "glossary"
          ? `${cleaned.length} glossary item(s) imported. They are waiting for approval before translation use.`
          : kind === "grammar"
            ? `${cleaned.length} grammar rule(s) imported. They are waiting for approval before translation use.`
            : `${cleaned.length} unapproved rows imported.`,
      );

      void load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Import failed.",
      );
    }
  }

  function exportCsv() {
    if (!rows.length) {
      return;
    }

    const headers =
      Object.keys(
        rows[0],
      );

    const csv = [
      headers.join(","),

      ...rows.map(
        (row) =>
          headers
            .map(
              (header) =>
                csvEscape(
                  row[header],
                ),
            )
            .join(","),
      ),
    ].join("\n");

    const link =
      document.createElement(
        "a",
      );

    link.href =
      URL.createObjectURL(
        new Blob(
          [csv],
          {
            type: "text/csv",
          },
        ),
      );

    link.download =
      `${config.table}.csv`;

    link.click();

    URL.revokeObjectURL(
      link.href,
    );
  }

  const isGlossary =
    kind === "glossary";

  const isGrammar =
    kind === "grammar";

  return (
    <>
      {isGlossary && (
        <div className="info-banner">
          <strong>
            How to use the Glossary:
          </strong>{" "}
          Add or import a preferred word or phrase, review the Western Armenian wording and its source/licence, then approve it. Items marked <strong>Waiting for approval</strong> are not yet ready for translation use.
          <br />
          <strong>Example:</strong>{" "}
          English <strong>hello</strong>{" "}
          → preferred Western Armenian{" "}
          <strong className="armenian-text">
            Բարեւ
          </strong>.
        </div>
      )}

      {isGrammar && (
        <div className="info-banner">
          <strong>
            How to use Grammar:
          </strong>{" "}
          Add a rule when the translator needs clear guidance about correct Western Armenian grammar, sentence structure or word forms. Write the instruction clearly, include useful keywords and add correct or incorrect examples when possible. Approve the rule only after checking it.
          <br />
          <strong>Example:</strong>{" "}
          If the translator repeatedly uses an Eastern Armenian grammatical form, add a rule explaining the correct Western Armenian form and provide a correct example.
        </div>
      )}

      <div className="license-warning">
        Only import language resources that TunApp owns or has permission to use commercially.
      </div>

      <section className="dashboard-card">
        <div className="manager-toolbar">
          <input
            placeholder={
              isGlossary
                ? "Search source or preferred translation..."
                : "Search..."
            }
            value={query}
            onChange={(event) =>
              setQuery(
                event.target.value,
              )
            }
          />

          <select
            value={approval}
            onChange={(event) =>
              setApproval(
                event.target.value,
              )
            }
          >
            <option value="all">
              {isGlossary
                ? "All glossary items"
                : isGrammar
                  ? "All grammar rules"
                  : "All statuses"}
            </option>

            <option value="approved">
              {isGlossary || isGrammar
                ? "Approved for translation use"
                : "Approved"}
            </option>

            <option value="pending">
              {isGlossary || isGrammar
                ? "Waiting for approval"
                : "Unapproved"}
            </option>
          </select>

          <button
            type="button"
            onClick={() =>
              void load()
            }
          >
            Search
          </button>

          <label className="file-button">
            Import CSV/JSON

            <input
              type="file"
              accept=".csv,.json"
              onChange={(event) => {
                const file =
                  event.target
                    .files?.[0];

                if (file) {
                  void importFile(
                    file,
                  );
                }
              }}
            />
          </label>

          <button
            type="button"
            onClick={exportCsv}
          >
            Export CSV
          </button>
        </div>

        <div className="bulk-toolbar">
          <span>
            {selected.size} selected
          </span>

          <button
            type="button"
            onClick={() =>
              void action(
                [...selected],
                {
                  approved: true,
                  approved_at:
                    new Date()
                      .toISOString(),
                },
              )
            }
          >
            {isGlossary
              ? "Approve selected"
              : "Approve"}
          </button>

          <button
            type="button"
            onClick={() =>
              void action(
                [...selected],
                {
                  approved: false,
                },
              )
            }
          >
            {isGlossary
              ? "Mark unapproved"
              : "Reject"}
          </button>

          <button
            type="button"
            className="danger-button"
            onClick={() =>
              void remove(
                [...selected],
              )
            }
          >
            Delete
          </button>
        </div>

        {message && (
          <p className="form-message">
            {message}
          </p>
        )}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th></th>

                <th>
                  {isGlossary
                    ? "Term / preferred translation"
                    : "Primary content"}
                </th>

                <th>
                  Language direction
                </th>

                <th>
                  Status
                </th>

                <th>
                  Source / licence
                </th>

                <th>
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map(
                (row) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={
                          selected.has(
                            row.id,
                          )
                        }
                        onChange={(event) =>
                          setSelected(
                            (current) => {
                              const next =
                                new Set(
                                  current,
                                );

                              if (
                                event.target
                                  .checked
                              ) {
                                next.add(
                                  row.id,
                                );
                              } else {
                                next.delete(
                                  row.id,
                                );
                              }

                              return next;
                            },
                          )
                        }
                      />
                    </td>

                    <td>
                      <strong>
                        {row.source_term ||
                          row.title ||
                          row.source_text}
                      </strong>

                      <small>
                        {row.target_term ||
                          row.description ||
                          row.translated_text}
                      </small>
                    </td>

                    <td>
                      {languageName(
                        row.source_language,
                      )}{" "}
                      →{" "}
                      {languageName(
                        row.target_language,
                      )}
                    </td>

                    <td>
                      <span
                        className={`status-chip ${
                          row.approved
                            ? "approved"
                            : "pending"
                        }`}
                      >
                        {row.approved
                          ? isGlossary || isGrammar
                            ? "Approved for use"
                            : "Approved"
                          : isGlossary || isGrammar
                            ? "Waiting for approval"
                            : "Pending"}
                      </span>
                    </td>

                    <td>
                      {row.source_name ||
                        "Not provided"}

                      <small>
                        {row.copyright_status ||
                          ""}
                      </small>
                    </td>

                    <td>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(
                            row.id,
                          );

                          setForm({
                            ...row,

                            keywords:
                              Array.isArray(
                                row.keywords,
                              )
                                ? row.keywords.join(
                                    ", ",
                                  )
                                : row.keywords,

                            correct_examples:
                              Array.isArray(
                                row.correct_examples,
                              )
                                ? row.correct_examples.join(
                                    "\n",
                                  )
                                : row.correct_examples,

                            incorrect_examples:
                              Array.isArray(
                                row.incorrect_examples,
                              )
                                ? row.incorrect_examples.join(
                                    "\n",
                                  )
                                : row.incorrect_examples,

                            exceptions:
                              Array.isArray(
                                row.exceptions,
                              )
                                ? row.exceptions.join(
                                    "\n",
                                  )
                                : row.exceptions,
                          });
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>

        {!rows.length && (
          <div className="empty-state">
            {isGlossary
              ? "No glossary items match these filters."
              : "No records match these filters."}
          </div>
        )}
      </section>

      <section className="dashboard-card">
        <h2>
          {editing
            ? "Edit"
            : "Add"}{" "}
          {isGlossary
            ? "glossary term"
            : config.title.toLowerCase()}
        </h2>

        {isGlossary && (
          <p className="form-help">
            Enter the source word or phrase and the preferred translation you want the translator to use when relevant.
          </p>
        )}

        {isGrammar && (
          <p className="form-help">
            Write one clear grammar instruction at a time. Explain what the correct Western Armenian form should be and add examples that make the rule easy to understand.
          </p>
        )}

        <form
          className="knowledge-form"
          onSubmit={save}
        >
          {fields.map(
            (field) => (
              <label key={field}>
                {FIELD_LABELS[field] ||
                  field.replaceAll(
                    "_",
                    " ",
                  )}

                {[
                  "description",
                  "notes",
                  "definition",
                  "correct_examples",
                  "incorrect_examples",
                  "exceptions",
                ].includes(field) ? (
                  <textarea
                    value={
                      form[field] ??
                      ""
                    }
                    onChange={(
                      event,
                    ) =>
                      setForm({
                        ...form,
                        [field]:
                          event.target
                            .value,
                      })
                    }
                  />
                ) : field ===
                    "source_language" ||
                  field ===
                    "target_language" ? (
                  <select
                    value={
                      form[field] ??
                      ""
                    }
                    onChange={(
                      event,
                    ) =>
                      setForm({
                        ...form,
                        [field]:
                          event.target
                            .value,
                      })
                    }
                  >
                    <option value="en">
                      English
                    </option>

                    <option value="hyw">
                      Western Armenian
                    </option>

                    <option value="hye">
                      Eastern Armenian
                    </option>
                  </select>
                ) : (
                  <input
                    value={
                      form[field] ??
                      ""
                    }
                    onChange={(
                      event,
                    ) =>
                      setForm({
                        ...form,
                        [field]:
                          event.target
                            .value,
                      })
                    }
                  />
                )}
              </label>
            ),
          )}

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={Boolean(
                form.commercial_use_allowed,
              )}
              onChange={(event) =>
                setForm({
                  ...form,

                  commercial_use_allowed:
                    event.target
                      .checked,
                })
              }
            />

            <span>
              Commercial use is allowed
            </span>
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={Boolean(
                form.approved,
              )}
              onChange={(event) =>
                setForm({
                  ...form,

                  approved:
                    event.target
                      .checked,
                })
              }
            />

            <span>
              {isGlossary || isGrammar
                ? "Approved for translation use"
                : "Approved for translation context"}
            </span>
          </label>

          {isGlossary && (
            <p className="form-help">
              Approve this only after checking the preferred wording and confirming that the source can be used commercially.
            </p>
          )}

          {isGrammar && (
            <p className="form-help">
              Approve this only after confirming that the rule accurately describes Western Armenian grammar and is safe to use as translation guidance.
            </p>
          )}

          <div className="row-actions">
            <button
              className="primary-button"
              type="submit"
            >
              Save
            </button>

            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(
                    null,
                  );

                  setForm(
                    blank(kind),
                  );
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>
    </>
  );
}