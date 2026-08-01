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
  id?: string;
  areaName: string;
  areaCode: string | null;
  resultStatus: string;
  workMayContinue: boolean;
  blockedReason: string | null;
  correctionNotes: string | null;
  reinspectionRequired: boolean;
};

type Inspection = {
  id: string;
  inspectionName: string;
  inspectionCategory: string;
  inspectionStatus: string;
  requestedAt: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  completedAt: string | null;
  inspectorName: string | null;
  inspectorDepartment: string | null;
  inspectionNumber: string | null;
  permitNumber: string | null;
  resultSummary: string | null;
  correctionSummary: string | null;
  reinspectionRequired: boolean;
  reinspectionDueDate: string | null;
  contractorResultVerifiedAt: string | null;
  extractionStatus: string;
  resultDocumentUrls: string[];
  resultPhotoUrls: string[];
  scheduleBlockingEnabled: boolean;
  areas: InspectionArea[];
};

type ResultRecord = {
  id: string;
  result_status: string;
  result_summary: string | null;
  correction_summary: string | null;
  inspector_name: string | null;
  completed_at: string;
  reinspection_required: boolean;
  reinspection_due_date: string | null;
  contractor_confirmed: boolean;
  contractor_confirmed_at: string | null;
  contractor_confirmation_notes: string | null;

  project_inspection_result_area_history?: Array<{
    id: string;
    area_name: string;
    result_status: string;
    work_may_continue: boolean;
    blocked_reason: string | null;
    correction_notes: string | null;
    reinspection_required: boolean;
  }>;
};

function formatDateTime(
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
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(new Date(value));
}

function statusLabel(
  value: string,
) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

