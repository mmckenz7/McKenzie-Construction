"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useParams,
  useSearchParams,
} from "next/navigation";

type ActivityEntry = {
  id: string;
  activityType: string;
  title: string;
  description: string | null;
  actorType: string;
  actorAppUserId: string | null;
  subcontractorId: string | null;
  sourceTable: string | null;
  sourceId: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
  subcontractor: {
    id: string;
    name: string;
  } | null;
  appUser: {
    id: string;
    name: string;
    email: string | null;
  } | null;
};

type Project = {
  id: string;
  name: string;
  address: string;
};

type ApiResponse = {
  success: boolean;
  project?: Project;
  activity?: ActivityEntry[];
  error?: string;
};

type Filter =
  | "all"
  | "schedules"
  | "materials"
  | "messages"
  | "change_orders"
  | "project";

const activityLabels: Record<
  string,
  string
> = {
  schedule_request_created:
    "Schedule request",
  schedule_response_submitted:
    "Schedule response",
  schedule_response_reviewed:
    "Schedule reviewed",
  material_review_created:
    "Material review",
  material_review_opened:
    "Material review opened",
  material_review_submitted:
    "Material review submitted",
  material_review_reviewed:
    "Material review completed",
  material_issue_reported:
    "Material issue",
  material_issue_updated:
    "Material issue updated",
  message_created: "Message",
  communication_received:
    "Customer message received",
  communication_sent:
    "Customer message sent",
  project_updated: "Project update",
  project_note: "Project note",
  change_order_created:
    "Change order created",
  change_order_updated:
    "Change order updated",
  change_order_approved:
    "Change order approved",
  change_order_declined:
    "Change order declined",
  change_order_completed:
    "Change order completed",
  change_order_response_reviewed:
    "Change order response reviewed",
  change_order_approval_reminder:
    "Change order approval reminder",
  change_order_approval_expired:
    "Change order approval expired",
  system: "System",
};

function formatDate(value: string) {
  if (!value) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(new Date(value));
}

function getCategory(
  activityType: string,
): Filter {
  if (
    activityType.startsWith(
      "schedule_",
    )
  ) {
    return "schedules";
  }

  if (
    activityType.startsWith(
      "material_",
    )
  ) {
    return "materials";
  }

  if (
    activityType ===
      "message_created" ||
    activityType.startsWith(
      "communication_",
    )
  ) {
    return "messages";
  }

  if (
    activityType.startsWith(
      "change_order_",
    )
  ) {
    return "change_orders";
  }

  return "project";
}

function getActivityHref(
  entry: ActivityEntry,
  projectId: string,
) {
  if (
    entry.sourceTable ===
      "subcontractor_material_reviews" &&
    entry.sourceId
  ) {
    return `/operations/material-reviews/${entry.sourceId}`;
  }

  if (
    entry.sourceTable ===
    "subcontractor_material_issues"
  ) {
    const reviewId =
      typeof entry.metadata.review_id ===
      "string"
        ? entry.metadata.review_id
        : null;

    if (reviewId) {
      return `/operations/material-reviews/${reviewId}`;
    }

    return "/operations/material-reviews";
  }

  if (
    entry.sourceTable ===
    "subcontractor_schedule_requests"
  ) {
    return "/operations/schedule-requests";
  }

  if (
    entry.sourceTable ===
    "project_messages"
  ) {
    return `/operations/messages?projectId=${encodeURIComponent(
      projectId,
    )}`;
  }

  if (
    entry.sourceTable ===
      "communication_threads" &&
    entry.sourceId
  ) {
    return `/sales/communications/${entry.sourceId}`;
  }

  if (
    entry.sourceTable ===
    "project_change_orders"
  ) {
    return `/operations/projects/${projectId}/change-orders`;
  }

  if (
    entry.activityType ===
    "project_updated"
  ) {
    return `/operations/projects/${projectId}`;
  }

  return null;
}

