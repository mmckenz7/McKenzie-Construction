"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams } from "next/navigation";

import { useFeatures } from "@/components/features/use-features";

type Project = {
  id: string;
  name: string;
  address: string;
};

type ChangeOrderStatus =
  | "draft"
  | "pending_customer"
  | "approved"
  | "declined"
  | "in_progress"
  | "completed"
  | "cancelled";

type ChangeOrderRevision = {
  id: string;
  projectId: string;
  changeOrderNumber: number;
  title: string;
  status: string;
  amount: number;
  scheduleImpactDays: number;
  revisedFromChangeOrderId:
    | string
    | null;
  revisionNumber: number;
  supersededByChangeOrderId:
    | string
    | null;
  supersededAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ChangeOrderResponse = {
  id: string;
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
};

type ChangeOrder = {
  id: string;
  projectId: string;
  changeOrderNumber: number;
  title: string;
  description: string;
  reason: string | null;
  status: ChangeOrderStatus;
  amount: number;
  costAmount: number | null;
  scheduleImpactDays: number;
  customerNotes: string | null;
  internalNotes: string | null;
  requestedBy: string | null;
  approvedByName: string | null;
  approvalToken: string | null;
  approvalSentAt: string | null;
  approvalOpenedAt: string | null;
  approvalExpiresAt: string | null;
  approvalReminderSentAt: string | null;
  approvalReminderCount: number;
  customerResponseNotes: string | null;
  customerAcknowledgedTerms: boolean;
  customerAgreementText: string | null;
  responseReviewedAt: string | null;
  revisedFromChangeOrderId: string | null;
  revisionNumber: number;
  supersededByChangeOrderId:
    | string
    | null;
  supersededAt: string | null;
  responseReviewedBy: string | null;
  approvedAt: string | null;
  declinedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ApiResponse = {
  success: boolean;
  project?: Project;
  changeOrders?: ChangeOrder[];
  summary?: {
    count: number;
    approvedAmount: number;
    pendingAmount: number;
    totalScheduleImpactDays: number;
  };
  error?: string;
};

const statuses: {
  value: ChangeOrderStatus;
  label: string;
}[] = [
  {
    value: "draft",
    label: "Draft",
  },
  {
    value: "pending_customer",
    label: "Pending Customer",
  },
  {
    value: "approved",
    label: "Approved",
  },
  {
    value: "declined",
    label: "Declined",
  },
  {
    value: "in_progress",
    label: "In Progress",
  },
  {
    value: "completed",
    label: "Completed",
  },
  {
    value: "cancelled",
    label: "Cancelled",
  },
];

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
  status: ChangeOrderStatus,
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

  if (status === "in_progress") {
    return "bg-blue-100 text-blue-800";
  }

  return "bg-slate-100 text-slate-700";
}

export default function ChangeOrdersPage() {
  const params = useParams<{
    projectId: string;
  }>();

  const { isEnabled } =
    useFeatures();

  const [project, setProject] =
    useState<Project | null>(null);

  const [
    changeOrders,
    setChangeOrders,
  ] = useState<ChangeOrder[]>([]);

  const [summary, setSummary] =
    useState({
      count: 0,
      approvedAmount: 0,
      pendingAmount: 0,
      totalScheduleImpactDays: 0,
    });

  const [showForm, setShowForm] =
    useState(false);

  const [title, setTitle] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [reason, setReason] =
    useState("");

  const [amount, setAmount] =
    useState("");

  const [costAmount, setCostAmount] =
    useState("");

  const [
    scheduleImpactDays,
    setScheduleImpactDays,
  ] = useState("0");

  const [requestedBy, setRequestedBy] =
    useState("");

  const [
    customerNotes,
    setCustomerNotes,
  ] = useState("");

  const [
    internalNotes,
    setInternalNotes,
  ] = useState("");

  const [
    initialStatus,
    setInitialStatus,
  ] = useState<
    "draft" | "pending_customer"
  >("draft");

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [updatingId, setUpdatingId] =
    useState("");

  const [
    creatingApprovalId,
    setCreatingApprovalId,
  ] = useState("");

  const [
    reviewingResponseId,
    setReviewingResponseId,
  ] = useState("");

  const [
    creatingRevisionId,
    setCreatingRevisionId,
  ] = useState("");

  const [
    responseHistoryByOrder,
    setResponseHistoryByOrder,
  ] = useState<
    Record<
      string,
      ChangeOrderResponse[]
    >
  >({});

  const [
    revisionHistoryByOrder,
    setRevisionHistoryByOrder,
  ] = useState<
    Record<
      string,
      ChangeOrderRevision[]
    >
  >({});

  const [
    loadingRevisionsId,
    setLoadingRevisionsId,
  ] = useState("");

  const [
    openRevisionsId,
    setOpenRevisionsId,
  ] = useState("");

  const [
    loadingHistoryId,
    setLoadingHistoryId,
  ] = useState("");

  const [
    openHistoryId,
    setOpenHistoryId,
  ] = useState("");

  const [notice, setNotice] =
    useState("");

  async function loadChangeOrders() {
    setLoading(true);
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${params.projectId}/change-orders`,
        {
          credentials: "include",
          cache: "no-store",
        },
      );

      const result =
        (await response.json()) as ApiResponse;

      if (
        !response.ok ||
        !result.success ||
        !result.project
      ) {
        setNotice(
          result.error ??
            "Could not load change orders.",
        );
        return;
      }

      setProject(result.project);
      setChangeOrders(
        result.changeOrders ?? [],
      );
      setSummary(
        result.summary ?? {
          count: 0,
          approvedAmount: 0,
          pendingAmount: 0,
          totalScheduleImpactDays: 0,
        },
      );
    } catch {
      setNotice(
        "Could not load change orders.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadChangeOrders();
  }, [params.projectId]);

  const totalProfit = useMemo(
    () =>
      changeOrders
        .filter((item) =>
          [
            "approved",
            "in_progress",
            "completed",
          ].includes(item.status),
        )
        .reduce(
          (total, item) =>
            total +
            (item.amount -
              (item.costAmount ?? 0)),
          0,
        ),
    [changeOrders],
  );

  async function createChangeOrder(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setNotice("");

    if (
      !title.trim() ||
      !description.trim()
    ) {
      setNotice(
        "Enter a title and description.",
      );
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        `/api/projects/${params.projectId}/change-orders`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            title,
            description,
            reason: reason || null,
            amount:
              Number(amount) || 0,
            costAmount:
              costAmount === ""
                ? null
                : Number(costAmount),
            scheduleImpactDays:
              Number(
                scheduleImpactDays,
              ) || 0,
            requestedBy:
              requestedBy || null,
            customerNotes:
              customerNotes || null,
            internalNotes:
              internalNotes || null,
            status: initialStatus,
          }),
        },
      );

      const result =
        (await response.json()) as ApiResponse;

      if (
        !response.ok ||
        !result.success
      ) {
        setNotice(
          result.error ??
            "Could not create the change order.",
        );
        return;
      }

      setTitle("");
      setDescription("");
      setReason("");
      setAmount("");
      setCostAmount("");
      setScheduleImpactDays("0");
      setRequestedBy("");
      setCustomerNotes("");
      setInternalNotes("");
      setInitialStatus("draft");
      setShowForm(false);
      setNotice(
        "Change order created.",
      );

      await loadChangeOrders();
    } catch {
      setNotice(
        "Could not create the change order.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function createApprovalLink(
    changeOrder: ChangeOrder,
  ) {
    setCreatingApprovalId(
      changeOrder.id,
    );
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${params.projectId}/change-orders/${changeOrder.id}/approval-link`,
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

      if (
        !response.ok ||
        !result.success ||
        !result.changeOrder
          ?.approvalToken
      ) {
        setNotice(
          result.error ??
            "Could not create the customer approval link.",
        );
        return;
      }

      const link =
        `${window.location.origin}/change-order/` +
        result.changeOrder
          .approvalToken;

      await navigator.clipboard.writeText(
        link,
      );

      setNotice(
        changeOrder.approvalToken
          ? "Old approval and response record cleared. New link created and copied."
          : "Customer approval link created and copied.",
      );

      await loadChangeOrders();
    } catch {
      setNotice(
        "Could not create the customer approval link.",
      );
    } finally {
      setCreatingApprovalId("");
    }
  }

  async function copyApprovalLink(
    changeOrder: ChangeOrder,
  ) {
    if (!changeOrder.approvalToken) {
      return;
    }

    const link =
      `${window.location.origin}/change-order/` +
      changeOrder.approvalToken;

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
      `${window.location.origin}/change-order/` +
      changeOrder.approvalToken;

    const message =
      `McKenzie Construction has sent Change Order #${changeOrder.changeOrderNumber} for your review. ` +
      `The change-order amount is ${formatCurrency(
        changeOrder.amount,
      )}. Review and respond here: ${link}`;

    await navigator.clipboard.writeText(
      message,
    );

    setNotice(
      "Customer text message copied.",
    );
  }

  async function createRevision(
    changeOrder: ChangeOrder,
  ) {
    const confirmed =
      window.confirm(
        `Create an editable revision of Change Order #${changeOrder.changeOrderNumber}? The original record will remain unchanged.`,
      );

    if (!confirmed) {
      return;
    }

    setCreatingRevisionId(
      changeOrder.id,
    );
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${params.projectId}/change-orders/${changeOrder.id}/revision`,
        {
          method: "POST",
          credentials: "include",
        },
      );

      const result =
        (await response.json()) as {
          success?: boolean;
          error?: string;
          revision?: {
            id?: string;
            changeOrderNumber?: number;
            revisionNumber?: number;
            copiedLineItemCount?: number;
          };
        };

      const revisionId =
        result.revision?.id;

      if (
        !response.ok ||
        !result.success ||
        !revisionId
      ) {
        setNotice(
          result.error ??
            "Could not create the change-order revision.",
        );
        return;
      }

      setNotice(
        `Revision ${result.revision?.revisionNumber ?? ""} created with ${result.revision?.copiedLineItemCount ?? 0} copied line items.`,
      );

      await loadChangeOrders();

      window.location.href =
        `/operations/projects/${params.projectId}/change-orders/${revisionId}/items`;
    } catch {
      setNotice(
        "Could not create the change-order revision.",
      );
    } finally {
      setCreatingRevisionId("");
    }
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

    setCreatingApprovalId(
      changeOrder.id,
    );
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${params.projectId}/change-orders/${changeOrder.id}/revoke-approval`,
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
        setNotice(
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
      setNotice(
        "Could not revoke the customer approval link.",
      );
    } finally {
      setCreatingApprovalId("");
    }
  }

  async function copyReminderMessage(
    changeOrder: ChangeOrder,
  ) {
    if (!changeOrder.approvalToken) {
      return;
    }

    setCreatingApprovalId(
      changeOrder.id,
    );
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${params.projectId}/change-orders/${changeOrder.id}/reminder`,
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
        setNotice(
          result.error ??
            "Could not record the approval reminder.",
        );
        return;
      }

      const link =
        `${window.location.origin}/change-order/` +
        changeOrder.approvalToken;

      const message =
        `Reminder from McKenzie Construction: Change Order #${changeOrder.changeOrderNumber} is still waiting for your response. ` +
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
      setNotice(
        "Could not record the approval reminder.",
      );
    } finally {
      setCreatingApprovalId("");
    }
  }

  async function toggleRevisionHistory(
    changeOrder: ChangeOrder,
  ) {
    if (
      openRevisionsId ===
      changeOrder.id
    ) {
      setOpenRevisionsId("");
      return;
    }

    setOpenRevisionsId(
      changeOrder.id,
    );

    if (
      revisionHistoryByOrder[
        changeOrder.id
      ]
    ) {
      return;
    }

    setLoadingRevisionsId(
      changeOrder.id,
    );
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${params.projectId}/change-orders/${changeOrder.id}/revisions`,
        {
          credentials: "include",
          cache: "no-store",
        },
      );

      const result =
        (await response.json()) as {
          success?: boolean;
          error?: string;
          revisions?: ChangeOrderRevision[];
        };

      if (
        !response.ok ||
        !result.success
      ) {
        setNotice(
          result.error ??
            "Could not load revision history.",
        );
        return;
      }

      setRevisionHistoryByOrder(
        (current) => ({
          ...current,
          [changeOrder.id]:
            result.revisions ?? [],
        }),
      );
    } catch {
      setNotice(
        "Could not load revision history.",
      );
    } finally {
      setLoadingRevisionsId("");
    }
  }

  async function toggleResponseHistory(
    changeOrder: ChangeOrder,
  ) {
    if (
      openHistoryId ===
      changeOrder.id
    ) {
      setOpenHistoryId("");
      return;
    }

    setOpenHistoryId(
      changeOrder.id,
    );

    if (
      responseHistoryByOrder[
        changeOrder.id
      ]
    ) {
      return;
    }

    setLoadingHistoryId(
      changeOrder.id,
    );
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${params.projectId}/change-orders/${changeOrder.id}/responses`,
        {
          credentials: "include",
          cache: "no-store",
        },
      );

      const result =
        (await response.json()) as {
          success?: boolean;
          error?: string;
          responses?: ChangeOrderResponse[];
        };

      if (
        !response.ok ||
        !result.success
      ) {
        setNotice(
          result.error ??
            "Could not load customer response history.",
        );
        return;
      }

      setResponseHistoryByOrder(
        (current) => ({
          ...current,
          [changeOrder.id]:
            result.responses ?? [],
        }),
      );
    } catch {
      setNotice(
        "Could not load customer response history.",
      );
    } finally {
      setLoadingHistoryId("");
    }
  }

  async function markResponseReviewed(
    changeOrder: ChangeOrder,
  ) {
    setReviewingResponseId(
      changeOrder.id,
    );
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${params.projectId}/change-orders/${changeOrder.id}/review-response`,
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
        setNotice(
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
      setNotice(
        "Could not mark the customer response reviewed.",
      );
    } finally {
      setReviewingResponseId("");
    }
  }

  async function updateStatus(
    changeOrder: ChangeOrder,
    status: ChangeOrderStatus,
  ) {
    let approvedByName:
      | string
      | null
      | undefined;

    if (status === "approved") {
      approvedByName =
        window.prompt(
          "Who approved this change order?",
          changeOrder.approvedByName ??
            "",
        );

      if (approvedByName === null) {
        return;
      }
    }

    setUpdatingId(changeOrder.id);
    setNotice("");

    try {
      const response = await fetch(
        `/api/projects/${params.projectId}/change-orders/${changeOrder.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            status,
            approvedByName:
              status === "approved"
                ? approvedByName
                : undefined,
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
        setNotice(
          result.error ??
            "Could not update the change order.",
        );
        return;
      }

      await loadChangeOrders();
    } catch {
      setNotice(
        "Could not update the change order.",
      );
    } finally {
      setUpdatingId("");
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link
        href={`/operations/projects/${params.projectId}`}
        className="text-sm font-bold text-blue-700"
      >
        ← Back to Project
      </Link>

      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
            Change Orders
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">
            {project?.name ??
              "Project Change Orders"}
          </h1>

          {project?.address && (
            <p className="mt-3 text-base text-slate-600">
              {project.address}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() =>
            setShowForm(
              (current) => !current,
            )
          }
          className="rounded-xl bg-blue-950 px-5 py-3 text-sm font-bold text-white"
        >
          {showForm
            ? "Cancel"
            : "New Change Order"}
        </button>
      </div>

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat
          label="Change Orders"
          value={String(summary.count)}
        />

        <Stat
          label="Approved Revenue"
          value={formatCurrency(
            summary.approvedAmount,
          )}
        />

        <Stat
          label="Pending Revenue"
          value={formatCurrency(
            summary.pendingAmount,
          )}
        />

        <Stat
          label="Estimated Profit"
          value={formatCurrency(
            totalProfit,
          )}
        />

        <Stat
          label="Schedule Impact"
          value={`${summary.totalScheduleImpactDays} days`}
        />
      </section>

      {showForm && (
        <form
          onSubmit={createChangeOrder}
          className="mt-7 rounded-2xl border border-blue-200 bg-blue-50 p-6"
        >
          <h2 className="text-xl font-bold text-slate-950">
            New Change Order
          </h2>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <Field label="Title">
              <input
                value={title}
                onChange={(event) =>
                  setTitle(
                    event.target.value,
                  )
                }
                placeholder="Upgrade to aluminum railing"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              />
            </Field>

            <Field label="Requested By">
              <input
                value={requestedBy}
                onChange={(event) =>
                  setRequestedBy(
                    event.target.value,
                  )
                }
                placeholder="Customer, contractor, inspector"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              />
            </Field>

            <Field label="Customer Price">
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) =>
                  setAmount(
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              />
            </Field>

            <Field label="Estimated Cost">
              <input
                type="number"
                min="0"
                step="0.01"
                value={costAmount}
                onChange={(event) =>
                  setCostAmount(
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              />
            </Field>

            <Field label="Schedule Impact">
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  step="1"
                  value={
                    scheduleImpactDays
                  }
                  onChange={(event) =>
                    setScheduleImpactDays(
                      event.target.value,
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
                />

                <span className="text-sm font-semibold text-slate-600">
                  days
                </span>
              </div>
            </Field>

            <Field label="Initial Status">
              <select
                value={initialStatus}
                onChange={(event) =>
                  setInitialStatus(
                    event.target.value as
                      | "draft"
                      | "pending_customer",
                  )
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              >
                <option value="draft">
                  Save as Draft
                </option>

                <option value="pending_customer">
                  Pending Customer Approval
                </option>
              </select>
            </Field>
          </div>

          <Field label="Description">
            <textarea
              rows={5}
              value={description}
              onChange={(event) =>
                setDescription(
                  event.target.value,
                )
              }
              placeholder="Describe the added, removed, or changed work."
              className="w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
            />
          </Field>

          <Field label="Reason">
            <textarea
              rows={3}
              value={reason}
              onChange={(event) =>
                setReason(
                  event.target.value,
                )
              }
              placeholder="Why this change is needed"
              className="w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
            />
          </Field>

          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Customer Notes">
              <textarea
                rows={4}
                value={customerNotes}
                onChange={(event) =>
                  setCustomerNotes(
                    event.target.value,
                  )
                }
                className="w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              />
            </Field>

            <Field label="Internal Notes">
              <textarea
                rows={4}
                value={internalNotes}
                onChange={(event) =>
                  setInternalNotes(
                    event.target.value,
                  )
                }
                className="w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              />
            </Field>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-5 w-full rounded-xl bg-blue-950 px-5 py-4 text-base font-bold text-white disabled:opacity-60"
          >
            {saving
              ? "Saving..."
              : "Create Change Order"}
          </button>
        </form>
      )}

      {notice && (
        <p className="mt-6 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
          {notice}
        </p>
      )}

      {loading ? (
        <p className="mt-8 text-sm text-slate-600">
          Loading change orders...
        </p>
      ) : changeOrders.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-xl font-bold text-slate-950">
            No change orders
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            Project changes and added work
            will appear here.
          </p>
        </section>
      ) : (
        <section className="mt-8 grid gap-5">
          {changeOrders.map(
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
                    <div>
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
                      </div>

                      <h2 className="mt-3 text-xl font-bold text-slate-950">
                        {changeOrder.title}
                      </h2>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {changeOrder.revisionNumber > 0 && (
                          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-800">
                            Revision{" "}
                            {
                              changeOrder.revisionNumber
                            }
                          </span>
                        )}

                        {changeOrder.supersededByChangeOrderId && (
                          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700">
                            Superseded
                          </span>
                        )}
                      </div>

                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {
                          changeOrder.description
                        }
                      </p>

                      {changeOrder.reason && (
                        <p className="mt-3 text-sm text-slate-600">
                          <strong>
                            Reason:
                          </strong>{" "}
                          {changeOrder.reason}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-3">
                      <select
                        value={changeOrder.status}
                        disabled={
                          updatingId ===
                          changeOrder.id
                        }
                        onChange={(event) =>
                          void updateStatus(
                            changeOrder,
                            event.target
                              .value as ChangeOrderStatus,
                          )
                        }
                        className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold"
                      >
                        {statuses.map(
                          (status) => (
                            <option
                              key={
                                status.value
                              }
                              value={
                                status.value
                              }
                            >
                              {status.label}
                            </option>
                          ),
                        )}
                      </select>

                      {!changeOrder
                        .supersededByChangeOrderId &&
                        ![
                          "completed",
                          "cancelled",
                        ].includes(
                          changeOrder.status,
                        ) && (
                        <button
                          type="button"
                          disabled={
                            creatingApprovalId ===
                            changeOrder.id
                          }
                          onClick={() =>
                            void createApprovalLink(
                              changeOrder,
                            )
                          }
                          className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                        >
                          {creatingApprovalId ===
                          changeOrder.id
                            ? "Creating..."
                            : changeOrder.approvalToken &&
                                changeOrder.status ===
                                  "pending_customer"
                              ? "Replace Approval Link"
                              : "Create Approval Link"}
                        </button>
                      )}
                    </div>
                  </div>

                  <dl className="mt-5 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-5">
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
                      label="Approved"
                      value={
                        changeOrder.approvedAt
                          ? `${formatDate(
                              changeOrder.approvedAt,
                            )}${
                              changeOrder.approvedByName
                                ? ` by ${changeOrder.approvedByName}`
                                : ""
                            }`
                          : "—"
                      }
                    />
                  </dl>

                  <div className="mt-5 flex flex-wrap gap-3">
                    {isEnabled(
                      "change_order_vendor_requests",
                    ) &&
                      !changeOrder
                        .supersededByChangeOrderId && (
                      <a
                        href={`/operations/projects/${params.projectId}/change-orders/${changeOrder.id}/vendor-requests`}
                        className="rounded-xl border border-cyan-300 bg-cyan-50 px-4 py-3 text-sm font-bold text-cyan-800"
                      >
                        Request Updated Schedule & Costs
                      </a>
                    )}

                    {[
                      "approved",
                      "in_progress",
                      "completed",
                    ].includes(
                      changeOrder.status,
                    ) &&
                      !changeOrder
                        .supersededByChangeOrderId && (
                      <a
                        href={`/operations/projects/${params.projectId}/change-orders/${changeOrder.id}/billing`}
                        className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800"
                      >
                        Billing & Payments
                      </a>
                    )}

                    <a
                      href={`/operations/projects/${params.projectId}/change-orders/${changeOrder.id}/items`}
                      className={`rounded-xl px-4 py-3 text-sm font-bold ${
                        changeOrder.status ===
                        "draft"
                          ? "bg-blue-950 text-white"
                          : "border border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      {changeOrder.status ===
                      "draft"
                        ? "Edit Line Items"
                        : "View Line Items"}
                    </a>

                    <button
                      type="button"
                      disabled={
                        loadingHistoryId ===
                        changeOrder.id
                      }
                      onClick={() =>
                        void toggleResponseHistory(
                          changeOrder,
                        )
                      }
                      className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 disabled:opacity-50"
                    >
                      {loadingHistoryId ===
                      changeOrder.id
                        ? "Loading History..."
                        : openHistoryId ===
                            changeOrder.id
                          ? "Hide Response History"
                          : "View Response History"}
                    </button>

                    {changeOrder.status !==
                      "draft" &&
                      !changeOrder
                        .supersededByChangeOrderId && (
                      <button
                        type="button"
                        disabled={
                          creatingRevisionId ===
                          changeOrder.id
                        }
                        onClick={() =>
                          void createRevision(
                            changeOrder,
                          )
                        }
                        className="rounded-xl border border-violet-300 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-800 disabled:opacity-50"
                      >
                        {creatingRevisionId ===
                        changeOrder.id
                          ? "Creating Revision..."
                          : "Create Revision"}
                      </button>
                    )}

                    {(changeOrder.revisionNumber > 0 ||
                      changeOrder.revisedFromChangeOrderId) && (
                      <button
                        type="button"
                        disabled={
                          loadingRevisionsId ===
                          changeOrder.id
                        }
                        onClick={() =>
                          void toggleRevisionHistory(
                            changeOrder,
                          )
                        }
                        className="rounded-xl border border-violet-300 bg-white px-4 py-3 text-sm font-bold text-violet-800 disabled:opacity-50"
                      >
                        {loadingRevisionsId ===
                        changeOrder.id
                          ? "Loading Revisions..."
                          : openRevisionsId ===
                              changeOrder.id
                            ? "Hide Revisions"
                            : "View Revisions"}
                      </button>
                    )}
                  </div>

                  {openRevisionsId ===
                    changeOrder.id && (
                    <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-5">
                      <p className="text-xs font-bold uppercase tracking-wide text-violet-700">
                        Revision History
                      </p>

                      <div className="mt-4 grid gap-3">
                        {(revisionHistoryByOrder[
                          changeOrder.id
                        ] ?? []).map(
                          (revision) => {
                            const current =
                              revision.id ===
                              changeOrder.id;

                            return (
                              <article
                                key={
                                  revision.id
                                }
                                className={`rounded-xl border p-4 ${
                                  current
                                    ? "border-violet-400 bg-white"
                                    : "border-violet-200 bg-white/70"
                                }`}
                              >
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-800">
                                        {revision.revisionNumber ===
                                        0
                                          ? "Original"
                                          : `Revision ${revision.revisionNumber}`}
                                      </span>

                                      {current && (
                                        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">
                                          Current
                                        </span>
                                      )}

                                      {revision.supersededByChangeOrderId && (
                                        <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700">
                                          Superseded
                                        </span>
                                      )}

                                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize text-slate-700">
                                        {revision.status.replaceAll(
                                          "_",
                                          " ",
                                        )}
                                      </span>
                                    </div>

                                    <p className="mt-3 font-bold text-slate-950">
                                      Change Order #
                                      {
                                        revision.changeOrderNumber
                                      }
                                    </p>

                                    <p className="mt-1 text-sm text-slate-600">
                                      {
                                        revision.title
                                      }
                                    </p>

                                    <p className="mt-2 text-sm font-semibold text-slate-800">
                                      {formatCurrency(
                                        revision.amount,
                                      )}{" "}
                                      ·{" "}
                                      {
                                        revision.scheduleImpactDays
                                      }{" "}
                                      days
                                    </p>

                                    {revision.supersededAt && (
                                      <p className="mt-1 text-sm text-slate-500">
                                        Superseded{" "}
                                        {formatDate(
                                          revision.supersededAt,
                                        )}
                                      </p>
                                    )}
                                  </div>

                                  <a
                                    href={`/operations/projects/${params.projectId}/change-orders/${revision.id}/items`}
                                    className="rounded-lg border border-violet-300 bg-white px-4 py-2 text-center text-sm font-bold text-violet-800"
                                  >
                                    {revision.status ===
                                    "draft"
                                      ? "Edit Revision"
                                      : "View Revision"}
                                  </a>
                                </div>
                              </article>
                            );
                          },
                        )}
                      </div>
                    </div>
                  )}

                  {openHistoryId ===
                    changeOrder.id && (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                        Customer Response History
                      </p>

                      {(responseHistoryByOrder[
                        changeOrder.id
                      ] ?? []).length ===
                      0 ? (
                        <p className="mt-3 text-sm text-slate-600">
                          No archived customer
                          responses yet.
                        </p>
                      ) : (
                        <div className="mt-4 space-y-4">
                          {responseHistoryByOrder[
                            changeOrder.id
                          ].map(
                            (
                              response,
                              index,
                            ) => (
                              <article
                                key={
                                  response.id
                                }
                                className="rounded-xl border border-slate-200 bg-white p-4"
                              >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span
                                        className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                                          response.response ===
                                          "approved"
                                            ? "bg-emerald-100 text-emerald-800"
                                            : "bg-red-100 text-red-800"
                                        }`}
                                      >
                                        {
                                          response.response
                                        }
                                      </span>

                                      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                        Response{" "}
                                        {
                                          responseHistoryByOrder[
                                            changeOrder.id
                                          ].length -
                                            index
                                        }
                                      </span>
                                    </div>

                                    <p className="mt-3 font-bold text-slate-950">
                                      {
                                        response.customerName
                                      }
                                    </p>

                                    <p className="mt-1 text-sm text-slate-600">
                                      {formatDate(
                                        response.submittedAt,
                                      )}
                                    </p>
                                  </div>

                                  <div className="text-left sm:text-right">
                                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                      Amount
                                    </p>

                                    <p className="mt-1 font-bold text-slate-950">
                                      {formatCurrency(
                                        response.amount,
                                      )}
                                    </p>

                                    <p className="mt-1 text-sm text-slate-600">
                                      {
                                        response.scheduleImpactDays
                                      }{" "}
                                      days
                                    </p>
                                  </div>
                                </div>

                                <div className="mt-4 rounded-lg bg-slate-50 p-4">
                                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                    Agreement
                                  </p>

                                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                                    {
                                      response.agreementText
                                    }
                                  </p>
                                </div>

                                {response.customerNotes && (
                                  <div className="mt-4">
                                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                      Customer Comments
                                    </p>

                                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                                      {
                                        response.customerNotes
                                      }
                                    </p>
                                  </div>
                                )}

                                <a
                                  href={`/operations/projects/${params.projectId}/change-orders/${changeOrder.id}/responses/${response.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-4 inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800"
                                >
                                  Open Printable Record
                                </a>
                              </article>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {[
                    "approved",
                    "declined",
                  ].includes(
                    changeOrder.status,
                  ) && (
                    <div className="mt-5 flex flex-col gap-3 rounded-xl border border-violet-200 bg-violet-50 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-violet-800">
                          Customer Response
                        </p>

                        <p className="mt-2 text-sm font-semibold capitalize text-violet-950">
                          {changeOrder.status}
                          {changeOrder.approvedByName
                            ? ` by ${changeOrder.approvedByName}`
                            : ""}
                        </p>

                        <p className="mt-1 text-sm text-violet-800">
                          {changeOrder.responseReviewedAt
                            ? `Reviewed ${formatDate(
                                changeOrder.responseReviewedAt,
                              )}`
                            : "Waiting for office review"}
                        </p>
                      </div>

                      {!changeOrder.responseReviewedAt ? (
                        <button
                          type="button"
                          disabled={
                            reviewingResponseId ===
                            changeOrder.id
                          }
                          onClick={() =>
                            void markResponseReviewed(
                              changeOrder,
                            )
                          }
                          className="rounded-xl bg-violet-800 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                        >
                          {reviewingResponseId ===
                          changeOrder.id
                            ? "Saving..."
                            : "Mark Response Reviewed"}
                        </button>
                      ) : (
                        <span className="rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-violet-800">
                          Reviewed
                        </span>
                      )}
                    </div>
                  )}

                  {changeOrder.approvalToken && (
                    <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">
                            Customer Approval Link
                          </p>

                          <p className="mt-2 text-sm font-semibold text-emerald-950">
                            {changeOrder.approvalOpenedAt
                              ? `Opened ${formatDate(
                                  changeOrder.approvalOpenedAt,
                                )}`
                              : changeOrder.approvalSentAt
                                ? `Created ${formatDate(
                                    changeOrder.approvalSentAt,
                                  )}`
                                : "Ready to send"}
                          </p>

                          <p className="mt-1 text-sm text-emerald-800">
                            Expires:{" "}
                            {formatDate(
                              changeOrder.approvalExpiresAt,
                            )}
                          </p>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row">
                          <a
                            href={`/change-order/${changeOrder.approvalToken}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-center text-sm font-bold text-emerald-800"
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
                            className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-bold text-emerald-800"
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
                            className="rounded-lg bg-emerald-900 px-4 py-2 text-sm font-bold text-white"
                          >
                            Copy Text Message
                          </button>

                          {changeOrder.status ===
                            "pending_customer" && (
                            <>
                              <button
                                type="button"
                                disabled={
                                  creatingApprovalId ===
                                  changeOrder.id
                                }
                                onClick={() =>
                                  void copyReminderMessage(
                                    changeOrder,
                                  )
                                }
                                className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                              >
                                {creatingApprovalId ===
                                changeOrder.id
                                  ? "Saving..."
                                  : "Copy Reminder"}
                              </button>

                              <button
                                type="button"
                                disabled={
                                  creatingApprovalId ===
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
                        </div>
                      </div>

                      {changeOrder.customerResponseNotes && (
                        <div className="mt-4 border-t border-emerald-200 pt-4">
                          <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">
                            Customer Response Notes
                          </p>

                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-emerald-950">
                            {
                              changeOrder.customerResponseNotes
                            }
                          </p>
                        </div>
                      )}

                      {changeOrder.customerAgreementText && (
                        <div className="mt-4 border-t border-emerald-200 pt-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">
                              Customer Agreement
                            </p>

                            {changeOrder.customerAcknowledgedTerms && (
                              <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-emerald-800">
                                Acknowledged
                              </span>
                            )}
                          </div>

                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-emerald-950">
                            {
                              changeOrder.customerAgreementText
                            }
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {(changeOrder.customerNotes ||
                    changeOrder.internalNotes) && (
                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      {changeOrder.customerNotes && (
                        <Note
                          label="Customer Notes"
                          value={
                            changeOrder.customerNotes
                          }
                        />
                      )}

                      {changeOrder.internalNotes && (
                        <Note
                          label="Internal Notes"
                          value={
                            changeOrder.internalNotes
                          }
                        />
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-5 block">
      <span className="mb-2 block text-sm font-bold text-slate-800">
        {label}
      </span>

      {children}
    </label>
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

      <p className="mt-2 text-xl font-bold text-slate-950">
        {value}
      </p>
    </article>
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

function Note({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
        {value}
      </p>
    </div>
  );
}
