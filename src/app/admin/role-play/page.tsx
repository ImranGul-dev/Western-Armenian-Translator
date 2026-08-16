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
  changeAdminRolePlayScenarioState,
  createAdminRolePlayScenario,
  listAdminRolePlayScenarios,
  updateAdminRolePlayScenario,
  type RolePlayAdminScenario,
  type RolePlayAdminScenarioInput,
  type RolePlayAdminStateAction,
  type RolePlayDifficulty,
} from "@/lib/role-play-api";
import {
  transliterateWesternArmenian,
} from "@/lib/western-armenian-transliteration";

type StatusFilter =
  | "all"
  | "published"
  | "unpublished"
  | "archived";

interface ScenarioForm {
  slug: string;
  title: string;
  description: string;
  category: string;
  difficulty: RolePlayDifficulty;
  setting: string;
  userRole: string;
  aiRole: string;
  goal: string;
  instructions: string;
  openingMessage: string;
  published: boolean;
  sortOrder: string;
}

function blankScenario(): ScenarioForm {
  return {
    slug: "",
    title: "",
    description: "",
    category: "everyday",
    difficulty: "beginner",
    setting: "",
    userRole: "",
    aiRole: "",
    goal: "",
    instructions: "",
    openingMessage: "",
    published: false,
    sortOrder: "10",
  };
}

function scenarioToForm(
  scenario: RolePlayAdminScenario,
): ScenarioForm {
  return {
    slug:
      scenario.slug,

    title:
      scenario.title,

    description:
      scenario.description,

    category:
      scenario.category,

    difficulty:
      scenario.difficulty,

    setting:
      scenario.setting,

    userRole:
      scenario.userRole,

    aiRole:
      scenario.aiRole,

    goal:
      scenario.goal,

    instructions:
      scenario.instructions,

    openingMessage:
      scenario.openingMessage,

    published:
      scenario.published,

    sortOrder:
      String(
        scenario.sortOrder,
      ),
  };
}

function formatDate(
  value: string | null,
): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-AU",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(
    new Date(value),
  );
}

function scenarioStatus(
  scenario: RolePlayAdminScenario,
) {
  if (scenario.archivedAt) {
    return {
      label:
        "Archived",

      className:
        "rejected",
    };
  }

  if (scenario.published) {
    return {
      label:
        "Published",

      className:
        "approved",
    };
  }

  return {
    label:
      "Draft",

    className:
      "pending",
  };
}

function errorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

