"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

type ProjectCost = {
  id: string;
  project_id: string;
  cost_type: string;
  description: string;
  vendor_name: string | null;
  amount: number;
  cost_date: string | null;
  payment_status: string;
  payment_method: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type CostSummary = {
  grossCosts: number;
  refunds: number;
  netCosts: number;
  unpaidCosts: number;
  paidCosts: number;
  totalsByType: Record<string, number>;
  contractValue: number;
  projectedProfit: number;
  projectedMargin: number | null;
};

type CostFormState = {
  costType: string;
  description: string;
  vendorName: string;
  amount: string;
  costDate: string;
  paymentStatus: string;
  paymentMethod: string;
  referenceNumber: string;
  notes: string;
};

type ProjectCostManagerProps = {
  projectId: string;
};

const initialSummary: CostSummary = {
  grossCosts: 0,
  refunds: 0,
  netCosts: 0,
  unpaidCosts: 0,
  paidCosts: 0,
  totalsByType: {},
  contractValue: 0,
  projectedProfit: 0,
  projectedMargin: null,
};

function getTodayDate() {
  const now = new Date();
  const offset =
    now.getTimezoneOffset();

  return new Date(
    now.getTime() -
      offset * 60000,
  )
    .toISOString()
    .slice(0, 10);
}

function getInitialForm(): CostFormState {
  return {
    costType: "materials",
    description: "",
    vendorName: "",
    amount: "",
    costDate: getTodayDate(),
    paymentStatus: "unpaid",
    paymentMethod: "",
    referenceNumber: "",
    notes: "",
  };
}

function formatMoney(
  value: number,
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  ).format(value);
}

