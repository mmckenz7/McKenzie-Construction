import Link from "next/link";
import { notFound } from "next/navigation";

import LeadAssignmentControl from "@/components/lead-assignment-control";
import { CustomerCommunicationPanel } from "@/components/customer-communication-panel";
import LeadNotesForm from "@/components/lead-notes-form";
import LeadStageWorkflow from "@/components/lead-stage-workflow";
import { OsCallButton } from "@/components/os-call-button";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export const dynamic = "force-dynamic";

type LeadPageProps = {
  params: Promise<{
    leadId: string;
  }>;
};

type Lead = {
  id: string | number;
  created_at: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  property_address: string | null;
  project_type: string | null;
  description: string | null;
  estimated_budget: string | null;
  desired_timeline: string | null;
  preferred_contact_method: string | null;
  requested_date: string | null;
  requested_time: string | null;
  alternate_date: string | null;
  alternate_time: string | null;
  consultation_status: string | null;
  lead_status: string | null;
  lead_source: string | null;
  next_follow_up: string | null;
  follow_up_at: string | null;
  notes: string | null;
  photo_urls: string[] | null;
};

type LeadTask = {
  id: string;
  task_type: string | null;
  title: string | null;
  description: string | null;
  status: string | null;
  priority: string | null;
  due_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  completion_note: string | null;
  created_at: string | null;
};

type LeadActivity = {
  id: string;
  activity_type: string | null;
  channel: string | null;
  direction: string | null;
  summary: string | null;
  details: string | null;
  occurred_at: string | null;
  created_at: string | null;
};

function displayValue(
  value: string | null | undefined,
) {
  return value?.trim() ? value : "—";
}

