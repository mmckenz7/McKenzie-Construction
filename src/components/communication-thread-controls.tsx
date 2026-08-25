"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type TeamMemberOption = {
  id: string;
  name: string;
};

type CommunicationThreadControlsProps = {
  threadId: string;
  status: string;
  unreadCount: number;
  assignedToId: string | null;
  teamMembers: TeamMemberOption[];
  compact?: boolean;
  mailboxOnly?: boolean;
};

export function CommunicationThreadControls({
  threadId,
  status,
  unreadCount,
  assignedToId,
  teamMembers,
  compact = false,
  mailboxOnly = false,
}: CommunicationThreadControlsProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function update(payload: Record<string, unknown>) {
    setError("");
    setIsSaving(true);
    try {
      const response = await fetch(`/api/communications/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !result.success) {
        setError(result.error ?? "The conversation could not be updated.");
        return;
      }
      startTransition(() => {
        if (!compact && payload.status === "archived") {
          router.push("/communications");
        } else {
          router.refresh();
        }
      });
    } catch {
      setError("The conversation could not be updated. Check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const busy = isSaving || isPending;

  const buttonClass = compact
    ? "rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600 hover:border-slate-400 hover:text-slate-950 disabled:opacity-50"
    : "rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-slate-400 hover:text-slate-950 disabled:opacity-50";

  return <div className={compact ? "flex flex-wrap items-center justify-end gap-2" : "space-y-3"}>
    <button type="button" className={buttonClass} disabled={busy} onClick={() => update({ isRead: unreadCount > 0 })}>
      {unreadCount > 0 ? "Mark read" : "Mark unread"}
    </button>
    {!mailboxOnly ? <button type="button" className={buttonClass} disabled={busy} onClick={() => update({ status: status === "closed" ? "open" : "closed" })}>
      {status === "closed" ? "Reopen" : "Close"}
    </button> : null}
    <button type="button" className={`${buttonClass} hover:border-amber-400 hover:text-amber-800`} disabled={busy} onClick={() => update({ status: status === "archived" ? "open" : "archived" })}>
      {status === "archived" ? "Restore" : "Archive"}
    </button>
    {!compact && !mailboxOnly ? <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
      Assigned to
      <select
        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-800"
        value={assignedToId ?? ""}
        disabled={busy}
        onChange={(event) => update({ assignedToId: event.target.value || null })}
      >
        <option value="">Unassigned</option>
        {teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
      </select>
    </label> : null}
    {error ? <p role="alert" className={`${compact ? "basis-full text-right" : ""} text-xs font-semibold text-rose-400`}>{error}</p> : null}
  </div>;
}
