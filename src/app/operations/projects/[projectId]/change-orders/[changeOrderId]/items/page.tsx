"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useState,
} from "react";
import { useParams } from "next/navigation";

type LineItem = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  unitCost: number;
  sortOrder: number;
  salesTotal: number;
  costTotal: number;
};

type ChangeOrder = {
  id: string;
  projectId: string;
  changeOrderNumber: number;
  title: string;
  status: string;
  amount: number;
  costAmount: number;
  scheduleImpactDays: number;
};

type ApiResponse = {
  success: boolean;
  changeOrder?: ChangeOrder;
  items?: LineItem[];
  error?: string;
};

type FormState = {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  unitCost: string;
};

const emptyForm: FormState = {
  id: "",
  description: "",
  quantity: "1",
  unit: "each",
  unitPrice: "0",
  unitCost: "0",
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

export default function ChangeOrderItemsPage() {
  const params = useParams<{
    projectId: string;
    changeOrderId: string;
  }>();

  const [
    changeOrder,
    setChangeOrder,
  ] = useState<ChangeOrder | null>(
    null,
  );

  const [items, setItems] =
    useState<LineItem[]>([]);

  const [form, setForm] =
    useState<FormState>(
      emptyForm,
    );

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [deletingId, setDeletingId] =
    useState("");

  const [notice, setNotice] =
    useState("");

  const [error, setError] =
    useState("");

  async function loadItems() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/projects/${params.projectId}/change-orders/${params.changeOrderId}/items`,
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
        !result.changeOrder
      ) {
        setError(
          result.error ??
            "Could not load change-order items.",
        );
        return;
      }

      setChangeOrder(
        result.changeOrder,
      );

      setItems(
        result.items ?? [],
      );
    } catch {
      setError(
        "Could not load change-order items.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, []);

  async function saveItem(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setSaving(true);
    setNotice("");
    setError("");

    try {
      const response = await fetch(
        `/api/projects/${params.projectId}/change-orders/${params.changeOrderId}/items`,
        {
          method:
            form.id
              ? "PATCH"
              : "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            id:
              form.id || undefined,
            description:
              form.description,
            quantity: Number(
              form.quantity,
            ),
            unit:
              form.unit,
            unitPrice: Number(
              form.unitPrice,
            ),
            unitCost: Number(
              form.unitCost,
            ),
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
        setError(
          result.error ??
            "Could not save the line item.",
        );
        return;
      }

      setNotice(
        form.id
          ? "Line item updated."
          : "Line item added.",
      );

      setForm(emptyForm);

      await loadItems();
    } catch {
      setError(
        "Could not save the line item.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(
    item: LineItem,
  ) {
    const confirmed =
      window.confirm(
        `Delete "${item.description}"?`,
      );

    if (!confirmed) {
      return;
    }

    setDeletingId(item.id);
    setNotice("");
    setError("");

    try {
      const response = await fetch(
        `/api/projects/${params.projectId}/change-orders/${params.changeOrderId}/items?itemId=${item.id}`,
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
        setError(
          result.error ??
            "Could not delete the line item.",
        );
        return;
      }

      setNotice(
        "Line item deleted.",
      );

      if (form.id === item.id) {
        setForm(emptyForm);
      }

      await loadItems();
    } catch {
      setError(
        "Could not delete the line item.",
      );
    } finally {
      setDeletingId("");
    }
  }

  function editItem(
    item: LineItem,
  ) {
    setForm({
      id: item.id,
      description:
        item.description,
      quantity: String(
        item.quantity,
      ),
      unit:
        item.unit,
      unitPrice: String(
        item.unitPrice,
      ),
      unitCost: String(
        item.unitCost,
      ),
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  const customerTotal =
    items.reduce(
      (total, item) =>
        total +
        item.salesTotal,
      0,
    );

  const costTotal =
    items.reduce(
      (total, item) =>
        total +
        item.costTotal,
      0,
    );

  const profit =
    customerTotal -
    costTotal;

  const margin =
    customerTotal > 0
      ? (profit /
          customerTotal) *
        100
      : 0;

  const isEditable =
    changeOrder?.status === "draft";

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <p className="text-sm text-slate-600">
          Loading line items...
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
            Change Order Line Items
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-950">
            {changeOrder
              ? `#${changeOrder.changeOrderNumber} — ${changeOrder.title}`
              : "Change Order"}
          </h1>

          <p className="mt-3 text-sm text-slate-600">
            Build the customer price,
            estimated cost, profit, and
            margin from detailed line
            items.
          </p>
        </div>

        <Link
          href={`/operations/projects/${params.projectId}/change-orders`}
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-bold text-slate-800"
        >
          Back to Change Orders
        </Link>
      </div>

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Customer Price"
          value={formatCurrency(
            customerTotal,
          )}
        />

        <Stat
          label="Estimated Cost"
          value={formatCurrency(
            costTotal,
          )}
        />

        <Stat
          label="Estimated Profit"
          value={formatCurrency(
            profit,
          )}
        />

        <Stat
          label="Gross Margin"
          value={`${margin.toFixed(
            1,
          )}%`}
        />
      </section>

      {!isEditable && changeOrder && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="font-bold text-amber-950">
            Line items are locked
          </p>

          <p className="mt-2 text-sm leading-6 text-amber-800">
            This change order is currently{" "}
            <span className="font-bold capitalize">
              {changeOrder.status.replaceAll(
                "_",
                " ",
              )}
            </span>
            . Return it to Draft before changing its scope or pricing.
          </p>

          <Link
            href={`/operations/projects/${params.projectId}/change-orders`}
            className="mt-4 inline-flex rounded-lg bg-amber-900 px-4 py-2 text-sm font-bold text-white"
          >
            Manage Change Order
          </Link>
        </div>
      )}

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

      {isEditable && (
        <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-950">
            {form.id
              ? "Edit Line Item"
              : "Add Line Item"}
          </h2>

          <form
            onSubmit={saveItem}
            className="mt-5 grid gap-4 lg:grid-cols-12"
          >
          <label className="lg:col-span-4">
            <span className="mb-2 block text-sm font-bold text-slate-700">
              Description
            </span>

            <input
              required
              value={
                form.description
              }
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description:
                    event.target.value,
                }))
              }
              placeholder="Additional framing labor"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
            />
          </label>

          <label className="lg:col-span-2">
            <span className="mb-2 block text-sm font-bold text-slate-700">
              Quantity
            </span>

            <input
              required
              type="number"
              min="0.001"
              step="0.001"
              value={
                form.quantity
              }
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  quantity:
                    event.target.value,
                }))
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
            />
          </label>

          <label className="lg:col-span-2">
            <span className="mb-2 block text-sm font-bold text-slate-700">
              Unit
            </span>

            <input
              value={form.unit}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  unit:
                    event.target.value,
                }))
              }
              placeholder="each"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
            />
          </label>

          <label className="lg:col-span-2">
            <span className="mb-2 block text-sm font-bold text-slate-700">
              Unit Price
            </span>

            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={
                form.unitPrice
              }
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  unitPrice:
                    event.target.value,
                }))
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
            />
          </label>

          <label className="lg:col-span-2">
            <span className="mb-2 block text-sm font-bold text-slate-700">
              Unit Cost
            </span>

            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={
                form.unitCost
              }
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  unitCost:
                    event.target.value,
                }))
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
            />
          </label>

          <div className="flex flex-col gap-2 sm:flex-row lg:col-span-12">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-blue-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : form.id
                  ? "Update Line Item"
                  : "Add Line Item"}
            </button>

            {form.id && (
              <button
                type="button"
                onClick={() =>
                  setForm(emptyForm)
                }
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700"
              >
                Cancel Edit
              </button>
            )}
          </div>
          </form>
        </section>
      )}

      {items.length === 0 ? (
        <section className="mt-7 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-xl font-bold text-slate-950">
            No line items yet
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            Add labor, materials,
            equipment, subcontractors, or
            other change-order costs.
          </p>
        </section>
      ) : (
        <section className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <Header>
                    Description
                  </Header>
                  <Header>
                    Quantity
                  </Header>
                  <Header>
                    Unit Price
                  </Header>
                  <Header>
                    Customer Total
                  </Header>
                  <Header>
                    Cost Total
                  </Header>
                  <Header>
                    Profit
                  </Header>
                  <Header>
                    Actions
                  </Header>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {items.map((item) => (
                  <tr key={item.id}>
                    <Cell>
                      <p className="font-bold text-slate-950">
                        {
                          item.description
                        }
                      </p>
                    </Cell>

                    <Cell>
                      {item.quantity}{" "}
                      {item.unit}
                    </Cell>

                    <Cell>
                      {formatCurrency(
                        item.unitPrice,
                      )}
                    </Cell>

                    <Cell>
                      {formatCurrency(
                        item.salesTotal,
                      )}
                    </Cell>

                    <Cell>
                      {formatCurrency(
                        item.costTotal,
                      )}
                    </Cell>

                    <Cell>
                      {formatCurrency(
                        item.salesTotal -
                          item.costTotal,
                      )}
                    </Cell>

                    <Cell>
                      {isEditable ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              editItem(item)
                            }
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            disabled={
                              deletingId ===
                              item.id
                            }
                            onClick={() =>
                              void deleteItem(
                                item,
                              )
                            }
                            className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-bold text-red-700 disabled:opacity-50"
                          >
                            {deletingId ===
                            item.id
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Locked
                        </span>
                      )}
                    </Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

function Header({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}

function Cell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <td className="whitespace-nowrap px-5 py-5 text-sm text-slate-700">
      {children}
    </td>
  );
}
