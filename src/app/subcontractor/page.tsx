"use client";

import { useState } from "react";

type Language = "en" | "es";

const copy = {
  en: {
    company: "McKenzie Construction",
    title: "Subcontractor Portal",
    subtitle:
      "Review assigned jobs, submit availability, check materials, and message the office.",
    assignedJobs: "Assigned Jobs",
    schedule: "Schedule Requests",
    materials: "Material Reviews",
    messages: "Messages",
    noJobs: "No assigned jobs yet.",
    noSchedule:
      "No schedule requests need a response.",
    noMaterials:
      "No material lists need review.",
    noMessages: "No unread messages.",
  },
  es: {
    company: "McKenzie Construction",
    title: "Portal de Subcontratistas",
    subtitle:
      "Revise los trabajos asignados, envíe su disponibilidad, verifique los materiales y envíe mensajes a la oficina.",
    assignedJobs: "Trabajos Asignados",
    schedule: "Solicitudes de Horario",
    materials: "Revisión de Materiales",
    messages: "Mensajes",
    noJobs:
      "Todavía no hay trabajos asignados.",
    noSchedule:
      "No hay solicitudes de horario pendientes.",
    noMaterials:
      "No hay listas de materiales pendientes.",
    noMessages:
      "No hay mensajes sin leer.",
  },
};

export default function SubcontractorPage() {
  const [language, setLanguage] =
    useState<Language>("en");

  const text = copy[language];

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6">
      <header className="mx-auto max-w-3xl rounded-2xl bg-slate-950 p-5 text-white shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
              {text.company}
            </p>

            <h1 className="mt-2 text-2xl font-bold">
              {text.title}
            </h1>

            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
              {text.subtitle}
            </p>
          </div>

          <div className="inline-flex rounded-xl border border-slate-700 bg-slate-900 p-1">
            <button
              type="button"
              onClick={() => setLanguage("en")}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                language === "en"
                  ? "bg-white text-slate-950"
                  : "text-slate-300"
              }`}
            >
              English
            </button>

            <button
              type="button"
              onClick={() => setLanguage("es")}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                language === "es"
                  ? "bg-white text-slate-950"
                  : "text-slate-300"
              }`}
            >
              Español
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto mt-5 grid max-w-3xl gap-4">
        <PortalCard
          title={text.assignedJobs}
          emptyText={text.noJobs}
        />

        <PortalCard
          title={text.schedule}
          emptyText={text.noSchedule}
        />

        <PortalCard
          title={text.materials}
          emptyText={text.noMaterials}
        />

        <PortalCard
          title={text.messages}
          emptyText={text.noMessages}
        />
      </section>
    </main>
  );
}

function PortalCard({
  title,
  emptyText,
}: {
  title: string;
  emptyText: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950">
        {title}
      </h2>

      <p className="mt-3 rounded-xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
        {emptyText}
      </p>
    </article>
  );
}
