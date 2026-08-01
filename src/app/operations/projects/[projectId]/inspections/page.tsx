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

type ContractorDecision =
  | "unreviewed"
  | "required"
  | "not_required"
  | "verify_with_authority";

type Requirement = {
  id: string;
  inspectionName: string;
  inspectionCategory: string;
  description: string | null;
  sourceType: string;
  researchedRequirementStatus: string;
  contractorDecision: ContractorDecision;
  contractorNotes: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  sourceExcerpt: string | null;
  sourceLastVerifiedAt: string | null;
  sortOrder: number;
  isCustom: boolean;
  reviewedAt: string | null;
};

type Settings = {
  inspectionMode: string;
  inspectionsEnabled: boolean;
  municipalityResearchEnabled: boolean;
  governingAuthorityName: string | null;
  municipality: string | null;
  county: string | null;
  stateCode: string | null;
  researchedAt: string | null;
  researchSourceSummary: string | null;
  researchSources: unknown[];
  contractorVerifiedAt: string | null;
  contractorVerificationText: string | null;
  checklistLockedAt: string | null;
};

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

function decisionLabel(
  decision: ContractorDecision,
) {
  switch (decision) {
    case "required":
      return "Required";

    case "not_required":
      return "Not Required";

    case "verify_with_authority":
      return "Verify with Authority";

    default:
      return "Unreviewed";
  }
}

