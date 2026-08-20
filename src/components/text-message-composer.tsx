"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type TextMessageComposerProps = {
  recipient: string | null;
  threadId?: string | null;
  leadId?: string | null;
  customerId?: string | null;
};

export function TextMessageComposer({
  recipient,
  threadId = null,
  leadId = null,
  customerId = null,
}: TextMessageComposerProps) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recipient || submitting) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const response = await fetch("/api/communications/texts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, leadId, customerId, body }),
      });
      const result = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || "The text could not be sent.");
      setBody("");
      setNotice({ kind: "success", text: "Text sent from the McKenzie number." });
      router.refresh();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "The text could not be sent." });
    } finally {
      setSubmitting(false);
    }
  }

  return <form onSubmit={submit} className="space-y-4">
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
      <div><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-slate-500">Text to</p><p className="mt-1 text-sm font-medium text-slate-900">{recipient || "No customer phone number"}</p></div>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">From 865-433-3325</span>
    </div>
    <label className="block">
      <span className="sr-only">Text message</span>
      <textarea
        className="min-h-28 w-full resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm leading-6 text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={1600}
        placeholder="Write a text message…"
        required
        disabled={!recipient || submitting}
      />
      <span className="mt-1 flex justify-between text-xs text-slate-500"><span>STOP requests are blocked automatically.</span><span>{body.length}/1600</span></span>
    </label>
    {notice ? <p role="status" className={`rounded-lg border px-3 py-2 text-sm ${notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{notice.text}</p> : null}
    <button type="submit" disabled={!recipient || submitting} className="min-h-10 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40">{submitting ? "Sending…" : "Send text"}</button>
  </form>;
}
