import Link from "next/link";

const cards = [
  {
    title: "Team",
    description:
      "Manage employees, subcontractors, roles, access, and assignments.",
    href: "/admin/team",
  },
  {
    title: "Task Settings",
    description:
      "Configure task types, defaults, and company workflow settings.",
    href: "/admin/settings/tasks",
  },
  {
    title: "Suppliers",
    description:
      "Manage suppliers, locations, pricing sources, and purchasing relationships.",
    href: "/admin/settings/suppliers",
  },
  {
    title: "Procurement",
    description:
      "Configure material pricing, delivery rules, and procurement defaults.",
    href: "/admin/settings/procurement",
  },
];

export default function AdministrationDashboardPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">
          Administration
        </p>

        <h1 className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">
          Company Settings
        </h1>

        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
          Manage company access, pricing, suppliers, workflows, and system settings.
        </p>
      </div>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article
            key={card.title}
            className="flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <h2 className="text-xl font-bold text-slate-950">
              {card.title}
            </h2>

            <p className="mt-3 flex-1 text-sm leading-6 text-slate-600">
              {card.description}
            </p>

            <Link
              href={card.href}
              className="mt-6 inline-flex justify-center rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
            >
              Open {card.title}
            </Link>
          </article>
        ))}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">
          Feature Settings
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-600">
          Enable or disable advanced
          workflows for each company or
          workspace.
        </p>

        <a
          href="/admin/settings/features"
          className="mt-5 inline-flex rounded-xl bg-blue-950 px-4 py-3 text-sm font-bold text-white"
        >
          Manage Features
        </a>
      </section>

    </main>
  );
}
