"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GUIDED_VISIBLE_FACT_CRITERIA,
  type NextCaptureAction,
  type VisibleFactStatus,
} from "@/lib/guided-site-visits/visible-fact-criteria";
import {
  GUIDED_PHOTO_MAX_BYTES,
  GUIDED_PHOTO_MIME_TYPES,
} from "@/lib/guided-site-visits/core";

type Requirement = {
  mode: "photo_only" | "required_measurements" | "conditional";
  fields?: string[];
  when?: string;
  otherwise?: string;
};
type VisitItem = {
  id: string;
  itemKey: string;
  ordinal: number;
  title: string;
  instructions: string;
  requirement: Requirement;
  state: "pending" | "confirmed" | "documented_follow_up";
  observation: Record<string, unknown>;
  followUpReasonCode: string | null;
  followUpNotes: string | null;
};
type UsabilityVerdict = "usable" | "retake_recommended" | "unable_to_assess";
type UsabilityReview = {
  id: string;
  verdict: UsabilityVerdict;
  issueCodes: string[];
  createdAt: string;
};
type VisibleCriterion = { criterionKey: string; status: VisibleFactStatus };
type VisibleFactReview = {
  id: string;
  sourceMode: "ai" | "manual";
  criteria: VisibleCriterion[];
  recommendedNextCapture: {
    criterionKey: string;
    actionCode: NextCaptureAction;
  } | null;
  createdAt: string;
};
type PhotoAttempt = {
  id: string;
  visitItemId: string;
  retakeOfAttemptId: string | null;
  ordinal: number;
  state:
    | "upload_pending"
    | "quarantined"
    | "confirmed"
    | "superseded"
    | "failed_validation";
  usabilityReviews: UsabilityReview[];
  visibleFactReviews: VisibleFactReview[];
};
type Visit = {
  id: string;
  revision: number;
  status: "in_progress" | "completed";
  completionOutcome: "all_passed" | "documented_with_office_follow_up" | null;
  items: VisitItem[];
  photoAttempts: PhotoAttempt[];
};
type MeasurementDraft = {
  value: string;
  unit: string;
  feet?: string;
  inches?: string;
  components?: string[];
};
type BatchDraftPhoto = {
  id: string;
  file: File;
  url: string;
  status: "ready" | "uploading" | "failed";
  error?: string;
};

const MAX_ACTIVE_PHOTOS = 5;
const MAX_BATCH_BYTES = 60 * 1024 * 1024;

const INCLUDE = Object.fromEntries(
  Object.entries(GUIDED_VISIBLE_FACT_CRITERIA).map(([key, criteria]) => [
    key,
    criteria.map((criterion) => criterion.label),
  ]),
) as Record<string, string[]>;
const FIELD_LABELS: Record<string, string> = {
  length: "Overall deck length",
  width: "Overall deck width",
  height_from_grade: "Height from grade to deck surface",
  ledger_length: "Ledger length",
  joist_spacing: "Visible joist spacing",
  joist_depth: "Visible joist depth",
  beam_depth: "Visible beam depth",
  post_dimensions: "Post dimensions",
  support_spacing: "Support-line spacing",
  exposed_footing_dimensions: "Exposed footing dimensions",
  stair_width: "Stair width",
  total_rise: "Total rise",
  tread_depth: "Tread depth",
  representative_riser: "Representative riser height",
  landing_dimensions: "Landing dimensions",
  guard_height: "Guard height",
  opening: "Representative opening",
  rail_lengths_by_area: "Railing lengths by area",
  handrail_height: "Stair handrail height",
  narrow_access_width: "Narrowest access width",
  gate_width: "Gate opening width",
  clearance: "Clearance height",
  obstruction_clearances: "Relevant obstruction clearance",
};
const FIELD_GUIDANCE: Record<string, string> = {
  length: "Measure the longest deck edge from end to end.",
  width: "Measure from the house-side edge to the outside deck edge.",
  height_from_grade:
    "Measure vertically from visible grade to the top of the deck surface.",
  ledger_length: "Measure the visible house connection from end to end.",
  joist_spacing:
    "Measure horizontally from the center of one visible joist to the center of the next.",
  joist_depth: "Measure the vertical face of one visible joist.",
  beam_depth: "Measure the vertical face of one visible beam.",
  post_dimensions:
    "Measure the visible post face in both directions: width and depth.",
  support_spacing:
    "Measure the horizontal distance between adjacent support or beam lines. Do not assume this is post spacing.",
  exposed_footing_dimensions:
    "Measure only what is exposed: visible width, visible length, and visible height or depth. Do not estimate anything below grade.",
  stair_width: "Measure across the usable stair width.",
  total_rise:
    "Measure vertically from the bottom landing level to the top deck surface.",
  tread_depth: "Measure front to back on one representative tread.",
  representative_riser:
    "Measure vertically between two adjacent representative tread surfaces.",
  landing_dimensions:
    "Measure the visible landing and record the requested overall dimension without assuming concealed edges.",
  guard_height:
    "Measure vertically from the deck surface to the top of the guard.",
  opening:
    "Measure one representative clear opening between visible guard components.",
  rail_lengths_by_area:
    "Measure each visible railing run and enter the combined field-observed length for this capture.",
  handrail_height:
    "Measure vertically from the stair nosing line to the top of the handrail.",
  narrow_access_width:
    "Measure the narrowest clear width along the visible access route.",
  gate_width: "Measure the clear opening between the gate stops or posts.",
  clearance:
    "Measure the lowest visible overhead clearance on the access route.",
  obstruction_clearances:
    "Measure the shortest relevant visible clearance between the work area and the obstruction.",
};
const LONG_UNITS = ["ft", "ft + in", "in"] as const;
const DETAIL_UNITS = ["in", "ft", "ft + in"] as const;
const COMPOSITE_UNITS = ["in", "ft"] as const;
const COMPOSITE_FIELDS: Record<string, string[]> = {
  post_dimensions: ["Post width", "Post depth"],
  exposed_footing_dimensions: [
    "Visible footing width",
    "Visible footing length",
    "Visible footing height or depth",
  ],
};
const CONDITIONS: Record<string, { prompt: string; yes: string; no: string }> =
  {
    attached: {
      prompt: "Is this deck attached to the house?",
      yes: "Attached",
      no: "Not attached",
    },
    visible: {
      prompt: "Is the underside framing safely visible?",
      yes: "Visible",
      no: "Not safely visible",
    },
    safely_visible: {
      prompt: "Are supports and exposed footings safely visible?",
      yes: "Safely visible",
      no: "Not safely visible",
    },
    stairs_present: {
      prompt: "Are stairs present?",
      yes: "Stairs present",
      no: "I inspected the area; no stairs are present",
    },
    rail_present: {
      prompt: "Are guards or railings present?",
      yes: "Guards or railings present",
      no: "I inspected the area; none are present",
    },
    narrow_access_present: {
      prompt: "Does access have a narrow gate or clearance?",
      yes: "Constraint present",
      no: "No narrow-access constraint observed",
    },
    utilities_or_obstructions_present: {
      prompt: "Are utilities or obstructions visible?",
      yes: "Visible",
      no: "I inspected the area; none are visible",
    },
  };
const BLOCK_REASONS = [
  ["unsafe_access", "Unsafe to access"],
  ["inaccessible", "Area physically inaccessible"],
  ["concealed", "Condition concealed"],
  ["customer_declined", "Customer denied access"],
  ["site_condition", "Weather, lighting, or site condition"],
  ["office_verification_required", "Office verification required"],
] as const;
const REVIEW_GUIDANCE: Record<string, { reason: string; action: string }> = {
  blurry: {
    reason: "The photo looks blurry.",
    action:
      "Hold the camera steady, tap the subject to focus, and take it again.",
  },
  too_dark: {
    reason: "The photo looks too dark.",
    action: "Add light or move to a brighter angle, then take it again.",
  },
  too_bright: {
    reason: "The photo looks too bright.",
    action:
      "Move out of direct light or lower the camera angle, then take it again.",
  },
  glare: {
    reason: "Glare is hiding part of the view.",
    action: "Change your angle so light is not reflecting into the camera.",
  },
  obstructed: {
    reason: "Something is blocking the view.",
    action:
      "Move around the obstruction when safe and show the requested area clearly.",
  },
  wrong_subject: {
    reason: "The requested area may not be in the photo.",
    action: "Check the requested-photo list and photograph that area.",
  },
  incomplete_view: {
    reason: "The full requested area is not visible.",
    action: "Step back or change angle until every requested part is in frame.",
  },
  too_distant: {
    reason: "The important details are too far away.",
    action: "Move closer while keeping the full requested area in frame.",
  },
  orientation_problem: {
    reason: "The photo orientation makes the view hard to check.",
    action: "Rotate the phone and retake the photo upright.",
  },
  unsupported_media: {
    reason: "This photo format could not be reviewed.",
    action: "Take a new photo or choose a JPEG, PNG, or WebP image.",
  },
  review_unavailable: {
    reason:
      "The review provider did not return a usable result, so the exact photo problem is unknown.",
    action:
      "Retry the review. If it still fails, retake a clear photo or inspect this photo yourself.",
  },
};
const FACT_STATUS_LABELS: Record<VisibleFactStatus, string> = {
  visible: "Visible",
  not_visible: "Not visible",
  unclear: "Unclear",
};
const NEXT_CAPTURE_LABELS: Record<NextCaptureAction, string> = {
  move_closer: "Move closer",
  step_back: "Step back",
  change_angle: "Change the angle",
  add_light: "Add light",
  remove_obstruction: "Move around the obstruction",
  show_other_end: "Show the other end",
};
const input =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base text-slate-950 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100 disabled:bg-slate-100";
const primary =
  "w-full rounded-lg bg-slate-950 px-4 py-3 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto";
const secondary =
  "w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base font-bold text-slate-800 disabled:opacity-50 sm:w-auto";

