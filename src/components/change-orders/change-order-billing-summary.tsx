"use client";

import {
  useEffect,
  useState,
} from "react";

type BillingSummary = {
  approved_amount: number;
  invoiced_amount: number;
  collected_amount: number;
  balance_due: number;
  not_billed_amount: number;
  overdue_amount: number;
  invoice_count: number;
  unpaid_invoice_count: number;
  paid_invoice_count: number;
  overdue_invoice_count: number;
  not_billed_count: number;
  collection_percent: number;
};

const EMPTY_SUMMARY: BillingSummary = {
  approved_amount: 0,
  invoiced_amount: 0,
  collected_amount: 0,
  balance_due: 0,
  not_billed_amount: 0,
  overdue_amount: 0,
  invoice_count: 0,
  unpaid_invoice_count: 0,
  paid_invoice_count: 0,
  overdue_invoice_count: 0,
  not_billed_count: 0,
  collection_percent: 0,
};

function numberValue(
  value: unknown,
) {
  const converted =
    Number(value ?? 0);

  return Number.isFinite(converted)
    ? converted
    : 0;
}

function normalizeSummary(
  summary:
    | Partial<BillingSummary>
    | undefined,
): BillingSummary {
  return {
    approved_amount:
      numberValue(
        summary?.approved_amount,
      ),

    invoiced_amount:
      numberValue(
        summary?.invoiced_amount,
      ),

    collected_amount:
      numberValue(
        summary?.collected_amount,
      ),

    balance_due:
      numberValue(
        summary?.balance_due,
      ),

    not_billed_amount:
      numberValue(
        summary?.not_billed_amount,
      ),

    overdue_amount:
      numberValue(
        summary?.overdue_amount,
      ),

    invoice_count:
      numberValue(
        summary?.invoice_count,
      ),

    unpaid_invoice_count:
      numberValue(
        summary?.unpaid_invoice_count,
      ),

    paid_invoice_count:
      numberValue(
        summary?.paid_invoice_count,
      ),

    overdue_invoice_count:
      numberValue(
        summary?.overdue_invoice_count,
      ),

    not_billed_count:
      numberValue(
        summary?.not_billed_count,
      ),

    collection_percent:
      numberValue(
        summary?.collection_percent,
      ),
  };
}

function formatCurrency(
  value: number,
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    },
  ).format(value);
}

export default function ChangeOrderBillingSummary({
  refreshKey,
}: {
  refreshKey?: string | number;
}) {
  const [
    summary,
    setSummary,
  ] = useState(
    EMPTY_SUMMARY,
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          "/api/change-orders/billing-summary",
          {
            credentials: "include",
            cache: "no-store",
          },
        );

        const result =
          (await response.json()) as {
            success?: boolean;
            error?: string;
            summary?: Partial<BillingSummary>;
          };

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.error ??
              "Could not load billing totals.",
          );
        }

        if (!cancelled) {
          setSummary(
            normalizeSummary(
              result.summary,
            ),
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load billing totals.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSummary();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({
          length: 4,
        }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-2xl bg-slate-100"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
        {error}
      </div>
    );
  }

  return (
    <>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
            Invoiced
          </p>

          <p className="mt-3 text-3xl font-black text-blue-950">
            {formatCurrency(
              summary.invoiced_amount,
            )}
          </p>

          <p className="mt-2 text-sm text-blue-800">
            {summary.invoice_count} invoices
          </p>
        </article>

        <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
            Collected
          </p>

          <p className="mt-3 text-3xl font-black text-emerald-950">
            {formatCurrency(
              summary.collected_amount,
            )}
          </p>

          <p className="mt-2 text-sm font-semibold text-emerald-800">
            {summary.collection_percent.toFixed(
              1,
            )}
            % collected
          </p>
        </article>

        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
            Balance Due
          </p>

          <p className="mt-3 text-3xl font-black text-amber-950">
            {formatCurrency(
              summary.balance_due,
            )}
          </p>

          <p className="mt-2 text-sm text-amber-800">
            {summary.unpaid_invoice_count} unpaid invoices
          </p>
        </article>

        <article
          className={`rounded-2xl border p-5 shadow-sm ${
            summary.overdue_amount > 0
              ? "border-red-200 bg-red-50"
              : "border-slate-200 bg-white"
          }`}
        >
          <p
            className={`text-xs font-bold uppercase tracking-wide ${
              summary.overdue_amount > 0
                ? "text-red-700"
                : "text-slate-500"
            }`}
          >
            Overdue
          </p>

          <p
            className={`mt-3 text-3xl font-black ${
              summary.overdue_amount > 0
                ? "text-red-950"
                : "text-slate-950"
            }`}
          >
            {formatCurrency(
              summary.overdue_amount,
            )}
          </p>

          <p
            className={`mt-2 text-sm ${
              summary.overdue_amount > 0
                ? "text-red-800"
                : "text-slate-600"
            }`}
          >
            {summary.overdue_invoice_count} overdue invoices
          </p>
        </article>
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Approved Total
          </p>

          <p className="mt-1 text-xl font-black text-slate-950">
            {formatCurrency(
              summary.approved_amount,
            )}
          </p>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Not Yet Billed
          </p>

          <p className="mt-1 text-xl font-black text-slate-950">
            {formatCurrency(
              summary.not_billed_amount,
            )}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            {summary.not_billed_count} change orders
          </p>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Paid Invoices
          </p>

          <p className="mt-1 text-xl font-black text-slate-950">
            {summary.paid_invoice_count}
          </p>
        </article>
      </section>
    </>
  );
}
