"use client";

import Link from "next/link";
import {
  FormEvent,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import FeatureDisabled from "@/components/features/feature-disabled";
import { useFeatures } from "@/components/features/use-features";

type PageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

type InspectionArea = {
  id: string;
  areaName: string;
  resultStatus: string;
  workMayContinue: boolean;
};

type Inspection = {
  id: string;
  inspectionName: string;
  inspectionStatus: string;
  areas: InspectionArea[];
};

type Dependency = {
  dependencyId: string;
  inspectionId: string;
  inspectionName: string;
  inspectionStatus: string;
  inspectionAreaId: string | null;
  inspectionAreaName: string | null;
  taskId: string;
  dependencyType: string;
  isBlocking: boolean;
  releasedAt: string | null;
  blockedReason: string | null;
};

type ScheduleTask = {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
};

function statusLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
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

export default function InspectionDependenciesPage({
  params,
}: PageProps) {
  const { projectId } =
    use(params);

  const {
    isEnabled,
    loading: featuresLoading,
  } = useFeatures();

  const [
    inspections,
    setInspections,
  ] = useState<Inspection[]>([]);

  const [
    dependencies,
    setDependencies,
  ] = useState<Dependency[]>([]);

  const [
    scheduleTasks,
    setScheduleTasks,
  ] = useState<ScheduleTask[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    deletingId,
    setDeletingId,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  const [
    notice,
    setNotice,
  ] = useState("");

  const [
    inspectionId,
    setInspectionId,
  ] = useState("");

  const [
    inspectionAreaId,
    setInspectionAreaId,
  ] = useState("");

  const [
    taskId,
    setTaskId,
  ] = useState("");

  const [
    dependencyType,
    setDependencyType,
  ] = useState(
    "must_pass_before_start",
  );

  const selectedInspection =
    useMemo(
      () =>
        inspections.find(
          (inspection) =>
            inspection.id ===
            inspectionId,
        ) ?? null,
      [
        inspections,
        inspectionId,
      ],
    );

  const loadDependencies =
    useCallback(async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/projects/${projectId}/inspections/dependencies`,
          {
            credentials: "include",
            cache: "no-store",
          },
        );

        const result =
          (await response.json()) as {
            success?: boolean;
            error?: string;
            inspections?: Inspection[];
            dependencies?: Dependency[];
            scheduleTasks?: ScheduleTask[];
          };

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.error ??
              "Could not load inspection dependencies.",
          );
        }

        setInspections(
          result.inspections ?? [],
        );

        setDependencies(
          result.dependencies ?? [],
        );

        setScheduleTasks(
          result.scheduleTasks ?? [],
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load inspection dependencies.",
        );
      } finally {
        setLoading(false);
      }
    }, [projectId]);

  useEffect(() => {
    void loadDependencies();
  }, [loadDependencies]);

  useEffect(() => {
    setInspectionAreaId("");

    if (
      dependencyType ===
        "area_release_required" &&
      selectedInspection?.areas.length ===
        1
    ) {
      setInspectionAreaId(
        selectedInspection.areas[0].id,
      );
    }
  }, [
    dependencyType,
    selectedInspection,
  ]);

  async function createDependency(
    event: FormEvent,
  ) {
    event.preventDefault();

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/inspections/dependencies`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action: "create",
            inspectionId,
            inspectionAreaId:
              inspectionAreaId || null,
            taskId,
            dependencyType,
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
        throw new Error(
          result.error ??
            "Could not create the inspection dependency.",
        );
      }

      setTaskId("");
      setInspectionAreaId("");

      setNotice(
        "Inspection schedule dependency saved.",
      );

      await loadDependencies();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not create the inspection dependency.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function refreshDependencies() {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/inspections/dependencies`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action: "refresh",
          }),
        },
      );

      const result =
        (await response.json()) as {
          success?: boolean;
          error?: string;

          refresh?: {
            released_dependency_count?: number;
            blocked_dependency_count?: number;
          };
        };

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "Could not refresh inspection dependencies.",
        );
      }

      setNotice(
        `${result.refresh?.released_dependency_count ?? 0} hold(s) released and ${result.refresh?.blocked_dependency_count ?? 0} hold(s) restored.`,
      );

      await loadDependencies();
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Could not refresh inspection dependencies.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeDependency(
    dependency: Dependency,
  ) {
    const reason =
      window.prompt(
        "Why are you removing this inspection dependency?",
      )?.trim() ?? "";

    if (!reason) {
      return;
    }

    setDeletingId(
      dependency.dependencyId,
    );
    setError("");
    setNotice("");

    try {
      const query =
        new URLSearchParams({
          dependencyId:
            dependency.dependencyId,
          reason,
        });

      const response = await fetch(
        `/api/projects/${projectId}/inspections/dependencies?${query.toString()}`,
        {
          method: "DELETE",
          credentials: "include",
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
        throw new Error(
          result.error ??
            "Could not remove the inspection dependency.",
        );
      }

      setNotice(
        "Inspection dependency removed.",
      );

      await loadDependencies();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not remove the inspection dependency.",
      );
    } finally {
      setDeletingId("");
    }
  }

  if (featuresLoading) {
    return (
      <main className="mx-auto max-w-7xl px-5 py-8">
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      </main>
    );
  }

  if (
    !isEnabled(
      "inspection_schedule_dependencies",
    )
  ) {
    return (
      <FeatureDisabled
        title="Inspection Dependencies Disabled"
        description="Inspection-based schedule blocking is disabled for this account."
        backHref={`/operations/projects/${projectId}/inspections/manage`}
        backLabel="Return to Inspections"
      />
    );
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-5 py-8">
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      </main>
    );
  }

  const blockingCount =
    dependencies.filter(
      (dependency) =>
        dependency.isBlocking,
    ).length;

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link
            href={`/operations/projects/${projectId}/inspections/manage`}
            className="text-sm font-bold text-blue-800"
          >
            ← Active Inspections
          </Link>

          <p className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">
            Schedule Controls
          </p>

          <h1 className="mt-2 text-3xl font-black text-slate-950">
            Inspection Dependencies
          </h1>

          <p className="mt-2 text-slate-600">
            Connect schedule tasks to
            inspection passes, scheduled
            inspections, or area-specific
            releases.
          </p>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={() =>
            void refreshDependencies()
          }
          className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800 disabled:opacity-50"
        >
          Refresh Schedule Holds
        </button>
      </div>

      {notice && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {notice}
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {error}
        </div>
      )}

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Dependencies
          </p>

          <p className="mt-3 text-3xl font-black text-slate-950">
            {dependencies.length}
          </p>
        </article>

        <article className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-red-700">
            Active Holds
          </p>

          <p className="mt-3 text-3xl font-black text-red-950">
            {blockingCount}
          </p>
        </article>

        <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
            Released
          </p>

          <p className="mt-3 text-3xl font-black text-emerald-950">
            {dependencies.length -
              blockingCount}
          </p>
        </article>
      </section>

      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">
          Add Schedule Dependency
        </h2>

        <form
          onSubmit={createDependency}
          className="mt-5 grid gap-4 md:grid-cols-2"
        >
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Inspection

            <select
              required
              value={inspectionId}
              onChange={(event) =>
                setInspectionId(
                  event.target.value,
                )
              }
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950"
            >
              <option value="">
                Select inspection
              </option>

              {inspections.map(
                (inspection) => (
                  <option
                    key={inspection.id}
                    value={inspection.id}
                  >
                    {
                      inspection.inspectionName
                    }{" "}
                    —{" "}
                    {statusLabel(
                      inspection.inspectionStatus,
                    )}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Dependency Type

            <select
              value={dependencyType}
              onChange={(event) =>
                setDependencyType(
                  event.target.value,
                )
              }
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950"
            >
              <option value="must_pass_before_start">
                Must pass before task starts
              </option>

              <option value="must_be_scheduled_before_start">
                Must be scheduled before task starts
              </option>

              <option value="area_release_required">
                Specific area must be released
              </option>
            </select>
          </label>

          {dependencyType ===
            "area_release_required" && (
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Inspection Area

              <select
                required
                value={
                  inspectionAreaId
                }
                onChange={(event) =>
                  setInspectionAreaId(
                    event.target.value,
                  )
                }
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950"
              >
                <option value="">
                  Select area
                </option>

                {selectedInspection?.areas.map(
                  (area) => (
                    <option
                      key={area.id}
                      value={area.id}
                    >
                      {area.areaName} —{" "}
                      {area.workMayContinue
                        ? "Released"
                        : "Blocked"}
                    </option>
                  ),
                )}
              </select>
            </label>
          )}

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Project Task

            <select
              required
              value={taskId}
              onChange={(event) =>
                setTaskId(
                  event.target.value,
                )
              }
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950"
            >
              <option value="">
                Select project task
              </option>

              {scheduleTasks.map(
                (task) => (
                  <option
                    key={task.id}
                    value={task.id}
                  >
                    {task.title} —{" "}
                    {statusLabel(
                      task.status,
                    )}
                  </option>
                ),
              )}
            </select>
          </label>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-blue-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : "Add Inspection Dependency"}
            </button>
          </div>
        </form>
      </section>

      <section className="mt-7">
        <h2 className="text-xl font-bold text-slate-950">
          Current Dependencies
        </h2>

        {dependencies.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">
            No inspection schedule
            dependencies have been added.
          </div>
        ) : (
          <div className="mt-4 grid gap-4">
            {dependencies.map(
              (dependency) => (
                <article
                  key={
                    dependency.dependencyId
                  }
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            dependency.isBlocking
                              ? "bg-red-100 text-red-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {dependency.isBlocking
                            ? "Blocking"
                            : "Released"}
                        </span>

                        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">
                          {statusLabel(
                            dependency.dependencyType,
                          )}
                        </span>
                      </div>

                      <h3 className="mt-3 text-lg font-bold text-slate-950">
                        {
                          dependency.inspectionName
                        }
                      </h3>

                      {dependency.inspectionAreaName && (
                        <p className="mt-1 text-sm font-semibold text-slate-700">
                          Area:{" "}
                          {
                            dependency.inspectionAreaName
                          }
                        </p>
                      )}

                      <p className="mt-3 font-mono text-xs text-slate-500">
                        Task:{" "}
                        {dependency.taskId}
                      </p>

                      {dependency.blockedReason && (
                        <p className="mt-3 text-sm font-semibold text-red-700">
                          {
                            dependency.blockedReason
                          }
                        </p>
                      )}

                      {!dependency.isBlocking && (
                        <p className="mt-3 text-sm text-emerald-700">
                          Released{" "}
                          {formatDate(
                            dependency.releasedAt,
                          )}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={
                        deletingId ===
                        dependency.dependencyId
                      }
                      onClick={() =>
                        void removeDependency(
                          dependency,
                        )
                      }
                      className="rounded-xl border border-red-300 bg-white px-4 py-3 text-sm font-bold text-red-700 disabled:opacity-50"
                    >
                      {deletingId ===
                      dependency.dependencyId
                        ? "Removing..."
                        : "Remove Dependency"}
                    </button>
                  </div>
                </article>
              ),
            )}
          </div>
        )}
      </section>
    </main>
  );
}
