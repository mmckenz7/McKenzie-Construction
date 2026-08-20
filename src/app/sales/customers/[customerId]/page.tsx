import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerProjectManager } from "@/components/customer-project-manager";
import { CustomerCommunicationPanel } from "@/components/customer-communication-panel";
import { OsCallButton } from "@/components/os-call-button";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export const dynamic = "force-dynamic";

type CustomerPageProps = {
  params: Promise<{
    customerId: string;
  }>;
};

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

type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
};

type CustomerTask = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  task_type: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  completed_at: string | null;
  completion_note: string | null;
  assigned_to_id: string | null;
  created_at: string;
};

type Project = {
  id: string;
  project_name: string;
  project_type: string | null;
  description: string | null;
  property_address: string | null;
  status: string;
  project_manager_id: string | null;
  estimated_value: number | null;
  contract_value: number | null;
  start_date: string | null;
  target_completion_date: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type CompanySettings = {
  automatically_assign_converted_projects: boolean;
  require_project_manager: boolean;
  default_project_manager_id: string | null;
};

function displayValue(
  value: string | null | undefined,
) {
  return value?.trim()
    ? value
    : "—";
}

function formatStatus(
  value: string,
) {
  return value
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1),
    )
    .join(" ");
}

function formatDateAndTime(
  value: string | null | undefined,
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(date);
}

function buildAddress(
  customer: Customer,
) {
  const cityState = [
    customer.city,
    customer.state,
  ]
    .filter(Boolean)
    .join(", ");

  const cityStatePostal = [
    cityState,
    customer.postal_code,
  ]
    .filter(Boolean)
    .join(" ");

  return [
    customer.address_line_1,
    customer.address_line_2,
    cityStatePostal,
  ]
    .filter(Boolean)
    .join(", ");
}

function getTaskClasses(
  task: CustomerTask,
) {
  if (
    task.status ===
    "completed"
  ) {
    return "border-emerald-200 bg-emerald-50";
  }

  if (
    task.status ===
    "canceled"
  ) {
    return "border-slate-200 bg-slate-50";
  }

  if (
    task.due_at &&
    new Date(
      task.due_at,
    ).getTime() < Date.now()
  ) {
    return "border-red-300 bg-red-50";
  }

  return "border-amber-200 bg-amber-50";
}

