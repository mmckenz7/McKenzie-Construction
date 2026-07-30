"use client";

import {
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";

type TeamMember = {
  id: string;
  name: string;
  job_title: string | null;
};

type Project = {
  id: string;
  project_name: string;
  project_type: string | null;
  description: string | null;
  property_address: string | null;
  status: string;
  project_manager_id: string | null;
  estimated_value: number | null;
  contract_value: number | null;
  start_date: string | null;
  target_completion_date: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type CustomerProjectManagerProps = {
  customerId: string;
  customerName: string;
  defaultProjectType: string | null;
  defaultPropertyAddress: string | null;
  projects: Project[];
  teamMembers: TeamMember[];
  automaticallyAssignProjects: boolean;
  requireProjectManager: boolean;
  defaultProjectManagerId: string | null;
};

type FormState = {
  projectName: string;
  projectType: string;
  description: string;
  propertyAddress: string;
  status: string;
  projectManagerId: string;
  estimatedValue: string;
  contractValue: string;
  startDate: string;
  targetCompletionDate: string;
  notes: string;
};

const initialStatus = "planning";

function formatStatus(value: string) {
  return value
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1),
    )
    .join(" ");
}

function formatDate(
  value: string | null,
) {
  if (!value) {
    return "—";
  }

  const date = new Date(
    `${value}T00:00:00`,
  );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  ).format(date);
}

function formatDateAndTime(
  value: string,
) {
  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
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
  ).format(date);
}

function formatMoney(
  value: number | null,
) {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    },
  ).format(value);
}

