"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";
import { useParams } from "next/navigation";

type ChangeOrderStatus =
  | "draft"
  | "pending_customer"
  | "approved"
  | "declined"
  | "in_progress"
  | "completed"
  | "cancelled";

type ChangeOrderLineItem = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  sales_total: number;
};

type ChangeOrder = {
  id: string;
  change_order_number: number;
  title: string;
  description: string;
  reason: string | null;
  status: ChangeOrderStatus;
  amount: number;
  schedule_impact_days: number;
  customer_notes: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  declined_at: string | null;
  customer_response_notes:
    | string
    | null;
  customer_acknowledged_terms?: boolean;
  customer_agreement_text?:
    | string
    | null;
  approval_expires_at:
    | string
    | null;
  line_items?: ChangeOrderLineItem[];
  project: {
    id: string;
    name: string;
    address: string;
  };
};

type ApiResponse = {
  success: boolean;
  changeOrder?: ChangeOrder;
  expired?: boolean;
  alreadySubmitted?: boolean;
  result?: {
    status?: ChangeOrderStatus;
    approved_by_name?: string | null;
    approved_at?: string | null;
    declined_at?: string | null;
  };
  error?: string;
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
      month: "long",
      day: "numeric",
      year: "numeric",
    },
  ).format(new Date(value));
}