export function GuidedDeckSiteVisit({ estimateId }: { estimateId: string }) {
  const [visit, setVisit] = useState<Visit | null>(null);
  const [permission, setPermission] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    percent: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [measurements, setMeasurements] = useState<
    Record<string, MeasurementDraft>
  >({});
  const [condition, setCondition] = useState<"yes" | "no" | "">("");
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [blockNotes, setBlockNotes] = useState("");
  const [localPhoto, setLocalPhoto] = useState<{
    photoId: string;
    url: string;
  } | null>(null);
  const [captureMode, setCaptureMode] = useState<"batch" | "guided">("batch");
  const [batchDrafts, setBatchDrafts] = useState<BatchDraftPhoto[]>([]);
  const batchDraftsRef = useRef<BatchDraftPhoto[]>([]);
  const [pendingPhoto, setPendingPhoto] = useState<{
    id: string;
    revision: number;
  } | null>(null);
  const [localReview, setLocalReview] = useState<
    | { photoId: string; status: "reviewing" }
    | {
        photoId: string;
        status: "complete";
        verdict: UsabilityVerdict;
        issueCodes: string[];
      }
    | null
  >(null);
  const [factReview, setFactReview] = useState<
    | { photoId: string; status: "reviewing" }
    | { photoId: string; status: "unavailable"; mode: "ai" | "manual" }
    | {
        photoId: string;
        status: "complete";
        reviewId: string;
        sourceMode: "ai" | "manual";
        criteria: VisibleCriterion[];
        recommendedNextCapture: VisibleFactReview["recommendedNextCapture"];
      }
    | null
  >(null);
  const [factDraft, setFactDraft] = useState<Record<string, VisibleFactStatus>>(
    {},
  );
  const [factOverrides, setFactOverrides] = useState<
    Record<string, Record<string, VisibleFactStatus>>
  >({});
  const [correctingFacts, setCorrectingFacts] = useState(false);
  const [humanAccepted, setHumanAccepted] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [captureIntent, setCaptureIntent] = useState<
    | { kind: "initial" }
    | { kind: "complement"; sourceDecisionId: string; revision: number }
    | {
        kind: "retake";
        photoId: string;
        sourceDecisionId: string | null;
        revision: number;
      }
    | null
  >(null);
  const [reservationNonce, setReservationNonce] = useState(() =>
    crypto.randomUUID(),
  );
  const [discoveringVisit, setDiscoveringVisit] = useState(true);

  const loadVisit = useCallback(async (visitId: string) => {
    const response = await fetch(
      `/api/guided-site-visits/${encodeURIComponent(visitId)}`,
      { cache: "no-store" },
    );
    const body = (await response.json()) as {
      success?: boolean;
      error?: string;
      visit?: Record<string, unknown>;
    };
    if (!response.ok || !body.visit)
      throw new Error(body.error ?? "Site visit could not be loaded.");
    const normalized = normalizeVisit(body.visit);
    setVisit(normalized);
    return normalized;
  }, []);

  async function start() {
    if (!permission || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/estimates/${encodeURIComponent(estimateId)}/guided-site-visits`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recordingPermissionAcknowledged: true }),
        },
      );
      const body = (await response.json()) as {
        success?: boolean;
        error?: string;
        visitId?: string;
      };
      if (!response.ok || !body.visitId)
        throw new Error(body.error ?? "Site visit could not be started.");
      await loadVisit(body.visitId);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Site visit could not be started.",
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    setDiscoveringVisit(true);
    void fetch(
      `/api/estimates/${encodeURIComponent(estimateId)}/guided-site-visits`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const body = (await response.json()) as {
          error?: string;
          activeVisit?: { id?: unknown } | null;
        };
        if (!response.ok)
          throw new Error(
            body.error ?? "Active site visit could not be checked.",
          );
        const visitId = body.activeVisit?.id;
        if (active && typeof visitId === "string") await loadVisit(visitId);
      })
      .catch((discoveryError) => {
        if (active)
          setError(
            discoveryError instanceof Error
              ? discoveryError.message
              : "Active site visit could not be checked.",
          );
      })
      .finally(() => {
        if (active) setDiscoveringVisit(false);
      });
    return () => {
      active = false;
    };
  }, [estimateId, loadVisit]);
  useEffect(
    () => () => {
      if (localPhoto) URL.revokeObjectURL(localPhoto.url);
    },
    [localPhoto],
  );
  useEffect(() => {
    batchDraftsRef.current = batchDrafts;
  }, [batchDrafts]);
  useEffect(
    () => () => {
      batchDraftsRef.current.forEach((draft) => URL.revokeObjectURL(draft.url));
    },
    [],
  );

  const current = visit?.items.find((item) => item.state === "pending") ?? null;
  const attempts =
    current && visit
      ? visit.photoAttempts.filter((photo) => photo.visitItemId === current.id)
      : [];
  const activePhotos = attempts
    .filter((photo) => photo.state === "confirmed")
    .sort((a, b) => a.ordinal - b.ordinal);
  const storedPhoto =
    activePhotos.find(
      (photo) => photo.id === (selectedPhotoId ?? pendingPhoto?.id),
    ) ??
    activePhotos.at(-1) ??
    null;
  const incompletePhoto =
    [...attempts].reverse().find((photo) => photo.state === "upload_pending") ??
    null;
  const activePhotoId = pendingPhoto?.id ?? storedPhoto?.id ?? null;
  const storedReview = latestUsabilityReview(
    storedPhoto?.usabilityReviews ?? [],
  );
  const storedFactReview = latestVisibleFactReview(
    storedPhoto?.visibleFactReviews ?? [],
  );
  const review =
    localReview?.photoId === activePhotoId
      ? localReview
      : storedReview
        ? {
            photoId: storedPhoto!.id,
            status: "complete" as const,
            verdict: storedReview.verdict,
            issueCodes: storedReview.issueCodes,
          }
        : activePhotoId
          ? {
              photoId: activePhotoId,
              status: "complete" as const,
              verdict: "unable_to_assess" as const,
              issueCodes: [],
            }
          : null;
  const visibleFacts =
    factReview?.photoId === activePhotoId
      ? factReview
      : storedFactReview && storedPhoto
        ? {
            photoId: storedPhoto.id,
            status: "complete" as const,
            reviewId: storedFactReview.id,
            sourceMode: storedFactReview.sourceMode,
            criteria: storedFactReview.criteria,
            recommendedNextCapture: storedFactReview.recommendedNextCapture,
          }
        : null;
  const completedFactReviews = activePhotos.flatMap((photo) => {
    const facts = latestVisibleFactReview(photo.visibleFactReviews);
    const usability = latestUsabilityReview(photo.usabilityReviews);
    return facts && usability?.verdict === "usable"
      ? [{ photoId: photo.id, review: facts }]
      : [];
  });
  if (
    visibleFacts?.status === "complete" &&
    !completedFactReviews.some(
      (entry) => entry.review.id === visibleFacts.reviewId,
    )
  )
    completedFactReviews.push({
      photoId: activePhotoId!,
      review: {
        id: visibleFacts.reviewId,
        sourceMode: visibleFacts.sourceMode,
        criteria: visibleFacts.criteria,
        recommendedNextCapture: visibleFacts.recommendedNextCapture,
        createdAt: new Date().toISOString(),
      },
    });
  const declaredFacts =
    GUIDED_VISIBLE_FACT_CRITERIA[current?.itemKey ?? ""] ?? [];
  const aggregateCoverage = declaredFacts.map((fact) => {
    const source = completedFactReviews.find((entry) => {
      const original = entry.review.criteria.find(
        (row) => row.criterionKey === fact.key,
      );
      return (
        (factOverrides[entry.review.id]?.[fact.key] ?? original?.status) ===
        "visible"
      );
    });
    const originalStatus = source?.review.criteria.find(
      (row) => row.criterionKey === fact.key,
    )?.status;
    return {
      criterionKey: fact.key,
      label: fact.label,
      sourceReviewId: source?.review.id ?? null,
      sourcePhotoId: source?.photoId ?? null,
      decision: originalStatus === "visible" ? "accepted" : "corrected",
    };
  });
  const missingCoverage = aggregateCoverage.filter(
    (fact) => !fact.sourceReviewId,
  );
  const missingCoverageKeys = new Set(
    missingCoverage.map((fact) => fact.criterionKey),
  );
  const complementaryPhotoSource = completedFactReviews.find(
    (entry) =>
      entry.review.recommendedNextCapture &&
      missingCoverageKeys.has(entry.review.recommendedNextCapture.criterionKey),
  );
  const terminalCount =
    visit?.items.filter((item) => item.state !== "pending").length ?? 0;
  const blockedCount =
    visit?.items.filter((item) => item.state === "documented_follow_up")
      .length ?? 0;
  const fieldNames = current?.requirement.fields ?? [];
  const requiresFields =
    current?.requirement.mode === "required_measurements" ||
    (current?.requirement.mode === "conditional" && condition === "yes");
  const reviewPhotoReady = Boolean(activePhotoId);
  const requirementSatisfied =
    reviewPhotoReady &&
    humanAccepted &&
    (current?.requirement.mode !== "conditional" || condition !== "") &&
    (!requiresFields ||
      fieldNames.every((field) =>
        measurementComplete(field, measurements[field]),
      ));

  function addBatchPhotos(files: File[]) {
    if (!current || busy) return;
    setError("");
    setHumanAccepted(false);
    const room = Math.max(
      0,
      MAX_ACTIVE_PHOTOS - activePhotos.length - batchDrafts.length,
    );
    const existing = new Set(
      batchDrafts.map(
        (draft) =>
          `${draft.file.name}:${draft.file.size}:${draft.file.lastModified}`,
      ),
    );
    const invalid = files.find(
      (file) =>
        !GUIDED_PHOTO_MIME_TYPES.has(file.type) ||
        file.size < 1 ||
        file.size > GUIDED_PHOTO_MAX_BYTES,
    );
    if (invalid) {
      setError(
        !GUIDED_PHOTO_MIME_TYPES.has(invalid.type)
          ? `${invalid.name || "A photo"} is not a supported image format.`
          : `${invalid.name || "A photo"} must be 15 MB or smaller.`,
      );
      return;
    }
    const selectedBytes = files.reduce((total, file) => total + file.size, 0);
    const queuedBytes = batchDrafts.reduce(
      (total, draft) => total + draft.file.size,
      0,
    );
    if (selectedBytes + queuedBytes > MAX_BATCH_BYTES) {
      setError("Keep this local photo set at 60 MB or smaller.");
      return;
    }
    const accepted = files
      .filter((file) => {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (existing.has(key)) return false;
        existing.add(key);
        return true;
      })
      .slice(0, room);
    if (!accepted.length) {
      setError(
        room === 0
          ? "Five photos is the limit for one checklist step."
          : "Choose a supported image file that is not already in the tray.",
      );
      return;
    }
    setBatchDrafts((drafts) => [
      ...drafts,
      ...accepted.map((file) => ({
        id: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
        status: "ready" as const,
      })),
    ]);
    if (accepted.length < files.length && accepted.length === room)
      setError(
        "Only the remaining photos up to the five-photo limit were added.",
      );
  }

  function removeBatchPhoto(id: string) {
    setBatchDrafts((drafts) => {
      const removed = drafts.find((draft) => draft.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      return drafts.filter((draft) => draft.id !== id);
    });
  }

  async function uploadPhotoBatch() {
    if (!visit || !current || busy || !batchDrafts.length) return;
    const queued = batchDrafts.filter((draft) => draft.status !== "uploading");
    if (!queued.length) return;
    setBusy(true);
    setError("");
    setHumanAccepted(false);
    setBatchProgress({ current: 1, total: queued.length, percent: 0 });
    let expectedRevision = pendingPhoto?.revision ?? visit.revision;
    const successfulIds = new Set<string>();
    let lastPhotoId: string | null = null;
    try {
      if (incompletePhoto) {
        const abandoned = await jsonRequest(
          `/api/guided-site-visits/${visit.id}/photos/${incompletePhoto.id}/abandon`,
          "POST",
          { expectedRevision },
        );
        if (typeof abandoned.nextRevision !== "number")
          throw new Error("Incomplete photo recovery response was invalid.");
        expectedRevision = abandoned.nextRevision;
      }
      const opened = await jsonRequest(
        `/api/guided-site-visits/${visit.id}/items/${current.id}/photo-batches`,
        "POST",
        {
          idempotencyKey: `guided-photo-batch:${current.id}:${crypto.randomUUID()}`,
          memberCount: queued.length,
        },
      );
      if (typeof opened.batchId !== "string")
        throw new Error("Photo batch could not be started.");

      for (let index = 0; index < queued.length; index += 1) {
        const draft = queued[index];
        setBatchDrafts((drafts) =>
          drafts.map((row) =>
            row.id === draft.id
              ? { ...row, status: "uploading", error: undefined }
              : row,
          ),
        );
        setBatchProgress({
          current: index + 1,
          total: queued.length,
          percent: 0,
        });
        try {
          if (!draft.file.type.startsWith("image/"))
            throw new Error("Choose a supported image file.");
          const digest = await crypto.subtle.digest(
            "SHA-256",
            await draft.file.arrayBuffer(),
          );
          const sha256 = [...new Uint8Array(digest)]
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
          const nonce = crypto.randomUUID();
          const reserve = await jsonRequest(
            `/api/guided-site-visits/${visit.id}/items/${current.id}/photos/upload-session`,
            "POST",
            {
              expectedRevision,
              idempotencyKey: `guided-photo-reservation:batch:${opened.batchId}:${index + 1}:${sha256}:${nonce}`,
              captureIntent: "batch",
              batchId: opened.batchId,
              batchOrdinal: index + 1,
              sourceDecisionId: null,
              originalFilename:
                draft.file.name ||
                `deck-capture-${current.ordinal}-${index + 1}.jpg`,
              mimeType: draft.file.type,
              byteSize: draft.file.size,
              sha256,
              retakeOfAttemptId: null,
              reservationNonce: nonce,
            },
          );
          if (reserve.alreadyConfirmed === true) {
            successfulIds.add(draft.id);
            continue;
          }
          const upload = reserve.upload as { signedUrl?: string };
          if (
            !upload?.signedUrl ||
            typeof reserve.attemptId !== "string" ||
            typeof reserve.nextRevision !== "number"
          )
            throw new Error("Private upload session was incomplete.");
          await uploadWithProgress(upload.signedUrl, draft.file, (percent) =>
            setBatchProgress({
              current: index + 1,
              total: queued.length,
              percent,
            }),
          );
          const completed = await jsonRequest(
            `/api/guided-site-visits/${visit.id}/photos/${reserve.attemptId}/complete`,
            "POST",
            { expectedRevision: reserve.nextRevision },
          );
          if (typeof completed.nextRevision !== "number")
            throw new Error("Photo confirmation response was incomplete.");
          expectedRevision = completed.nextRevision;
          lastPhotoId = reserve.attemptId;
          successfulIds.add(draft.id);
          await reviewPhoto(
            reserve.attemptId,
            initialReviewKey(reserve.attemptId),
          );
        } catch (uploadError) {
          const message =
            uploadError instanceof Error
              ? uploadError.message
              : "This photo could not be uploaded.";
          setBatchDrafts((drafts) =>
            drafts.map((row) =>
              row.id === draft.id
                ? { ...row, status: "failed", error: message }
                : row,
            ),
          );
          setError(
            `Photo ${index + 1} failed. Earlier photos are saved; this photo and all unattempted photos remain in the tray for retry.`,
          );
          break;
        }
      }
    } catch (batchError) {
      setError(
        batchError instanceof Error
          ? batchError.message
          : "The photo set could not be uploaded.",
      );
    } finally {
      setBatchDrafts((drafts) => {
        drafts
          .filter((draft) => successfulIds.has(draft.id))
          .forEach((draft) => URL.revokeObjectURL(draft.url));
        return drafts
          .filter((draft) => !successfulIds.has(draft.id))
          .map((draft) =>
            draft.status === "uploading"
              ? { ...draft, status: "ready" as const }
              : draft,
          );
      });
      if (lastPhotoId) setSelectedPhotoId(lastPhotoId);
      try {
        await loadVisit(visit.id);
      } catch {}
      setBatchProgress(null);
      setBusy(false);
    }
  }

  async function uploadPhoto(file: File) {
    if (!visit || !current || busy) return;
    setBusy(true);
    setError("");
    setProgress(0);
    setHumanAccepted(false);
    setLocalReview(null);
    try {
      if (!file.type.startsWith("image/"))
        throw new Error("Choose a supported image file.");
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await file.arrayBuffer(),
      );
      const sha256 = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const effectiveCaptureIntent =
        captureIntent?.kind ?? (activePhotos.length ? "retake" : "initial");
      const effectiveRetakePhotoId =
        captureIntent?.kind === "retake"
          ? captureIntent.photoId
          : effectiveCaptureIntent === "retake"
            ? activePhotoId
            : null;
      let expectedRevision =
        captureIntent && "revision" in captureIntent
          ? captureIntent.revision
          : (pendingPhoto?.revision ?? visit.revision);
      let sourceDecisionId =
        captureIntent && "sourceDecisionId" in captureIntent
          ? captureIntent.sourceDecisionId
          : null;
      const retakeEvidence =
        captureIntent === null &&
        visibleFacts?.status === "complete" &&
        visibleFacts.criteria.some((fact) => fact.status !== "visible") &&
        visibleFacts.recommendedNextCapture
          ? visibleFacts
          : null;
      if (retakeEvidence) {
        const decision = await jsonRequest(
          `/api/guided-site-visits/${visit.id}/photos/${activePhotoId}/visible-fact-reviews/${retakeEvidence.reviewId}/decision`,
          "POST",
          {
            itemId: current.id,
            expectedRevision,
            idempotencyKey: `guided-visible-facts:${retakeEvidence.reviewId}:retake`,
            decision: "accepted",
            nextAction: "retake_photo",
            finalCriteria: retakeEvidence.criteria,
            recommendedNextCapture: retakeEvidence.recommendedNextCapture,
            observation: null,
          },
        );
        if (
          typeof decision.decisionId !== "string" ||
          typeof decision.nextRevision !== "number"
        )
          throw new Error("Retake decision response was invalid.");
        sourceDecisionId = decision.decisionId;
        expectedRevision = decision.nextRevision;
      }
      if (incompletePhoto) {
        const abandoned = await jsonRequest(
          `/api/guided-site-visits/${visit.id}/photos/${incompletePhoto.id}/abandon`,
          "POST",
          { expectedRevision },
        );
        if (typeof abandoned.nextRevision !== "number")
          throw new Error("Incomplete photo recovery response was invalid.");
        expectedRevision = abandoned.nextRevision;
      }
      const reserve = await jsonRequest(
        `/api/guided-site-visits/${visit.id}/items/${current.id}/photos/upload-session`,
        "POST",
        {
          expectedRevision,
          idempotencyKey: `guided-photo-reservation:${effectiveCaptureIntent}:${captureIntent?.kind === "complement" ? captureIntent.sourceDecisionId : (sourceDecisionId ?? effectiveRetakePhotoId ?? current.id)}:${sha256}:${reservationNonce}`,
          captureIntent: effectiveCaptureIntent,
          sourceDecisionId,
          originalFilename: file.name || `deck-capture-${current.ordinal}.jpg`,
          mimeType: file.type,
          byteSize: file.size,
          sha256,
          retakeOfAttemptId: effectiveRetakePhotoId,
          reservationNonce,
        },
      );
      if (reserve.alreadyConfirmed === true) {
        setReservationNonce(crypto.randomUUID());
        await loadVisit(visit.id);
        return;
      }
      const upload = reserve.upload as {
        signedUrl?: string;
        requiredMimeType?: string;
      };
      if (
        !upload?.signedUrl ||
        typeof reserve.attemptId !== "string" ||
        typeof reserve.nextRevision !== "number"
      )
        throw new Error("Private upload session was incomplete.");
      await uploadWithProgress(upload.signedUrl, file, setProgress);
      if (localPhoto) URL.revokeObjectURL(localPhoto.url);
      const completed = await jsonRequest(
        `/api/guided-site-visits/${visit.id}/photos/${reserve.attemptId}/complete`,
        "POST",
        { expectedRevision: reserve.nextRevision },
      );
      if (typeof completed.nextRevision !== "number")
        throw new Error("Photo confirmation response was incomplete.");
      setPendingPhoto({
        id: reserve.attemptId,
        revision: completed.nextRevision,
      });
      setLocalPhoto({
        photoId: reserve.attemptId,
        url: URL.createObjectURL(file),
      });
      setSelectedPhotoId(reserve.attemptId);
      setReservationNonce(crypto.randomUUID());
      setCaptureIntent(null);
      setFactReview(null);
      setFactDraft({});
      setCorrectingFacts(false);
      setLocalReview({ photoId: reserve.attemptId, status: "reviewing" });
      await reviewPhoto(reserve.attemptId, initialReviewKey(reserve.attemptId));
    } catch (requestError) {
      if (
        requestError instanceof Error &&
        requestError.message.includes("reservation_failed")
      )
        setReservationNonce(crypto.randomUUID());
      try {
        await loadVisit(visit.id);
      } catch {}
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Photo upload failed. Retry this capture.",
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function prepareComplement() {
    if (!visit || !current) return;
    const source =
      complementaryPhotoSource ??
      completedFactReviews.find((entry) =>
        entry.review.criteria.some(
          (criterion) =>
            missingCoverageKeys.has(criterion.criterionKey) &&
            (factOverrides[entry.review.id]?.[criterion.criterionKey] ??
              criterion.status) !== "visible",
        ),
      );
    if (!source) return;
    const missingCriterion = source.review.criteria.find(
      (criterion) =>
        missingCoverageKeys.has(criterion.criterionKey) &&
        (factOverrides[source.review.id]?.[criterion.criterionKey] ??
          criterion.status) !== "visible",
    );
    const effectiveCriteria = source.review.criteria.map((criterion) => ({
      ...criterion,
      status:
        factOverrides[source.review.id]?.[criterion.criterionKey] ??
        criterion.status,
    }));
    const recommendation =
      source.review.recommendedNextCapture &&
      missingCoverageKeys.has(source.review.recommendedNextCapture.criterionKey)
        ? source.review.recommendedNextCapture
        : missingCriterion
          ? {
              criterionKey: missingCriterion.criterionKey,
              actionCode: "change_angle" as const,
            }
          : null;
    if (!recommendation) return;
    setBusy(true);
    setError("");
    try {
      const result = await jsonRequest(
        `/api/guided-site-visits/${visit.id}/photos/${source.photoId}/visible-fact-reviews/${source.review.id}/decision`,
        "POST",
        {
          itemId: current.id,
          expectedRevision: pendingPhoto?.revision ?? visit.revision,
          idempotencyKey: `guided-visible-facts:${source.review.id}:complement`,
          decision:
            JSON.stringify(effectiveCriteria) ===
              JSON.stringify(source.review.criteria) &&
            recommendation === source.review.recommendedNextCapture
              ? "accepted"
              : "corrected",
          nextAction: "add_complementary_photo",
          finalCriteria: effectiveCriteria,
          recommendedNextCapture: recommendation,
          observation: null,
        },
      );
      if (
        typeof result.decisionId !== "string" ||
        typeof result.nextRevision !== "number"
      )
        throw new Error("Additional-photo request was incomplete.");
      setCaptureIntent({
        kind: "complement",
        sourceDecisionId: result.decisionId,
        revision: result.nextRevision,
      });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Another photo could not be started.",
      );
    } finally {
      setBusy(false);
    }
  }
  function prepareRetake() {
    if (!activePhotoId || !visit) return;
    setCaptureIntent({
      kind: "retake",
      photoId: activePhotoId,
      sourceDecisionId: null,
      revision: pendingPhoto?.revision ?? visit.revision,
    });
    setHumanAccepted(false);
  }

  async function reviewPhoto(photoId: string, idempotencyKey: string) {
    if (!visit) return;
    setLocalReview({ photoId, status: "reviewing" });
    setError("");
    try {
      const result = await jsonRequest(
        `/api/guided-site-visits/${visit.id}/photos/${photoId}/usability-reviews`,
        "POST",
        { idempotencyKey },
      );
      if (
        !isUsabilityVerdict(result.verdict) ||
        !Array.isArray(result.issueCodes)
      )
        throw new Error("Photo review response was incomplete.");
      setLocalReview({
        photoId,
        status: "complete",
        verdict: result.verdict,
        issueCodes: result.issueCodes.filter(
          (code): code is string => typeof code === "string",
        ),
      });
      if (result.verdict === "usable") await reviewVisibleFacts(photoId);
    } catch {
      setLocalReview({
        photoId,
        status: "complete",
        verdict: "unable_to_assess",
        issueCodes: ["review_unavailable"],
      });
    }
  }

  async function reviewVisibleFacts(photoId: string) {
    if (!visit) return;
    setFactReview({ photoId, status: "reviewing" });
    setHumanAccepted(false);
    setCorrectingFacts(false);
    setError("");
    try {
      const result = await jsonRequest(
        `/api/guided-site-visits/${visit.id}/photos/${photoId}/visible-fact-reviews`,
        "POST",
        { idempotencyKey: initialFactReviewKey(photoId) },
      );
      const criteria = normalizeVisibleCriteria(result.criteria);
      if (
        typeof result.reviewId !== "string" ||
        result.sourceMode !== "ai" ||
        !criteria.length
      )
        throw new Error("Visible-fact review response was incomplete.");
      const recommendation = normalizeRecommendation(
        result.recommendedNextCapture,
      );
      setFactReview({
        photoId,
        status: "complete",
        reviewId: result.reviewId,
        sourceMode: "ai",
        criteria,
        recommendedNextCapture: recommendation,
      });
      setFactDraft(
        Object.fromEntries(
          criteria.map((fact) => [fact.criterionKey, fact.status]),
        ),
      );
    } catch {
      setFactReview({ photoId, status: "unavailable", mode: "ai" });
    }
  }

  async function beginManualFactCheck() {
    if (!activePhotoId || !visit) return;
    setFactReview({ photoId: activePhotoId, status: "reviewing" });
    setHumanAccepted(false);
    try {
      const result = await jsonRequest(
        `/api/guided-site-visits/${visit.id}/photos/${activePhotoId}/visible-fact-reviews`,
        "POST",
        {
          idempotencyKey: `guided-visible-facts:${activePhotoId}:manual`,
          manualFallback: true,
        },
      );
      const criteria = normalizeVisibleCriteria(result.criteria);
      if (
        typeof result.reviewId !== "string" ||
        result.sourceMode !== "manual" ||
        !criteria.length
      )
        throw new Error("Manual checklist could not be started.");
      setFactReview({
        photoId: activePhotoId,
        status: "complete",
        reviewId: result.reviewId,
        sourceMode: "manual",
        criteria,
        recommendedNextCapture: normalizeRecommendation(
          result.recommendedNextCapture,
        ),
      });
      setFactDraft(
        Object.fromEntries(
          criteria.map((fact) => [fact.criterionKey, fact.status]),
        ),
      );
      setCorrectingFacts(true);
    } catch {
      setFactReview({
        photoId: activePhotoId,
        status: "unavailable",
        mode: "manual",
      });
      setError(
        "Manual checklist could not be started. Retry or retake the photo.",
      );
    }
  }
  function acceptPhotoSet() {
    if (missingCoverage.length || !completedFactReviews.length) return;
    setHumanAccepted(true);
    setCorrectingFacts(false);
  }
  function acceptCorrections() {
    const declared = GUIDED_VISIBLE_FACT_CRITERIA[current?.itemKey ?? ""] ?? [];
    if (!declared.length || declared.some((fact) => !factDraft[fact.key]))
      return;
    if (visibleFacts?.status !== "complete") return;
    setFactOverrides((overrides) => ({
      ...overrides,
      [visibleFacts.reviewId]: { ...factDraft },
    }));
    setHumanAccepted(false);
    setCorrectingFacts(false);
  }

  async function confirmItem() {
    if (!visit || !current || !requirementSatisfied || busy) return;
    setBusy(true);
    setError("");
    try {
      const expectedRevision = pendingPhoto?.revision ?? visit.revision;
      const storedMeasurements = serializeMeasurements(
        fieldNames,
        measurements,
      );
      const observation =
        current.requirement.mode === "photo_only"
          ? {}
          : current.requirement.mode === "required_measurements"
            ? { measurements: storedMeasurements }
            : condition === "yes"
              ? { conditionStatus: "applies", measurements: storedMeasurements }
              : {
                  conditionStatus: "not_applicable",
                  ...(current.requirement.otherwise
                    ? { confirmation: current.requirement.otherwise }
                    : {}),
                };
      const coverage = aggregateCoverage.map((fact) => ({
        criterionKey: fact.criterionKey,
        sourceReviewId: fact.sourceReviewId,
        decision: fact.decision,
      }));
      if (coverage.some((fact) => !fact.sourceReviewId))
        throw new Error(
          "Add another photo for every missing checklist item before continuing.",
        );
      await jsonRequest(
        `/api/guided-site-visits/${visit.id}/items/${current.id}/photo-set-confirmation`,
        "POST",
        {
          expectedRevision,
          idempotencyKey: `guided-photo-set:${current.id}:confirm`,
          coverage,
          observation,
        },
      );
      setMeasurements({});
      setCondition("");
      if (localPhoto) URL.revokeObjectURL(localPhoto.url);
      setLocalPhoto(null);
      setPendingPhoto(null);
      setLocalReview(null);
      setFactReview(null);
      setFactDraft({});
      setFactOverrides({});
      setCorrectingFacts(false);
      setHumanAccepted(false);
      setBlockOpen(false);
      await loadVisit(visit.id);
    } catch (requestError) {
      try {
        await loadVisit(visit.id);
      } catch {}
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Capture could not be confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function blockItem() {
    if (!visit || !current || !blockReason || !blockNotes.trim() || busy)
      return;
    setBusy(true);
    setError("");
    try {
      await jsonRequest(
        `/api/guided-site-visits/${visit.id}/items/${current.id}`,
        "PATCH",
        {
          expectedRevision: pendingPhoto?.revision ?? visit.revision,
          action: "document_follow_up",
          observation: {},
          followUpReasonCode: blockReason,
          followUpNotes: blockNotes.trim(),
        },
      );
      setBlockReason("");
      setBlockNotes("");
      setBlockOpen(false);
      setMeasurements({});
      setCondition("");
      if (localPhoto) URL.revokeObjectURL(localPhoto.url);
      setLocalPhoto(null);
      setPendingPhoto(null);
      setLocalReview(null);
      setFactReview(null);
      setFactDraft({});
      setCorrectingFacts(false);
      setHumanAccepted(false);
      await loadVisit(visit.id);
    } catch (requestError) {
      try {
        await loadVisit(visit.id);
      } catch {}
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Blocked reason could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function completeVisit() {
    if (!visit || current || busy) return;
    setBusy(true);
    setError("");
    try {
      await jsonRequest(
        `/api/guided-site-visits/${visit.id}/complete`,
        "POST",
        { expectedRevision: visit.revision },
      );
      await loadVisit(visit.id);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Visit could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (discoveringVisit && !visit)
    return (
      <section
        className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm"
        aria-live="polite"
      >
        <p className="text-sm font-bold text-slate-900">
          Checking for an unfinished site visit…
        </p>
      </section>
    );

  if (!visit)
    return (
      <section
        id="deck-field-visit"
        className="overflow-hidden rounded-xl border-2 border-amber-500 bg-white shadow-sm"
      >
        <BetaWarning />
        <div className="p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-amber-800">
            Deck guided site visit
          </p>
          <h2 className="mt-1 text-2xl font-bold">Start Deck site visit</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Nine required views, shown one at a time. Each photo requires your
            confirmation or a documented office follow-up reason.
          </p>
          <label className="mt-5 flex items-start gap-3 rounded-lg border border-slate-300 p-4 text-sm font-semibold">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={permission}
              onChange={(event) => setPermission(event.target.checked)}
            />
            I have permission to capture and privately store jobsite photos for
            this estimate.
          </label>
          {error ? <ErrorMessage message={error} /> : null}
          <button
            type="button"
            onClick={() => void start()}
            disabled={!permission || busy}
            className={`mt-5 ${primary}`}
          >
            {busy ? "Opening visit…" : "Start Deck visit"}
          </button>
        </div>
      </section>
    );

  if (visit.status === "completed")
    return (
      <section
        id="deck-field-visit"
        className="overflow-hidden rounded-xl border-2 border-emerald-600 bg-white"
      >
        <BetaWarning />
        <div className="p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-700">
            Visit submitted
          </p>
          <h2 className="mt-2 text-2xl font-bold">
            {visit.completionOutcome === "all_passed"
              ? "Site visit documented: all 9 captures passed."
              : `Site visit documented with ${blockedCount} blocked ${blockedCount === 1 ? "capture" : "captures"}.`}
          </h2>
          {blockedCount ? (
            <p className="mt-2 font-semibold text-amber-800">
              Office follow-up is required.
            </p>
          ) : null}
          <VisitSummary visit={visit} />
        </div>
      </section>
    );

  if (!current)
    return (
      <section
        id="deck-field-visit"
        className="overflow-hidden rounded-xl border-2 border-amber-500 bg-white"
      >
        <BetaWarning />
        <div className="p-5 sm:p-6">
          <h2 className="text-2xl font-bold">
            All 9 capture items are documented
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {blockedCount
              ? `${blockedCount} blocked capture${blockedCount === 1 ? " requires" : "s require"} office follow-up.`
              : "Every required capture passed human confirmation."}
          </p>
          <VisitSummary visit={visit} />
          <button
            type="button"
            disabled={busy}
            onClick={() => void completeVisit()}
            className={`mt-5 ${primary}`}
          >
            {blockedCount
              ? "Submit documented visit with follow-up required"
              : "Finish site visit"}
          </button>
          {error ? <ErrorMessage message={error} /> : null}
        </div>
      </section>
    );

  return (
    <section
      id="deck-field-visit"
      className="overflow-hidden rounded-xl border-2 border-amber-500 bg-white shadow-sm"
    >
      <BetaWarning />
      <div className="border-b border-slate-200 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-black">Capture {current.ordinal} of 9</p>
          <p className="text-xs font-bold text-slate-600">
            {terminalCount} documented · {blockedCount} blocked
          </p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full bg-emerald-700"
            style={{ width: `${(terminalCount / 9) * 100}%` }}
          />
        </div>
      </div>
      <div className="p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-amber-800">
          Required capture
        </p>
        <h2 className="mt-1 text-2xl font-bold">{current.title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          {current.instructions}
        </p>
        <div className="mt-4 rounded-lg bg-slate-50 p-4">
          <p className="text-sm font-bold">Include in the photo</p>
          <ul className="mt-2 space-y-2 text-sm text-slate-700">
            {(INCLUDE[current.itemKey] ?? []).map((criterion) => (
              <li key={criterion}>✓ {criterion}</li>
            ))}
          </ul>
        </div>
        {activePhotos.length > 0 ? (
          <div className="mt-4 rounded-lg border border-slate-300 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <strong className="text-sm">Photos {activePhotos.length}</strong>
              <span className="text-xs font-bold text-slate-600">
                {declaredFacts.length - missingCoverage.length} of{" "}
                {declaredFacts.length} items covered
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {activePhotos.map((photo, index) => (
                <button
                  type="button"
                  key={photo.id}
                  onClick={() => {
                    setSelectedPhotoId(photo.id);
                    setPendingPhoto(null);
                    setLocalReview(null);
                    setFactReview(null);
                    setFactDraft({});
                    setCorrectingFacts(false);
                    setHumanAccepted(false);
                  }}
                  className={`rounded-full border px-3 py-2 text-xs font-bold ${photo.id === activePhotoId ? "border-blue-700 bg-blue-50 text-blue-950" : "border-slate-300 bg-white text-slate-700"}`}
                >
                  Photo {index + 1}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {/* Blob previews are local-only and cannot use the Next image optimizer. */}
        {localPhoto?.photoId === activePhotoId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={localPhoto.url}
            alt={`Current ${current.title} capture`}
            className="mt-4 max-h-96 w-full rounded-lg border border-slate-300 object-contain"
          />
        ) : null}{" "}
        {!captureIntent && !humanAccepted ? (
          <div className="mt-4">
            <div
              className="flex rounded-lg bg-slate-100 p-1"
              aria-label="Photo capture method"
            >
              <button
                type="button"
                aria-pressed={captureMode === "batch"}
                disabled={busy}
                onClick={() => setCaptureMode("batch")}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-bold ${captureMode === "batch" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"}`}
              >
                Capture photo set
              </button>
              <button
                type="button"
                aria-pressed={captureMode === "guided"}
                disabled={busy}
                onClick={() => setCaptureMode("guided")}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-bold ${captureMode === "guided" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"}`}
              >
                Guided photo help
              </button>
            </div>
            {captureMode === "batch" &&
            activePhotos.length < MAX_ACTIVE_PHOTOS ? (
              <BatchPhotoCapture
                drafts={batchDrafts}
                busy={busy}
                activeCount={activePhotos.length}
                progress={batchProgress}
                onAdd={addBatchPhotos}
                onRemove={removeBatchPhoto}
                onUpload={() => void uploadPhotoBatch()}
              />
            ) : captureMode === "guided" && !reviewPhotoReady ? (
              <PhotoSourceControls
                title="Add photo"
                busy={busy}
                uploadPhoto={uploadPhoto}
                busyLabel={
                  progress === null
                    ? "Preparing private upload…"
                    : `Uploading ${progress}%…`
                }
              />
            ) : null}
          </div>
        ) : null}
        {!captureIntent &&
        captureMode === "guided" &&
        reviewPhotoReady &&
        !visibleFacts &&
        !correctingFacts &&
        !humanAccepted ? (
          <PhotoReviewStatus
            review={review}
            busy={busy}
            onAccept={() =>
              review?.status === "complete" &&
              review.verdict === "usable" &&
              activePhotoId
                ? void reviewVisibleFacts(activePhotoId)
                : void beginManualFactCheck()
            }
            onRetry={() =>
              activePhotoId &&
              void reviewPhoto(activePhotoId, initialReviewKey(activePhotoId))
            }
            onRetake={() => {
              setHumanAccepted(false);
              setFactReview(null);
              setFactDraft({});
              setCorrectingFacts(false);
            }}
            uploadPhoto={uploadPhoto}
          />
        ) : null}
        {!captureIntent &&
        reviewPhotoReady &&
        (captureMode === "batch" || visibleFacts?.status === "complete") &&
        !humanAccepted ? (
          <div className="mt-4 rounded-lg border border-blue-300 bg-blue-50 p-4">
            <h3 className="font-bold">
              Photo set review · Combined photo coverage
            </h3>
            <p className="mt-1 text-sm text-blue-950">
              Review all {activePhotos.length}{" "}
              {activePhotos.length === 1 ? "photo" : "photos"} together. Only
              missing or unclear checklist items appear below.
            </p>
            {missingCoverage.length ? (
              <>
                <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">
                  <p className="text-sm font-bold">Missing or unclear</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {missingCoverage.map((fact) => (
                      <li key={fact.criterionKey}>• {fact.label}</li>
                    ))}
                  </ul>
                </div>
                <button
                  type="button"
                  disabled={
                    busy ||
                    activePhotos.length >= 5 ||
                    !completedFactReviews.length
                  }
                  onClick={() => void prepareComplement()}
                  className={`mt-4 ${primary}`}
                >
                  Take another angle for {missingCoverage[0]?.label}
                </button>
                {activePhotos.length >= 5 ? (
                  <p className="mt-2 text-xs font-semibold text-amber-900">
                    Five photos is the limit for one checklist step. Replace a
                    photo or document an office follow-up.
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p className="mt-1 text-sm text-emerald-950">
                  {activePhotos.length}{" "}
                  {activePhotos.length === 1 ? "photo covers" : "photos cover"}{" "}
                  every requested item.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={acceptPhotoSet}
                  className={`mt-4 ${primary}`}
                >
                  Looks right—continue
                </button>
              </>
            )}
            <details className="mt-3 text-sm text-blue-950">
              <summary className="cursor-pointer font-bold underline">
                Review all photo results
              </summary>
              <ul className="mt-2 space-y-1">
                {aggregateCoverage.map((fact) => (
                  <li key={fact.criterionKey}>
                    {fact.sourcePhotoId ? "✓" : "?"} {fact.label}
                  </li>
                ))}
              </ul>
            </details>
            <button
              type="button"
              disabled={busy}
              onClick={prepareRetake}
              className={`mt-3 ${secondary}`}
            >
              Replace this photo
            </button>
          </div>
        ) : null}
        {captureIntent ? (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <strong>
              {captureIntent.kind === "complement"
                ? "Add another view"
                : "Replace selected photo"}
            </strong>
            <p className="mt-1 text-sm text-amber-950">
              {captureIntent.kind === "complement"
                ? "The existing photos stay attached to this step."
                : "The selected photo stays in place until the replacement uploads successfully."}
            </p>
            <PhotoSourceControls
              title={
                captureIntent.kind === "complement"
                  ? "Add photo"
                  : "Replacement photo"
              }
              busy={busy}
              uploadPhoto={uploadPhoto}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => setCaptureIntent(null)}
              className="mt-3 text-sm font-bold underline"
            >
              Cancel
            </button>
          </div>
        ) : null}
        {!captureIntent &&
        captureMode === "guided" &&
        reviewPhotoReady &&
        (visibleFacts || correctingFacts) &&
        !humanAccepted ? (
          <VisibleFactReviewCard
            current={current}
            review={visibleFacts}
            draft={
              visibleFacts?.status === "complete"
                ? (factOverrides[visibleFacts.reviewId] ?? factDraft)
                : factDraft
            }
            correcting={correctingFacts}
            busy={busy}
            onAccept={acceptPhotoSet}
            onCorrect={() => {
              if (visibleFacts?.status === "complete") {
                setFactDraft(
                  factOverrides[visibleFacts.reviewId] ??
                    Object.fromEntries(
                      visibleFacts.criteria.map((fact) => [
                        fact.criterionKey,
                        fact.status,
                      ]),
                    ),
                );
                setCorrectingFacts(true);
                setHumanAccepted(false);
              }
            }}
            onManualFallback={() => void beginManualFactCheck()}
            onDraftChange={(key, status) =>
              setFactDraft({ ...factDraft, [key]: status })
            }
            onAcceptCorrections={acceptCorrections}
            onRetry={() =>
              activePhotoId &&
              (visibleFacts?.status === "unavailable" &&
              visibleFacts.mode === "manual"
                ? void beginManualFactCheck()
                : void reviewVisibleFacts(activePhotoId))
            }
            onRetake={() => {
              setHumanAccepted(false);
              setFactReview(null);
              setFactDraft({});
              setCorrectingFacts(false);
            }}
            uploadPhoto={uploadPhoto}
          />
        ) : null}
        {humanAccepted ? (
          <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">
            <strong>Photo set checked · {activePhotos.length} photos.</strong>{" "}
            Finish the field facts below, or review the photos if anything
            changes.
            <PhotoSourceControls
              title="Retake photo"
              busy={busy}
              uploadPhoto={uploadPhoto}
              onSelect={() => setHumanAccepted(false)}
            />
          </div>
        ) : null}
        {humanAccepted ? (
          <>
            <div
              role="status"
              className="mt-4 rounded-lg border border-blue-300 bg-blue-50 p-4 text-sm leading-6 text-blue-950"
            >
              <strong>Your check is required.</strong> The photo review is only
              a visibility check. Confirm the requested area yourself; all
              measurements must come from the field.
              <p className="mt-2 font-bold">Make sure the photo includes:</p>
              <ul className="mt-1 list-disc pl-5">
                {(INCLUDE[current.itemKey] ?? []).map((criterion) => (
                  <li key={criterion}>{criterion}</li>
                ))}
              </ul>
            </div>
            <ManualConfirmation
              current={current}
              condition={condition}
              setCondition={setCondition}
              measurements={measurements}
              setMeasurements={setMeasurements}
            />
          </>
        ) : null}
        {progress !== null ? (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-blue-700"
              style={{ width: `${progress}%` }}
            />
          </div>
        ) : null}
        {error ? <ErrorMessage message={error} /> : null}
        {humanAccepted ? (
          <div className="mt-5">
            <button
              type="button"
              disabled={!requirementSatisfied || busy}
              onClick={() => void confirmItem()}
              className={primary}
            >
              I confirm this capture
            </button>
          </div>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => setBlockOpen(!blockOpen)}
          className="mt-4 text-sm font-bold text-amber-900 underline"
        >
          Cannot capture this
        </button>
        {blockOpen ? (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <p className="font-bold text-amber-950">
              Document office follow-up
            </p>
            <p className="mt-1 text-sm text-amber-900">
              This item will remain blocked. Record why it could not be
              completed.
            </p>
            <label className="mt-3 block text-sm font-bold">
              Reason
              <select
                className={input}
                value={blockReason}
                onChange={(event) => setBlockReason(event.target.value)}
              >
                <option value="">Choose reason</option>
                {BLOCK_REASONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-sm font-bold">
              What the office needs to know
              <textarea
                className={`${input} min-h-24`}
                value={blockNotes}
                onChange={(event) => setBlockNotes(event.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={!blockReason || !blockNotes.trim() || busy}
              onClick={() => void blockItem()}
              className={`mt-4 ${primary}`}
            >
              Save blocked reason
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PhotoReviewStatus({
  review,
  busy,
  onAccept,
  onRetry,
  onRetake,
  uploadPhoto,
}: {
  review:
    | { status: "reviewing" }
    | { status: "complete"; verdict: UsabilityVerdict; issueCodes: string[] }
    | null;
  busy: boolean;
  onAccept: () => void;
  onRetry: () => void;
  onRetake: () => void;
  uploadPhoto: (file: File) => Promise<void>;
}) {
  if (!review || review.status === "reviewing")
    return (
      <div
        role="status"
        className="mt-4 rounded-lg border border-blue-300 bg-blue-50 p-4 text-blue-950"
      >
        <p className="font-bold">Reviewing photo…</p>
        <p className="mt-1 text-sm">
          Checking whether the requested area is clear enough to inspect.
        </p>
      </div>
    );
  if (review.verdict === "usable")
    return (
      <div
        role="status"
        className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-950"
      >
        <p className="text-lg font-bold">Photo is clear</p>
        <p className="mt-1 text-sm">
          Next, check what requested items the photo actually shows.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={onAccept}
          className={`mt-4 ${primary}`}
        >
          Check visible items
        </button>
        <PhotoSourceControls
          title="Retake photo"
          busy={busy}
          uploadPhoto={uploadPhoto}
          onSelect={onRetake}
        />
      </div>
    );
  const guidance = REVIEW_GUIDANCE[review.issueCodes[0]];
  if (review.verdict === "retake_recommended")
    return (
      <div
        role="status"
        className="mt-4 rounded-lg border border-amber-400 bg-amber-50 p-4 text-amber-950"
      >
        <p className="text-lg font-bold">Retake recommended</p>
        <p className="mt-1 text-sm">
          <strong>
            {guidance?.reason ??
              "The requested area is not clear enough to check."}
          </strong>{" "}
          {guidance?.action ??
            "Take another photo that clearly shows every requested item."}
        </p>
        <PhotoSourceControls
          title="Retake photo"
          busy={busy}
          uploadPhoto={uploadPhoto}
          onSelect={onRetake}
          cameraPrimary
        />
      </div>
    );
  const unable = guidance ?? REVIEW_GUIDANCE.review_unavailable;
  return (
    <div
      role="status"
      className="mt-4 rounded-lg border border-slate-300 bg-slate-50 p-4 text-slate-950"
    >
      <p className="text-lg font-bold">Couldn’t review</p>
      <p className="mt-1 text-sm">
        <strong>{unable.reason}</strong> {unable.action}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={onRetry}
        className={`mt-4 ${primary}`}
      >
        Retry review
      </button>
      <PhotoSourceControls
        title="Retake photo"
        busy={busy}
        uploadPhoto={uploadPhoto}
        onSelect={onRetake}
      />
    </div>
  );
}

function VisibleFactReviewCard({
  current,
  review,
  draft,
  correcting,
  busy,
  onAccept,
  onCorrect,
  onManualFallback,
  onDraftChange,
  onAcceptCorrections,
  onRetry,
  onRetake,
  uploadPhoto,
}: {
  current: VisitItem;
  review:
    | { status: "reviewing" }
    | { status: "unavailable"; mode: "ai" | "manual" }
    | {
        status: "complete";
        reviewId: string;
        sourceMode: "ai" | "manual";
        criteria: VisibleCriterion[];
        recommendedNextCapture: VisibleFactReview["recommendedNextCapture"];
      }
    | null;
  draft: Record<string, VisibleFactStatus>;
  correcting: boolean;
  busy: boolean;
  onAccept: () => void;
  onCorrect: () => void;
  onManualFallback: () => void;
  onDraftChange: (key: string, status: VisibleFactStatus) => void;
  onAcceptCorrections: () => void;
  onRetry: () => void;
  onRetake: () => void;
  uploadPhoto: (file: File) => Promise<void>;
}) {
  const declared = GUIDED_VISIBLE_FACT_CRITERIA[current.itemKey] ?? [];
  if (review?.status === "reviewing")
    return (
      <div
        role="status"
        className="mt-4 rounded-lg border border-blue-300 bg-blue-50 p-4 text-blue-950"
      >
        <p className="font-bold">Checking what the photo shows…</p>
        <p className="mt-1 text-sm">
          AI is checking only the requested visible items. It will not estimate
          measurements or hidden conditions.
        </p>
      </div>
    );
  if (review?.status === "unavailable" && !correcting)
    return (
      <div
        role="status"
        className="mt-4 rounded-lg border border-slate-300 bg-slate-50 p-4"
      >
        <h3 className="font-bold">Visible facts couldn’t be reviewed</h3>
        <p className="mt-1 text-sm text-slate-700">
          Retry, retake the photo, or start a saved manual checklist.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={onRetry}
          className={`mt-4 ${primary}`}
        >
          {review.mode === "manual"
            ? "Retry manual checklist"
            : "Retry AI checklist"}
        </button>
        {review.mode === "ai" ? (
          <button
            type="button"
            disabled={busy}
            onClick={onManualFallback}
            className={`mt-3 ${secondary}`}
          >
            Check photo myself
          </button>
        ) : null}
        <PhotoSourceControls
          title="Retake photo"
          busy={busy}
          uploadPhoto={uploadPhoto}
          onSelect={onRetake}
        />
      </div>
    );
  const criteria =
    review?.status === "complete"
      ? review.criteria
      : declared.map((fact) => ({
          criterionKey: fact.key,
          status: draft[fact.key] ?? ("unclear" as VisibleFactStatus),
        }));
  const allVisible =
    declared.length > 0 &&
    declared.every(
      (fact) =>
        (draft[fact.key] ??
          criteria.find((row) => row.criterionKey === fact.key)?.status) ===
        "visible",
    );
  const recommendation =
    review?.status === "complete" ? review.recommendedNextCapture : null;
  const manual =
    review?.status === "complete" && review.sourceMode === "manual";
  return (
    <div className="mt-4 rounded-lg border border-slate-300 bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-800">
        {manual ? "Saved manual photo checklist" : "AI photo checklist"}
      </p>
      <h3 className="mt-1 text-lg font-bold">Check what the photo shows</h3>
      <p className="mt-1 text-sm text-slate-600">
        {manual
          ? "Mark each requested item yourself before entering field measurements."
          : "AI marked visible items only. Correct anything it got wrong before entering field measurements."}
      </p>
      <div className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200">
        {declared.map((fact) => {
          const status = correcting
            ? (draft[fact.key] ?? "unclear")
            : (draft[fact.key] ??
              criteria.find((row) => row.criterionKey === fact.key)?.status ??
              "unclear");
          return (
            <div key={fact.key} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm font-semibold">{fact.label}</span>
                {!correcting ? (
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${status === "visible" ? "bg-emerald-100 text-emerald-900" : status === "not_visible" ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-800"}`}
                  >
                    {FACT_STATUS_LABELS[status]}
                  </span>
                ) : null}
              </div>
              {correcting ? (
                <div className="mt-2 grid grid-cols-3 gap-1">
                  {(["visible", "not_visible", "unclear"] as const).map(
                    (value) => (
                      <button
                        type="button"
                        key={value}
                        disabled={busy}
                        onClick={() => onDraftChange(fact.key, value)}
                        className={`rounded-md border px-2 py-2 text-xs font-bold ${status === value ? "border-blue-700 bg-blue-50 text-blue-950" : "border-slate-300 bg-white text-slate-700"}`}
                      >
                        {FACT_STATUS_LABELS[value]}
                      </button>
                    ),
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {recommendation ? (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
          <strong>Better photo:</strong>{" "}
          {NEXT_CAPTURE_LABELS[recommendation.actionCode]} to show{" "}
          {declared
            .find((fact) => fact.key === recommendation.criterionKey)
            ?.label.toLowerCase() ?? "the missing item"}
          .
        </p>
      ) : null}
      {correcting ? (
        <>
          <button
            type="button"
            disabled={busy || declared.some((fact) => !draft[fact.key])}
            onClick={onAcceptCorrections}
            className={`mt-4 ${primary}`}
          >
            Save this photo checklist
          </button>
          {!allVisible ? (
            <p className="mt-2 text-xs font-semibold text-amber-900">
              Missing items can be covered by another photo. Keep unclear or not
              visible when that is the honest result.
            </p>
          ) : null}
        </>
      ) : (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          {allVisible ? (
            <button
              type="button"
              disabled={busy}
              onClick={onAccept}
              className={primary}
            >
              Looks right
            </button>
          ) : (
            <p className="text-sm font-semibold text-amber-900">
              A requested item is missing or unclear. Retake below or correct
              the results.
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onCorrect}
            className={secondary}
          >
            Correct results
          </button>
        </div>
      )}
      <PhotoSourceControls
        title="Retake photo"
        busy={busy}
        uploadPhoto={uploadPhoto}
        onSelect={onRetake}
      />
    </div>
  );
}

function PhotoSourceControls({
  title,
  busy,
  uploadPhoto,
  onSelect,
  cameraPrimary = true,
  busyLabel,
}: {
  title: string;
  busy: boolean;
  uploadPhoto: (file: File) => Promise<void>;
  onSelect?: () => void;
  cameraPrimary?: boolean;
  busyLabel?: string;
}) {
  const choose = (file: File | undefined) => {
    if (file) {
      onSelect?.();
      void uploadPhoto(file);
    }
  };
  const busyStyle = busy ? "cursor-not-allowed opacity-50" : "cursor-pointer";
  return (
    <fieldset disabled={busy} aria-busy={busy} className="mt-4">
      <legend className="text-sm font-bold">{title}</legend>
      {busy ? (
        <p
          role="status"
          className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"
        >
          {busyLabel ?? "Uploading photo…"} Photo choices are unavailable until
          this finishes.
        </p>
      ) : null}
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <label
          className={`${cameraPrimary ? primary : secondary} ${busyStyle} text-center`}
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            capture="environment"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              choose(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          Take photo
        </label>
        <label className={`${secondary} ${busyStyle} text-center`}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              choose(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          Choose existing photo
        </label>
      </div>
    </fieldset>
  );
}

function BatchPhotoCapture({
  drafts,
  busy,
  activeCount,
  progress,
  onAdd,
  onRemove,
  onUpload,
}: {
  drafts: BatchDraftPhoto[];
  busy: boolean;
  activeCount: number;
  progress: { current: number; total: number; percent: number } | null;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onUpload: () => void;
}) {
  const atLimit = activeCount + drafts.length >= MAX_ACTIVE_PHOTOS;
  const choose = (files: FileList | null) => {
    if (files?.length) onAdd(Array.from(files));
  };
  return (
    <div className="mt-4 rounded-lg border border-slate-300 bg-white p-4">
      <h3 className="font-bold">Add the photos for this checklist step</h3>
      <p className="mt-1 text-sm text-slate-600">
        Take photos one after another or choose several from your phone. Nothing
        uploads until you review the tray.
      </p>
      <fieldset disabled={busy || atLimit} aria-busy={busy} className="mt-3">
        <legend className="sr-only">Add photos to the local tray</legend>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label
            className={`${primary} ${busy || atLimit ? "cursor-not-allowed opacity-50" : "cursor-pointer"} text-center`}
          >
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              capture="environment"
              className="sr-only"
              disabled={busy || atLimit}
              onChange={(event) => {
                choose(event.target.files);
                event.target.value = "";
              }}
            />
            Take photo
          </label>
          <label
            className={`${secondary} ${busy || atLimit ? "cursor-not-allowed opacity-50" : "cursor-pointer"} text-center`}
          >
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              className="sr-only"
              disabled={busy || atLimit}
              onChange={(event) => {
                choose(event.target.files);
                event.target.value = "";
              }}
            />
            Choose photos
          </label>
        </div>
      </fieldset>
      {drafts.length ? (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <strong className="text-sm">
              Ready to upload · {drafts.length}
            </strong>
            <span className="text-xs font-semibold text-slate-600">
              {activeCount + drafts.length} of {MAX_ACTIVE_PHOTOS}
            </span>
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {drafts.map((draft, index) => (
              <li
                key={draft.id}
                className="overflow-hidden rounded-lg border border-slate-300 bg-slate-50"
              >
                {/* Blob previews are local-only and cannot use the Next image optimizer. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={draft.url}
                  alt={`Queued photo ${index + 1}`}
                  className="h-28 w-full object-cover"
                />
                <div className="p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <strong>Photo {index + 1}</strong>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onRemove(draft.id)}
                      className="font-bold text-red-800 underline disabled:opacity-50"
                      aria-label={`Remove photo ${index + 1}`}
                    >
                      Remove
                    </button>
                  </div>
                  {draft.status === "failed" ? (
                    <p className="mt-1 font-semibold text-red-800">
                      Upload failed · retry
                    </p>
                  ) : draft.status === "uploading" ? (
                    <p className="mt-1 font-semibold text-blue-800">
                      Uploading…
                    </p>
                  ) : null}
                  {draft.file.type === "image/heic" ||
                  draft.file.type === "image/heif" ? (
                    <p className="mt-1 font-semibold text-amber-900">
                      HEIC/HEIF needs your manual visibility check.
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={busy || !drafts.length}
            onClick={onUpload}
            className={`mt-4 ${primary}`}
          >
            {busy && progress
              ? `Uploading photo ${progress.current} of ${progress.total} · ${progress.percent}%`
              : `Upload ${drafts.length} ${drafts.length === 1 ? "photo" : "photos"}`}
          </button>
          {progress ? (
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"
              aria-hidden="true"
            >
              <div
                className="h-full bg-blue-700"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          ) : null}
          <p className="mt-2 text-xs text-slate-600">
            Confirmed uploads are saved one at a time. If one fails, earlier
            photos stay saved and the remaining tray can be retried.
          </p>
        </div>
      ) : atLimit ? (
        <p className="mt-3 text-sm font-semibold text-amber-900">
          Five photos is the limit for one checklist step.
        </p>
      ) : null}
    </div>
  );
}

function ManualConfirmation({
  current,
  condition,
  setCondition,
  measurements,
  setMeasurements,
}: {
  current: VisitItem;
  condition: string;
  setCondition: (value: "yes" | "no" | "") => void;
  measurements: Record<string, MeasurementDraft>;
  setMeasurements: (value: Record<string, MeasurementDraft>) => void;
}) {
  const conditional = current.requirement.mode === "conditional";
  const showFields =
    current.requirement.mode === "required_measurements" ||
    (conditional && condition === "yes");
  return (
    <div className="mt-4 rounded-lg border border-slate-300 p-4">
      <h3 className="font-bold">Check photo and field facts</h3>
      {conditional ? (
        <fieldset className="mt-3">
          <legend className="text-sm font-bold">
            {CONDITIONS[current.requirement.when ?? ""]?.prompt ??
              "Does this condition apply?"}
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(["yes", "no"] as const).map((value) => (
              <label
                key={value}
                className="flex items-center gap-2 rounded-lg border border-slate-300 p-3 text-sm font-semibold"
              >
                <input
                  type="radio"
                  name={`condition-${current.id}`}
                  checked={condition === value}
                  onChange={() => setCondition(value)}
                />
                {value === "yes"
                  ? (CONDITIONS[current.requirement.when ?? ""]?.yes ?? "Yes")
                  : (CONDITIONS[current.requirement.when ?? ""]?.no ?? "No")}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {showFields ? (
        <div className="mt-4 grid gap-4">
          {(current.requirement.fields ?? []).map((field) => (
            <MeasurementField
              key={field}
              field={field}
              draft={measurements[field]}
              onChange={(draft) =>
                setMeasurements({ ...measurements, [field]: draft })
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MeasurementField({
  field,
  draft,
  onChange,
}: {
  field: string;
  draft?: MeasurementDraft;
  onChange: (draft: MeasurementDraft) => void;
}) {
  const parts = COMPOSITE_FIELDS[field];
  if (parts)
    return (
      <fieldset>
        <legend className="text-sm font-bold">{FIELD_LABELS[field]}</legend>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          {FIELD_GUIDANCE[field]}
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {parts.map((part, index) => (
            <label key={part} className="text-xs font-bold">
              {part}
              <input
                aria-label={part}
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                className={input}
                value={draft?.components?.[index] ?? ""}
                onChange={(event) => {
                  const components = [...(draft?.components ?? [])];
                  components[index] = event.target.value;
                  onChange({
                    value: components.join(" × "),
                    unit: draft?.unit ?? "",
                    components,
                  });
                }}
                placeholder="Number"
              />
            </label>
          ))}
        </div>
        <UnitSelect
          field={field}
          value={draft?.unit ?? ""}
          onChange={(unit) =>
            onChange({
              ...draft,
              value: draft?.value ?? "",
              unit,
              components: draft?.components ?? [],
            })
          }
          units={COMPOSITE_UNITS}
        />
      </fieldset>
    );
  const mixed = draft?.unit === "ft + in";
  return (
    <fieldset>
      <legend className="text-sm font-bold">
        {FIELD_LABELS[field] ?? field}
      </legend>
      <p className="mt-1 text-xs leading-5 text-slate-600">
        {FIELD_GUIDANCE[field]}
      </p>
      {mixed ? (
        <div className="grid grid-cols-2 gap-2">
          <input
            aria-label={`${FIELD_LABELS[field]} feet`}
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            className={input}
            value={draft?.feet ?? ""}
            onChange={(event) =>
              onChange({
                ...draft,
                feet: event.target.value,
                value: `${event.target.value} ft ${draft?.inches ?? ""} in`,
                unit: "ft + in",
              })
            }
            placeholder="Feet"
          />
          <input
            aria-label={`${FIELD_LABELS[field]} inches`}
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            className={input}
            value={draft?.inches ?? ""}
            onChange={(event) =>
              onChange({
                ...draft,
                inches: event.target.value,
                value: `${draft?.feet ?? ""} ft ${event.target.value} in`,
                unit: "ft + in",
              })
            }
            placeholder="Inches"
          />
        </div>
      ) : (
        <input
          aria-label={`${FIELD_LABELS[field] ?? field} value`}
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          className={input}
          value={draft?.value ?? ""}
          onChange={(event) =>
            onChange({ value: event.target.value, unit: draft?.unit ?? "" })
          }
          placeholder="Number"
        />
      )}
      <UnitSelect
        field={field}
        value={draft?.unit ?? ""}
        onChange={(unit) =>
          onChange({
            value: unit === "ft + in" ? "" : (draft?.value ?? ""),
            unit,
            feet: "",
            inches: "",
          })
        }
        units={longField(field) ? LONG_UNITS : DETAIL_UNITS}
      />
    </fieldset>
  );
}

function UnitSelect({
  field,
  value,
  onChange,
  units,
}: {
  field: string;
  value: string;
  onChange: (unit: string) => void;
  units: readonly string[];
}) {
  return (
    <label className="mt-2 block text-xs font-bold">
      Unit
      <select
        aria-label={`${FIELD_LABELS[field] ?? field} unit`}
        className={input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose unit</option>
        {units.map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
      </select>
    </label>
  );
}

function VisitSummary({ visit }: { visit: Visit }) {
  return (
    <ol className="mt-5 divide-y divide-slate-200 rounded-lg border border-slate-200">
      {visit.items.map((item) => {
        const measurementCount =
          item.observation?.measurements &&
          typeof item.observation.measurements === "object"
            ? Object.keys(item.observation.measurements).length
            : 0;
        return (
          <li key={item.id} className="p-3 text-sm">
            <div className="flex items-center gap-3">
              <span className="font-bold">{item.ordinal}</span>
              <span className="min-w-0 flex-1 font-semibold">{item.title}</span>
              <span
                className={`rounded-full px-2 py-1 text-xs font-bold ${item.state === "confirmed" ? "bg-emerald-100 text-emerald-900" : item.state === "documented_follow_up" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}
              >
                {item.state === "confirmed"
                  ? "Passed"
                  : item.state === "documented_follow_up"
                    ? "Blocked"
                    : "Incomplete"}
              </span>
            </div>
            {measurementCount ? (
              <p className="mt-1 pl-7 text-xs text-slate-600">
                {measurementCount} field{" "}
                {measurementCount === 1 ? "measurement" : "measurements"}{" "}
                recorded
              </p>
            ) : null}
            {item.state === "documented_follow_up" ? (
              <p className="mt-1 pl-7 text-xs font-semibold text-amber-900">
                {blockReasonLabel(item.followUpReasonCode)}:{" "}
                {item.followUpNotes}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
function BetaWarning() {
  return (
    <div
      role="alert"
      className="border-b-2 border-amber-500 bg-amber-100 p-4 text-sm leading-6 text-amber-950"
    >
      <strong className="block uppercase tracking-[.14em]">
        Field beta limitations
      </strong>
      Photos document visible conditions only. No automatic engineering, code,
      load, material, labor, measurement, or pricing decision is made. Michael
      must verify every field fact.
    </div>
  );
}
function ErrorMessage({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800"
    >
      {message} Retry or document why this capture is blocked.
    </p>
  );
}
function blockReasonLabel(value: string | null) {
  return (
    BLOCK_REASONS.find(([key]) => key === value)?.[1] ?? "Office follow-up"
  );
}
function isUsabilityVerdict(value: unknown): value is UsabilityVerdict {
  return (
    value === "usable" ||
    value === "retake_recommended" ||
    value === "unable_to_assess"
  );
}
function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
function longField(field: string) {
  return [
    "length",
    "width",
    "height_from_grade",
    "ledger_length",
    "support_spacing",
    "stair_width",
    "total_rise",
    "landing_dimensions",
    "rail_lengths_by_area",
    "narrow_access_width",
    "gate_width",
    "clearance",
    "obstruction_clearances",
  ].includes(field);
}
function measurementComplete(field: string, draft?: MeasurementDraft) {
  if (!draft?.unit) return false;
  if (COMPOSITE_FIELDS[field])
    return COMPOSITE_FIELDS[field].every((_, index) =>
      draft.components?.[index]?.trim(),
    );
  return draft.unit === "ft + in"
    ? Boolean(draft.feet?.trim() && draft.inches?.trim())
    : Boolean(draft.value.trim());
}
function serializeMeasurements(
  fields: string[],
  drafts: Record<string, MeasurementDraft>,
) {
  return Object.fromEntries(
    fields.map((field) => {
      const draft = drafts[field];
      const value = COMPOSITE_FIELDS[field]
        ? draft.components!.map((part) => part.trim()).join(" × ")
        : draft.unit === "ft + in"
          ? `${draft.feet!.trim()} ft ${draft.inches!.trim()} in`
          : draft.value.trim();
      return [field, { value, unit: draft.unit }];
    }),
  );
}
function initialReviewKey(photoId: string) {
  return `guided-photo-usability:${photoId}:initial`;
}
function initialFactReviewKey(photoId: string) {
  return `guided-visible-facts:${photoId}:initial`;
}
function latestUsabilityReview(reviews: UsabilityReview[]) {
  return reviews.reduce<UsabilityReview | null>(
    (latest, review) =>
      !latest ||
      review.createdAt > latest.createdAt ||
      (review.createdAt === latest.createdAt && review.id > latest.id)
        ? review
        : latest,
    null,
  );
}
function latestVisibleFactReview(reviews: VisibleFactReview[]) {
  return reviews.reduce<VisibleFactReview | null>(
    (latest, review) =>
      !latest ||
      review.createdAt > latest.createdAt ||
      (review.createdAt === latest.createdAt && review.id > latest.id)
        ? review
        : latest,
    null,
  );
}
function normalizeVisibleCriteria(value: unknown): VisibleCriterion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    return typeof row.criterionKey === "string" &&
      isVisibleFactStatus(row.status)
      ? [{ criterionKey: row.criterionKey, status: row.status }]
      : [];
  });
}
function normalizeRecommendation(
  value: unknown,
): VisibleFactReview["recommendedNextCapture"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return typeof row.criterionKey === "string" &&
    typeof row.actionCode === "string" &&
    isNextCaptureAction(row.actionCode)
    ? { criterionKey: row.criterionKey, actionCode: row.actionCode }
    : null;
}
function isVisibleFactStatus(value: unknown): value is VisibleFactStatus {
  return value === "visible" || value === "not_visible" || value === "unclear";
}
function isNextCaptureAction(value: unknown): value is NextCaptureAction {
  return (
    value === "move_closer" ||
    value === "step_back" ||
    value === "change_angle" ||
    value === "add_light" ||
    value === "remove_obstruction" ||
    value === "show_other_end"
  );
}

async function jsonRequest(
  path: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
) {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as Record<string, unknown>;
  if (!response.ok || result.success !== true)
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : `Request failed (${String(result.resultCode ?? response.status)}). Reload and retry.`,
    );
  return result;
}
function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (value: number) => void,
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
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error("Private photo upload failed."));
    request.onerror = () =>
      reject(new Error("Network error during private photo upload."));
    request.send(body);
  });
}
function normalizeVisit(raw: Record<string, unknown>): Visit {
  const rawItems = (raw.items as Record<string, unknown>[]) ?? [];
  const items = rawItems.map((item) => ({
    id: String(item.id),
    itemKey: String(item.itemKey ?? item.item_key),
    ordinal: Number(item.ordinal),
    title: String(item.title),
    instructions: String(item.instructions),
    requirement: item.requirement as Requirement,
    state: String(item.state) as VisitItem["state"],
    observation: (item.observation as Record<string, unknown>) ?? {},
    followUpReasonCode: (item.followUpReasonCode ??
      item.follow_up_reason_code ??
      null) as string | null,
    followUpNotes: (item.followUpNotes ?? item.follow_up_notes ?? null) as
      string | null,
  }));
  const visitPhotos = (raw.photoAttempts ?? raw.photo_attempts ?? []) as Record<
    string,
    unknown
  >[];
  const itemPhotos = rawItems.flatMap(
    (item) =>
      (item.photoAttempts ?? item.photo_attempts ?? []) as Record<
        string,
        unknown
      >[],
  );
  const photoAttempts = visitPhotos.length ? visitPhotos : itemPhotos;
  return {
    id: String(raw.id),
    revision: Number(raw.revision),
    status: String(raw.status) as Visit["status"],
    completionOutcome: (raw.completionOutcome ??
      raw.completion_outcome ??
      null) as Visit["completionOutcome"],
    items,
    photoAttempts: photoAttempts.map((photo) => {
      const reviews = (photo.usabilityReviews ??
        photo.usability_reviews ??
        []) as Record<string, unknown>[];
      const factReviews = (photo.visibleFactReviews ??
        photo.visible_fact_reviews ??
        []) as Record<string, unknown>[];
      return {
        id: String(photo.id),
        visitItemId: String(photo.visitItemId ?? photo.visit_item_id),
        retakeOfAttemptId: (photo.retakeOfAttemptId ??
          photo.retake_of_attempt_id ??
          null) as string | null,
        ordinal: Number(photo.ordinal),
        state: String(photo.state) as PhotoAttempt["state"],
        usabilityReviews: reviews.flatMap((review) =>
          isUsabilityVerdict(review.verdict)
            ? [
                {
                  id: String(review.id),
                  verdict: review.verdict,
                  issueCodes: stringArray(
                    review.issueCodes ?? review.issue_codes,
                  ),
                  createdAt: String(
                    review.createdAt ?? review.created_at ?? "",
                  ),
                },
              ]
            : [],
        ),
        visibleFactReviews: factReviews.flatMap((review) => {
          const criteria = normalizeVisibleCriteria(review.criteria);
          return typeof review.id === "string" && criteria.length
            ? [
                {
                  id: review.id,
                  sourceMode: review.sourceMode === "manual" ? "manual" : "ai",
                  criteria,
                  recommendedNextCapture: normalizeRecommendation(
                    review.recommendedNextCapture ??
                      review.recommended_next_capture,
                  ),
                  createdAt: String(
                    review.createdAt ?? review.created_at ?? "",
                  ),
                },
              ]
            : [];
        }),
      };
    }),
  };
}
