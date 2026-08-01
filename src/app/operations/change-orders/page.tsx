"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

type ChangeOrder = {
  id: string;
  projectId: string;
  changeOrderNumber: number;
  title: string;
  description: string;
  status: string;
  amount: number;
  costAmount: number | null;
  scheduleImpactDays: number;
  requestedBy: string | null;
  approvedByName: string | null;
  approvalToken: string | null;
  customerResponseNotes: string | null;
  customerAcknowledgedTerms: boolean;
  customerAgreementText: string | null;
  approvalSentAt: string | null;
  approvalOpenedAt: string | null;
  approvalExpiresAt: string | null;
  approvalReminderSentAt: string | null;
  approvalReminderCount: number;
  approvedAt: string | null;
  declinedAt: string | null;
  responseReviewedAt:
    | string
    | null;
  responseCount: number;
  createdAt: string;
  updatedAt: string;
  project: {
    id: string;
    name: string;
    address: string;
  } | null;
};

type ApiResponse = {
  success: boolean;
  changeOrders?: ChangeOrder[];
  summary?: {
    total: number;
    pendingCustomer: number;
    approved: number;
    needsReview: number;
    approvedRevenue: number;
    pendingRevenue: number;
    approvedProfit: number;
  };
  error?: string;
};

type Filter =
  | "all"
  | "needs_review"
  | "pending_customer"
  | "approved"
  | "draft"
  | "closed";

const approvedStatuses =
  new Set([
    "approved",
    "in_progress",
    "completed",
  ]);

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
  ).format(new Date(value));
}

function statusClasses(
  status: string,
) {
  if (
    status === "approved" ||
    status === "completed"
  ) {
    return "bg-emerald-100 text-emerald-800";
  }

  if (
    status === "pending_customer"
  ) {
    return "bg-amber-100 text-amber-800";
  }

  if (
    status === "declined" ||
    status === "cancelled"
  ) {
    return "bg-red-100 text-red-800";
  }

  if (status === "expired") {
    return "bg-orange-100 text-orange-800";
  }

  if (status === "in_progress") {
    return "bg-blue-100 text-blue-800";
  }

  return "bg-slate-100 text-slate-700";
}

