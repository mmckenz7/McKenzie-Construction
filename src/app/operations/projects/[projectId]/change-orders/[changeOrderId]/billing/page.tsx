"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";

type PageProps = {
  params: Promise<{
    projectId: string;
    changeOrderId: string;
  }>;
};

type ChangeOrder = {
  id: string;
  projectId: string;
  changeOrderNumber: number;
  title: string;
  status: string;
  amount: number;
  billingStatus: string;
  invoiceNumber: string | null;
  invoicedAt: string | null;
  amountPaid: number;
  balanceDue: number;
  paidAt: string | null;
  supersededByChangeOrderId:
    | string
    | null;
};

type Payment = {
  id: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string | null;
  referenceNumber: string | null;
  notes: string | null;
  createdAt: string;
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

function today() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}

export default function ChangeOrderBillingPage({
  params,
}: PageProps) {
  const [
    route,
    setRoute,
  ] = useState<{
    projectId: string;
    changeOrderId: string;
  } | null>(null);

  const [
    changeOrder,
    setChangeOrder,
  ] = useState<ChangeOrder | null>(
    null,
  );

  const [
    payments,
    setPayments,
  ] = useState<Payment[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    savingInvoice,
    setSavingInvoice,
  ] = useState(false);

  const [
    savingPayment,
    setSavingPayment,
  ] = useState(false);

  const [
    deletingPaymentId,
    setDeletingPaymentId,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  const [
    notice,
    setNotice,
  ] = useState("");

  const [
    invoiceNumber,
    setInvoiceNumber,
  ] = useState("");

  const [
    invoicedAt,
    setInvoicedAt,
  ] = useState("");

  const [
    paymentAmount,
    setPaymentAmount,
  ] = useState("");

  const [
    paymentDate,
    setPaymentDate,
  ] = useState(today());

  const [
    paymentMethod,
    setPaymentMethod,
  ] = useState("");

  const [
    referenceNumber,
    setReferenceNumber,
  ] = useState("");

  const [
    paymentNotes,
    setPaymentNotes,
  ] = useState("");

  useEffect(() => {
    void params.then(setRoute);
  }, [params]);

  const loadBilling =
    useCallback(async () => {
      if (!route) {
        return;
      }

      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/projects/${route.projectId}/change-orders/${route.changeOrderId}/billing`,
          {
            credentials: "include",
            cache: "no-store",
          },
        );

        const result =
          (await response.json()) as {
            success?: boolean;
            error?: string;
            changeOrder?: ChangeOrder;
            payments?: Payment[];
          };

        if (
          !response.ok ||
          !result.success ||
          !result.changeOrder
        ) {
          throw new Error(
            result.error ??
              "Could not load change-order billing.",
          );
        }

        setChangeOrder(
          result.changeOrder,
        );

        setPayments(
          result.payments ?? [],
        );

        setInvoiceNumber(
          result.changeOrder
            .invoiceNumber ?? "",
        );

        setInvoicedAt(
          result.changeOrder.invoicedAt
            ?.slice(0, 10) ?? "",
        );

        setPaymentAmount(
          result.changeOrder.balanceDue >
            0
            ? result.changeOrder.balanceDue.toFixed(
                2,
              )
            : "",
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load change-order billing.",
        );
      } finally {
        setLoading(false);
      }
    }, [route]);

  useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  async function saveInvoice(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (!route) {
      return;
    }

    setSavingInvoice(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${route.projectId}/change-orders/${route.changeOrderId}/billing`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            invoiceNumber,
            invoicedAt:
              invoicedAt || null,
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
            "Could not save invoice details.",
        );
      }

      setNotice(
        "Invoice details saved.",
      );

      await loadBilling();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save invoice details.",
      );
    } finally {
      setSavingInvoice(false);
    }
  }

  async function clearInvoice() {
    if (!route) {
      return;
    }

    const confirmed =
      window.confirm(
        "Remove the invoice details and return this change order to Not Billed?",
      );

    if (!confirmed) {
      return;
    }

    setSavingInvoice(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${route.projectId}/change-orders/${route.changeOrderId}/billing`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            billingStatus:
              "not_billed",
            invoiceNumber: null,
            invoicedAt: null,
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
            "Could not clear invoice details.",
        );
      }

      setNotice(
        "Invoice details removed.",
      );

      await loadBilling();
    } catch (clearError) {
      setError(
        clearError instanceof Error
          ? clearError.message
          : "Could not clear invoice details.",
      );
    } finally {
      setSavingInvoice(false);
    }
  }

  async function recordPayment(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (!route) {
      return;
    }

    setSavingPayment(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${route.projectId}/change-orders/${route.changeOrderId}/billing`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            amount:
              Number(paymentAmount),
            paymentDate,
            paymentMethod,
            referenceNumber,
            notes: paymentNotes,
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
            "Could not record payment.",
        );
      }

      setNotice(
        "Payment recorded.",
      );

      setPaymentMethod("");
      setReferenceNumber("");
      setPaymentNotes("");

      await loadBilling();
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "Could not record payment.",
      );
    } finally {
      setSavingPayment(false);
    }
  }

  async function deletePayment(
    payment: Payment,
  ) {
    if (!route) {
      return;
    }

    const confirmed =
      window.confirm(
        `Delete the ${formatCurrency(payment.amount)} payment from ${formatDate(payment.paymentDate)}?`,
      );

    if (!confirmed) {
      return;
    }

    setDeletingPaymentId(
      payment.id,
    );
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${route.projectId}/change-orders/${route.changeOrderId}/billing?paymentId=${payment.id}`,
        {
          method: "DELETE",
          credentials: "include",
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
            "Could not delete payment.",
        );
      }

      setNotice(
        "Payment deleted.",
      );

      await loadBilling();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete payment.",
      );
    } finally {
      setDeletingPaymentId("");
    }
  }

  if (
    loading ||
    !route
  ) {
    return (
      <main className="mx-auto max-w-7xl px-5 py-8">
        <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
      </main>
    );
  }

  if (
    error &&
    !changeOrder
  ) {
    return (
      <main className="mx-auto max-w-7xl px-5 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">
          {error}
        </div>
      </main>
    );
  }

  if (!changeOrder) {
    return null;
  }

  const canBill =
    !changeOrder
      .supersededByChangeOrderId &&
    [
      "approved",
      "in_progress",
      "completed",
    ].includes(
      changeOrder.status,
    );

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link
            href={`/operations/projects/${route.projectId}/change-orders`}
            className="text-sm font-bold text-blue-800"
          >
            ← Change Orders
          </Link>

          <p className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">
            Change Order #
            {
              changeOrder.changeOrderNumber
            }
          </p>

          <h1 className="mt-2 text-3xl font-black text-slate-950">
            Billing & Payments
          </h1>

          <p className="mt-2 text-slate-600">
            {changeOrder.title}
          </p>
        </div>

        <Link
          href={`/operations/projects/${route.projectId}/change-orders/${route.changeOrderId}/items`}
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-bold text-slate-800"
        >
          View Line Items
        </Link>
      </div>

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

      {!canBill && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="font-bold text-amber-950">
            Billing is unavailable
          </p>

          <p className="mt-2 text-sm text-amber-800">
            Only active approved change
            orders can be invoiced or
            receive payments.
          </p>
        </div>
      )}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Contract Amount
          </p>

          <p className="mt-3 text-3xl font-black text-slate-950">
            {formatCurrency(
              changeOrder.amount,
            )}
          </p>
        </article>

        <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
            Amount Paid
          </p>

          <p className="mt-3 text-3xl font-black text-emerald-950">
            {formatCurrency(
              changeOrder.amountPaid,
            )}
          </p>
        </article>

        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
            Balance Due
          </p>

          <p className="mt-3 text-3xl font-black text-amber-950">
            {formatCurrency(
              changeOrder.balanceDue,
            )}
          </p>
        </article>

        <article className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
            Billing Status
          </p>

          <p className="mt-3 text-xl font-black capitalize text-blue-950">
            {changeOrder.billingStatus.replaceAll(
              "_",
              " ",
            )}
          </p>

          {changeOrder.paidAt && (
            <p className="mt-2 text-sm text-blue-800">
              Paid{" "}
              {formatDate(
                changeOrder.paidAt,
              )}
            </p>
          )}
        </article>
      </section>

      <div className="mt-7 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-950">
            Invoice Details
          </h2>

          <form
            onSubmit={saveInvoice}
            className="mt-5 grid gap-4"
          >
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Invoice Number

              <input
                value={invoiceNumber}
                onChange={(event) =>
                  setInvoiceNumber(
                    event.target.value,
                  )
                }
                disabled={!canBill}
                placeholder="INV-1001"
                className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950 disabled:bg-slate-100"
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Invoice Date

              <input
                type="date"
                value={invoicedAt}
                onChange={(event) =>
                  setInvoicedAt(
                    event.target.value,
                  )
                }
                disabled={!canBill}
                className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950 disabled:bg-slate-100"
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={
                  !canBill ||
                  savingInvoice
                }
                className="rounded-xl bg-blue-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {savingInvoice
                  ? "Saving..."
                  : "Save Invoice"}
              </button>

              {changeOrder.billingStatus !==
                "not_billed" && (
                <button
                  type="button"
                  onClick={() =>
                    void clearInvoice()
                  }
                  disabled={
                    !canBill ||
                    savingInvoice ||
                    changeOrder.amountPaid >
                      0
                  }
                  className="rounded-xl border border-red-300 bg-white px-5 py-3 text-sm font-bold text-red-700 disabled:opacity-50"
                >
                  Remove Invoice
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-950">
            Record Payment
          </h2>

          <form
            onSubmit={recordPayment}
            className="mt-5 grid gap-4 sm:grid-cols-2"
          >
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Amount

              <input
                type="number"
                min="0.01"
                max={
                  changeOrder.balanceDue
                }
                step="0.01"
                required
                value={paymentAmount}
                onChange={(event) =>
                  setPaymentAmount(
                    event.target.value,
                  )
                }
                disabled={
                  !canBill ||
                  changeOrder.balanceDue <=
                    0
                }
                className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950 disabled:bg-slate-100"
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Payment Date

              <input
                type="date"
                required
                value={paymentDate}
                onChange={(event) =>
                  setPaymentDate(
                    event.target.value,
                  )
                }
                disabled={!canBill}
                className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950 disabled:bg-slate-100"
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Payment Method

              <select
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(
                    event.target.value,
                  )
                }
                disabled={!canBill}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950 disabled:bg-slate-100"
              >
                <option value="">
                  Select method
                </option>

                <option value="check">
                  Check
                </option>

                <option value="cash">
                  Cash
                </option>

                <option value="card">
                  Card
                </option>

                <option value="ach">
                  ACH
                </option>

                <option value="wire">
                  Wire
                </option>

                <option value="other">
                  Other
                </option>
              </select>
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Reference Number

              <input
                value={referenceNumber}
                onChange={(event) =>
                  setReferenceNumber(
                    event.target.value,
                  )
                }
                disabled={!canBill}
                placeholder="Check or transaction number"
                className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950 disabled:bg-slate-100"
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-700 sm:col-span-2">
              Notes

              <textarea
                value={paymentNotes}
                onChange={(event) =>
                  setPaymentNotes(
                    event.target.value,
                  )
                }
                disabled={!canBill}
                rows={3}
                className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950 disabled:bg-slate-100"
              />
            </label>

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={
                  !canBill ||
                  savingPayment ||
                  changeOrder.balanceDue <=
                    0
                }
                className="rounded-xl bg-emerald-800 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {savingPayment
                  ? "Recording..."
                  : "Record Payment"}
              </button>
            </div>
          </form>
        </section>
      </div>

      <section className="mt-7 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <h2 className="text-xl font-bold text-slate-950">
            Payment History
          </h2>
        </div>

        {payments.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-600">
            No payments have been
            recorded.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    Date
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    Method
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    Reference
                  </th>

                  <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">
                    Amount
                  </th>

                  <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {payments.map(
                  (payment) => (
                    <tr key={payment.id}>
                      <td className="px-6 py-4 text-sm font-semibold text-slate-900">
                        {formatDate(
                          payment.paymentDate,
                        )}

                        {payment.notes && (
                          <p className="mt-1 max-w-md text-xs font-normal text-slate-500">
                            {payment.notes}
                          </p>
                        )}
                      </td>

                      <td className="px-6 py-4 text-sm capitalize text-slate-700">
                        {payment.paymentMethod?.replaceAll(
                          "_",
                          " ",
                        ) ?? "—"}
                      </td>

                      <td className="px-6 py-4 text-sm text-slate-700">
                        {payment.referenceNumber ??
                          "—"}
                      </td>

                      <td className="px-6 py-4 text-right text-sm font-bold text-emerald-800">
                        {formatCurrency(
                          payment.amount,
                        )}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          disabled={
                            deletingPaymentId ===
                            payment.id
                          }
                          onClick={() =>
                            void deletePayment(
                              payment,
                            )
                          }
                          className="rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50"
                        >
                          {deletingPaymentId ===
                          payment.id
                            ? "Deleting..."
                            : "Delete"}
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
