"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

type Readiness = {
  projectId: string;
  hasDemo: boolean;
  customerReady: boolean;
  permitReady: boolean;
  dumpsterReady: boolean;
  siteAccessReady: boolean;
  installerEarliestDemoStart:
    | string
    | null;
  installerEarliestConstructionStart:
    | string
    | null;
  calculatedMaterialSafeStart:
    | string
    | null;
  calculatedDemoStart:
    | string
    | null;
  calculatedConstructionStart:
    | string
    | null;
  confirmedDemoStart:
    | string
    | null;
  confirmedConstructionStart:
    | string
    | null;
  scheduleStatus: string;
};

type ProjectSchedule = {
  id: string;
  name: string;
  address: string;
  readiness: Readiness | null;
};

type ApiResponse = {
  success: boolean;
  projects?: ProjectSchedule[];
  error?: string;
};

function formatDate(
  value: string | null | undefined,
) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  ).format(
    new Date(`${value}T12:00:00`),
  );
}

function statusLabel(
  value: string | undefined,
) {
  if (!value) {
    return "Planning";
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

export default function OperationsSchedulePage() {
  const [projects, setProjects] =
    useState<ProjectSchedule[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [filter, setFilter] =
    useState("all");

  async function loadSchedules() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/project-schedules",
        {
          credentials: "include",
          cache: "no-store",
        },
      );

      const result =
        (await response.json()) as ApiResponse;

      if (
        !response.ok ||
        !result.success
      ) {
        setError(
          result.error ??
            "Could not load project schedules.",
        );
        return;
      }

      setProjects(
        result.projects ?? [],
      );
    } catch {
      setError(
        "Could not load project schedules.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSchedules();
  }, []);

  const filteredProjects =
    useMemo(() => {
      if (filter === "all") {
        return projects;
      }

      return projects.filter(
        (project) =>
          project.readiness
            ?.scheduleStatus === filter,
      );
    }, [filter, projects]);

  const statusOptions =
    useMemo(() => {
      return Array.from(
        new Set(
          projects
            .map(
              (project) =>
                project.readiness
                  ?.scheduleStatus,
            )
            .filter(Boolean),
        ),
      ) as string[];
    }, [projects]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
            Operations
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">
            Project Schedule
          </h1>

          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
            Review demo readiness,
            material-safe dates, installer
            availability, and calculated
            construction starts across all
            projects.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <select
            value={filter}
            onChange={(event) =>
              setFilter(
                event.target.value,
              )
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800"
          >
            <option value="all">
              All statuses
            </option>

            {statusOptions.map(
              (status) => (
                <option
                  key={status}
                  value={status}
                >
                  {statusLabel(status)}
                </option>
              ),
            )}
          </select>

          <button
            type="button"
            onClick={() =>
              void loadSchedules()
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-8 text-sm text-slate-600">
          Loading project schedules...
        </p>
      ) : filteredProjects.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-xl font-bold text-slate-950">
            No projects to show
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            Project scheduling information
            will appear here after projects
            are created.
          </p>
        </section>
      ) : (
        <section className="mt-8 grid gap-5">
          {filteredProjects.map(
            (project) => {
              const readiness =
                project.readiness;

              return (
                <article
                  key={project.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-bold text-blue-700">
                        {statusLabel(
                          readiness
                            ?.scheduleStatus,
                        )}
                      </p>

                      <h2 className="mt-1 text-xl font-bold text-slate-950">
                        {project.name}
                      </h2>

                      {project.address && (
                        <p className="mt-1 text-sm text-slate-600">
                          {project.address}
                        </p>
                      )}
                    </div>

                    <Link
                      href={`/operations/projects/${project.id}`}
                      className="rounded-lg bg-blue-950 px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-blue-900"
                    >
                      Open Project
                    </Link>
                  </div>

                  <dl className="mt-5 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Info
                      label="Calculated demo"
                      value={formatDate(
                        readiness
                          ?.calculatedDemoStart,
                      )}
                    />

                    <Info
                      label="Material-safe"
                      value={formatDate(
                        readiness
                          ?.calculatedMaterialSafeStart,
                      )}
                    />

                    <Info
                      label="Calculated construction"
                      value={formatDate(
                        readiness
                          ?.calculatedConstructionStart,
                      )}
                    />

                    <Info
                      label="Confirmed construction"
                      value={formatDate(
                        readiness
                          ?.confirmedConstructionStart,
                      )}
                    />
                  </dl>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <ReadinessPill
                      label="Customer"
                      ready={
                        readiness
                          ?.customerReady ===
                        true
                      }
                    />

                    <ReadinessPill
                      label="Permit"
                      ready={
                        readiness
                          ?.permitReady ===
                        true
                      }
                    />

                    <ReadinessPill
                      label="Site access"
                      ready={
                        readiness
                          ?.siteAccessReady ===
                        true
                      }
                    />

                    {readiness?.hasDemo && (
                      <ReadinessPill
                        label="Dumpster"
                        ready={
                          readiness
                            .dumpsterReady ===
                          true
                        }
                      />
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

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </dt>

      <dd className="mt-1 text-sm font-semibold text-slate-800">
        {value}
      </dd>
    </div>
  );
}

function ReadinessPill({
  label,
  ready,
}: {
  label: string;
  ready: boolean;
}) {
  return (
    <span
      className={`rounded-full px-3 py-2 text-xs font-bold ${
        ready
          ? "bg-emerald-100 text-emerald-800"
          : "bg-amber-100 text-amber-900"
      }`}
    >
      {label}:{" "}
      {ready ? "Ready" : "Waiting"}
    </span>
  );
}
