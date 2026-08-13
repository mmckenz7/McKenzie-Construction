"use client";

import { useCallback, useEffect, useState } from "react";
import {
  GUIDED_VISIBLE_FACT_CRITERIA,
  type NextCaptureAction,
  type VisibleFactStatus,
} from "@/lib/guided-site-visits/visible-fact-criteria";

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
  const [error, setError] = useState("");
  const [measurements, setMeasurements] = useState<
    Record<string, MeasurementDraft>
  >({});
  const [condition, setCondition] = useState<"yes" | "no" | "">("");
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [blockNotes, setBlockNotes] = useState("");
  const [localPhoto, setLocalPhoto] = useState<string | null>(null);
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
  const [correctingFacts, setCorrectingFacts] = useState(false);
  const [humanAccepted, setHumanAccepted] = useState(false);

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
    setVisit(normalizeVisit(body.visit));
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
      window.sessionStorage.setItem(
        `guided-deck-visit:${estimateId}`,
        body.visitId,
      );
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
    const visitId = window.sessionStorage.getItem(
      `guided-deck-visit:${estimateId}`,
    );
    if (!visitId) return;
    setBusy(true);
    void loadVisit(visitId)
      .catch(() =>
        window.sessionStorage.removeItem(`guided-deck-visit:${estimateId}`),
      )
      .finally(() => setBusy(false));
  }, [estimateId, loadVisit]);
  useEffect(
    () => () => {
      if (localPhoto) URL.revokeObjectURL(localPhoto);
    },
    [localPhoto],
  );

  const current = visit?.items.find((item) => item.state === "pending") ?? null;
  const attempts =
    current && visit
      ? visit.photoAttempts.filter((photo) => photo.visitItemId === current.id)
      : [];
  const storedPhoto =
    [...attempts].reverse().find((photo) => photo.state === "confirmed") ??
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

  async function uploadPhoto(file: File) {
    if (!visit || !current || busy) return;
    const retakeEvidence =
      visibleFacts?.status === "complete" &&
      visibleFacts.criteria.some((fact) => fact.status !== "visible") &&
      visibleFacts.recommendedNextCapture
        ? visibleFacts
        : null;
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
      let expectedRevision = pendingPhoto?.revision ?? visit.revision;
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
        if (typeof decision.nextRevision !== "number")
          throw new Error("Retake decision response was invalid.");
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
          originalFilename: file.name || `deck-capture-${current.ordinal}.jpg`,
          mimeType: file.type,
          byteSize: file.size,
          sha256,
          retakeOfAttemptId: pendingPhoto?.id ?? storedPhoto?.id ?? null,
        },
      );
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
      if (localPhoto) URL.revokeObjectURL(localPhoto);
      setLocalPhoto(URL.createObjectURL(file));
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
      setFactReview(null);
      setFactDraft({});
      setCorrectingFacts(false);
      setLocalReview({ photoId: reserve.attemptId, status: "reviewing" });
      await reviewPhoto(reserve.attemptId, initialReviewKey(reserve.attemptId));
    } catch (requestError) {
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
  function acceptFacts() {
    if (
      !visibleFacts ||
      visibleFacts.status !== "complete" ||
      visibleFacts.criteria.some((fact) => fact.status !== "visible")
    )
      return;
    setFactDraft(
      Object.fromEntries(
        visibleFacts.criteria.map((fact) => [fact.criterionKey, fact.status]),
      ),
    );
    setHumanAccepted(true);
    setCorrectingFacts(false);
  }
  function acceptCorrections() {
    const declared = GUIDED_VISIBLE_FACT_CRITERIA[current?.itemKey ?? ""] ?? [];
    if (
      !declared.length ||
      declared.some((fact) => factDraft[fact.key] !== "visible")
    )
      return;
    setHumanAccepted(true);
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
      if (visibleFacts?.status === "complete") {
        const finalCriteria = (
          GUIDED_VISIBLE_FACT_CRITERIA[current.itemKey] ?? []
        ).map((fact) => ({
          criterionKey: fact.key,
          status: factDraft[fact.key] ?? "unclear",
        }));
        const original =
          JSON.stringify(visibleFacts.criteria) ===
          JSON.stringify(finalCriteria);
        await jsonRequest(
          `/api/guided-site-visits/${visit.id}/photos/${activePhotoId}/visible-fact-reviews/${visibleFacts.reviewId}/decision`,
          "POST",
          {
            itemId: current.id,
            expectedRevision,
            idempotencyKey: `guided-visible-facts:${visibleFacts.reviewId}:confirm`,
            decision: original ? "accepted" : "corrected",
            nextAction: "confirm_item",
            finalCriteria,
            recommendedNextCapture: null,
            observation,
          },
        );
      } else
        await jsonRequest(
          `/api/guided-site-visits/${visit.id}/items/${current.id}`,
          "PATCH",
          { expectedRevision, action: "confirm", observation },
        );
      setMeasurements({});
      setCondition("");
      if (localPhoto) URL.revokeObjectURL(localPhoto);
      setLocalPhoto(null);
      setPendingPhoto(null);
      setLocalReview(null);
      setFactReview(null);
      setFactDraft({});
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
      if (localPhoto) URL.revokeObjectURL(localPhoto);
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
          <h2 className="mt-1 text-2xl font-bold">
            Capture everything in one trip
          </h2>
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
            {busy ? "Opening visit…" : "Start or resume Deck visit"}
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
        {/* Blob previews are local-only and cannot use the Next image optimizer. */}
        {localPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={localPhoto}
            alt={`Current ${current.title} capture`}
            className="mt-4 max-h-96 w-full rounded-lg border border-slate-300 object-contain"
          />
        ) : null}{" "}
        {!reviewPhotoReady ? (
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
        {reviewPhotoReady &&
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
        {reviewPhotoReady &&
        (visibleFacts || correctingFacts) &&
        !humanAccepted ? (
          <VisibleFactReviewCard
            current={current}
            review={visibleFacts}
            draft={factDraft}
            correcting={correctingFacts}
            busy={busy}
            onAccept={acceptFacts}
            onCorrect={() => {
              if (visibleFacts?.status === "complete") {
                setFactDraft(
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
            <strong>Photo checklist checked.</strong> Finish the field facts
            below, or retake the photo if anything changes.
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
        (correcting
          ? draft[fact.key]
          : criteria.find((row) => row.criterionKey === fact.key)?.status) ===
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
            : (criteria.find((row) => row.criterionKey === fact.key)?.status ??
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
            disabled={!allVisible || busy}
            onClick={onAcceptCorrections}
            className={`mt-4 ${primary}`}
          >
            I checked—all requested items are visible
          </button>
          {!allVisible ? (
            <p className="mt-2 text-xs font-semibold text-amber-900">
              Retake the photo if an item is not visible or unclear.
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
                  sourceMode:
                    review.sourceMode === "manual" ? "manual" : "ai",
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