export default function ChangeOrderApprovalPage() {
  const params = useParams<{
    token: string;
  }>();

  const [changeOrder, setChangeOrder] =
    useState<ChangeOrder | null>(
      null,
    );

  const [customerName, setCustomerName] =
    useState("");

  const [notes, setNotes] =
    useState("");

  const [
    acknowledgedTerms,
    setAcknowledgedTerms,
  ] = useState(false);

  const [selectedResponse, setSelectedResponse] =
    useState<
      "approved" | "declined" | null
    >(null);

  const [loading, setLoading] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState("");

  const [expired, setExpired] =
    useState(false);

  const [
    submittedStatus,
    setSubmittedStatus,
  ] = useState<
    "approved" | "declined" | null
  >(null);

  useEffect(() => {
    let mounted = true;

    async function loadChangeOrder() {
      try {
        const response = await fetch(
          `/api/change-orders/${params.token}`,
          {
            cache: "no-store",
          },
        );

        const result =
          (await response.json()) as ApiResponse;

        if (!mounted) {
          return;
        }

        if (result.expired) {
          setExpired(true);
          setError(
            result.error ??
              "This approval link has expired.",
          );
          return;
        }

        if (
          !response.ok ||
          !result.success ||
          !result.changeOrder
        ) {
          setError(
            result.error ??
              "Change order not found.",
          );
          return;
        }

        setChangeOrder(
          result.changeOrder,
        );

        if (
          result.changeOrder.status ===
            "approved" ||
          result.changeOrder.status ===
            "declined"
        ) {
          setSubmittedStatus(
            result.changeOrder.status,
          );
        }
      } catch {
        if (mounted) {
          setError(
            "The change order could not be loaded.",
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadChangeOrder();

    return () => {
      mounted = false;
    };
  }, [params.token]);

  async function submitResponse(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError("");

    if (!selectedResponse) {
      setError(
        "Choose approve or decline.",
      );
      return;
    }

    if (!customerName.trim()) {
      setError(
        "Enter your name.",
      );
      return;
    }

    if (!acknowledgedTerms) {
      setError(
        "Acknowledge the change-order terms before submitting.",
      );
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(
        `/api/change-orders/${params.token}`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            response:
              selectedResponse,
            customerName,
            notes: notes || null,
            acknowledgedTerms,
          }),
        },
      );

      const result =
        (await response.json()) as ApiResponse;

      if (
        result.alreadySubmitted
      ) {
        const status =
          result.result?.status;

        if (
          status === "approved" ||
          status === "declined"
        ) {
          setSubmittedStatus(status);
          return;
        }
      }

      if (
        !response.ok ||
        !result.success
      ) {
        setError(
          result.error ??
            "Your response could not be saved.",
        );
        return;
      }

      setSubmittedStatus(
        selectedResponse,
      );

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch {
      setError(
        "Your response could not be saved.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 px-4">
        <p className="text-sm font-semibold text-slate-600">
          Loading change order...
        </p>
      </main>
    );
  }

  if (
    !changeOrder ||
    expired
  ) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 px-4 py-8">
        <section className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">
            McKenzie Construction
          </p>

          <h1 className="mt-3 text-2xl font-bold text-slate-950">
            Change Order Unavailable
          </h1>

          <p className="mt-4 text-sm leading-6 text-red-700">
            {error ||
              "This change order could not be found."}
          </p>
        </section>
      </main>
    );
  }

  if (submittedStatus) {
    const approved =
      submittedStatus === "approved";

    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 px-4 py-8">
        <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div
            className={`mx-auto grid h-16 w-16 place-items-center rounded-full text-3xl ${
              approved
                ? "bg-emerald-100 text-emerald-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {approved ? "✓" : "×"}
          </div>

          <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-amber-600">
            McKenzie Construction
          </p>

          <h1 className="mt-3 text-2xl font-bold text-slate-950">
            {approved
              ? "Change Order Approved"
              : "Change Order Declined"}
          </h1>

          <p className="mt-4 text-sm leading-6 text-slate-600">
            Your response for Change
            Order #
            {
              changeOrder.change_order_number
            }{" "}
            has been recorded.
          </p>

          <div className="mt-6 rounded-xl bg-slate-50 p-5 text-left">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Project
            </p>

            <p className="mt-1 font-bold text-slate-950">
              {
                changeOrder.project.name
              }
            </p>

            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">
              Change Order
            </p>

            <p className="mt-1 font-bold text-slate-950">
              {changeOrder.title}
            </p>

            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">
              Amount
            </p>

            <p className="mt-1 text-lg font-bold text-slate-950">
              {formatCurrency(
                changeOrder.amount,
              )}
            </p>

            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">
              Schedule Impact
            </p>

            <p className="mt-1 font-bold text-slate-950">
              {
                changeOrder.schedule_impact_days
              }{" "}
              days
            </p>

            {changeOrder.approved_by_name && (
              <>
                <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Approved By
                </p>

                <p className="mt-1 font-bold text-slate-950">
                  {
                    changeOrder.approved_by_name
                  }
                </p>
              </>
            )}

            {(changeOrder.approved_at ||
              changeOrder.declined_at) && (
              <>
                <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Response Date
                </p>

                <p className="mt-1 font-bold text-slate-950">
                  {formatDate(
                    changeOrder.approved_at ??
                      changeOrder.declined_at,
                  )}
                </p>
              </>
            )}

            {changeOrder.customer_response_notes && (
              <>
                <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Customer Comments
                </p>

                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                  {
                    changeOrder.customer_response_notes
                  }
                </p>
              </>
            )}

            {changeOrder.customer_agreement_text && (
              <>
                <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Customer Agreement
                </p>

                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                  {
                    changeOrder.customer_agreement_text
                  }
                </p>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() =>
              window.print()
            }
            className="mt-6 w-full rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800 print:hidden"
          >
            Print or Save as PDF
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 sm:py-10">
      <section className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="bg-slate-950 p-6 text-white sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
            McKenzie Construction
          </p>

          <h1 className="mt-3 text-2xl font-bold sm:text-3xl">
            Change Order Approval
          </h1>

          <p className="mt-2 text-sm leading-6 text-slate-300">
            Review the project change,
            pricing, and schedule impact
            before responding.
          </p>
        </header>

        <div className="border-b border-slate-200 bg-slate-50 p-6 sm:p-8">
          <dl className="grid gap-5 sm:grid-cols-2">
            <Info
              label="Project"
              value={
                changeOrder.project.name
              }
            />

            <Info
              label="Job Address"
              value={
                changeOrder.project.address ||
                "—"
              }
            />

            <Info
              label="Change Order"
              value={`#${changeOrder.change_order_number}`}
            />

            <Info
              label="Approval Expires"
              value={formatDate(
                changeOrder.approval_expires_at,
              )}
            />
          </dl>
        </div>

        <div className="space-y-6 p-6 sm:p-8">
          <div className="flex justify-end print:hidden">
            <button
              type="button"
              onClick={() =>
                window.print()
              }
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800"
            >
              Print Change Order
            </button>
          </div>

          <section>
            <h2 className="text-2xl font-bold text-slate-950">
              {changeOrder.title}
            </h2>

            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">
              {changeOrder.description}
            </p>
          </section>

          {changeOrder.reason && (
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Reason for Change
              </p>

              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                {changeOrder.reason}
              </p>
            </section>
          )}

          <section className="grid gap-4 sm:grid-cols-2">
            <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                Change Order Amount
              </p>

              <p className="mt-2 text-3xl font-bold text-emerald-950">
                {formatCurrency(
                  changeOrder.amount,
                )}
              </p>
            </article>

            <article className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                Schedule Impact
              </p>

              <p className="mt-2 text-3xl font-bold text-blue-950">
                {
                  changeOrder.schedule_impact_days
                }{" "}
                days
              </p>
            </article>
          </section>

          {changeOrder.customer_notes && (
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
                Customer Notes
              </p>

              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-950">
                {
                  changeOrder.customer_notes
                }
              </p>
            </section>
          )}

          <form
            onSubmit={submitResponse}
            className="border-t border-slate-200 pt-6"
          >
            <h2 className="text-xl font-bold text-slate-950">
              Your Response
            </h2>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() =>
                  setSelectedResponse(
                    "approved",
                  )
                }
                className={`rounded-xl border px-5 py-4 text-sm font-bold ${
                  selectedResponse ===
                  "approved"
                    ? "border-emerald-700 bg-emerald-100 text-emerald-900"
                    : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                ✓ Approve Change Order
              </button>

              <button
                type="button"
                onClick={() =>
                  setSelectedResponse(
                    "declined",
                  )
                }
                className={`rounded-xl border px-5 py-4 text-sm font-bold ${
                  selectedResponse ===
                  "declined"
                    ? "border-red-700 bg-red-100 text-red-900"
                    : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                × Decline Change Order
              </button>
            </div>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-bold text-slate-800">
                Your Name
              </span>

              <input
                type="text"
                value={customerName}
                onChange={(event) =>
                  setCustomerName(
                    event.target.value,
                  )
                }
                placeholder="Full name"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
              />
            </label>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-bold text-slate-800">
                Comments
              </span>

              <textarea
                rows={4}
                value={notes}
                onChange={(event) =>
                  setNotes(
                    event.target.value,
                  )
                }
                placeholder="Optional questions or comments"
                className="w-full resize-y rounded-xl border border-slate-300 px-4 py-3 text-sm"
              />
            </label>

            <label className="mt-5 flex items-start gap-3 rounded-xl border border-slate-300 bg-slate-50 p-4">
              <input
                type="checkbox"
                checked={
                  acknowledgedTerms
                }
                onChange={(event) =>
                  setAcknowledgedTerms(
                    event.target.checked,
                  )
                }
                className="mt-1 h-4 w-4 shrink-0"
              />

              <span className="text-sm leading-6 text-slate-700">
                {selectedResponse ===
                "approved"
                  ? "I approve this change order, including the stated price and schedule impact, and authorize McKenzie Construction to proceed with the described work."
                  : selectedResponse ===
                      "declined"
                    ? "I decline this change order and understand that McKenzie Construction is not authorized to proceed with the described additional work."
                    : "I have reviewed the change-order details and understand that my submitted response will be recorded."}
              </span>
            </label>

            {error && (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={
                submitting ||
                !selectedResponse ||
                !acknowledgedTerms
              }
              className="mt-5 w-full rounded-xl bg-slate-950 px-5 py-4 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? "Submitting..."
                : selectedResponse ===
                    "approved"
                  ? "Confirm Approval"
                  : selectedResponse ===
                      "declined"
                    ? "Confirm Decline"
                    : "Select a Response"}
            </button>

            <p className="mt-4 text-center text-xs leading-5 text-slate-500">
              Your response, name, date,
              and submitted comments will be
              stored with this change order.
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </dt>

      <dd className="mt-1 text-sm font-semibold text-slate-900">
        {value}
      </dd>
    </div>
  );
}
