"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams } from "next/navigation";

type MaterialItem = {
  id: string;
  itemName: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  displayOrder: number;
};

type MaterialIssue = {
  id: string;
  reviewItemId: string | null;
  item: MaterialItem | null;
  issueType: string;
  notesOriginal: string | null;
  notesLanguage: string | null;
  notesEnglishTranslation:
    | string
    | null;
  translationStatus: string;
  reportedQuantity:
    | number
    | null;
  photoUrl: string | null;
  status: string;
  resolvedAt: string | null;
  createdAt: string;
};

type MaterialReview = {
  id: string;
  secureToken: string;
  status: string;
  language: string;
  reviewResult: string | null;
  notesOriginal: string | null;
  notesLanguage: string | null;
  notesEnglishTranslation:
    | string
    | null;
  translationStatus: string;
  sentAt: string | null;
  openedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  expiresAt: string | null;
  project: {
    id: string;
    name: string;
    address: string;
  } | null;
  subcontractor: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
  } | null;
  items: MaterialItem[];
  issues: MaterialIssue[];
};

type ApiResponse = {
  success: boolean;
  review?: MaterialReview;
  error?: string;
};

const issueLabels: Record<
  string,
  string
> = {
  missing_material:
    "Missing material",
  wrong_quantity:
    "Wrong quantity",
  wrong_material:
    "Wrong material",
  duplicate_material:
    "Duplicate material",
  other: "Other",
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
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(new Date(value));
}

