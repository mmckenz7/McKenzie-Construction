import Link from "next/link";

import { getInternalDeckIntakeAccess } from "@/lib/internal-deck-intake-access";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export const dynamic = "force-dynamic";

type Customer = {
  id: string;
  source_lead_id: string | null;
  customer_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  project_type: string | null;
  notes: string | null;
  status: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatStatus(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildAddress(customer: Customer) {
  const cityStatePostal = [customer.city, customer.state, customer.postal_code]
    .filter(Boolean)
    .join(" ");

  return [customer.address_line_1, customer.address_line_2, cityStatePostal]
    .filter(Boolean)
    .join(", ");
}

export default async function CustomersPage() {
  const supabase = createAdminServerClient();
  const intakeAccess = await getInternalDeckIntakeAccess();

  const customersResult = await supabase
    .from("customers")
    .select(
      `
        id,
        source_lead_id,
        customer_name,
        first_name,
        last_name,
        email,
        phone,
        address_line_1,
        address_line_2,
        city,
        state,
        postal_code,
        project_type,
        notes,
        status,
        assigned_to,
        created_at,
        updated_at
      `,
    )
    .order("created_at", {
      ascending: false,
    });

  const customers = (customersResult.data ?? []) as Customer[];

  const activeCustomers = customers.filter(
    (customer) => customer.status === "active",
  );

  const pastCustomers = customers.filter(
    (customer) => customer.status === "past_customer",
  );

  const inactiveCustomers = customers.filter(
    (customer) => customer.status === "inactive",
  );

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 transition hover:text-slate-950"
          >
            <span aria-hidden="true">←</span>
            Back to Lead Dashboard
          </Link>
        </div>

        <header className="rounded-2xl bg-slate-950 px-6 py-7 text-white shadow-sm sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
            McKenzie Construction
          </p>

          <div className="mt-2 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-3xl font-bold sm:text-4xl">Customers</h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                Customers converted from won leads, including their contact
                information, project details, and original lead record.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-slate-900 px-4 py-3">
                <p className="text-2xl font-bold">{activeCustomers.length}</p>

                <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">
                  Active
                </p>
              </div>

              <div className="rounded-xl bg-slate-900 px-4 py-3">
                <p className="text-2xl font-bold">{pastCustomers.length}</p>

                <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">
                  Past
                </p>
              </div>

              <div className="rounded-xl bg-slate-900 px-4 py-3">
                <p className="text-2xl font-bold">{customers.length}</p>

                <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">
                  Total
                </p>
              </div>
            </div>
          </div>
          {intakeAccess.enabled ? (
            <Link
              href="/sales/intake/deck"
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-amber-400 px-5 text-sm font-bold text-slate-950 sm:w-auto"
            >
              New onsite Deck estimate
            </Link>
          ) : null}
        </header>

        {customersResult.error ? (
          <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6">
            <h2 className="font-bold text-red-800">Unable to load customers</h2>

            <p className="mt-2 text-sm text-red-700">
              {customersResult.error.message}
            </p>
          </section>
        ) : null}

        {!customersResult.error && customers.length === 0 ? (
          <section className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">
              No customers yet
            </h2>

            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
              Customers will appear here after a lead is marked Won and
              converted into a customer record.
            </p>

            <Link
              href="/admin"
              className="mt-6 inline-flex rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
            >
              View Leads
            </Link>
          </section>
        ) : null}

        {!customersResult.error && customers.length > 0 ? (
          <section className="mt-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {customers.map((customer) => {
                const address = buildAddress(customer);

                return (
                  <article
                    key={customer.id}
                    className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.15em] text-amber-700">
                          Customer
                        </p>

                        <Link
                          href={`/sales/customers/${customer.id}`}
                          className="mt-2 block text-xl font-bold text-slate-950 transition hover:text-amber-700"
                        >
                          {customer.customer_name}
                        </Link>
                      </div>

                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                        {formatStatus(customer.status)}
                      </span>
                    </div>

                    <dl className="mt-6 space-y-4">
                      {customer.project_type ? (
                        <div>
                          <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
                            Project
                          </dt>

                          <dd className="mt-1 text-sm font-semibold text-slate-900">
                            {customer.project_type}
                          </dd>
                        </div>
                      ) : null}

                      {customer.phone ? (
                        <div>
                          <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
                            Phone
                          </dt>

                          <dd className="mt-1 text-sm font-semibold text-slate-900">
                            <a
                              href={`tel:${customer.phone}`}
                              className="underline decoration-slate-300 underline-offset-4"
                            >
                              {customer.phone}
                            </a>
                          </dd>
                        </div>
                      ) : null}

                      {customer.email ? (
                        <div>
                          <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
                            Email
                          </dt>

                          <dd className="mt-1 break-all text-sm font-semibold text-slate-900">
                            <a
                              href={`mailto:${customer.email}`}
                              className="underline decoration-slate-300 underline-offset-4"
                            >
                              {customer.email}
                            </a>
                          </dd>
                        </div>
                      ) : null}

                      {address ? (
                        <div>
                          <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
                            Address
                          </dt>

                          <dd className="mt-1 text-sm font-semibold leading-6 text-slate-900">
                            {address}
                          </dd>
                        </div>
                      ) : null}

                      <div>
                        <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Customer Since
                        </dt>

                        <dd className="mt-1 text-sm font-semibold text-slate-900">
                          {formatDate(customer.created_at)}
                        </dd>
                      </div>
                    </dl>

                    {customer.notes ? (
                      <div className="mt-5 rounded-xl bg-slate-50 p-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Notes
                        </p>

                        <p className="mt-2 text-sm leading-6 text-slate-700">
                          {customer.notes}
                        </p>
                      </div>
                    ) : null}

                    <div className="mt-6 flex flex-wrap gap-4">
                      <Link
                        href={`/sales/customers/${customer.id}`}
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800"
                      >
                        Open Customer
                        <span aria-hidden="true">→</span>
                      </Link>

                      {customer.source_lead_id ? (
                        <Link
                          href={`/sales/leads/${customer.source_lead_id}`}
                          className="inline-flex items-center gap-2 px-1 py-2 text-sm font-bold text-slate-700 transition hover:text-slate-950"
                        >
                          Original Lead
                          <span aria-hidden="true">→</span>
                        </Link>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>

            {inactiveCustomers.length > 0 ? (
              <p className="mt-5 text-sm text-slate-500">
                {inactiveCustomers.length} inactive customer
                {inactiveCustomers.length === 1 ? "" : "s"} included.
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
