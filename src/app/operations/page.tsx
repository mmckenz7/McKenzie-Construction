import Link from "next/link";

const cards = [
  {
    title: "Projects",
    value: "Active jobs",
    description:
      "Review project details, job progress, costs, assignments, and customer information.",
    href: "/operations/projects",
    button: "View Projects",
  },
  {
    title: "Schedule",
    value: "Project scheduling",
    description:
      "Review demo readiness, installer availability, material-safe dates, and calculated construction starts.",
    href: "/operations/schedule",
    button: "Open Schedule",
  },
  {
    title: "Materials",
    value: "Delivery readiness",
    description:
      "Track takeoffs, supplier confirmations, delivery dates, phase readiness, and shortages.",
    href: "/operations/materials",
    button: "Open Materials",
  },
  {
    title: "Installers",
    value: "Crew availability",
    description:
      "Review installers, request availability, and track schedule responses.",
    href: "/operations/installers",
    button: "Open Installers",
  },
  {
    title: "Schedule Requests",
    value: "Installer responses",
    description:
      "Create secure links for installers to submit demo dates, construction dates, durations, and notes.",
    href: "/operations/schedule-requests",
    button: "Open Schedule Requests",
  },
  {
    title: "Messages",
    value: "Installer communication",
    description:
      "Keep project conversations, original messages, translations, and delivery status together.",
    href: "/operations/messages",
    button: "Open Messages",
  },
];

export default function OperationsDashboardPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
          Operations Workspace
        </p>

        <h1 className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">
          Operations Dashboard
        </h1>

        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
          Coordinate projects, installers,
          materials, schedules, and jobsite
          progress.
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
              <p className="text-sm font-bold text-blue-700">
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
                  className="mt-6 inline-flex justify-center rounded-lg bg-blue-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-900"
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
          Today’s operations priorities
        </h2>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          This area will show upcoming starts,
          demo readiness, material delivery
          conflicts, installer responses, unread
          messages, project delays, and jobs
          awaiting schedule confirmation.
        </p>
      </section>
    </main>
  );
}