export default function ManageInspectionsPage({
  params,
}: PageProps) {
  const { projectId } =
    use(params);

  const {
    isEnabled,
    loading: featuresLoading,
  } = useFeatures();

  const [
    projectName,
    setProjectName,
  ] = useState("");

  const [
    projectAddress,
    setProjectAddress,
  ] = useState("");

  const [
    inspections,
    setInspections,
  ] = useState<Inspection[]>(
    [],
  );

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
    selectedInspectionId,
    setSelectedInspectionId,
  ] = useState("");

  const [
    resultHistory,
    setResultHistory,
  ] = useState<
    Record<string, ResultRecord[]>
  >({});

  const [
    error,
    setError,
  ] = useState("");

  const [
    notice,
    setNotice,
  ] = useState("");

  const [
    scheduledStartAt,
    setScheduledStartAt,
  ] = useState("");

  const [
    inspectorName,
    setInspectorName,
  ] = useState("");

  const [
    inspectorDepartment,
    setInspectorDepartment,
  ] = useState("");

  const [
    inspectionNumber,
    setInspectionNumber,
  ] = useState("");

  const [
    resultStatus,
    setResultStatus,
  ] = useState<
    "passed" | "partial_pass" | "failed"
  >("passed");

  const [
    resultSummary,
    setResultSummary,
  ] = useState("");

  const [
    correctionSummary,
    setCorrectionSummary,
  ] = useState("");

  const [
    completedAt,
    setCompletedAt,
  ] = useState("");

  const [
    reinspectionRequired,
    setReinspectionRequired,
  ] = useState(false);

  const [
    reinspectionDueDate,
    setReinspectionDueDate,
  ] = useState("");

  const [
    documentUrls,
    setDocumentUrls,
  ] = useState("");

  const [
    photoUrls,
    setPhotoUrls,
  ] = useState("");

  const [
    areas,
    setAreas,
  ] = useState<InspectionArea[]>(
    [],
  );

  const selectedInspection =
    useMemo(
      () =>
        inspections.find(
          (inspection) =>
            inspection.id ===
            selectedInspectionId,
        ) ?? null,
      [
        inspections,
        selectedInspectionId,
      ],
    );

  const loadInspections =
    useCallback(async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/projects/${projectId}/inspections`,
          {
            credentials: "include",
            cache: "no-store",
          },
        );

        const result =
          (await response.json()) as {
            success?: boolean;
            error?: string;

            project?: {
              name: string;
              address: string;
            };

            summary?: Record<
              string,
              number
            >;

            inspections?: Inspection[];
          };

        if (
          !response.ok ||
          !result.success ||
          !result.project
        ) {
          throw new Error(
            result.error ??
              "Could not load inspections.",
          );
        }

        setProjectName(
          result.project.name,
        );

        setProjectAddress(
          result.project.address,
        );

        setSummary(
          result.summary ?? {},
        );

        setInspections(
          result.inspections ?? [],
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load inspections.",
        );
      } finally {
        setLoading(false);
      }
    }, [projectId]);

  useEffect(() => {
    void loadInspections();
  }, [loadInspections]);

  async function runInspectionAction(
    inspection: Inspection,
    action:
      | "request"
      | "schedule"
      | "reschedule"
      | "cancel"
      | "reset",
  ) {
    setSavingId(inspection.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/inspections`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            inspectionId:
              inspection.id,

            action,

            scheduledStartAt:
              scheduledStartAt
                ? new Date(
                    scheduledStartAt,
                  ).toISOString()
                : null,

            inspectorName,

            inspectorDepartment,

            inspectionNumber,
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
            "Could not update the inspection.",
        );
      }

      setNotice(
        action === "request"
          ? "Inspection requested."
          : action === "schedule"
            ? "Inspection scheduled."
            : action === "reschedule"
              ? "Inspection rescheduled."
              : action === "cancel"
                ? "Inspection cancelled."
                : "Inspection reset.",
      );

      setScheduledStartAt("");
      setInspectorName("");
      setInspectorDepartment("");
      setInspectionNumber("");

      await loadInspections();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Could not update the inspection.",
      );
    } finally {
      setSavingId("");
    }
  }

  async function loadResultHistory(
    inspectionId: string,
  ) {
    const response = await fetch(
      `/api/projects/${projectId}/inspections/${inspectionId}/results`,
      {
        credentials: "include",
        cache: "no-store",
      },
    );

    const result =
      (await response.json()) as {
        success?: boolean;
        error?: string;
        results?: ResultRecord[];
      };

    if (
      !response.ok ||
      !result.success
    ) {
      throw new Error(
        result.error ??
          "Could not load result history.",
      );
    }

    setResultHistory(
      (current) => ({
        ...current,
        [inspectionId]:
          result.results ?? [],
      }),
    );
  }

  async function openResultForm(
    inspection: Inspection,
  ) {
    setSelectedInspectionId(
      inspection.id,
    );

    setResultStatus(
      inspection.inspectionStatus ===
        "partial_pass"
        ? "partial_pass"
        : inspection.inspectionStatus ===
            "failed"
          ? "failed"
          : "passed",
    );

    setResultSummary(
      inspection.resultSummary ?? "",
    );

    setCorrectionSummary(
      inspection.correctionSummary ??
        "",
    );

    setInspectorName(
      inspection.inspectorName ??
        "",
    );

    setInspectorDepartment(
      inspection.inspectorDepartment ??
        "",
    );

    setInspectionNumber(
      inspection.inspectionNumber ??
        "",
    );

    setCompletedAt(
      new Date()
        .toISOString()
        .slice(0, 16),
    );

    setReinspectionRequired(
      inspection.reinspectionRequired,
    );

    setReinspectionDueDate(
      inspection.reinspectionDueDate ??
        "",
    );

    setDocumentUrls(
      inspection.resultDocumentUrls.join(
        "\n",
      ),
    );

    setPhotoUrls(
      inspection.resultPhotoUrls.join(
        "\n",
      ),
    );

    setAreas(
      inspection.areas.length
        ? inspection.areas
        : [],
    );

    try {
      await loadResultHistory(
        inspection.id,
      );
    } catch (historyError) {
      setError(
        historyError instanceof Error
          ? historyError.message
          : "Could not load result history.",
      );
    }
  }

  function addArea() {
    setAreas((current) => [
      ...current,
      {
        areaName: "",
        areaCode: null,
        resultStatus:
          "not_inspected",
        workMayContinue: false,
        blockedReason: null,
        correctionNotes: null,
        reinspectionRequired:
          false,
      },
    ]);
  }

  function updateArea(
    index: number,
    values: Partial<InspectionArea>,
  ) {
    setAreas((current) =>
      current.map(
        (area, areaIndex) =>
          areaIndex === index
            ? {
                ...area,
                ...values,
              }
            : area,
      ),
    );
  }

  function removeArea(index: number) {
    setAreas((current) =>
      current.filter(
        (_, areaIndex) =>
          areaIndex !== index,
      ),
    );
  }

  async function uploadResult(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (!selectedInspection) {
      return;
    }

    setSavingId(
      selectedInspection.id,
    );
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/inspections/${selectedInspection.id}/results`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            resultStatus,
            resultSummary,
            correctionSummary,
            inspectorName,
            inspectorDepartment,
            inspectionNumber,

            completedAt:
              completedAt
                ? new Date(
                    completedAt,
                  ).toISOString()
                : new Date().toISOString(),

            reinspectionRequired,

            reinspectionDueDate:
              reinspectionDueDate ||
              null,

            resultDocumentUrls:
              documentUrls
                .split("\n")
                .map((value) =>
                  value.trim(),
                )
                .filter(Boolean),

            resultPhotoUrls:
              photoUrls
                .split("\n")
                .map((value) =>
                  value.trim(),
                )
                .filter(Boolean),

            extractedResult: {
              detected_status:
                resultStatus,

              detected_summary:
                resultSummary,

              detected_corrections:
                correctionSummary,

              detected_areas:
                areas,
            },

            extractionStatus:
              "review_required",

            areas,
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
            "Could not record the inspection result.",
        );
      }

      setNotice(
        "Inspection result saved for contractor confirmation.",
      );

      await Promise.all([
        loadInspections(),
        loadResultHistory(
          selectedInspection.id,
        ),
      ]);
    } catch (resultError) {
      setError(
        resultError instanceof Error
          ? resultError.message
          : "Could not record the inspection result.",
      );
    } finally {
      setSavingId("");
    }
  }

  async function confirmResult(
    inspection: Inspection,
    result: ResultRecord,
  ) {
    const notes =
      window.prompt(
        "Add contractor confirmation notes, or leave blank.",
      ) ?? "";

    setSavingId(result.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/inspections/${inspection.id}/results/${result.id}/confirm`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            confirmedResultStatus:
              result.result_status,

            confirmationNotes:
              notes,
          }),
        },
      );

      const responseResult =
        (await response.json()) as {
          success?: boolean;
          error?: string;
        };

      if (
        !response.ok ||
        !responseResult.success
      ) {
        throw new Error(
          responseResult.error ??
            "Could not confirm the inspection result.",
        );
      }

      setNotice(
        result.result_status ===
          "partial_pass"
          ? "Partial pass confirmed. Approved areas were released and blocked areas remain held."
          : result.result_status ===
              "passed"
            ? "Inspection pass confirmed and related schedule holds released."
            : "Inspection failure confirmed and related work remains blocked.",
      );

      await Promise.all([
        loadInspections(),
        loadResultHistory(
          inspection.id,
        ),
      ]);
    } catch (confirmError) {
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : "Could not confirm the inspection result.",
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
    !isEnabled("inspections")
  ) {
    return (
      <FeatureDisabled
        title="Inspections Disabled"
        description="Inspection and permitting workflows are disabled for this account."
        backHref={`/operations/projects/${projectId}`}
        backLabel="Return to Project"
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
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link
            href={`/operations/projects/${projectId}/inspections`}
            className="text-sm font-bold text-blue-800"
          >
            ← Inspection Checklist
          </Link>

          <p className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">
            Active Workflow
          </p>

          <h1 className="mt-2 text-3xl font-black text-slate-950">
            Inspections
          </h1>

          <p className="mt-2 text-slate-600">
            {projectName}
            {projectAddress
              ? ` · ${projectAddress}`
              : ""}
          </p>
        </div>
        <Link
          href={`/operations/projects/${projectId}/inspections/dependencies`}
          className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-3 text-center text-sm font-bold text-indigo-800"
        >
          Manage Schedule Dependencies
        </Link>

        <Link
          href={`/operations/projects/${projectId}/inspections/corrections`}
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm font-bold text-amber-800"
        >
          Corrections & Reinspections
        </Link>
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

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [
            "Total",
            summary.total_count ?? 0,
          ],
          [
            "Scheduled",
            summary.scheduled_count ??
              0,
          ],
          [
            "Passed",
            summary.passed_count ?? 0,
          ],
          [
            "Needs Review",
            summary
              .unverified_result_count ??
              0,
          ],
        ].map(([label, value]) => (
          <article
            key={String(label)}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {label}
            </p>

            <p className="mt-3 text-3xl font-black text-slate-950">
              {value}
            </p>
          </article>
        ))}
      </section>

      <section className="mt-7 grid gap-5">
        {inspections.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-900">
            No active inspections were
            found. Verify and activate
            the inspection checklist
            first.
          </div>
        ) : (
          inspections.map(
            (inspection) => (
              <article
                key={inspection.id}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                        {statusLabel(
                          inspection.inspectionCategory,
                        )}
                      </span>

                      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">
                        {statusLabel(
                          inspection.inspectionStatus,
                        )}
                      </span>

                      {inspection.contractorResultVerifiedAt && (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                          Contractor Confirmed
                        </span>
                      )}
                    </div>

                    <h2 className="mt-3 text-xl font-bold text-slate-950">
                      {
                        inspection.inspectionName
                      }
                    </h2>

                    <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                      <p>
                        Scheduled:{" "}
                        {formatDateTime(
                          inspection.scheduledStartAt,
                        )}
                      </p>

                      <p>
                        Completed:{" "}
                        {formatDateTime(
                          inspection.completedAt,
                        )}
                      </p>

                      <p>
                        Inspector:{" "}
                        {inspection.inspectorName ??
                          "—"}
                      </p>

                      <p>
                        Inspection #:{" "}
                        {inspection.inspectionNumber ??
                          "—"}
                      </p>
                    </div>

                    {inspection.resultSummary && (
                      <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {
                          inspection.resultSummary
                        }
                      </p>
                    )}

                    {inspection.reinspectionRequired && (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                        Reinspection required
                        {inspection.reinspectionDueDate
                          ? ` by ${inspection.reinspectionDueDate}`
                          : ""}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={
                        savingId ===
                        inspection.id
                      }
                      onClick={() =>
                        void runInspectionAction(
                          inspection,
                          "request",
                        )
                      }
                      className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-50"
                    >
                      Request
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setSelectedInspectionId(
                          inspection.id,
                        )
                      }
                      className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800"
                    >
                      Schedule
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void openResultForm(
                          inspection,
                        )
                      }
                      className="rounded-xl bg-blue-950 px-4 py-3 text-sm font-bold text-white"
                    >
                      Upload Result
                    </button>
                  </div>
                </div>

                {selectedInspectionId ===
                  inspection.id && (
                  <div className="mt-6 border-t border-slate-200 pt-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2 text-sm font-bold text-slate-700">
                        Scheduled Date & Time

                        <input
                          type="datetime-local"
                          value={
                            scheduledStartAt
                          }
                          onChange={(event) =>
                            setScheduledStartAt(
                              event.target
                                .value,
                            )
                          }
                          className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                        />
                      </label>

                      <label className="grid gap-2 text-sm font-bold text-slate-700">
                        Inspector Name

                        <input
                          value={inspectorName}
                          onChange={(event) =>
                            setInspectorName(
                              event.target
                                .value,
                            )
                          }
                          className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                        />
                      </label>

                      <label className="grid gap-2 text-sm font-bold text-slate-700">
                        Department

                        <input
                          value={
                            inspectorDepartment
                          }
                          onChange={(event) =>
                            setInspectorDepartment(
                              event.target
                                .value,
                            )
                          }
                          className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                        />
                      </label>

                      <label className="grid gap-2 text-sm font-bold text-slate-700">
                        Inspection Number

                        <input
                          value={
                            inspectionNumber
                          }
                          onChange={(event) =>
                            setInspectionNumber(
                              event.target
                                .value,
                            )
                          }
                          className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                        />
                      </label>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void runInspectionAction(
                            inspection,
                            inspection.scheduledStartAt
                              ? "reschedule"
                              : "schedule",
                          )
                        }
                        className="rounded-xl bg-blue-950 px-4 py-3 text-sm font-bold text-white"
                      >
                        {inspection.scheduledStartAt
                          ? "Reschedule"
                          : "Schedule Inspection"}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void runInspectionAction(
                            inspection,
                            "cancel",
                          )
                        }
                        className="rounded-xl border border-red-300 bg-white px-4 py-3 text-sm font-bold text-red-700"
                      >
                        Cancel Inspection
                      </button>
                    </div>
                  </div>
                )}

                {selectedInspection?.id ===
                  inspection.id && (
                  <form
                    onSubmit={
                      uploadResult
                    }
                    className="mt-6 border-t border-slate-200 pt-6"
                  >
                    <h3 className="text-lg font-bold text-slate-950">
                      Inspection Result
                    </h3>

                    <p className="mt-2 text-sm text-slate-600">
                      Enter or review the
                      detected inspection
                      result before the
                      contractor confirms
                      it.
                    </p>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2 text-sm font-bold text-slate-700">
                        Detected Result

                        <select
                          value={
                            resultStatus
                          }
                          onChange={(event) =>
                            setResultStatus(
                              event.target
                                .value as
                                | "passed"
                                | "partial_pass"
                                | "failed",
                            )
                          }
                          className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950"
                        >
                          <option value="passed">
                            Passed
                          </option>

                          <option value="partial_pass">
                            Partial Pass
                          </option>

                          <option value="failed">
                            Failed
                          </option>
                        </select>
                      </label>

                      <label className="grid gap-2 text-sm font-bold text-slate-700">
                        Completed Date & Time

                        <input
                          type="datetime-local"
                          value={completedAt}
                          onChange={(event) =>
                            setCompletedAt(
                              event.target
                                .value,
                            )
                          }
                          className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                        />
                      </label>

                      <label className="grid gap-2 text-sm font-bold text-slate-700 md:col-span-2">
                        Result Summary

                        <textarea
                          rows={4}
                          value={
                            resultSummary
                          }
                          onChange={(event) =>
                            setResultSummary(
                              event.target
                                .value,
                            )
                          }
                          className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                        />
                      </label>

                      <label className="grid gap-2 text-sm font-bold text-slate-700 md:col-span-2">
                        Corrections Required

                        <textarea
                          rows={4}
                          value={
                            correctionSummary
                          }
                          onChange={(event) =>
                            setCorrectionSummary(
                              event.target
                                .value,
                            )
                          }
                          className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                        />
                      </label>

                      <label className="grid gap-2 text-sm font-bold text-slate-700">
                        Inspection Report URLs

                        <textarea
                          rows={4}
                          value={documentUrls}
                          onChange={(event) =>
                            setDocumentUrls(
                              event.target
                                .value,
                            )
                          }
                          placeholder="One URL per line"
                          className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                        />
                      </label>

                      <label className="grid gap-2 text-sm font-bold text-slate-700">
                        Photo URLs

                        <textarea
                          rows={4}
                          value={photoUrls}
                          onChange={(event) =>
                            setPhotoUrls(
                              event.target
                                .value,
                            )
                          }
                          placeholder="One URL per line"
                          className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                        />
                      </label>
                    </div>

                    <label className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200 p-4">
                      <input
                        type="checkbox"
                        checked={
                          reinspectionRequired
                        }
                        onChange={(event) =>
                          setReinspectionRequired(
                            event.target
                              .checked,
                          )
                        }
                        className="mt-1 h-5 w-5"
                      />

                      <span className="font-bold text-slate-800">
                        Reinspection is
                        required
                      </span>
                    </label>

                    {reinspectionRequired && (
                      <label className="mt-4 grid max-w-sm gap-2 text-sm font-bold text-slate-700">
                        Reinspection Due Date

                        <input
                          type="date"
                          value={
                            reinspectionDueDate
                          }
                          onChange={(event) =>
                            setReinspectionDueDate(
                              event.target
                                .value,
                            )
                          }
                          className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                        />
                      </label>
                    )}

                    {resultStatus ===
                      "partial_pass" && (
                      <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h4 className="font-bold text-amber-950">
                              Area-Specific
                              Results
                            </h4>

                            <p className="mt-1 text-sm text-amber-900">
                              Identify which
                              areas may
                              continue and
                              which remain
                              blocked.
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={addArea}
                            className="rounded-xl bg-amber-900 px-4 py-3 text-sm font-bold text-white"
                          >
                            Add Area
                          </button>
                        </div>

                        <div className="mt-5 grid gap-4">
                          {areas.map(
                            (
                              area,
                              index,
                            ) => (
                              <div
                                key={
                                  area.id ??
                                  index
                                }
                                className="rounded-xl border border-amber-200 bg-white p-4"
                              >
                                <div className="grid gap-4 md:grid-cols-2">
                                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                                    Area Name

                                    <input
                                      required
                                      value={
                                        area.areaName
                                      }
                                      onChange={(
                                        event,
                                      ) =>
                                        updateArea(
                                          index,
                                          {
                                            areaName:
                                              event
                                                .target
                                                .value,
                                          },
                                        )
                                      }
                                      className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                                    />
                                  </label>

                                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                                    Area Result

                                    <select
                                      value={
                                        area.resultStatus
                                      }
                                      onChange={(
                                        event,
                                      ) =>
                                        updateArea(
                                          index,
                                          {
                                            resultStatus:
                                              event
                                                .target
                                                .value,
                                          },
                                        )
                                      }
                                      className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950"
                                    >
                                      <option value="passed">
                                        Passed
                                      </option>

                                      <option value="partial_pass">
                                        Partial Pass
                                      </option>

                                      <option value="failed">
                                        Failed
                                      </option>

                                      <option value="not_inspected">
                                        Not Inspected
                                      </option>

                                      <option value="not_applicable">
                                        Not Applicable
                                      </option>
                                    </select>
                                  </label>

                                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 md:col-span-2">
                                    <input
                                      type="checkbox"
                                      checked={
                                        area.workMayContinue
                                      }
                                      onChange={(
                                        event,
                                      ) =>
                                        updateArea(
                                          index,
                                          {
                                            workMayContinue:
                                              event
                                                .target
                                                .checked,
                                          },
                                        )
                                      }
                                      className="mt-1 h-5 w-5"
                                    />

                                    <span className="font-bold text-slate-800">
                                      Inspector
                                      released
                                      this area
                                      for work
                                      to continue
                                    </span>
                                  </label>

                                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                                    Blocked Reason

                                    <textarea
                                      rows={3}
                                      value={
                                        area.blockedReason ??
                                        ""
                                      }
                                      onChange={(
                                        event,
                                      ) =>
                                        updateArea(
                                          index,
                                          {
                                            blockedReason:
                                              event
                                                .target
                                                .value,
                                          },
                                        )
                                      }
                                      className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                                    />
                                  </label>

                                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                                    Correction Notes

                                    <textarea
                                      rows={3}
                                      value={
                                        area.correctionNotes ??
                                        ""
                                      }
                                      onChange={(
                                        event,
                                      ) =>
                                        updateArea(
                                          index,
                                          {
                                            correctionNotes:
                                              event
                                                .target
                                                .value,
                                          },
                                        )
                                      }
                                      className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                                    />
                                  </label>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    removeArea(
                                      index,
                                    )
                                  }
                                  className="mt-4 text-sm font-bold text-red-700"
                                >
                                  Remove Area
                                </button>
                              </div>
                            ),
                          )}
                        </div>
                      </section>
                    )}

                    <button
                      type="submit"
                      disabled={
                        savingId ===
                        inspection.id
                      }
                      className="mt-6 rounded-xl bg-blue-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {savingId ===
                      inspection.id
                        ? "Saving..."
                        : "Save Result for Contractor Review"}
                    </button>

                    <div className="mt-7 border-t border-slate-200 pt-6">
                      <h4 className="font-bold text-slate-950">
                        Result History
                      </h4>

                      <div className="mt-4 grid gap-3">
                        {(
                          resultHistory[
                            inspection.id
                          ] ?? []
                        ).map(
                          (
                            history,
                          ) => (
                            <article
                              key={
                                history.id
                              }
                              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="font-bold text-slate-950">
                                    {statusLabel(
                                      history.result_status,
                                    )}
                                  </p>

                                  <p className="mt-1 text-sm text-slate-600">
                                    {formatDateTime(
                                      history.completed_at,
                                    )}
                                  </p>

                                  {history.result_summary && (
                                    <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                                      {
                                        history.result_summary
                                      }
                                    </p>
                                  )}
                                </div>

                                {history.contractor_confirmed ? (
                                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                                    Confirmed
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={
                                      savingId ===
                                      history.id
                                    }
                                    onClick={() =>
                                      void confirmResult(
                                        inspection,
                                        history,
                                      )
                                    }
                                    className="rounded-xl bg-emerald-800 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                                  >
                                    Confirm Result
                                  </button>
                                )}
                              </div>
                            </article>
                          ),
                        )}
                      </div>
                    </div>
                  </form>
                )}
              </article>
            ),
          )
        )}
      </section>
    </main>
  );
}
