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

type Source = {
  id: string;
  source_title: string;
  source_url: string | null;
  source_type: string;
  source_authority_name: string | null;
  source_excerpt: string | null;
  is_primary_authority_source: boolean;
};

type Finding = {
  id: string;
  source_id: string | null;
  finding_title: string;
  finding_description: string | null;
  finding_type: string;
  requirement_status: string;
  inspection_category: string | null;
  confidence_level: string;
  contractor_review_status: string;
  contractor_review_notes: string | null;
  applied_requirement_id: string | null;
  applied_at: string | null;
};

type ResearchRun = {
  id: string;
  research_status: string;
  requested_address: string | null;
  requested_city: string | null;
  requested_county: string | null;
  requested_state_code: string | null;
  requested_postal_code: string | null;
  requested_municipality: string | null;
  requested_authority_name: string | null;
  requested_authority_type: string | null;
  requested_project_type: string | null;
  requested_permit_type: string | null;
  requested_scope_summary: string | null;
  detected_municipality: string | null;
  detected_county: string | null;
  detected_state_code: string | null;
  detected_authority_name: string | null;
  detected_authority_type: string | null;
  confidence_level: string | null;
  confidence_notes: string | null;
  research_summary: string | null;
  legal_disclaimer: string;
  completed_at: string | null;
  applied_at: string | null;
  failure_message: string | null;
  created_at: string;

  project_inspection_research_sources:
    Source[];

  project_inspection_research_findings:
    Finding[];
};

function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