function getStatusClasses(
  status: string,
) {
  switch (status) {
    case "completed":
      return "bg-emerald-100 text-emerald-800";

    case "in_progress":
      return "bg-blue-100 text-blue-800";

    case "scheduled":
      return "bg-violet-100 text-violet-800";

    case "on_hold":
      return "bg-amber-100 text-amber-800";

    case "canceled":
      return "bg-slate-200 text-slate-700";

    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function CustomerProjectManager({
  customerId,
  customerName,
  defaultProjectType,
  defaultPropertyAddress,
  projects,
  teamMembers,
  automaticallyAssignProjects,
  requireProjectManager,
  defaultProjectManagerId,
}: CustomerProjectManagerProps) {
  const router = useRouter();

  const [isFormOpen, setIsFormOpen] =
    useState(projects.length === 0);

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  const defaultManager =
    useMemo(
      () =>
        teamMembers.find(
          (member) =>
            member.id ===
            defaultProjectManagerId,
        ) ?? null,
      [
        teamMembers,
        defaultProjectManagerId,
      ],
    );

  const createInitialFormState =
    (): FormState => ({
      projectName:
        defaultProjectType
          ? `${customerName} — ${defaultProjectType}`
          : `${customerName} Project`,
      projectType:
        defaultProjectType ?? "",
      description: "",
      propertyAddress:
        defaultPropertyAddress ?? "",
      status:
        initialStatus,
      projectManagerId: "",
      estimatedValue: "",
      contractValue: "",
      startDate: "",
      targetCompletionDate: "",
      notes: "",
    });

  const [form, setForm] =
    useState<FormState>(
      createInitialFormState,
    );

  function updateField(
    field: keyof FormState,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    if (!form.projectName.trim()) {
      setErrorMessage(
        "Enter a project name.",
      );

      return;
    }

    if (
      requireProjectManager &&
      !automaticallyAssignProjects &&
      !form.projectManagerId
    ) {
      setErrorMessage(
        "Choose an active project manager.",
      );

      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(
        "/api/projects",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            customerId,
            projectName:
              form.projectName,
            projectType:
              form.projectType,
            description:
              form.description,
            propertyAddress:
              form.propertyAddress,
            status:
              form.status,
            projectManagerId:
              form.projectManagerId ||
              null,
            estimatedValue:
              form.estimatedValue,
            contractValue:
              form.contractValue,
            startDate:
              form.startDate,
            targetCompletionDate:
              form.targetCompletionDate,
            notes:
              form.notes,
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
            "The project could not be created.",
        );
      }

      setSuccessMessage(
        "Project created successfully.",
      );

      setForm(
        createInitialFormState(),
      );

      setIsFormOpen(false);

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The project could not be created.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
            Customer Projects
          </p>

          <h2 className="mt-1 text-2xl font-bold text-slate-950">
            Project History
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Track active and completed projects,
            assigned managers, contract values,
            and expected completion dates.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsFormOpen(
              (current) => !current,
            );
            setErrorMessage("");
            setSuccessMessage("");
          }}
          className="inline-flex w-fit items-center justify-center rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800"
        >
          {isFormOpen
            ? "Close Form"
            : "Create Project"}
        </button>
      </div>

      {successMessage ? (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {successMessage}
        </div>
      ) : null}

      {isFormOpen ? (
        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <label className="md:col-span-2">
              <span className="text-sm font-bold text-slate-800">
                Project name
              </span>

              <input
                type="text"
                required
                value={
                  form.projectName
                }
                onChange={(event) =>
                  updateField(
                    "projectName",
                    event.target.value,
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
              />
            </label>

            <label>
              <span className="text-sm font-bold text-slate-800">
                Project type
              </span>

              <input
                type="text"
                value={
                  form.projectType
                }
                onChange={(event) =>
                  updateField(
                    "projectType",
                    event.target.value,
                  )
                }
                placeholder="Deck, renovation, roofing..."
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
              />
            </label>

            <label>
              <span className="text-sm font-bold text-slate-800">
                Status
              </span>

              <select
                value={form.status}
                onChange={(event) =>
                  updateField(
                    "status",
                    event.target.value,
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
              >
                <option value="planning">
                  Planning
                </option>

                <option value="scheduled">
                  Scheduled
                </option>

                <option value="in_progress">
                  In Progress
                </option>

                <option value="on_hold">
                  On Hold
                </option>

                <option value="completed">
                  Completed
                </option>

                <option value="canceled">
                  Canceled
                </option>
              </select>
            </label>

            <label className="md:col-span-2">
              <span className="text-sm font-bold text-slate-800">
                Property address
              </span>

              <input
                type="text"
                value={
                  form.propertyAddress
                }
                onChange={(event) =>
                  updateField(
                    "propertyAddress",
                    event.target.value,
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
              />
            </label>

            <label>
              <span className="text-sm font-bold text-slate-800">
                Project manager
              </span>

              <select
                value={
                  form.projectManagerId
                }
                onChange={(event) =>
                  updateField(
                    "projectManagerId",
                    event.target.value,
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
              >
                <option value="">
                  {automaticallyAssignProjects
                    ? "Use automatic assignment"
                    : "Unassigned"}
                </option>

                {teamMembers.map(
                  (member) => (
                    <option
                      key={member.id}
                      value={member.id}
                    >
                      {member.name}
                      {member.job_title
                        ? ` — ${member.job_title}`
                        : ""}
                    </option>
                  ),
                )}
              </select>

              <p className="mt-2 text-xs leading-5 text-slate-500">
                {automaticallyAssignProjects
                  ? defaultManager
                    ? `Automatic assignment currently prioritizes ${defaultManager.name}.`
                    : "Automatic assignment is enabled, but no active default project manager is selected."
                  : "Automatic project assignment is disabled."}
              </p>
            </label>

            <label>
              <span className="text-sm font-bold text-slate-800">
                Estimated value
              </span>

              <input
                type="text"
                inputMode="decimal"
                value={
                  form.estimatedValue
                }
                onChange={(event) =>
                  updateField(
                    "estimatedValue",
                    event.target.value,
                  )
                }
                placeholder="$0.00"
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
              />
            </label>

            <label>
              <span className="text-sm font-bold text-slate-800">
                Contract value
              </span>

              <input
                type="text"
                inputMode="decimal"
                value={
                  form.contractValue
                }
                onChange={(event) =>
                  updateField(
                    "contractValue",
                    event.target.value,
                  )
                }
                placeholder="$0.00"
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
              />
            </label>

            <label>
              <span className="text-sm font-bold text-slate-800">
                Start date
              </span>

              <input
                type="date"
                value={
                  form.startDate
                }
                onChange={(event) =>
                  updateField(
                    "startDate",
                    event.target.value,
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
              />
            </label>

            <label>
              <span className="text-sm font-bold text-slate-800">
                Target completion
              </span>

              <input
                type="date"
                value={
                  form.targetCompletionDate
                }
                onChange={(event) =>
                  updateField(
                    "targetCompletionDate",
                    event.target.value,
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
              />
            </label>

            <label className="md:col-span-2">
              <span className="text-sm font-bold text-slate-800">
                Description
              </span>

              <textarea
                rows={4}
                value={
                  form.description
                }
                onChange={(event) =>
                  updateField(
                    "description",
                    event.target.value,
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
              />
            </label>

            <label className="md:col-span-2">
              <span className="text-sm font-bold text-slate-800">
                Internal notes
              </span>

              <textarea
                rows={4}
                value={form.notes}
                onChange={(event) =>
                  updateField(
                    "notes",
                    event.target.value,
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
              />
            </label>
          </div>

          {errorMessage ? (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
              {errorMessage}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? "Creating Project..."
                : "Create Project"}
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setForm(
                  createInitialFormState(),
                );
                setErrorMessage("");
              }}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reset
            </button>
          </div>
        </form>
      ) : null}

      {projects.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <h3 className="font-bold text-slate-950">
            No projects created
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Create the first CRM project for this
            customer to begin tracking its manager,
            value, schedule, and status.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {projects.map((project) => {
            const manager =
              teamMembers.find(
                (member) =>
                  member.id ===
                  project.project_manager_id,
              ) ?? null;

            return (
              <article
                key={project.id}
                className="rounded-2xl border border-slate-200 bg-white p-5"
              >
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                      {project.project_type ||
                        "Construction Project"}
                    </p>

                    <h3 className="mt-1 text-xl font-bold text-slate-950">
                      {project.project_name}
                    </h3>

                    {project.property_address ? (
                      <p className="mt-2 text-sm text-slate-600">
                        {
                          project.property_address
                        }
                      </p>
                    ) : null}
                  </div>

                  <span
                    className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${getStatusClasses(
                      project.status,
                    )}`}
                  >
                    {formatStatus(
                      project.status,
                    )}
                  </span>
                </div>

                <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-slate-500">
                      Project manager
                    </dt>

                    <dd className="mt-1 font-bold text-slate-950">
                      {manager?.name ??
                        "Unassigned"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-slate-500">
                      Contract value
                    </dt>

                    <dd className="mt-1 font-bold text-slate-950">
                      {formatMoney(
                        project.contract_value,
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-slate-500">
                      Start date
                    </dt>

                    <dd className="mt-1 font-bold text-slate-950">
                      {formatDate(
                        project.start_date,
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-slate-500">
                      Target completion
                    </dt>

                    <dd className="mt-1 font-bold text-slate-950">
                      {formatDate(
                        project.target_completion_date,
                      )}
                    </dd>
                  </div>
                </dl>

                {project.description ? (
                  <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {project.description}
                  </p>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-200 pt-4 text-xs font-semibold text-slate-500">
                  <span>
                    Estimated:{" "}
                    {formatMoney(
                      project.estimated_value,
                    )}
                  </span>

                  <span>
                    Created:{" "}
                    {formatDateAndTime(
                      project.created_at,
                    )}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}