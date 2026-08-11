"use client";

import { useEffect, useState } from "react";

type ContractPreparation = {
  id: string;
  status: string;
  recipientName: string;
  recipientEmail: string | null;
  legalTermsStatus: string;
};

type ContractResponse = {
  success?: boolean;
  error?: string;
  contractPreparation?: ContractPreparation | null;
};

const button = "rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";

export function ContractPreparationCard({ estimateId, estimateStatus }: { estimateId: string; estimateStatus: string }) {
  const [preparation, setPreparation] = useState<ContractPreparation | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (estimateStatus !== "accepted") return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/estimates/${encodeURIComponent(estimateId)}/contract-preparation`, { cache: "no-store" });
        const body = await response.json() as ContractResponse;
        if (!response.ok) throw new Error(body.error ?? "Contract preparation could not be loaded.");
        if (active) setPreparation(body.contractPreparation ?? null);
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : "Contract preparation could not be loaded.");
      }
    })();
    return () => { active = false; };
  }, [estimateId, estimateStatus]);

  if (estimateStatus !== "accepted" && !preparation) return null;

  async function prepare() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/estimates/${encodeURIComponent(estimateId)}/contract-preparation`, { method: "POST" });
      const body = await response.json() as ContractResponse;
      if (!response.ok || !body.contractPreparation) throw new Error(body.error ?? "Contract preparation could not be created.");
      setPreparation(body.contractPreparation);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Contract preparation could not be created.");
    } finally {
      setPending(false);
    }
  }

  return <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
    <p className="text-xs font-bold uppercase tracking-[.18em] text-amber-800">Next step after estimate acceptance</p>
    <h2 className="mt-2 text-2xl font-bold text-slate-950">Prepare the construction contract</h2>
    <p className="mt-2 max-w-3xl text-sm text-slate-700">
      Estimate acceptance records the customer&apos;s nonbinding intent to proceed. Work is not authorized until a separate contract is prepared, reviewed, and electronically signed.
    </p>
    {preparation ? <div className="mt-5 rounded-xl border border-amber-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="font-bold text-slate-950">Contract draft created for {preparation.recipientName}</p><p className="mt-1 text-sm text-slate-600">{preparation.recipientEmail ?? "Recipient email still required"}</p></div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase text-amber-900">Legal terms required</span>
      </div>
      <p className="mt-3 text-sm text-slate-700">The accepted customer estimate is frozen in this package. Sending and signature controls stay locked until company-approved contract terms are configured.</p>
    </div> : <button type="button" className={`mt-5 ${button}`} disabled={pending} onClick={() => void prepare()}>{pending ? "Preparing…" : "Prepare contract draft"}</button>}
    {error ? <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</p> : null}
  </section>;
}
