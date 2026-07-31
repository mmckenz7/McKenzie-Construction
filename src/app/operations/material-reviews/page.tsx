"use client";

import {
  FormEvent,
  useEffect,
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
  phone: string | null;
  email: string | null;
  roles: string[];
};

type MaterialItem = {
  itemName: string;
  description: string;
  quantity: string;
  unit: string;
};

type Review = {
  id: string;
  secureToken: string;
  status: string;
  language: string;
  reviewResult: string | null;
  notesOriginal: string | null;
  notesEnglishTranslation:
    | string
    | null;
  translationStatus: string;
  sentAt: string | null;
  openedAt: string | null;
  submittedAt: string | null;
  expiresAt: string | null;
  project: Project | null;
  subcontractor:
    | Subcontractor
    | null;
};

type ApiResponse = {
  success: boolean;
  projects?: Project[];
  subcontractors?: Subcontractor[];
  reviews?: Review[];
  review?: {
    id: string;
    secureToken: string;
    status: string;
    expiresAt: string;
  };
  error?: string;
};

function emptyItem(): MaterialItem {
  return {
    itemName: "",
    description: "",
    quantity: "1",
    unit: "",
  };
}

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

export default function MaterialReviewsPage() {
  const [projects, setProjects] =
    useState<Project[]>([]);

  const [
    subcontractors,
    setSubcontractors,
  ] = useState<Subcontractor[]>([]);

  const [reviews, setReviews] =
    useState<Review[]>([]);

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

  const [items, setItems] = useState<
    MaterialItem[]
  >([emptyItem()]);

  const [loading, setLoading] =
    useState(true);

  const [creating, setCreating] =
    useState(false);

  const [notice, setNotice] =
    useState("");

  const [createdLink, setCreatedLink] =
    useState("");

  async function loadReviews() {
    setLoading(true);
    setNotice("");

    try {
      const response = await fetch(
        "/api/material-reviews",
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
            "Could not load material reviews.",
        );
        return;
      }

      setProjects(
        result.projects ?? [],
      );

      setSubcontractors(
        result.subcontractors ?? [],
      );

      setReviews(
        result.reviews ?? [],
      );
    } catch {
      setNotice(
        "Could not load material reviews.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReviews();
  }, []);

  function updateItem(
    index: number,
    changes: Partial<MaterialItem>,
  ) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              ...changes,
            }
          : item,
      ),
    );
  }

  function removeItem(index: number) {
    setItems((current) => {
      const remaining =
        current.filter(
          (_, itemIndex) =>
            itemIndex !== index,
        );

      return remaining.length > 0
        ? remaining
        : [emptyItem()];
    });
  }

  async function createReview(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setNotice("");
    setCreatedLink("");

    if (
      !projectId ||
      !subcontractorId
    ) {
      setNotice(
        "Choose a project and installer.",
      );
      return;
    }

    const validItems = items.filter(
      (item) =>
        item.itemName.trim().length >
        0,
    );

    if (validItems.length === 0) {
      setNotice(
        "Add at least one material item.",
      );
      return;
    }

    setCreating(true);

    try {
      const response = await fetch(
        "/api/material-reviews",
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
            items: validItems.map(
              (item) => ({
                itemName:
                  item.itemName,
                description:
                  item.description ||
                  null,
                quantity:
                  Number(
                    item.quantity,
                  ) || 0,
                unit:
                  item.unit || null,
              }),
            ),
          }),
        },
      );

      const result =
        (await response.json()) as ApiResponse;

      if (
        !response.ok ||
        !result.success ||
        !result.review
      ) {
        setNotice(
          result.error ??
            "Could not create the material review.",
        );
        return;
      }

      const link =
        `${window.location.origin}/material-review/` +
        result.review.secureToken;

      setCreatedLink(link);
      setNotice(
        "Material review link created.",
      );

      await loadReviews();
    } catch {
      setNotice(
        "Could not create the material review.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function copyText(
    value: string,
  ) {
    await navigator.clipboard.writeText(
      value,
    );

    setNotice("Copied.");
  }

  const textMessage = createdLink
    ? language === "es"
      ? `McKenzie Construction necesita que revise la lista de materiales para su próximo proyecto. Revísela aquí: ${createdLink}`
      : `McKenzie Construction needs you to review the material list for your upcoming project. Review it here: ${createdLink}`
    : "";

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
          Operations
        </p>

        <h1 className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">
          Installer Material Reviews
        </h1>

        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
          Send installers a secure,
          price-free material list for
          approval or issue reporting.
        </p>
      </div>

      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">
          New material review
        </h2>

        <form
          onSubmit={createReview}
          className="mt-6 space-y-6"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Project">
              <select
                value={projectId}
                onChange={(event) =>
                  setProjectId(
                    event.target.value,
                  )
                }
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold"
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

            <Field label="Installer">
              <select
                value={
                  subcontractorId
                }
                onChange={(event) =>
                  setSubcontractorId(
                    event.target.value,
                  )
                }
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold"
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
          </div>

          <section>
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-bold text-slate-950">
                Material list
              </h3>

              <button
                type="button"
                onClick={() =>
                  setItems((current) => [
                    ...current,
                    emptyItem(),
                  ])
                }
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700"
              >
                + Add Item
              </button>
            </div>

            <div className="mt-4 grid gap-4">
              {items.map(
                (item, index) => (
                  <article
                    key={index}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
                  >
                    <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr_auto]">
                      <Field label="Item name">
                        <input
                          type="text"
                          value={
                            item.itemName
                          }
                          onChange={(event) =>
                            updateItem(
                              index,
                              {
                                itemName:
                                  event
                                    .target
                                    .value,
                              },
                            )
                          }
                          placeholder="2x10x16 pressure-treated joist"
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
                        />
                      </Field>

                      <Field label="Quantity">
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={
                            item.quantity
                          }
                          onChange={(event) =>
                            updateItem(
                              index,
                              {
                                quantity:
                                  event
                                    .target
                                    .value,
                              },
                            )
                          }
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
                        />
                      </Field>

                      <Field label="Unit">
                        <input
                          type="text"
                          value={item.unit}
                          onChange={(event) =>
                            updateItem(
                              index,
                              {
                                unit:
                                  event
                                    .target
                                    .value,
                              },
                            )
                          }
                          placeholder="each"
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
                        />
                      </Field>

                      <button
                        type="button"
                        onClick={() =>
                          removeItem(index)
                        }
                        className="self-end rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-bold text-red-700"
                      >
                        Remove
                      </button>
                    </div>

                    <label className="mt-4 block">
                      <span className="mb-2 block text-sm font-bold text-slate-800">
                        Description
                      </span>

                      <input
                        type="text"
                        value={
                          item.description
                        }
                        onChange={(event) =>
                          updateItem(
                            index,
                            {
                              description:
                                event
                                  .target
                                  .value,
                            },
                          )
                        }
                        placeholder="Optional details shown to installer"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
                      />
                    </label>
                  </article>
                ),
              )}
            </div>
          </section>

          {notice && (
            <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={creating}
            className="w-full rounded-xl bg-blue-950 px-5 py-4 text-base font-bold text-white transition hover:bg-blue-900 disabled:opacity-60"
          >
            {creating
              ? "Creating review..."
              : "Create Material Review Link"}
          </button>
        </form>

        {createdLink && (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <h3 className="font-bold text-emerald-950">
              Review link created
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

            <textarea
              readOnly
              rows={4}
              value={textMessage}
              className="mt-4 w-full rounded-lg border border-emerald-300 bg-white px-3 py-3 text-sm"
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

      <section className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-slate-950">
            Recent reviews
          </h2>

          <button
            type="button"
            onClick={() =>
              void loadReviews()
            }
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="mt-5 text-sm text-slate-600">
            Loading reviews...
          </p>
        ) : reviews.length === 0 ? (
          <p className="mt-5 rounded-xl bg-white p-5 text-sm text-slate-600">
            No material reviews yet.
          </p>
        ) : (
          <div className="mt-5 grid gap-4">
            {reviews.map((review) => {
              const reviewLink =
                typeof window !==
                "undefined"
                  ? `${window.location.origin}/material-review/${review.secureToken}`
                  : `/material-review/${review.secureToken}`;

              return (
                <article
                  key={review.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-bold text-blue-700">
                        {review.project
                          ?.name ??
                          "Project"}
                      </p>

                      <h3 className="mt-1 text-lg font-bold text-slate-950">
                        {review.subcontractor
                          ?.name ??
                          "Installer"}
                      </h3>

                      <p className="mt-2 text-sm text-slate-600">
                        Status:{" "}
                        <strong>
                          {review.status}
                        </strong>
                        {" · "}
                        Result:{" "}
                        <strong>
                          {review.reviewResult ??
                            "Awaiting review"}
                        </strong>
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        void copyText(
                          reviewLink,
                        )
                      }
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700"
                    >
                      Copy Link
                    </button>
                  </div>

                  <dl className="mt-5 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
                    <Info
                      label="Opened"
                      value={formatDate(
                        review.openedAt,
                      )}
                    />

                    <Info
                      label="Submitted"
                      value={formatDate(
                        review.submittedAt,
                      )}
                    />

                    <Info
                      label="Expires"
                      value={formatDate(
                        review.expiresAt,
                      )}
                    />
                  </dl>

                  {review.notesOriginal && (
                    <div className="mt-4 rounded-xl border border-slate-200 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Installer note
                      </p>

                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                        {
                          review.notesOriginal
                        }
                      </p>

                      {review.notesEnglishTranslation && (
                        <>
                          <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">
                            English translation
                          </p>

                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                            {
                              review.notesEnglishTranslation
                            }
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
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
