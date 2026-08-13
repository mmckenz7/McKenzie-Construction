"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GUIDED_PHOTO_MAX_BYTES,
  GUIDED_PHOTO_MIME_TYPES,
} from "@/lib/guided-site-visits/core";
import { GUIDED_VISIBLE_FACT_CRITERIA } from "@/lib/guided-site-visits/visible-fact-criteria";

type InboxItem = {
  id: string;
  itemKey: string;
  ordinal: number;
  title: string;
};
type InboxProposal = { visitItemId: string; criterionKey: string };
type InboxReview = {
  id: string;
  intake_attempt_id: string;
  diagnostic_class:
    | "classified"
    | "retake_recommended"
    | "review_unavailable"
    | "unsupported_media";
  proposals: InboxProposal[];
  created_at: string;
};
type InboxAttempt = {
  id: string;
  batch_id: string;
  member_ordinal: number;
  state: "upload_pending" | "confirmed" | "failed_validation" | "abandoned";
};
type InboxAssignment = {
  id: string;
  intake_attempt_id: string;
  visit_item_id: string;
  criterion_key: string;
  supersedes_assignment_event_id: string | null;
  decision: "accepted" | "corrected" | "excluded";
  resulting_visit_revision: number;
};
type InboxData = {
  batches: { id: string; member_count: number }[];
  members: {
    batch_id: string;
    ordinal: number;
    original_filename: string;
    mime_type: string;
    declared_byte_size: number;
    declared_sha256: string;
  }[];
  attempts: InboxAttempt[];
  reviews: InboxReview[];
  assignments: InboxAssignment[];
  items: InboxItem[];
};
type Draft = {
  id: string;
  file: File;
  url: string;
  sha256: string;
  status: "ready" | "uploading" | "failed";
  batchId?: string;
  ordinal?: number;
};

const MAX_INBOX_PHOTOS = 30;

