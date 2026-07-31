"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams } from "next/navigation";

type Language = "en" | "es";

type ScheduleRequest = {
  id: string;
  token: string;
  status: string;
  language: Language;
  earliest_demo_start?: string | null;
  earliest_construction_start?: string | null;
  demo_duration_days?: number | null;
  total_duration_days?: number | null;
  notes_original?: string | null;
  submitted_at?: string | null;
  project?: {
    id?: string;
    name?: string;
    address?: string;
  };
  subcontractor?: {
    id?: string;
    name?: string;
  };
};

type ApiResponse = {
  success: boolean;
  request?: ScheduleRequest;
  expired?: boolean;
  alreadySubmitted?: boolean;
  error?: string;
};

const copy = {
  en: {
    company: "McKenzie Construction",
    title: "Schedule Availability",
    greeting: "Schedule request for",
    project: "Project",
    address: "Job address",
    demoStart: "Earliest date you can begin demo",
    constructionStart:
      "Earliest date you can begin construction",
    demoDuration: "Expected demo duration",
    totalDuration: "Expected total job duration",
    notes: "Notes",
    notesPlaceholder:
      "Add schedule details, questions, or job concerns.",
    select: "Select",
    day: "day",
    days: "days",
    submit: "Submit availability",
    submitting: "Submitting...",
    submittedTitle: "Availability submitted",
    submittedText:
      "Thank you. McKenzie Construction has received your response.",
    alreadySubmitted:
      "This schedule request has already been submitted. You may update it below.",
    loading: "Loading schedule request...",
    expired: "This schedule request has expired.",
    unavailable:
      "This schedule request could not be found.",
    required:
      "Please complete all dates and duration fields.",
  },
  es: {
    company: "McKenzie Construction",
    title: "Disponibilidad de Horario",
    greeting: "Solicitud de horario para",
    project: "Proyecto",
    address: "Dirección del trabajo",
    demoStart:
      "Fecha más temprana para comenzar la demolición",
    constructionStart:
      "Fecha más temprana para comenzar la construcción",
    demoDuration:
      "Duración estimada de la demolición",
    totalDuration:
      "Duración total estimada del trabajo",
    notes: "Notas",
    notesPlaceholder:
      "Agregue detalles del horario, preguntas o inquietudes sobre el trabajo.",
    select: "Seleccione",
    day: "día",
    days: "días",
    submit: "Enviar disponibilidad",
    submitting: "Enviando...",
    submittedTitle: "Disponibilidad enviada",
    submittedText:
      "Gracias. McKenzie Construction recibió su respuesta.",
    alreadySubmitted:
      "Esta solicitud ya fue enviada. Puede actualizarla a continuación.",
    loading: "Cargando solicitud de horario...",
    expired: "Esta solicitud de horario ha vencido.",
    unavailable:
      "No se pudo encontrar esta solicitud de horario.",
    required:
      "Complete todas las fechas y duraciones.",
  },
};

const demoDurations = [0, 1, 2, 3, 4, 5];

const totalDurations = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  12, 15, 20, 25, 30,
];

function todayForInput() {
  const now = new Date();
  const offset = now.getTimezoneOffset();

  return new Date(
    now.getTime() - offset * 60_000,
  )
    .toISOString()
    .slice(0, 10);
}

