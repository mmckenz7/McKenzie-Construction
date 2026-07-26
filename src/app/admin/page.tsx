import Link from "next/link";

import LeadNotesForm from "@/components/lead-notes-form";
import LeadStatusForm from "@/components/lead-status-form";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export const dynamic = "force-dynamic";

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

type SearchParams = {
  period?: string | string[];
  status?: string | string[];
};

type AdminPageProps = {
  searchParams?: Promise<SearchParams>;
};

type PeriodOption = {
  value: string;
  label: string;
  description: string;
  days: number | null;
};

type StatusFilter =
  | "new"
  | "pending"
  | "confirmed"
  | "proposal_sent"
  | "won"
  | "lost";

type SummaryCardProps = {
  label: string;
  value: number;
  description: string;
  status: StatusFilter;
  currentPeriod: string;
  isActive: boolean;
};

const periodOptions: PeriodOption[] = [
  {
    value: "week",
    label: "1 Week",
    description: "Last 7 days",
    days: 7,
  },
  {
    value: "two_weeks",
    label: "2 Weeks",
    description: "Last 14 days",
    days: 14,
  },
  {
    value: "month",
    label: "1 Month",
    description: "Last 30 days",
    days: 30,
  },
  {
    value: "three_months",
    label: "3 Months",
    description: "Last 90 days",
    days: 90,
  },
  {
    value: "six_months",
    label: "6 Months",
    description: "Last 180 days",
    days: 180,
  },
  {
    value: "twelve_months",
    label: "12 Months",
    description: "Last 365 days",
    days: 365,
  },
  {
    value: "all",
    label: "All Time",
    description: "Every submitted lead",
    days: null,
  },
];

const validStatusFilters: StatusFilter[] = [
  "new",
  "pending",
  "confirmed",
  "proposal_sent",
  "won",
  "lost",
];

function SummaryCard({
  label,
  value,
  description,
  status,
  currentPeriod,
  isActive,
}: SummaryCardProps) {
  return (
    <Link
      href={`/admin?period=${currentPeriod}&status=${status}#leads`}
      className={`block rounded-xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        isActive
          ? "border-slate-950 bg-slate-950 text-white"
          : "border-slate-200 bg-white text-slate-950 hover:border-slate-400"
      }`}
    >
      <p
        className={`text-sm font-semibold ${
          isActive ? "text-slate-200" : "text-slate-600"
        }`}
      >
        {label}
      </p>

      <p className="mt-2 text-3xl font-bold">{value}</p>

      <p
        className={`mt-1 text-xs ${
          isActive ? "text-slate-300" : "text-slate-500"
        }`}
      >
        {description}
      </p>

      <p
        className={`mt-4 text-xs font-bold uppercase tracking-wide ${
          isActive ? "text-amber-300" : "text-amber-700"
        }`}
      >
        {isActive ? "Showing these leads" : "View leads"}
      </p>
    </Link>
  );
}

function getSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function getPeriodOption(value: string | undefined) {
  return (
    periodOptions.find((option) => option.value === value) ??
    periodOptions[periodOptions.length - 1]
  );
}

function isStatusFilter(value: string | undefined): value is StatusFilter {
  return Boolean(
    value &&
      validStatusFilters.includes(value as StatusFilter),
  );
}

function isLeadWithinPeriod(
  lead: Lead,
  period: PeriodOption,
) {
  if (period.days === null) {
    return true;
  }

  if (!lead.created_at) {
    return false;
  }

  const createdDate = new Date(lead.created_at);

  if (Number.isNaN(createdDate.getTime())) {
    return false;
  }

  const cutoffDate = new Date();

  cutoffDate.setHours(0, 0, 0, 0);
  cutoffDate.setDate(cutoffDate.getDate() - period.days);

  return createdDate >= cutoffDate;
}

function leadMatchesStatus(
  lead: Lead,
  status: StatusFilter,
) {
  switch (status) {
    case "new":
      return lead.lead_status === "new";

    case "pending":
      return lead.consultation_status === "pending";

    case "confirmed":
      return lead.consultation_status === "confirmed";

    case "proposal_sent":
      return lead.lead_status === "proposal_sent";

    case "won":
      return lead.lead_status === "won";

    case "lost":
      return lead.lead_status === "lost";

    default:
      return true;
  }
}

function getStatusFilterLabel(
  status: StatusFilter | null,
) {
  switch (status) {
    case "new":
      return "New Leads";

    case "pending":
      return "Pending Consultations";

    case "confirmed":
      return "Confirmed Consultations";

    case "proposal_sent":
      return "Proposal Sent";

    case "won":
      return "Won";

    case "lost":
      return "Lost";

    default:
      return "All Leads";
  }
}

