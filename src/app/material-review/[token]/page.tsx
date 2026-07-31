"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";
import { useParams } from "next/navigation";

type Language = "en" | "es";

type ReviewItem = {
  id: string;
  item_name: string;
  description: string | null;
  quantity: number;
  unit: string | null;
};

type MaterialReview = {
  id: string;
  token: string;
  status: string;
  language: Language;
  review_result:
    | "approved"
    | "issues_reported"
    | null;
  notes_original: string | null;
  submitted_at: string | null;
  project: {
    id: string;
    name: string;
    address: string;
  };
  subcontractor: {
    id: string;
    name: string;
  };
  items: ReviewItem[];
};

type MaterialIssue = {
  reviewItemId: string | null;
  issueType: string;
  notes: string;
  reportedQuantity:
    | number
    | null;
};

type ApiResponse = {
  success: boolean;
  review?: MaterialReview;
  expired?: boolean;
  error?: string;
};

const copy = {
  en: {
    company: "McKenzie Construction",
    title: "Material List Review",
    intro:
      "Review the material list for this project. Pricing and markup are not shown.",
    project: "Project",
    address: "Job address",
    quantity: "Quantity",
    looksGood: "Looks good",
    problem: "Something is wrong",
    issueType: "Issue type",
    item: "Material item",
    notes: "Notes",
    reportedQuantity:
      "Correct quantity, if known",
    addIssue: "Add another issue",
    submit: "Submit review",
    submitting: "Submitting...",
    approvedTitle:
      "Material list approved",
    submittedTitle:
      "Material review submitted",
    submittedText:
      "Thank you. McKenzie Construction received your review.",
    loading:
      "Loading material review...",
    unavailable:
      "This material review could not be found.",
    required:
      "Add at least one issue before submitting.",
    overallNotes:
      "Additional notes",
    select: "Select",
    missing: "Missing material",
    wrongQuantity:
      "Wrong quantity",
    wrongMaterial:
      "Wrong material",
    duplicate:
      "Duplicate material",
    other: "Other",
  },
  es: {
    company: "McKenzie Construction",
    title:
      "Revisión de la Lista de Materiales",
    intro:
      "Revise la lista de materiales para este proyecto. No se muestran precios ni márgenes.",
    project: "Proyecto",
    address:
      "Dirección del trabajo",
    quantity: "Cantidad",
    looksGood:
      "La lista está correcta",
    problem: "Hay un problema",
    issueType:
      "Tipo de problema",
    item: "Material",
    notes: "Notas",
    reportedQuantity:
      "Cantidad correcta, si la sabe",
    addIssue:
      "Agregar otro problema",
    submit: "Enviar revisión",
    submitting: "Enviando...",
    approvedTitle:
      "Lista de materiales aprobada",
    submittedTitle:
      "Revisión enviada",
    submittedText:
      "Gracias. McKenzie Construction recibió su revisión.",
    loading:
      "Cargando revisión de materiales...",
    unavailable:
      "No se pudo encontrar esta revisión de materiales.",
    required:
      "Agregue al menos un problema antes de enviar.",
    overallNotes:
      "Notas adicionales",
    select: "Seleccione",
    missing: "Falta material",
    wrongQuantity:
      "Cantidad incorrecta",
    wrongMaterial:
      "Material incorrecto",
    duplicate:
      "Material duplicado",
    other: "Otro",
  },
};

function emptyIssue(): MaterialIssue {
  return {
    reviewItemId: null,
    issueType:
      "missing_material",
    notes: "",
    reportedQuantity: null,
  };
}