export default async function CustomerDetailPage({
  params,
}: CustomerPageProps) {
  const {
    customerId: rawCustomerId,
  } = await params;

  const customerId =
    rawCustomerId.trim();

  if (!customerId) {
    notFound();
  }

  const supabase =
    createAdminServerClient();

  const customerResult =
    await supabase
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
      .eq(
        "id",
        customerId,
      )
      .single();

  if (
    customerResult.error ||
    !customerResult.data
  ) {
    notFound();
  }

  const customer =
    customerResult.data as Customer;

  const [
    assignedEmployeeResult,
    tasksResult,
    projectsResult,
    activeTeamResult,
    companySettingsResult,
    communicationThreadsResult,
  ] = await Promise.all([
    customer.assigned_to
      ? supabase
          .from("team_members")
          .select(
            `
              id,
              name,
              email,
              phone,
              job_title
            `,
          )
          .eq(
            "id",
            customer.assigned_to,
          )
          .maybeSingle()
      : Promise.resolve({
          data: null,
          error: null,
        }),

    supabase
      .from("tasks")
      .select(
        `
          id,
          title,
          description,
          category,
          task_type,
          status,
          priority,
          due_at,
          completed_at,
          completion_note,
          assigned_to_id,
          created_at
        `,
      )
      .eq(
        "customer_id",
        customerId,
      )
      .order(
        "due_at",
        {
          ascending: true,
          nullsFirst: false,
        },
      )
      .order(
        "created_at",
        {
          ascending: false,
        },
      ),

    supabase
      .from("projects")
      .select(
        `
          id,
          project_name,
          project_type,
          description,
          property_address,
          status,
          project_manager_id,
          estimated_value,
          contract_value,
          start_date,
          target_completion_date,
          completed_at,
          notes,
          created_at,
          updated_at
        `,
      )
      .eq(
        "customer_id",
        customerId,
      )
      .order(
        "created_at",
        {
          ascending: false,
        },
      ),

    supabase
      .from("team_members")
      .select(
        `
          id,
          name,
          email,
          phone,
          job_title
        `,
      )
      .eq(
        "status",
        "active",
      )
      .order(
        "name",
        {
          ascending: true,
        },
      ),

    supabase
      .from("company_settings")
      .select(
        `
          automatically_assign_converted_projects,
          require_project_manager,
          default_project_manager_id
        `,
      )
      .limit(1)
      .maybeSingle(),

    supabase
      .from("communication_threads")
      .select("id,subject,provider")
      .eq("customer_id", customerId)
      .neq("status", "archived")
      .order("last_message_at", { ascending: false })
      .limit(20),
  ]);

  const assignedEmployee =
    (assignedEmployeeResult.data ??
      null) as TeamMember | null;
  const communicationThreads = communicationThreadsResult.data ?? [];
  const emailThread = communicationThreads.find((thread) => thread.provider !== "twilio") ?? null;
  const smsThread = communicationThreads.find((thread) => thread.provider === "twilio") ?? null;

  const tasks =
    (tasksResult.data ??
      []) as CustomerTask[];

  const projects =
    (projectsResult.data ??
      []) as Project[];

  const activeTeamMembers =
    (activeTeamResult.data ??
      []) as TeamMember[];

  const companySettings =
    (companySettingsResult.data ??
      {
        automatically_assign_converted_projects:
          false,
        require_project_manager:
          false,
        default_project_manager_id:
          null,
      }) as CompanySettings;

  const openTasks =
    tasks.filter(
      (task) =>
        task.status ===
          "open" ||
        task.status ===
          "in_progress",
    );

  const closedTasks =
    tasks.filter(
      (task) =>
        task.status !==
          "open" &&
        task.status !==
          "in_progress",
    );

  const address =
    buildAddress(customer);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <Link
            href="/sales/customers"
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 transition hover:text-slate-950"
          >
            <span aria-hidden="true">
              ←
            </span>
            Back to Customers
          </Link>
        </div>

        <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-slate-950 px-6 py-6 text-white sm:px-8">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
                  McKenzie Construction Customer
                </p>

                <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
                  {
                    customer.customer_name
                  }
                </h1>

                <p className="mt-2 text-sm text-slate-300">
                  Customer since{" "}
                  {formatDateAndTime(
                    customer.created_at,
                  )}
                </p>
              </div>

              <span className="w-fit rounded-full bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-800">
                {formatStatus(
                  customer.status,
                )}
              </span>
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-5">
            <section className="border-b border-slate-200 p-6 lg:border-b-0 lg:border-r">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Phone
              </p>

              <p className="mt-2 text-sm font-semibold text-slate-950">
                {customer.phone ? (
                  <a
                    href={`tel:${customer.phone}`}
                    className="underline decoration-slate-300 underline-offset-4"
                  >
                    {customer.phone}
                  </a>
                ) : (
                  "—"
                )}
              </p>
              <div className="mt-3"><OsCallButton leadId={customer.source_lead_id} customerId={customer.id} disabled={!customer.phone} /></div>
            </section>

            <section className="border-b border-slate-200 p-6 lg:border-b-0 lg:border-r">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Email
              </p>

              <p className="mt-2 break-all text-sm font-semibold text-slate-950">
                {customer.email ? (
                  <a
                    href={`mailto:${customer.email}`}
                    className="underline decoration-slate-300 underline-offset-4"
                  >
                    {customer.email}
                  </a>
                ) : (
                  "—"
                )}
              </p>
            </section>

            <section className="border-b border-slate-200 p-6 lg:border-b-0 lg:border-r">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Project Type
              </p>

              <p className="mt-2 text-sm font-semibold text-slate-950">
                {displayValue(
                  customer.project_type,
                )}
              </p>
            </section>

            <section className="border-b border-slate-200 p-6 lg:border-b-0 lg:border-r">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Projects
              </p>

              <p className="mt-2 text-sm font-semibold text-slate-950">
                {projects.length}
              </p>
            </section>

            <section className="p-6">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Open Tasks
              </p>

              <p className="mt-2 text-sm font-semibold text-slate-950">
                {openTasks.length}
              </p>
            </section>
          </div>
        </header>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <CustomerCommunicationPanel
              email={customer.email}
              phone={customer.phone}
              leadId={customer.source_lead_id}
              customerId={customer.id}
              emailThreadId={emailThread?.id ?? null}
              smsThreadId={smsThread?.id ?? null}
              initialSubject={emailThread?.subject ?? `Regarding your ${customer.project_type?.trim() || "project"}`}
            />

            <CustomerProjectManager
              customerId={
                customer.id
              }
              customerName={
                customer.customer_name
              }
              defaultProjectType={
                customer.project_type
              }
              defaultPropertyAddress={
                address || null
              }
              projects={
                projects
              }
              teamMembers={
                activeTeamMembers
              }
              automaticallyAssignProjects={
                companySettings
                  .automatically_assign_converted_projects
              }
              requireProjectManager={
                companySettings
                  .require_project_manager
              }
              defaultProjectManagerId={
                companySettings
                  .default_project_manager_id
              }
            />

            {projectsResult.error ? (
              <section className="rounded-2xl border border-red-200 bg-red-50 p-6">
                <h2 className="font-bold text-red-800">
                  Unable to load projects
                </h2>

                <p className="mt-2 text-sm text-red-700">
                  {
                    projectsResult.error
                      .message
                  }
                </p>
              </section>
            ) : null}

            {activeTeamResult.error ? (
              <section className="rounded-2xl border border-red-200 bg-red-50 p-6">
                <h2 className="font-bold text-red-800">
                  Unable to load project managers
                </h2>

                <p className="mt-2 text-sm text-red-700">
                  {
                    activeTeamResult.error
                      .message
                  }
                </p>
              </section>
            ) : null}

            {companySettingsResult.error ? (
              <section className="rounded-2xl border border-red-200 bg-red-50 p-6">
                <h2 className="font-bold text-red-800">
                  Unable to load project assignment settings
                </h2>

                <p className="mt-2 text-sm text-red-700">
                  {
                    companySettingsResult
                      .error.message
                  }
                </p>
              </section>
            ) : null}

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
                Customer Record
              </p>

              <h2 className="mt-1 text-2xl font-bold text-slate-950">
                Contact Details
              </h2>

              <div className="mt-6 grid gap-8 md:grid-cols-2">
                <div>
                  <h3 className="font-bold text-slate-950">
                    Contact
                  </h3>

                  <dl className="mt-4 space-y-4 text-sm">
                    <div>
                      <dt className="text-slate-500">
                        First name
                      </dt>

                      <dd className="mt-1 font-semibold text-slate-950">
                        {displayValue(
                          customer.first_name,
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-slate-500">
                        Last name
                      </dt>

                      <dd className="mt-1 font-semibold text-slate-950">
                        {displayValue(
                          customer.last_name,
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-slate-500">
                        Address
                      </dt>

                      <dd className="mt-1 font-semibold leading-6 text-slate-950">
                        {address ||
                          "—"}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div>
                  <h3 className="font-bold text-slate-950">
                    Customer
                  </h3>

                  <dl className="mt-4 space-y-4 text-sm">
                    <div>
                      <dt className="text-slate-500">
                        Customer status
                      </dt>

                      <dd className="mt-1 font-semibold text-slate-950">
                        {formatStatus(
                          customer.status,
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-slate-500">
                        Assigned employee
                      </dt>

                      <dd className="mt-1 font-semibold text-slate-950">
                        {assignedEmployee?.name ??
                          "Unassigned"}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-slate-500">
                        Last updated
                      </dt>

                      <dd className="mt-1 font-semibold text-slate-950">
                        {formatDateAndTime(
                          customer.updated_at,
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="mt-8 border-t border-slate-200 pt-6">
                <h3 className="font-bold text-slate-950">
                  Notes
                </h3>

                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {displayValue(
                    customer.notes,
                  )}
                </p>
              </div>

              {customer.source_lead_id ? (
                <div className="mt-8 border-t border-slate-200 pt-6">
                  <Link
                    href={`/sales/leads/${customer.source_lead_id}`}
                    className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 transition hover:text-slate-950"
                  >
                    View Original Lead
                    <span aria-hidden="true">
                      →
                    </span>
                  </Link>
                </div>
              ) : null}
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Assigned Employee
              </p>

              {assignedEmployeeResult.error ? (
                <p className="mt-4 text-sm font-semibold text-red-700">
                  {
                    assignedEmployeeResult
                      .error.message
                  }
                </p>
              ) : assignedEmployee ? (
                <div className="mt-4">
                  <h2 className="text-lg font-bold text-slate-950">
                    {
                      assignedEmployee.name
                    }
                  </h2>

                  <p className="mt-1 text-sm text-slate-600">
                    {displayValue(
                      assignedEmployee.job_title,
                    )}
                  </p>

                  {assignedEmployee.email ? (
                    <a
                      href={`mailto:${assignedEmployee.email}`}
                      className="mt-4 block text-sm font-semibold text-slate-700 underline decoration-slate-300 underline-offset-4"
                    >
                      {
                        assignedEmployee.email
                      }
                    </a>
                  ) : null}

                  {assignedEmployee.phone ? (
                    <a
                      href={`tel:${assignedEmployee.phone}`}
                      className="mt-2 block text-sm font-semibold text-slate-700 underline decoration-slate-300 underline-offset-4"
                    >
                      {
                        assignedEmployee.phone
                      }
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-600">
                  No employee assigned.
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                    Tasks
                  </p>

                  <h2 className="mt-1 text-lg font-bold text-slate-950">
                    Open Tasks
                  </h2>
                </div>

                <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-bold text-white">
                  {openTasks.length}
                </span>
              </div>

              {tasksResult.error ? (
                <p className="mt-4 text-sm font-semibold text-red-700">
                  {
                    tasksResult.error
                      .message
                  }
                </p>
              ) : openTasks.length ===
                0 ? (
                <p className="mt-4 text-sm text-slate-600">
                  No open customer tasks.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {openTasks.map(
                    (task) => (
                      <article
                        key={task.id}
                        className={`rounded-xl border p-4 ${getTaskClasses(
                          task,
                        )}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-sm font-bold text-slate-950">
                            {
                              task.title
                            }
                          </h3>

                          <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                            {formatStatus(
                              task.priority,
                            )}
                          </span>
                        </div>

                        {task.description ? (
                          <p className="mt-2 text-xs leading-5 text-slate-700">
                            {
                              task.description
                            }
                          </p>
                        ) : null}

                        <p className="mt-3 text-xs font-semibold text-slate-600">
                          Due:{" "}
                          {formatDateAndTime(
                            task.due_at,
                          )}
                        </p>
                      </article>
                    ),
                  )}
                </div>
              )}
            </section>

            {closedTasks.length > 0 ? (
              <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <summary className="cursor-pointer font-bold text-slate-950">
                  Closed Tasks (
                  {closedTasks.length})
                </summary>

                <div className="mt-4 space-y-3">
                  {closedTasks.map(
                    (task) => (
                      <article
                        key={task.id}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <h3 className="text-sm font-bold text-slate-800">
                          {
                            task.title
                          }
                        </h3>

                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {formatStatus(
                            task.status,
                          )}
                        </p>

                        {task.completion_note ? (
                          <p className="mt-2 text-xs leading-5 text-slate-600">
                            {
                              task.completion_note
                            }
                          </p>
                        ) : null}
                      </article>
                    ),
                  )}
                </div>
              </details>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  );
}
