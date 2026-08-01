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

type Correction = {
  id: string;
  inspectionId: string;
  resultHistoryId: string | null;
  inspectionAreaId: string | null;
  correctionNumber: number;
  title: string;
  description: string | null;
  correctionStatus: string;
  priority: string;
  assignedName: string | null;
  assignedCompany: string | null;
  assignedEmail: string | null;
  assignedPhone: string | null;
  dueDate: string | null;
  workStartedAt: string | null;
  workCompletedAt: string | null;
  completionNotes: string | null;
  completionPhotoUrls: string[];
  completionDocumentUrls: string[];
  verifiedAt: string | null;
  verificationNotes: string | null;
  reinspectionRequired: boolean;
  reinspectionRequestedAt: string | null;
  reinspectionScheduledAt: string | null;
  reinspectionInspectionId: string | null;
  sourceType: string;
  sourceExcerpt: string | null;
  createdAt: string;
  inspectionName: string;
  inspectionStatus: string;
  areaName: string | null;
};

function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function formatDate(
  value: string | null,
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
  ).format(new Date(value));
}

export default function InspectionCorrectionsPage({
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
    corrections,
    setCorrections,
  ] = useState<Correction[]>([]);

  const [
    summary,
    setSummary,
  ] = useState<Record<
    string,
    number
  >>({});

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    savingId,
    setSavingId,
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
    title,
    setTitle,
  ] = useState("");

  const [
    description,
    setDescription,
  ] = useState("");

  const [
    priority,
    setPriority,
  ] = useState("normal");

  const [
    dueDate,
    setDueDate,
  ] = useState("");

  const [
    reinspectionRequired,
    setReinspectionRequired,
  ] = useState(true);

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

  const loadCorrections =
    useCallback(async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/projects/${projectId}/inspections/corrections`,
          {
            credentials: "include",
            cache: "no-store",
          },
        );

        const result =
          (await response.json()) as {
            success?: boolean;
            error?: string;
            summary?: Record<
              string,
              number
            >;
            inspections?: Inspection[];
            corrections?: Correction[];
          };

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.error ??
              "Could not load inspection corrections.",
          );
        }

        setSummary(
          result.summary ?? {},
        );

        setInspections(
          result.inspections ?? [],
        );

        setCorrections(
          result.corrections ?? [],
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load inspection corrections.",
        );
      } finally {
        setLoading(false);
      }
    }, [projectId]);

  useEffect(() => {
    void loadCorrections();
  }, [loadCorrections]);

  useEffect(() => {
    setInspectionAreaId("");
  }, [inspectionId]);

  async function createCorrection(
    event: FormEvent,
  ) {
    event.preventDefault();

    setSavingId("create");
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/inspections/corrections`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            inspectionId,
            inspectionAreaId:
              inspectionAreaId ||
              null,
            title,
            description,
            priority,
            dueDate:
              dueDate || null,
            reinspectionRequired,
            sourceType:
              "contractor",
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
            "Could not create the correction.",
        );
      }

      setTitle("");
      setDescription("");
      setPriority("normal");
      setDueDate("");
      setInspectionAreaId("");
      setReinspectionRequired(
        true,
      );

      setNotice(
        "Inspection correction created.",
      );

      await loadCorrections();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create the correction.",
      );
    } finally {
      setSavingId("");
    }
  }

  async function runAction(
    correction: Correction,
    action: string,
  ) {
    setSavingId(correction.id);
    setError("");
    setNotice("");

    let payload:
      Record<string, unknown> = {
        action,
      };

    if (action === "assign") {
      payload = {
        ...payload,

        assignedName:
          window.prompt(
            "Assigned person or company name:",
            correction.assignedName ??
              "",
          ) ?? "",

        assignedCompany:
          window.prompt(
            "Company:",
            correction.assignedCompany ??
              "",
          ) ?? "",

        assignedEmail:
          window.prompt(
            "Email:",
            correction.assignedEmail ??
              "",
          ) ?? "",

        assignedPhone:
          window.prompt(
            "Phone:",
            correction.assignedPhone ??
              "",
          ) ?? "",

        dueDate:
          window.prompt(
            "Due date in YYYY-MM-DD format:",
            correction.dueDate ?? "",
          ) ?? "",
      };
    }

    if (action === "complete") {
      payload = {
        ...payload,

        completionNotes:
          window.prompt(
            "Completion notes:",
            correction.completionNotes ??
              "",
          ) ?? "",

        completionPhotoUrls: [],

        completionDocumentUrls: [],
      };
    }

    if (action === "verify") {
      payload = {
        ...payload,

        verificationNotes:
          window.prompt(
            "Verification notes:",
            correction.verificationNotes ??
              "",
          ) ?? "",
      };
    }

    try {
      const response = await fetch(
        `/api/projects/${projectId}/inspections/corrections/${correction.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(
            payload,
          ),
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
            "Could not update the correction.",
        );
      }

      setNotice(
        `Correction ${label(
          action,
        ).toLowerCase()}.`,
      );

      await loadCorrections();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Could not update the correction.",
      );
    } finally {
      setSavingId("");
    }
  }

  async function createReinspection(
    correction: Correction,
  ) {
    const scheduledStartAt =
      window.prompt(
        "Scheduled date and time in ISO format, or leave blank to create as requested:",
        "",
      ) ?? "";

    setSavingId(correction.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/inspections/corrections/${correction.id}/reinspection`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            scheduledStartAt:
              scheduledStartAt ||
              null,
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
            "Could not create the reinspection.",
        );
      }

      setNotice(
        scheduledStartAt
          ? "Reinspection created and scheduled."
          : "Reinspection request created.",
      );

      await loadCorrections();
    } catch (reinspectionError) {
      setError(
        reinspectionError instanceof Error
          ? reinspectionError.message
          : "Could not create the reinspection.",
      );
    } finally {
      setSavingId("");
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
      "inspection_corrections",
    )
  ) {
    return (
      <FeatureDisabled
        title="Inspection Corrections Disabled"
        description="Correction and reinspection workflows are disabled for this account."
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

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <Link
        href={`/operations/projects/${projectId}/inspections/manage`}
        className="text-sm font-bold text-blue-800"
      >
        ← Active Inspections
      </Link>

      <p className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">
        Failed Inspection Work
      </p>

      <h1 className="mt-2 text-3xl font-black text-slate-950">
        Corrections & Reinspections
      </h1>

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

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [
            "Open",
            summary.open_count ?? 0,
          ],
          [
            "In Progress",
            summary.in_progress_count ??
              0,
          ],
          [
            "Ready to Verify",
            summary
              .ready_for_verification_count ??
              0,
          ],
          [
            "Awaiting Reinspection",
            summary
              .reinspection_required_count ??
              0,
          ],
        ].map(([name, value]) => (
          <article
            key={String(name)}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {name}
            </p>

            <p className="mt-3 text-3xl font-black text-slate-950">
              {value}
            </p>
          </article>
        ))}
      </section>

      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">
          Add Correction Item
        </h2>

        <form
          onSubmit={createCorrection}
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
                    {label(
                      inspection.inspectionStatus,
                    )}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Specific Area

            <select
              value={inspectionAreaId}
              onChange={(event) =>
                setInspectionAreaId(
                  event.target.value,
                )
              }
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950"
            >
              <option value="">
                Entire inspection
              </option>

              {selectedInspection?.areas.map(
                (area) => (
                  <option
                    key={area.id}
                    value={area.id}
                  >
                    {area.areaName}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Correction Title

            <input
              required
              value={title}
              onChange={(event) =>
                setTitle(
                  event.target.value,
                )
              }
              className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Priority

            <select
              value={priority}
              onChange={(event) =>
                setPriority(
                  event.target.value,
                )
              }
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950"
            >
              <option value="low">
                Low
              </option>

              <option value="normal">
                Normal
              </option>

              <option value="high">
                High
              </option>

              <option value="urgent">
                Urgent
              </option>
            </select>
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Due Date

            <input
              type="date"
              value={dueDate}
              onChange={(event) =>
                setDueDate(
                  event.target.value,
                )
              }
              className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
            />
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4">
            <input
              type="checkbox"
              checked={
                reinspectionRequired
              }
              onChange={(event) =>
                setReinspectionRequired(
                  event.target.checked,
                )
              }
              className="mt-1 h-5 w-5"
            />

            <span className="font-bold text-slate-800">
              Reinspection required
            </span>
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700 md:col-span-2">
            Description

            <textarea
              rows={4}
              value={description}
              onChange={(event) =>
                setDescription(
                  event.target.value,
                )
              }
              className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
            />
          </label>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={
                savingId === "create"
              }
              className="rounded-xl bg-blue-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {savingId === "create"
                ? "Creating..."
                : "Create Correction"}
            </button>
          </div>
        </form>
      </section>

      <section className="mt-7 grid gap-5">
        {corrections.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">
            No inspection corrections
            have been created.
          </div>
        ) : (
          corrections.map(
            (correction) => (
              <article
                key={correction.id}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">
                        Correction #
                        {
                          correction.correctionNumber
                        }
                      </span>

                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                        {label(
                          correction.correctionStatus,
                        )}
                      </span>

                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                        {label(
                          correction.priority,
                        )}
                      </span>
                    </div>

                    <h2 className="mt-3 text-xl font-bold text-slate-950">
                      {correction.title}
                    </h2>

                    <p className="mt-1 text-sm font-semibold text-slate-600">
                      {
                        correction.inspectionName
                      }
                      {correction.areaName
                        ? ` · ${correction.areaName}`
                        : ""}
                    </p>

                    {correction.description && (
                      <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {
                          correction.description
                        }
                      </p>
                    )}

                    <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                      <p>
                        Assigned:{" "}
                        {correction.assignedName ??
                          "Unassigned"}
                      </p>

                      <p>
                        Due:{" "}
                        {formatDate(
                          correction.dueDate,
                        )}
                      </p>

                      <p>
                        Started:{" "}
                        {formatDate(
                          correction.workStartedAt,
                        )}
                      </p>

                      <p>
                        Completed:{" "}
                        {formatDate(
                          correction.workCompletedAt,
                        )}
                      </p>
                    </div>

                    {correction.completionNotes && (
                      <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                        {
                          correction.completionNotes
                        }
                      </div>
                    )}

                    {correction.reinspectionRequired && (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                        Reinspection required
                        {correction.reinspectionInspectionId
                          ? " · Reinspection created"
                          : ""}
                      </div>
                    )}
                  </div>

                  <div className="flex max-w-sm flex-wrap gap-2">
                    {[
                      "open",
                      "reopened",
                    ].includes(
                      correction.correctionStatus,
                    ) && (
                      <button
                        type="button"
                        onClick={() =>
                          void runAction(
                            correction,
                            "assign",
                          )
                        }
                        className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800"
                      >
                        Assign
                      </button>
                    )}

                    {[
                      "open",
                      "assigned",
                      "reopened",
                    ].includes(
                      correction.correctionStatus,
                    ) && (
                      <button
                        type="button"
                        onClick={() =>
                          void runAction(
                            correction,
                            "start",
                          )
                        }
                        className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-800"
                      >
                        Start Work
                      </button>
                    )}

                    {correction.correctionStatus ===
                      "in_progress" && (
                      <button
                        type="button"
                        onClick={() =>
                          void runAction(
                            correction,
                            "complete",
                          )
                        }
                        className="rounded-xl bg-blue-950 px-4 py-3 text-sm font-bold text-white"
                      >
                        Mark Complete
                      </button>
                    )}

                    {correction.correctionStatus ===
                      "ready_for_verification" && (
                      <button
                        type="button"
                        onClick={() =>
                          void runAction(
                            correction,
                            "verify",
                          )
                        }
                        className="rounded-xl bg-emerald-800 px-4 py-3 text-sm font-bold text-white"
                      >
                        Verify Correction
                      </button>
                    )}

                    {correction.correctionStatus ===
                      "verified" &&
                      correction.reinspectionRequired &&
                      !correction.reinspectionInspectionId && (
                        <button
                          type="button"
                          onClick={() =>
                            void createReinspection(
                              correction,
                            )
                          }
                          className="rounded-xl bg-amber-800 px-4 py-3 text-sm font-bold text-white"
                        >
                          Create Reinspection
                        </button>
                      )}

                    {[
                      "verified",
                      "ready_for_verification",
                    ].includes(
                      correction.correctionStatus,
                    ) && (
                      <button
                        type="button"
                        onClick={() =>
                          void runAction(
                            correction,
                            "reopen",
                          )
                        }
                        className="rounded-xl border border-amber-300 bg-white px-4 py-3 text-sm font-bold text-amber-800"
                      >
                        Reopen
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ),
          )
        )}
      </section>
    </main>
  );
}
