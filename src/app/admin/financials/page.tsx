"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

type FinancialItem = {
  id: string;
  recordType: "project" | "lead";
  name: string;
  customerName: string | null;
  projectType: string | null;
  propertyAddress: string | null;
  status: string;
  responsiblePersonName: string | null;
  scheduledDate: string | null;
  targetDate: string | null;
  value: number;
  recordedCosts: number;
  unpaidCosts: number;
  refunds: number;
  netCosts: number;
  projectedProfit: number;
  projectedMargin: number | null;
  winProbability: number | null;
  weightedValue: number;
};

type FinancialSummary = {
  recordCount: number;
  projectCount: number;
  leadCount: number;
  totalValue: number;
  weightedValue: number;
  recordedCosts: number;
  netCosts: number;
  unpaidCosts: number;
  refunds: number;
  projectedProfit: number;
  projectedMargin: number | null;
  averageJobValue: number;
  noScheduledDateCount: number;
  noScheduledDateValue: number;
};

type MonthlyBreakdown = {
  month: string;
  label: string;
  count: number;
  value: number;
  weightedValue: number;
  netCosts: number;
  projectedProfit: number;
};

type ProjectTypeBreakdown = {
  projectType: string;
  count: number;
  value: number;
  weightedValue: number;
  projectedProfit: number;
};

type ManagerBreakdown = {
  manager: string;
  count: number;
  value: number;
  projectedProfit: number;
};

type FinancialResponse = {
  success: boolean;
  error?: string;

  filters?: {
    view: string;
    timeframe: string;
    startDate: string | null;
    endDate: string | null;
    defaultView: string;
    defaultTimeframe: string;
  };

  summary?: FinancialSummary;
  monthlyBreakdown?: MonthlyBreakdown[];
  projectTypeBreakdown?: ProjectTypeBreakdown[];
  managerBreakdown?: ManagerBreakdown[];
  items?: FinancialItem[];
};

type FilterState = {
  view: string;
  timeframe: string;
  startDate: string;
  endDate: string;
};

const initialSummary: FinancialSummary = {
  recordCount: 0,
  projectCount: 0,
  leadCount: 0,
  totalValue: 0,
  weightedValue: 0,
  recordedCosts: 0,
  netCosts: 0,
  unpaidCosts: 0,
  refunds: 0,
  projectedProfit: 0,
  projectedMargin: null,
  averageJobValue: 0,
  noScheduledDateCount: 0,
  noScheduledDateValue: 0,
};

const defaultFilters: FilterState = {
  view: "confirmed",
  timeframe: "90",
  startDate: "",
  endDate: "",
};

const viewOptions = [
  {
    value: "confirmed",
    label: "Confirmed Work",
  },
  {
    value: "estimates",
    label: "Estimates in Progress",
  },
  {
    value: "proposals",
    label: "Proposals Sent",
  },
  {
    value: "customer_reviewing",
    label: "Customer Reviewing",
  },
  {
    value: "all_opportunities",
    label: "All Active Opportunities",
  },
  {
    value: "completed",
    label: "Completed Work",
  },
  {
    value: "all",
    label: "All Records",
  },
];

const timeframeOptions = [
  {
    value: "30",
    label: "Next 30 Days",
  },
  {
    value: "60",
    label: "Next 60 Days",
  },
  {
    value: "90",
    label: "Next 90 Days",
  },
  {
    value: "180",
    label: "Next 6 Months",
  },
  {
    value: "365",
    label: "Next 12 Months",
  },
  {
    value: "all",
    label: "All Upcoming",
  },
  {
    value: "custom",
    label: "Custom Range",
  },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDetailedMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number | null) {
  if (value === null) {
    return "—";
  }

  return `${value.toFixed(1)}%`;
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1),
    )
    .join(" ");
}

