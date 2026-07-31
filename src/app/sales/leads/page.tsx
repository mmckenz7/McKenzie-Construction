import Link from "next/link";

import { createAdminServerClient } from "@/lib/supabase/admin-server";

export const dynamic = "force-dynamic";

type AdminPageProps = {
  searchParams: Promise<{
    q?: string;
    stage?: string;
    period?: string;
  }>;
};

type Lead = {
  id: string | number;
  created_at: string | null;
  updated_at?: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  property_address: string | null;
  project_type: string | null;
  lead_status: string | null;
  consultation_status: string | null;
  preferred_contact_method: string | null;
  follow_up_at: string | null;
};

type LeadTask = {
  id: string;
  lead_id: string;
  task_type: string | null;
  title: string | null;
  status: string | null;
  priority: string | null;
  due_at: string | null;
  created_at: string | null;
};

type LeadActivity = {
  id: string;
  lead_id: string;
  occurred_at: string | null;
  created_at: string | null;
};

type StageOption = {
  value: string;
  label: string;
};

const stageOptions: StageOption[] = [
  {
    value: "all",
    label: "All Active Leads",
  },
  {
    value: "new",
    label: "New",
  },
  {
    value: "consultation_pending",
    label: "Consultation Pending",
  },
  {
    value: "consultation_confirmed",
    label: "Consultation Confirmed",
  },
  {
    value: "estimate_in_progress",
    label: "Estimate In Progress",
  },
  {
    value: "proposal_sent",
    label: "Proposal Sent",
  },
  {
    value: "customer_reviewing",
    label: "Customer Reviewing",
  },
  {
    value: "won",
    label: "Won",
  },
  {
    value: "lost",
    label: "Lost",
  },
];

function displayValue(
  value: string | null | undefined,
) {
  return value?.trim()
    ? value
    : "—";
}

function titleCase(
  value: string | null | undefined,
) {
  if (!value) {
    return "—";
  }

  return value
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    );
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
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(date);
}

function formatRelativeDate(
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
    return "—";
  }

  const difference =
    date.getTime() -
    Date.now();

  const absoluteDifference =
    Math.abs(difference);

  const minutes =
    Math.round(
      absoluteDifference /
        60000,
    );

  if (minutes < 60) {
    return difference < 0
      ? `${minutes}m ago`
      : `in ${minutes}m`;
  }

  const hours =
    Math.round(
      absoluteDifference /
        3600000,
    );

  if (hours < 24) {
    return difference < 0
      ? `${hours}h ago`
      : `in ${hours}h`;
  }

  const days =
    Math.round(
      absoluteDifference /
        86400000,
    );

  return difference < 0
    ? `${days}d ago`
    : `in ${days}d`;
}

function getLeadStageKey(
  lead: Lead,
) {
  if (
    lead.lead_status ===
    "won"
  ) {
    return "won";
  }

  if (
    lead.lead_status ===
    "lost"
  ) {
    return "lost";
  }

  if (
    lead.lead_status ===
    "customer_reviewing"
  ) {
    return "customer_reviewing";
  }

  if (
    lead.lead_status ===
    "proposal_sent"
  ) {
    return "proposal_sent";
  }

  if (
    lead.lead_status ===
    "estimate_in_progress"
  ) {
    return "estimate_in_progress";
  }

  if (
    lead.consultation_status ===
    "confirmed"
  ) {
    return "consultation_confirmed";
  }

  if (
    lead.consultation_status ===
    "pending"
  ) {
    return "consultation_pending";
  }

  return "new";
}

function getLeadStageLabel(
  lead: Lead,
) {
  const stageKey =
    getLeadStageKey(lead);

  return (
    stageOptions.find(
      (option) =>
        option.value ===
        stageKey,
    )?.label ?? "New"
  );
}