export default function ChangeOrdersOverviewPage() {
  const [
    changeOrders,
    setChangeOrders,
  ] = useState<ChangeOrder[]>([]);

  const [summary, setSummary] =
    useState({
      total: 0,
      pendingCustomer: 0,
      approved: 0,
      needsReview: 0,
      approvedRevenue: 0,
      pendingRevenue: 0,
      approvedProfit: 0,
    });

  const [filter, setFilter] =
    useState<Filter>("needs_review");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [notice, setNotice] =
    useState("");

  const [
    actionChangeOrderId,
    setActionChangeOrderId,
  ] = useState("");

  async function loadChangeOrders() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/change-orders",
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
            "Could not load change orders.",
        );
        return;
      }

      setChangeOrders(
        result.changeOrders ?? [],
      );

      setSummary(
        result.summary ?? {
          total: 0,
          pendingCustomer: 0,
          approved: 0,
          needsReview: 0,
          approvedRevenue: 0,
          pendingRevenue: 0,
          approvedProfit: 0,
        },
      );
    } catch {
      setError(
        "Could not load change orders.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadChangeOrders();
  }, []);

  async function createApprovalLink(
    changeOrder: ChangeOrder,
  ) {
    setActionChangeOrderId(
      changeOrder.id,
    );
    setNotice("");
    setError("");

    try {
      const response = await fetch(
        `/api/projects/${changeOrder.projectId}/change-orders/${changeOrder.id}/approval-link`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            expiresInDays: 14,
          }),
        },
      );

      const result =
        (await response.json()) as {
          success?: boolean;
          error?: string;
          changeOrder?: {
            approvalToken?: string;
          };
        };

      const approvalToken =
        result.changeOrder
          ?.approvalToken;

      if (
        !response.ok ||
        !result.success ||
        !approvalToken
      ) {
        setError(
          result.error ??
            "Could not create the customer approval link.",
        );
        return;
      }

      const link =
        `${window.location.origin}/change-order/${approvalToken}`;

      await navigator.clipboard.writeText(
        link,
      );

      setNotice(
        changeOrder.approvalToken
          ? "Old approval and response record cleared. New approval link copied."
          : "Customer approval link created and copied.",
      );

      await loadChangeOrders();
    } catch {
      setError(
        "Could not create the customer approval link.",
      );
    } finally {
      setActionChangeOrderId("");
    }
  }

  async function copyApprovalLink(
    changeOrder: ChangeOrder,
  ) {
    if (!changeOrder.approvalToken) {
      return;
    }

    const link =
      `${window.location.origin}/change-order/${changeOrder.approvalToken}`;

    await navigator.clipboard.writeText(
      link,
    );

    setNotice(
      "Customer approval link copied.",
    );
  }

  async function copyApprovalMessage(
    changeOrder: ChangeOrder,
  ) {
    if (!changeOrder.approvalToken) {
      return;
    }

    const link =
      `${window.location.origin}/change-order/${changeOrder.approvalToken}`;

    const projectName =
      changeOrder.project?.name ??
      "your project";

    const message =
      `McKenzie Construction has sent Change Order #${changeOrder.changeOrderNumber} for ${projectName}. ` +
      `The amount is ${formatCurrency(
        changeOrder.amount,
      )} with a schedule impact of ${changeOrder.scheduleImpactDays} days. ` +
      `Review and respond here: ${link}`;

    await navigator.clipboard.writeText(
      message,
    );

    setNotice(
      "Customer text message copied.",
    );
  }

  async function revokeApprovalLink(
    changeOrder: ChangeOrder,
  ) {
    const confirmed =
      window.confirm(
        "Disable this customer approval link and return the change order to Draft?",
      );

    if (!confirmed) {
      return;
    }

    setActionChangeOrderId(
      changeOrder.id,
    );
    setNotice("");
    setError("");

    try {
      const response = await fetch(
        `/api/projects/${changeOrder.projectId}/change-orders/${changeOrder.id}/revoke-approval`,
        {
          method: "PATCH",
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
        setError(
          result.error ??
            "Could not revoke the customer approval link.",
        );
        return;
      }

      setNotice(
        "Customer approval link revoked. Change order returned to Draft.",
      );

      await loadChangeOrders();
    } catch {
      setError(
        "Could not revoke the customer approval link.",
      );
    } finally {
      setActionChangeOrderId("");
    }
  }

  async function copyReminderMessage(
    changeOrder: ChangeOrder,
  ) {
    if (!changeOrder.approvalToken) {
      return;
    }

    setActionChangeOrderId(
      changeOrder.id,
    );
    setNotice("");
    setError("");

    try {
      const response = await fetch(
        `/api/projects/${changeOrder.projectId}/change-orders/${changeOrder.id}/reminder`,
        {
          method: "PATCH",
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
        setError(
          result.error ??
            "Could not record the approval reminder.",
        );
        return;
      }

      const link =
        `${window.location.origin}/change-order/${changeOrder.approvalToken}`;

      const message =
        `Reminder from McKenzie Construction: Change Order #${changeOrder.changeOrderNumber} for ${changeOrder.project?.name ?? "your project"} is still waiting for your response. ` +
        `The amount is ${formatCurrency(
          changeOrder.amount,
        )}. Review and respond here: ${link}`;

      await navigator.clipboard.writeText(
        message,
      );

      setNotice(
        "Reminder recorded and customer text copied.",
      );

      await loadChangeOrders();
    } catch {
      setError(
        "Could not record the approval reminder.",
      );
    } finally {
      setActionChangeOrderId("");
    }
  }

  async function markResponseReviewed(
    changeOrder: ChangeOrder,
  ) {
    setActionChangeOrderId(
      changeOrder.id,
    );
    setNotice("");
    setError("");

    try {
      const response = await fetch(
        `/api/projects/${changeOrder.projectId}/change-orders/${changeOrder.id}/review-response`,
        {
          method: "PATCH",
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
        setError(
          result.error ??
            "Could not mark the customer response reviewed.",
        );
        return;
      }

      setNotice(
        "Customer response marked reviewed.",
      );

      await loadChangeOrders();
    } catch {
      setError(
        "Could not mark the customer response reviewed.",
      );
    } finally {
      setActionChangeOrderId("");
    }
  }

  const filteredChangeOrders =
    useMemo(
      () =>
        changeOrders.filter(
          (item) => {
            if (filter === "all") {
              return true;
            }

            if (
              filter ===
              "needs_review"
            ) {
              return (
                (
                  item.status ===
                    "approved" ||
                  item.status ===
                    "declined"
                ) &&
                !item.responseReviewedAt
              );
            }

            if (
              filter ===
              "pending_customer"
            ) {
              return (
                item.status ===
                "pending_customer"
              );
            }

            if (
              filter === "approved"
            ) {
              return approvedStatuses.has(
                item.status,
              );
            }

            if (filter === "draft") {
              return (
                item.status === "draft"
              );
            }

            return (
              item.status ===
                "declined" ||
              item.status ===
                "cancelled"
            );
          },
        ),
      [changeOrders, filter],
    );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
            Operations
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">
            Change Orders
          </h1>

          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
            Review change orders across
            every project, customer
            responses, revenue, profit,
            and schedule impact.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/operations/change-orders/responses"
            className="rounded-xl border border-violet-300 bg-violet-50 px-4 py-3 text-center text-sm font-bold text-violet-800"
          >
            Response Archive
          </Link>

          <button
            type="button"
            onClick={() =>
              void loadChangeOrders()
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800"
          >
            Refresh
          </button>
        </div>
      </div>

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Needs Review"
          value={String(
            summary.needsReview,
          )}
        />

        <Stat
          label="Waiting on Customer"
          value={String(
            summary.pendingCustomer,
          )}
        />

        <Stat
          label="Approved Revenue"
          value={formatCurrency(
            summary.approvedRevenue,
          )}
        />

        <Stat
          label="Approved Profit"
          value={formatCurrency(
            summary.approvedProfit,
          )}
        />
      </section>

      <div className="mt-7 flex flex-wrap gap-2">
        <FilterButton
          active={
            filter === "needs_review"
          }
          onClick={() =>
            setFilter("needs_review")
          }
        >
          Needs Review
        </FilterButton>

        <FilterButton
          active={
            filter ===
            "pending_customer"
          }
          onClick={() =>
            setFilter(
              "pending_customer",
            )
          }
        >
          Waiting on Customer
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
          active={filter === "draft"}
          onClick={() =>
            setFilter("draft")
          }
        >
          Drafts
        </FilterButton>

        <FilterButton
          active={filter === "closed"}
          onClick={() =>
            setFilter("closed")
          }
        >
          Declined / Cancelled
        </FilterButton>

        <FilterButton
          active={filter === "all"}
          onClick={() =>
            setFilter("all")
          }
        >
          All
        </FilterButton>
      </div>

      {notice && (
        <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {notice}
        </p>
      )}

      {error && (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-8 text-sm text-slate-600">
          Loading change orders...
        </p>
      ) : filteredChangeOrders.length ===
        0 ? (
        <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-xl font-bold text-slate-950">
            No change orders found
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            There are no change orders
            matching this filter.
          </p>
        </section>
      ) : (
        <section className="mt-6 grid gap-5">
          {filteredChangeOrders.map(
            (changeOrder) => {
              const profit =
                changeOrder.amount -
                (changeOrder.costAmount ??
                  0);

              return (
                <article
                  key={changeOrder.id}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-[0.15em] text-blue-700">
                          Change Order #
                          {
                            changeOrder.changeOrderNumber
                          }
                        </span>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${statusClasses(
                            changeOrder.status,
                          )}`}
                        >
                          {changeOrder.status.replaceAll(
                            "_",
                            " ",
                          )}
                        </span>

                        {(
                          changeOrder.status ===
                            "approved" ||
                          changeOrder.status ===
                            "declined"
                        ) &&
                          !changeOrder.responseReviewedAt && (
                            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-violet-800">
                              Needs Office Review
                            </span>
                          )}
                      </div>

                      <h2 className="mt-3 text-xl font-bold text-slate-950">
                        {changeOrder.title}
                      </h2>

                      <p className="mt-2 text-sm font-semibold text-slate-700">
                        {changeOrder.project
                          ?.name ??
                          "Project"}
                      </p>

                      {changeOrder.project
                        ?.address && (
                        <p className="mt-1 text-sm text-slate-500">
                          {
                            changeOrder
                              .project.address
                          }
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                      <Link
                        href={`/operations/projects/${changeOrder.projectId}`}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-bold text-slate-700"
                      >
                        Open Project
                      </Link>

                      <Link
                        href={`/operations/projects/${changeOrder.projectId}/change-orders`}
                        className="rounded-xl bg-blue-950 px-4 py-3 text-center text-sm font-bold text-white"
                      >
                        Manage Change Order
                      </Link>
                    </div>
                  </div>

                  <dl className="mt-5 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-6">
                    <Info
                      label="Customer Price"
                      value={formatCurrency(
                        changeOrder.amount,
                      )}
                    />

                    <Info
                      label="Estimated Cost"
                      value={
                        changeOrder.costAmount ===
                        null
                          ? "—"
                          : formatCurrency(
                              changeOrder.costAmount,
                            )
                      }
                    />

                    <Info
                      label="Estimated Profit"
                      value={formatCurrency(
                        profit,
                      )}
                    />

                    <Info
                      label="Schedule Impact"
                      value={`${changeOrder.scheduleImpactDays} days`}
                    />

                    <Info
                      label="Response Records"
                      value={String(
                        changeOrder.responseCount,
                      )}
                    />

                    <Info
                      label="Last Updated"
                      value={formatDate(
                        changeOrder.updatedAt,
                      )}
                    />
                  </dl>

                  {![
                    "completed",
                    "cancelled",
                  ].includes(
                    changeOrder.status,
                  ) && (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                          <p className="text-sm font-bold text-amber-900">
                            Customer approval
                          </p>

                          <p className="mt-1 text-sm text-amber-800">
                            {changeOrder.approvalOpenedAt
                              ? `Opened ${formatDate(
                                  changeOrder.approvalOpenedAt,
                                )}`
                              : changeOrder.approvalSentAt
                                ? `Created ${formatDate(
                                    changeOrder.approvalSentAt,
                                  )}`
                                : "Approval link has not been created."}
                            {changeOrder.approvalExpiresAt
                              ? ` · Expires ${formatDate(
                                  changeOrder.approvalExpiresAt,
                                )}`
                              : ""}
                          </p>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row">
                          <button
                            type="button"
                            disabled={
                              actionChangeOrderId ===
                              changeOrder.id
                            }
                            onClick={() =>
                              void createApprovalLink(
                                changeOrder,
                              )
                            }
                            className="rounded-lg bg-amber-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                          >
                            {actionChangeOrderId ===
                            changeOrder.id
                              ? "Saving..."
                              : changeOrder.approvalToken
                                ? "Replace Link"
                                : "Create Link"}
                          </button>

                          {changeOrder.approvalToken && (
                            <>
                              <a
                                href={`/change-order/${changeOrder.approvalToken}`}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-center text-sm font-bold text-amber-900"
                              >
                                Preview
                              </a>

                              <button
                                type="button"
                                onClick={() =>
                                  void copyApprovalLink(
                                    changeOrder,
                                  )
                                }
                                className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-900"
                              >
                                Copy Link
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  void copyApprovalMessage(
                                    changeOrder,
                                  )
                                }
                                className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-900"
                              >
                                Copy Text
                              </button>

                              {changeOrder.status ===
                                "pending_customer" && (
                                <>
                                  <button
                                    type="button"
                                    disabled={
                                      actionChangeOrderId ===
                                      changeOrder.id
                                    }
                                    onClick={() =>
                                      void copyReminderMessage(
                                        changeOrder,
                                      )
                                    }
                                    className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                                  >
                                    {actionChangeOrderId ===
                                    changeOrder.id
                                      ? "Saving..."
                                      : "Copy Reminder"}
                                  </button>

                                  <button
                                    type="button"
                                    disabled={
                                      actionChangeOrderId ===
                                      changeOrder.id
                                    }
                                    onClick={() =>
                                      void revokeApprovalLink(
                                        changeOrder,
                                      )
                                    }
                                    className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-50"
                                  >
                                    Revoke Link
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {changeOrder.approvedAt && (
                    <p className="mt-4 text-sm font-semibold text-emerald-800">
                      Approved{" "}
                      {formatDate(
                        changeOrder.approvedAt,
                      )}
                      {changeOrder.approvedByName
                        ? ` by ${changeOrder.approvedByName}`
                        : ""}
                    </p>
                  )}

                  {changeOrder.declinedAt && (
                    <p className="mt-4 text-sm font-semibold text-red-800">
                      Declined{" "}
                      {formatDate(
                        changeOrder.declinedAt,
                      )}
                    </p>
                  )}

                  {changeOrder.customerResponseNotes && (
                    <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-violet-800">
                        Customer Response Notes
                      </p>

                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-violet-950">
                        {
                          changeOrder.customerResponseNotes
                        }
                      </p>
                    </div>
                  )}

                  {changeOrder.customerAgreementText && (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                          Customer Agreement
                        </p>

                        {changeOrder.customerAcknowledgedTerms && (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800">
                            Acknowledged
                          </span>
                        )}
                      </div>

                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                        {
                          changeOrder.customerAgreementText
                        }
                      </p>
                    </div>
                  )}

                  {(
                    changeOrder.status ===
                      "approved" ||
                    changeOrder.status ===
                      "declined"
                  ) && (
                    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-bold text-violet-950">
                          Office response review
                        </p>

                        <p className="mt-1 text-sm text-violet-800">
                          {changeOrder.responseReviewedAt
                            ? `Reviewed ${formatDate(
                                changeOrder.responseReviewedAt,
                              )}`
                            : "This customer response needs office review."}
                        </p>
                      </div>

                      {!changeOrder.responseReviewedAt && (
                        <button
                          type="button"
                          disabled={
                            actionChangeOrderId ===
                            changeOrder.id
                          }
                          onClick={() =>
                            void markResponseReviewed(
                              changeOrder,
                            )
                          }
                          className="rounded-xl bg-violet-800 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                        >
                          {actionChangeOrderId ===
                          changeOrder.id
                            ? "Saving..."
                            : "Mark Reviewed"}
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            },
          )}
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
          ? "bg-blue-950 text-white"
          : "border border-slate-300 bg-white text-slate-700"
      }`}
    >
      {children}
    </button>
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

      <dd className="mt-1 text-sm font-semibold text-slate-800">
        {value}
      </dd>
    </div>
  );
}