function getActivityLinkLabel(
  entry: ActivityEntry,
) {
  if (
    entry.sourceTable ===
      "subcontractor_material_reviews" ||
    entry.sourceTable ===
      "subcontractor_material_issues"
  ) {
    return "Open Material Review";
  }

  if (
    entry.sourceTable ===
    "subcontractor_schedule_requests"
  ) {
    return "Open Schedule Requests";
  }

  if (
    entry.sourceTable ===
    "project_messages"
  ) {
    return "Open Messages";
  }

  if (
    entry.sourceTable ===
    "communication_threads"
  ) {
    return "Open Conversation";
  }

  if (
    entry.sourceTable ===
    "project_change_orders"
  ) {
    return "Open Change Orders";
  }

  if (
    entry.activityType ===
    "project_updated"
  ) {
    return "Open Project";
  }

  return "Open Activity";
}

function getActorName(
  entry: ActivityEntry,
) {
  if (entry.appUser?.name) {
    return entry.appUser.name;
  }

  if (
    entry.subcontractor?.name
  ) {
    return entry.subcontractor.name;
  }

  if (
    entry.actorType ===
    "subcontractor"
  ) {
    return "Installer";
  }

  if (entry.actorType === "office") {
    return "Office";
  }

  return "System";
}

function formatMetadataLabel(
  value: string,
) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function formatMetadataValue(
  value: unknown,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (
    typeof value === "string"
  ) {
    return value.replaceAll("_", " ");
  }

  if (
    typeof value === "number"
  ) {
    return String(value);
  }

  return JSON.stringify(value);
}

function metadataRows(
  metadata: Record<string, unknown>,
) {
  const hiddenKeys = new Set([
    "review_id",
    "review_item_id",
    "changed_fields",
  ]);

  return Object.entries(metadata)
    .filter(
      ([key, value]) =>
        !hiddenKeys.has(key) &&
        value !== null &&
        value !== "" &&
        value !== undefined,
    )
    .map(([key, value]) => ({
      key,
      label:
        formatMetadataLabel(key),
      value:
        formatMetadataValue(value),
    }));
}

function projectChangeRows(
  metadata: Record<string, unknown>,
) {
  const changedFields =
    metadata.changed_fields;

  if (
    !changedFields ||
    typeof changedFields !== "object" ||
    Array.isArray(changedFields)
  ) {
    return [];
  }

  return Object.entries(
    changedFields as Record<
      string,
      unknown
    >,
  ).map(([field, rawChange]) => {
    const change =
      rawChange &&
      typeof rawChange === "object" &&
      !Array.isArray(rawChange)
        ? rawChange as Record<
            string,
            unknown
          >
        : {};

    return {
      field,
      label:
        formatMetadataLabel(field),
      previous:
        formatMetadataValue(
          change.previous,
        ),
      current:
        formatMetadataValue(
          change.current,
        ),
    };
  });
}