function getStageClasses(
  lead: Lead,
) {
  const stage =
    getLeadStageKey(lead);

  if (stage === "won") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (stage === "lost") {
    return "bg-red-100 text-red-800";
  }

  if (
    stage ===
      "proposal_sent" ||
    stage ===
      "customer_reviewing"
  ) {
    return "bg-violet-100 text-violet-800";
  }

  if (
    stage ===
    "estimate_in_progress"
  ) {
    return "bg-sky-100 text-sky-800";
  }

  if (
    stage ===
    "consultation_confirmed"
  ) {
    return "bg-amber-100 text-amber-800";
  }

  if (
    stage ===
    "consultation_pending"
  ) {
    return "bg-orange-100 text-orange-800";
  }

  return "bg-slate-100 text-slate-800";
}

function getDueClasses(
  dueAt: string | null | undefined,
) {
  if (!dueAt) {
    return "text-slate-500";
  }

  const dueDate =
    new Date(dueAt);

  if (
    Number.isNaN(
      dueDate.getTime(),
    )
  ) {
    return "text-slate-500";
  }

  const difference =
    dueDate.getTime() -
    Date.now();

  if (difference < 0) {
    return "font-bold text-red-700";
  }

  if (
    difference <
    86400000
  ) {
    return "font-bold text-amber-700";
  }

  return "font-semibold text-slate-700";
}

function isOpenTask(
  task: LeadTask,
) {
  return (
    task.status === "open" ||
    task.status ===
      "in_progress"
  );
}

function getNewestActivityDate(
  lead: Lead,
  activity?: LeadActivity,
) {
  return (
    activity?.occurred_at ??
    activity?.created_at ??
    lead.updated_at ??
    lead.created_at
  );
}

function getPeriodStart(
  period: string,
) {
  const now = new Date();

  if (period === "7") {
    now.setDate(
      now.getDate() - 7,
    );

    return now;
  }

  if (period === "30") {
    now.setDate(
      now.getDate() - 30,
    );

    return now;
  }

  if (period === "90") {
    now.setDate(
      now.getDate() - 90,
    );

    return now;
  }

  return null;
}