export default function InspectionResearchPage({
  params,
}: PageProps) {
  const { projectId } =
    use(params);

  const {
    isEnabled,
    loading: featuresLoading,
  } = useFeatures();

  const [
    runs,
    setRuns,
  ] = useState<ResearchRun[]>([]);

  const [
    selectedRunId,
    setSelectedRunId,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    notice,
    setNotice,
  ] = useState("");

  const [
    address,
    setAddress,
  ] = useState("");

  const [
    city,
    setCity,
  ] = useState("");

  const [
    county,
    setCounty,
  ] = useState("");

  const [
    stateCode,
    setStateCode,
  ] = useState("");

  const [
    postalCode,
    setPostalCode,
  ] = useState("");

  const [
    municipality,
    setMunicipality,
  ] = useState("");

  const [
    authorityName,
    setAuthorityName,
  ] = useState("");

  const [
    authorityType,
    setAuthorityType,
  ] = useState("county");

  const [
    projectType,
    setProjectType,
  ] = useState("");

  const [
    permitType,
    setPermitType,
  ] = useState("");

  const [
    scopeSummary,
    setScopeSummary,
  ] = useState("");

  const [
    sourceTitle,
    setSourceTitle,
  ] = useState("");

  const [
    sourceUrl,
    setSourceUrl,
  ] = useState("");

  const [
    sourceExcerpt,
    setSourceExcerpt,
  ] = useState("");

  const [
    findingTitle,
    setFindingTitle,
  ] = useState("");

  const [
    findingDescription,
    setFindingDescription,
  ] = useState("");

  const [
    requirementStatus,
    setRequirementStatus,
  ] = useState("suggested");

  const [
    inspectionCategory,
    setInspectionCategory,
  ] = useState("general");

  const [
    findingSourceId,
    setFindingSourceId,
  ] = useState("");

  const selectedRun =
    useMemo(
      () =>
        runs.find(
          (run) =>
            run.id ===
            selectedRunId,
        ) ??
        runs[0] ??
        null,
      [runs, selectedRunId],
    );

  const loadResearch =
    useCallback(async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/projects/${projectId}/inspections/research`,
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
              address: string;
              city: string;
              county: string;
              stateCode: string;
              postalCode: string;
            };

            settings?: {
              municipality: string | null;
              county: string | null;
              stateCode: string | null;
              governingAuthorityName:
                string | null;
              governingAuthorityType:
                string | null;
              projectType: string | null;
              permitType: string | null;
              projectScopeSummary:
                string | null;
            } | null;

            researchRuns?: ResearchRun[];
          };

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.error ??
              "Could not load inspection research.",
          );
        }

        const project =
          result.project;

        const settings =
          result.settings;

        setAddress(
          project?.address ?? "",
        );

        setCity(
          project?.city ?? "",
        );

        setCounty(
          settings?.county ??
            project?.county ??
            "",
        );

        setStateCode(
          settings?.stateCode ??
            project?.stateCode ??
            "",
        );

        setPostalCode(
          project?.postalCode ?? "",
        );

        setMunicipality(
          settings?.municipality ??
            project?.city ??
            "",
        );

        setAuthorityName(
          settings
            ?.governingAuthorityName ??
            "",
        );

        setAuthorityType(
          settings
            ?.governingAuthorityType ??
            "county",
        );

        setProjectType(
          settings?.projectType ??
            "",
        );

        setPermitType(
          settings?.permitType ??
            "",
        );

        setScopeSummary(
          settings
            ?.projectScopeSummary ??
            "",
        );

        setRuns(
          result.researchRuns ?? [],
        );

        if (
          !selectedRunId &&
          result.researchRuns?.[0]
        ) {
          setSelectedRunId(
            result.researchRuns[0].id,
          );
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load inspection research.",
        );
      } finally {
        setLoading(false);
      }
    }, [
      projectId,
      selectedRunId,
    ]);

  useEffect(() => {
    void loadResearch();
  }, [loadResearch]);

  async function createRun(
    event: FormEvent,
  ) {
    event.preventDefault();

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/inspections/research`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            address,
            city,
            county,
            stateCode,
            postalCode,
            municipality,
            authorityName,
            authorityType,
            projectType,
            permitType,
            scopeSummary,
          }),
        },
      );

      const result =
        (await response.json()) as {
          success?: boolean;
          error?: string;

          researchRun?: {
            research_run_id?: string;
          };
        };

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "Could not create the research run.",
        );
      }

      setSelectedRunId(
        result.researchRun
          ?.research_run_id ?? "",
      );

      setNotice(
        "Municipality research run created.",
      );

      await loadResearch();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create the research run.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function runAction(
    action: string,
    payload:
      Record<string, unknown> = {},
  ) {
    if (!selectedRun) {
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/inspections/research/${selectedRun.id}`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action,
            ...payload,
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
            "Could not update the research run.",
        );
      }

      setNotice(
        action === "apply"
          ? "Reviewed research applied to the inspection checklist."
          : action === "complete"
            ? "Research marked ready for contractor review."
            : "Research record updated.",
      );

      await loadResearch();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Could not update the research run.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function addSource(
    event: FormEvent,
  ) {
    event.preventDefault();

    await runAction(
      "add_source",
      {
        sourceType:
          authorityType === "county"
            ? "county_website"
            : "municipality_website",

        sourceTitle,
        sourceUrl,
        sourceAuthorityName:
          authorityName,
        sourceExcerpt,
        isPrimaryAuthoritySource:
          true,
      },
    );

    setSourceTitle("");
    setSourceUrl("");
    setSourceExcerpt("");
  }

  async function addFinding(
    event: FormEvent,
  ) {
    event.preventDefault();

    await runAction(
      "add_finding",
      {
        sourceId:
          findingSourceId || null,

        findingType:
          "inspection_requirement",

        findingTitle,

        findingDescription,

        requirementStatus,

        inspectionCategory,

        confidenceLevel:
          "medium",
      },
    );

    setFindingTitle("");
    setFindingDescription("");
    setFindingSourceId("");
  }

  async function reviewFinding(
    finding: Finding,
    reviewStatus:
      | "accepted"
      | "rejected"
      | "needs_verification",
  ) {
    await runAction(
      "review_finding",
      {
        findingId:
          finding.id,

        reviewStatus,

        reviewNotes:
          reviewStatus ===
          "needs_verification"
            ? window.prompt(
                "What must be verified with the authority?",
                finding
                  .contractor_review_notes ??
                  "",
              ) ?? ""
            : null,
      },
    );
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
      "inspection_municipality_research",
    )
  ) {
    return (
      <FeatureDisabled
        title="Municipality Research Disabled"
        description="Municipality inspection research is disabled for this account."
        backHref={`/operations/projects/${projectId}/inspections`}
        backLabel="Return to Inspection Checklist"
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
        href={`/operations/projects/${projectId}/inspections`}
        className="text-sm font-bold text-blue-800"
      >
        ← Inspection Checklist
      </Link>

      <p className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">
        Researched Guidance
      </p>

      <h1 className="mt-2 text-3xl font-black text-slate-950">
        Municipality Inspection Research
      </h1>

      <p className="mt-2 max-w-3xl text-slate-600">
        Record governing-authority sources,
        proposed inspection requirements,
        and the contractor’s final review
        before applying anything to the
        project checklist.
      </p>

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

      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">
          Start New Research
        </h2>

        <form
          onSubmit={createRun}
          className="mt-5 grid gap-4 md:grid-cols-2"
        >
          {[
            [
              "Project Address",
              address,
              setAddress,
            ],
            [
              "City",
              city,
              setCity,
            ],
            [
              "County",
              county,
              setCounty,
            ],
            [
              "State",
              stateCode,
              setStateCode,
            ],
            [
              "Postal Code",
              postalCode,
              setPostalCode,
            ],
            [
              "Municipality",
              municipality,
              setMunicipality,
            ],
            [
              "Authority Name",
              authorityName,
              setAuthorityName,
            ],
            [
              "Project Type",
              projectType,
              setProjectType,
            ],
            [
              "Permit Type",
              permitType,
              setPermitType,
            ],
          ].map(
            ([
              name,
              value,
              setter,
            ]) => (
              <label
                key={String(name)}
                className="grid gap-2 text-sm font-bold text-slate-700"
              >
                {String(name)}

                <input
                  value={String(value)}
                  onChange={(event) =>
                    (
                      setter as (
                        value: string,
                      ) => void
                    )(
                      event.target.value,
                    )
                  }
                  className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                />
              </label>
            ),
          )}

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Authority Type

            <select
              value={authorityType}
              onChange={(event) =>
                setAuthorityType(
                  event.target.value,
                )
              }
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950"
            >
              <option value="city">
                City
              </option>

              <option value="county">
                County
              </option>

              <option value="state">
                State
              </option>

              <option value="special_district">
                Special District
              </option>

              <option value="other">
                Other
              </option>
            </select>
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700 md:col-span-2">
            Scope Summary

            <textarea
              rows={5}
              value={scopeSummary}
              onChange={(event) =>
                setScopeSummary(
                  event.target.value,
                )
              }
              className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
            />
          </label>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-blue-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              Create Research Run
            </button>
          </div>
        </form>
      </section>

      {runs.length > 0 && (
        <section className="mt-7">
          <label className="grid max-w-xl gap-2 text-sm font-bold text-slate-700">
            Research Run

            <select
              value={
                selectedRun?.id ?? ""
              }
              onChange={(event) =>
                setSelectedRunId(
                  event.target.value,
                )
              }
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950"
            >
              {runs.map((run) => (
                <option
                  key={run.id}
                  value={run.id}
                >
                  {label(
                    run.research_status,
                  )}{" "}
                  ·{" "}
                  {new Date(
                    run.created_at,
                  ).toLocaleDateString()}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      {selectedRun && (
        <>
          <section className="mt-7 rounded-2xl border border-indigo-200 bg-indigo-50 p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">
                  {label(
                    selectedRun.research_status,
                  )}
                </p>

                <h2 className="mt-2 text-xl font-bold text-indigo-950">
                  {selectedRun.detected_authority_name ??
                    selectedRun.requested_authority_name ??
                    "Governing authority research"}
                </h2>

                <p className="mt-3 max-w-3xl text-sm leading-6 text-indigo-900">
                  {
                    selectedRun.legal_disclaimer
                  }
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  "queued",
                  "researching",
                  "draft",
                ].includes(
                  selectedRun.research_status,
                ) && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      void runAction(
                        "complete",
                        {
                          detectedMunicipality:
                            municipality,

                          detectedCounty:
                            county,

                          detectedStateCode:
                            stateCode,

                          detectedAuthorityName:
                            authorityName,

                          detectedAuthorityType:
                            authorityType,

                          confidenceLevel:
                            "medium",

                          researchSummary:
                            `Research completed for ${authorityName || municipality || county}. Contractor review is required before applying the findings.`,
                        },
                      )
                    }
                    className="rounded-xl bg-indigo-900 px-4 py-3 text-sm font-bold text-white"
                  >
                    Mark Ready for Review
                  </button>
                )}

                {[
                  "review_required",
                  "completed",
                ].includes(
                  selectedRun.research_status,
                ) &&
                  !selectedRun.applied_at && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        void runAction(
                          "apply",
                        )
                      }
                      className="rounded-xl bg-emerald-800 px-4 py-3 text-sm font-bold text-white"
                    >
                      Apply Reviewed Findings
                    </button>
                  )}
              </div>
            </div>
          </section>

          <section className="mt-7 grid gap-6 lg:grid-cols-2">
            <form
              onSubmit={addSource}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-xl font-bold text-slate-950">
                Add Research Source
              </h2>

              <div className="mt-5 grid gap-4">
                <input
                  required
                  value={sourceTitle}
                  onChange={(event) =>
                    setSourceTitle(
                      event.target.value,
                    )
                  }
                  placeholder="Source title"
                  className="rounded-xl border border-slate-300 px-4 py-3"
                />

                <input
                  value={sourceUrl}
                  onChange={(event) =>
                    setSourceUrl(
                      event.target.value,
                    )
                  }
                  placeholder="Source URL"
                  className="rounded-xl border border-slate-300 px-4 py-3"
                />

                <textarea
                  rows={4}
                  value={sourceExcerpt}
                  onChange={(event) =>
                    setSourceExcerpt(
                      event.target.value,
                    )
                  }
                  placeholder="Relevant excerpt or notes"
                  className="rounded-xl border border-slate-300 px-4 py-3"
                />

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-blue-950 px-4 py-3 font-bold text-white"
                >
                  Add Source
                </button>
              </div>
            </form>

            <form
              onSubmit={addFinding}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-xl font-bold text-slate-950">
                Add Proposed Inspection
              </h2>

              <div className="mt-5 grid gap-4">
                <select
                  value={findingSourceId}
                  onChange={(event) =>
                    setFindingSourceId(
                      event.target.value,
                    )
                  }
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3"
                >
                  <option value="">
                    No linked source
                  </option>

                  {selectedRun
                    .project_inspection_research_sources
                    .map((source) => (
                      <option
                        key={source.id}
                        value={source.id}
                      >
                        {source.source_title}
                      </option>
                    ))}
                </select>

                <input
                  required
                  value={findingTitle}
                  onChange={(event) =>
                    setFindingTitle(
                      event.target.value,
                    )
                  }
                  placeholder="Inspection name"
                  className="rounded-xl border border-slate-300 px-4 py-3"
                />

                <textarea
                  rows={4}
                  value={findingDescription}
                  onChange={(event) =>
                    setFindingDescription(
                      event.target.value,
                    )
                  }
                  placeholder="Requirement details"
                  className="rounded-xl border border-slate-300 px-4 py-3"
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <select
                    value={
                      requirementStatus
                    }
                    onChange={(event) =>
                      setRequirementStatus(
                        event.target.value,
                      )
                    }
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3"
                  >
                    <option value="required">
                      Required
                    </option>

                    <option value="suggested">
                      Suggested
                    </option>

                    <option value="conditional">
                      Conditional
                    </option>

                    <option value="not_required">
                      Not Required
                    </option>

                    <option value="unknown">
                      Unknown
                    </option>
                  </select>

                  <input
                    value={
                      inspectionCategory
                    }
                    onChange={(event) =>
                      setInspectionCategory(
                        event.target.value,
                      )
                    }
                    placeholder="Category"
                    className="rounded-xl border border-slate-300 px-4 py-3"
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-blue-950 px-4 py-3 font-bold text-white"
                >
                  Add Finding
                </button>
              </div>
            </form>
          </section>

          <section className="mt-7">
            <h2 className="text-xl font-bold text-slate-950">
              Proposed Inspection Findings
            </h2>

            <div className="mt-4 grid gap-4">
              {selectedRun
                .project_inspection_research_findings
                .length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">
                  No inspection findings
                  have been added.
                </div>
              ) : (
                selectedRun
                  .project_inspection_research_findings
                  .map((finding) => (
                    <article
                      key={finding.id}
                      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                    >
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">
                              {label(
                                finding.requirement_status,
                              )}
                            </span>

                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                              {label(
                                finding.contractor_review_status,
                              )}
                            </span>

                            {finding.applied_at && (
                              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                                Applied
                              </span>
                            )}
                          </div>

                          <h3 className="mt-3 text-lg font-bold text-slate-950">
                            {
                              finding.finding_title
                            }
                          </h3>

                          {finding.finding_description && (
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                              {
                                finding.finding_description
                              }
                            </p>
                          )}
                        </div>

                        {!finding.applied_at && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                void reviewFinding(
                                  finding,
                                  "accepted",
                                )
                              }
                              className="rounded-xl bg-emerald-800 px-4 py-3 text-sm font-bold text-white"
                            >
                              Accept
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                void reviewFinding(
                                  finding,
                                  "needs_verification",
                                )
                              }
                              className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800"
                            >
                              Verify with Authority
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                void reviewFinding(
                                  finding,
                                  "rejected",
                                )
                              }
                              className="rounded-xl border border-red-300 bg-white px-4 py-3 text-sm font-bold text-red-700"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  ))
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