export default function AdminRolePlayPage() {
  const {
    session,
  } = useAuth();

  const [
    scenarios,
    setScenarios,
  ] =
    useState<
      RolePlayAdminScenario[]
    >([]);

  const [
    query,
    setQuery,
  ] =
    useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState<StatusFilter>(
      "all",
    );

  const [
    form,
    setForm,
  ] =
    useState<ScenarioForm>(
      blankScenario,
    );

  const [
    editingId,
    setEditingId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    workingId,
    setWorkingId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    message,
    setMessage,
  ] =
    useState("");

  const accessToken =
    session?.access_token ??
    "";

  const load =
    useCallback(
      async () => {
        if (!accessToken) {
          return;
        }

        setLoading(true);

        try {
          const rows =
            await listAdminRolePlayScenarios(
              accessToken,
            );

          setScenarios(
            rows,
          );
        } catch (error) {
          setMessage(
            errorMessage(
              error,
            ),
          );
        } finally {
          setLoading(false);
        }
      },
      [
        accessToken,
      ],
    );

  useEffect(
    () => {
      if (accessToken) {
        void load();
      }
    },
    [
      accessToken,
      load,
    ],
  );

  const visible =
    useMemo(
      () => {
        const needle =
          query
            .trim()
            .toLocaleLowerCase();

        return scenarios.filter(
          (scenario) => {
            const matchesStatus =
              statusFilter ===
                "all" ||
              (
                statusFilter ===
                  "published" &&
                scenario.published &&
                !scenario.archivedAt
              ) ||
              (
                statusFilter ===
                  "unpublished" &&
                !scenario.published &&
                !scenario.archivedAt
              ) ||
              (
                statusFilter ===
                  "archived" &&
                Boolean(
                  scenario.archivedAt,
                )
              );

            if (!matchesStatus) {
              return false;
            }

            if (!needle) {
              return true;
            }

            return [
              scenario.title,
              scenario.slug,
              scenario.description,
              scenario.category,
              scenario.setting,
              scenario.userRole,
              scenario.aiRole,
              scenario.goal,
            ].some(
              (value) =>
                value
                  .toLocaleLowerCase()
                  .includes(
                    needle,
                  ),
            );
          },
        );
      },
      [
        query,
        scenarios,
        statusFilter,
      ],
    );

  const openingTransliteration =
    useMemo(
      () =>
        form.openingMessage
          ? transliterateWesternArmenian(
              form.openingMessage,
            )
          : "",
      [
        form.openingMessage,
      ],
    );

  function resetForm() {
    setEditingId(
      null,
    );

    setForm(
      blankScenario(),
    );
  }

  function beginEdit(
    scenario: RolePlayAdminScenario,
  ) {
    setEditingId(
      scenario.id,
    );

    setForm(
      scenarioToForm(
        scenario,
      ),
    );

    setMessage("");

    window.setTimeout(
      () => {
        document
          .getElementById(
            "role-play-scenario-form",
          )
          ?.scrollIntoView({
            behavior:
              "smooth",

            block:
              "start",
          });
      },
      0,
    );
  }

  function normalizedInput():
    RolePlayAdminScenarioInput | null {
    const sortOrder =
      Number(
        form.sortOrder,
      );

    if (
      !form.slug.trim()
    ) {
      setMessage(
        "Slug is required.",
      );

      return null;
    }

    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u
        .test(
          form.slug.trim(),
        )
    ) {
      setMessage(
        "Slug must use lowercase letters, numbers and single hyphens only.",
      );

      return null;
    }

    if (
      !form.title.trim()
    ) {
      setMessage(
        "Scenario title is required.",
      );

      return null;
    }

    if (
      !form.openingMessage
        .trim()
    ) {
      setMessage(
        "Opening Western Armenian message is required.",
      );

      return null;
    }

    if (
      !Number.isInteger(
        sortOrder,
      ) ||
      sortOrder < 0
    ) {
      setMessage(
        "Sort order must be a whole number of zero or greater.",
      );

      return null;
    }

    return {
      slug:
        form.slug.trim(),

      title:
        form.title.trim(),

      description:
        form.description.trim(),

      category:
        form.category.trim() ||
        "everyday",

      difficulty:
        form.difficulty,

      setting:
        form.setting.trim(),

      userRole:
        form.userRole.trim(),

      aiRole:
        form.aiRole.trim(),

      goal:
        form.goal.trim(),

      instructions:
        form.instructions.trim(),

      openingMessage:
        form.openingMessage.trim(),

      published:
        form.published,

      sortOrder,
    };
  }

  async function saveScenario(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (
      !accessToken ||
      saving
    ) {
      return;
    }

    const input =
      normalizedInput();

    if (!input) {
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      if (editingId) {
        await updateAdminRolePlayScenario(
          editingId,
          input,
          accessToken,
        );

        setMessage(
          input.published
            ? "Role-Play scenario saved and published."
            : "Role-Play scenario saved.",
        );
      } else {
        await createAdminRolePlayScenario(
          input,
          accessToken,
        );

        setMessage(
          input.published
            ? "Role-Play scenario created and published."
            : "Role-Play scenario created as a draft.",
        );
      }

      resetForm();

      await load();
    } catch (error) {
      setMessage(
        errorMessage(
          error,
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeState(
    scenario: RolePlayAdminScenario,
    action: RolePlayAdminStateAction,
  ) {
    if (
      !accessToken ||
      workingId
    ) {
      return;
    }

    if (
      action ===
        "admin_archive" &&
      !window.confirm(
        `Archive "${scenario.title}"? It will no longer be available to learners.`,
      )
    ) {
      return;
    }

    setWorkingId(
      scenario.id,
    );

    setMessage("");

    try {
      await changeAdminRolePlayScenarioState(
        scenario.id,
        action,
        accessToken,
      );

      const messages:
        Record<
          RolePlayAdminStateAction,
          string
        > = {
          admin_publish:
            "Scenario published. It is now available in Role-Play.",

          admin_unpublish:
            "Scenario unpublished. It is now hidden from learners.",

          admin_archive:
            "Scenario archived.",

          admin_restore:
            "Scenario restored as an unpublished draft.",
        };

      setMessage(
        messages[action],
      );

      if (
        editingId ===
        scenario.id
      ) {
        resetForm();
      }

      await load();
    } catch (error) {
      setMessage(
        errorMessage(
          error,
        ),
      );
    } finally {
      setWorkingId(
        null,
      );
    }
  }

  return (
    <ProtectedRoute
      roles={[
        "admin",
      ]}
    >
      <DashboardShell
        admin
        title="Role-Play scenarios"
        description="Create, edit, publish and archive the preset AI practice scenarios available to paid Role-Play users."
      >
        <div className="info-banner">
          <strong>
            How Role-Play scenarios work:
          </strong>{" "}
          Published scenarios appear immediately in the learner Role-Play feature. Drafts and archived scenarios stay hidden. The AI instructions, learner role, AI role, setting and goal guide the conversation but are not shown through the learner scenario list.
          <br />
          <br />
          <strong>
            Publishing:
          </strong>{" "}
          Review the Western Armenian opening message and AI instructions before publishing. Archive scenarios you no longer want to offer rather than reusing an old scenario for unrelated content.
        </div>

        {message && (
          <p className="form-message">
            {message}
          </p>
        )}

        <section className="dashboard-card">
          <div className="card-heading">
            <div>
              <h2>
                Scenario library
              </h2>

              <p>
                {visible.length} of{" "}
                {scenarios.length} scenarios shown.
              </p>
            </div>

            <div className="manager-toolbar">
              <input
                aria-label="Search Role-Play scenarios"
                placeholder="Search scenarios..."
                value={query}
                onChange={(event) =>
                  setQuery(
                    event.target.value,
                  )
                }
              />

              <select
                aria-label="Filter Role-Play scenarios"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target
                      .value as
                      StatusFilter,
                  )
                }
              >
                <option value="all">
                  All scenarios
                </option>

                <option value="published">
                  Published
                </option>

                <option value="unpublished">
                  Drafts
                </option>

                <option value="archived">
                  Archived
                </option>
              </select>

              <button
                type="button"
                disabled={
                  loading
                }
                onClick={() =>
                  void load()
                }
              >
                {loading
                  ? "Loading..."
                  : "Refresh"}
              </button>
            </div>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>
                    Scenario
                  </th>

                  <th>
                    Practice
                  </th>

                  <th>
                    Opening message
                  </th>

                  <th>
                    Status
                  </th>

                  <th>
                    Order
                  </th>

                  <th>
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {visible.map(
                  (scenario) => {
                    const status =
                      scenarioStatus(
                        scenario,
                      );

                    const transliteration =
                      transliterateWesternArmenian(
                        scenario.openingMessage,
                      );

                    const working =
                      workingId ===
                      scenario.id;

                    return (
                      <tr
                        key={
                          scenario.id
                        }
                      >
                        <td>
                          <strong>
                            {scenario.title}
                          </strong>

                          <small>
                            {scenario.slug}
                          </small>

                          <small>
                            {scenario.description ||
                              "No description provided."}
                          </small>
                        </td>

                        <td>
                          <strong>
                            {scenario.difficulty}
                          </strong>

                          <small>
                            {scenario.category}
                          </small>

                          <small>
                            Learner:{" "}
                            {scenario.userRole ||
                              "Not set"}
                          </small>

                          <small>
                            AI:{" "}
                            {scenario.aiRole ||
                              "Not set"}
                          </small>
                        </td>

                        <td>
                          <span className="armenian-text">
                            {scenario.openingMessage}
                          </span>

                          {transliteration &&
                            transliteration !==
                              scenario.openingMessage && (
                              <small>
                                <strong>
                                  Latin transliteration:
                                </strong>{" "}
                                <span className="transliteration-text">
                                  {transliteration}
                                </span>
                              </small>
                            )}
                        </td>

                        <td>
                          <span
                            className={`status-chip ${status.className}`}
                          >
                            {status.label}
                          </span>

                          {scenario.publishedAt && (
                            <small>
                              Published{" "}
                              {formatDate(
                                scenario.publishedAt,
                              )}
                            </small>
                          )}

                          {scenario.archivedAt && (
                            <small>
                              Archived{" "}
                              {formatDate(
                                scenario.archivedAt,
                              )}
                            </small>
                          )}
                        </td>

                        <td>
                          {scenario.sortOrder}
                        </td>

                        <td>
                          <div className="table-actions vertical-actions">
                            <button
                              type="button"
                              disabled={
                                working
                              }
                              onClick={() =>
                                beginEdit(
                                  scenario,
                                )
                              }
                            >
                              Edit
                            </button>

                            {!scenario.archivedAt &&
                              !scenario.published && (
                                <button
                                  type="button"
                                  className="primary-button"
                                  disabled={
                                    working
                                  }
                                  onClick={() =>
                                    void changeState(
                                      scenario,
                                      "admin_publish",
                                    )
                                  }
                                >
                                  Publish
                                </button>
                              )}

                            {!scenario.archivedAt &&
                              scenario.published && (
                                <button
                                  type="button"
                                  disabled={
                                    working
                                  }
                                  onClick={() =>
                                    void changeState(
                                      scenario,
                                      "admin_unpublish",
                                    )
                                  }
                                >
                                  Unpublish
                                </button>
                              )}

                            {!scenario.archivedAt ? (
                              <button
                                type="button"
                                className="danger-button"
                                disabled={
                                  working
                                }
                                onClick={() =>
                                  void changeState(
                                    scenario,
                                    "admin_archive",
                                  )
                                }
                              >
                                Archive
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={
                                  working
                                }
                                onClick={() =>
                                  void changeState(
                                    scenario,
                                    "admin_restore",
                                  )
                                }
                              >
                                Restore
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </div>

          {!loading &&
            !visible.length && (
              <div className="empty-state">
                No Role-Play scenarios match these filters.
              </div>
            )}
        </section>

        <section
          className="dashboard-card"
          id="role-play-scenario-form"
        >
          <div className="card-heading">
            <div>
              <h2>
                {editingId
                  ? "Edit scenario"
                  : "Add scenario"}
              </h2>

              <p>
                Configure the real-world setting, learner role, AI role and Western Armenian opening message.
              </p>
            </div>

            {editingId && (
              <button
                type="button"
                onClick={
                  resetForm
                }
              >
                Cancel editing
              </button>
            )}
          </div>

          <form
            className="knowledge-form"
            onSubmit={
              saveScenario
            }
          >
            <label>
              Scenario title

              <input
                required
                maxLength={120}
                value={form.title}
                onChange={(event) =>
                  setForm({
                    ...form,
                    title:
                      event.target.value,
                  })
                }
              />
            </label>

            <label>
              Slug

              <input
                required
                maxLength={80}
                placeholder="ordering-food"
                value={form.slug}
                onChange={(event) =>
                  setForm({
                    ...form,
                    slug:
                      event.target.value
                        .toLocaleLowerCase()
                        .replaceAll(
                          " ",
                          "-",
                        ),
                  })
                }
              />

              <small className="form-help">
                Lowercase letters, numbers and hyphens only. Keep the slug stable after publishing because it identifies the scenario.
              </small>
            </label>

            <label>
              Description

              <textarea
                maxLength={500}
                value={
                  form.description
                }
                onChange={(event) =>
                  setForm({
                    ...form,
                    description:
                      event.target.value,
                  })
                }
              />
            </label>

            <label>
              Category

              <input
                maxLength={60}
                placeholder="everyday"
                value={form.category}
                onChange={(event) =>
                  setForm({
                    ...form,
                    category:
                      event.target.value,
                  })
                }
              />
            </label>

            <label>
              Difficulty

              <select
                value={
                  form.difficulty
                }
                onChange={(event) =>
                  setForm({
                    ...form,
                    difficulty:
                      event.target
                        .value as
                        RolePlayDifficulty,
                  })
                }
              >
                <option value="beginner">
                  Beginner
                </option>

                <option value="intermediate">
                  Intermediate
                </option>

                <option value="advanced">
                  Advanced
                </option>
              </select>
            </label>

            <label>
              Sort order

              <input
                type="number"
                min={0}
                step={1}
                required
                value={
                  form.sortOrder
                }
                onChange={(event) =>
                  setForm({
                    ...form,
                    sortOrder:
                      event.target.value,
                  })
                }
              />

              <small className="form-help">
                Lower numbers appear first in the learner scenario selector.
              </small>
            </label>

            <label>
              Setting

              <textarea
                maxLength={500}
                placeholder="Describe where the conversation takes place."
                value={form.setting}
                onChange={(event) =>
                  setForm({
                    ...form,
                    setting:
                      event.target.value,
                  })
                }
              />
            </label>

            <label>
              Learner role

              <textarea
                maxLength={300}
                placeholder="Describe who the learner is in this scenario."
                value={form.userRole}
                onChange={(event) =>
                  setForm({
                    ...form,
                    userRole:
                      event.target.value,
                  })
                }
              />
            </label>

            <label>
              AI role

              <textarea
                maxLength={300}
                placeholder="Describe who the AI should act as."
                value={form.aiRole}
                onChange={(event) =>
                  setForm({
                    ...form,
                    aiRole:
                      event.target.value,
                  })
                }
              />
            </label>

            <label>
              Practice goal

              <textarea
                maxLength={1000}
                placeholder="What should the learner practise or accomplish?"
                value={form.goal}
                onChange={(event) =>
                  setForm({
                    ...form,
                    goal:
                      event.target.value,
                  })
                }
              />
            </label>

            <label>
              AI instructions

              <textarea
                maxLength={5000}
                placeholder="Give the AI scenario-specific behaviour, language and conversation guidance."
                value={
                  form.instructions
                }
                onChange={(event) =>
                  setForm({
                    ...form,
                    instructions:
                      event.target.value,
                  })
                }
              />

              <small className="form-help">
                These instructions guide the Role-Play AI and are not exposed through the learner scenario list.
              </small>
            </label>

            <label>
              Western Armenian opening message

              <textarea
                required
                maxLength={1000}
                className="armenian-text"
                value={
                  form.openingMessage
                }
                onChange={(event) =>
                  setForm({
                    ...form,
                    openingMessage:
                      event.target.value,
                  })
                }
              />

              {openingTransliteration &&
                openingTransliteration !==
                  form.openingMessage && (
                  <small className="form-help">
                    <strong>
                      Latin transliteration:
                    </strong>{" "}
                    <span className="transliteration-text">
                      {openingTransliteration}
                    </span>
                  </small>
                )}
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={
                  form.published
                }
                disabled={
                  Boolean(
                    editingId &&
                      scenarios.find(
                        (scenario) =>
                          scenario.id ===
                          editingId,
                      )
                        ?.archivedAt,
                  )
                }
                onChange={(event) =>
                  setForm({
                    ...form,
                    published:
                      event.target.checked,
                  })
                }
              />

              <span>
                Publish this scenario for learners
              </span>
            </label>

            <p className="form-help">
              Saving an unpublished scenario keeps it as a draft. Restored archived scenarios always return as drafts and must be published again deliberately.
            </p>

            <div className="row-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={
                  saving ||
                  !accessToken
                }
              >
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Save scenario"
                    : "Create scenario"}
              </button>

              {editingId && (
                <button
                  type="button"
                  disabled={
                    saving
                  }
                  onClick={
                    resetForm
                  }
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>
      </DashboardShell>
    </ProtectedRoute>
  );
}