export default async function AdminPage({
  searchParams,
}: AdminPageProps) {
  const parameters =
    await searchParams;

  const searchQuery =
    parameters.q
      ?.trim()
      .toLowerCase() ?? "";

  const selectedStage =
    parameters.stage &&
    stageOptions.some(
      (option) =>
        option.value ===
        parameters.stage,
    )
      ? parameters.stage
      : "all";

  const selectedPeriod = [
    "all",
    "7",
    "30",
    "90",
  ].includes(
    parameters.period ?? "",
  )
    ? parameters.period!
    : "all";

  const supabase =
    createAdminServerClient();

  const [
    leadsResult,
    tasksResult,
    activitiesResult,
  ] = await Promise.all([
    supabase
      .from("leads")
      .select("*")
      .order(
        "created_at",
        {
          ascending: false,
        },
      ),

    supabase
      .from("lead_tasks")
      .select(
        `
          id,
          lead_id,
          task_type,
          title,
          status,
          priority,
          due_at,
          created_at
        `,
      )
      .in("status", [
        "open",
        "in_progress",
      ])
      .order(
        "due_at",
        {
          ascending: true,
        },
      ),

    supabase
      .from("lead_activities")
      .select(
        `
          id,
          lead_id,
          occurred_at,
          created_at
        `,
      )
      .order(
        "occurred_at",
        {
          ascending: false,
        },
      ),
  ]);

  const leads =
    (leadsResult.data ??
      []) as Lead[];

  const tasks =
    (tasksResult.data ??
      []) as LeadTask[];

  const activities =
    (activitiesResult.data ??
      []) as LeadActivity[];

  const openTaskByLead =
    new Map<
      string,
      LeadTask
    >();

  for (const task of tasks) {
    if (!isOpenTask(task)) {
      continue;
    }

    const leadId =
      String(task.lead_id);

    const existing =
      openTaskByLead.get(
        leadId,
      );

    if (!existing) {
      openTaskByLead.set(
        leadId,
        task,
      );

      continue;
    }

    const existingTime =
      existing.due_at
        ? new Date(
            existing.due_at,
          ).getTime()
        : Number.POSITIVE_INFINITY;

    const taskTime =
      task.due_at
        ? new Date(
            task.due_at,
          ).getTime()
        : Number.POSITIVE_INFINITY;

    if (
      taskTime <
      existingTime
    ) {
      openTaskByLead.set(
        leadId,
        task,
      );
    }
  }

  const latestActivityByLead =
    new Map<
      string,
      LeadActivity
    >();

  for (
    const activity of
    activities
  ) {
    const leadId =
      String(
        activity.lead_id,
      );

    if (
      !latestActivityByLead.has(
        leadId,
      )
    ) {
      latestActivityByLead.set(
        leadId,
        activity,
      );
    }
  }

  const periodStart =
    getPeriodStart(
      selectedPeriod,
    );

  const filteredLeads =
    leads.filter((lead) => {
      const stageKey =
        getLeadStageKey(lead);

      if (
        selectedStage ===
          "all" &&
        (stageKey === "won" ||
          stageKey === "lost")
      ) {
        return false;
      }

      if (
        selectedStage !==
          "all" &&
        stageKey !==
          selectedStage
      ) {
        return false;
      }

      if (periodStart) {
        const createdDate =
          lead.created_at
            ? new Date(
                lead.created_at,
              )
            : null;

        if (
          !createdDate ||
          createdDate <
            periodStart
        ) {
          return false;
        }
      }

      if (!searchQuery) {
        return true;
      }

      const searchableText = [
        lead.name,
        lead.phone,
        lead.email,
        lead.project_type,
        lead.property_address,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(
        searchQuery,
      );
    });

  const activeLeadCount =
    leads.filter((lead) => {
      const stage =
        getLeadStageKey(lead);

      return (
        stage !== "won" &&
        stage !== "lost"
      );
    }).length;

  const overdueCount =
    tasks.filter((task) => {
      if (!task.due_at) {
        return false;
      }

      const dueDate =
        new Date(task.due_at);

      return (
        !Number.isNaN(
          dueDate.getTime(),
        ) &&
        dueDate.getTime() <
          Date.now()
      );
    }).length;

  const estimateCount =
    leads.filter(
      (lead) =>
        getLeadStageKey(
          lead,
        ) ===
        "estimate_in_progress",
    ).length;

  const proposalCount =
    leads.filter((lead) => {
      const stage =
        getLeadStageKey(lead);

      return (
        stage ===
          "proposal_sent" ||
        stage ===
          "customer_reviewing"
      );
    }).length;

  const wonCount =
    leads.filter(
      (lead) =>
        getLeadStageKey(
          lead,
        ) === "won",
    ).length;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            href="/sales/customers"
            className="text-sm font-bold text-slate-600 transition hover:text-slate-950"
          >
            Customers
          </Link>

          <Link
            href="/operations/projects"
            className="text-sm font-bold text-slate-600 transition hover:text-slate-950"
          >
            Projects
          </Link>

          <Link
            href="/admin/financials"
            className="text-sm font-bold text-slate-600 transition hover:text-slate-950"
          >
            Financials
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

          <Link
            href="/admin/settings/tasks"
            className="text-sm font-bold text-slate-600 transition hover:text-slate-950"
          >
            Task Settings
          </Link>
        </div>

        <header className="rounded-2xl bg-slate-950 px-6 py-7 text-white shadow-sm sm:px-8">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
                McKenzie Construction
              </p>

              <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
                Lead Dashboard
              </h1>

              <p className="mt-2 text-sm text-slate-300">
                Review current stages,
                deadlines, and next
                actions without opening
                every lead.
              </p>
            </div>

            <Link
              href="/contact"
              className="inline-flex w-fit rounded-lg bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-300"
            >
              Open Request Form
            </Link>
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Active Leads
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-950">
              {activeLeadCount}
            </p>
          </article>

          <article className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-red-700">
              Overdue Tasks
            </p>

            <p className="mt-2 text-3xl font-bold text-red-800">
              {overdueCount}
            </p>
          </article>

          <article className="rounded-xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-sky-700">
              Estimates
            </p>

            <p className="mt-2 text-3xl font-bold text-sky-800">
              {estimateCount}
            </p>
          </article>

          <article className="rounded-xl border border-violet-200 bg-violet-50 p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-violet-700">
              Proposals Out
            </p>

            <p className="mt-2 text-3xl font-bold text-violet-800">
              {proposalCount}
            </p>
          </article>

          <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">
              Won
            </p>

            <p className="mt-2 text-3xl font-bold text-emerald-800">
              {wonCount}
            </p>
          </article>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5 sm:p-6">
            <form
              method="GET"
              className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_220px_180px_auto]"
            >
              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">
                  Search
                </span>

                <input
                  type="search"
                  name="q"
                  defaultValue={
                    parameters.q ??
                    ""
                  }
                  placeholder="Customer, phone, project, or address"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">
                  Stage
                </span>

                <select
                  name="stage"
                  defaultValue={
                    selectedStage
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
                >
                  {stageOptions.map(
                    (option) => (
                      <option
                        key={
                          option.value
                        }
                        value={
                          option.value
                        }
                      >
                        {
                          option.label
                        }
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">
                  Created
                </span>

                <select
                  name="period"
                  defaultValue={
                    selectedPeriod
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
                >
                  <option value="all">
                    Any Time
                  </option>

                  <option value="7">
                    Last 7 Days
                  </option>

                  <option value="30">
                    Last 30 Days
                  </option>

                  <option value="90">
                    Last 90 Days
                  </option>
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
                  href="/admin"
                  className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700"
                >
                  Clear
                </Link>
              </div>
            </form>
          </div>

          {leadsResult.error ? (
            <div className="p-6">
              <p className="font-semibold text-red-700">
                {
                  leadsResult.error
                    .message
                }
              </p>
            </div>
          ) : filteredLeads.length ===
            0 ? (
            <div className="p-10 text-center">
              <h2 className="text-lg font-bold text-slate-950">
                No leads match
                these filters
              </h2>

              <p className="mt-2 text-sm text-slate-600">
                Clear the search
                or select another
                stage.
              </p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-full border-collapse">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200 text-left">
                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                        Customer
                      </th>

                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                        Project
                      </th>

                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                        Current Stage
                      </th>

                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                        Next Action
                      </th>

                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                        Due
                      </th>

                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                        Contact
                      </th>

                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                        Activity
                      </th>

                      <th className="w-12 px-5 py-3">
                        <span className="sr-only">
                          Open
                        </span>
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredLeads.map(
                      (lead) => {
                        const leadId =
                          String(
                            lead.id,
                          );

                        const nextTask =
                          openTaskByLead.get(
                            leadId,
                          );

                        const latestActivity =
                          latestActivityByLead.get(
                            leadId,
                          );

                        const latestDate =
                          getNewestActivityDate(
                            lead,
                            latestActivity,
                          );

                        return (
                          <tr
                            key={
                              leadId
                            }
                            className="border-b border-slate-100 transition hover:bg-slate-50"
                          >
                            <td className="px-5 py-4">
                              <Link
                                href={`/sales/leads/${encodeURIComponent(
                                  leadId,
                                )}`}
                                className="block"
                              >
                                <p className="font-bold text-slate-950">
                                  {displayValue(
                                    lead.name,
                                  )}
                                </p>

                                <p className="mt-1 max-w-[260px] truncate text-xs text-slate-500">
                                  {displayValue(
                                    lead.property_address,
                                  )}
                                </p>
                              </Link>
                            </td>

                            <td className="px-5 py-4 text-sm font-semibold text-slate-700">
                              {displayValue(
                                lead.project_type,
                              )}
                            </td>

                            <td className="px-5 py-4">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getStageClasses(
                                  lead,
                                )}`}
                              >
                                {getLeadStageLabel(
                                  lead,
                                )}
                              </span>
                            </td>

                            <td className="px-5 py-4">
                              <p className="max-w-[260px] truncate text-sm font-semibold text-slate-800">
                                {nextTask?.title ??
                                  "No open task"}
                              </p>

                              {nextTask?.priority ? (
                                <p className="mt-1 text-xs text-slate-500">
                                  {titleCase(
                                    nextTask.priority,
                                  )}{" "}
                                  priority
                                </p>
                              ) : null}
                            </td>

                            <td className="px-5 py-4">
                              <p
                                className={`text-sm ${getDueClasses(
                                  nextTask?.due_at ??
                                    lead.follow_up_at,
                                )}`}
                              >
                                {formatDateAndTime(
                                  nextTask?.due_at ??
                                    lead.follow_up_at,
                                )}
                              </p>

                              {nextTask?.due_at ||
                              lead.follow_up_at ? (
                                <p className="mt-1 text-xs text-slate-500">
                                  {formatRelativeDate(
                                    nextTask?.due_at ??
                                      lead.follow_up_at,
                                  )}
                                </p>
                              ) : null}
                            </td>

                            <td className="px-5 py-4">
                              <div className="flex flex-col gap-1 text-sm">
                                {lead.phone ? (
                                  <a
                                    href={`tel:${lead.phone}`}
                                    className="font-semibold text-slate-800 hover:underline"
                                  >
                                    {
                                      lead.phone
                                    }
                                  </a>
                                ) : null}

                                {lead.email ? (
                                  <a
                                    href={`mailto:${lead.email}`}
                                    className="max-w-[190px] truncate text-xs text-slate-500 hover:underline"
                                  >
                                    {
                                      lead.email
                                    }
                                  </a>
                                ) : null}

                                {!lead.phone &&
                                !lead.email
                                  ? "—"
                                  : null}
                              </div>
                            </td>

                            <td className="px-5 py-4">
                              <p className="text-sm font-semibold text-slate-700">
                                {formatRelativeDate(
                                  latestDate,
                                )}
                              </p>
                            </td>

                            <td className="px-5 py-4 text-right">
                              <Link
                                href={`/sales/leads/${encodeURIComponent(
                                  leadId,
                                )}`}
                                aria-label={`Open ${displayValue(
                                  lead.name,
                                )}`}
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
                {filteredLeads.map(
                  (lead) => {
                    const leadId =
                      String(
                        lead.id,
                      );

                    const nextTask =
                      openTaskByLead.get(
                        leadId,
                      );

                    const latestActivity =
                      latestActivityByLead.get(
                        leadId,
                      );

                    const latestDate =
                      getNewestActivityDate(
                        lead,
                        latestActivity,
                      );

                    return (
                      <Link
                        key={
                          leadId
                        }
                        href={`/sales/leads/${encodeURIComponent(
                          leadId,
                        )}`}
                        className="block p-5 transition hover:bg-slate-50"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h2 className="font-bold text-slate-950">
                              {displayValue(
                                lead.name,
                              )}
                            </h2>

                            <p className="mt-1 text-sm text-slate-600">
                              {displayValue(
                                lead.project_type,
                              )}
                            </p>
                          </div>

                          <span
                            className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${getStageClasses(
                              lead,
                            )}`}
                          >
                            {getLeadStageLabel(
                              lead,
                            )}
                          </span>
                        </div>

                        <p className="mt-3 text-sm text-slate-600">
                          {displayValue(
                            lead.property_address,
                          )}
                        </p>

                        <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                              Next Action
                            </p>

                            <p className="mt-1 text-sm font-semibold text-slate-800">
                              {nextTask?.title ??
                                "No open task"}
                            </p>
                          </div>

                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                              Due
                            </p>

                            <p
                              className={`mt-1 text-sm ${getDueClasses(
                                nextTask?.due_at ??
                                  lead.follow_up_at,
                              )}`}
                            >
                              {formatDateAndTime(
                                nextTask?.due_at ??
                                  lead.follow_up_at,
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                          <span>
                            Updated{" "}
                            {formatRelativeDate(
                              latestDate,
                            )}
                          </span>

                          <span className="font-bold text-slate-800">
                            Open Lead →
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