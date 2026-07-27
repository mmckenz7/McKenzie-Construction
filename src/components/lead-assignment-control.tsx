"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  roles: string[] | null;
  status: string;
};

type LeadAssignment = {
  id: string;
  responsible_person_id: string | null;
  assigned_at: string | null;
  responsible_person: TeamMember | TeamMember[] | null;
};

type LeadAssignmentControlProps = {
  leadId: string;
};

function getResponsiblePerson(
  value: TeamMember | TeamMember[] | null,
) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

export default function LeadAssignmentControl({
  leadId,
}: LeadAssignmentControlProps) {
  const router = useRouter();

  const [lead, setLead] =
    useState<LeadAssignment | null>(null);

  const [teamMembers, setTeamMembers] = useState<
    TeamMember[]
  >([]);

  const [selectedMemberId, setSelectedMemberId] =
    useState("");

  const [transferOpenTasks, setTransferOpenTasks] =
    useState(true);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const currentResponsiblePerson = useMemo(
    () =>
      lead
        ? getResponsiblePerson(
            lead.responsible_person,
          )
        : null,
    [lead],
  );

  useEffect(() => {
    let isMounted = true;

    async function loadAssignment() {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/leads/${encodeURIComponent(
            leadId,
          )}/assignment`,
          {
            method: "GET",
            cache: "no-store",
          },
        );

        const result = (await response.json()) as {
          success?: boolean;
          lead?: LeadAssignment;
          teamMembers?: TeamMember[];
          error?: string;
        };

        if (!response.ok || !result.success) {
          throw new Error(
            result.error ??
              "Unable to load lead assignment.",
          );
        }

        if (!result.lead) {
          throw new Error(
            "Lead assignment information was not returned.",
          );
        }

        if (!isMounted) {
          return;
        }

        setLead(result.lead);
        setTeamMembers(result.teamMembers ?? []);
        setSelectedMemberId(
          result.lead.responsible_person_id ?? "",
        );
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load lead assignment.",
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadAssignment();

    return () => {
      isMounted = false;
    };
  }, [leadId]);

  async function saveAssignment(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setMessage("");
    setError("");
    setIsSaving(true);

    try {
      const response = await fetch(
        `/api/leads/${encodeURIComponent(
          leadId,
        )}/assignment`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            responsiblePersonId:
              selectedMemberId || null,
            transferOpenTasks,
          }),
        },
      );

      const result = (await response.json()) as {
        success?: boolean;
        message?: string;
        lead?: LeadAssignment;
        transferredTaskCount?: number;
        error?: string;
        details?: string;
      };

      if (!response.ok || !result.success) {
        throw new Error(
          result.details
            ? `${result.error ?? "Unable to save assignment."} ${result.details}`
            : result.error ??
                "Unable to save assignment.",
        );
      }

      if (result.lead) {
        setLead(result.lead);
        setSelectedMemberId(
          result.lead.responsible_person_id ?? "",
        );
      }

      const transferredTaskCount =
        result.transferredTaskCount ?? 0;

      setMessage(
        transferredTaskCount > 0
          ? `${result.message ?? "Assignment saved"} ${transferredTaskCount} open ${
              transferredTaskCount === 1
                ? "task was"
                : "tasks were"
            } reassigned.`
          : result.message ?? "Assignment saved.",
      );

      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save assignment.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-slate-600">
          Loading lead assignment...
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Responsibility
        </p>

        <h2 className="mt-1 text-xl font-bold text-slate-950">
          Lead Assignment
        </h2>

        <p className="mt-2 text-sm text-slate-600">
          Choose the employee responsible for this
          customer and optionally transfer the open
          workflow tasks.
        </p>
      </div>

      {error && !lead ? (
        <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}

      {lead ? (
        <form
          onSubmit={saveAssignment}
          className="mt-5 space-y-5"
        >
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Current Responsible Person
            </p>

            <p className="mt-2 font-bold text-slate-950">
              {currentResponsiblePerson?.name ??
                "Unassigned"}
            </p>

            {currentResponsiblePerson?.job_title ? (
              <p className="mt-1 text-sm text-slate-600">
                {
                  currentResponsiblePerson.job_title
                }
              </p>
            ) : null}

            {lead.assigned_at ? (
              <p className="mt-2 text-xs text-slate-500">
                Assigned{" "}
                {new Date(
                  lead.assigned_at,
                ).toLocaleString()}
              </p>
            ) : null}
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-950">
              Responsible Person
            </span>

            <select
              value={selectedMemberId}
              onChange={(event) => {
                setSelectedMemberId(
                  event.target.value,
                );
                setMessage("");
                setError("");
              }}
              disabled={isSaving}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
            >
              <option value="">Unassigned</option>

              {teamMembers.map((member) => (
                <option
                  key={member.id}
                  value={member.id}
                >
                  {member.name}
                  {member.job_title
                    ? ` — ${member.job_title}`
                    : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <input
              type="checkbox"
              checked={transferOpenTasks}
              onChange={(event) => {
                setTransferOpenTasks(
                  event.target.checked,
                );
                setMessage("");
                setError("");
              }}
              disabled={isSaving}
              className="mt-1 h-4 w-4"
            />

            <span>
              <span className="block text-sm font-bold text-slate-950">
                Transfer open tasks
              </span>

              <span className="mt-1 block text-xs leading-5 text-slate-600">
                Reassign the lead&apos;s incomplete
                tasks to the newly selected person.
              </span>
            </span>
          </label>

          <button
            type="submit"
            disabled={isSaving}
            className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:bg-slate-400"
          >
            {isSaving
              ? "Saving..."
              : "Save Assignment"}
          </button>

          {message ? (
            <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              {message}
            </p>
          ) : null}

          {error ? (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}