export default function ProjectActivityPage() {
  const params = useParams<{
    projectId: string;
  }>();

  const searchParams =
    useSearchParams();

  const [project, setProject] =
    useState<Project | null>(null);

  const [activity, setActivity] =
    useState<ActivityEntry[]>([]);

  const [filter, setFilter] =
    useState<Filter>("all");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [showNoteForm, setShowNoteForm] =
    useState(false);

  const [noteTitle, setNoteTitle] =
    useState("");

  const [
    noteDescription,
    setNoteDescription,
  ] = useState("");

  const [savingNote, setSavingNote] =
    useState(false);

  const [noteNotice, setNoteNotice] =
    useState("");

  async function loadActivity() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/projects/${params.projectId}/activity`,
        {
          credentials: "include",
          cache: "no-store",
        },
      );

      const result =
        (await response.json()) as ApiResponse;

      if (
        !response.ok ||
        !result.success ||
        !result.project
      ) {
        setError(
          result.error ??
            "Could not load project activity.",
        );
        return;
      }

      setProject(result.project);
      setActivity(
        result.activity ?? [],
      );
    } catch {
      setError(
        "Could not load project activity.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadActivity();
  }, [params.projectId]);

  useEffect(() => {
    if (
      searchParams.get("addNote") ===
      "true"
    ) {
      setShowNoteForm(true);
    }
  }, [searchParams]);

  async function saveNote(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setNoteNotice("");

    if (
      !noteTitle.trim() ||
      !noteDescription.trim()
    ) {
      setNoteNotice(
        "Enter a note title and details.",
      );
      return;
    }

    setSavingNote(true);

    try {
      const response = await fetch(
        `/api/projects/${params.projectId}/activity/notes`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            title: noteTitle,
            description:
              noteDescription,
          }),
        },
      );

      const result =
        (await response.json()) as {
          success?: boolean;
          error?: string;
        };

      if (
        !response.ok ||
        !result.success
      ) {
        setNoteNotice(
          result.error ??
            "Could not save the project note.",
        );
        return;
      }

      setNoteTitle("");
      setNoteDescription("");
      setShowNoteForm(false);
      setNoteNotice(
        "Project note saved.",
      );

      await loadActivity();
    } catch {
      setNoteNotice(
        "Could not save the project note.",
      );
    } finally {
      setSavingNote(false);
    }
  }

  const filteredActivity =
    useMemo(() => {
      if (filter === "all") {
        return activity;
      }

      return activity.filter(
        (entry) =>
          getCategory(
            entry.activityType,
          ) === filter,
      );
    }, [activity, filter]);

  const counts = useMemo(
    () => ({
      all: activity.length,
      schedules: activity.filter(
        (entry) =>
          getCategory(
            entry.activityType,
          ) === "schedules",
      ).length,
      materials: activity.filter(
        (entry) =>
          getCategory(
            entry.activityType,
          ) === "materials",
      ).length,
      messages: activity.filter(
        (entry) =>
          getCategory(
            entry.activityType,
          ) === "messages",
      ).length,
      changeOrders: activity.filter(
        (entry) =>
          getCategory(
            entry.activityType,
          ) === "change_orders",
      ).length,
      project: activity.filter(
        (entry) =>
          getCategory(
            entry.activityType,
          ) === "project",
      ).length,
    }),
    [activity],
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link
        href={`/operations/projects/${params.projectId}`}
        className="text-sm font-bold text-blue-700"
      >
        ← Back to Project
      </Link>

      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
            Project Activity
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">
            {project?.name ??
              "Project Timeline"}
          </h1>

          {project?.address && (
            <p className="mt-3 text-base text-slate-600">
              {project.address}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() =>
              setShowNoteForm(
                (current) => !current,
              )
            }
            className="rounded-xl bg-blue-950 px-4 py-3 text-sm font-bold text-white"
          >
            {showNoteForm
              ? "Cancel Note"
              : "Add Project Note"}
          </button>

          <button
            type="button"
            onClick={() =>
              void loadActivity()
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800"
          >
            Refresh
          </button>
        </div>
      </div>

      {showNoteForm && (
        <form
          onSubmit={saveNote}
          className="mt-7 rounded-2xl border border-blue-200 bg-blue-50 p-6"
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-blue-700">
              Internal Project Note
            </p>

            <h2 className="mt-2 text-xl font-bold text-slate-950">
              Add to Project Timeline
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              This note is stored permanently in the project activity history.
            </p>
          </div>

          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-bold text-slate-800">
              Note Title
            </span>

            <input
              type="text"
              maxLength={150}
              value={noteTitle}
              onChange={(event) =>
                setNoteTitle(
                  event.target.value,
                )
              }
              placeholder="Customer requested railing change"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-bold text-slate-800">
              Details
            </span>

            <textarea
              rows={5}
              value={noteDescription}
              onChange={(event) =>
                setNoteDescription(
                  event.target.value,
                )
              }
              placeholder="Add the full details, decision, or conversation summary."
              className="w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
            />
          </label>

          {noteNotice && (
            <p className="mt-4 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-700">
              {noteNotice}
            </p>
          )}

          <button
            type="submit"
            disabled={savingNote}
            className="mt-4 w-full rounded-xl bg-blue-950 px-5 py-4 text-base font-bold text-white disabled:opacity-60"
          >
            {savingNote
              ? "Saving Note..."
              : "Save Project Note"}
          </button>
        </form>
      )}

      {!showNoteForm && noteNotice && (
        <p className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {noteNotice}
        </p>
      )}

      <div className="mt-7 flex flex-wrap gap-2">
        <FilterButton
          active={filter === "all"}
          onClick={() =>
            setFilter("all")
          }
        >
          All ({counts.all})
        </FilterButton>

        <FilterButton
          active={
            filter === "schedules"
          }
          onClick={() =>
            setFilter("schedules")
          }
        >
          Schedules ({counts.schedules})
        </FilterButton>

        <FilterButton
          active={
            filter === "materials"
          }
          onClick={() =>
            setFilter("materials")
          }
        >
          Materials ({counts.materials})
        </FilterButton>

        <FilterButton
          active={
            filter === "messages"
          }
          onClick={() =>
            setFilter("messages")
          }
        >
          Messages ({counts.messages})
        </FilterButton>

        <FilterButton
          active={
            filter ===
            "change_orders"
          }
          onClick={() =>
            setFilter(
              "change_orders",
            )
          }
        >
          Change Orders ({counts.changeOrders})
        </FilterButton>

        <FilterButton
          active={
            filter === "project"
          }
          onClick={() =>
            setFilter("project")
          }
        >
          Project ({counts.project})
        </FilterButton>
      </div>

      {error && (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-8 text-sm text-slate-600">
          Loading project activity...
        </p>
      ) : filteredActivity.length ===
        0 ? (
        <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-xl font-bold text-slate-950">
            No activity yet
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            New schedule responses,
            material reviews, issue updates,
            and messages will appear here.
          </p>
        </section>
      ) : (
        <section className="relative mt-8 space-y-5 before:absolute before:bottom-5 before:left-[19px] before:top-5 before:w-px before:bg-slate-200">
          {filteredActivity.map(
            (entry) => {
              const metadata =
                metadataRows(
                  entry.metadata,
                );

              const projectChanges =
                projectChangeRows(
                  entry.metadata,
                );

              const activityHref =
                getActivityHref(
                  entry,
                  params.projectId,
                );

              return (
                <article
                  key={entry.id}
                  className="relative pl-12"
                >
                  <span className="absolute left-2.5 top-6 z-10 h-5 w-5 rounded-full border-4 border-white bg-blue-700 shadow-sm" />

                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-700">
                          {activityLabels[
                            entry.activityType
                          ] ??
                            entry.activityType.replaceAll(
                              "_",
                              " ",
                            )}
                        </span>

                        <h2 className="mt-3 text-lg font-bold text-slate-950">
                          {entry.title}
                        </h2>

                        <p className="mt-1 text-sm text-slate-500">
                          {getActorName(entry)}
                          {" · "}
                          {formatDate(
                            entry.occurredAt,
                          )}
                        </p>
                      </div>

                      <span className="self-start rounded-full bg-blue-50 px-3 py-1 text-xs font-bold capitalize text-blue-800">
                        {entry.actorType}
                      </span>
                    </div>

                    {entry.description && (
                      <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                        {entry.description}
                      </p>
                    )}

                    {projectChanges.length > 0 && (
                      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
                        <div className="grid grid-cols-[1fr_1fr_1fr] bg-slate-100 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                          <span>Field</span>
                          <span>Previous</span>
                          <span>Current</span>
                        </div>

                        {projectChanges.map(
                          (change) => (
                            <div
                              key={
                                change.field
                              }
                              className="grid grid-cols-[1fr_1fr_1fr] gap-3 border-t border-slate-200 px-4 py-3 text-sm"
                            >
                              <span className="font-bold text-slate-800">
                                {
                                  change.label
                                }
                              </span>

                              <span className="break-words text-slate-500">
                                {
                                  change.previous
                                }
                              </span>

                              <span className="break-words font-semibold text-slate-950">
                                {
                                  change.current
                                }
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                    )}

                    {metadata.length > 0 && (
                      <dl className="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-3">
                        {metadata.map(
                          (row) => (
                            <div
                              key={row.key}
                            >
                              <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                {row.label}
                              </dt>

                              <dd className="mt-1 break-words text-sm font-semibold capitalize text-slate-800">
                                {row.value}
                              </dd>
                            </div>
                          ),
                        )}
                      </dl>
                    )}

                    {activityHref && (
                      <div className="mt-5 border-t border-slate-200 pt-5">
                        <Link
                          href={activityHref}
                          className="inline-flex rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800 transition hover:bg-blue-100"
                        >
                          {getActivityLinkLabel(
                            entry,
                          )}
                        </Link>
                      </div>
                    )}
                  </div>
                </article>
              );
            },
          )}
        </section>
      )}
    </main>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-bold ${
        active
          ? "bg-blue-950 text-white"
          : "border border-slate-300 bg-white text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