function formatDate(value: string | null) {
  if (!value) {
    return "Unscheduled";
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

function getViewLabel(view: string) {
  return (
    viewOptions.find(
      (option) =>
        option.value === view,
    )?.label ??
    "Confirmed Work"
  );
}

function getTimeframeLabel(
  timeframe: string,
) {
  return (
    timeframeOptions.find(
      (option) =>
        option.value ===
        timeframe,
    )?.label ??
    "Next 90 Days"
  );
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

    case "proposal_sent":
      return "bg-purple-100 text-purple-800";

    case "customer_reviewing":
      return "bg-fuchsia-100 text-fuchsia-800";

    case "estimate_in_progress":
      return "bg-sky-100 text-sky-800";

    case "canceled":
      return "bg-slate-200 text-slate-700";

    default:
      return "bg-slate-100 text-slate-700";
  }
}

function buildFinancialUrl(
  filters: FilterState,
) {
  const parameters =
    new URLSearchParams();

  parameters.set(
    "view",
    filters.view,
  );

  parameters.set(
    "timeframe",
    filters.timeframe,
  );

  if (
    filters.timeframe ===
    "custom"
  ) {
    parameters.set(
      "startDate",
      filters.startDate,
    );

    parameters.set(
      "endDate",
      filters.endDate,
    );
  }

  return `/api/financials?${parameters.toString()}`;
}

export default function FinancialsPage() {
  const [filters, setFilters] =
    useState<FilterState>({
      ...defaultFilters,
    });

  const [
    appliedFilters,
    setAppliedFilters,
  ] = useState<FilterState>({
    ...defaultFilters,
  });

  const [
    summary,
    setSummary,
  ] =
    useState<FinancialSummary>(
      initialSummary,
    );

  const [
    monthlyBreakdown,
    setMonthlyBreakdown,
  ] = useState<
    MonthlyBreakdown[]
  >([]);

  const [
    projectTypeBreakdown,
    setProjectTypeBreakdown,
  ] = useState<
    ProjectTypeBreakdown[]
  >([]);

  const [
    managerBreakdown,
    setManagerBreakdown,
  ] = useState<
    ManagerBreakdown[]
  >([]);

  const [items, setItems] =
    useState<FinancialItem[]>(
      [],
    );

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [error, setError] =
    useState("");

  const loadFinancials =
    useCallback(
      async (
        requestedFilters: FilterState,
      ) => {
        setIsLoading(true);
        setError("");

        try {
          const response =
            await fetch(
              buildFinancialUrl(
                requestedFilters,
              ),
              {
                method: "GET",
                cache: "no-store",
              },
            );

          const result =
            (await response.json()) as FinancialResponse;

          if (
            !response.ok ||
            !result.success
          ) {
            throw new Error(
              result.error ??
                "Financial data could not be loaded.",
            );
          }

          setSummary(
            result.summary ??
              initialSummary,
          );

          setMonthlyBreakdown(
            result.monthlyBreakdown ??
              [],
          );

          setProjectTypeBreakdown(
            result.projectTypeBreakdown ??
              [],
          );

          setManagerBreakdown(
            result.managerBreakdown ??
              [],
          );

          setItems(
            result.items ?? [],
          );
        } catch (loadError) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Financial data could not be loaded.",
          );

          setSummary(
            initialSummary,
          );

          setMonthlyBreakdown(
            [],
          );

          setProjectTypeBreakdown(
            [],
          );

          setManagerBreakdown(
            [],
          );

          setItems([]);
        } finally {
          setIsLoading(false);
        }
      },
      [],
    );

  useEffect(() => {
    void loadFinancials(
      appliedFilters,
    );
  }, [
    appliedFilters,
    loadFinancials,
  ]);

  const largestMonthlyValue =
    useMemo(
      () =>
        Math.max(
          ...monthlyBreakdown.map(
            (month) =>
              month.value,
          ),
          1,
        ),
      [monthlyBreakdown],
    );

  const isOpportunityView =
    appliedFilters.view ===
      "estimates" ||
    appliedFilters.view ===
      "proposals" ||
    appliedFilters.view ===
      "customer_reviewing" ||
    appliedFilters.view ===
      "all_opportunities";

  function updateFilter(
    field: keyof FilterState,
    value: string,
  ) {
    setFilters(
      (current) => ({
        ...current,
        [field]: value,
      }),
    );
  }

  function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError("");

    if (
      filters.timeframe ===
        "custom" &&
      (!filters.startDate ||
        !filters.endDate)
    ) {
      setError(
        "Choose both a start date and an end date.",
      );

      return;
    }

    if (
      filters.timeframe ===
        "custom" &&
      filters.endDate <
        filters.startDate
    ) {
      setError(
        "The end date cannot be before the start date.",
      );

      return;
    }

    setAppliedFilters({
      ...filters,
    });
  }

  function resetFilters() {
    setFilters({
      ...defaultFilters,
    });

    setAppliedFilters({
      ...defaultFilters,
    });
  }

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
            href="/admin/projects"
            className="text-sm font-bold text-slate-600 transition hover:text-slate-950"
          >
            Projects
          </Link>

          <Link
            href="/admin/customers"
            className="text-sm font-bold text-slate-600 transition hover:text-slate-950"
          >
            Customers
          </Link>

          <Link
            href="/admin/tasks"
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
                Financial Health
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                Review confirmed
                upcoming work,
                contract value,
                recorded costs,
                unpaid obligations,
                and projected profit.
              </p>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Current Report
              </p>

              <p className="mt-1 text-sm font-bold text-white">
                {getViewLabel(
                  appliedFilters.view,
                )}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                {getTimeframeLabel(
                  appliedFilters.timeframe,
                )}
              </p>
            </div>
          </div>
        </header>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <form
            onSubmit={
              handleSubmit
            }
            className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_auto]"
          >
            <label>
              <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">
                Financial View
              </span>

              <select
                value={
                  filters.view
                }
                onChange={(
                  event,
                ) =>
                  updateFilter(
                    "view",
                    event.target
                      .value,
                  )
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
              >
                {viewOptions.map(
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

            <label>
              <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">
                Time Period
              </span>

              <select
                value={
                  filters.timeframe
                }
                onChange={(
                  event,
                ) =>
                  updateFilter(
                    "timeframe",
                    event.target
                      .value,
                  )
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
              >
                {timeframeOptions.map(
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

            <div className="flex items-end gap-3">
              <button
                type="submit"
                disabled={
                  isLoading
                }
                className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {isLoading
                  ? "Loading..."
                  : "Apply"}
              </button>

              <button
                type="button"
                onClick={
                  resetFilters
                }
                disabled={
                  isLoading
                }
                className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-60"
              >
                Reset
              </button>
            </div>

            {filters.timeframe ===
            "custom" ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:col-span-3">
                <label>
                  <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">
                    Start Date
                  </span>

                  <input
                    type="date"
                    value={
                      filters.startDate
                    }
                    onChange={(
                      event,
                    ) =>
                      updateFilter(
                        "startDate",
                        event.target
                          .value,
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">
                    End Date
                  </span>

                  <input
                    type="date"
                    value={
                      filters.endDate
                    }
                    onChange={(
                      event,
                    ) =>
                      updateFilter(
                        "endDate",
                        event.target
                          .value,
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
                  />
                </label>
              </div>
            ) : null}
          </form>

          {error ? (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
              {error}
            </div>
          ) : null}
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">
              {isOpportunityView
                ? "Opportunity Value"
                : "Confirmed Value"}
            </p>

            <p className="mt-2 text-3xl font-bold text-emerald-800">
              {formatMoney(
                summary.totalValue,
              )}
            </p>

            <p className="mt-2 text-xs text-emerald-700">
              {
                summary.recordCount
              }{" "}
              {summary.recordCount ===
              1
                ? "record"
                : "records"}
            </p>
          </article>

          <article className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
              {isOpportunityView
                ? "Weighted Value"
                : "Average Job"}
            </p>

            <p className="mt-2 text-3xl font-bold text-blue-800">
              {formatMoney(
                isOpportunityView
                  ? summary.weightedValue
                  : summary.averageJobValue,
              )}
            </p>

            <p className="mt-2 text-xs text-blue-700">
              {isOpportunityView
                ? "Adjusted by probability"
                : `${summary.projectCount} confirmed projects`}
            </p>
          </article>

          <article className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-red-700">
              Net Costs Recorded
            </p>

            <p className="mt-2 text-3xl font-bold text-red-800">
              {formatMoney(
                summary.netCosts,
              )}
            </p>

            <p className="mt-2 text-xs text-red-700">
              Gross costs less
              refunds
            </p>
          </article>

          <article
            className={`rounded-xl border p-5 shadow-sm ${
              summary.projectedProfit >=
              0
                ? "border-violet-200 bg-violet-50"
                : "border-red-200 bg-red-50"
            }`}
          >
            <p
              className={`text-xs font-bold uppercase tracking-widest ${
                summary.projectedProfit >=
                0
                  ? "text-violet-700"
                  : "text-red-700"
              }`}
            >
              Current Projected
              Profit
            </p>

            <p
              className={`mt-2 text-3xl font-bold ${
                summary.projectedProfit >=
                0
                  ? "text-violet-800"
                  : "text-red-800"
              }`}
            >
              {formatMoney(
                summary.projectedProfit,
              )}
            </p>

            <p
              className={`mt-2 text-xs ${
                summary.projectedProfit >=
                0
                  ? "text-violet-700"
                  : "text-red-700"
              }`}
            >
              Margin:{" "}
              {formatPercent(
                summary.projectedMargin,
              )}
            </p>
          </article>
        </section>

        <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
              Unpaid Costs
            </p>

            <p className="mt-2 text-2xl font-bold text-amber-800">
              {formatMoney(
                summary.unpaidCosts,
              )}
            </p>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Recorded Costs
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-950">
              {formatMoney(
                summary.recordedCosts,
              )}
            </p>
          </article>

          <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">
              Refunds and Credits
            </p>

            <p className="mt-2 text-2xl font-bold text-emerald-800">
              {formatMoney(
                summary.refunds,
              )}
            </p>
          </article>

          <article
            className={`rounded-xl border p-5 ${
              summary.noScheduledDateCount >
              0
                ? "border-amber-200 bg-amber-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <p
              className={`text-xs font-bold uppercase tracking-widest ${
                summary.noScheduledDateCount >
                0
                  ? "text-amber-700"
                  : "text-slate-500"
              }`}
            >
              No Scheduled Date
            </p>

            <p
              className={`mt-2 text-2xl font-bold ${
                summary.noScheduledDateCount >
                0
                  ? "text-amber-800"
                  : "text-slate-950"
              }`}
            >
              {
                summary.noScheduledDateCount
              }
            </p>

            <p className="mt-1 text-xs text-slate-600">
              {formatMoney(
                summary.noScheduledDateValue,
              )}
            </p>
          </article>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
              Timing
            </p>

            <h2 className="mt-1 text-xl font-bold text-slate-950">
              Monthly Value
            </h2>

            {monthlyBreakdown.length ===
            0 ? (
              <p className="mt-6 text-sm text-slate-600">
                No dated records
                match this report.
              </p>
            ) : (
              <div className="mt-6 space-y-5">
                {monthlyBreakdown.map(
                  (month) => {
                    const width =
                      Math.max(
                        3,
                        (month.value /
                          largestMonthlyValue) *
                          100,
                      );

                    return (
                      <div
                        key={
                          month.month
                        }
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-bold text-slate-900">
                              {
                                month.label
                              }
                            </p>

                            <p className="text-xs text-slate-500">
                              {
                                month.count
                              }{" "}
                              {month.count ===
                              1
                                ? "job"
                                : "jobs"}
                            </p>
                          </div>

                          <p className="text-sm font-bold text-slate-950">
                            {formatMoney(
                              month.value,
                            )}
                          </p>
                        </div>

                        <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-slate-950"
                            style={{
                              width: `${width}%`,
                            }}
                          />
                        </div>

                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span>
                            Costs:{" "}
                            {formatMoney(
                              month.netCosts,
                            )}
                          </span>

                          <span>
                            Profit:{" "}
                            {formatMoney(
                              month.projectedProfit,
                            )}
                          </span>

                          {isOpportunityView ? (
                            <span>
                              Weighted:{" "}
                              {formatMoney(
                                month.weightedValue,
                              )}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            )}
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
              Work Mix
            </p>

            <h2 className="mt-1 text-xl font-bold text-slate-950">
              Value by Project Type
            </h2>

            {projectTypeBreakdown.length ===
            0 ? (
              <p className="mt-6 text-sm text-slate-600">
                No project-type data
                matches this report.
              </p>
            ) : (
              <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
                <table className="min-w-full border-collapse">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200 text-left">
                      <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                        Type
                      </th>

                      <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-widest text-slate-500">
                        Jobs
                      </th>

                      <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-widest text-slate-500">
                        Value
                      </th>

                      <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-widest text-slate-500">
                        Profit
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {projectTypeBreakdown.map(
                      (type) => (
                        <tr
                          key={
                            type.projectType
                          }
                          className="border-b border-slate-100"
                        >
                          <td className="px-4 py-4 text-sm font-bold text-slate-900">
                            {
                              type.projectType
                            }
                          </td>

                          <td className="px-4 py-4 text-right text-sm font-semibold text-slate-700">
                            {
                              type.count
                            }
                          </td>

                          <td className="px-4 py-4 text-right text-sm font-bold text-slate-950">
                            {formatMoney(
                              type.value,
                            )}
                          </td>

                          <td className="px-4 py-4 text-right text-sm font-bold text-emerald-700">
                            {formatMoney(
                              type.projectedProfit,
                            )}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </section>

        {managerBreakdown.length >
        0 ? (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
              Responsibility
            </p>

            <h2 className="mt-1 text-xl font-bold text-slate-950">
              Confirmed Work by
              Project Manager
            </h2>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {managerBreakdown.map(
                (manager) => (
                  <article
                    key={
                      manager.manager
                    }
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <p className="font-bold text-slate-950">
                      {
                        manager.manager
                      }
                    </p>

                    <p className="mt-2 text-2xl font-bold text-slate-950">
                      {formatMoney(
                        manager.value,
                      )}
                    </p>

                    <div className="mt-2 flex justify-between gap-3 text-xs text-slate-500">
                      <span>
                        {
                          manager.count
                        }{" "}
                        {manager.count ===
                        1
                          ? "job"
                          : "jobs"}
                      </span>

                      <span>
                        Profit:{" "}
                        {formatMoney(
                          manager.projectedProfit,
                        )}
                      </span>
                    </div>
                  </article>
                ),
              )}
            </div>
          </section>
        ) : null}

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
                  Report Detail
                </p>

                <h2 className="mt-1 text-xl font-bold text-slate-950">
                  Included Work
                </h2>
              </div>

              <span className="w-fit rounded-full bg-slate-950 px-3 py-1 text-xs font-bold text-white">
                {items.length}
              </span>
            </div>
          </div>

          {isLoading ? (
            <div className="p-10 text-center text-sm text-slate-600">
              Loading financial
              data...
            </div>
          ) : items.length ===
            0 ? (
            <div className="p-10 text-center">
              <h3 className="text-lg font-bold text-slate-950">
                No records match
                this report
              </h3>

              <p className="mt-2 text-sm text-slate-600">
                Try a longer
                timeframe or another
                financial view.
              </p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-full border-collapse">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200 text-left">
                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                        Work
                      </th>

                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                        Status
                      </th>

                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                        Date
                      </th>

                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                        Manager
                      </th>

                      <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-widest text-slate-500">
                        Value
                      </th>

                      <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-widest text-slate-500">
                        Costs
                      </th>

                      <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-widest text-slate-500">
                        Profit
                      </th>

                      <th className="w-12 px-5 py-3">
                        <span className="sr-only">
                          Open
                        </span>
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {items.map(
                      (item) => (
                        <tr
                          key={`${item.recordType}-${item.id}`}
                          className="border-b border-slate-100 transition hover:bg-slate-50"
                        >
                          <td className="px-5 py-4">
                            <p className="font-bold text-slate-950">
                              {
                                item.name
                              }
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                              {item.customerName ??
                                "—"}
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                              {item.projectType ??
                                "Unspecified"}
                            </p>
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getStatusClasses(
                                item.status,
                              )}`}
                            >
                              {formatLabel(
                                item.status,
                              )}
                            </span>

                            {item.recordType ===
                              "lead" &&
                            item.winProbability !==
                              null ? (
                              <p className="mt-2 text-xs text-slate-500">
                                {
                                  item.winProbability
                                }
                                % probability
                              </p>
                            ) : null}
                          </td>

                          <td className="px-5 py-4 text-sm font-semibold text-slate-700">
                            {formatDate(
                              item.scheduledDate,
                            )}
                          </td>

                          <td className="px-5 py-4 text-sm font-semibold text-slate-700">
                            {item.responsiblePersonName ??
                              "Unassigned"}
                          </td>

                          <td className="px-5 py-4 text-right">
                            <p className="font-bold text-slate-950">
                              {formatDetailedMoney(
                                item.value,
                              )}
                            </p>

                            {item.recordType ===
                              "lead" ? (
                              <p className="mt-1 text-xs text-slate-500">
                                Weighted:{" "}
                                {formatDetailedMoney(
                                  item.weightedValue,
                                )}
                              </p>
                            ) : null}
                          </td>

                          <td className="px-5 py-4 text-right">
                            <p className="font-bold text-red-700">
                              {formatDetailedMoney(
                                item.netCosts,
                              )}
                            </p>

                            {item.unpaidCosts >
                            0 ? (
                              <p className="mt-1 text-xs text-amber-700">
                                Unpaid:{" "}
                                {formatDetailedMoney(
                                  item.unpaidCosts,
                                )}
                              </p>
                            ) : null}
                          </td>

                          <td className="px-5 py-4 text-right">
                            <p
                              className={`font-bold ${
                                item.projectedProfit >=
                                0
                                  ? "text-emerald-700"
                                  : "text-red-700"
                              }`}
                            >
                              {formatDetailedMoney(
                                item.projectedProfit,
                              )}
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                              {formatPercent(
                                item.projectedMargin,
                              )}
                            </p>
                          </td>

                          <td className="px-5 py-4 text-right">
                            <Link
                              href={
                                item.recordType ===
                                "project"
                                  ? `/admin/projects/${encodeURIComponent(
                                      item.id,
                                    )}`
                                  : `/admin/leads/${encodeURIComponent(
                                      item.id,
                                    )}`
                              }
                              aria-label={`Open ${item.name}`}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white font-bold text-slate-700 transition hover:border-slate-950 hover:bg-slate-950 hover:text-white"
                            >
                              →
                            </Link>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-slate-200 lg:hidden">
                {items.map(
                  (item) => (
                    <Link
                      key={`${item.recordType}-${item.id}`}
                      href={
                        item.recordType ===
                        "project"
                          ? `/admin/projects/${encodeURIComponent(
                              item.id,
                            )}`
                          : `/admin/leads/${encodeURIComponent(
                              item.id,
                            )}`
                      }
                      className="block p-5 transition hover:bg-slate-50"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                            {item.projectType ??
                              "Unspecified"}
                          </p>

                          <h3 className="mt-1 font-bold text-slate-950">
                            {item.name}
                          </h3>

                          <p className="mt-1 text-sm text-slate-600">
                            {item.customerName ??
                              "—"}
                          </p>
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${getStatusClasses(
                            item.status,
                          )}`}
                        >
                          {formatLabel(
                            item.status,
                          )}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            Scheduled
                          </p>

                          <p className="mt-1 text-sm font-semibold text-slate-800">
                            {formatDate(
                              item.scheduledDate,
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            Value
                          </p>

                          <p className="mt-1 text-sm font-semibold text-slate-800">
                            {formatMoney(
                              item.value,
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            Costs
                          </p>

                          <p className="mt-1 text-sm font-semibold text-red-700">
                            {formatMoney(
                              item.netCosts,
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            Profit
                          </p>

                          <p
                            className={`mt-1 text-sm font-semibold ${
                              item.projectedProfit >=
                              0
                                ? "text-emerald-700"
                                : "text-red-700"
                            }`}
                          >
                            {formatMoney(
                              item.projectedProfit,
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                        <span>
                          {item.responsiblePersonName ??
                            "Unassigned"}
                        </span>

                        <span className="font-bold text-slate-800">
                          Open{" "}
                          {item.recordType ===
                          "project"
                            ? "Project"
                            : "Lead"}{" "}
                          →
                        </span>
                      </div>
                    </Link>
                  ),
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}