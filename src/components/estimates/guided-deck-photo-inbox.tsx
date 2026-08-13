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
  state: "pending" | "confirmed" | "documented_follow_up";
  observation: { notes?: string };
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
  batches: { id: string; member_count: number; created_at: string }[];
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
const OPTIONAL_JOBSITE_ITEM_KEYS = new Set([
  "access_demolition",
  "utilities_obstructions",
]);

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
  const [reviewNotice, setReviewNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [missingPhotoSelections, setMissingPhotoSelections] = useState<
    Record<string, string[]>
  >({});
  const [optionalJobsiteDrafts, setOptionalJobsiteDrafts] = useState<
    Record<
      string,
      {
        attemptIds: string[];
        note: string;
        disposition: "open" | "saved" | "skipped";
      }
    >
  >({});
  const [screen, setScreen] = useState<"upload" | "review" | "correct">(
    "review",
  );
  const [activeReviewItemId, setActiveReviewItemId] = useState<string | null>(
    null,
  );
  const [summaryProgress, setSummaryProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
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

  useEffect(() => {
    if (!activeReviewItemId && data?.items[0])
      setActiveReviewItemId(data.items[0].id);
  }, [activeReviewItemId, data]);
  useEffect(() => {
    if (!data?.items.length) return;
    setOptionalJobsiteDrafts((current) => {
      const next = { ...current };
      for (const item of data.items) {
        if (
          !OPTIONAL_JOBSITE_ITEM_KEYS.has(item.itemKey) ||
          next[item.id]?.disposition === "open"
        )
          continue;
        const note =
          typeof item.observation?.notes === "string"
            ? item.observation.notes
            : "";
        next[item.id] = {
          attemptIds: next[item.id]?.attemptIds ?? [],
          note,
          disposition:
            item.state === "confirmed"
              ? note
                ? "saved"
                : "skipped"
              : "open",
        };
      }
      return next;
    });
  }, [data?.items]);

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
    setReviewNotice("");
    const queue = [...drafts].sort(
      (a, b) =>
        (a.ordinal ?? Number.MAX_SAFE_INTEGER) -
        (b.ordinal ?? Number.MAX_SAFE_INTEGER),
    );
    const successes = new Set<string>();
    let nextRevision = revision;
    let attemptToAbandon: string | null = null;
    let reviewFailures = 0;
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
          try {
            await requestJson(
              `/api/guided-site-visits/${visitId}/intake-photos/${reserved.attemptId}/classification-reviews`,
              {
                idempotencyKey: `guided-visit-inbox-classification:${reserved.attemptId}:initial`,
              },
            );
          } catch {
            reviewFailures += 1;
          }
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
      if (reviewFailures > 0) {
        setReviewNotice(
          `${reviewFailures} ${reviewFailures === 1 ? "photo was" : "photos were"} uploaded safely, but the AI review needs to be retried. The remaining uploads continued.`,
        );
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
      if (successes.size > 0) setScreen("review");
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

  function toggleMissingPhoto(summaryKey: string, attemptId: string) {
    setMissingPhotoSelections((current) => {
      const selected = new Set(current[summaryKey] ?? []);
      if (selected.has(attemptId)) selected.delete(attemptId);
      else selected.add(attemptId);
      return { ...current, [summaryKey]: [...selected] };
    });
  }

  function updateOptionalJobsiteDraft(
    itemId: string,
    update: (current: {
      attemptIds: string[];
      note: string;
      disposition: "open" | "saved" | "skipped";
    }) => {
      attemptIds: string[];
      note: string;
      disposition: "open" | "saved" | "skipped";
    },
  ) {
    setOptionalJobsiteDrafts((current) => ({
      ...current,
      [itemId]: update(
        current[itemId] ?? {
          attemptIds: [],
          note: "",
          disposition: "open",
        },
      ),
    }));
  }

  function toggleOptionalJobsitePhoto(itemId: string, attemptId: string) {
    updateOptionalJobsiteDraft(itemId, (current) => {
      const attemptIds = new Set(current.attemptIds);
      if (attemptIds.has(attemptId)) attemptIds.delete(attemptId);
      else attemptIds.add(attemptId);
      return { ...current, attemptIds: [...attemptIds], disposition: "open" };
    });
  }

  async function completeOptionalJobsiteItem(
    itemId: string,
    disposition: "saved" | "skipped",
  ) {
    if (busy) return;
    const draft = optionalJobsiteDrafts[itemId] ?? {
      attemptIds: [],
      note: "",
      disposition: "open" as const,
    };
    setBusy(true);
    setError("");
    setReviewNotice("");
    try {
      const response = await fetch(
        `/api/guided-site-visits/${visitId}/items/${itemId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: revision,
            action: "complete_optional",
            followUpNotes: disposition === "saved" ? draft.note : "",
          }),
        },
      );
      const result = (await response.json()) as {
        error?: string;
        nextRevision?: number;
      };
      if (!response.ok || typeof result.nextRevision !== "number")
        throw new Error(result.error ?? "Optional note could not be saved.");
      setRevision(result.nextRevision);
      updateOptionalJobsiteDraft(itemId, (current) => ({
        ...current,
        ...(disposition === "skipped" ? { attemptIds: [], note: "" } : {}),
        disposition,
      }));
      setReviewNotice(
        disposition === "skipped"
          ? "Optional jobsite item skipped and saved."
          : "Optional jobsite note saved with the visit.",
      );
      await loadInbox();
      await onVisitChanged();
      const itemIndex = optionalJobsiteItems.findIndex(
        (item) => item.id === itemId,
      );
      const nextItem = optionalJobsiteItems[itemIndex + 1];
      document
        .getElementById(`optional-jobsite:${itemId}`)
        ?.removeAttribute("open");
      if (nextItem)
        requestAnimationFrame(() => {
          const nextDetails = document.getElementById(
            `optional-jobsite:${nextItem.id}`,
          );
          nextDetails?.setAttribute("open", "");
          nextDetails?.querySelector("summary")?.focus();
        });
      else onUseGuided();
    } catch (cause) {
      await loadInbox().catch(() => undefined);
      setError(
        cause instanceof Error
          ? cause.message
          : "Optional note could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function recheckMissingPhotos(
    summaryKey: string,
    itemId: string,
    criterionKey: string,
  ) {
    const attemptIds = missingPhotoSelections[summaryKey] ?? [];
    if (busy || !attemptIds.length) return;
    setBusy(true);
    setError("");
    try {
      for (const attemptId of attemptIds) {
        await requestJson(
          `/api/guided-site-visits/${visitId}/intake-photos/${attemptId}/classification-reviews`,
          {
            idempotencyKey: `guided-visit-focused-review:${attemptId}:${itemId}:${criterionKey}:${crypto.randomUUID()}`,
            focusItemId: itemId,
            focusCriterionKey: criterionKey,
          },
        );
      }
      setMissingPhotoSelections((current) => ({
        ...current,
        [summaryKey]: [],
      }));
      await loadInbox();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Selected photos could not be reviewed again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function attachMissingPhotos(
    summaryKey: string,
    itemId: string,
    criterionKey: string,
  ) {
    const attemptIds = missingPhotoSelections[summaryKey] ?? [];
    if (busy || !attemptIds.length) return;
    setBusy(true);
    setError("");
    let nextRevision = revision;
    const successfulAttemptIds = new Set<string>();
    try {
      for (const attemptId of attemptIds) {
        const review = latestReview(data?.reviews ?? [], attemptId);
        if (!review || review.diagnostic_class !== "classified")
          throw new Error(
            "Only a successfully reviewed photo can be attached.",
          );
        const effectiveLeaf = effectiveAssignments.find(
          (assignment) =>
            assignment.intake_attempt_id === attemptId &&
            assignment.visit_item_id === itemId &&
            assignment.criterion_key === criterionKey,
        );
        if (
          effectiveLeaf &&
          ["accepted", "corrected"].includes(effectiveLeaf.decision)
        ) {
          successfulAttemptIds.add(attemptId);
          continue;
        }
        const result = await requestJson(
          `/api/guided-site-visits/${visitId}/intake-photos/${attemptId}/assignment-events`,
          {
            expectedRevision: nextRevision,
            idempotencyKey: `guided-inbox-manual-evidence:${attemptId}:${itemId}:${criterionKey}:${crypto.randomUUID()}`,
            reviewId: review.id,
            visitItemId: itemId,
            criterionKey,
            decision: "corrected",
            supersedesEventId: effectiveLeaf?.id ?? null,
          },
        );
        if (typeof result.nextRevision !== "number")
          throw new Error("The photo attachment was incomplete.");
        nextRevision = result.nextRevision;
        successfulAttemptIds.add(attemptId);
      }
      setRevision(nextRevision);
      setMissingPhotoSelections((current) => ({
        ...current,
        [summaryKey]: (current[summaryKey] ?? []).filter(
          (attemptId) => !successfulAttemptIds.has(attemptId),
        ),
      }));
      setReviewNotice(
        `${successfulAttemptIds.size} ${successfulAttemptIds.size === 1 ? "photo was" : "photos were"} attached as verified evidence.`,
      );
      await loadInbox();
      await onVisitChanged();
    } catch (cause) {
      setRevision(nextRevision);
      setMissingPhotoSelections((current) => ({
        ...current,
        [summaryKey]: (current[summaryKey] ?? []).filter(
          (attemptId) => !successfulAttemptIds.has(attemptId),
        ),
      }));
      await loadInbox().catch(() => undefined);
      setError(
        `${successfulAttemptIds.size ? `${successfulAttemptIds.size} ${successfulAttemptIds.size === 1 ? "photo was" : "photos were"} attached. ` : ""}${cause instanceof Error ? cause.message : "The remaining selected photos could not be attached."}`,
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
  const currentBatch = data?.batches[0];
  const remainingServerMembers = (data?.members ?? []).filter(
    (member) =>
      member.batch_id === currentBatch?.id &&
      !(data?.attempts ?? []).some(
        (attempt) =>
          attempt.batch_id === member.batch_id &&
          attempt.member_ordinal === member.ordinal &&
          attempt.state === "confirmed",
      ),
  );
  const proposalEntries = rows.flatMap(({ attempt, review, member }) =>
    review?.diagnostic_class === "classified"
      ? review.proposals.map((proposal) => ({
          attempt,
          review,
          member,
          proposal,
          decision: effectiveAssignments.find(
            (assignment) =>
              assignment.intake_attempt_id === attempt.id &&
              assignment.visit_item_id === proposal.visitItemId &&
              assignment.criterion_key === proposal.criterionKey,
          ),
        }))
      : [],
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
  const criterionSummaries = (data?.items ?? []).flatMap((item) =>
    (GUIDED_VISIBLE_FACT_CRITERIA[item.itemKey] ?? []).map((criterion) => {
      const key = `${item.id}:${criterion.key}`;
      const candidates = proposalEntries.filter(
        (entry) =>
          entry.proposal.visitItemId === item.id &&
          entry.proposal.criterionKey === criterion.key,
      );
      const undecided = candidates.filter((entry) => !entry.decision);
      return {
        item,
        criterion,
        key,
        candidates,
        undecided,
        verified: verifiedCoverage.has(key),
      };
    }),
  );
  const requiredItems = (data?.items ?? []).filter(
    (item) => !OPTIONAL_JOBSITE_ITEM_KEYS.has(item.itemKey),
  );
  const optionalJobsiteItems = (data?.items ?? []).filter((item) =>
    OPTIONAL_JOBSITE_ITEM_KEYS.has(item.itemKey),
  );
  const requiredCriterionSummaries = criterionSummaries.filter(
    (summary) => !OPTIONAL_JOBSITE_ITEM_KEYS.has(summary.item.itemKey),
  );
  const activeReviewItem =
    requiredItems.find((item) => item.id === activeReviewItemId) ??
    requiredItems[0];
  const activeReviewSummaries = requiredCriterionSummaries.filter(
    (summary) => summary.item.id === activeReviewItem?.id,
  );
  const activeReviewIndex = Math.max(
    0,
    requiredItems.findIndex((item) => item.id === activeReviewItem?.id),
  );
  const suggestedConfirmations = requiredCriterionSummaries.flatMap(
    (summary) =>
      summary.verified || !summary.undecided.length
        ? []
        : [summary.undecided[0]],
  );
  const unresolvedCoverage = requiredCriterionSummaries.filter(
    (summary) => !summary.verified && summary.undecided.length > 0,
  );
  const photoReviewReady =
    rows.length > 0 &&
    remainingServerMembers.length === 0 &&
    drafts.length === 0 &&
    pendingReviewCount === 0 &&
    unavailableRows.length === 0;
  const aiMissing = requiredCriterionSummaries.filter(
    (summary) => !summary.verified && summary.undecided.length === 0,
  );
  const reviewComplete =
    rows.length > 0 &&
    remainingServerMembers.length === 0 &&
    drafts.length === 0 &&
    pendingReviewCount === 0 &&
    unavailableRows.length === 0 &&
    unresolvedCoverage.length === 0;
  const missing = requiredItems.flatMap((item) =>
    (GUIDED_VISIBLE_FACT_CRITERIA[item.itemKey] ?? []).flatMap((criterion) =>
      verifiedCoverage.has(`${item.id}:${criterion.key}`)
        ? []
        : [{ item, criterionKey: criterion.key, label: criterion.label }],
    ),
  );

  async function confirmPhotoSummary() {
    if (busy || !suggestedConfirmations.length) return;
    setBusy(true);
    setError("");
    let nextRevision = revision;
    try {
      for (let index = 0; index < suggestedConfirmations.length; index += 1) {
        const entry = suggestedConfirmations[index];
        setSummaryProgress({
          current: index + 1,
          total: suggestedConfirmations.length,
        });
        const result = await requestJson(
          `/api/guided-site-visits/${visitId}/intake-photos/${entry.attempt.id}/assignment-events`,
          {
            expectedRevision: nextRevision,
            idempotencyKey: `guided-inbox-summary:${entry.attempt.id}:${entry.proposal.visitItemId}:${entry.proposal.criterionKey}:${crypto.randomUUID()}`,
            reviewId: entry.review.id,
            visitItemId: entry.proposal.visitItemId,
            criterionKey: entry.proposal.criterionKey,
            decision: "accepted",
            supersedesEventId: null,
          },
        );
        if (typeof result.nextRevision !== "number")
          throw new Error("Photo summary confirmation was incomplete.");
        nextRevision = result.nextRevision;
      }
      setRevision(nextRevision);
      await loadInbox();
      await onVisitChanged();
    } catch (cause) {
      setRevision(nextRevision);
      await loadInbox().catch(() => undefined);
      await onVisitChanged().catch(() => undefined);
      setError(
        cause instanceof Error
          ? cause.message
          : "Photo summary could not be confirmed.",
      );
    } finally {
      setSummaryProgress(null);
      setBusy(false);
    }
  }

  if (rows.length && screen === "review")
    return (
      <div className="p-4 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[.16em] text-amber-700">
          Photo review
        </p>
        <h2 className="mt-1 text-2xl font-black text-slate-950">
          What still needs verified photo evidence?
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          This page only shows missing information. Open a photo below when you
          want to see what that picture checked off.
        </p>
        {reviewNotice ? (
          <p
            role="status"
            className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-950"
          >
            {reviewNotice}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-400 bg-red-50 p-3 text-sm font-bold text-red-950"
          >
            {error}
          </p>
        ) : null}
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setScreen("upload")}
            className="min-h-11 rounded-md px-3 py-2 text-sm font-bold text-slate-700"
          >
            Add photos
          </button>
          <button
            type="button"
            className="min-h-11 rounded-md bg-slate-950 px-3 py-2 text-sm font-bold text-white"
          >
            Review results
          </button>
        </div>

        {!photoReviewReady ? (
          <section className="mt-5 rounded-xl border border-amber-400 bg-amber-50 p-4 text-slate-950">
            <h3 className="text-lg font-black">Review is not finished yet</h3>
            <p className="mt-1 text-sm">
              Missing items will appear only after every uploaded photo has a
              usable review. Nothing is being called missing early.
            </p>
            {pendingReviewCount ? (
              <p className="mt-3 font-bold">
                {pendingReviewCount}{" "}
                {pendingReviewCount === 1 ? "photo is" : "photos are"} still
                being reviewed.
              </p>
            ) : null}
            {remainingServerMembers.length ? (
              <p className="mt-3 font-bold">
                {remainingServerMembers.length} selected{" "}
                {remainingServerMembers.length === 1
                  ? "photo still needs"
                  : "photos still need"}{" "}
                to be uploaded.
              </p>
            ) : null}
            {unavailableRows.length ? (
              <ul className="mt-3 space-y-2">
                {unavailableRows.map((row) => (
                  <li key={row.attempt.id} className="rounded-lg bg-white p-3">
                    <strong>
                      {row.member?.original_filename ??
                        `Photo ${row.attempt.member_ordinal}`}
                    </strong>
                    <button
                      type="button"
                      disabled={
                        busy ||
                        row.review?.diagnostic_class === "unsupported_media"
                      }
                      onClick={() => void retryClassification(row.attempt.id)}
                      className="mt-2 block font-bold text-blue-800 underline disabled:opacity-40"
                    >
                      Retry AI review
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
        <section className="mt-5 rounded-xl bg-slate-950 p-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-black">
                {photoReviewReady
                  ? "Still needs verified evidence"
                  : "Not yet verified in completed reviews"}
              </h3>
              <p className="mt-1 text-sm text-slate-300">
                {photoReviewReady
                  ? "No reviewed photo is currently verified for these items. An AI suggestion you excluded can also appear here."
                  : "You can attach a reviewed photo now. This list may shrink after the remaining AI review finishes."}
              </p>
            </div>
            <span className="rounded-full bg-amber-400 px-3 py-1 text-sm font-black text-slate-950">
              {aiMissing.length}
            </span>
          </div>
          {aiMissing.length ? (
            <ul className="mt-4 space-y-2">
              {aiMissing.map((summary) => (
                <li key={`missing:${summary.key}`}>
                  <details className="group rounded-lg bg-slate-800 p-3">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                      <span>
                        {summary.item.title}: {summary.criterion.label}
                      </span>
                      <span
                        aria-hidden="true"
                        className="shrink-0 transition-transform group-open:rotate-180"
                      >
                        ▾
                      </span>
                    </summary>
                    <div className="mt-3 border-t border-slate-600 pt-3">
                      <p className="text-sm font-bold text-white">
                        Select the photo or photos that show this item
                      </p>
                      <p className="mt-1 text-xs text-slate-300">
                        Then ask AI to check them again, or attach them as
                        evidence based on your own field verification.
                      </p>
                      {summary.criterion.guidance ? (
                        <p className="mt-3 rounded-lg bg-amber-950 p-3 text-sm leading-6 text-amber-100">
                          <strong>What this check means: </strong>
                          {summary.criterion.guidance}
                        </p>
                      ) : null}
                      <ul className="mt-3 grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                        {rows
                          .filter(
                            (row) =>
                              row.review?.diagnostic_class === "classified",
                          )
                          .map((row) => {
                            const selected = (
                              missingPhotoSelections[summary.key] ?? []
                            ).includes(row.attempt.id);
                            const filename =
                              row.member?.original_filename ??
                              `Photo ${row.attempt.member_ordinal}`;
                            return (
                              <li key={`${summary.key}:${row.attempt.id}`}>
                                <label
                                  className={`block cursor-pointer overflow-hidden rounded-lg border-2 focus-within:ring-2 focus-within:ring-amber-300 focus-within:ring-offset-2 focus-within:ring-offset-slate-800 ${selected ? "border-emerald-400 bg-emerald-950" : "border-slate-600 bg-slate-900"}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    disabled={busy}
                                    onChange={() =>
                                      toggleMissingPhoto(
                                        summary.key,
                                        row.attempt.id,
                                      )
                                    }
                                    className="sr-only"
                                  />
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={`/api/guided-site-visits/${visitId}/intake-photos/${row.attempt.id}/preview`}
                                    alt={filename}
                                    className="h-24 w-full bg-slate-700 object-cover"
                                  />
                                  <span className="flex min-h-11 items-center justify-between gap-2 px-2 py-1 text-xs font-bold">
                                    <span className="truncate">{filename}</span>
                                    <span>{selected ? "✓" : "Select"}</span>
                                  </span>
                                </label>
                              </li>
                            );
                          })}
                      </ul>
                      <p className="mt-3 text-sm font-bold text-slate-200">
                        {(missingPhotoSelections[summary.key] ?? []).length}{" "}
                        selected
                      </p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          disabled={
                            busy ||
                            !(missingPhotoSelections[summary.key] ?? []).length
                          }
                          onClick={() =>
                            void recheckMissingPhotos(
                              summary.key,
                              summary.item.id,
                              summary.criterion.key,
                            )
                          }
                          className="min-h-11 rounded-lg bg-blue-500 px-3 py-2 font-bold text-white disabled:opacity-40"
                        >
                          Ask AI to check selected photos again
                        </button>
                        <button
                          type="button"
                          disabled={
                            busy ||
                            !(missingPhotoSelections[summary.key] ?? []).length
                          }
                          onClick={() =>
                            void attachMissingPhotos(
                              summary.key,
                              summary.item.id,
                              summary.criterion.key,
                            )
                          }
                          className="min-h-11 rounded-lg bg-emerald-400 px-3 py-2 font-black text-slate-950 disabled:opacity-40"
                        >
                          Attach as verified evidence
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-slate-300">
                        “Attach as verified” records your decision. It does not
                        claim a measurement, code, or engineering result.
                      </p>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-lg bg-emerald-950 p-3 font-bold text-emerald-200">
              Every checklist item has human-verified photo evidence.
            </p>
          )}
        </section>

        {optionalJobsiteItems.length ? (
          <section className="mt-5 rounded-xl border border-slate-300 bg-slate-50 p-4 text-slate-950">
            <h3 className="text-lg font-black">Optional jobsite notes</h3>
            <p className="mt-1 text-sm text-slate-700">
              Access, demolition, utilities, and obstructions do not block this
              photo review. Add anything useful for planning, or skip them.
            </p>
            <p className="mt-2 rounded-lg bg-blue-50 p-2 text-xs font-semibold text-blue-950">
              The note or Skip choice is saved with the visit. Selected photos
              stay in the visit gallery, but are only visual references here and
              are not attached to the note.
            </p>
            <div className="mt-3 space-y-3">
              {optionalJobsiteItems.map((item, itemIndex) => {
                const draft = optionalJobsiteDrafts[item.id] ?? {
                  attemptIds: [],
                  note: "",
                  disposition: "open" as const,
                };
                return (
                  <details
                    id={`optional-jobsite:${item.id}`}
                    key={`optional-jobsite:${item.id}`}
                    className="group rounded-lg border border-slate-300 bg-white p-3"
                  >
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                      <span>{item.title}</span>
                      <span className="flex items-center gap-2">
                        {draft.disposition === "saved"
                          ? "Note saved"
                          : draft.disposition === "skipped"
                            ? "Skipped"
                            : "Optional"}
                        <span
                          aria-hidden="true"
                          className="transition-transform group-open:rotate-180"
                        >
                          ▾
                        </span>
                      </span>
                    </summary>
                    <div className="mt-3 border-t border-slate-200 pt-3">
                      <p className="text-sm font-bold">
                        Select any existing photos that help explain this note
                      </p>
                      <ul className="mt-2 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4">
                        {rows.map((row) => {
                          const selected = draft.attemptIds.includes(
                            row.attempt.id,
                          );
                          const filename =
                            row.member?.original_filename ??
                            `Photo ${row.attempt.member_ordinal}`;
                          return (
                            <li key={`${item.id}:${row.attempt.id}`}>
                              <label
                                className={`block cursor-pointer overflow-hidden rounded-lg border-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 ${selected ? "border-blue-600 bg-blue-50" : "border-slate-300 bg-white"}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  disabled={busy}
                                  onChange={() =>
                                    toggleOptionalJobsitePhoto(
                                      item.id,
                                      row.attempt.id,
                                    )
                                  }
                                  className="sr-only"
                                />
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={`/api/guided-site-visits/${visitId}/intake-photos/${row.attempt.id}/preview`}
                                  alt={filename}
                                  className="h-20 w-full bg-slate-200 object-cover"
                                />
                                <span className="flex min-h-11 items-center justify-between gap-1 px-2 py-1 text-xs font-bold">
                                  <span className="truncate">{filename}</span>
                                  <span>{selected ? "✓" : "Select"}</span>
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                      <label
                        htmlFor={`optional-jobsite-note:${item.id}`}
                        className="mt-3 block text-sm font-bold"
                      >
                        Optional note
                      </label>
                      <textarea
                        id={`optional-jobsite-note:${item.id}`}
                        value={draft.note}
                        rows={3}
                        maxLength={2000}
                        disabled={busy}
                        placeholder="Add a short field note, if useful."
                        onChange={(event) =>
                          updateOptionalJobsiteDraft(item.id, (current) => ({
                            ...current,
                            note: event.target.value,
                            disposition: "open",
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-400 bg-white p-3 text-base"
                      />
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void completeOptionalJobsiteItem(item.id, "skipped")
                          }
                          className="min-h-11 rounded-lg border border-slate-400 px-3 py-2 font-bold disabled:opacity-40"
                        >
                          {itemIndex === optionalJobsiteItems.length - 1
                            ? "Skip and finish"
                            : "Skip and continue"}
                        </button>
                        <button
                          type="button"
                          disabled={busy || !draft.note.trim()}
                          onClick={() =>
                            void completeOptionalJobsiteItem(item.id, "saved")
                          }
                          className="min-h-11 rounded-lg bg-blue-600 px-3 py-2 font-bold text-white disabled:opacity-40"
                        >
                          {itemIndex === optionalJobsiteItems.length - 1
                            ? "Save note and finish"
                            : "Save note and continue"}
                        </button>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="mt-5">
          <h3 className="text-xl font-black text-slate-950">Your photos</h3>
          <p className="mt-1 text-sm text-slate-700">
            Open any picture to see only the checklist criteria it matched.
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {rows.map((row) => {
              const proposedMatches = proposalEntries.filter(
                (entry) =>
                  entry.attempt.id === row.attempt.id &&
                  entry.decision?.decision !== "excluded",
              );
              const assignmentMatches = effectiveAssignments
                .filter(
                  (assignment) =>
                    assignment.intake_attempt_id === row.attempt.id &&
                    ["accepted", "corrected"].includes(assignment.decision) &&
                    !proposedMatches.some(
                      (entry) =>
                        entry.proposal.visitItemId ===
                          assignment.visit_item_id &&
                        entry.proposal.criterionKey ===
                          assignment.criterion_key,
                    ),
                )
                .map((assignment) => ({
                  attempt: row.attempt,
                  review: row.review!,
                  member: row.member,
                  proposal: {
                    visitItemId: assignment.visit_item_id,
                    criterionKey: assignment.criterion_key,
                  },
                  decision: assignment,
                }));
              const matches = [...proposedMatches, ...assignmentMatches];
              return (
                <li key={`photo-result:${row.attempt.id}`}>
                  <details className="group overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
                    <summary className="cursor-pointer list-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/guided-site-visits/${visitId}/intake-photos/${row.attempt.id}/preview`}
                        alt={
                          row.member?.original_filename ??
                          `Jobsite photo ${row.attempt.member_ordinal}`
                        }
                        className="h-44 w-full bg-slate-200 object-cover"
                      />
                      <span className="flex min-h-12 items-center justify-between gap-3 px-3 py-2 font-bold text-slate-950">
                        <span className="truncate">
                          {row.member?.original_filename ??
                            `Photo ${row.attempt.member_ordinal}`}
                        </span>
                        <span className="shrink-0 text-sm text-blue-800">
                          {row.review?.diagnostic_class === "classified"
                            ? `${matches.length} checked`
                            : "Needs review"}{" "}
                          ▾
                        </span>
                      </span>
                    </summary>
                    <div className="border-t border-slate-200 p-3 text-sm text-slate-800">
                      {row.review?.diagnostic_class !== "classified" ? (
                        <p className="font-bold text-amber-800">
                          AI could not reliably check this photo.
                        </p>
                      ) : matches.length ? (
                        <ul className="space-y-2">
                          {matches.map((entry) => {
                            const item = data?.items.find(
                              (candidate) =>
                                candidate.id === entry.proposal.visitItemId,
                            );
                            const criterion = (
                              GUIDED_VISIBLE_FACT_CRITERIA[
                                item?.itemKey ?? ""
                              ] ?? []
                            ).find(
                              (candidate) =>
                                candidate.key === entry.proposal.criterionKey,
                            );
                            return (
                              <li
                                key={`${row.attempt.id}:${entry.proposal.visitItemId}:${entry.proposal.criterionKey}`}
                                className="rounded-lg bg-slate-100 p-2"
                              >
                                <strong>
                                  {criterion?.label ??
                                    entry.proposal.criterionKey}
                                </strong>
                                <span className="mt-1 block text-xs text-slate-600">
                                  {item?.title ?? "Deck checklist"} ·{" "}
                                  {entry.decision ? "Confirmed" : "AI found"}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p>No checklist criteria were found in this photo.</p>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>

        {suggestedConfirmations.length ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirmPhotoSummary()}
            className="mt-5 w-full rounded-lg bg-emerald-500 px-4 py-3 font-black text-slate-950 disabled:opacity-50"
          >
            {summaryProgress
              ? `Confirming ${summaryProgress.current} of ${summaryProgress.total}…`
              : `Confirm ${suggestedConfirmations.length} AI photo matches`}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setScreen("correct")}
          className="mt-3 w-full rounded-lg border border-slate-400 bg-white px-4 py-3 font-bold text-slate-900"
        >
          Open detailed correction tools
        </button>
        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-400 bg-red-950 p-3 text-sm font-bold text-red-100"
          >
            {error}
          </p>
        ) : null}
      </div>
    );

  return (
    <div className="p-4 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[.16em] text-amber-700">
        {screen === "correct" && rows.length
          ? "Detailed photo corrections"
          : "Photo upload"}
      </p>
      <h2 className="mt-1 text-2xl font-black text-slate-950">
        {screen === "correct" && rows.length
          ? "Fix an AI photo match"
          : "Choose your jobsite photos once"}
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-700">
        {screen === "correct" && rows.length
          ? "Use this only when a photo was matched to the wrong checklist item."
          : "Select up to 30 photos. The app uploads them privately, checks them, and then opens a separate review screen."}
      </p>
      {rows.length ? (
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setScreen("upload")}
            className={`min-h-11 rounded-md px-3 py-2 text-sm font-bold ${screen === "upload" ? "bg-slate-950 text-white" : "text-slate-700"}`}
          >
            Add photos
          </button>
          <button
            type="button"
            onClick={() => setScreen("review")}
            className="min-h-11 rounded-md px-3 py-2 text-sm font-bold text-slate-700"
          >
            Review results
          </button>
        </div>
      ) : null}
      {screen === "upload" || !rows.length ? (
        <>
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
          {reviewNotice ? (
            <p
              role="status"
              className="mt-3 rounded-lg border border-amber-500 bg-amber-950 p-3 text-sm font-bold text-amber-100"
            >
              {reviewNotice}
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
        </>
      ) : null}
      {rows.length && screen === "correct" ? (
        <section className="mt-5 rounded-xl bg-slate-950 p-4 text-white">
          <h3 className="text-xl font-black">Site visit photo summary</h3>
          <p className="mt-1 text-sm text-slate-300">
            AI reviewed {rows.length} {rows.length === 1 ? "photo" : "photos"}.
            Review one section at a time. Tap any line for the explanation.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-emerald-950 p-2">
              <strong className="block text-lg text-emerald-300">
                {
                  requiredCriterionSummaries.filter(
                    (summary) =>
                      summary.verified || summary.undecided.length > 0,
                  ).length
                }
              </strong>
              Found
            </div>
            <div className="rounded-lg bg-amber-950 p-2">
              <strong className="block text-lg text-amber-200">
                {pendingReviewCount || unavailableRows.length
                  ? "—"
                  : requiredCriterionSummaries.filter(
                      (summary) =>
                        !summary.verified && !summary.undecided.length,
                    ).length}
              </strong>
              Not found
            </div>
            <div className="rounded-lg bg-slate-800 p-2">
              <strong className="block text-lg text-slate-200">
                {pendingReviewCount + unavailableRows.length}
              </strong>
              Couldn&apos;t review
            </div>
          </div>
          <label
            className="mt-4 block text-sm font-bold"
            htmlFor="review-section"
          >
            Section {activeReviewIndex + 1} of {requiredItems.length}
          </label>
          <select
            id="review-section"
            value={activeReviewItem?.id ?? ""}
            onChange={(event) => setActiveReviewItemId(event.target.value)}
            className="mt-1 min-h-12 w-full rounded-lg border border-slate-500 bg-white px-3 text-base font-bold text-slate-950"
          >
            {requiredItems.map((item) => {
              const summaries = requiredCriterionSummaries.filter(
                (summary) => summary.item.id === item.id,
              );
              const found = summaries.filter(
                (summary) => summary.verified || summary.undecided.length > 0,
              ).length;
              return (
                <option key={item.id} value={item.id}>
                  {item.ordinal}. {item.title} · {found}/{summaries.length}{" "}
                  found
                </option>
              );
            })}
          </select>
          <div className="mt-4 space-y-3">
            {(activeReviewItem ? [activeReviewItem] : []).map((item) => {
              const summaries = activeReviewSummaries;
              const confirmed = summaries.filter(
                (summary) => summary.verified,
              ).length;
              const found = summaries.filter(
                (summary) => !summary.verified && summary.undecided.length > 0,
              ).length;
              return (
                <div
                  key={`summary:${item.id}`}
                  className="rounded-lg border border-slate-700 bg-slate-900 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="font-bold">
                      {item.ordinal}. {item.title}
                    </h4>
                    <span className="shrink-0 text-xs font-bold text-slate-300">
                      {confirmed + found}/{summaries.length} found
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {summaries.map((summary) => {
                      const photoCount = new Set(
                        summary.undecided.map(
                          (candidate) => candidate.attempt.id,
                        ),
                      ).size;
                      const allExcluded =
                        summary.candidates.length > 0 &&
                        summary.candidates.every(
                          (candidate) =>
                            candidate.decision?.decision === "excluded",
                        );
                      const confirmedPhotoFiles = [
                        ...new Set(
                          effectiveAssignments
                            .filter(
                              (assignment) =>
                                assignment.visit_item_id === item.id &&
                                assignment.criterion_key ===
                                  summary.criterion.key &&
                                ["accepted", "corrected"].includes(
                                  assignment.decision,
                                ),
                            )
                            .map((assignment) => {
                              const row = rows.find(
                                (candidate) =>
                                  candidate.attempt.id ===
                                  assignment.intake_attempt_id,
                              );
                              return (
                                row?.member?.original_filename ??
                                (row
                                  ? `Photo ${row.attempt.member_ordinal}`
                                  : null)
                              );
                            })
                            .filter((filename): filename is string =>
                              Boolean(filename),
                            ),
                        ),
                      ];
                      const suggestedPhotoFiles = [
                        ...new Set(
                          summary.undecided.map(
                            (candidate) =>
                              candidate.member?.original_filename ??
                              `Photo ${candidate.attempt.member_ordinal}`,
                          ),
                        ),
                      ];
                      const excludedPhotoFiles = [
                        ...new Set(
                          summary.candidates
                            .filter(
                              (candidate) =>
                                candidate.decision?.decision === "excluded",
                            )
                            .map(
                              (candidate) =>
                                candidate.member?.original_filename ??
                                `Photo ${candidate.attempt.member_ordinal}`,
                            ),
                        ),
                      ];
                      const status = summary.verified
                        ? "Confirmed"
                        : summary.undecided.length
                          ? `AI found · ${photoCount} ${photoCount === 1 ? "photo" : "photos"}`
                          : allExcluded
                            ? "Excluded"
                            : pendingReviewCount || unavailableRows.length
                              ? "Not found yet"
                              : "Missing";
                      return (
                        <li key={summary.key}>
                          <details className="group rounded-md bg-slate-800 px-3 py-2">
                            <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
                              <span className="flex w-full items-start justify-between gap-3">
                                <span>{summary.criterion.label}</span>
                                <strong
                                  className={
                                    summary.verified
                                      ? "text-emerald-300"
                                      : summary.undecided.length
                                        ? "text-blue-300"
                                        : "text-amber-300"
                                  }
                                >
                                  {status}
                                  <span
                                    aria-hidden="true"
                                    className="ml-1 inline-block transition-transform group-open:rotate-180"
                                  >
                                    ▾
                                  </span>
                                </strong>
                              </span>
                            </summary>
                            <div className="mt-3 border-t border-slate-600 pt-3 text-sm text-slate-200">
                              {summary.verified ? (
                                <>
                                  <p className="font-bold">
                                    Supporting photo files
                                  </p>
                                  <p className="mt-1">
                                    {confirmedPhotoFiles.join(", ") ||
                                      "Confirmed photo"}
                                  </p>
                                </>
                              ) : summary.undecided.length ? (
                                <>
                                  <p className="font-bold">
                                    AI matched these photo files
                                  </p>
                                  <p className="mt-1">
                                    {suggestedPhotoFiles.join(", ")}
                                  </p>
                                  <p className="mt-2 text-blue-200">
                                    Confirm the summary below if at least one of
                                    these photos clearly shows this item.
                                  </p>
                                </>
                              ) : allExcluded ? (
                                <>
                                  <p className="font-bold text-amber-200">
                                    The proposed photos were excluded
                                  </p>
                                  <p className="mt-1">
                                    {excludedPhotoFiles.join(", ")}
                                  </p>
                                  <p className="mt-2">
                                    {summary.criterion.guidance ?? (
                                      <>
                                        Take a clear photo of “
                                        {summary.criterion.label}.” Center that
                                        item in the photo and include enough of
                                        the deck to show where it is located.
                                      </>
                                    )}
                                  </p>
                                </>
                              ) : pendingReviewCount ? (
                                <>
                                  <p className="font-bold text-blue-200">
                                    Review still in progress
                                  </p>
                                  <p className="mt-1">
                                    AI has not finished checking every uploaded
                                    photo, so there is no missing-photo
                                    conclusion yet.
                                  </p>
                                </>
                              ) : unavailableRows.length ? (
                                <>
                                  <p className="font-bold text-amber-200">
                                    Some photos could not be reviewed
                                  </p>
                                  <p className="mt-1">
                                    Retry the unavailable AI review before
                                    treating this item as missing.
                                  </p>
                                </>
                              ) : (
                                <>
                                  <p className="font-bold text-amber-200">
                                    What is missing
                                  </p>
                                  <p className="mt-1">
                                    No uploaded photo clearly showed “
                                    {summary.criterion.label}.”
                                  </p>
                                  <p className="mt-2">
                                    {summary.criterion.guidance ?? (
                                      <>
                                        Take a clear photo of “
                                        {summary.criterion.label}.” Center that
                                        item in the photo and include enough of
                                        the deck to show where it is located. If
                                        a close photo loses context, also take
                                        one wider photo.
                                      </>
                                    )}
                                  </p>
                                </>
                              )}
                            </div>
                          </details>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={activeReviewIndex === 0}
              onClick={() => {
                const previous = requiredItems[activeReviewIndex - 1];
                if (previous) setActiveReviewItemId(previous.id);
              }}
              className="min-h-11 rounded-lg border border-slate-500 px-3 py-2 font-bold disabled:opacity-30"
            >
              Previous section
            </button>
            <button
              type="button"
              disabled={activeReviewIndex >= requiredItems.length - 1}
              onClick={() => {
                const next = requiredItems[activeReviewIndex + 1];
                if (next) setActiveReviewItemId(next.id);
              }}
              className="min-h-11 rounded-lg bg-blue-500 px-3 py-2 font-bold text-white disabled:opacity-30"
            >
              Next section
            </button>
          </div>
          {suggestedConfirmations.length ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirmPhotoSummary()}
              className="mt-4 w-full rounded-lg bg-emerald-400 px-4 py-3 font-black text-slate-950 disabled:opacity-50"
            >
              {summaryProgress
                ? `Confirming ${summaryProgress.current} of ${summaryProgress.total}…`
                : `Approve all ${suggestedConfirmations.length} items marked Found`}
            </button>
          ) : null}
          <p className="mt-2 text-xs text-slate-400">
            This only confirms which photos support the checklist. It does not
            approve measurements, pricing, engineering, or construction
            decisions.
          </p>
          <details className="mt-4 rounded-lg border border-slate-700 bg-slate-900 p-3">
            <summary className="cursor-pointer font-bold">
              Something looks wrong in this section?
            </summary>
            <div className="mt-4 space-y-4">
              {(activeReviewItem ? [activeReviewItem] : []).map((item) => {
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
                      {proposals.map(
                        ({ attempt, review, member, proposal }) => {
                          const correctionKey = `${attempt.id}:${proposal.visitItemId}:${proposal.criterionKey}`;
                          const decided = effectiveAssignments.find(
                            (assignment) =>
                              assignment.intake_attempt_id === attempt.id &&
                              assignment.visit_item_id ===
                                proposal.visitItemId &&
                              assignment.criterion_key ===
                                proposal.criterionKey,
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
                                        [correctionKey]: value[
                                          correctionKey
                                        ] ?? {
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
                        },
                      )}
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
                  onSave={() =>
                    void correctAssignment(correctionKey, correction)
                  }
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
          </details>
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
              {remainingServerMembers.length > 0
                ? `Upload the remaining ${remainingServerMembers.length} ${remainingServerMembers.length === 1 ? "photo" : "photos"} before the consolidated missing list is calculated.`
                : "The missing list appears only after every photo review is terminal and every proposal has a human decision."}
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
        {screen === "correct" && rows.length
          ? "Switch to guided retakes"
          : "Use guided checklist capture instead"}
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
