"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type PilotItem = Readonly<{
  itemNumber: string;
  modelNumber: string;
  brand: string;
  canonicalName: string;
  priceAmount: string;
  sellUnitCode: string;
  packageQuantity: string | null;
  identitySourceReference: string;
  priceSourceReference: string;
}>;

type WorkflowState = Readonly<{
  state: string;
  importId: string | null;
  previewId: string | null;
  previewSha256: string | null;
  reviewedRows: number;
}>;

type Props = Readonly<{
  items: readonly PilotItem[];
  workflow: WorkflowState;
  canStage: boolean;
  canReview: boolean;
  canPreview: boolean;
  canPublish: boolean;
}>;

type Action = "stage" | "review" | "preview" | "approve" | "publish";

const actionLabels: Record<Action, string> = {
  stage: "1. Stage evidence",
  review: "2. Confirm product identities",
  preview: "3. Build price preview",
  approve: "4. Approve preview",
  publish: "5. Publish four prices",
};

export function LowesPilotReview({
  items,
  workflow,
  canStage,
  canReview,
  canPreview,
  canPublish,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<Action | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function runAction(action: Action) {
    setPending(action);
    setMessage(null);
    try {
      const response = await fetch(
        "/api/material-catalog/pilots/lowes-east-knoxville",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            importId: workflow.importId,
            previewId: workflow.previewId,
            previewSha256: workflow.previewSha256,
          }),
        },
      );
      const body = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || body.success !== true) {
        throw new Error(body.error || "The action could not be completed.");
      }
      setMessage(`${actionLabels[action]} completed.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The action could not be completed.");
    } finally {
      setPending(null);
    }
  }

  const stageReady = workflow.state === "not_staged";
  const reviewReady = workflow.state === "review_required" && workflow.reviewedRows < 4;
  const previewReady = workflow.state === "review_required" && workflow.reviewedRows === 4;
  const approvalReady = workflow.state === "preview_ready" && Boolean(workflow.previewId);
  const publishReady = workflow.state === "approved" && Boolean(workflow.previewId && workflow.previewSha256);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-300">
            Material Catalog · fixed public-retail pilot
          </p>
          <h1 className="text-3xl font-semibold">Lowe&apos;s East Knoxville price review</h1>
          <p className="max-w-3xl text-slate-300">
            Four prices observed on August 11, 2026 at 4:52 PM ET while the public
            Lowe&apos;s site showed store #1544, 3100 S Mall Rd NE, Knoxville, TN 37924.
            Loading this page never writes or publishes anything.
          </p>
        </header>

        <section className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-100">
          These are public retail observations—not contractor-account prices or quotes.
          Stock, availability, delivery, and tax are unknown. Publishing records exactly
          this evidence; it does not update estimates, proposals, contracts, or legacy prices.
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <article key={item.itemNumber} className="rounded-xl border border-slate-700 bg-slate-900 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Item {item.itemNumber} · Model {item.modelNumber}
                  </p>
                  <h2 className="mt-2 font-semibold text-white">{item.canonicalName}</h2>
                  <p className="mt-1 text-sm text-slate-400">{item.brand}</p>
                </div>
                <p className="whitespace-nowrap text-xl font-semibold text-emerald-300">
                  ${item.priceAmount}
                </p>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-slate-500">Price unit</dt><dd>{item.sellUnitCode}</dd></div>
                <div><dt className="text-slate-500">Availability</dt><dd>Unknown</dd></div>
                {item.packageQuantity ? (
                  <div><dt className="text-slate-500">Package count</dt><dd>{item.packageQuantity}</dd></div>
                ) : null}
                <div><dt className="text-slate-500">Price source</dt><dd>
                  <a className="text-sky-300 underline" href={item.priceSourceReference} target="_blank" rel="noreferrer">
                    Localized search results
                  </a>
                </dd></div>
                <div><dt className="text-slate-500">Identity source</dt><dd>
                  <a className="text-sky-300 underline" href={item.identitySourceReference} target="_blank" rel="noreferrer">
                    Canonical product page
                  </a>
                </dd></div>
              </dl>
            </article>
          ))}
        </section>

        <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Controlled publication steps</h2>
              <p className="text-sm text-slate-400">
                Current state: <span className="text-slate-200">{workflow.state.replaceAll("_", " ")}</span>
                {workflow.state === "review_required" ? ` · ${workflow.reviewedRows}/4 identities reviewed` : ""}
              </p>
            </div>
            {message ? <p role="status" className="text-sm text-sky-200">{message}</p> : null}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {([
              ["stage", stageReady && canStage],
              ["review", reviewReady && canReview],
              ["preview", previewReady && canPreview],
              ["approve", approvalReady && canPublish],
              ["publish", publishReady && canPublish],
            ] as const).map(([action, enabled]) => (
              <button
                key={action}
                type="button"
                disabled={!enabled || pending !== null}
                onClick={() => runAction(action)}
                className="rounded-lg border border-sky-500/50 bg-sky-500/10 px-3 py-3 text-sm font-medium text-sky-100 enabled:hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
              >
                {pending === action ? "Working…" : actionLabels[action]}
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Each button is a separate authorized transaction. Publish is never triggered by
            viewing, staging, reviewing, previewing, or approving.
          </p>
        </section>
      </div>
    </main>
  );
}