function titleCase(
  value: string | null | undefined,
) {
  if (!value) {
    return "—";
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTime(value: string | null) {
  if (!value) {
    return "—";
  }

  const [hours, minutes] = value
    .split(":")
    .map(Number);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    return value;
  }

  const date = new Date();

  date.setHours(hours, minutes, 0, 0);

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDateAndTime(
  value: string | null | undefined,
) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getLeadStageLabel(lead: Lead) {
  if (lead.lead_status === "won") {
    return "Won";
  }

  if (lead.lead_status === "lost") {
    return "Lost";
  }

  if (
    lead.lead_status === "customer_reviewing"
  ) {
    return "Customer Reviewing";
  }

  if (lead.lead_status === "proposal_sent") {
    return "Proposal Sent";
  }

  if (
    lead.lead_status === "estimate_in_progress"
  ) {
    return "Estimate In Progress";
  }

  if (
    lead.consultation_status === "completed"
  ) {
    return "Visit Complete";
  }

  if (
    lead.consultation_status === "confirmed"
  ) {
    return "Consultation Confirmed";
  }

  if (
    lead.consultation_status === "pending"
  ) {
    return "Consultation Pending";
  }

  if (lead.lead_status === "contacted") {
    return "Contacted";
  }

  return "New Lead";
}

function getStageClasses(lead: Lead) {
  if (lead.lead_status === "won") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (lead.lead_status === "lost") {
    return "bg-red-100 text-red-800";
  }

  if (
    lead.lead_status === "estimate_in_progress"
  ) {
    return "bg-sky-100 text-sky-800";
  }

  if (
    lead.lead_status === "proposal_sent" ||
    lead.lead_status === "customer_reviewing"
  ) {
    return "bg-violet-100 text-violet-800";
  }

  if (
    lead.consultation_status === "confirmed"
  ) {
    return "bg-amber-100 text-amber-800";
  }

  return "bg-slate-100 text-slate-800";
}

function getTaskClasses(task: LeadTask) {
  if (task.status === "completed") {
    return "border-emerald-200 bg-emerald-50";
  }

  if (task.status === "canceled") {
    return "border-slate-200 bg-slate-50";
  }

  if (
    task.due_at &&
    new Date(task.due_at).getTime() < Date.now()
  ) {
    return "border-red-300 bg-red-50";
  }

  return "border-amber-200 bg-amber-50";
}

export default async function LeadDetailPage({
  params,
}: LeadPageProps) {
  const { leadId: rawLeadId } = await params;
  const leadId = rawLeadId.trim();

  if (!leadId) {
    notFound();
  }

  const supabase = createAdminServerClient();

  const [
    leadResult,
    taskResult,
    activityResult,
    settingsResult,
    communicationThreadsResult,
  ] = await Promise.all([
    supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single(),

    supabase
      .from("lead_tasks")
      .select(
        `
          id,
          task_type,
          title,
          description,
          status,
          priority,
          due_at,
          completed_at,
          canceled_at,
          completion_note,
          created_at
        `,
      )
      .eq("lead_id", leadId)
      .order("created_at", {
        ascending: false,
      }),

    supabase
      .from("lead_activities")
      .select(
        `
          id,
          activity_type,
          channel,
          direction,
          summary,
          details,
          occurred_at,
          created_at
        `,
      )
      .eq("lead_id", leadId)
      .order("occurred_at", {
        ascending: false,
      }),

    supabase
      .from("company_settings")
      .select("consultation_start_time, consultation_end_time")
      .limit(1)
      .maybeSingle(),

    supabase
      .from("communication_threads")
      .select("id,subject,provider")
      .eq("lead_id", leadId)
      .neq("status", "archived")
      .order("last_message_at", { ascending: false })
      .limit(20),
  ]);

  if (leadResult.error || !leadResult.data) {
    notFound();
  }

  const lead = leadResult.data as Lead;
  const communicationThreads = communicationThreadsResult.data ?? [];
  const emailThread = communicationThreads.find((thread) => thread.provider !== "twilio") ?? null;
  const smsThread = communicationThreads.find((thread) => thread.provider === "twilio") ?? null;

  const tasks =
    (taskResult.data ?? []) as LeadTask[];

  const activities =
    (activityResult.data ?? []) as LeadActivity[];

  const openTasks = tasks.filter(
    (task) =>
      task.status === "open" ||
      task.status === "in_progress",
  );

  const closedTasks = tasks.filter(
    (task) =>
      task.status !== "open" &&
      task.status !== "in_progress",
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

        <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-slate-950 px-6 py-6 text-white sm:px-8">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
                  McKenzie Construction Lead
                </p>

                <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
                  {displayValue(lead.name)}
                </h1>

                <p className="mt-2 text-sm text-slate-300">
                  Submitted{" "}
                  {formatDateAndTime(
                    lead.created_at,
                  )}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <span
                  className={`rounded-full px-4 py-2 text-sm font-bold ${getStageClasses(
                    lead,
                  )}`}
                >
                  {getLeadStageLabel(lead)}
                </span>

                <span className="rounded-full bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200">
                  Consultation:{" "}
                  {titleCase(
                    lead.consultation_status,
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-4">
            <section className="border-b border-slate-200 p-6 lg:border-b-0 lg:border-r">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Phone
              </p>

              <p className="mt-2 text-sm font-semibold text-slate-950">
                {lead.phone ? (
                  <a
                    href={`tel:${lead.phone}`}
                    className="underline decoration-slate-300 underline-offset-4"
                  >
                    {lead.phone}
                  </a>
                ) : (
                  "—"
                )}
              </p>
              <div className="mt-3"><OsCallButton leadId={String(lead.id)} disabled={!lead.phone} /></div>
            </section>

            <section className="border-b border-slate-200 p-6 lg:border-b-0 lg:border-r">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Email
              </p>

              <p className="mt-2 break-all text-sm font-semibold text-slate-950">
                {lead.email ? (
                  <a
                    href={`mailto:${lead.email}`}
                    className="underline decoration-slate-300 underline-offset-4"
                  >
                    {lead.email}
                  </a>
                ) : (
                  "—"
                )}
              </p>
            </section>

            <section className="border-b border-slate-200 p-6 lg:border-b-0 lg:border-r">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Project
              </p>

              <p className="mt-2 text-sm font-semibold text-slate-950">
                {displayValue(
                  lead.project_type,
                )}
              </p>
            </section>

            <section className="p-6">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Next Follow-Up
              </p>

              <p className="mt-2 text-sm font-semibold text-slate-950">
                {lead.follow_up_at
                  ? formatDateAndTime(
                      lead.follow_up_at,
                    )
                  : "Not scheduled"}
              </p>
            </section>
          </div>
        </header>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <section
              id="lead-workflow"
              className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-6">
                <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
                  Current Stage
                </p>

                <h2 className="mt-1 text-2xl font-bold text-slate-950">
                  Lead Workflow
                </h2>

                <p className="mt-2 text-sm text-slate-600">
                  Only actions relevant to this lead’s current stage are shown.
                </p>
              </div>

              <LeadStageWorkflow
                leadId={String(lead.id)}
                currentStatus={
                  lead.lead_status
                }
                currentConsultationStatus={
                  lead.consultation_status
                }
                currentFollowUpAt={
                  lead.follow_up_at
                }
                requestedDate={
                  lead.requested_date
                }
                requestedTime={
                  lead.requested_time
                }
                alternateDate={
                  lead.alternate_date
                }
                alternateTime={
                  lead.alternate_time
                }
                consultationStartTime={
                  settingsResult.data?.consultation_start_time ?? "08:00"
                }
                consultationEndTime={
                  settingsResult.data?.consultation_end_time ?? "17:00"
                }
              />
            </section>

            <CustomerCommunicationPanel
              email={lead.email}
              phone={lead.phone}
              leadId={String(lead.id)}
              emailThreadId={emailThread?.id ?? null}
              smsThreadId={smsThread?.id ?? null}
              initialSubject={emailThread?.subject ?? `Regarding your ${lead.project_type?.trim() || "project"}`}
            />

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Project Record
                </p>

                <h2 className="mt-1 text-xl font-bold text-slate-950">
                  Customer and Project Details
                </h2>
              </div>

              <div className="grid gap-8 md:grid-cols-2">
                <div>
                  <h3 className="font-bold text-slate-950">
                    Contact
                  </h3>

                  <dl className="mt-4 space-y-4 text-sm">
                    <div>
                      <dt className="text-slate-500">
                        Property address
                      </dt>

                      <dd className="mt-1 font-semibold text-slate-950">
                        {displayValue(
                          lead.property_address,
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-slate-500">
                        Preferred contact
                      </dt>

                      <dd className="mt-1 font-semibold text-slate-950">
                        {titleCase(
                          lead.preferred_contact_method,
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-slate-500">
                        Lead source
                      </dt>

                      <dd className="mt-1 font-semibold text-slate-950">
                        {titleCase(
                          lead.lead_source,
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div>
                  <h3 className="font-bold text-slate-950">
                    Project
                  </h3>

                  <dl className="mt-4 space-y-4 text-sm">
                    <div>
                      <dt className="text-slate-500">
                        Project type
                      </dt>

                      <dd className="mt-1 font-semibold text-slate-950">
                        {displayValue(
                          lead.project_type,
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-slate-500">
                        Estimated budget
                      </dt>

                      <dd className="mt-1 font-semibold text-slate-950">
                        {displayValue(
                          lead.estimated_budget,
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-slate-500">
                        Desired timeline
                      </dt>

                      <dd className="mt-1 font-semibold text-slate-950">
                        {displayValue(
                          lead.desired_timeline,
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="mt-8 border-t border-slate-200 pt-6">
                <h3 className="font-bold text-slate-950">
                  Project Description
                </h3>

                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {displayValue(
                    lead.description,
                  )}
                </p>
              </div>

              <div className="mt-8 border-t border-slate-200 pt-6">
                <h3 className="font-bold text-slate-950">
                  Requested Consultation
                </h3>

                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                      Preferred
                    </p>

                    <p className="mt-2 text-sm font-semibold text-slate-950">
                      {formatDate(
                        lead.requested_date,
                      )}{" "}
                      at{" "}
                      {formatTime(
                        lead.requested_time,
                      )}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                      Alternate
                    </p>

                    <p className="mt-2 text-sm font-semibold text-slate-950">
                      {formatDate(
                        lead.alternate_date,
                      )}{" "}
                      at{" "}
                      {formatTime(
                        lead.alternate_time,
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <LeadNotesForm
                leadId={String(lead.id)}
                currentNotes={lead.notes}
              />
            </section>
          </div>

          <aside className="space-y-6">
            <LeadAssignmentControl
              leadId={String(lead.id)}
            />

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

              {taskResult.error ? (
                <p className="mt-4 text-sm font-semibold text-red-700">
                  {taskResult.error.message}
                </p>
              ) : openTasks.length === 0 ? (
                <p className="mt-4 text-sm text-slate-600">
                  No open tasks.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {openTasks.map((task) => (
                    <article
                      key={task.id}
                      className={`rounded-xl border p-4 ${getTaskClasses(
                        task,
                      )}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-sm font-bold text-slate-950">
                          {displayValue(
                            task.title,
                          )}
                        </h3>

                        <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                          {titleCase(
                            task.priority,
                          )}
                        </span>
                      </div>

                      {task.description ? (
                        <p className="mt-2 text-xs leading-5 text-slate-700">
                          {task.description}
                        </p>
                      ) : null}

                      <p className="mt-3 text-xs font-semibold text-slate-600">
                        Due:{" "}
                        {formatDateAndTime(
                          task.due_at,
                        )}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Timeline
                </p>

                <h2 className="mt-1 text-lg font-bold text-slate-950">
                  Recent Activity
                </h2>
              </div>

              {activityResult.error ? (
                <p className="mt-4 text-sm font-semibold text-red-700">
                  {activityResult.error.message}
                </p>
              ) : activities.length === 0 ? (
                <p className="mt-4 text-sm text-slate-600">
                  No activity recorded yet.
                </p>
              ) : (
                <div className="mt-5 space-y-5">
                  {activities
                    .slice(0, 15)
                    .map((activity) => (
                      <article
                        key={activity.id}
                        className="relative border-l-2 border-slate-200 pl-4"
                      >
                        <span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-slate-500" />

                        <h3 className="text-sm font-bold text-slate-950">
                          {displayValue(
                            activity.summary,
                          )}
                        </h3>

                        {activity.details ? (
                          <p className="mt-1 text-xs leading-5 text-slate-600">
                            {activity.details}
                          </p>
                        ) : null}

                        <p className="mt-2 text-[11px] font-semibold text-slate-400">
                          {formatDateAndTime(
                            activity.occurred_at ??
                              activity.created_at,
                          )}
                        </p>
                      </article>
                    ))}
                </div>
              )}
            </section>

            {closedTasks.length > 0 ? (
              <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <summary className="cursor-pointer font-bold text-slate-950">
                  Closed Tasks ({closedTasks.length})
                </summary>

                <div className="mt-4 space-y-3">
                  {closedTasks
                    .slice(0, 20)
                    .map((task) => (
                      <article
                        key={task.id}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <h3 className="text-sm font-bold text-slate-800">
                          {displayValue(
                            task.title,
                          )}
                        </h3>

                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {titleCase(
                            task.status,
                          )}
                        </p>

                        {task.completion_note ? (
                          <p className="mt-2 text-xs leading-5 text-slate-600">
                            {task.completion_note}
                          </p>
                        ) : null}
                      </article>
                    ))}
                </div>
              </details>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  );
}