export default function MaterialReviewDetailPage() {
  const params = useParams<{
    reviewId: string;
  }>();

  const [review, setReview] =
    useState<MaterialReview | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [updatingId, setUpdatingId] =
    useState("");

  const [notice, setNotice] =
    useState("");

  const [
    markingComplete,
    setMarkingComplete,
  ] = useState(false);

  async function loadReview() {
    setLoading(true);
    setNotice("");

    try {
      const response = await fetch(
        `/api/material-reviews/manage/${params.reviewId}`,
        {
          credentials: "include",
          cache: "no-store",
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
            "Could not load the material review.",
        );
        return;
      }

      setReview(result.review);
    } catch {
      setNotice(
        "Could not load the material review.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReview();
  }, [params.reviewId]);

  const openIssueCount = useMemo(
    () =>
      review?.issues.filter(
        (issue) =>
          issue.status === "open" ||
          issue.status === "reviewing",
      ).length ?? 0,
    [review],
  );

  async function updateIssue(
    issueId: string,
    status:
      | "open"
      | "reviewing"
      | "resolved"
      | "dismissed",
  ) {
    setUpdatingId(issueId);
    setNotice("");

    try {
      const response = await fetch(
        `/api/material-reviews/manage/${params.reviewId}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            issueId,
            status,
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
            "Could not update the issue.",
        );
        return;
      }

      await loadReview();
    } catch {
      setNotice(
        "Could not update the issue.",
      );
    } finally {
      setUpdatingId("");
    }
  }

  async function copyReviewLink() {
    if (!review) {
      return;
    }

    const url =
      `${window.location.origin}/material-review/` +
      review.secureToken;

    await navigator.clipboard.writeText(
      url,
    );

    setNotice("Review link copied.");
  }

  async function markComplete() {
    if (!review) {
      return;
    }

    setMarkingComplete(true);
    setNotice("");

    try {
      const response = await fetch(
        `/api/material-reviews/manage/${review.id}/review`,
        {
          method: "PATCH",
          credentials: "include",
        },
      );

      const result =
        (await response.json()) as {
          success?: boolean;
          error?: string;
        };

      if (
        !response.ok ||
        !result.success
      ) {
        setNotice(
          result.error ??
            "Could not mark the material review complete.",
        );
        return;
      }

      setNotice(
        "Material review marked complete.",
      );

      await loadReview();
    } catch {
      setNotice(
        "Could not mark the material review complete.",
      );
    } finally {
      setMarkingComplete(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <p className="text-sm text-slate-600">
          Loading material review...
        </p>
      </main>
    );
  }

  if (!review) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Link
          href="/operations/material-reviews"
          className="text-sm font-bold text-blue-700"
        >
          ← Back to Material Reviews
        </Link>

        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {notice ||
            "Material review not found."}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link
        href="/operations/material-reviews"
        className="text-sm font-bold text-blue-700"
      >
        ← Back to Material Reviews
      </Link>

      <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
            Material Review
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">
            {review.project?.name ??
              "Project"}
          </h1>

          <p className="mt-2 text-base text-slate-600">
            {review.subcontractor?.name ??
              "Installer"}
            {review.project?.address
              ? ` · ${review.project.address}`
              : ""}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          {review.status ===
            "submitted" &&
            !review.reviewedAt && (
              <button
                type="button"
                disabled={
                  markingComplete ||
                  openIssueCount > 0
                }
                onClick={() =>
                  void markComplete()
                }
                title={
                  openIssueCount > 0
                    ? "Resolve or dismiss all material issues first."
                    : undefined
                }
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {markingComplete
                  ? "Saving..."
                  : openIssueCount > 0
                    ? `Resolve ${openIssueCount} Open Issue${
                        openIssueCount === 1
                          ? ""
                          : "s"
                      }`
                    : "Mark Complete"}
              </button>
            )}

          {review.reviewedAt && (
            <span className="rounded-xl bg-emerald-100 px-4 py-3 text-center text-sm font-bold text-emerald-800">
              Completed
            </span>
          )}

          <button
            type="button"
            onClick={() =>
              void copyReviewLink()
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800"
          >
            Copy Review Link
          </button>
        </div>
      </div>

      {notice && (
        <p className="mt-6 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
          {notice}
        </p>
      )}

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Review Status"
          value={review.status}
        />

        <Stat
          label="Result"
          value={
            review.reviewResult ??
            "Awaiting review"
          }
        />

        <Stat
          label="Open Issues"
          value={String(openIssueCount)}
        />

        <Stat
          label={
            review.reviewedAt
              ? "Completed"
              : "Submitted"
          }
          value={formatDate(
            review.reviewedAt ??
              review.submittedAt,
          )}
        />
      </section>

      {review.notesOriginal && (
        <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-950">
            Installer Notes
          </h2>

          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-800">
            {review.notesOriginal}
          </p>

          {review.notesEnglishTranslation && (
            <div className="mt-5 border-t border-slate-200 pt-5">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                English Translation
              </p>

              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                {
                  review.notesEnglishTranslation
                }
              </p>
            </div>
          )}
        </section>
      )}

      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">
          Material List
        </h2>

        <div className="mt-5 grid gap-3">
          {review.items.length === 0 ? (
            <p className="text-sm text-slate-600">
              No material items were saved.
            </p>
          ) : (
            review.items.map((item) => (
              <article
                key={item.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div>
                  <h3 className="font-bold text-slate-950">
                    {item.itemName}
                  </h3>

                  {item.description && (
                    <p className="mt-1 text-sm text-slate-600">
                      {item.description}
                    </p>
                  )}
                </div>

                <span className="shrink-0 rounded-lg bg-white px-3 py-2 text-sm font-bold text-slate-800">
                  {item.quantity}{" "}
                  {item.unit ?? ""}
                </span>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="mt-7">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-950">
              Reported Issues
            </h2>

            <p className="mt-1 text-sm text-slate-600">
              Review each correction and track
              how it was handled.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void loadReview()
            }
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700"
          >
            Refresh
          </button>
        </div>

        {review.issues.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
            <h3 className="font-bold text-emerald-950">
              No material issues reported
            </h3>

            <p className="mt-2 text-sm text-emerald-800">
              The installer did not identify
              shortages, duplicates, incorrect
              materials, or quantity problems.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid gap-5">
            {review.issues.map(
              (issue) => (
                <article
                  key={issue.id}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.15em] text-amber-700">
                        {issueLabels[
                          issue.issueType
                        ] ??
                          issue.issueType}
                      </p>

                      <h3 className="mt-2 text-lg font-bold text-slate-950">
                        {issue.item
                          ?.itemName ??
                          "General material issue"}
                      </h3>

                      {issue.reportedQuantity !==
                        null && (
                        <p className="mt-2 text-sm text-slate-700">
                          Reported correct
                          quantity:{" "}
                          <strong>
                            {
                              issue.reportedQuantity
                            }
                            {issue.item?.unit
                              ? ` ${issue.item.unit}`
                              : ""}
                          </strong>
                        </p>
                      )}
                    </div>

                    <StatusBadge
                      status={issue.status}
                    />
                  </div>

                  {issue.notesOriginal && (
                    <div className="mt-5 rounded-xl bg-slate-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Installer Explanation
                      </p>

                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                        {
                          issue.notesOriginal
                        }
                      </p>

                      {issue.notesEnglishTranslation && (
                        <>
                          <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">
                            English Translation
                          </p>

                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                            {
                              issue.notesEnglishTranslation
                            }
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <button
                      type="button"
                      disabled={
                        updatingId ===
                        issue.id
                      }
                      onClick={() =>
                        void updateIssue(
                          issue.id,
                          "reviewing",
                        )
                      }
                      className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800 disabled:opacity-50"
                    >
                      Mark Reviewing
                    </button>

                    <button
                      type="button"
                      disabled={
                        updatingId ===
                        issue.id
                      }
                      onClick={() =>
                        void updateIssue(
                          issue.id,
                          "resolved",
                        )
                      }
                      className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 disabled:opacity-50"
                    >
                      Mark Resolved
                    </button>

                    <button
                      type="button"
                      disabled={
                        updatingId ===
                        issue.id
                      }
                      onClick={() =>
                        void updateIssue(
                          issue.id,
                          "dismissed",
                        )
                      }
                      className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-50"
                    >
                      Dismiss Issue
                    </button>
                  </div>
                </article>
              ),
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p className="mt-2 break-words text-lg font-bold capitalize text-slate-950">
        {value.replaceAll("_", " ")}
      </p>
    </article>
  );
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const classes =
    status === "resolved"
      ? "bg-emerald-100 text-emerald-800"
      : status === "dismissed"
        ? "bg-slate-200 text-slate-700"
        : status === "reviewing"
          ? "bg-blue-100 text-blue-800"
          : "bg-amber-100 text-amber-800";

  return (
    <span
      className={`self-start rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${classes}`}
    >
      {status}
    </span>
  );
}
