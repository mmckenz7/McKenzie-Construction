"use client";

import Link from "next/link";
import {
  FormEvent,
  use,
  useCallback,
  useEffect,
  useState,
} from "react";

import FeatureDisabled from "@/components/features/feature-disabled";
import { useFeatures } from "@/components/features/use-features";

type PageProps = {
  params: Promise<{
    projectId: string;
    changeOrderId: string;
  }>;
};

type VendorRequestRecord = {
  id: string;
  recipientType: string;
  recipientName: string;
  recipientCompany: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  requestStatus: string;
  requestedScope: string | null;
  dueAt: string | null;
  expiresAt: string | null;
  sentAt: string | null;
  openedAt: string | null;
  submittedAt: string | null;
  declinedAt: string | null;
  reminderCount: number;
  publicPath: string;

  response: {
    id: string;
    responseStatus: string;
    responderName: string;
    quotedCost: number | null;
    earliestStartDate: string | null;
    expectedDeliveryDate: string | null;
    durationDays: number | null;
    leadTimeDays: number | null;
    quoteExpirationDate: string | null;
    notes: string | null;
    exclusions: string | null;
    acceptance: {
      id: string;
      responseId: string;
      acceptedAt: string;
    } | null;
  } | null;
};

const ACCEPTANCE_CONFIRMATION =
  "Accepting records this vendor response as the selected quote. It does not change customer price, estimated cost, schedule impact, line items, approval status, or billing.";

function formatCurrency(
  value: number | null,
) {
  if (value === null) {
    return "—";
  }

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
  ).format(new Date(value));
}