export default function ScheduleRequestPage() {
  const params = useParams<{
    token: string;
  }>();

  const token = params.token;

  const [requestData, setRequestData] =
    useState<ScheduleRequest | null>(null);

  const [language, setLanguage] =
    useState<Language>("en");

  const [demoStart, setDemoStart] =
    useState("");

  const [
    constructionStart,
    setConstructionStart,
  ] = useState("");

  const [demoDuration, setDemoDuration] =
    useState("");

  const [totalDuration, setTotalDuration] =
    useState("");

  const [notes, setNotes] = useState("");

  const [loading, setLoading] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [submitted, setSubmitted] =
    useState(false);

  const [error, setError] =
    useState("");

  const text = copy[language];

  const minimumDate = useMemo(
    () => todayForInput(),
    [],
  );

  useEffect(() => {
    let mounted = true;

    async function loadRequest() {
      try {
        const response = await fetch(
          `/api/schedule-requests/${token}`,
          {
            cache: "no-store",
          },
        );

        const result =
          (await response.json()) as ApiResponse;

        if (!mounted) {
          return;
        }

        if (
        result.alreadySubmitted
      ) {
        setSubmitted(true);

        window.scrollTo({
          top: 0,
          behavior: "smooth",
        });

        return;
      }

      if (!response.ok || !result.success) {
          setError(
            result.expired
              ? copy.en.expired
              : result.error ??
                  copy.en.unavailable,
          );
          return;
        }

        const loaded = result.request;

        if (!loaded) {
          setError(copy.en.unavailable);
          return;
        }

        setRequestData(loaded);
        setLanguage(loaded.language ?? "en");

        setDemoStart(
          loaded.earliest_demo_start ?? "",
        );

        setConstructionStart(
          loaded.earliest_construction_start ??
            "",
        );

        setDemoDuration(
          loaded.demo_duration_days !== null &&
            loaded.demo_duration_days !==
              undefined
            ? String(
                loaded.demo_duration_days,
              )
            : "",
        );

        setTotalDuration(
          loaded.total_duration_days !== null &&
            loaded.total_duration_days !==
              undefined
            ? String(
                loaded.total_duration_days,
              )
            : "",
        );

        setNotes(
          loaded.notes_original ?? "",
        );
      } catch {
        if (mounted) {
          setError(copy.en.unavailable);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadRequest();

    return () => {
      mounted = false;
    };
  }, [token]);

  async function submitForm(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError("");

    if (
      !demoStart ||
      !constructionStart ||
      demoDuration === "" ||
      totalDuration === ""
    ) {
      setError(text.required);
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(
        `/api/schedule-requests/${token}`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            language,
            earliestDemoStart: demoStart,
            earliestConstructionStart:
              constructionStart,
            demoDurationDays:
              Number(demoDuration),
            totalDurationDays:
              Number(totalDuration),
            notes,
          }),
        },
      );

      const result =
        (await response.json()) as ApiResponse;

      if (!response.ok || !result.success) {
        setError(
          result.error ??
            "The response could not be submitted.",
        );
        return;
      }

      setSubmitted(true);
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch {
      setError(
        "The response could not be submitted.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 px-4">
        <p className="text-base font-semibold text-slate-600">
          {text.loading}
        </p>
      </main>
    );
  }

  if (error && !requestData) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 px-4">
        <section className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-7 text-center shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">
            McKenzie Construction
          </p>

          <h1 className="mt-3 text-2xl font-bold text-slate-950">
            Schedule Request
          </h1>

          <p className="mt-4 text-sm leading-6 text-red-700">
            {error}
          </p>
        </section>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 px-4">
        <section className="w-full max-w-lg rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
            ✓
          </div>

          <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-amber-600">
            {text.company}
          </p>

          <h1 className="mt-3 text-2xl font-bold text-slate-950">
            {text.submittedTitle}
          </h1>

          <p className="mt-4 text-sm leading-6 text-slate-600">
            {text.submittedText}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 sm:py-10">
      <section className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="bg-slate-950 p-6 text-white sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
                {text.company}
              </p>

              <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
                {text.title}
              </h1>

              <p className="mt-2 text-sm text-slate-300">
                {text.greeting}{" "}
                {requestData?.subcontractor
                  ?.name ?? "installer"}
              </p>
            </div>

            <div className="inline-flex self-start rounded-xl border border-slate-700 bg-slate-900 p-1">
              <button
                type="button"
                onClick={() =>
                  setLanguage("en")
                }
                className={`rounded-lg px-4 py-2 text-sm font-bold ${
                  language === "en"
                    ? "bg-white text-slate-950"
                    : "text-slate-300"
                }`}
              >
                English
              </button>

              <button
                type="button"
                onClick={() =>
                  setLanguage("es")
                }
                className={`rounded-lg px-4 py-2 text-sm font-bold ${
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

        <div className="border-b border-slate-200 bg-slate-50 p-6 sm:px-8">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {text.project}
              </dt>

              <dd className="mt-1 font-bold text-slate-950">
                {requestData?.project?.name ??
                  "Assigned project"}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {text.address}
              </dt>

              <dd className="mt-1 text-sm font-semibold text-slate-700">
                {requestData?.project?.address ||
                  "—"}
              </dd>
            </div>
          </dl>
        </div>

        <form
          onSubmit={submitForm}
          className="space-y-6 p-6 sm:p-8"
        >
          {requestData?.submitted_at && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              {text.alreadySubmitted}
            </p>
          )}

          <Field
            label={text.demoStart}
          >
            <input
              type="date"
              min={minimumDate}
              value={demoStart}
              onChange={(event) =>
                setDemoStart(
                  event.target.value,
                )
              }
              required
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-4 text-base font-semibold text-slate-950 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
            />
          </Field>

          <Field
            label={text.constructionStart}
          >
            <input
              type="date"
              min={minimumDate}
              value={constructionStart}
              onChange={(event) =>
                setConstructionStart(
                  event.target.value,
                )
              }
              required
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-4 text-base font-semibold text-slate-950 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
            />
          </Field>

          <Field
            label={text.demoDuration}
          >
            <select
              value={demoDuration}
              onChange={(event) =>
                setDemoDuration(
                  event.target.value,
                )
              }
              required
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-4 text-base font-semibold text-slate-950 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
            >
              <option value="">
                {text.select}
              </option>

              {demoDurations.map(
                (days) => (
                  <option
                    key={days}
                    value={days}
                  >
                    {days === 0
                      ? language === "es"
                        ? "Menos de 1 día"
                        : "Less than 1 day"
                      : `${days} ${
                          days === 1
                            ? text.day
                            : text.days
                        }`}
                  </option>
                ),
              )}
            </select>
          </Field>

          <Field
            label={text.totalDuration}
          >
            <select
              value={totalDuration}
              onChange={(event) =>
                setTotalDuration(
                  event.target.value,
                )
              }
              required
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-4 text-base font-semibold text-slate-950 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
            >
              <option value="">
                {text.select}
              </option>

              {totalDurations.map(
                (days) => (
                  <option
                    key={days}
                    value={days}
                  >
                    {days}{" "}
                    {days === 1
                      ? text.day
                      : text.days}
                  </option>
                ),
              )}
            </select>
          </Field>

          <Field label={text.notes}>
            <textarea
              value={notes}
              onChange={(event) =>
                setNotes(
                  event.target.value,
                )
              }
              rows={5}
              placeholder={
                text.notesPlaceholder
              }
              className="w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-4 text-base text-slate-950 outline-none placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
            />
          </Field>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-slate-950 px-5 py-4 text-base font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting
              ? text.submitting
              : text.submit}
          </button>
        </form>
      </section>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-800">
        {label}
      </span>

      {children}
    </label>
  );
}
