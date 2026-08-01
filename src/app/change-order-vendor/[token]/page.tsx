"use client";

import {
  FormEvent,
  use,
  useEffect,
  useState,
} from "react";

type PageProps = {
  params: Promise<{
    token: string;
  }>;
};

type VendorRequest = {
  unavailable?: boolean;
  status?: string;
  request_status?: string;
  recipient_type?: string;
  recipient_name?: string;
  recipient_company?: string | null;
  requested_scope?: string | null;
  requested_cost?: boolean;
  requested_schedule?: boolean;
  requested_lead_time?: boolean;
  requested_expiration_date?: boolean;
  requested_notes?: boolean;
  due_at?: string | null;
  expires_at?: string | null;

  change_order?: {
    id: string;
    change_order_number: number;
    title: string;
    description: string | null;
    amount: number;
    schedule_impact_days: number;
  };

  project?: {
    id: string;
    name: string;
    address: string;
  };
};

function formatDate(
  value: string | null | undefined,
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

export default function VendorRequestPage({
  params,
}: PageProps) {
  const { token } = use(params);

  const [
    vendorRequest,
    setVendorRequest,
  ] = useState<VendorRequest | null>(
    null,
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    submitted,
    setSubmitted,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    responderName,
    setResponderName,
  ] = useState("");

  const [
    responderEmail,
    setResponderEmail,
  ] = useState("");

  const [
    responderPhone,
    setResponderPhone,
  ] = useState("");

  const [
    quotedCost,
    setQuotedCost,
  ] = useState("");

  const [
    earliestStartDate,
    setEarliestStartDate,
  ] = useState("");

  const [
    expectedDeliveryDate,
    setExpectedDeliveryDate,
  ] = useState("");

  const [
    durationDays,
    setDurationDays,
  ] = useState("");

  const [
    leadTimeDays,
    setLeadTimeDays,
  ] = useState("");

  const [
    quoteExpirationDate,
    setQuoteExpirationDate,
  ] = useState("");

  const [
    notes,
    setNotes,
  ] = useState("");

  const [
    exclusions,
    setExclusions,
  ] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadRequest() {
      try {
        const response = await fetch(
          `/api/change-order-vendor/${token}`,
          {
            cache: "no-store",
          },
        );

        const result =
          (await response.json()) as {
            success?: boolean;
            error?: string;
            request?: VendorRequest;
          };

        if (
          !response.ok ||
          !result.success ||
          !result.request
        ) {
          throw new Error(
            result.error ??
              "Could not load this request.",
          );
        }

        if (!cancelled) {
          setVendorRequest(
            result.request,
          );

          setResponderName(
            result.request
              .recipient_name ?? "",
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load this request.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadRequest();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submitResponse(
    event: FormEvent,
    responseStatus:
      | "submitted"
      | "declined",
  ) {
    event.preventDefault();

    setSaving(true);
    setError("");

    try {
      const response = await fetch(
        `/api/change-order-vendor/${token}`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            responseStatus,
            responderName,
            responderEmail,
            responderPhone,
            quotedCost:
              quotedCost
                ? Number(quotedCost)
                : null,
            earliestStartDate:
              earliestStartDate ||
              null,
            expectedDeliveryDate:
              expectedDeliveryDate ||
              null,
            durationDays:
              durationDays
                ? Number(durationDays)
                : null,
            leadTimeDays:
              leadTimeDays
                ? Number(leadTimeDays)
                : null,
            quoteExpirationDate:
              quoteExpirationDate ||
              null,
            notes,
            exclusions,
            attachmentUrls: [],
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
            "Could not submit your response.",
        );
      }

      setSubmitted(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not submit your response.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-10">
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      </main>
    );
  }

  if (
    error &&
    !vendorRequest
  ) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-10">
        <section className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-red-900">
          <h1 className="text-2xl font-black">
            Request unavailable
          </h1>

          <p className="mt-3">
            {error}
          </p>
        </section>
      </main>
    );
  }

  if (
    vendorRequest?.unavailable
  ) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-10">
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-950">
          <h1 className="text-2xl font-black">
            Request unavailable
          </h1>

          <p className="mt-3">
            This request is{" "}
            {vendorRequest.status ??
              "no longer active"}.
          </p>
        </section>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-10">
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center text-emerald-950">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
            Response received
          </p>

          <h1 className="mt-3 text-3xl font-black">
            Thank you
          </h1>

          <p className="mt-3">
            McKenzie Construction has
            received your updated cost
            and schedule information.
          </p>
        </section>
      </main>
    );
  }

  if (!vendorRequest) {
    return null;
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:py-12">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
          McKenzie Construction
        </p>

        <h1 className="mt-3 text-3xl font-black text-slate-950">
          Updated Schedule & Cost Request
        </h1>

        <p className="mt-3 text-slate-600">
          Please provide your current
          pricing and availability for
          the work below.
        </p>

        <div className="mt-6 grid gap-4 rounded-xl bg-slate-50 p-5 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Project
            </p>

            <p className="mt-1 font-bold text-slate-950">
              {vendorRequest.project
                ?.name ?? "Project"}
            </p>

            {vendorRequest.project
              ?.address && (
              <p className="mt-1 text-sm text-slate-600">
                {
                  vendorRequest.project
                    .address
                }
              </p>
            )}
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Change Order
            </p>

            <p className="mt-1 font-bold text-slate-950">
              #
              {
                vendorRequest
                  .change_order
                  ?.change_order_number
              }{" "}
              {
                vendorRequest
                  .change_order?.title
              }
            </p>
          </div>

          {vendorRequest.due_at && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Response Due
              </p>

              <p className="mt-1 font-semibold text-slate-900">
                {formatDate(
                  vendorRequest.due_at,
                )}
              </p>
            </div>
          )}

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Requested From
            </p>

            <p className="mt-1 font-semibold text-slate-900">
              {
                vendorRequest.recipient_name
              }
              {vendorRequest
                .recipient_company
                ? ` · ${vendorRequest.recipient_company}`
                : ""}
            </p>
          </div>
        </div>

        {vendorRequest.requested_scope && (
          <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
              Requested Scope
            </p>

            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-blue-950">
              {
                vendorRequest.requested_scope
              }
            </p>
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {error}
          </div>
        )}

        <form
          className="mt-7 grid gap-5"
          onSubmit={(event) =>
            void submitResponse(
              event,
              "submitted",
            )
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Your Name

              <input
                required
                value={responderName}
                onChange={(event) =>
                  setResponderName(
                    event.target.value,
                  )
                }
                className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Email

              <input
                type="email"
                value={responderEmail}
                onChange={(event) =>
                  setResponderEmail(
                    event.target.value,
                  )
                }
                className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Phone

              <input
                type="tel"
                value={responderPhone}
                onChange={(event) =>
                  setResponderPhone(
                    event.target.value,
                  )
                }
                className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
              />
            </label>

            {vendorRequest.requested_cost && (
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Updated Cost

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={quotedCost}
                  onChange={(event) =>
                    setQuotedCost(
                      event.target.value,
                    )
                  }
                  className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                />
              </label>
            )}
          </div>

          {vendorRequest.requested_schedule && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Earliest Start Date

                <input
                  type="date"
                  value={
                    earliestStartDate
                  }
                  onChange={(event) =>
                    setEarliestStartDate(
                      event.target.value,
                    )
                  }
                  className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                />
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Expected Delivery Date

                <input
                  type="date"
                  value={
                    expectedDeliveryDate
                  }
                  onChange={(event) =>
                    setExpectedDeliveryDate(
                      event.target.value,
                    )
                  }
                  className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                />
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Duration in Days

                <input
                  type="number"
                  min="0"
                  step="1"
                  value={durationDays}
                  onChange={(event) =>
                    setDurationDays(
                      event.target.value,
                    )
                  }
                  className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                />
              </label>

              {vendorRequest.requested_lead_time && (
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Lead Time in Days

                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={leadTimeDays}
                    onChange={(event) =>
                      setLeadTimeDays(
                        event.target.value,
                      )
                    }
                    className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                  />
                </label>
              )}
            </div>
          )}

          {vendorRequest
            .requested_expiration_date && (
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Quote Expiration Date

              <input
                type="date"
                value={
                  quoteExpirationDate
                }
                onChange={(event) =>
                  setQuoteExpirationDate(
                    event.target.value,
                  )
                }
                className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
              />
            </label>
          )}

          {vendorRequest.requested_notes && (
            <>
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Notes

                <textarea
                  rows={4}
                  value={notes}
                  onChange={(event) =>
                    setNotes(
                      event.target.value,
                    )
                  }
                  className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                />
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Exclusions or Conditions

                <textarea
                  rows={3}
                  value={exclusions}
                  onChange={(event) =>
                    setExclusions(
                      event.target.value,
                    )
                  }
                  className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
                />
              </label>
            </>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-emerald-800 px-5 py-3 font-bold text-white disabled:opacity-50"
            >
              {saving
                ? "Submitting..."
                : "Submit Updated Cost & Schedule"}
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={(event) =>
                void submitResponse(
                  event as unknown as FormEvent,
                  "declined",
                )
              }
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-bold text-slate-700 disabled:opacity-50"
            >
              Decline Request
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
