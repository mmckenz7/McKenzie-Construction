import Link from "next/link";

import { createAdminServerClient } from "@/lib/supabase/admin-server";

export const dynamic = "force-dynamic";

type ProjectsPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    manager?: string;
  }>;
};

type Project = {
  id: string;
  customer_id: string;
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

type Customer = {
  id: string;
  customer_name: string;
  email: string | null;
  phone: string | null;
};

type TeamMember = {
  id: string;
  name: string;
  job_title: string | null;
  status: string;
};

type StatusOption = {
  value: string;
  label: string;
};

const statusOptions: StatusOption[] = [
  {
    value: "all",
    label: "All Projects",
  },
  {
    value: "planning",
    label: "Planning",
  },
  {
    value: "scheduled",
    label: "Scheduled",
  },
  {
    value: "in_progress",
    label: "In Progress",
  },
  {
    value: "on_hold",
    label: "On Hold",
  },
  {
    value: "completed",
    label: "Completed",
  },
  {
    value: "canceled",
    label: "Canceled",
  },
];

function displayValue(
  value: string | null | undefined,
) {
  return value?.trim()
    ? value
    : "—";
}

function formatStatus(
  value: string,
) {
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
  value: string | null | undefined,
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
  value: string | null | undefined,
) {
  if (!value) {
    return "—";
  }

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
      timeZone:
        "America/New_York",
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
      maximumFractionDigits: 0,
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
      return "bg-sky-100 text-sky-800";
  }
}

function getScheduleClasses(
  project: Project,
) {
  if (
    project.status ===
      "completed" ||
    project.status ===
      "canceled" ||
    !project.target_completion_date
  ) {
    return "text-slate-700";
  }

  const targetDate =
    new Date(
      `${project.target_completion_date}T23:59:59`,
    );

  if (
    Number.isNaN(
      targetDate.getTime(),
    )
  ) {
    return "text-slate-700";
  }

  if (
    targetDate.getTime() <
    Date.now()
  ) {
    return "font-bold text-red-700";
  }

  const difference =
    targetDate.getTime() -
    Date.now();

  if (
    difference <
    7 * 86400000
  ) {
    return "font-bold text-amber-700";
  }

  return "font-semibold text-slate-700";
}

