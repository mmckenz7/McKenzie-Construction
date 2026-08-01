"use client";

import Link from "next/link";
import {
  FormEvent,
  use,
  useEffect,
  useState,
} from "react";

import FeatureDisabled from "@/components/features/feature-disabled";
import { useFeatures } from "@/components/features/use-features";

type PageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

type Project = {
  id: string;
  name: string;
  address: string;
  city: string;
  county: string;
  state: string;
};

type InspectionMode =
  | "required"
  | "not_required"
  | "determine";

export default function InspectionSetupPage({
  params,
}: PageProps) {
  const { projectId } =
    use(params);

  const {
    isEnabled,
    loading: featuresLoading,
  } = useFeatures();

  const [
    project,
    setProject,
  ] = useState<Project | null>(
    null,
  );

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
    inspectionMode,
    setInspectionMode,
  ] = useState<InspectionMode>(
    "determine",
  );

  const [
    municipalityResearchEnabled,
    setMunicipalityResearchEnabled,
  ] = useState(true);

  const [
    scheduleDependenciesEnabled,
    setScheduleDependenciesEnabled,
  ] = useState(true);

  const [
    documentExtractionEnabled,
    setDocumentExtractionEnabled,
  ] = useState(true);

  const [
    partialPassEnabled,
    setPartialPassEnabled,
  ] = useState(true);

  const [
    authorityName,
    setAuthorityName,
  ] = useState("");

  const [
    authorityType,
    setAuthorityType,
  ] = useState("");

  const [
    municipality,
    setMunicipality,
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
    permitNumber,
    setPermitNumber,
  ] = useState("");

  const [
    permitType,
    setPermitType,
  ] = useState("");

  const [
    projectType,
    setProjectType,
  ] = useState("");

  const [
    scopeSummary,
    setScopeSummary,
  ] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/projects/${projectId}/inspection-settings`,
          {
            credentials: "include",
            cache: "no-store",
          },
        );

        const result =
          (await response.json()) as {
            success?: boolean;
            error?: string;
            project?: Project;

            settings?: {
              inspectionMode: InspectionMode;
              municipalityResearchEnabled: boolean;
              scheduleDependenciesEnabled: boolean;
              documentExtractionEnabled: boolean;
              partialPassEnabled: boolean;
              governingAuthorityName: string | null;
              governingAuthorityType: string | null;
              municipality: string | null;
              county: string | null;
              stateCode: string | null;
              permitNumber: string | null;
              permitType: string | null;
              projectType: string | null;
              projectScopeSummary: string | null;
            } | null;
          };

        if (
          !response.ok ||
          !result.success ||
          !result.project
        ) {
          throw new Error(
            result.error ??
              "Could not load inspection settings.",
          );
        }

        if (cancelled) {
          return;
        }

        setProject(result.project);

        const settings =
          result.settings;

        if (settings) {
          setInspectionMode(
            settings.inspectionMode,
          );

          setMunicipalityResearchEnabled(
            settings
              .municipalityResearchEnabled,
          );

          setScheduleDependenciesEnabled(
            settings
              .scheduleDependenciesEnabled,
          );

          setDocumentExtractionEnabled(
            settings
              .documentExtractionEnabled,
          );

          setPartialPassEnabled(
            settings
              .partialPassEnabled,
          );

          setAuthorityName(
            settings
              .governingAuthorityName ??
              "",
          );

          setAuthorityType(
            settings
              .governingAuthorityType ??
              "",
          );

          setMunicipality(
            settings.municipality ??
              result.project.city ??
              "",
          );

          setCounty(
            settings.county ??
              result.project.county ??
              "",
          );

          setStateCode(
            settings.stateCode ??
              result.project.state ??
              "",
          );

          setPermitNumber(
            settings.permitNumber ??
              "",
          );

          setPermitType(
            settings.permitType ??
              "",
          );

          setProjectType(
            settings.projectType ??
              "",
          );

          setScopeSummary(
            settings
              .projectScopeSummary ??
              "",
          );
        } else {
          setMunicipality(
            result.project.city ??
              "",
          );

          setCounty(
            result.project.county ??
              "",
          );

          setStateCode(
            result.project.state ??
              "",
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load inspection settings.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function saveSettings(
    event: FormEvent,
  ) {
    event.preventDefault();

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/inspection-settings`,
        {
          method: "PUT",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            inspectionMode,

            inspectionsEnabled:
              inspectionMode !==
              "not_required",

            municipalityResearchEnabled,

            scheduleDependenciesEnabled,

            documentExtractionEnabled,

            partialPassEnabled,

            governingAuthorityName:
              authorityName,

            governingAuthorityType:
              authorityType,

            municipality,

            county,

            stateCode,

            permitNumber,

            permitType,

            projectType,

            projectScopeSummary:
              scopeSummary,
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
            "Could not save inspection settings.",
        );
      }

      setNotice(
        inspectionMode ===
          "not_required"
          ? "Inspections disabled for this project."
          : "Inspection settings saved.",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save inspection settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (featuresLoading) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-8">
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
      <main className="mx-auto max-w-5xl px-5 py-8">
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <Link
        href={`/operations/projects/${projectId}`}
        className="text-sm font-bold text-blue-800"
      >
        ← Project
      </Link>

      <p className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">
        Project Setup
      </p>

      <h1 className="mt-2 text-3xl font-black text-slate-950">
        Inspections & Permitting
      </h1>

      <p className="mt-2 text-slate-600">
        {project?.name}
        {project?.address
          ? ` · ${project.address}`
          : ""}
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

      <form
        onSubmit={saveSettings}
        className="mt-7 grid gap-6"
      >
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-950">
            Are inspections required?
          </h2>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {[
              {
                value: "required",
                title:
                  "Yes, inspections are required",
                description:
                  "Build the verified inspection checklist and add inspection controls to the schedule.",
              },
              {
                value: "determine",
                title:
                  "Determine from municipality",
                description:
                  "Research likely requirements, then require contractor verification before continuing.",
              },
              {
                value:
                  "not_required",
                title:
                  "No inspections required",
                description:
                  "Disable inspection tasks, dependencies, result uploads, and inspection holds for this project.",
              },
            ].map((option) => (
              <label
                key={option.value}
                className={`cursor-pointer rounded-xl border p-5 ${
                  inspectionMode ===
                  option.value
                    ? "border-blue-600 bg-blue-50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="inspectionMode"
                  value={option.value}
                  checked={
                    inspectionMode ===
                    option.value
                  }
                  onChange={() =>
                    setInspectionMode(
                      option.value as InspectionMode,
                    )
                  }
                  className="h-4 w-4"
                />

                <p className="mt-3 font-bold text-slate-950">
                  {option.title}
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {
                    option.description
                  }
                </p>
              </label>
            ))}
          </div>
        </section>

        {inspectionMode !==
          "not_required" && (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-slate-950">
                Project & Jurisdiction
              </h2>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Project Type

                  <input
                    value={projectType}
                    onChange={(event) =>
                      setProjectType(
                        event.target.value,
                      )
                    }
                    placeholder="Deck, renovation, modular home, addition"
                    className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                  />
                </label>

                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Permit Type

                  <input
                    value={permitType}
                    onChange={(event) =>
                      setPermitType(
                        event.target.value,
                      )
                    }
                    placeholder="Building, trade, combined"
                    className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                  />
                </label>

                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Municipality

                  <input
                    value={municipality}
                    onChange={(event) =>
                      setMunicipality(
                        event.target.value,
                      )
                    }
                    className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                  />
                </label>

                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  County

                  <input
                    value={county}
                    onChange={(event) =>
                      setCounty(
                        event.target.value,
                      )
                    }
                    className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                  />
                </label>

                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  State

                  <input
                    value={stateCode}
                    onChange={(event) =>
                      setStateCode(
                        event.target.value,
                      )
                    }
                    className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                  />
                </label>

                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Permit Number

                  <input
                    value={permitNumber}
                    onChange={(event) =>
                      setPermitNumber(
                        event.target.value,
                      )
                    }
                    className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                  />
                </label>

                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Governing Authority

                  <input
                    value={authorityName}
                    onChange={(event) =>
                      setAuthorityName(
                        event.target.value,
                      )
                    }
                    placeholder="Knox County Codes Administration"
                    className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                  />
                </label>

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
                    <option value="">
                      Select type
                    </option>

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
                  Project Scope Summary

                  <textarea
                    rows={5}
                    value={scopeSummary}
                    onChange={(event) =>
                      setScopeSummary(
                        event.target.value,
                      )
                    }
                    placeholder="Describe the work so the municipality research can identify likely inspections."
                    className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-slate-950">
                Inspection Workflow
              </h2>

              <div className="mt-5 grid gap-4">
                {[
                  {
                    label:
                      "Research municipality requirements",
                    description:
                      "Use researched guidance to propose likely inspections. The contractor must verify every item before schedule controls become active.",
                    enabled:
                      municipalityResearchEnabled,
                    setter:
                      setMunicipalityResearchEnabled,
                    feature:
                      "inspection_municipality_research",
                  },
                  {
                    label:
                      "Add inspection dependencies to the schedule",
                    description:
                      "Block dependent tasks until the contractor-confirmed inspection or area release permits work to continue.",
                    enabled:
                      scheduleDependenciesEnabled,
                    setter:
                      setScheduleDependenciesEnabled,
                    feature:
                      "inspection_schedule_dependencies",
                  },
                  {
                    label:
                      "Extract results from uploaded inspection reports",
                    description:
                      "Detect pass, fail, partial pass, corrections, approved areas, and reinspection requirements for contractor review.",
                    enabled:
                      documentExtractionEnabled,
                    setter:
                      setDocumentExtractionEnabled,
                    feature:
                      "inspection_document_extraction",
                  },
                  {
                    label:
                      "Allow partial and area-specific passes",
                    description:
                      "Release approved areas while keeping failed or uninspected areas blocked.",
                    enabled:
                      partialPassEnabled,
                    setter:
                      setPartialPassEnabled,
                    feature:
                      "inspection_partial_pass",
                  },
                ].map((option) => {
                  const accountEnabled =
                    isEnabled(
                      option.feature as
                        | "inspection_municipality_research"
                        | "inspection_schedule_dependencies"
                        | "inspection_document_extraction"
                        | "inspection_partial_pass",
                    );

                  return (
                    <label
                      key={option.feature}
                      className={`flex items-start gap-4 rounded-xl border p-5 ${
                        accountEnabled
                          ? "border-slate-200"
                          : "border-slate-200 bg-slate-100"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={
                          accountEnabled &&
                          option.enabled
                        }
                        disabled={
                          !accountEnabled
                        }
                        onChange={(event) =>
                          option.setter(
                            event.target
                              .checked,
                          )
                        }
                        className="mt-1 h-5 w-5 rounded border-slate-300"
                      />

                      <span>
                        <span className="font-bold text-slate-950">
                          {
                            option.label
                          }
                        </span>

                        <span className="mt-1 block text-sm leading-6 text-slate-600">
                          {
                            option.description
                          }
                        </span>

                        {!accountEnabled && (
                          <span className="mt-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
                            Disabled in account settings
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          </>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-blue-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving
              ? "Saving..."
              : "Save Inspection Setup"}
          </button>

          {inspectionMode !==
            "not_required" && (
            <Link
              href={`/operations/projects/${projectId}/inspections`}
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800"
            >
              Continue to Inspection Checklist
            </Link>
          )}
        </div>
      </form>
    </main>
  );
}
