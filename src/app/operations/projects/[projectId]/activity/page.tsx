"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams } from "next/navigation";

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
  material_issue_reported:
    "Material issue",
  material_issue_updated:
    "Material issue updated",
  message_created: "Message",
  project_updated: "Project update",
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
    "message_created"
  ) {
    return "messages";
  }

  return "project";
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

function metadataRows(
  metadata: Record<string, unknown>,
) {
  const hiddenKeys = new Set([
    "review_id",
    "review_item_id",
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
      label: key
        .replaceAll("_", " ")
        .replace(/\b\w/g, (letter) =>
          letter.toUpperCase(),
        ),
      value:
        typeof value === "boolean"
          ? value
            ? "Yes"
            : "No"
          : String(value).replaceAll(
              "_",
              " ",
            ),
    }));
}

export default function ProjectActivityPage() {
  const params = useParams<{
    projectId: string;
  }>();

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

                              <dd className="mt-1 text-sm font-semibold capitalize text-slate-800">
                                {row.value}
                              </dd>
                            </div>
                          ),
                        )}
                      </dl>
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
