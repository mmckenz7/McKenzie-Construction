"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams } from "next/navigation";

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