function displayValue(value: string | null | undefined) {
  return value?.trim() ? value : "—";
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

  const [hours, minutes] = value.split(":").map(Number);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return value;
  }

  const date = new Date();

  date.setHours(hours, minutes, 0, 0);

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatCreated(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatFollowUp(value: string | null) {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function titleCase(value: string | null) {
  if (!value) {
    return "—";
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default async function AdminPage({
  searchParams,
}: AdminPageProps) {
  const resolvedSearchParams = searchParams
    ? await searchParams
    : {};

  const requestedPeriod = getSearchParam(
    resolvedSearchParams.period,
  );

  const requestedStatus = getSearchParam(
    resolvedSearchParams.status,
  );

  const selectedPeriod = getPeriodOption(requestedPeriod);

  const selectedStatus = isStatusFilter(requestedStatus)
    ? requestedStatus
    : null;

  const supabase = createAdminServerClient();

  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="min-h-screen bg-slate-100 p-8">
        <div className="mx-auto max-w-4xl rounded-xl border border-red-200 bg-white p-8">
          <h1 className="text-2xl font-bold text-red-700">
            Error loading leads
          </h1>

          <p className="mt-4 text-slate-700">
            {error.message}
          </p>
        </div>
      </main>
    );
  }

  const allLeads = (data ?? []) as Lead[];

  const periodLeads = allLeads.filter((lead) =>
    isLeadWithinPeriod(lead, selectedPeriod),
  );

  const filteredLeads = selectedStatus
    ? periodLeads.filter((lead) =>
        leadMatchesStatus(lead, selectedStatus),
      )
    : periodLeads;

  const newLeadCount = periodLeads.filter(
    (lead) => lead.lead_status === "new",
  ).length;

  const pendingConsultationCount = periodLeads.filter(
    (lead) => lead.consultation_status === "pending",
  ).length;

  const confirmedConsultationCount = periodLeads.filter(
    (lead) => lead.consultation_status === "confirmed",
  ).length;

  const proposalSentCount = periodLeads.filter(
    (lead) => lead.lead_status === "proposal_sent",
  ).length;

  const wonCount = periodLeads.filter(
    (lead) => lead.lead_status === "won",
  ).length;

  const lostCount = periodLeads.filter(
    (lead) => lead.lead_status === "lost",
  ).length;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-700">
            McKenzie Construction
          </p>

          <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-4xl font-bold text-slate-950">
                Lead Dashboard
              </h1>

              <p className="mt-2 text-slate-600">
                Review website leads and consultation requests.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
              <p className="text-sm text-slate-500">
                Leads in selected period
              </p>

              <p className="text-2xl font-bold text-slate-950">
                {periodLeads.length}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {selectedPeriod.description}
              </p>
            </div>
          </div>
        </header>

        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="font-bold text-slate-950">
                Time Period
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Counts and lead results use the date each lead was submitted.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {periodOptions.map((option) => {
                const isActive =
                  selectedPeriod.value === option.value;

                const statusPart = selectedStatus
                  ? `&status=${selectedStatus}`
                  : "";

                return (
                  <Link
                    key={option.value}
                    href={`/admin?period=${option.value}${statusPart}`}
                    className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                      isActive
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:border-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {option.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <SummaryCard
            label="New Leads"
            value={newLeadCount}
            description="Not contacted yet"
            status="new"
            currentPeriod={selectedPeriod.value}
            isActive={selectedStatus === "new"}
          />

          <SummaryCard
            label="Pending Consultations"
            value={pendingConsultationCount}
            description="Waiting for confirmation"
            status="pending"
            currentPeriod={selectedPeriod.value}
            isActive={selectedStatus === "pending"}
          />

          <SummaryCard
            label="Consultations Confirmed"
            value={confirmedConsultationCount}
            description="Date and time accepted"
            status="confirmed"
            currentPeriod={selectedPeriod.value}
            isActive={selectedStatus === "confirmed"}
          />

          <SummaryCard
            label="Proposal Sent"
            value={proposalSentCount}
            description="Waiting for customer"
            status="proposal_sent"
            currentPeriod={selectedPeriod.value}
            isActive={selectedStatus === "proposal_sent"}
          />

          <SummaryCard
            label="Won"
            value={wonCount}
            description="Jobs awarded"
            status="won"
            currentPeriod={selectedPeriod.value}
            isActive={selectedStatus === "won"}
          />

          <SummaryCard
            label="Lost"
            value={lostCount}
            description="Closed opportunities"
            status="lost"
            currentPeriod={selectedPeriod.value}
            isActive={selectedStatus === "lost"}
          />
        </section>

        <section
          id="leads"
          className="scroll-mt-6"
        >
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-bold text-slate-950">
                {getStatusFilterLabel(selectedStatus)}
              </h2>

              <p className="mt-1 text-sm text-slate-600">
                Showing {filteredLeads.length} of{" "}
                {periodLeads.length} leads from{" "}
                {selectedPeriod.label.toLowerCase()}.
              </p>
            </div>

            {selectedStatus ? (
              <Link
                href={`/admin?period=${selectedPeriod.value}#leads`}
                className="inline-flex w-fit rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-500 hover:bg-slate-50"
              >
                Clear status filter
              </Link>
            ) : null}
          </div>

          {filteredLeads.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
              <h3 className="text-xl font-bold text-slate-950">
                No matching leads
              </h3>

              <p className="mt-2 text-slate-600">
                There are no leads matching this status and time period.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredLeads.map((lead) => (
                <article
                  key={lead.id}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                >
                  <div className="flex flex-col justify-between gap-4 bg-slate-950 px-6 py-5 text-white sm:flex-row sm:items-center">
                    <div>
                      <h2 className="text-2xl font-bold">
                        {displayValue(lead.name)}
                      </h2>

                      <p className="mt-1 text-sm text-slate-300">
                        Submitted {formatCreated(lead.created_at)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-amber-400 px-3 py-1 text-sm font-semibold text-slate-950">
                        Lead: {titleCase(lead.lead_status)}
                      </span>

                      <span className="rounded-full bg-slate-700 px-3 py-1 text-sm">
                        Consultation:{" "}
                        {titleCase(lead.consultation_status)}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-8 p-6 lg:grid-cols-3">
                    <section>
                      <h3 className="mb-4 font-bold text-slate-950">
                        Contact
                      </h3>

                      <div className="space-y-3 text-sm">
                        <p>
                          <strong>Phone:</strong>{" "}
                          {lead.phone ? (
                            <a
                              href={`tel:${lead.phone}`}
                              className="underline underline-offset-4"
                            >
                              {lead.phone}
                            </a>
                          ) : (
                            "—"
                          )}
                        </p>

                        <p>
                          <strong>Email:</strong>{" "}
                          {lead.email ? (
                            <a
                              href={`mailto:${lead.email}`}
                              className="break-all underline underline-offset-4"
                            >
                              {lead.email}
                            </a>
                          ) : (
                            "—"
                          )}
                        </p>

                        <p>
                          <strong>Address:</strong>{" "}
                          {displayValue(lead.property_address)}
                        </p>

                        <p>
                          <strong>Preferred contact:</strong>{" "}
                          {titleCase(
                            lead.preferred_contact_method,
                          )}
                        </p>
                      </div>
                    </section>

                    <section>
                      <h3 className="mb-4 font-bold text-slate-950">
                        Project
                      </h3>

                      <div className="space-y-3 text-sm">
                        <p>
                          <strong>Type:</strong>{" "}
                          {displayValue(lead.project_type)}
                        </p>

                        <p>
                          <strong>Budget:</strong>{" "}
                          {displayValue(lead.estimated_budget)}
                        </p>

                        <p>
                          <strong>Timeline:</strong>{" "}
                          {displayValue(lead.desired_timeline)}
                        </p>

                        <p>
                          <strong>Source:</strong>{" "}
                          {titleCase(lead.lead_source)}
                        </p>
                      </div>
                    </section>

                    <section>
                      <h3 className="mb-4 font-bold text-slate-950">
                        Consultation
                      </h3>

                      <div className="space-y-3 text-sm">
                        <p>
                          <strong>Preferred:</strong>{" "}
                          {formatDate(lead.requested_date)} at{" "}
                          {formatTime(lead.requested_time)}
                        </p>

                        <p>
                          <strong>Alternate:</strong>{" "}
                          {formatDate(lead.alternate_date)} at{" "}
                          {formatTime(lead.alternate_time)}
                        </p>

                        <p>
                          <strong>Current follow-up:</strong>{" "}
                          {formatFollowUp(lead.follow_up_at)}
                        </p>
                      </div>
                    </section>
                  </div>

                  <div className="grid gap-6 border-t border-slate-200 bg-slate-50 p-6 lg:grid-cols-2">
                    <section>
                      <h3 className="mb-2 font-bold text-slate-950">
                        Project Description
                      </h3>

                      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {displayValue(lead.description)}
                      </p>
                    </section>

                    <section>
                      <LeadNotesForm
                        leadId={String(lead.id)}
                        currentNotes={lead.notes}
                      />
                    </section>
                  </div>

                  <div className="border-t border-slate-200 bg-white p-6">
                    <LeadStatusForm
                      leadId={String(lead.id)}
                      currentStatus={lead.lead_status}
                      currentConsultationStatus={
                        lead.consultation_status
                      }
                      currentFollowUpAt={lead.follow_up_at}
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}