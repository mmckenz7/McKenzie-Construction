"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

type InboxItem = {
  id: string;
  type:
    | "schedule_response"
    | "material_review";
  status: string;
  title: string;
  project: {
    id: string;
    name: string;
    address: string;
  } | null;
  installer: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
  } | null;
  submittedAt: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  createdAt: string;
  activityAt: string;
  href: string;
  earliestDemoStart?: string | null;
  earliestConstructionStart?:
    | string
    | null;
  demoDurationDays?: number | null;
  totalDurationDays?: number | null;
  reviewResult?: string | null;
  totalIssues?: number;
  unresolvedIssues?: number;
  notes?: string | null;
};

type InboxResponse = {
  success: boolean;
  items?: InboxItem[];
  summary?: {
    total: number;
    needsAttention: number;
    submittedSchedules: number;
    materialIssues: number;
  };
  error?: string;
};

type Filter =
  | "attention"
  | "all"
  | "schedules"
  | "materials";

function formatDate(
  value: string | null | undefined,
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

function formatDateOnly(
  value: string | null | undefined,
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
  ).format(
    new Date(`${value}T12:00:00`),
  );
}

function requiresAttention(
  item: InboxItem,
) {
  if (
    item.type ===
    "schedule_response"
  ) {
    return (
      item.status === "submitted" &&
      !item.reviewedAt
    );
  }

  return (
    item.reviewResult ===
      "issues_reported" &&
    (item.unresolvedIssues ?? 0) > 0
  );
}

export default function OperationsInboxPage() {
  const [items, setItems] =
    useState<InboxItem[]>([]);

  const [summary, setSummary] =
    useState({
      total: 0,
      needsAttention: 0,
      submittedSchedules: 0,
      materialIssues: 0,
    });

  const [filter, setFilter] =
    useState<Filter>("attention");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  async function loadInbox() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/operations-inbox",
        {
          credentials: "include",
          cache: "no-store",
        },
      );

      const result =
        (await response.json()) as InboxResponse;

      if (
        !response.ok ||
        !result.success
      ) {
        setError(
          result.error ??
            "Could not load the Operations inbox.",
        );
        return;
      }

      setItems(result.items ?? []);

      setSummary(
        result.summary ?? {
          total: 0,
          needsAttention: 0,
          submittedSchedules: 0,
          materialIssues: 0,
        },
      );
    } catch {
      setError(
        "Could not load the Operations inbox.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInbox();
  }, []);

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        if (filter === "all") {
          return true;
        }

        if (
          filter === "attention"
        ) {
          return requiresAttention(
            item,
          );
        }

        if (
          filter === "schedules"
        ) {
          return (
            item.type ===
            "schedule_response"
          );
        }

        return (
          item.type ===
          "material_review"
        );
      }),
    [filter, items],
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
            Operations
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">
            Inbox
          </h1>

          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
            Review installer schedule
            responses, material approvals,
            and unresolved material issues.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            void loadInbox()
          }
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800"
        >
          Refresh
        </button>
      </div>

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Needs Attention"
          value={
            summary.needsAttention
          }
        />

        <SummaryCard
          label="Schedule Responses"
          value={
            summary.submittedSchedules
          }
        />

        <SummaryCard
          label="Open Material Issues"
          value={
            summary.materialIssues
          }
        />

        <SummaryCard
          label="Total Activity"
          value={summary.total}
        />
      </section>

      <div className="mt-7 flex flex-wrap gap-2">
        <FilterButton
          active={
            filter === "attention"
          }
          onClick={() =>
            setFilter("attention")
          }
        >
          Needs Attention
        </FilterButton>

        <FilterButton
          active={filter === "all"}
          onClick={() =>
            setFilter("all")
          }
        >
          All Activity
        </FilterButton>

        <FilterButton
          active={
            filter === "schedules"
          }
          onClick={() =>
            setFilter("schedules")
          }
        >
          Schedules
        </FilterButton>

        <FilterButton
          active={
            filter === "materials"
          }
          onClick={() =>
            setFilter("materials")
          }
        >
          Material Reviews
        </FilterButton>
      </div>

      {error && (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-8 text-sm text-slate-600">
          Loading Operations inbox...
        </p>
      ) : filteredItems.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-xl font-bold text-slate-950">
            Nothing here
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            There is no installer activity
            matching this filter.
          </p>
        </section>
      ) : (
        <section className="mt-6 grid gap-5">
          {filteredItems.map(
            (item) => (
              <InboxCard
                key={`${item.type}-${item.id}`}
                item={item}
              />
            ),
          )}
        </section>
      )}
    </main>
  );
}

