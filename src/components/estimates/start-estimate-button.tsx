"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type StartEstimateButtonProps = {
  leadId: string;
  leadName: string;
};

export function StartEstimateButton({ leadId, leadName }: StartEstimateButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function startEstimate() {
    if (pending) return;
    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          title: `${leadName.trim() || "Customer"} Estimate`,
        }),
      });
      const result = await response.json() as {
        success?: boolean;
        error?: string;
        estimate?: { id?: unknown };
      };
      const estimateId = result.estimate?.id;

      if (!response.ok || !result.success || typeof estimateId !== "string" || !estimateId) {
        throw new Error(result.error ?? "The estimate could not be started.");
      }

      router.push(`/sales/estimates/${encodeURIComponent(estimateId)}`);
      router.refresh();
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "The estimate could not be started.");
      setPending(false);
    }
  }

  return <span className="flex flex-col items-end gap-1">
    <button
      type="button"
      disabled={pending}
      onClick={() => void startEstimate()}
      className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Starting…" : "Start estimate"}
    </button>
    {error ? <span role="alert" className="max-w-xs text-right text-xs font-semibold text-red-700">{error}</span> : null}
  </span>;
}
