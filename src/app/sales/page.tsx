import Link from "next/link";

const cards = [
  {
    title: "Leads",
    value: "Open lead dashboard",
    description:
      "Review new inquiries, lead status, assignments, and customer information.",
    href: "/admin",
    button: "View Leads",
  },
  {
    title: "Appointments",
    value: "Sales calendar",
    description:
      "Upcoming site visits, consultations, estimate appointments, and reminders.",
    href: "#appointments",
    button: "Coming Soon",
  },
  {
    title: "Estimates",
    value: "Live estimating",
    description:
      "Build options, calculate pricing, and prepare proposals while meeting with customers.",
    href: "#estimates",
    button: "Coming Soon",
  },
  {
    title: "Follow-Ups",
    value: "Next actions",
    description:
      "See which leads, estimates, and proposals need a call, text, or email.",
    href: "#follow-ups",
    button: "Coming Soon",
  },
];

export default function SalesDashboardPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
          Sales Workspace
        </p>

        <h1 className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">
          Sales Dashboard
        </h1>

        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
          Manage the customer journey from the
          first inquiry through an accepted
          proposal.
        </p>
      </div>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const isActive =
            card.href.startsWith("/");

          return (
            <article
              key={card.title}
              className="flex min-h-64 flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <p className="text-sm font-bold text-emerald-700">
                {card.title}
              </p>

              <h2 className="mt-3 text-xl font-bold text-slate-950">
                {card.value}
              </h2>

              <p className="mt-3 flex-1 text-sm leading-6 text-slate-600">
                {card.description}
              </p>

              {isActive ? (
                <Link
                  href={card.href}
                  className="mt-6 inline-flex justify-center rounded-lg bg-emerald-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-900"
                >
                  {card.button}
                </Link>
              ) : (
                <span className="mt-6 inline-flex justify-center rounded-lg bg-slate-100 px-4 py-3 text-sm font-bold text-slate-400">
                  {card.button}
                </span>
              )}
            </article>
          );
        })}
      </section>

      <section className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-7">
        <h2 className="text-xl font-bold text-slate-950">
          Today’s sales priorities
        </h2>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          This area will show appointments,
          overdue follow-ups, estimates awaiting
          completion, proposals awaiting customer
          action, and recently accepted jobs.
        </p>
      </section>
    </main>
  );
}
