"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";

type Project = {
  id: string;
  name: string;
  address: string;
};

type Subcontractor = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  roles: string[];
};

type Message = {
  id: string;
  threadId: string;
  senderType: string;
  originalLanguage: string;
  recipientLanguage: string;
  originalText: string;
  translatedText: string | null;
  translationStatus: string;
  deliveryStatus: string;
  sentAt: string | null;
  createdAt: string;
};

type Thread = {
  id: string;
  projectId: string;
  subcontractorId: string;
  preferredLanguage: string;
  status: string;
  lastMessageAt: string | null;
  project: Project | null;
  subcontractor:
    | Subcontractor
    | null;
  messages: Message[];
};

type ApiResponse = {
  success: boolean;
  projects?: Project[];
  subcontractors?: Subcontractor[];
  threads?: Thread[];
  requiresTranslation?: boolean;
  error?: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(new Date(value));
}

export default function MessagesPage() {
  const searchParams =
    useSearchParams();

  const [projects, setProjects] =
    useState<Project[]>([]);

  const [
    subcontractors,
    setSubcontractors,
  ] = useState<Subcontractor[]>([]);

  const [threads, setThreads] =
    useState<Thread[]>([]);

  const [projectId, setProjectId] =
    useState("");

  const [
    subcontractorId,
    setSubcontractorId,
  ] = useState("");

  const [language, setLanguage] =
    useState<"en" | "es">("en");

  const [messageText, setMessageText] =
    useState("");

  const [
    translatedText,
    setTranslatedText,
  ] = useState("");

  const [loading, setLoading] =
    useState(true);

  const [sending, setSending] =
    useState(false);

  const [notice, setNotice] =
    useState("");

  async function loadMessages() {
    setLoading(true);
    setNotice("");

    try {
      const response = await fetch(
        "/api/project-messages",
        {
          credentials: "include",
          cache: "no-store",
        },
      );

      const result =
        (await response.json()) as ApiResponse;

      if (
        !response.ok ||
        !result.success
      ) {
        setNotice(
          result.error ??
            "Could not load messages.",
        );
        return;
      }

      const loadedProjects =
        result.projects ?? [];

      const loadedSubcontractors =
        result.subcontractors ?? [];

      const loadedThreads =
        result.threads ?? [];

      setProjects(loadedProjects);
      setSubcontractors(
        loadedSubcontractors,
      );
      setThreads(loadedThreads);

      const requestedProjectId =
        searchParams.get("projectId");

      if (
        requestedProjectId &&
        loadedProjects.some(
          (project) =>
            project.id ===
            requestedProjectId,
        )
      ) {
        setProjectId(
          requestedProjectId,
        );

        const matchingThread =
          loadedThreads.find(
            (thread) =>
              thread.projectId ===
              requestedProjectId,
          );

        if (matchingThread) {
          setSubcontractorId(
            matchingThread.subcontractorId,
          );

          setLanguage(
            matchingThread.preferredLanguage ===
              "es"
              ? "es"
              : "en",
          );
        }
      }
    } catch {
      setNotice(
        "Could not load messages.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMessages();
  }, []);

  const activeThread =
    useMemo(
      () =>
        threads.find(
          (thread) =>
            thread.projectId ===
              projectId &&
            thread.subcontractorId ===
              subcontractorId,
        ) ?? null,
      [
        projectId,
        subcontractorId,
        threads,
      ],
    );

  async function sendMessage(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setNotice("");

    if (
      !projectId ||
      !subcontractorId ||
      !messageText.trim()
    ) {
      setNotice(
        "Choose a project and installer, then enter a message.",
      );
      return;
    }

    setSending(true);

    try {
      const response = await fetch(
        "/api/project-messages",
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
            preferredLanguage:
              language,
            originalText:
              messageText,
            translatedText:
              translatedText.trim() ||
              null,
          }),
        },
      );

      const result =
        (await response.json()) as ApiResponse;

      if (
        !response.ok ||
        !result.success
      ) {
        setNotice(
          result.error ??
            "Could not save the message.",
        );
        return;
      }

      if (
        result.requiresTranslation
      ) {
        setNotice(
          "Message saved as a draft and is waiting for Spanish translation.",
        );
      } else {
        setNotice("Message saved.");
      }

      setMessageText("");
      setTranslatedText("");

      await loadMessages();
    } catch {
      setNotice(
        "Could not save the message.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
          Operations
        </p>

        <h1 className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">
          Installer Messages
        </h1>

        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
          Keep project conversations,
          original messages, translations,
          and delivery status together.
        </p>
      </div>

      <section className="mt-7 grid gap-6 lg:grid-cols-[340px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">
            Conversation
          </h2>

          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-bold text-slate-800">
              Project
            </span>

            <select
              value={projectId}
              onChange={(event) =>
                setProjectId(
                  event.target.value,
                )
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold"
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
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-bold text-slate-800">
              Installer
            </span>

            <select
              value={
                subcontractorId
              }
              onChange={(event) =>
                setSubcontractorId(
                  event.target.value,
                )
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold"
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
          </label>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-bold text-slate-800">
              Installer language
            </span>

            <select
              value={language}
              onChange={(event) =>
                setLanguage(
                  event.target.value as
                    | "en"
                    | "es",
                )
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold"
            >
              <option value="en">
                English
              </option>

              <option value="es">
                Español
              </option>
            </select>
          </label>
        </aside>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="min-h-96 space-y-4 bg-slate-50 p-5">
            {loading ? (
              <p className="text-sm text-slate-600">
                Loading messages...
              </p>
            ) : !activeThread ||
              activeThread.messages
                .length === 0 ? (
              <p className="rounded-xl bg-white p-5 text-sm text-slate-600">
                No messages in this
                conversation yet.
              </p>
            ) : (
              activeThread.messages.map(
                (message) => (
                  <article
                    key={message.id}
                    className={`max-w-2xl rounded-2xl p-4 ${
                      message.senderType ===
                      "office"
                        ? "ml-auto bg-blue-950 text-white"
                        : "mr-auto border border-slate-200 bg-white text-slate-950"
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-sm leading-6">
                      {
                        message.originalText
                      }
                    </p>

                    {message.translatedText && (
                      <div className="mt-3 border-t border-white/20 pt-3">
                        <p className="text-xs font-bold uppercase tracking-wide opacity-70">
                          Translation
                        </p>

                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
                          {
                            message.translatedText
                          }
                        </p>
                      </div>
                    )}

                    <p className="mt-3 text-xs opacity-70">
                      {formatDate(
                        message.sentAt ??
                          message.createdAt,
                      )}
                      {" · "}
                      {message.deliveryStatus}
                    </p>
                  </article>
                ),
              )
            )}
          </div>

          <form
            onSubmit={sendMessage}
            className="border-t border-slate-200 p-5"
          >
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-800">
                Your message
              </span>

              <textarea
                value={messageText}
                onChange={(event) =>
                  setMessageText(
                    event.target.value,
                  )
                }
                rows={4}
                placeholder="Type your message to the installer"
                className="w-full resize-y rounded-xl border border-slate-300 px-4 py-3 text-sm"
              />
            </label>

            {language === "es" && (
              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-bold text-slate-800">
                  Spanish translation
                </span>

                <textarea
                  value={translatedText}
                  onChange={(event) =>
                    setTranslatedText(
                      event.target.value,
                    )
                  }
                  rows={4}
                  placeholder="Automatic translation will populate this later"
                  className="w-full resize-y rounded-xl border border-slate-300 px-4 py-3 text-sm"
                />
              </label>
            )}

            {notice && (
              <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={sending}
              className="mt-4 w-full rounded-xl bg-blue-950 px-5 py-4 text-base font-bold text-white transition hover:bg-blue-900 disabled:opacity-60"
            >
              {sending
                ? "Saving..."
                : "Save Message"}
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