function InboxCard({
  item,
}: {
  item: InboxItem;
}) {
  const attention =
    requiresAttention(item);

  const [reviewing, setReviewing] =
    useState(false);

  const [localReviewedAt, setLocalReviewedAt] =
    useState<string | null>(
      item.reviewedAt ?? null,
    );

  async function markReviewed() {
    setReviewing(true);

    try {
      const response = await fetch(
        `/api/schedule-requests/${item.id}/review`,
        {
          method: "PATCH",
          credentials: "include",
        },
      );

      const result =
        (await response.json()) as {
          success?: boolean;
          error?: string;
          result?: {
            reviewed_at?: string;
          };
        };

      if (!response.ok || !result.success) {
        window.alert(
          result.error ??
            "Could not mark this response reviewed.",
        );
        return;
      }

      setLocalReviewedAt(
        result.result?.reviewed_at ??
          new Date().toISOString(),
      );
    } catch {
      window.alert(
        "Could not mark this response reviewed.",
      );
    } finally {
      setReviewing(false);
    }
  }

  return (
    <article
      className={`rounded-2xl border bg-white p-6 shadow-sm ${
        attention
          ? "border-amber-300"
          : "border-slate-200"
      }`}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                item.type ===
                "schedule_response"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {item.type ===
              "schedule_response"
                ? "Schedule"
                : "Materials"}
            </span>

            {attention && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-800">
                Needs Attention
              </span>
            )}
          </div>

          <h2 className="mt-3 text-xl font-bold text-slate-950">
            {item.title}
          </h2>

          <p className="mt-2 text-sm font-semibold text-slate-700">
            {item.project?.name ??
              "Project"}
            {" · "}
            {item.installer?.name ??
              "Installer"}
          </p>

          {item.project?.address && (
            <p className="mt-1 text-sm text-slate-500">
              {item.project.address}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          {item.type ===
            "schedule_response" &&
            item.status ===
              "submitted" &&
            !localReviewedAt && (
              <button
                type="button"
                disabled={reviewing}
                onClick={() =>
                  void markReviewed()
                }
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-center text-sm font-bold text-emerald-800 disabled:opacity-50"
              >
                {reviewing
                  ? "Saving..."
                  : "Mark Reviewed"}
              </button>
            )}

          {item.type ===
            "schedule_response" &&
            localReviewedAt && (
              <span className="rounded-xl bg-emerald-100 px-4 py-3 text-center text-sm font-bold text-emerald-800">
                Reviewed
              </span>
            )}

          {item.project?.id && (
            <>
              <Link
                href={`/operations/projects/${item.project.id}`}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-bold text-slate-700"
              >
                Open Project
              </Link>

              <Link
                href={`/operations/projects/${item.project.id}/activity`}
                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-bold text-blue-800"
              >
                Project Timeline
              </Link>
            </>
          )}

          <Link
            href={item.href}
            className="rounded-xl bg-blue-950 px-4 py-3 text-center text-sm font-bold text-white"
          >
            Review Activity
          </Link>
        </div>
      </div>

      {item.type ===
      "schedule_response" ? (
        <dl className="mt-5 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <Info
            label="Demo Start"
            value={formatDateOnly(
              item.earliestDemoStart,
            )}
          />

          <Info
            label="Construction Start"
            value={formatDateOnly(
              item.earliestConstructionStart,
            )}
          />

          <Info
            label="Demo Duration"
            value={
              item.demoDurationDays ===
              null ||
              item.demoDurationDays ===
                undefined
                ? "—"
                : `${item.demoDurationDays} days`
            }
          />

          <Info
            label="Total Duration"
            value={
              item.totalDurationDays ===
              null ||
              item.totalDurationDays ===
                undefined
                ? "—"
                : `${item.totalDurationDays} days`
            }
          />
        </dl>
      ) : (
        <dl className="mt-5 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
          <Info
            label="Result"
            value={
              item.reviewResult
                ?.replaceAll("_", " ") ??
              "Awaiting review"
            }
          />

          <Info
            label="Total Issues"
            value={String(
              item.totalIssues ?? 0,
            )}
          />

          <Info
            label="Open Issues"
            value={String(
              item.unresolvedIssues ?? 0,
            )}
          />
        </dl>
      )}

      {item.notes && (
        <div className="mt-4 rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Installer Notes
          </p>

          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
            {item.notes}
          </p>
        </div>
      )}

      <p className="mt-4 text-xs font-semibold text-slate-500">
        Activity:{" "}
        {formatDate(item.activityAt)}
      </p>
    </article>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-3xl font-bold text-slate-950">
        {value}
      </p>
    </article>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-bold ${
        active
          ? "bg-blue-950 text-white"
          : "border border-slate-300 bg-white text-slate-700"
      }`}
    >
      {children}
    </button>
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

      <dd className="mt-1 text-sm font-semibold capitalize text-slate-800">
        {value}
      </dd>
    </div>
  );
}
