"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
} from "react";
import { useParams } from "next/navigation";

type ResponseLineItem = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  salesTotal: number;
};

type ResponseRecord = {
  id: string;
  changeOrderId: string;
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
  approvalToken: string | null;
  createdAt: string;
  items: ResponseLineItem[];
};

type ApiResponse = {
  success: boolean;

  project?: {
    id: string;
    name: string;
    address: string;
  };

  response?: ResponseRecord;

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

function formatDateTime(
  value: string,
) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(new Date(value));
}

export default function ChangeOrderResponseRecordPage() {
  const params = useParams<{
    projectId: string;
    changeOrderId: string;
    responseId: string;
  }>();

  const [data, setData] =
    useState<ApiResponse | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    let mounted = true;

    async function loadResponse() {
      try {
        const response = await fetch(
          `/api/projects/${params.projectId}/change-orders/${params.changeOrderId}/responses/${params.responseId}`,
          {
            credentials: "include",
            cache: "no-store",
          },
        );

        const result =
          (await response.json()) as ApiResponse;

        if (!mounted) {
          return;
        }

        if (
          !response.ok ||
          !result.success ||
          !result.response ||
          !result.project
        ) {
          setError(
            result.error ??
              "Could not load the customer response record.",
          );
          return;
        }

        setData(result);
      } catch {
        if (mounted) {
          setError(
            "Could not load the customer response record.",
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadResponse();

    return () => {
      mounted = false;
    };
  }, [
    params.projectId,
    params.changeOrderId,
    params.responseId,
  ]);

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 px-4">
        <p className="text-sm font-semibold text-slate-600">
          Loading response record...
        </p>
      </main>
    );
  }

  if (
    error ||
    !data?.response ||
    !data.project
  ) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 px-4">
        <section className="w-full max-w-xl rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-slate-950">
            Response Record Unavailable
          </h1>

          <p className="mt-4 text-sm leading-6 text-red-700">
            {error ||
              "The requested record could not be found."}
          </p>
        </section>
      </main>
    );
  }

  const record =
    data.response;

  const approved =
    record.response === "approved";

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 print:bg-white print:p-0">
      <section className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        <header className="bg-slate-950 p-7 text-white print:border-b-2 print:border-slate-950 print:bg-white print:text-slate-950">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400 print:text-slate-700">
            McKenzie Construction
          </p>

          <h1 className="mt-3 text-3xl font-bold">
            Change Order Response Record
          </h1>

          <p className="mt-2 text-sm text-slate-300 print:text-slate-600">
            Permanent customer response
            archive
          </p>
        </header>

        <div className="p-7 sm:p-9">
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Project
              </p>

              <h2 className="mt-1 text-xl font-bold text-slate-950">
                {data.project.name}
              </h2>

              {data.project.address && (
                <p className="mt-1 text-sm text-slate-600">
                  {data.project.address}
                </p>
              )}
            </div>

            <span
              className={`w-fit rounded-full px-4 py-2 text-sm font-bold uppercase tracking-wide ${
                approved
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {record.response}
            </span>
          </div>

          <dl className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Info
              label="Change Order"
              value={`#${record.changeOrderNumber}`}
            />

            <Info
              label="Customer"
              value={record.customerName}
            />

            <Info
              label="Submitted"
              value={formatDateTime(
                record.submittedAt,
              )}
            />

            <Info
              label="Acknowledgement"
              value={
                record.acknowledgedTerms
                  ? "Acknowledged"
                  : "Not recorded"
              }
            />
          </dl>

          <section className="mt-8">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Change Order Title
            </p>

            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              {record.title}
            </h2>
          </section>

          <section className="mt-6">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Description
            </p>

            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-800">
              {record.description}
            </p>
          </section>

          {record.reason && (
            <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Reason for Change
              </p>

              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                {record.reason}
              </p>
            </section>
          )}

          {record.items.length > 0 && (
            <section className="mt-6 overflow-hidden rounded-xl border border-slate-200">
              <div className="bg-slate-50 px-5 py-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Line Items at Time of Response
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-white">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                        Description
                      </th>

                      <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                        Quantity
                      </th>

                      <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">
                        Unit Price
                      </th>

                      <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">
                        Total
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200 bg-white">
                    {record.items.map(
                      (item) => (
                        <tr key={item.id}>
                          <td className="px-5 py-4 text-sm font-semibold text-slate-900">
                            {item.description}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                            {item.quantity} {item.unit}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-right text-sm text-slate-700">
                            {formatCurrency(
                              item.unitPrice,
                            )}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-right text-sm font-bold text-slate-950">
                            {formatCurrency(
                              item.salesTotal,
                            )}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>

                  <tfoot className="border-t-2 border-slate-300 bg-slate-50">
                    <tr>
                      <td
                        colSpan={3}
                        className="px-5 py-4 text-right text-sm font-bold text-slate-700"
                      >
                        Response Total
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-right text-lg font-bold text-slate-950">
                        {formatCurrency(
                          record.amount,
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}

          <section className="mt-6 grid gap-4 sm:grid-cols-2">
            <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                Change Order Amount
              </p>

              <p className="mt-2 text-2xl font-bold text-emerald-950">
                {formatCurrency(
                  record.amount,
                )}
              </p>
            </article>

            <article className="rounded-xl border border-blue-200 bg-blue-50 p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                Schedule Impact
              </p>

              <p className="mt-2 text-2xl font-bold text-blue-950">
                {
                  record.scheduleImpactDays
                }{" "}
                days
              </p>
            </article>
          </section>

          {record.customerNotesSnapshot && (
            <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
                Change Order Notes Presented to Customer
              </p>

              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-950">
                {
                  record.customerNotesSnapshot
                }
              </p>
            </section>
          )}

          <section className="mt-6 rounded-xl border border-slate-300 bg-slate-50 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                Customer Agreement
              </p>

              {record.acknowledgedTerms && (
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800">
                  Acknowledged
                </span>
              )}
            </div>

            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-900">
              {record.agreementText}
            </p>
          </section>

          {record.customerNotes && (
            <section className="mt-6">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Customer Comments
              </p>

              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-800">
                {record.customerNotes}
              </p>
            </section>
          )}

          <footer className="mt-8 border-t border-slate-200 pt-6">
            <p className="text-xs leading-5 text-slate-500">
              Response Record ID:{" "}
              {record.id}
            </p>

            <p className="mt-1 text-xs leading-5 text-slate-500">
              This record reflects the
              change-order details and
              customer response stored at
              the time of submission.
            </p>
          </footer>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row print:hidden">
            <button
              type="button"
              onClick={() =>
                window.print()
              }
              className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white"
            >
              Print or Save as PDF
            </button>

            <Link
              href={`/operations/projects/${params.projectId}/change-orders`}
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-center text-sm font-bold text-slate-800"
            >
              Back to Change Orders
            </Link>
          </div>
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
