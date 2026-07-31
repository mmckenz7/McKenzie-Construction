"use client";

import { useRouter } from "next/navigation";

import { WorkspaceSwitcher } from "@/components/workspace-switcher";

export default function AllWorkPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6">
      <header className="mx-auto mb-8 flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">
            McKenzie Construction
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">
            All Work
          </h1>

          <p className="mt-3 text-base text-slate-600">
            Your company-wide command center.
          </p>
        </div>

        <div className="rounded-xl bg-slate-950 p-3 shadow-sm">
          <WorkspaceSwitcher />
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-5 md:grid-cols-3">
        <DashboardCard
          title="Sales"
          value="Lead activity"
          description="Follow-ups, appointments, estimates, and proposals needing attention."
          buttonText="Open Sales"
          onClick={() => router.push("/sales")}
        />

        <DashboardCard
          title="Operations"
          value="Project activity"
          description="Upcoming starts, installer availability, materials, and schedule issues."
          buttonText="Open Operations"
          onClick={() =>
            router.push("/operations")
          }
        />

        <DashboardCard
          title="Administration"
          value="Company settings"
          description="Pricing, suppliers, users, permissions, integrations, and financial controls."
          buttonText="Open Administration"
          onClick={() => router.push("/admin")}
        />
      </section>

      <section className="mx-auto mt-6 max-w-7xl rounded-2xl border border-dashed border-slate-300 bg-white p-7">
        <h2 className="text-xl font-bold text-slate-950">
          Company priorities
        </h2>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Live lead follow-ups, upcoming project
          starts, installer responses, material
          delivery conflicts, unread messages,
          and financial alerts will appear here.
        </p>
      </section>
    </main>
  );
}

function DashboardCard({
  title,
  value,
  description,
  buttonText,
  onClick,
}: {
  title: string;
  value: string;
  description: string;
  buttonText: string;
  onClick: () => void;
}) {
  return (
    <article className="flex min-h-64 flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <span className="text-sm font-bold text-amber-700">
        {title}
      </span>

      <strong className="mt-3 text-xl text-slate-950">
        {value}
      </strong>

      <p className="mt-3 flex-1 text-sm leading-6 text-slate-600">
        {description}
      </p>

      <button
        type="button"
        onClick={onClick}
        className="mt-6 rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
      >
        {buttonText}
      </button>
    </article>
  );
}