export default function InspectionChecklistPage({
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
    settings,
    setSettings,
  ] = useState<Settings | null>(
    null,
  );

  const [
    requirements,
    setRequirements,
  ] = useState<Requirement[]>(
    [],
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    savingId,
    setSavingId,
  ] = useState("");

  const [
    deletingId,
    setDeletingId,
  ] = useState("");

  const [
    creating,
    setCreating,
  ] = useState(false);

  const [
    verifying,
    setVerifying,
  ] = useState(false);

  const [
    activating,
    setActivating,
  ] = useState(false);

  const [
    reopening,
    setReopening,
  ] = useState(false);

  const [
    workflowActivatedAt,
    setWorkflowActivatedAt,
  ] = useState<string | null>(
    null,
  );

  const [
    inspectionSummary,
    setInspectionSummary,
  ] = useState<Record<
    string,
    number
  >>({});

  const [
    error,
    setError,
  ] = useState("");

  const [
    notice,
    setNotice,
  ] = useState("");

  const [
    customName,
    setCustomName,
  ] = useState("");

  const [
    customCategory,
    setCustomCategory,
  ] = useState("general");

  const [
    customDescription,
    setCustomDescription,
  ] = useState("");

  const [
    verificationChecked,
    setVerificationChecked,
  ] = useState(false);

  const [
    verificationText,
    setVerificationText,
  ] = useState(
    "I have reviewed the researched guidance and confirm that this checklist reflects the inspections required for this project.",
  );

  const loadChecklist =
    useCallback(async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/projects/${projectId}/inspection-requirements`,
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

            settings?: Settings;

            requirements?: Requirement[];
          };

        if (
          !response.ok ||
          !result.success ||
          !result.project ||
          !result.settings
        ) {
          throw new Error(
            result.error ??
              "Could not load the inspection checklist.",
          );
        }

        setProjectName(
          result.project.name,
        );

        setProjectAddress(
          result.project.address,
        );

        setSettings(
          result.settings,
        );

        setRequirements(
          result.requirements ?? [],
        );

        try {
          const workflowResponse =
            await fetch(
              `/api/projects/${projectId}/inspections/workflow`,
              {
                credentials:
                  "include",
                cache:
                  "no-store",
              },
            );

          const workflowResult =
            (await workflowResponse.json()) as {
              success?: boolean;

              workflow?: {
                workflowActivatedAt:
                  string | null;
              };

              summary?: Record<
                string,
                number
              >;
            };

          if (
            workflowResponse.ok &&
            workflowResult.success
          ) {
            setWorkflowActivatedAt(
              workflowResult.workflow
                ?.workflowActivatedAt ??
                null,
            );

            setInspectionSummary(
              workflowResult.summary ??
                {},
            );
          }
        } catch {
          setWorkflowActivatedAt(
            null,
          );
        }

        if (
          result.settings
            .contractorVerificationText
        ) {
          setVerificationText(
            result.settings
              .contractorVerificationText,
          );
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load the inspection checklist.",
        );
      } finally {
        setLoading(false);
      }
    }, [projectId]);

  useEffect(() => {
    void loadChecklist();
  }, [loadChecklist]);

  const unresolvedRequirements =
    useMemo(
      () =>
        requirements.filter(
          (requirement) =>
            [
              "unreviewed",
              "verify_with_authority",
            ].includes(
              requirement.contractorDecision,
            ),
        ),
      [requirements],
    );

  const requiredCount =
    requirements.filter(
      (requirement) =>
        requirement.contractorDecision ===
        "required",
    ).length;

  const isLocked =
    Boolean(
      settings?.checklistLockedAt,
    );

  async function updateRequirement(
    requirement: Requirement,
    contractorDecision: ContractorDecision,
    contractorNotes =
      requirement.contractorNotes ?? "",
  ) {
    setSavingId(requirement.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/inspection-requirements`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            requirementId:
              requirement.id,

            contractorDecision,

            contractorNotes,
          }),
        },
      );

      const result =
        (await response.json()) as {
          success?: boolean;
          error?: string;
          requirement?: Requirement;
        };

      if (
        !response.ok ||
        !result.success ||
        !result.requirement
      ) {
        throw new Error(
          result.error ??
            "Could not update the inspection requirement.",
        );
      }

      setRequirements(
        (current) =>
          current.map((item) =>
            item.id ===
            requirement.id
              ? result.requirement!
              : item,
          ),
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not update the inspection requirement.",
      );
    } finally {
      setSavingId("");
    }
  }

  async function createCustomRequirement(
    event: FormEvent,
  ) {
    event.preventDefault();

    setCreating(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/inspection-requirements`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            inspectionName:
              customName,

            inspectionCategory:
              customCategory,

            description:
              customDescription,

            contractorDecision:
              "required",

            sortOrder:
              requirements.length +
              1000,
          }),
        },
      );

      const result =
        (await response.json()) as {
          success?: boolean;
          error?: string;
          requirement?: Requirement;
        };

      if (
        !response.ok ||
        !result.success ||
        !result.requirement
      ) {
        throw new Error(
          result.error ??
            "Could not add the inspection requirement.",
        );
      }

      setRequirements(
        (current) => [
          ...current,
          result.requirement!,
        ],
      );

      setCustomName("");
      setCustomCategory(
        "general",
      );
      setCustomDescription("");

      setNotice(
        "Custom inspection added.",
      );
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not add the inspection requirement.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function deleteRequirement(
    requirement: Requirement,
  ) {
    const confirmed =
      window.confirm(
        `Delete the custom inspection "${requirement.inspectionName}"?`,
      );

    if (!confirmed) {
      return;
    }

    setDeletingId(
      requirement.id,
    );
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/inspection-requirements?requirementId=${requirement.id}`,
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
            "Could not delete the inspection requirement.",
        );
      }

      setRequirements(
        (current) =>
          current.filter(
            (item) =>
              item.id !==
              requirement.id,
          ),
      );

      setNotice(
        "Custom inspection deleted.",
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete the inspection requirement.",
      );
    } finally {
      setDeletingId("");
    }
  }

  async function activateWorkflow() {
    setActivating(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/inspections/workflow`,
        {
          method: "POST",
          credentials: "include",
        },
      );

      const result =
        (await response.json()) as {
          success?: boolean;
          error?: string;

          workflow?: {
            created_inspection_count?: number;
            total_inspection_count?: number;
            workflow_activated_at?: string;
          };
        };

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "Could not activate the inspection workflow.",
        );
      }

      setWorkflowActivatedAt(
        result.workflow
          ?.workflow_activated_at ??
          new Date().toISOString(),
      );

      setNotice(
        `Inspection workflow activated with ${
          result.workflow
            ?.total_inspection_count ??
          requiredCount
        } required inspection${
          (
            result.workflow
              ?.total_inspection_count ??
            requiredCount
          ) === 1
            ? ""
            : "s"
        }.`,
      );

      await loadChecklist();
    } catch (activateError) {
      setError(
        activateError instanceof Error
          ? activateError.message
          : "Could not activate the inspection workflow.",
      );
    } finally {
      setActivating(false);
    }
  }

  async function reopenChecklist() {
    const reason =
      window.prompt(
        "Why are you reopening this verified inspection checklist?",
      )?.trim() ?? "";

    if (!reason) {
      return;
    }

    setReopening(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/inspections/checklist/reopen`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            reason,
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
            "Could not reopen the checklist.",
        );
      }

      setWorkflowActivatedAt(
        null,
      );

      setVerificationChecked(
        false,
      );

      setNotice(
        "Inspection checklist reopened.",
      );

      await loadChecklist();
    } catch (reopenError) {
      setError(
        reopenError instanceof Error
          ? reopenError.message
          : "Could not reopen the checklist.",
      );
    } finally {
      setReopening(false);
    }
  }

  async function verifyChecklist() {
    if (
      !verificationChecked
    ) {
      setError(
        "You must acknowledge the contractor verification before continuing.",
      );
      return;
    }

    setVerifying(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/inspection-requirements/verify`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            verificationText,
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
            "Could not verify the inspection checklist.",
        );
      }

      setNotice(
        "Inspection checklist verified and locked.",
      );

      await loadChecklist();
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "Could not verify the inspection checklist.",
      );
    } finally {
      setVerifying(false);
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

  if (
    settings &&
    !settings.inspectionsEnabled
  ) {
    return (
      <FeatureDisabled
        title="Project Inspections Disabled"
        description="This project is configured as not requiring inspections."
        backHref={`/operations/projects/${projectId}/inspections/setup`}
        backLabel="Review Inspection Setup"
      />
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link
            href={`/operations/projects/${projectId}/inspections/setup`}
            className="text-sm font-bold text-blue-800"
          >
            ← Inspection Setup
          </Link>

          <p className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">
            Contractor Verification
          </p>

          <h1 className="mt-2 text-3xl font-black text-slate-950">
            Inspection Checklist
          </h1>

          <p className="mt-2 text-slate-600">
            {projectName}
            {projectAddress
              ? ` · ${projectAddress}`
              : ""}
          </p>
        </div>

        <Link
          href={`/operations/projects/${projectId}/inspections/setup`}
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-bold text-slate-800"
        >
          Edit Inspection Setup
        </Link>

        {isEnabled(
          "inspection_municipality_research",
        ) && (
          <Link
            href={`/operations/projects/${projectId}/inspections/research`}
            className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-3 text-center text-sm font-bold text-indigo-800"
          >
            Municipality Research
          </Link>
        )}
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

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Proposed Inspections
          </p>

          <p className="mt-3 text-3xl font-black text-slate-950">
            {requirements.length}
          </p>
        </article>

        <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
            Confirmed Required
          </p>

          <p className="mt-3 text-3xl font-black text-emerald-950">
            {requiredCount}
          </p>
        </article>

        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
            Needs Review
          </p>

          <p className="mt-3 text-3xl font-black text-amber-950">
            {
              unresolvedRequirements.length
            }
          </p>
        </article>

        <article className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
            Checklist Status
          </p>

          <p className="mt-3 text-xl font-black text-blue-950">
            {isLocked
              ? "Verified"
              : "Draft"}
          </p>

          {settings?.contractorVerifiedAt && (
            <p className="mt-2 text-sm text-blue-800">
              {formatDate(
                settings
                  .contractorVerifiedAt,
              )}
            </p>
          )}
        </article>
      </section>

      {settings?.municipalityResearchEnabled && (
        <section className="mt-7 rounded-2xl border border-indigo-200 bg-indigo-50 p-6">
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">
            Researched Guidance
          </p>

          <h2 className="mt-2 text-xl font-bold text-indigo-950">
            {settings.governingAuthorityName ??
              ([
                  settings.municipality,
                  settings.county,
                  settings.stateCode,
                ]
                  .filter(Boolean)
                  .join(", ") ||
                "Governing authority")}
          </h2>

          <p className="mt-3 text-sm leading-6 text-indigo-900">
            {settings.researchSourceSummary ??
              "The checklist below is researched guidance only. The contractor must confirm every inspection before schedule dependencies become active."}
          </p>

          {settings.researchedAt && (
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-indigo-700">
              Last researched{" "}
              {formatDate(
                settings.researchedAt,
              )}
            </p>
          )}
        </section>
      )}

      <section className="mt-7 grid gap-4">
        {requirements.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-900">
            No inspection requirements
            have been added yet.
          </div>
        ) : (
          requirements.map(
            (requirement) => (
              <article
                key={requirement.id}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize text-slate-700">
                        {requirement.inspectionCategory.replaceAll(
                          "_",
                          " ",
                        )}
                      </span>

                      <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold capitalize text-indigo-800">
                        {requirement.sourceType.replaceAll(
                          "_",
                          " ",
                        )}
                      </span>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          requirement.contractorDecision ===
                          "required"
                            ? "bg-emerald-100 text-emerald-800"
                            : requirement.contractorDecision ===
                                "not_required"
                              ? "bg-slate-200 text-slate-700"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {decisionLabel(
                          requirement.contractorDecision,
                        )}
                      </span>
                    </div>

                    <h2 className="mt-3 text-xl font-bold text-slate-950">
                      {
                        requirement.inspectionName
                      }
                    </h2>

                    {requirement.description && (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                        {
                          requirement.description
                        }
                      </p>
                    )}

                    {requirement.sourceExcerpt && (
                      <blockquote className="mt-4 border-l-4 border-indigo-300 bg-indigo-50 px-4 py-3 text-sm leading-6 text-indigo-900">
                        {
                          requirement.sourceExcerpt
                        }
                      </blockquote>
                    )}

                    {requirement.sourceTitle && (
                      <p className="mt-3 text-xs font-semibold text-slate-500">
                        Source:{" "}
                        {
                          requirement.sourceTitle
                        }
                        {requirement.sourceLastVerifiedAt
                          ? ` · Verified ${formatDate(requirement.sourceLastVerifiedAt)}`
                          : ""}
                      </p>
                    )}
                  </div>

                  {!isLocked && (
                    <div className="grid min-w-64 gap-2">
                      {[
                        [
                          "required",
                          "Required",
                        ],
                        [
                          "not_required",
                          "Not Required",
                        ],
                        [
                          "verify_with_authority",
                          "Verify with Authority",
                        ],
                      ].map(
                        ([
                          value,
                          label,
                        ]) => (
                          <button
                            key={value}
                            type="button"
                            disabled={
                              savingId ===
                              requirement.id
                            }
                            onClick={() =>
                              void updateRequirement(
                                requirement,
                                value as ContractorDecision,
                              )
                            }
                            className={`rounded-xl border px-4 py-3 text-left text-sm font-bold disabled:opacity-50 ${
                              requirement.contractorDecision ===
                              value
                                ? "border-blue-600 bg-blue-50 text-blue-900"
                                : "border-slate-300 bg-white text-slate-700"
                            }`}
                          >
                            {label}
                          </button>
                        ),
                      )}

                      {requirement.isCustom && (
                        <button
                          type="button"
                          disabled={
                            deletingId ===
                            requirement.id
                          }
                          onClick={() =>
                            void deleteRequirement(
                              requirement,
                            )
                          }
                          className="rounded-xl border border-red-300 bg-white px-4 py-3 text-left text-sm font-bold text-red-700 disabled:opacity-50"
                        >
                          {deletingId ===
                          requirement.id
                            ? "Deleting..."
                            : "Delete Custom Inspection"}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {!isLocked && (
                  <label className="mt-5 grid gap-2 text-sm font-bold text-slate-700">
                    Contractor Notes

                    <textarea
                      rows={3}
                      defaultValue={
                        requirement.contractorNotes ??
                        ""
                      }
                      onBlur={(event) =>
                        void updateRequirement(
                          requirement,
                          requirement.contractorDecision,
                          event.target.value,
                        )
                      }
                      placeholder="Document calls, permit notes, exceptions, or authority confirmation."
                      className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                    />
                  </label>
                )}
              </article>
            ),
          )
        )}
      </section>

      {!isLocked && (
        <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-950">
            Add Custom Inspection
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            Add inspections identified
            by the contractor, permit
            office, plan reviewer, or
            inspector.
          </p>

          <form
            onSubmit={
              createCustomRequirement
            }
            className="mt-5 grid gap-4 md:grid-cols-2"
          >
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Inspection Name

              <input
                required
                value={customName}
                onChange={(event) =>
                  setCustomName(
                    event.target.value,
                  )
                }
                className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Category

              <input
                value={customCategory}
                onChange={(event) =>
                  setCustomCategory(
                    event.target.value,
                  )
                }
                placeholder="building, electrical, plumbing"
                className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-700 md:col-span-2">
              Description

              <textarea
                rows={4}
                value={customDescription}
                onChange={(event) =>
                  setCustomDescription(
                    event.target.value,
                  )
                }
                className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
              />
            </label>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={creating}
                className="rounded-xl bg-blue-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {creating
                  ? "Adding..."
                  : "Add Required Inspection"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="mt-7 rounded-2xl border border-blue-200 bg-blue-50 p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
          Contractor Final Decision
        </p>

        {isLocked ? (
          <>
            <h2 className="mt-2 text-xl font-bold text-blue-950">
              Checklist Verified
            </h2>

            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-blue-900">
              {settings
                ?.contractorVerificationText}
            </p>

            <p className="mt-3 text-sm font-semibold text-blue-800">
              Verified{" "}
              {formatDate(
                settings
                  ?.contractorVerifiedAt ??
                  null,
              )}
            </p>

            {workflowActivatedAt ? (
              <>
                <div className="mt-5 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                  Workflow Active
                </p>

                <p className="mt-2 font-bold text-emerald-950">
                  Inspection schedule controls activated{" "}
                  {formatDate(
                    workflowActivatedAt,
                  )}
                </p>

                <p className="mt-2 text-sm text-emerald-900">
                  {Number(
                    inspectionSummary
                      .total_count ?? 0,
                  )}{" "}
                  inspection
                  {Number(
                    inspectionSummary
                      .total_count ?? 0,
                  ) === 1
                    ? ""
                    : "s"}{" "}
                  are currently in the
                  workflow.
                </p>
              </div>

                <Link
                  href={`/operations/projects/${projectId}/inspections/manage`}
                  className="mt-4 inline-flex rounded-xl bg-emerald-800 px-5 py-3 text-sm font-bold text-white"
                >
                  Open Active Inspections
                </Link>
              </>
            ) : (
              <button
                type="button"
                disabled={activating}
                onClick={() =>
                  void activateWorkflow()
                }
                className="mt-5 rounded-xl bg-emerald-800 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {activating
                  ? "Activating..."
                  : "Activate Inspection Workflow"}
              </button>
            )}

            <button
              type="button"
              disabled={
                reopening ||
                Number(
                  inspectionSummary
                    .passed_count ?? 0,
                ) > 0 ||
                Number(
                  inspectionSummary
                    .partial_pass_count ??
                    0,
                ) > 0 ||
                Number(
                  inspectionSummary
                    .failed_count ?? 0,
                ) > 0
              }
              onClick={() =>
                void reopenChecklist()
              }
              className="mt-3 rounded-xl border border-amber-300 bg-white px-5 py-3 text-sm font-bold text-amber-800 disabled:opacity-50"
            >
              {reopening
                ? "Reopening..."
                : "Reopen Checklist"}
            </button>
          </>
        ) : (
          <>
            <h2 className="mt-2 text-xl font-bold text-blue-950">
              Verify Before Schedule Controls Activate
            </h2>

            <p className="mt-3 text-sm leading-6 text-blue-900">
              Researched guidance does
              not become a project
              requirement until the
              contractor reviews every
              item and confirms this
              checklist.
            </p>

            {unresolvedRequirements.length >
              0 && (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                {
                  unresolvedRequirements.length
                }{" "}
                inspection requirement
                {unresolvedRequirements.length ===
                1
                  ? ""
                  : "s"}{" "}
                still need a final
                decision.
              </div>
            )}

            <label className="mt-5 flex items-start gap-3 rounded-xl border border-blue-200 bg-white p-4">
              <input
                type="checkbox"
                checked={
                  verificationChecked
                }
                onChange={(event) =>
                  setVerificationChecked(
                    event.target.checked,
                  )
                }
                className="mt-1 h-5 w-5 rounded border-slate-300"
              />

              <span className="text-sm font-semibold leading-6 text-slate-800">
                {verificationText}
              </span>
            </label>

            <button
              type="button"
              disabled={
                verifying ||
                unresolvedRequirements.length >
                  0 ||
                !verificationChecked
              }
              onClick={() =>
                void verifyChecklist()
              }
              className="mt-5 rounded-xl bg-blue-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {verifying
                ? "Verifying..."
                : "Confirm & Lock Inspection Checklist"}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
