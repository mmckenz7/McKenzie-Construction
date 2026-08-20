"use client";

import { useState } from "react";

export function OsCallButton({ leadId, customerId, disabled = false }: { leadId?: string | null; customerId?: string | null; disabled?: boolean }) {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  async function startCall() {
    setPending(true);
    setNotice(null);
    try {
      const response = await fetch("/api/communications/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, customerId }),
      });
      const result = await response.json() as { success?: boolean; error?: string; message?: string };
      if (!response.ok || !result.success) throw new Error(result.error || "The call could not be started.");
      setNotice({ kind: "success", text: result.message || "Your phone will ring first." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "The call could not be started." });
    } finally { setPending(false); }
  }
  return <div className="space-y-2">
    <button type="button" disabled={disabled || pending} onClick={() => void startCall()} className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">{pending ? "Starting…" : "Call through McKenzie number"}</button>
    {notice ? <p role="status" className={`max-w-sm text-xs ${notice.kind === "success" ? "text-emerald-700" : "text-rose-700"}`}>{notice.text}</p> : null}
  </div>;
}
