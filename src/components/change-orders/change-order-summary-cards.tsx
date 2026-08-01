"use client";

import {
  useEffect,
  useState,
} from "react";

type ChangeOrderSummary = {
  total_count: number;
  draft_count: number;
  pending_count: number;
  approved_count: number;
  declined_count: number;
  draft_amount: number;
  pending_amount: number;
  approved_amount: number;
  approved_cost: number;
  approved_profit: number;
  approved_margin_percent: number;
  approved_schedule_impact_days: number;
  awaiting_customer_count: number;
  unopened_approval_count: number;
  expired_approval_count: number;
};

type Props = {
  projectId?: string;
  refreshKey?: string | number;
};

const EMPTY_SUMMARY: ChangeOrderSummary = {
  total_count: 0,
  draft_count: 0,
  pending_count: 0,
  approved_count: 0,
  declined_count: 0,
  draft_amount: 0,
  pending_amount: 0,
  approved_amount: 0,
  approved_cost: 0,
  approved_profit: 0,
  approved_margin_percent: 0,
  approved_schedule_impact_days: 0,
  awaiting_customer_count: 0,
  unopened_approval_count: 0,
  expired_approval_count: 0,
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
  value: Partial<ChangeOrderSummary>,
): ChangeOrderSummary {
  return {
    total_count:
      numberValue(value.total_count),

    draft_count:
      numberValue(value.draft_count),

    pending_count:
      numberValue(value.pending_count),

    approved_count:
      numberValue(value.approved_count),

    declined_count:
      numberValue(value.declined_count),

    draft_amount:
      numberValue(value.draft_amount),

    pending_amount:
      numberValue(value.pending_amount),

    approved_amount:
      numberValue(value.approved_amount),

    approved_cost:
      numberValue(value.approved_cost),

    approved_profit:
      numberValue(value.approved_profit),

    approved_margin_percent:
      numberValue(
        value.approved_margin_percent,
      ),

    approved_schedule_impact_days:
      numberValue(
        value.approved_schedule_impact_days,
      ),

    awaiting_customer_count:
      numberValue(
        value.awaiting_customer_count,
      ),

    unopened_approval_count:
      numberValue(
        value.unopened_approval_count,
      ),

    expired_approval_count:
      numberValue(
        value.expired_approval_count,
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

function formatPercent(
  value: number,
) {
  return `${value.toFixed(1)}%`;
}

export default function ChangeOrderSummaryCards({
  projectId,
  refreshKey,
}: Props) {
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

      const endpoint = projectId
        ? `/api/projects/${projectId}/change-orders/summary`
        : "/api/change-orders/summary";

      try {
        const response =
          await fetch(endpoint, {
            credentials: "include",
            cache: "no-store",
          });

        const result =
          (await response.json()) as {
            success?: boolean;
            error?: string;
            summary?: Partial<ChangeOrderSummary>;
          };

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.error ??
              "Could not load change-order totals.",
          );
        }

        if (!cancelled) {
          setSummary(
            normalizeSummary(
              result.summary ?? {},
            ),
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load change-order totals.",
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
  }, [
    projectId,
    refreshKey,
  ]);

  if (loading) {
    return (
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({
          length: 4,
        }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-slate-100"
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
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Approved Revenue
          </p>

          <p className="mt-3 text-3xl font-black text-slate-950">
            {formatCurrency(
              summary.approved_amount,
            )}
          </p>

          <p className="mt-2 text-sm text-slate-600">
            {summary.approved_count} active approved change orders
          </p>
        </article>

        <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
            Approved Profit
          </p>

          <p className="mt-3 text-3xl font-black text-emerald-950">
            {formatCurrency(
              summary.approved_profit,
            )}
          </p>

          <p className="mt-2 text-sm font-semibold text-emerald-800">
            {formatPercent(
              summary.approved_margin_percent,
            )} gross margin
          </p>
        </article>

        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
            Awaiting Customer
          </p>

          <p className="mt-3 text-3xl font-black text-amber-950">
            {formatCurrency(
              summary.pending_amount,
            )}
          </p>

          <p className="mt-2 text-sm text-amber-800">
            {summary.awaiting_customer_count} pending ·{" "}
            {summary.unopened_approval_count} unopened
          </p>
        </article>

        <article className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
            Draft Pipeline
          </p>

          <p className="mt-3 text-3xl font-black text-blue-950">
            {formatCurrency(
              summary.draft_amount,
            )}
          </p>

          <p className="mt-2 text-sm text-blue-800">
            {summary.draft_count} drafts in progress
          </p>
        </article>
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Active Versions
          </p>

          <p className="mt-1 text-xl font-black text-slate-950">
            {summary.total_count}
          </p>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Approved Cost
          </p>

          <p className="mt-1 text-xl font-black text-slate-950">
            {formatCurrency(
              summary.approved_cost,
            )}
          </p>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Schedule Impact
          </p>

          <p className="mt-1 text-xl font-black text-slate-950">
            {
              summary.approved_schedule_impact_days
            }{" "}
            days
          </p>
        </article>

        <article
          className={`rounded-xl border px-4 py-3 ${
            summary.expired_approval_count > 0
              ? "border-red-200 bg-red-50"
              : "border-slate-200 bg-white"
          }`}
        >
          <p
            className={`text-xs font-bold uppercase tracking-wide ${
              summary.expired_approval_count > 0
                ? "text-red-700"
                : "text-slate-500"
            }`}
          >
            Expired Approvals
          </p>

          <p
            className={`mt-1 text-xl font-black ${
              summary.expired_approval_count > 0
                ? "text-red-950"
                : "text-slate-950"
            }`}
          >
            {
              summary.expired_approval_count
            }
          </p>
        </article>
      </section>
    </>
  );
}
