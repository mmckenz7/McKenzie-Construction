"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const OPEN_INBOX_REFRESH_MS = 2 * 60 * 1000;

type AutomationResult = {
  success?: boolean;
  warnings?: string[];
  outbox?: { processed?: number; sent?: number };
  inbox?: { synchronized?: number };
  error?: string;
};

export function CommunicationAutomationControls({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const runningRef = useRef(false);

  async function runAutomation(manual: boolean) {
    if (!enabled || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    if (manual) setNotice("");
    try {
      const response = await fetch("/api/communications/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = await response.json() as AutomationResult;
      if (!response.ok && response.status !== 207) {
        throw new Error(result.error || "Communication automation could not run.");
      }
      const warning = result.warnings?.filter(Boolean).join(" ") ?? "";
      setNotice(warning || `Updated. ${result.inbox?.synchronized ?? 0} inbox changes and ${result.outbox?.processed ?? 0} queued deliveries processed.`);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Communication automation could not run.");
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }

  useEffect(() => {
    if (!enabled || !autoRefresh) return;
    const timer = window.setInterval(() => void runAutomation(false), OPEN_INBOX_REFRESH_MS);
    return () => window.clearInterval(timer);
  // runAutomation intentionally uses current component state and the interval is recreated when the toggle changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, enabled]);

  return <div className="flex flex-wrap items-center justify-between gap-3">
    <label className="flex items-center gap-2 text-xs font-semibold text-slate-400">
      <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} disabled={!enabled} />
      Refresh every 2 minutes while this inbox is open
    </label>
    <button type="button" onClick={() => void runAutomation(true)} disabled={!enabled || running} className="rounded-lg border border-blue-800 bg-blue-950/40 px-3 py-2 text-xs font-bold text-blue-300 disabled:cursor-not-allowed disabled:opacity-50">{running ? "Updating…" : "Update now"}</button>
    {notice ? <p role="status" className="w-full text-xs text-slate-400">{notice}</p> : null}
  </div>;
}