export default async function ProjectsPage({
  searchParams,
}: ProjectsPageProps) {
  const parameters =
    await searchParams;

  const searchQuery =
    parameters.q
      ?.trim()
      .toLowerCase() ?? "";

  const selectedStatus =
    parameters.status &&
    statusOptions.some(
      (option) =>
        option.value ===
        parameters.status,
    )
      ? parameters.status
      : "all";

  const selectedManager =
    parameters.manager?.trim() ??
    "all";

  const supabase =
    createAdminServerClient();

  const [
    projectsResult,
    customersResult,
    teamResult,
  ] = await Promise.all([
    supabase
      .from("projects")
      .select(
        `
          id,
          customer_id,
          project_name,
          project_type,
          description,
          property_address,
          status,
          project_manager_id,
          estimated_value,
          contract_value,
          start_date,
          target_completion_date,
          completed_at,
          notes,
          created_at,
          updated_at
        `,
      )
      .order(
        "created_at",
        {
          ascending: false,
        },
      ),

    supabase
      .from("customers")
      .select(
        `
          id,
          customer_name,
          email,
          phone
        `,
      ),

    supabase
      .from("team_members")
      .select(
        `
          id,
          name,
          job_title,
          status
        `,
      )
      .order(
        "name",
        {
          ascending: true,
        },
      ),
  ]);

  const projects =
    (projectsResult.data ??
      []) as Project[];

  const customers =
    (customersResult.data ??
      []) as Customer[];

  const teamMembers =
    (teamResult.data ??
      []) as TeamMember[];

  const activeTeamMembers =
    teamMembers.filter(
      (member) =>
        member.status ===
        "active",
    );

  const customerById =
    new Map(
      customers.map(
        (customer) => [
          customer.id,
          customer,
        ],
      ),
    );

  const managerById =
    new Map(
      teamMembers.map(
        (member) => [
          member.id,
          member,
        ],
      ),
    );

  const filteredProjects =
    projects.filter(
      (project) => {
        if (
          selectedStatus !==
            "all" &&
          project.status !==
            selectedStatus
        ) {
          return false;
        }

        if (
          selectedManager ===
            "unassigned" &&
          project.project_manager_id
        ) {
          return false;
        }

        if (
          selectedManager !==
            "all" &&
          selectedManager !==
            "unassigned" &&
          project.project_manager_id !==
            selectedManager
        ) {
          return false;
        }

        if (!searchQuery) {
          return true;
        }

        const customer =
          customerById.get(
            project.customer_id,
          );

        const manager =
          project.project_manager_id
            ? managerById.get(
                project.project_manager_id,
              )
            : null;

        const searchableText = [
          project.project_name,
          project.project_type,
          project.property_address,
          project.description,
          customer?.customer_name,
          customer?.email,
          customer?.phone,
          manager?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(
          searchQuery,
        );
      },
    );

  const activeProjects =
    projects.filter(
      (project) =>
        project.status !==
          "completed" &&
        project.status !==
          "canceled",
    );

  const inProgressCount =
    projects.filter(
      (project) =>
        project.status ===
        "in_progress",
    ).length;

  const scheduledCount =
    projects.filter(
      (project) =>
        project.status ===
        "scheduled",
    ).length;

  const overdueCount =
    activeProjects.filter(
      (project) => {
        if (
          !project.target_completion_date
        ) {
          return false;
        }

        const targetDate =
          new Date(
            `${project.target_completion_date}T23:59:59`,
          );

        return (
          !Number.isNaN(
            targetDate.getTime(),
          ) &&
          targetDate.getTime() <
            Date.now()
        );
      },
    ).length;

  const unassignedCount =
    activeProjects.filter(
      (project) =>
        !project.project_manager_id,
    ).length;

  const totalActiveContractValue =
    activeProjects.reduce(
      (total, project) =>
        total +
        (project.contract_value ??
          0),
      0,
    );

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 transition hover:text-slate-950"
          >
            <span aria-hidden="true">
              ←
            </span>
            Lead Dashboard
          </Link>

          <Link
            href="/admin/customers"
            className="text-sm font-bold text-slate-600 transition hover:text-slate-950"
          >
            Customers
          </Link>

          <Link
            href="/operations/tasks"
            className="text-sm font-bold text-slate-600 transition hover:text-slate-950"
          >
            Tasks
          </Link>

          <Link
            href="/admin/team"
            className="text-sm font-bold text-slate-600 transition hover:text-slate-950"
          >
            Team
          </Link>
        </div>

        <header className="rounded-2xl bg-slate-950 px-6 py-7 text-white shadow-sm sm:px-8">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
                McKenzie Construction
              </p>

              <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
                Projects Dashboard
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                Review active projects,
                schedules, contract values,
                customers, and project-manager
                assignments.
              </p>
            </div>

            <Link
              href="/admin/customers"
              className="inline-flex w-fit rounded-lg bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-300"
            >
              Create From Customer
            </Link>
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Active Projects
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-950">
              {activeProjects.length}
            </p>
          </article>

          <article className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
              In Progress
            </p>

            <p className="mt-2 text-3xl font-bold text-blue-800">
              {inProgressCount}
            </p>
          </article>

          <article className="rounded-xl border border-violet-200 bg-violet-50 p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-violet-700">
              Scheduled
            </p>

            <p className="mt-2 text-3xl font-bold text-violet-800">
              {scheduledCount}
            </p>
          </article>

          <article
            className={`rounded-xl border p-5 shadow-sm ${
              overdueCount > 0
                ? "border-red-200 bg-red-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <p
              className={`text-xs font-bold uppercase tracking-widest ${
                overdueCount > 0
                  ? "text-red-700"
                  : "text-slate-500"
              }`}
            >
              Overdue
            </p>

            <p
              className={`mt-2 text-3xl font-bold ${
                overdueCount > 0
                  ? "text-red-800"
                  : "text-slate-950"
              }`}
            >
              {overdueCount}
            </p>
          </article>

          <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">
              Active Contract Value
            </p>

            <p className="mt-2 text-3xl font-bold text-emerald-800">
              {formatMoney(
                totalActiveContractValue,
              )}
            </p>
          </article>
        </section>

        {unassignedCount > 0 ? (
          <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
            <p className="text-sm font-bold text-amber-900">
              {unassignedCount} active{" "}
              {unassignedCount === 1
                ? "project does"
                : "projects do"}{" "}
              not have a project manager.
            </p>
          </section>
        ) : null}

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5 sm:p-6">
            <form
              method="GET"
              className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_220px_240px_auto]"
            >
              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">
                  Search
                </span>

                <input
                  type="search"
                  name="q"
                  defaultValue={
                    parameters.q ?? ""
                  }
                  placeholder="Project, customer, manager, or address"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">
                  Status
                </span>

                <select
                  name="status"
                  defaultValue={
                    selectedStatus
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
                >
                  {statusOptions.map(
                    (option) => (
                      <option
                        key={
                          option.value
                        }
                        value={
                          option.value
                        }
                      >
                        {option.label}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">
                  Project Manager
                </span>

                <select
                  name="manager"
                  defaultValue={
                    selectedManager
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
                >
                  <option value="all">
                    All Managers
                  </option>

                  <option value="unassigned">
                    Unassigned
                  </option>

                  {activeTeamMembers.map(
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
              </label>

              <div className="flex items-end gap-3">
                <button
                  type="submit"
                  className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white"
                >
                  Apply
                </button>

                <Link
                  href="/operations/projects"
                  className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700"
                >
                  Clear
                </Link>
              </div>
            </form>
          </div>

          {projectsResult.error ? (
            <div className="p-6">
              <p className="font-semibold text-red-700">
                {
                  projectsResult.error
                    .message
                }
              </p>
            </div>
          ) : customersResult.error ? (
            <div className="p-6">
              <p className="font-semibold text-red-700">
                {
                  customersResult.error
                    .message
                }
              </p>
            </div>
          ) : teamResult.error ? (
            <div className="p-6">
              <p className="font-semibold text-red-700">
                {
                  teamResult.error
                    .message
                }
              </p>
            </div>
          ) : filteredProjects.length ===
            0 ? (
            <div className="p-10 text-center">
              <h2 className="text-lg font-bold text-slate-950">
                No projects match these filters
              </h2>

              <p className="mt-2 text-sm text-slate-600">
                Create a project from a
                customer record or clear the
                current filters.
              </p>

              <Link
                href="/admin/customers"
                className="mt-6 inline-flex rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
              >
                View Customers
              </Link>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-full border-collapse">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200 text-left">
                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                        Project
                      </th>

                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                        Customer
                      </th>

                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                        Status
                      </th>

                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                        Manager
                      </th>

                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                        Contract
                      </th>

                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                        Start
                      </th>

                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                        Target
                      </th>

                      <th className="w-12 px-5 py-3">
                        <span className="sr-only">
                          Open
                        </span>
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredProjects.map(
                      (project) => {
                        const customer =
                          customerById.get(
                            project.customer_id,
                          );

                        const manager =
                          project.project_manager_id
                            ? managerById.get(
                                project.project_manager_id,
                              )
                            : null;

                        return (
                          <tr
                            key={project.id}
                            className="border-b border-slate-100 transition hover:bg-slate-50"
                          >
                            <td className="px-5 py-4">
                              <Link
                                href={`/admin/projects/${encodeURIComponent(
                                  project.id,
                                )}`}
                                className="block"
                              >
                                <p className="font-bold text-slate-950">
                                  {
                                    project.project_name
                                  }
                                </p>

                                <p className="mt-1 max-w-[260px] truncate text-xs text-slate-500">
                                  {displayValue(
                                    project.project_type,
                                  )}
                                </p>

                                {project.property_address ? (
                                  <p className="mt-1 max-w-[280px] truncate text-xs text-slate-500">
                                    {
                                      project.property_address
                                    }
                                  </p>
                                ) : null}
                              </Link>
                            </td>

                            <td className="px-5 py-4">
                              <Link
                                href={`/admin/customers/${encodeURIComponent(
                                  project.customer_id,
                                )}`}
                                className="text-sm font-bold text-slate-800 hover:underline"
                              >
                                {customer
                                  ?.customer_name ??
                                  "Unknown Customer"}
                              </Link>
                            </td>

                            <td className="px-5 py-4">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getStatusClasses(
                                  project.status,
                                )}`}
                              >
                                {formatStatus(
                                  project.status,
                                )}
                              </span>
                            </td>

                            <td className="px-5 py-4 text-sm font-semibold text-slate-700">
                              {manager?.name ??
                                "Unassigned"}
                            </td>

                            <td className="px-5 py-4 text-sm font-bold text-slate-800">
                              {formatMoney(
                                project.contract_value,
                              )}
                            </td>

                            <td className="px-5 py-4 text-sm font-semibold text-slate-700">
                              {formatDate(
                                project.start_date,
                              )}
                            </td>

                            <td className="px-5 py-4">
                              <p
                                className={`text-sm ${getScheduleClasses(
                                  project,
                                )}`}
                              >
                                {formatDate(
                                  project.target_completion_date,
                                )}
                              </p>
                            </td>

                            <td className="px-5 py-4 text-right">
                              <Link
                                href={`/admin/projects/${encodeURIComponent(
                                  project.id,
                                )}`}
                                aria-label={`Open ${project.project_name}`}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white font-bold text-slate-700 transition hover:border-slate-950 hover:bg-slate-950 hover:text-white"
                              >
                                →
                              </Link>
                            </td>
                          </tr>
                        );
                      },
                    )}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-slate-200 lg:hidden">
                {filteredProjects.map(
                  (project) => {
                    const customer =
                      customerById.get(
                        project.customer_id,
                      );

                    const manager =
                      project.project_manager_id
                        ? managerById.get(
                            project.project_manager_id,
                          )
                        : null;

                    return (
                      <Link
                        key={project.id}
                        href={`/admin/projects/${encodeURIComponent(
                          project.id,
                        )}`}
                        className="block p-5 transition hover:bg-slate-50"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                              {displayValue(
                                project.project_type,
                              )}
                            </p>

                            <h2 className="mt-1 font-bold text-slate-950">
                              {
                                project.project_name
                              }
                            </h2>

                            <p className="mt-1 text-sm text-slate-600">
                              {customer
                                ?.customer_name ??
                                "Unknown Customer"}
                            </p>
                          </div>

                          <span
                            className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${getStatusClasses(
                              project.status,
                            )}`}
                          >
                            {formatStatus(
                              project.status,
                            )}
                          </span>
                        </div>

                        {project.property_address ? (
                          <p className="mt-3 text-sm text-slate-600">
                            {
                              project.property_address
                            }
                          </p>
                        ) : null}

                        <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                              Manager
                            </p>

                            <p className="mt-1 text-sm font-semibold text-slate-800">
                              {manager?.name ??
                                "Unassigned"}
                            </p>
                          </div>

                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                              Contract
                            </p>

                            <p className="mt-1 text-sm font-semibold text-slate-800">
                              {formatMoney(
                                project.contract_value,
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                              Start
                            </p>

                            <p className="mt-1 text-sm font-semibold text-slate-800">
                              {formatDate(
                                project.start_date,
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                              Target
                            </p>

                            <p
                              className={`mt-1 text-sm ${getScheduleClasses(
                                project,
                              )}`}
                            >
                              {formatDate(
                                project.target_completion_date,
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                          <span>
                            Updated{" "}
                            {formatDateAndTime(
                              project.updated_at,
                            )}
                          </span>

                          <span className="font-bold text-slate-800">
                            Open Project →
                          </span>
                        </div>
                      </Link>
                    );
                  },
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}