export default function MaterialReviewPage() {
  const params = useParams<{
    token: string;
  }>();

  const token = params.token;

  const [review, setReview] =
    useState<MaterialReview | null>(
      null,
    );

  const [language, setLanguage] =
    useState<Language>("en");

  const [result, setResult] =
    useState<
      "approved" | "issues_reported"
    >("approved");

  const [issues, setIssues] =
    useState<MaterialIssue[]>([
      emptyIssue(),
    ]);

  const [notes, setNotes] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [submitted, setSubmitted] =
    useState(false);

  const [error, setError] =
    useState("");

  const text = copy[language];

  useEffect(() => {
    let mounted = true;

    async function loadReview() {
      try {
        const response = await fetch(
          `/api/material-reviews/${token}`,
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
          !response.ok ||
          !result.success ||
          !result.review
        ) {
          setError(
            result.error ??
              copy.en.unavailable,
          );
          return;
        }

        setReview(result.review);
        setLanguage(
          result.review.language ?? "en",
        );
        setNotes(
          result.review.notes_original ??
            "",
        );

        if (
          result.review.review_result ===
          "issues_reported"
        ) {
          setResult(
            "issues_reported",
          );
        }
      } catch {
        if (mounted) {
          setError(
            copy.en.unavailable,
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadReview();

    return () => {
      mounted = false;
    };
  }, [token]);

  function updateIssue(
    index: number,
    changes: Partial<MaterialIssue>,
  ) {
    setIssues((current) =>
      current.map((issue, itemIndex) =>
        itemIndex === index
          ? {
              ...issue,
              ...changes,
            }
          : issue,
      ),
    );
  }

  async function submitReview(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError("");

    if (
      result ===
        "issues_reported" &&
      issues.length === 0
    ) {
      setError(text.required);
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(
        `/api/material-reviews/${token}`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            language,
            reviewResult: result,
            notes,
            issues:
              result ===
              "issues_reported"
                ? issues
                : [],
          }),
        },
      );

      const resultData =
        (await response.json()) as ApiResponse;

      if (
        !response.ok ||
        !resultData.success
      ) {
        setError(
          resultData.error ??
            "The review could not be submitted.",
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
        "The review could not be submitted.",
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

  if (!review) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 px-4">
        <section className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-7 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-slate-950">
            Material Review
          </h1>

          <p className="mt-4 text-sm text-red-700">
            {error ||
              text.unavailable}
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
            {result === "approved"
              ? text.approvedTitle
              : text.submittedTitle}
          </h1>

          <p className="mt-4 text-sm leading-6 text-slate-600">
            {text.submittedText}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6">
      <section className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="bg-slate-950 p-6 text-white">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
                {text.company}
              </p>

              <h1 className="mt-2 text-2xl font-bold">
                {text.title}
              </h1>

              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
                {text.intro}
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

        <div className="border-b border-slate-200 bg-slate-50 p-6">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {text.project}
              </dt>

              <dd className="mt-1 font-bold text-slate-950">
                {review.project.name}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {text.address}
              </dt>

              <dd className="mt-1 text-sm font-semibold text-slate-700">
                {review.project.address ||
                  "—"}
              </dd>
            </div>
          </dl>
        </div>

        <form
          onSubmit={submitReview}
          className="space-y-6 p-6"
        >
          <section>
            <h2 className="text-lg font-bold text-slate-950">
              Material List
            </h2>

            <div className="mt-4 grid gap-3">
              {review.items.map(
                (item) => (
                  <article
                    key={item.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-bold text-slate-950">
                          {item.item_name}
                        </h3>

                        {item.description && (
                          <p className="mt-1 text-sm text-slate-600">
                            {
                              item.description
                            }
                          </p>
                        )}
                      </div>

                      <span className="shrink-0 rounded-lg bg-white px-3 py-2 text-sm font-bold text-slate-800">
                        {item.quantity}{" "}
                        {item.unit ?? ""}
                      </span>
                    </div>
                  </article>
                ),
              )}
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() =>
                setResult("approved")
              }
              className={`rounded-xl border px-4 py-4 text-sm font-bold ${
                result === "approved"
                  ? "border-emerald-700 bg-emerald-100 text-emerald-900"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              ✓ {text.looksGood}
            </button>

            <button
              type="button"
              onClick={() =>
                setResult(
                  "issues_reported",
                )
              }
              className={`rounded-xl border px-4 py-4 text-sm font-bold ${
                result ===
                "issues_reported"
                  ? "border-amber-700 bg-amber-100 text-amber-900"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              ! {text.problem}
            </button>
          </div>

          {result ===
            "issues_reported" && (
            <section className="space-y-4">
              {issues.map(
                (issue, index) => (
                  <article
                    key={index}
                    className="rounded-2xl border border-amber-200 bg-amber-50 p-5"
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label>
                        <span className="mb-2 block text-sm font-bold text-slate-800">
                          {text.item}
                        </span>

                        <select
                          value={
                            issue.reviewItemId ??
                            ""
                          }
                          onChange={(event) =>
                            updateIssue(
                              index,
                              {
                                reviewItemId:
                                  event
                                    .target
                                    .value ||
                                  null,
                              },
                            )
                          }
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
                        >
                          <option value="">
                            {text.select}
                          </option>

                          {review.items.map(
                            (item) => (
                              <option
                                key={
                                  item.id
                                }
                                value={
                                  item.id
                                }
                              >
                                {
                                  item.item_name
                                }
                              </option>
                            ),
                          )}
                        </select>
                      </label>

                      <label>
                        <span className="mb-2 block text-sm font-bold text-slate-800">
                          {
                            text.issueType
                          }
                        </span>

                        <select
                          value={
                            issue.issueType
                          }
                          onChange={(event) =>
                            updateIssue(
                              index,
                              {
                                issueType:
                                  event
                                    .target
                                    .value,
                              },
                            )
                          }
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
                        >
                          <option value="missing_material">
                            {text.missing}
                          </option>

                          <option value="wrong_quantity">
                            {
                              text.wrongQuantity
                            }
                          </option>

                          <option value="wrong_material">
                            {
                              text.wrongMaterial
                            }
                          </option>

                          <option value="duplicate_material">
                            {text.duplicate}
                          </option>

                          <option value="other">
                            {text.other}
                          </option>
                        </select>
                      </label>

                      <label>
                        <span className="mb-2 block text-sm font-bold text-slate-800">
                          {
                            text.reportedQuantity
                          }
                        </span>

                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={
                            issue.reportedQuantity ??
                            ""
                          }
                          onChange={(event) =>
                            updateIssue(
                              index,
                              {
                                reportedQuantity:
                                  event
                                    .target
                                    .value ===
                                  ""
                                    ? null
                                    : Number(
                                        event
                                          .target
                                          .value,
                                      ),
                              },
                            )
                          }
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
                        />
                      </label>

                      <label className="sm:col-span-2">
                        <span className="mb-2 block text-sm font-bold text-slate-800">
                          {text.notes}
                        </span>

                        <textarea
                          rows={3}
                          value={issue.notes}
                          onChange={(event) =>
                            updateIssue(
                              index,
                              {
                                notes:
                                  event
                                    .target
                                    .value,
                              },
                            )
                          }
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
                        />
                      </label>
                    </div>
                  </article>
                ),
              )}

              <button
                type="button"
                onClick={() =>
                  setIssues((current) => [
                    ...current,
                    emptyIssue(),
                  ])
                }
                className="w-full rounded-xl border border-dashed border-slate-400 px-4 py-3 text-sm font-bold text-slate-700"
              >
                + {text.addIssue}
              </button>
            </section>
          )}

          <label>
            <span className="mb-2 block text-sm font-bold text-slate-800">
              {text.overallNotes}
            </span>

            <textarea
              rows={4}
              value={notes}
              onChange={(event) =>
                setNotes(
                  event.target.value,
                )
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
            />
          </label>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-slate-950 px-5 py-4 text-base font-bold text-white disabled:opacity-60"
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