export default function VendorRequestsPage({
  params,
}: PageProps) {
  const route = use(params);

  const {
    isEnabled,
    loading: featuresLoading,
  } = useFeatures();

  const [
    requests,
    setRequests,
  ] = useState<
    VendorRequestRecord[]
  >([]);

  const [
    changeOrderTitle,
    setChangeOrderTitle,
  ] = useState("");

  const [
    changeOrderNumber,
    setChangeOrderNumber,
  ] = useState(0);

  const [
    changeOrderStatus,
    setChangeOrderStatus,
  ] = useState("");

  const [
    supersededByChangeOrderId,
    setSupersededByChangeOrderId,
  ] = useState<string | null>(null);

  const [
    canAcceptVendorResponse,
    setCanAcceptVendorResponse,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    actionId,
    setActionId,
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
    recipientType,
    setRecipientType,
  ] = useState<
    "subcontractor" | "supplier"
  >("subcontractor");

  const [
    recipientName,
    setRecipientName,
  ] = useState("");

  const [
    recipientCompany,
    setRecipientCompany,
  ] = useState("");

  const [
    recipientEmail,
    setRecipientEmail,
  ] = useState("");

  const [
    recipientPhone,
    setRecipientPhone,
  ] = useState("");

  const [
    requestedScope,
    setRequestedScope,
  ] = useState("");

  const [
    dueAt,
    setDueAt,
  ] = useState("");

  const loadRequests =
    useCallback(async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/projects/${route.projectId}/change-orders/${route.changeOrderId}/vendor-requests`,
          {
            credentials: "include",
            cache: "no-store",
          },
        );

        const result =
          (await response.json()) as {
            success?: boolean;
            error?: string;

            changeOrder?: {
              changeOrderNumber: number;
              title: string;
              status: string;
              supersededByChangeOrderId:
                | string
                | null;
            };

            requests?: VendorRequestRecord[];
            capabilities?: {
              canAcceptVendorResponse?: boolean;
            };
          };

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.error ??
              "Could not load vendor requests.",
          );
        }

        setRequests(
          result.requests ?? [],
        );

        setChangeOrderTitle(
          result.changeOrder?.title ??
            "",
        );

        setChangeOrderNumber(
          result.changeOrder
            ?.changeOrderNumber ?? 0,
        );

        setChangeOrderStatus(
          result.changeOrder?.status ??
            "",
        );

        setSupersededByChangeOrderId(
          result.changeOrder
            ?.supersededByChangeOrderId ??
            null,
        );

        setCanAcceptVendorResponse(
          result.capabilities
            ?.canAcceptVendorResponse ===
            true,
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load vendor requests.",
        );
      } finally {
        setLoading(false);
      }
    }, [
      route.projectId,
      route.changeOrderId,
    ]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  async function createRequest(
    event: FormEvent,
  ) {
    event.preventDefault();

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${route.projectId}/change-orders/${route.changeOrderId}/vendor-requests`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            recipientType,
            recipientName,
            recipientCompany,
            recipientEmail,
            recipientPhone,
            requestedScope,
            requestedCost: true,
            requestedSchedule: true,
            requestedLeadTime: true,
            requestedExpirationDate:
              true,
            requestedNotes: true,
            dueAt:
              dueAt || null,
            sendNow: true,
          }),
        },
      );

      const result =
        (await response.json()) as {
          success?: boolean;
          error?: string;
          request?: {
            publicPath?: string;
          };
        };

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "Could not create vendor request.",
        );
      }

      setRecipientName("");
      setRecipientCompany("");
      setRecipientEmail("");
      setRecipientPhone("");
      setRequestedScope("");
      setDueAt("");

      setNotice(
        result.request?.publicPath
          ? `Request created. Share ${window.location.origin}${result.request.publicPath}`
          : "Request created.",
      );

      await loadRequests();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not create vendor request.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function runAction(
    requestId: string,
    action:
      | "send"
      | "remind"
      | "cancel",
  ) {
    setActionId(requestId);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${route.projectId}/change-orders/${route.changeOrderId}/vendor-requests`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            requestId,
            action,
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
            "Could not update vendor request.",
        );
      }

      setNotice(
        action === "remind"
          ? "Reminder recorded."
          : action === "cancel"
            ? "Request cancelled."
            : "Request sent.",
      );

      await loadRequests();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Could not update vendor request.",
      );
    } finally {
      setActionId("");
    }
  }

  async function copyLink(
    publicPath: string,
  ) {
    await navigator.clipboard.writeText(
      `${window.location.origin}${publicPath}`,
    );

    setNotice(
      "Request link copied.",
    );
  }

  async function acceptResponse(
    requestRecord: VendorRequestRecord,
  ) {
    if (
      !requestRecord.response ||
      !window.confirm(
        ACCEPTANCE_CONFIRMATION,
      )
    ) {
      return;
    }

    setActionId(
      `accept:${requestRecord.id}`,
    );
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${route.projectId}/change-orders/${route.changeOrderId}/vendor-requests/${requestRecord.id}/responses/${requestRecord.response.id}/accept`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({}),
        },
      );

      const result =
        (await response.json()) as {
          success?: boolean;
          error?: string;
          revisionRequired?: boolean;
        };

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.revisionRequired
            ? "A draft revision is required before accepting this vendor response."
            : result.error ??
                "Could not accept the vendor response.",
        );
      }

      setNotice(
        "Vendor response accepted. No cost, schedule, line-item, approval, or billing values were changed.",
      );
      await loadRequests();
    } catch (acceptError) {
      setError(
        acceptError instanceof Error
          ? acceptError.message
          : "Could not accept the vendor response.",
      );
    } finally {
      setActionId("");
    }
  }

  if (featuresLoading) {
    return (
      <main className="mx-auto max-w-7xl px-5 py-8">
        <div className="h-48 animate-pulse rounded-2xl bg-slate-100" />
      </main>
    );
  }

  if (
    !isEnabled(
      "change_order_vendor_requests",
    )
  ) {
    return (
      <FeatureDisabled
        title="Vendor Requests Disabled"
        description="Updated cost and schedule requests for subcontractors and suppliers are disabled for this account."
        backHref={`/operations/projects/${route.projectId}/change-orders`}
        backLabel="Return to Change Orders"
      />
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <Link
        href={`/operations/projects/${route.projectId}/change-orders`}
        className="text-sm font-bold text-blue-800"
      >
        ← Change Orders
      </Link>

      <p className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">
        Change Order #
        {changeOrderNumber}
      </p>

      <h1 className="mt-2 text-3xl font-black text-slate-950">
        Subcontractor & Supplier Requests
      </h1>

      <p className="mt-2 text-slate-600">
        {changeOrderTitle}
      </p>

      {!loading &&
        (changeOrderStatus !== "draft" ||
          supersededByChangeOrderId) && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          A draft revision is required before a vendor response can be accepted.
        </div>
      )}

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

      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">
          Request Updated Schedule & Costs
        </h2>

        <form
          onSubmit={createRequest}
          className="mt-5 grid gap-4 lg:grid-cols-2"
        >
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Recipient Type

            <select
              value={recipientType}
              onChange={(event) =>
                setRecipientType(
                  event.target
                    .value as
                    | "subcontractor"
                    | "supplier",
                )
              }
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950"
            >
              <option value="subcontractor">
                Subcontractor
              </option>

              <option value="supplier">
                Supplier
              </option>
            </select>
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Contact Name

            <input
              required
              value={recipientName}
              onChange={(event) =>
                setRecipientName(
                  event.target.value,
                )
              }
              className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Company

            <input
              value={recipientCompany}
              onChange={(event) =>
                setRecipientCompany(
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
              value={recipientEmail}
              onChange={(event) =>
                setRecipientEmail(
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
              value={recipientPhone}
              onChange={(event) =>
                setRecipientPhone(
                  event.target.value,
                )
              }
              className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Response Due

            <input
              type="datetime-local"
              value={dueAt}
              onChange={(event) =>
                setDueAt(
                  event.target.value,
                )
              }
              className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700 lg:col-span-2">
            Scope to Price and Schedule

            <textarea
              required
              rows={5}
              value={requestedScope}
              onChange={(event) =>
                setRequestedScope(
                  event.target.value,
                )
              }
              placeholder="Describe the labor, materials, delivery, or installation information needed."
              className="rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-950"
            />
          </label>

          <div className="lg:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-blue-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving
                ? "Creating..."
                : "Create Request"}
            </button>
          </div>
        </form>
      </section>

      <section className="mt-7">
        <h2 className="text-xl font-bold text-slate-950">
          Requests & Responses
        </h2>

        {loading ? (
          <div className="mt-4 h-48 animate-pulse rounded-2xl bg-slate-100" />
        ) : requests.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">
            No subcontractor or supplier
            requests have been created.
          </div>
        ) : (
          <div className="mt-4 grid gap-5">
            {requests.map(
              (requestRecord) => (
                <article
                  key={requestRecord.id}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold capitalize text-blue-800">
                          {requestRecord.recipientType}
                        </span>

                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize text-slate-700">
                          {requestRecord.requestStatus.replaceAll(
                            "_",
                            " ",
                          )}
                        </span>
                      </div>

                      <h3 className="mt-3 text-lg font-bold text-slate-950">
                        {requestRecord.recipientName}
                      </h3>

                      {requestRecord.recipientCompany && (
                        <p className="mt-1 text-sm text-slate-600">
                          {requestRecord.recipientCompany}
                        </p>
                      )}

                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {requestRecord.requestedScope}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                        <span>
                          Due:{" "}
                          {formatDate(
                            requestRecord.dueAt,
                          )}
                        </span>

                        <span>
                          Opened:{" "}
                          {formatDate(
                            requestRecord.openedAt,
                          )}
                        </span>

                        <span>
                          Reminders:{" "}
                          {requestRecord.reminderCount}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void copyLink(
                            requestRecord.publicPath,
                          )
                        }
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700"
                      >
                        Copy Link
                      </button>

                      {![
                        "submitted",
                        "declined",
                        "cancelled",
                        "expired",
                      ].includes(
                        requestRecord.requestStatus,
                      ) && (
                        <>
                          <button
                            type="button"
                            disabled={
                              actionId ===
                              requestRecord.id
                            }
                            onClick={() =>
                              void runAction(
                                requestRecord.id,
                                "remind",
                              )
                            }
                            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800 disabled:opacity-50"
                          >
                            Send Reminder
                          </button>

                          <button
                            type="button"
                            disabled={
                              actionId ===
                              requestRecord.id
                            }
                            onClick={() =>
                              void runAction(
                                requestRecord.id,
                                "cancel",
                              )
                            }
                            className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-bold text-red-700 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {requestRecord.response && (
                    <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                      <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                        Vendor Response
                      </p>

                      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                            Updated Cost
                          </p>

                          <p className="mt-1 text-lg font-black text-emerald-950">
                            {formatCurrency(
                              requestRecord
                                .response
                                .quotedCost,
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                            Earliest Start
                          </p>

                          <p className="mt-1 font-bold text-emerald-950">
                            {formatDate(
                              requestRecord
                                .response
                                .earliestStartDate,
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                            Delivery
                          </p>

                          <p className="mt-1 font-bold text-emerald-950">
                            {formatDate(
                              requestRecord
                                .response
                                .expectedDeliveryDate,
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                            Lead Time
                          </p>

                          <p className="mt-1 font-bold text-emerald-950">
                            {requestRecord
                              .response
                              .leadTimeDays ??
                              "—"}{" "}
                            days
                          </p>
                        </div>
                      </div>

                      {requestRecord.response.notes && (
                        <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-emerald-900">
                          {
                            requestRecord
                              .response.notes
                          }
                        </p>
                      )}

                      {requestRecord.response.exclusions && (
                        <div className="mt-4 border-t border-emerald-200 pt-4">
                          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                            Exclusions
                          </p>

                          <p className="mt-2 whitespace-pre-wrap text-sm text-emerald-900">
                            {
                              requestRecord
                                .response
                                .exclusions
                            }
                          </p>
                        </div>
                      )}

                      {requestRecord.response
                        .acceptance ? (
                        <div className="mt-5 border-t border-emerald-200 pt-4">
                          <p className="font-bold text-emerald-950">
                            Accepted
                          </p>
                          <p className="mt-1 text-sm text-emerald-800">
                            {formatDate(
                              requestRecord
                                .response
                                .acceptance
                                .acceptedAt,
                            )}
                          </p>
                        </div>
                      ) : canAcceptVendorResponse &&
                        requestRecord.requestStatus ===
                          "submitted" &&
                        requestRecord.response
                          .responseStatus ===
                          "submitted" &&
                        changeOrderStatus ===
                          "draft" &&
                        !supersededByChangeOrderId &&
                        (!requestRecord.expiresAt ||
                          Date.parse(
                            requestRecord.expiresAt,
                          ) >= Date.now()) &&
                        (!requestRecord.response
                          .quoteExpirationDate ||
                          requestRecord.response
                            .quoteExpirationDate >=
                            new Date()
                              .toISOString()
                              .slice(0, 10)) ? (
                        <div className="mt-5 border-t border-emerald-200 pt-4">
                          <p className="text-sm text-emerald-900">
                            {ACCEPTANCE_CONFIRMATION}
                          </p>
                          <button
                            type="button"
                            disabled={
                              actionId ===
                              `accept:${requestRecord.id}`
                            }
                            onClick={() =>
                              void acceptResponse(
                                requestRecord,
                              )
                            }
                            className="mt-3 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                          >
                            {actionId ===
                            `accept:${requestRecord.id}`
                              ? "Accepting..."
                              : "Accept vendor response"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </article>
              ),
            )}
          </div>
        )}
      </section>
    </main>
  );
}
