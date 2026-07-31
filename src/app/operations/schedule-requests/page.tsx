"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

type Project = {
  id: string;
  name: string;
  address: string;
};

type Subcontractor = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  roles: string[];
};

type ScheduleRequest = {
  id: string;
  secureToken: string;
  status: string;
  language: string;
  sentAt: string | null;
  openedAt: string | null;
  submittedAt: string | null;
  expiresAt: string | null;
  demoStart: string | null;
  constructionStart: string | null;
  demoDurationDays: number | null;
  totalDurationDays: number | null;
  notesOriginal: string | null;
  notesEnglishTranslation:
    | string
    | null;
  translationStatus: string;
  project: Project | null;
  subcontractor:
    | Subcontractor
    | null;
};

type LoadResponse = {
  success: boolean;
  projects?: Project[];
  subcontractors?: Subcontractor[];
  scheduleRequests?: ScheduleRequest[];
  error?: string;
};

type CreateResponse = {
  success: boolean;
  scheduleRequest?: {
    id: string;
    secureToken: string;
    status: string;
    expiresAt: string;
  };
  error?: string;
};

function formatDate(
  value: string | null,
) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  ).format(new Date(value));
}

export default function ScheduleRequestsPage() {
  const [projects, setProjects] =
    useState<Project[]>([]);

  const [
    subcontractors,
    setSubcontractors,
  ] = useState<Subcontractor[]>([]);

  const [requests, setRequests] =
    useState<ScheduleRequest[]>([]);

  const [projectId, setProjectId] =
    useState("");

  const [
    subcontractorId,
    setSubcontractorId,
  ] = useState("");

  const [language, setLanguage] =
    useState<"en" | "es">("en");

  const [
    expiresInDays,
    setExpiresInDays,
  ] = useState("14");

  const [loading, setLoading] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState("");

  const [createdLink, setCreatedLink] =
    useState("");

  const selectedSubcontractor =
    useMemo(
      () =>
        subcontractors.find(
          (member) =>
            member.id ===
            subcontractorId,
        ) ?? null,
      [
        subcontractorId,
        subcontractors,
      ],
    );

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/schedule-requests",
        {
          cache: "no-store",
          credentials: "include",
        },
      );

      const result =
        (await response.json()) as LoadResponse;

      if (
        !response.ok ||
        !result.success
      ) {
        setError(
          result.error ??
            "Could not load schedule requests.",
        );
        return;
      }

      setProjects(
        result.projects ?? [],
      );

      setSubcontractors(
        result.subcontractors ?? [],
      );

      setRequests(
        result.scheduleRequests ?? [],
      );
    } catch {
      setError(
        "Could not load schedule requests.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function createRequest(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError("");
    setCreatedLink("");

    if (
      !projectId ||
      !subcontractorId
    ) {
      setError(
        "Choose a project and subcontractor.",
      );
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(
        "/api/schedule-requests",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            projectId,
            subcontractorId,
            language,
            expiresInDays:
              Number(expiresInDays),
          }),
        },
      );

      const result =
        (await response.json()) as CreateResponse;

      if (
        !response.ok ||
        !result.success ||
        !result.scheduleRequest
      ) {
        setError(
          result.error ??
            "Could not create the schedule request.",
        );
        return;
      }

      const link =
        `${window.location.origin}/schedule/` +
        result.scheduleRequest
          .secureToken;

      setCreatedLink(link);

      await loadData();
    } catch {
      setError(
        "Could not create the schedule request.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function copyText(
    value: string,
  ) {
    await navigator.clipboard.writeText(
      value,
    );
  }

  const textMessage =
    createdLink &&
    selectedSubcontractor
      ? language === "es"
        ? `McKenzie Construction tiene una solicitud de horario para usted. Complete el formulario aquí: ${createdLink}`
        : `McKenzie Construction has a schedule request for you. Complete the form here: ${createdLink}`
      : "";

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
          Operations
        </p>

        <h1 className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">
          Installer Schedule Requests
        </h1>

        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
          Create a secure form link for an
          installer to enter demo availability,
          construction availability, durations,
          and notes.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">
          New schedule request
        </h2>

        <form
          onSubmit={createRequest}
          className="mt-6 grid gap-5 lg:grid-cols-2"
        >
          <Field label="Project">
            <select
              value={projectId}
              onChange={(event) =>
                setProjectId(
                  event.target.value,
                )
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold"
              required
            >
              <option value="">
                Select project
              </option>

              {projects.map(
                (project) => (
                  <option
                    key={project.id}
                    value={project.id}
                  >
                    {project.name}
                    {project.address
                      ? ` — ${project.address}`
                      : ""}
                  </option>
                ),
              )}
            </select>
          </Field>

          <Field label="Installer / Subcontractor">
            <select
              value={subcontractorId}
              onChange={(event) =>
                setSubcontractorId(
                  event.target.value,
                )
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold"
              required
            >
              <option value="">
                Select installer
              </option>

              {subcontractors.map(
                (member) => (
                  <option
                    key={member.id}
                    value={member.id}
                  >
                    {member.name}
                  </option>
                ),
              )}
            </select>
          </Field>

          <Field label="Form language">
            <select
              value={language}
              onChange={(event) =>
                setLanguage(
                  event.target.value as
                    | "en"
                    | "es",
                )
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold"
            >
              <option value="en">
                English
              </option>

              <option value="es">
                Español
              </option>
            </select>
          </Field>

          <Field label="Link expires">
            <select
              value={expiresInDays}
              onChange={(event) =>
                setExpiresInDays(
                  event.target.value,
                )
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold"
            >
              <option value="7">
                7 days
              </option>

              <option value="14">
                14 days
              </option>

              <option value="30">
                30 days
              </option>
            </select>
          </Field>

          <div className="lg:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-blue-950 px-5 py-4 text-base font-bold text-white transition hover:bg-blue-900 disabled:opacity-60"
            >
              {submitting
                ? "Creating request..."
                : "Create secure form link"}
            </button>
          </div>
        </form>

        {error && (
          <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}

        {createdLink && (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <h3 className="font-bold text-emerald-950">
              Schedule link created
            </h3>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                readOnly
                value={createdLink}
                className="min-w-0 flex-1 rounded-lg border border-emerald-300 bg-white px-3 py-3 text-sm"
              />

              <button
                type="button"
                onClick={() =>
                  void copyText(
                    createdLink,
                  )
                }
                className="rounded-lg bg-emerald-900 px-4 py-3 text-sm font-bold text-white"
              >
                Copy Link
              </button>
            </div>

            <p className="mt-5 text-xs font-bold uppercase tracking-wide text-emerald-800">
              Text message
            </p>

            <textarea
              readOnly
              value={textMessage}
              rows={4}
              className="mt-2 w-full rounded-lg border border-emerald-300 bg-white px-3 py-3 text-sm"
            />

            <button
              type="button"
              onClick={() =>
                void copyText(
                  textMessage,
                )
              }
              className="mt-3 rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white"
            >
              Copy Text Message
            </button>
          </div>
        )}
      </section>

      <section className="mt-7">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-slate-950">
            Recent requests
          </h2>

          <button
            type="button"
            onClick={() =>
              void loadData()
            }
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="mt-5 text-sm text-slate-600">
            Loading requests...
          </p>
        ) : requests.length === 0 ? (
          <p className="mt-5 rounded-xl bg-white p-5 text-sm text-slate-600">
            No schedule requests yet.
          </p>
        ) : (
          <div className="mt-5 grid gap-4">
            {requests.map(
              (item) => {
                const link =
                  typeof window !==
                  "undefined"
                    ? `${window.location.origin}/schedule/${item.secureToken}`
                    : `/schedule/${item.secureToken}`;

                return (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-bold text-blue-700">
                          {item.project
                            ?.name ??
                            "Project"}
                        </p>

                        <h3 className="mt-1 text-lg font-bold text-slate-950">
                          {item.subcontractor
                            ?.name ??
                            "Installer"}
                        </h3>

                        <p className="mt-1 text-sm text-slate-600">
                          Status:{" "}
                          <strong>
                            {item.status}
                          </strong>
                          {" · "}
                          Language:{" "}
                          {item.language ===
                          "es"
                            ? "Español"
                            : "English"}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          void copyText(
                            link,
                          )
                        }
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700"
                      >
                        Copy Link
                      </button>
                    </div>

                    <dl className="mt-5 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Info
                        label="Demo start"
                        value={
                          item.demoStart ??
                          "Awaiting response"
                        }
                      />

                      <Info
                        label="Construction start"
                        value={
                          item.constructionStart ??
                          "Awaiting response"
                        }
                      />

                      <Info
                        label="Total duration"
                        value={
                          item.totalDurationDays !==
                          null
                            ? `${item.totalDurationDays} days`
                            : "Awaiting response"
                        }
                      />

                      <Info
                        label="Expires"
                        value={formatDate(
                          item.expiresAt,
                        )}
                      />
                    </dl>

                    {item.notesOriginal && (
                      <div className="mt-4 rounded-xl border border-slate-200 p-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Installer note
                        </p>

                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                          {item.notesOriginal}
                        </p>

                        {item.notesEnglishTranslation && (
                          <>
                            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">
                              English translation
                            </p>

                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                              {
                                item.notesEnglishTranslation
                              }
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </article>
                );
              },
            )}
          </div>
        )}
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
    <label>
      <span className="mb-2 block text-sm font-bold text-slate-800">
        {label}
      </span>

      {children}
    </label>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </dt>

      <dd className="mt-1 text-sm font-semibold text-slate-800">
        {value}
      </dd>
    </div>
  );
}