function formatPercent(
  value: number | null,
) {
  if (value === null) {
    return "—";
  }

  return `${value.toFixed(2)}%`;
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

function formatLabel(
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

function getPaymentStatusClasses(
  status: string,
) {
  switch (status) {
    case "paid":
      return "bg-emerald-100 text-emerald-800";

    case "reimbursed":
      return "bg-blue-100 text-blue-800";

    case "partially_paid":
      return "bg-amber-100 text-amber-800";

    case "void":
      return "bg-slate-200 text-slate-700";

    default:
      return "bg-red-100 text-red-800";
  }
}

function getCostTypeClasses(
  costType: string,
) {
  if (
    costType === "refund"
  ) {
    return "bg-emerald-100 text-emerald-800";
  }

  if (
    costType ===
      "subcontractor" ||
    costType === "labor"
  ) {
    return "bg-violet-100 text-violet-800";
  }

  if (
    costType ===
      "materials" ||
    costType === "delivery"
  ) {
    return "bg-blue-100 text-blue-800";
  }

  return "bg-slate-100 text-slate-700";
}

export function ProjectCostManager({
  projectId,
}: ProjectCostManagerProps) {
  const [
    costs,
    setCosts,
  ] = useState<ProjectCost[]>([]);

  const [
    summary,
    setSummary,
  ] = useState<CostSummary>(
    initialSummary,
  );

  const [
    form,
    setForm,
  ] =
    useState<CostFormState>(
      getInitialForm,
    );

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    success,
    setSuccess,
  ] = useState("");

  const loadCosts =
    useCallback(async () => {
      setIsLoading(true);
      setError("");

      try {
        const response =
          await fetch(
            `/api/projects/${projectId}/costs`,
            {
              method: "GET",
              cache: "no-store",
            },
          );

        const result =
          (await response.json()) as {
            success?: boolean;
            error?: string;
            costs?: ProjectCost[];
            summary?: CostSummary;
          };

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.error ??
              "Project costs could not be loaded.",
          );
        }

        setCosts(
          result.costs ?? [],
        );

        setSummary(
          result.summary ??
            initialSummary,
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Project costs could not be loaded.",
        );
      } finally {
        setIsLoading(false);
      }
    }, [projectId]);

  useEffect(() => {
    void loadCosts();
  }, [loadCosts]);

  const sortedTypeTotals =
    useMemo(
      () =>
        Object.entries(
          summary.totalsByType,
        )
          .filter(
            ([, total]) =>
              total !== 0,
          )
          .sort(
            (
              [, firstTotal],
              [, secondTotal],
            ) =>
              secondTotal -
              firstTotal,
          ),
      [summary.totalsByType],
    );

  function updateField(
    field: keyof CostFormState,
    value: string,
  ) {
    setForm(
      (current) => ({
        ...current,
        [field]: value,
      }),
    );
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (
      !form.description.trim()
    ) {
      setError(
        "A cost description is required.",
      );

      return;
    }

    const amount =
      Number(
        form.amount.replace(
          /[$,\s]/g,
          "",
        ),
      );

    if (
      !Number.isFinite(amount) ||
      amount < 0
    ) {
      setError(
        "Enter a valid non-negative amount.",
      );

      return;
    }

    setIsSubmitting(true);

    try {
      const response =
        await fetch(
          `/api/projects/${projectId}/costs`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              costType:
                form.costType,
              description:
                form.description,
              vendorName:
                form.vendorName,
              amount:
                form.amount,
              costDate:
                form.costDate,
              paymentStatus:
                form.paymentStatus,
              paymentMethod:
                form.paymentMethod,
              referenceNumber:
                form.referenceNumber,
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
            "The project cost could not be created.",
        );
      }

      setSuccess(
        "Project cost added successfully.",
      );

      setForm(
        getInitialForm(),
      );

      await loadCosts();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The project cost could not be created.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
            Project Financials
          </p>

          <h2 className="mt-1 text-2xl font-bold text-slate-950">
            Costs and Profit
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Record actual project
            expenses, payments,
            refunds, and credits to
            track current project
            profitability.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            void loadCosts()
          }
          disabled={isLoading}
          className="w-fit rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-slate-950 disabled:opacity-60"
        >
          {isLoading
            ? "Refreshing..."
            : "Refresh Costs"}
        </button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
            Contract Value
          </p>

          <p className="mt-2 text-xl font-bold text-slate-950">
            {formatMoney(
              summary.contractValue,
            )}
          </p>
        </article>

        <article className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-red-700">
            Net Costs
          </p>

          <p className="mt-2 text-xl font-bold text-red-800">
            {formatMoney(
              summary.netCosts,
            )}
          </p>
        </article>

        <article
          className={`rounded-xl border p-4 ${
            summary.projectedProfit >=
            0
              ? "border-emerald-200 bg-emerald-50"
              : "border-red-200 bg-red-50"
          }`}
        >
          <p
            className={`text-[11px] font-bold uppercase tracking-widest ${
              summary.projectedProfit >=
              0
                ? "text-emerald-700"
                : "text-red-700"
            }`}
          >
            Projected Profit
          </p>

          <p
            className={`mt-2 text-xl font-bold ${
              summary.projectedProfit >=
              0
                ? "text-emerald-800"
                : "text-red-800"
            }`}
          >
            {formatMoney(
              summary.projectedProfit,
            )}
          </p>
        </article>

        <article className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-blue-700">
            Profit Margin
          </p>

          <p className="mt-2 text-xl font-bold text-blue-800">
            {formatPercent(
              summary.projectedMargin,
            )}
          </p>
        </article>

        <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700">
            Paid Costs
          </p>

          <p className="mt-2 text-xl font-bold text-emerald-800">
            {formatMoney(
              summary.paidCosts,
            )}
          </p>
        </article>

        <article className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-amber-700">
            Unpaid Costs
          </p>

          <p className="mt-2 text-xl font-bold text-amber-800">
            {formatMoney(
              summary.unpaidCosts,
            )}
          </p>
        </article>
      </div>

      {summary.refunds > 0 ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-800">
            Refunds and credits
            recorded:{" "}
            {formatMoney(
              summary.refunds,
            )}
          </p>
        </div>
      ) : null}

      {sortedTypeTotals.length >
      0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-bold text-slate-950">
            Costs by Type
          </h3>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {sortedTypeTotals.map(
              ([
                costType,
                total,
              ]) => (
                <div
                  key={costType}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                    {formatLabel(
                      costType,
                    )}
                  </p>

                  <p className="mt-1 font-bold text-slate-950">
                    {formatMoney(
                      total,
                    )}
                  </p>
                </div>
              ),
            )}
          </div>
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5"
      >
        <h3 className="text-lg font-bold text-slate-950">
          Add Project Cost
        </h3>

        <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <label>
            <span className="text-sm font-bold text-slate-800">
              Cost type
            </span>

            <select
              value={form.costType}
              onChange={(event) =>
                updateField(
                  "costType",
                  event.target.value,
                )
              }
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="materials">
                Materials
              </option>

              <option value="labor">
                Labor
              </option>

              <option value="subcontractor">
                Subcontractor
              </option>

              <option value="equipment">
                Equipment
              </option>

              <option value="dumpster">
                Dumpster
              </option>

              <option value="permit">
                Permit
              </option>

              <option value="delivery">
                Delivery
              </option>

              <option value="change_order">
                Change Order Cost
              </option>

              <option value="refund">
                Refund or Credit
              </option>

              <option value="overhead">
                Overhead
              </option>

              <option value="other">
                Other
              </option>
            </select>
          </label>

          <label className="md:col-span-2">
            <span className="text-sm font-bold text-slate-800">
              Description
            </span>

            <input
              type="text"
              required
              value={
                form.description
              }
              onChange={(event) =>
                updateField(
                  "description",
                  event.target.value,
                )
              }
              placeholder="Example: Lowe's decking materials"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
            />
          </label>

          <label>
            <span className="text-sm font-bold text-slate-800">
              Amount
            </span>

            <input
              type="text"
              inputMode="decimal"
              required
              value={form.amount}
              onChange={(event) =>
                updateField(
                  "amount",
                  event.target.value,
                )
              }
              placeholder="$0.00"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
            />
          </label>

          <label>
            <span className="text-sm font-bold text-slate-800">
              Cost date
            </span>

            <input
              type="date"
              value={form.costDate}
              onChange={(event) =>
                updateField(
                  "costDate",
                  event.target.value,
                )
              }
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
            />
          </label>

          <label>
            <span className="text-sm font-bold text-slate-800">
              Payment status
            </span>

            <select
              value={
                form.paymentStatus
              }
              onChange={(event) =>
                updateField(
                  "paymentStatus",
                  event.target.value,
                )
              }
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="unpaid">
                Unpaid
              </option>

              <option value="partially_paid">
                Partially Paid
              </option>

              <option value="paid">
                Paid
              </option>

              <option value="reimbursed">
                Reimbursed
              </option>

              <option value="void">
                Void
              </option>
            </select>
          </label>

          <label>
            <span className="text-sm font-bold text-slate-800">
              Vendor or payee
            </span>

            <input
              type="text"
              value={
                form.vendorName
              }
              onChange={(event) =>
                updateField(
                  "vendorName",
                  event.target.value,
                )
              }
              placeholder="Vendor, employee, or subcontractor"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
            />
          </label>

          <label>
            <span className="text-sm font-bold text-slate-800">
              Payment method
            </span>

            <input
              type="text"
              value={
                form.paymentMethod
              }
              onChange={(event) =>
                updateField(
                  "paymentMethod",
                  event.target.value,
                )
              }
              placeholder="Check, card, cash, ACH"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
            />
          </label>

          <label>
            <span className="text-sm font-bold text-slate-800">
              Reference number
            </span>

            <input
              type="text"
              value={
                form.referenceNumber
              }
              onChange={(event) =>
                updateField(
                  "referenceNumber",
                  event.target.value,
                )
              }
              placeholder="Invoice, receipt, or check number"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
            />
          </label>

          <label className="md:col-span-2 xl:col-span-3">
            <span className="text-sm font-bold text-slate-800">
              Notes
            </span>

            <textarea
              rows={3}
              value={form.notes}
              onChange={(event) =>
                updateField(
                  "notes",
                  event.target.value,
                )
              }
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
            />
          </label>
        </div>

        {error ? (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {success}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {isSubmitting
            ? "Adding Cost..."
            : "Add Cost"}
        </button>
      </form>

      <div className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-lg font-bold text-slate-950">
            Cost History
          </h3>

          <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-bold text-white">
            {costs.length}
          </span>
        </div>

        {isLoading ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
            Loading project costs...
          </div>
        ) : costs.length === 0 ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-6">
            <p className="text-sm font-semibold text-slate-700">
              No project costs have
              been recorded.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 hidden overflow-x-auto rounded-xl border border-slate-200 lg:block">
              <table className="min-w-full border-collapse bg-white">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200 text-left">
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                      Date
                    </th>

                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                      Description
                    </th>

                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                      Type
                    </th>

                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                      Vendor
                    </th>

                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                      Payment
                    </th>

                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-widest text-slate-500">
                      Amount
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {costs.map(
                    (cost) => (
                      <tr
                        key={cost.id}
                        className="border-b border-slate-100"
                      >
                        <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-700">
                          {formatDate(
                            cost.cost_date,
                          )}
                        </td>

                        <td className="px-4 py-4">
                          <p className="font-bold text-slate-950">
                            {
                              cost.description
                            }
                          </p>

                          {cost.reference_number ? (
                            <p className="mt-1 text-xs text-slate-500">
                              Reference:{" "}
                              {
                                cost.reference_number
                              }
                            </p>
                          ) : null}

                          {cost.notes ? (
                            <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">
                              {cost.notes}
                            </p>
                          ) : null}
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getCostTypeClasses(
                              cost.cost_type,
                            )}`}
                          >
                            {formatLabel(
                              cost.cost_type,
                            )}
                          </span>
                        </td>

                        <td className="px-4 py-4 text-sm font-semibold text-slate-700">
                          {cost.vendor_name ??
                            "—"}
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getPaymentStatusClasses(
                              cost.payment_status,
                            )}`}
                          >
                            {formatLabel(
                              cost.payment_status,
                            )}
                          </span>

                          {cost.payment_method ? (
                            <p className="mt-1 text-xs text-slate-500">
                              {
                                cost.payment_method
                              }
                            </p>
                          ) : null}
                        </td>

                        <td
                          className={`whitespace-nowrap px-4 py-4 text-right font-bold ${
                            cost.cost_type ===
                            "refund"
                              ? "text-emerald-700"
                              : "text-slate-950"
                          }`}
                        >
                          {cost.cost_type ===
                          "refund"
                            ? "−"
                            : ""}
                          {formatMoney(
                            cost.amount,
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 space-y-3 lg:hidden">
              {costs.map(
                (cost) => (
                  <article
                    key={cost.id}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-bold text-slate-950">
                          {
                            cost.description
                          }
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {formatDate(
                            cost.cost_date,
                          )}
                        </p>
                      </div>

                      <p
                        className={`shrink-0 font-bold ${
                          cost.cost_type ===
                          "refund"
                            ? "text-emerald-700"
                            : "text-slate-950"
                        }`}
                      >
                        {cost.cost_type ===
                        "refund"
                          ? "−"
                          : ""}
                        {formatMoney(
                          cost.amount,
                        )}
                      </p>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${getCostTypeClasses(
                          cost.cost_type,
                        )}`}
                      >
                        {formatLabel(
                          cost.cost_type,
                        )}
                      </span>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${getPaymentStatusClasses(
                          cost.payment_status,
                        )}`}
                      >
                        {formatLabel(
                          cost.payment_status,
                        )}
                      </span>
                    </div>

                    {cost.vendor_name ? (
                      <p className="mt-3 text-sm text-slate-700">
                        Vendor:{" "}
                        <span className="font-semibold">
                          {
                            cost.vendor_name
                          }
                        </span>
                      </p>
                    ) : null}

                    {cost.notes ? (
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {cost.notes}
                      </p>
                    ) : null}
                  </article>
                ),
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}