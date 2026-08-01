"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import ChangeOrderBillingSummary from "@/components/change-orders/change-order-billing-summary";

type Receivable = {
  changeOrderId: string;
  projectId: string;
  projectName: string;
  changeOrderNumber: number;
  title: string;
  status: string;
  billingStatus: string;
  invoiceNumber: string | null;
  invoicedAt: string | null;
  invoiceDueDate: string | null;
  amount: number;
  amountPaid: number;
  balanceDue: number;
  isOverdue: boolean;
  daysOverdue: number;
};

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
  ).format(
    new Date(
      value.includes("T")
        ? value
        : `${value}T12:00:00`,
    ),
  );
}

export default function ChangeOrderReceivablesPage() {
  const [
    receivables,
    setReceivables,
  ] = useState<Receivable[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    filter,
    setFilter,
  ] = useState<
    "all" | "overdue" | "current"
  >("all");

  const [
    search,
    setSearch,
  ] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadReceivables() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          "/api/change-orders/receivables",
          {
            credentials: "include",
            cache: "no-store",
          },
        );

        const result =
          (await response.json()) as {
            success?: boolean;
            error?: string;
            receivables?: Receivable[];
          };

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.error ??
              "Could not load receivables.",
          );
        }

        if (!cancelled) {
          setReceivables(
            result.receivables ?? [],
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load receivables.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadReceivables();

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered =
    useMemo(() => {
      const query =
        search.trim().toLowerCase();

      return receivables.filter(
        (receivable) => {
          if (
            filter === "overdue" &&
            !receivable.isOverdue
          ) {
            return false;
          }

          if (
            filter === "current" &&
            receivable.isOverdue
          ) {
            return false;
          }

          if (!query) {
            return true;
          }

          return [
            receivable.projectName,
            receivable.title,
            receivable.invoiceNumber ??
              "",
            String(
              receivable.changeOrderNumber,
            ),
          ].some((value) =>
            value
              .toLowerCase()
              .includes(query),
          );
        },
      );
    }, [
      receivables,
      filter,
      search,
    ]);

  const filteredBalance =
    filtered.reduce(
      (total, receivable) =>
        total +
        receivable.balanceDue,
      0,
    );

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link
            href="/operations/change-orders"
            className="text-sm font-bold text-blue-800"
          >
            ← Change Orders
          </Link>

          <h1 className="mt-5 text-3xl font-black text-slate-950">
            Change Order Receivables
          </h1>

          <p className="mt-2 text-slate-600">
            Track outstanding invoices,
            balances, and overdue customer
            payments.
          </p>
        </div>
      </div>

      <ChangeOrderBillingSummary
        refreshKey={
          receivables.length
        }
      />

      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "All"],
              ["overdue", "Overdue"],
              ["current", "Current"],
            ].map(
              ([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setFilter(
                      value as typeof filter,
                    )
                  }
                  className={`rounded-xl px-4 py-2 text-sm font-bold ${
                    filter === value
                      ? "bg-blue-950 text-white"
                      : "border border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  {label}
                </button>
              ),
            )}
          </div>

          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value,
              )
            }
            placeholder="Search project, invoice, or change order"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm lg:max-w-md"
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
          <p className="text-sm font-semibold text-slate-600">
            {filtered.length} outstanding invoices
          </p>

          <p className="text-lg font-black text-slate-950">
            {formatCurrency(
              filteredBalance,
            )}{" "}
            due
          </p>
        </div>
      </section>

      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-6 h-48 animate-pulse rounded-2xl bg-slate-100" />
      ) : filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">
          No receivables match the
          selected filters.
        </div>
      ) : (
        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    Project
                  </th>

                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    Invoice
                  </th>

                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    Due Date
                  </th>

                  <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">
                    Invoice Total
                  </th>

                  <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">
                    Paid
                  </th>

                  <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">
                    Balance
                  </th>

                  <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {filtered.map(
                  (receivable) => (
                    <tr
                      key={
                        receivable.changeOrderId
                      }
                      className={
                        receivable.isOverdue
                          ? "bg-red-50/50"
                          : ""
                      }
                    >
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-950">
                          {
                            receivable.projectName
                          }
                        </p>

                        <p className="mt-1 text-sm text-slate-600">
                          Change Order #
                          {
                            receivable.changeOrderNumber
                          }{" "}
                          ·{" "}
                          {
                            receivable.title
                          }
                        </p>
                      </td>

                      <td className="px-5 py-4 text-sm text-slate-700">
                        <p className="font-semibold text-slate-900">
                          {receivable.invoiceNumber ??
                            "No invoice number"}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          Invoiced{" "}
                          {formatDate(
                            receivable.invoicedAt,
                          )}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-sm">
                        <p
                          className={
                            receivable.isOverdue
                              ? "font-bold text-red-800"
                              : "text-slate-700"
                          }
                        >
                          {formatDate(
                            receivable.invoiceDueDate,
                          )}
                        </p>

                        {receivable.isOverdue && (
                          <p className="mt-1 text-xs font-bold text-red-700">
                            {
                              receivable.daysOverdue
                            }{" "}
                            days overdue
                          </p>
                        )}
                      </td>

                      <td className="px-5 py-4 text-right text-sm font-semibold text-slate-800">
                        {formatCurrency(
                          receivable.amount,
                        )}
                      </td>

                      <td className="px-5 py-4 text-right text-sm font-semibold text-emerald-800">
                        {formatCurrency(
                          receivable.amountPaid,
                        )}
                      </td>

                      <td className="px-5 py-4 text-right text-sm font-black text-slate-950">
                        {formatCurrency(
                          receivable.balanceDue,
                        )}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/operations/projects/${receivable.projectId}/change-orders/${receivable.changeOrderId}/billing`}
                          className="inline-flex rounded-lg bg-blue-950 px-4 py-2 text-sm font-bold text-white"
                        >
                          Open Billing
                        </Link>
                      </td>
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
