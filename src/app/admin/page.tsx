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

function displayValue(value: string | null | undefined) {
  return value?.trim() ? value : "—";
}

function formatDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTime(value: string | null) {
  if (!value) return "—";

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
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function titleCase(value: string | null) {
  if (!value) return "—";

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default async function AdminPage() {
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

          <p className="mt-4 text-slate-700">{error.message}</p>
        </div>
      </main>
    );
  }

  const leads = (data ?? []) as Lead[];

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
                Total leads
              </p>

              <p className="text-2xl font-bold text-slate-950">
                {leads.length}
              </p>
            </div>
          </div>
        </header>

        {leads.length === 0 ? (
          <section className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">
              No leads yet
            </h2>

            <p className="mt-2 text-slate-600">
              New website submissions will appear here.
            </p>
          </section>
        ) : (
          <section className="space-y-6">
            {leads.map((lead) => (
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
                        <strong>Next follow-up:</strong>{" "}
                        {displayValue(
                          lead.next_follow_up ??
                            lead.follow_up_at,
                        )}
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
                    <h3 className="mb-2 font-bold text-slate-950">
                      Internal Notes
                    </h3>

                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {displayValue(lead.notes)}
                    </p>
                  </section>
                </div>

                <div className="border-t border-slate-200 bg-white p-6">
                  <LeadStatusForm
                    leadId={String(lead.id)}
                    currentStatus={lead.lead_status}
                  />
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}