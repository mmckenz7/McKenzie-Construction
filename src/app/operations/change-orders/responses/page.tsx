"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

type ResponseRecord = {
  id: string;
  changeOrderId: string;
  projectId: string;
  response:
    | "approved"
    | "declined";
  customerName: string;
  customerNotes: string | null;
  agreementText: string;
  acknowledgedTerms: boolean;
  submittedAt: string;
  changeOrderNumber: number;
  title: string;
  description: string;
  reason: string | null;
  amount: number;
  scheduleImpactDays: number;
  customerNotesSnapshot:
    | string
    | null;
  project: {
    id: string;
    name: string;
    address: string;
  } | null;
};

type ApiResponse = {
  success: boolean;

  responses?: ResponseRecord[];

  summary?: {
    total: number;
    approved: number;
    declined: number;
    approvedRevenue: number;
    declinedRevenue: number;
  };

  error?: string;
};

type Filter =
  | "all"
  | "approved"
  | "declined";

function formatCurrency(
  value: number,
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
    },
  ).format(value);
}

function formatDateTime(
  value: string,
) {
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

export default function ChangeOrderResponsesPage() {
  const [responses, setResponses] =
    useState<ResponseRecord[]>([]);

  const [summary, setSummary] =
    useState({
      total: 0,
      approved: 0,
      declined: 0,
      approvedRevenue: 0,
      declinedRevenue: 0,
    });

  const [filter, setFilter] =
    useState<Filter>("all");

  const [search, setSearch] =
    useState("");

  const [startDate, setStartDate] =
    useState("");

  const [endDate, setEndDate] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  async function loadResponses() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/change-order-responses",
        {
          credentials: "include",
          cache: "no-store",
        },
      );

      const result =
        (await response.json()) as ApiResponse;

      if (
        !response.ok ||
        !result.success
      ) {
        setError(
          result.error ??
            "Could not load response records.",
        );
        return;
      }

      setResponses(
        result.responses ?? [],
      );

      setSummary(
        result.summary ?? {
          total: 0,
          approved: 0,
          declined: 0,
          approvedRevenue: 0,
          declinedRevenue: 0,
        },
      );
    } catch {
      setError(
        "Could not load response records.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadResponses();
  }, []);

  const filteredResponses =
    useMemo(() => {
      const query =
        search.trim().toLowerCase();

      return responses.filter(
        (record) => {
          if (
            filter !== "all" &&
            record.response !== filter
          ) {
            return false;
          }

          const submittedDate =
            new Date(
              record.submittedAt,
            );

          if (startDate) {
            const start =
              new Date(
                `${startDate}T00:00:00`,
              );

            if (
              submittedDate < start
            ) {
              return false;
            }
          }

          if (endDate) {
            const end =
              new Date(
                `${endDate}T23:59:59.999`,
              );

            if (
              submittedDate > end
            ) {
              return false;
            }
          }

          if (!query) {
            return true;
          }

          return [
            record.customerName,
            record.title,
            record.project?.name ?? "",
            record.project?.address ?? "",
            String(
              record.changeOrderNumber,
            ),
          ].some((value) =>
            value
              .toLowerCase()
              .includes(query),
          );
        },
      );
    }, [
      responses,
      filter,
      search,
      startDate,
      endDate,
    ]);

  function exportCsv() {
    const escapeCsv = (
      value: unknown,
    ) => {
      const textValue =
        String(value ?? "");

      return `"${textValue.replaceAll(
        '"',
        '""',
      )}"`;
    };

    const rows = [
      [
        "Response",
        "Project",
        "Address",
        "Change Order Number",
        "Title",
        "Customer",
        "Amount",
        "Schedule Impact Days",
        "Submitted",
        "Terms Acknowledged",
        "Customer Comments",
        "Agreement",
        "Record ID",
      ],
      ...filteredResponses.map(
        (record) => [
          record.response,
          record.project?.name ?? "",
          record.project?.address ?? "",
          record.changeOrderNumber,
          record.title,
          record.customerName,
          record.amount.toFixed(2),
          record.scheduleImpactDays,
          record.submittedAt,
          record.acknowledgedTerms
            ? "Yes"
            : "No",
          record.customerNotes ?? "",
          record.agreementText,
          record.id,
        ],
      ),
    ];

    const csv = rows
      .map((row) =>
        row
          .map(escapeCsv)
          .join(","),
      )
      .join("\n");

    const blob = new Blob(
      [csv],
      {
        type:
          "text/csv;charset=utf-8",
      },
    );

    const url =
      URL.createObjectURL(blob);

    const anchor =
      document.createElement("a");

    anchor.href = url;
    anchor.download =
      `change-order-responses-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;

    document.body.appendChild(
      anchor,
    );

    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-700">
            Operations
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">
            Customer Response Records
          </h1>

          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
            Permanent archive of every
            approved or declined change
            order across all projects.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/operations/change-orders"
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-bold text-slate-800"
          >
            Back to Change Orders
          </Link>

          <button
            type="button"
            onClick={() =>
              void loadResponses()
            }
            className="rounded-xl bg-violet-800 px-4 py-3 text-sm font-bold text-white"
          >
            Refresh
          </button>
        </div>
      </div>

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat
          label="Total Responses"
          value={String(
            summary.total,
          )}
        />

        <Stat
          label="Approved"
          value={String(
            summary.approved,
          )}
        />

        <Stat
          label="Declined"
          value={String(
            summary.declined,
          )}
        />

        <Stat
          label="Approved Revenue"
          value={formatCurrency(
            summary.approvedRevenue,
          )}
        />

        <Stat
          label="Declined Revenue"
          value={formatCurrency(
            summary.declinedRevenue,
          )}
        />
      </section>

      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              <FilterButton
                active={
                  filter === "all"
                }
                onClick={() =>
                  setFilter("all")
                }
              >
                All
              </FilterButton>

              <FilterButton
                active={
                  filter === "approved"
                }
                onClick={() =>
                  setFilter("approved")
                }
              >
                Approved
              </FilterButton>

              <FilterButton
                active={
                  filter === "declined"
                }
                onClick={() =>
                  setFilter("declined")
                }
              >
                Declined
              </FilterButton>
            </div>

            <button
              type="button"
              disabled={
                filteredResponses.length ===
                0
              }
              onClick={exportCsv}
              className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export Filtered CSV
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label>
              <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Search
              </span>

              <input
                type="search"
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value,
                  )
                }
                placeholder="Customer, project, address, or number"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
              />
            </label>

            <label>
              <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Start Date
              </span>

              <input
                type="date"
                value={startDate}
                onChange={(event) =>
                  setStartDate(
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
              />
            </label>

            <label>
              <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
                End Date
              </span>

              <input
                type="date"
                value={endDate}
                onChange={(event) =>
                  setEndDate(
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
              />
            </label>
          </div>

          {(search ||
            startDate ||
            endDate ||
            filter !== "all") && (
            <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-slate-700">
                Showing{" "}
                {
                  filteredResponses.length
                }{" "}
                of {responses.length} response
                records
              </p>

              <button
                type="button"
                onClick={() => {
                  setFilter("all");
                  setSearch("");
                  setStartDate("");
                  setEndDate("");
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </section>

      {error && (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-8 text-sm text-slate-600">
          Loading response records...
        </p>
      ) : filteredResponses.length ===
        0 ? (
        <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-xl font-bold text-slate-950">
            No response records found
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            No archived responses match
            the selected filters.
          </p>
        </section>
      ) : (
        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <Header>
                    Response
                  </Header>

                  <Header>
                    Project
                  </Header>

                  <Header>
                    Customer
                  </Header>

                  <Header>
                    Amount
                  </Header>

                  <Header>
                    Schedule
                  </Header>

                  <Header>
                    Submitted
                  </Header>

                  <Header>
                    Record
                  </Header>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredResponses.map(
                  (record) => (
                    <tr
                      key={record.id}
                      className="align-top"
                    >
                      <Cell>
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                            record.response ===
                            "approved"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {
                            record.response
                          }
                        </span>

                        <p className="mt-2 font-bold text-slate-950">
                          Change Order #
                          {
                            record.changeOrderNumber
                          }
                        </p>

                        <p className="mt-1 max-w-xs text-sm text-slate-600">
                          {record.title}
                        </p>
                      </Cell>

                      <Cell>
                        <p className="font-bold text-slate-900">
                          {record.project
                            ?.name ??
                            "Project"}
                        </p>

                        {record.project
                          ?.address && (
                          <p className="mt-1 max-w-xs text-sm text-slate-500">
                            {
                              record
                                .project
                                .address
                            }
                          </p>
                        )}
                      </Cell>

                      <Cell>
                        <p className="font-semibold text-slate-900">
                          {
                            record.customerName
                          }
                        </p>

                        <p className="mt-1 text-xs font-semibold text-emerald-700">
                          {record.acknowledgedTerms
                            ? "Terms acknowledged"
                            : "Acknowledgement not recorded"}
                        </p>
                      </Cell>

                      <Cell>
                        <p className="font-bold text-slate-950">
                          {formatCurrency(
                            record.amount,
                          )}
                        </p>
                      </Cell>

                      <Cell>
                        <p className="font-semibold text-slate-800">
                          {
                            record.scheduleImpactDays
                          }{" "}
                          days
                        </p>
                      </Cell>

                      <Cell>
                        <p className="whitespace-nowrap text-sm text-slate-700">
                          {formatDateTime(
                            record.submittedAt,
                          )}
                        </p>
                      </Cell>

                      <Cell>
                        <Link
                          href={`/operations/projects/${record.projectId}/change-orders/${record.changeOrderId}/responses/${record.id}`}
                          className="inline-flex whitespace-nowrap rounded-lg bg-violet-800 px-4 py-2 text-sm font-bold text-white"
                        >
                          Open Record
                        </Link>
                      </Cell>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-2xl font-bold text-slate-950">
        {value}
      </p>
    </article>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-bold ${
        active
          ? "bg-violet-800 text-white"
          : "border border-slate-300 bg-white text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

function Header({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}

function Cell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <td className="px-5 py-5">
      {children}
    </td>
  );
}