export function GuidedDeckPhotoInbox({
  visitId,
  visitRevision,
  onVisitChanged,
  onUseGuided,
}: {
  visitId: string;
  visitRevision: number;
  onVisitChanged: () => Promise<void>;
  onUseGuided: () => void;
}) {
  const [data, setData] = useState<InboxData | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const draftsRef = useRef<Draft[]>([]);
  const [selectionNotice, setSelectionNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    percent: number;
    phase: "uploading" | "reviewing";
  } | null>(null);
  const [revision, setRevision] = useState(visitRevision);
  const [corrections, setCorrections] = useState<
    Record<
      string,
      {
        itemId: string;
        criterionKey: string;
        source?: InboxProposal;
        reviewId: string;
        attemptId: string;
      }
    >
  >({});

  useEffect(() => setRevision(visitRevision), [visitRevision]);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);
  useEffect(
    () => () =>
      draftsRef.current.forEach((draft) => URL.revokeObjectURL(draft.url)),
    [],
  );

  const loadInbox = useCallback(async () => {
    const response = await fetch(
      `/api/guided-site-visits/${visitId}/intake-batches`,
      { cache: "no-store" },
    );
    const body = (await response.json()) as InboxData & { error?: string };
    if (!response.ok)
      throw new Error(body.error ?? "Photo Inbox could not be loaded.");
    setData(body);
    return body;
  }, [visitId]);

  useEffect(() => {
    void loadInbox().catch((cause) =>
      setError(
        cause instanceof Error
          ? cause.message
          : "Photo Inbox could not be loaded.",
      ),
    );
  }, [loadInbox]);

  async function addFiles(files: File[]) {
    setError("");
    const serverCount =
      data?.attempts.filter((attempt) => attempt.state === "confirmed")
        .length ?? 0;
    const room = Math.max(0, MAX_INBOX_PHOTOS - serverCount - drafts.length);
    const existing = new Set(drafts.map((draft) => draft.sha256));
    let unsupported = 0;
    let tooLarge = 0;
    let duplicate = 0;
    let inboxFull = 0;
    const accepted: Draft[] = [];
    for (const file of files) {
      if (!GUIDED_PHOTO_MIME_TYPES.has(file.type)) {
        unsupported += 1;
        continue;
      }
      if (file.size < 1 || file.size > GUIDED_PHOTO_MAX_BYTES) {
        tooLarge += 1;
        continue;
      }
      const sha256 = await fileSha256(file);
      if (existing.has(sha256)) {
        duplicate += 1;
        continue;
      }
      existing.add(sha256);
      if (accepted.length >= room) {
        inboxFull += 1;
        continue;
      }
      const remainingMember = data?.members.find(
        (member) =>
          member.declared_sha256 === sha256 &&
          !data.attempts.some(
            (attempt) =>
              attempt.batch_id === member.batch_id &&
              attempt.member_ordinal === member.ordinal &&
              attempt.state === "confirmed",
          ),
      );
      accepted.push({
        id: crypto.randomUUID(),
        file,
        sha256,
        url: URL.createObjectURL(file),
        status: "ready",
        ...(remainingMember
          ? {
              batchId: remainingMember.batch_id,
              ordinal: remainingMember.ordinal,
            }
          : {}),
      });
    }
    setDrafts((current) => [...current, ...accepted]);
    const notAdded = files.length - accepted.length;
    const reasons = [
      inboxFull ? `inbox full: ${inboxFull}` : "",
      unsupported ? `unsupported type: ${unsupported}` : "",
      tooLarge ? `too large: ${tooLarge}` : "",
      duplicate ? `duplicate: ${duplicate}` : "",
    ].filter(Boolean);
    setSelectionNotice(
      `Selected ${files.length} · added ${accepted.length} · not added ${notAdded}${reasons.length ? ` (${reasons.join(" · ")})` : ""}`,
    );
  }

  function removeDraft(id: string) {
    setDrafts((current) => {
      const removed = current.find((draft) => draft.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      return current.filter((draft) => draft.id !== id);
    });
  }

  async function uploadInbox() {
    if (!drafts.length || busy) return;
    setBusy(true);
    setError("");
    const queue = [...drafts].sort(
      (a, b) =>
        (a.ordinal ?? Number.MAX_SAFE_INTEGER) -
        (b.ordinal ?? Number.MAX_SAFE_INTEGER),
    );
    const successes = new Set<string>();
    let nextRevision = revision;
    let attemptToAbandon: string | null = null;
    try {
      const resumableBatchId = queue[0]?.batchId;
      if (
        resumableBatchId &&
        queue.some(
          (draft) => draft.batchId !== resumableBatchId || !draft.ordinal,
        )
      )
        throw new Error(
          "Finish the reselected remaining batch before adding new photos.",
        );
      const manifest = queue.map((draft, index) => ({
        ordinal: index + 1,
        originalFilename: draft.file.name || `deck-visit-${index + 1}.jpg`,
        mimeType: draft.file.type,
        byteSize: draft.file.size,
        sha256: draft.sha256,
      }));
      const opened = resumableBatchId
        ? { batchId: resumableBatchId }
        : await requestJson(
            `/api/guided-site-visits/${visitId}/intake-batches`,
            {
              idempotencyKey: `guided-visit-inbox:${visitId}:${crypto.randomUUID()}`,
              manifest,
            },
          );
      if (typeof opened.batchId !== "string")
        throw new Error("Photo Inbox batch was incomplete.");
      if (!resumableBatchId)
        setDrafts((current) =>
          current.map((draft) => {
            const index = queue.findIndex((queued) => queued.id === draft.id);
            return index >= 0
              ? {
                  ...draft,
                  batchId: opened.batchId as string,
                  ordinal: index + 1,
                }
              : draft;
          }),
        );
      for (let index = 0; index < queue.length; index += 1) {
        const draft = queue[index];
        const memberOrdinal = draft.ordinal ?? index + 1;
        setDrafts((current) =>
          current.map((row) =>
            row.id === draft.id ? { ...row, status: "uploading" } : row,
          ),
        );
        setProgress({
          current: index + 1,
          total: queue.length,
          percent: 0,
          phase: "uploading",
        });
        try {
          const reserved = await requestJson(
            `/api/guided-site-visits/${visitId}/intake-batches/${opened.batchId}/members/${memberOrdinal}/upload-session`,
            {
              expectedRevision: nextRevision,
              idempotencyKey: `guided-visit-inbox-member:${opened.batchId}:${memberOrdinal}:${draft.sha256}:${crypto.randomUUID()}`,
            },
          );
          if (
            typeof reserved.attemptId !== "string" ||
            typeof reserved.nextRevision !== "number" ||
            !reserved.upload ||
            typeof (reserved.upload as { signedUrl?: unknown }).signedUrl !==
              "string"
          )
            throw new Error("Private upload session was incomplete.");
          attemptToAbandon = reserved.attemptId;
          nextRevision = reserved.nextRevision;
          await uploadFile(
            (reserved.upload as { signedUrl: string }).signedUrl,
            draft.file,
            (percent) =>
              setProgress({
                current: index + 1,
                total: queue.length,
                percent,
                phase: "uploading",
              }),
          );
          const completed = await requestJson(
            `/api/guided-site-visits/${visitId}/intake-photos/${reserved.attemptId}/complete`,
            { expectedRevision: nextRevision },
          );
          if (typeof completed.nextRevision !== "number")
            throw new Error("Photo confirmation was incomplete.");
          nextRevision = completed.nextRevision;
          attemptToAbandon = null;
          successes.add(draft.id);
          setProgress({
            current: index + 1,
            total: queue.length,
            percent: 100,
            phase: "reviewing",
          });
          await requestJson(
            `/api/guided-site-visits/${visitId}/intake-photos/${reserved.attemptId}/classification-reviews`,
            {
              idempotencyKey: `guided-visit-inbox-classification:${reserved.attemptId}:initial`,
            },
          );
        } catch (cause) {
          if (attemptToAbandon) {
            try {
              const abandoned = await requestJson(
                `/api/guided-site-visits/${visitId}/intake-photos/${attemptToAbandon}/abandon`,
                { expectedRevision: nextRevision },
              );
              if (typeof abandoned.nextRevision === "number")
                nextRevision = abandoned.nextRevision;
            } catch {}
          }
          setDrafts((current) =>
            current.map((row) =>
              row.id === draft.id ? { ...row, status: "failed" } : row,
            ),
          );
          setError(
            `Photo ${index + 1} stopped the upload. Earlier photos are saved; this photo and all remaining photos stay in the tray. ${cause instanceof Error ? cause.message : ""}`,
          );
          break;
        }
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Photo Inbox upload failed.",
      );
    } finally {
      setRevision(nextRevision);
      setDrafts((current) => {
        current
          .filter((draft) => successes.has(draft.id))
          .forEach((draft) => URL.revokeObjectURL(draft.url));
        return current
          .filter((draft) => !successes.has(draft.id))
          .map((draft) =>
            draft.status === "uploading"
              ? { ...draft, status: "ready" }
              : draft,
          );
      });
      await loadInbox().catch(() => undefined);
      await onVisitChanged();
      setProgress(null);
      setBusy(false);
    }
  }

  async function decide(
    attemptId: string,
    reviewId: string,
    proposal: InboxProposal,
    decision: "accepted" | "corrected" | "excluded",
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await requestJson(
        `/api/guided-site-visits/${visitId}/intake-photos/${attemptId}/assignment-events`,
        {
          expectedRevision: revision,
          idempotencyKey: `guided-inbox-assignment:${attemptId}:${proposal.visitItemId}:${proposal.criterionKey}:${decision}:${crypto.randomUUID()}`,
          reviewId,
          visitItemId: proposal.visitItemId,
          criterionKey: proposal.criterionKey,
          decision,
          supersedesEventId: null,
        },
      );
      if (typeof result.nextRevision === "number")
        setRevision(result.nextRevision);
      await loadInbox();
      await onVisitChanged();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Assignment could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function correctAssignment(
    key: string,
    correction: (typeof corrections)[string],
  ) {
    if (busy || !correction.itemId || !correction.criterionKey) return;
    setBusy(true);
    setError("");
    let nextRevision = revision;
    try {
      const sourceAlreadyClosed =
        correction.source &&
        effectiveAssignments.some(
          (assignment) =>
            assignment.intake_attempt_id === correction.attemptId &&
            assignment.visit_item_id === correction.source!.visitItemId &&
            assignment.criterion_key === correction.source!.criterionKey &&
            assignment.decision === "excluded",
        );
      if (correction.source && !sourceAlreadyClosed) {
        const excluded = await requestJson(
          `/api/guided-site-visits/${visitId}/intake-photos/${correction.attemptId}/assignment-events`,
          {
            expectedRevision: nextRevision,
            idempotencyKey: `guided-inbox-correction:${key}:exclude:${crypto.randomUUID()}`,
            reviewId: correction.reviewId,
            visitItemId: correction.source.visitItemId,
            criterionKey: correction.source.criterionKey,
            decision: "excluded",
            supersedesEventId: null,
          },
        );
        if (typeof excluded.nextRevision !== "number")
          throw new Error("Original proposal was not closed.");
        nextRevision = excluded.nextRevision;
        setRevision(nextRevision);
      }
      const corrected = await requestJson(
        `/api/guided-site-visits/${visitId}/intake-photos/${correction.attemptId}/assignment-events`,
        {
          expectedRevision: nextRevision,
          idempotencyKey: `guided-inbox-correction:${key}:corrected:${crypto.randomUUID()}`,
          reviewId: correction.reviewId,
          visitItemId: correction.itemId,
          criterionKey: correction.criterionKey,
          decision: "corrected",
          supersedesEventId: null,
        },
      );
      if (typeof corrected.nextRevision === "number")
        setRevision(corrected.nextRevision);
      setCorrections((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      await loadInbox();
      await onVisitChanged();
    } catch (cause) {
      setRevision(nextRevision);
      await loadInbox().catch(() => undefined);
      await onVisitChanged().catch(() => undefined);
      setError(
        cause instanceof Error
          ? cause.message
          : "Correction could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function retryClassification(attemptId: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await requestJson(
        `/api/guided-site-visits/${visitId}/intake-photos/${attemptId}/classification-reviews`,
        {
          idempotencyKey: `guided-visit-inbox-classification:${attemptId}:retry:${crypto.randomUUID()}`,
        },
      );
      await loadInbox();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "AI review could not be retried.",
      );
    } finally {
      setBusy(false);
    }
  }

  const attempts =
    data?.attempts.filter((attempt) => attempt.state === "confirmed") ?? [];
  const rows = attempts.map((attempt) => ({
    attempt,
    review: latestReview(data?.reviews ?? [], attempt.id),
    member: data?.members.find(
      (member) =>
        member.batch_id === attempt.batch_id &&
        member.ordinal === attempt.member_ordinal,
    ),
  }));
  const pendingReviewCount = rows.filter((row) => !row.review).length;
  const unavailableRows = rows.filter(
    (row) => row.review && row.review.diagnostic_class !== "classified",
  );
  const effectiveAssignments = (data?.assignments ?? []).filter(
    (assignment) =>
      !(data?.assignments ?? []).some(
        (later) => later.supersedes_assignment_event_id === assignment.id,
      ),
  );
  const remainingServerMembers = (data?.members ?? []).filter(
    (member) =>
      !(data?.attempts ?? []).some(
        (attempt) =>
          attempt.batch_id === member.batch_id &&
          attempt.member_ordinal === member.ordinal &&
          attempt.state === "confirmed",
      ),
  );
  const undecidedProposals = rows.flatMap(({ attempt, review }) =>
    review?.diagnostic_class === "classified"
      ? review.proposals.filter(
          (proposal) =>
            !effectiveAssignments.some(
              (assignment) =>
                assignment.intake_attempt_id === attempt.id &&
                assignment.visit_item_id === proposal.visitItemId &&
                assignment.criterion_key === proposal.criterionKey,
            ),
        )
      : [],
  );
  const classifiedWithoutProposals = rows.filter(
    (row) =>
      row.review?.diagnostic_class === "classified" &&
      !row.review.proposals.length,
  );
  const reviewComplete =
    rows.length > 0 &&
    pendingReviewCount === 0 &&
    unavailableRows.length === 0 &&
    undecidedProposals.length === 0 &&
    classifiedWithoutProposals.every((row) =>
      effectiveAssignments.some(
        (assignment) => assignment.intake_attempt_id === row.attempt.id,
      ),
    );
  const verifiedCoverage = new Set(
    effectiveAssignments
      .filter((assignment) =>
        ["accepted", "corrected"].includes(assignment.decision),
      )
      .map(
        (assignment) =>
          `${assignment.visit_item_id}:${assignment.criterion_key}`,
      ),
  );
  const missing = (data?.items ?? []).flatMap((item) =>
    (GUIDED_VISIBLE_FACT_CRITERIA[item.itemKey] ?? []).flatMap((criterion) =>
      verifiedCoverage.has(`${item.id}:${criterion.key}`)
        ? []
        : [{ item, criterionKey: criterion.key, label: criterion.label }],
    ),
  );

  return (
    <div className="p-4 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[.16em] text-amber-700">
        Whole-visit Photo Inbox
      </p>
      <h2 className="mt-1 text-2xl font-black text-slate-950">
        Choose your jobsite photos once
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-700">
        Select up to 30 photos. The app privately uploads and proposes where
        they belong; you make every evidence decision.
      </p>
      <label
        className={`mt-4 block w-full rounded-lg bg-slate-950 px-4 py-3 text-center font-bold text-white ${busy ? "opacity-50" : "cursor-pointer"}`}
      >
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          disabled={busy}
          className="sr-only"
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? []);
            event.target.value = "";
            void addFiles(selected);
          }}
        />
        Choose photos for the visit
      </label>
      {remainingServerMembers.length &&
      !drafts.some((draft) => draft.batchId) ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-amber-500 bg-amber-950 p-3 text-sm font-bold text-amber-100"
        >
          Reselect remaining files · {remainingServerMembers.length}{" "}
          device-local{" "}
          {remainingServerMembers.length === 1 ? "photo is" : "photos are"}{" "}
          still needed. Select the same files again; they will be matched
          securely to the original batch.
        </p>
      ) : null}
      {selectionNotice ? (
        <p
          role="status"
          className="mt-3 rounded-lg bg-slate-900 p-3 text-sm font-bold text-white"
        >
          {selectionNotice}
        </p>
      ) : null}
      {drafts.length ? (
        <>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {drafts.map((draft, index) => (
              <li
                key={draft.id}
                className="overflow-hidden rounded-lg border border-slate-300 bg-white"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={draft.url}
                  alt={`Visit photo ${index + 1}`}
                  className="h-28 w-full object-cover"
                />
                <div className="p-2 text-xs">
                  <strong>Photo {index + 1}</strong>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => removeDraft(draft.id)}
                    className="float-right font-bold text-red-800 underline"
                  >
                    Remove
                  </button>
                  <p className="mt-1 clear-both text-slate-600">
                    {draft.status === "failed"
                      ? "Failed · ready to retry"
                      : draft.status === "uploading"
                        ? "Uploading…"
                        : "Ready"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={busy}
            onClick={() => void uploadInbox()}
            className="mt-4 w-full rounded-lg bg-amber-500 px-4 py-3 font-black text-slate-950 disabled:opacity-50"
          >
            {progress
              ? `${progress.phase === "uploading" ? "Uploading" : "Reviewing"} photo ${progress.current} of ${progress.total} · ${progress.percent}%`
              : `Upload and review ${drafts.length} ${drafts.length === 1 ? "photo" : "photos"}`}
          </button>
        </>
      ) : null}
      {rows.length ? (
        <section className="mt-5 rounded-xl bg-slate-950 p-4 text-white">
          <h3 className="text-lg font-black">Review proposed groups</h3>
          <p className="mt-1 text-sm text-slate-300">
            AI suggestions are not evidence until you accept or correct them.
          </p>
          <div className="mt-4 space-y-4">
            {(data?.items ?? []).map((item) => {
              const proposals = rows.flatMap(({ attempt, review, member }) =>
                review?.diagnostic_class === "classified"
                  ? review.proposals
                      .filter((proposal) => proposal.visitItemId === item.id)
                      .map((proposal) => ({
                        attempt,
                        review,
                        member,
                        proposal,
                      }))
                  : [],
              );
              if (!proposals.length) return null;
              return (
                <div
                  key={item.id}
                  className="rounded-lg border border-slate-700 bg-slate-900 p-3"
                >
                  <h4 className="font-bold">
                    {item.ordinal}. {item.title}
                  </h4>
                  <ul className="mt-2 space-y-3">
                    {proposals.map(({ attempt, review, member, proposal }) => {
                      const correctionKey = `${attempt.id}:${proposal.visitItemId}:${proposal.criterionKey}`;
                      const decided = effectiveAssignments.find(
                        (assignment) =>
                          assignment.intake_attempt_id === attempt.id &&
                          assignment.visit_item_id === proposal.visitItemId &&
                          assignment.criterion_key === proposal.criterionKey,
                      );
                      const criterion = (
                        GUIDED_VISIBLE_FACT_CRITERIA[item.itemKey] ?? []
                      ).find((row) => row.key === proposal.criterionKey);
                      return (
                        <li
                          key={`${attempt.id}:${proposal.criterionKey}`}
                          className="rounded-lg bg-slate-800 p-3 text-sm"
                        >
                          <p>
                            <strong>
                              {member?.original_filename ??
                                `Photo ${attempt.member_ordinal}`}
                            </strong>{" "}
                            · {criterion?.label ?? proposal.criterionKey}
                          </p>
                          {decided ? (
                            <p className="mt-2 font-bold text-emerald-300">
                              Human decision: {decided.decision}
                            </p>
                          ) : (
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void decide(
                                    attempt.id,
                                    review.id,
                                    proposal,
                                    "accepted",
                                  )
                                }
                                className="rounded-lg bg-emerald-400 px-3 py-2 font-bold text-slate-950"
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void decide(
                                    attempt.id,
                                    review.id,
                                    proposal,
                                    "excluded",
                                  )
                                }
                                className="rounded-lg border border-slate-500 px-3 py-2 font-bold"
                              >
                                Exclude
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  setCorrections((value) => ({
                                    ...value,
                                    [correctionKey]: value[correctionKey] ?? {
                                      itemId: item.id,
                                      criterionKey: proposal.criterionKey,
                                      source: proposal,
                                      reviewId: review.id,
                                      attemptId: attempt.id,
                                    },
                                  }))
                                }
                                className="col-span-2 rounded-lg border border-amber-400 px-3 py-2 font-bold text-amber-200"
                              >
                                Correct assignment
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
          {Object.entries(corrections).map(([correctionKey, correction]) => {
            const row = rows.find(
              (entry) => entry.attempt.id === correction.attemptId,
            );
            return row ? (
              <CorrectionEditor
                key={`correct:${correctionKey}`}
                attemptId={row.attempt.id}
                filename={
                  row.member?.original_filename ??
                  `Photo ${row.attempt.member_ordinal}`
                }
                value={correction}
                items={data?.items ?? []}
                busy={busy}
                onChange={(value) =>
                  setCorrections((current) => ({
                    ...current,
                    [correctionKey]: { ...correction, ...value },
                  }))
                }
                onSave={() => void correctAssignment(correctionKey, correction)}
              />
            ) : null;
          })}
          {rows
            .filter(
              (row) =>
                row.review?.diagnostic_class === "classified" &&
                !row.review.proposals.length &&
                !effectiveAssignments.some(
                  (assignment) =>
                    assignment.intake_attempt_id === row.attempt.id,
                ),
            )
            .map(({ attempt, review, member }) => {
              const correctionKey = `${attempt.id}:unclassified`;
              return corrections[correctionKey] ? null : (
                <button
                  key={correctionKey}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setCorrections((current) => ({
                      ...current,
                      [correctionKey]: {
                        itemId: "",
                        criterionKey: "",
                        reviewId: review!.id,
                        attemptId: attempt.id,
                      },
                    }))
                  }
                  className="mt-4 w-full rounded-lg border border-amber-400 p-3 font-bold text-amber-200"
                >
                  Assign{" "}
                  {member?.original_filename ??
                    `Photo ${attempt.member_ordinal}`}{" "}
                  manually
                </button>
              );
            })}
          {pendingReviewCount || unavailableRows.length ? (
            <div
              role="alert"
              className="mt-4 rounded-lg bg-amber-950 p-3 text-amber-100"
            >
              <p className="font-black">Unclassified or unavailable</p>
              <ul className="mt-2 space-y-2 text-sm">
                {rows
                  .filter(
                    (row) =>
                      !row.review ||
                      row.review.diagnostic_class !== "classified",
                  )
                  .map((row) => (
                    <li
                      key={row.attempt.id}
                      className="rounded-lg border border-amber-700 p-2"
                    >
                      <strong>
                        {row.member?.original_filename ??
                          `Photo ${row.attempt.member_ordinal}`}
                      </strong>{" "}
                      · {row.review?.diagnostic_class ?? "review pending"}
                      {row.review?.diagnostic_class !== "unsupported_media" ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void retryClassification(row.attempt.id)
                          }
                          className="mt-2 block font-bold underline"
                        >
                          Retry AI review
                        </button>
                      ) : null}
                    </li>
                  ))}
              </ul>
              <p className="mt-2 text-sm font-semibold">
                These photos are not counted as missing evidence. Use guided
                capture when a usable review cannot be obtained.
              </p>
            </div>
          ) : null}
          {reviewComplete ? (
            <div className="mt-4 rounded-lg border border-slate-600 p-3">
              <h4 className="font-black">Consolidated missing list</h4>
              {missing.length ? (
                <ul className="mt-2 space-y-1 text-sm">
                  {missing.map((row) => (
                    <li key={`${row.item.id}:${row.criterionKey}`}>
                      • {row.item.title}: {row.label}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-emerald-300">
                  Every checklist criterion has human-verified photo evidence.
                </p>
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm font-semibold text-slate-300">
              The missing list appears only after every photo review is terminal
              and every proposal has a human decision.
            </p>
          )}
        </section>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-400 bg-red-950 p-3 text-sm font-bold text-red-100"
        >
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={onUseGuided}
        className="mt-5 w-full rounded-lg border border-slate-400 bg-white px-4 py-3 font-bold text-slate-900"
      >
        Use guided checklist capture instead
      </button>
    </div>
  );
}

function CorrectionEditor({
  attemptId,
  filename,
  value,
  items,
  busy,
  onChange,
  onSave,
}: {
  attemptId: string;
  filename: string;
  value: { itemId: string; criterionKey: string };
  items: InboxItem[];
  busy: boolean;
  onChange: (value: { itemId: string; criterionKey: string }) => void;
  onSave: () => void;
}) {
  const item = items.find((entry) => entry.id === value.itemId);
  const criteria = item
    ? (GUIDED_VISIBLE_FACT_CRITERIA[item.itemKey] ?? [])
    : [];
  return (
    <div
      className="mt-4 rounded-lg border border-amber-500 bg-slate-900 p-3"
      data-attempt-id={attemptId}
    >
      <p className="font-bold">Assign {filename} yourself</p>
      <select
        aria-label="Checklist step"
        disabled={busy}
        value={value.itemId}
        onChange={(event) =>
          onChange({ itemId: event.target.value, criterionKey: "" })
        }
        className="mt-2 w-full rounded-lg bg-white p-3 text-slate-950"
      >
        <option value="">Choose checklist step</option>
        {items.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.ordinal}. {entry.title}
          </option>
        ))}
      </select>
      <select
        aria-label="Visible criterion"
        disabled={busy || !item}
        value={value.criterionKey}
        onChange={(event) =>
          onChange({ ...value, criterionKey: event.target.value })
        }
        className="mt-2 w-full rounded-lg bg-white p-3 text-slate-950"
      >
        <option value="">Choose visible item</option>
        {criteria.map((criterion) => (
          <option key={criterion.key} value={criterion.key}>
            {criterion.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy || !value.itemId || !value.criterionKey}
        onClick={onSave}
        className="mt-2 w-full rounded-lg bg-amber-400 p-3 font-bold text-slate-950 disabled:opacity-50"
      >
        Save corrected assignment
      </button>
    </div>
  );
}

function latestReview(reviews: InboxReview[], attemptId: string) {
  return reviews
    .filter((review) => review.intake_attempt_id === attemptId)
    .sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    )
    .at(-1);
}

async function fileSha256(file: File) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function requestJson(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as Record<string, unknown>;
  if (!response.ok || result.success !== true)
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : `Request failed (${String(result.resultCode ?? response.status)}).`,
    );
  return result;
}

function uploadFile(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    request.open("PUT", url);
    request.setRequestHeader("x-upsert", "false");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error("Private upload failed."));
    request.onabort = () => reject(new Error("Private upload was canceled."));
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error("Private upload failed."));
    request.send(body);
  });
}
