"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  buildPrescriptiveDeckPlan,
  deckEstimatingImmediateIssueIds,
  KNOXVILLE_2024_DECK_PROFILE,
  parseDeckPostDistances,
  parseDeckPostPositions,
  recommendedPrescriptiveDraft,
  type DeckPrescriptiveDraft,
  type DeckPrescriptivePlan,
} from "@/lib/deck-prescriptive-plan";
import type { DeckBlueprintVisitSeed } from "@/lib/deck-takeoff-v0";

const control =
  "mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100";
const button =
  "min-h-11 rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50";
const STEPS = [
  "Confirm facts",
  "Framing draft",
  "Supports & footings",
  "Exceptions",
  "Review plan",
] as const;
type BlueprintFacts = Readonly<{
  attachment: "ledger" | "freestanding" | null;
  stairs: boolean | null;
  railings: boolean | null;
}>;
type BlueprintCallout = Readonly<{
  id: string;
  label: string;
  step: number;
  anchorX: number;
  anchorY: number;
  markerX: number;
  markerY: number;
  kind: "input" | "exception" | "package";
}>;

function draftForFacts(
  facts: BlueprintFacts,
  lengthFeet: number,
  widthFeet: number,
  visitSeed: DeckBlueprintVisitSeed,
) {
  const draft = recommendedPrescriptiveDraft(
    facts.attachment ?? "ledger",
    facts.stairs ?? false,
    lengthFeet,
    widthFeet,
    facts.railings ?? false,
  );
  const seededPostCount =
    visitSeed.estimatingAssumptions.postCount ?? Number(draft.postCount);
  const seededPostPositions = Array.from(
    { length: seededPostCount },
    (_, index) =>
      String((lengthFeet * index) / Math.max(1, seededPostCount - 1)),
  ).join(",");
  return {
    ...draft,
    attachment: facts.attachment ?? "",
    stairsIncluded: facts.stairs === null ? "" : facts.stairs ? "yes" : "no",
    railingsIncluded:
      facts.railings === null ? "" : facts.railings ? "yes" : "no",
    attachmentConfirmed: facts.attachment !== null,
    stairsConfirmed: facts.stairs !== null,
    joistSpacingInches:
      visitSeed.supportedJoistSpacingInches ?? draft.joistSpacingInches,
    joistSize: visitSeed.estimatingAssumptions.joistSize ?? draft.joistSize,
    beamSize: visitSeed.estimatingAssumptions.beamSize ?? draft.beamSize,
    postSize: visitSeed.estimatingAssumptions.postSize ?? draft.postSize,
    postCount: String(seededPostCount),
    postPositionsFeet: seededPostPositions,
    postPlacementMode: "aligned",
    postDistancesFromHouseFeet: Array.from({ length: seededPostCount }, () =>
      String(widthFeet),
    ).join(","),
    postSnapInches: "1",
    postHeightFeet: visitSeed.heightFromGradeFeet
      ? String(visitSeed.heightFromGradeFeet)
      : draft.postHeightFeet,
    jurisdiction: "city_knoxville_estimating_assumption",
    ledgerSubstrate:
      facts.attachment === "ledger"
        ? "estimating_band_rim_assumption"
        : draft.ledgerSubstrate,
    footingDepthInches: draft.footingDepthInches || "24",
    frostBasis:
      "24 in local frost-depth basis — estimating assumption pending AHJ verification",
  } satisfies DeckPrescriptiveDraft;
}
function Field({
  label,
  children,
  help,
}: {
  label: string;
  children: React.ReactNode;
  help?: string;
}) {
  return (
    <label className="block text-sm font-bold text-slate-900">
      <span>{label}</span>
      {children}
      {help ? (
        <span className="mt-1 block text-xs font-normal leading-5 text-slate-600">
          {help}
        </span>
      ) : null}
    </label>
  );
}

export function DeckPrescriptivePlanGenerator({
  lengthFeet,
  widthFeet,
  blueprintAttachment,
  blueprintStairs,
  blueprintRailings,
  stairPlacementConfirmed,
  visitSeed,
  stairEdge = "yard",
  stairPosition = "center",
  stairOffsetFeet = "",
  disabled,
  onApprove,
  onEditStairPlacement,
  onStairPlacementChange,
}: {
  lengthFeet: number;
  widthFeet: number;
  blueprintAttachment: "ledger" | "freestanding" | null;
  blueprintStairs: boolean | null;
  blueprintRailings: boolean | null;
  stairPlacementConfirmed: boolean;
  visitSeed: DeckBlueprintVisitSeed;
  stairEdge?: "left" | "right" | "yard" | "top";
  stairPosition?: "start" | "center" | "end";
  stairOffsetFeet?: string;
  disabled: boolean;
  onApprove: (plan: DeckPrescriptivePlan) => void;
  onEditStairPlacement: () => void;
  onStairPlacementChange: (
    edge: "left" | "right" | "yard" | "top",
    offsetFeet: number,
  ) => void;
}) {
  const facts = useMemo<BlueprintFacts>(
    () => ({
      attachment: blueprintAttachment,
      stairs: blueprintStairs,
      railings: blueprintRailings,
    }),
    [blueprintAttachment, blueprintStairs, blueprintRailings],
  );
  const seedSignature = JSON.stringify(visitSeed);
  const factsSignature = `${lengthFeet}:${widthFeet}:${blueprintAttachment ?? "unknown"}:${blueprintStairs ?? "unknown"}:${blueprintRailings ?? "unknown"}:${stairPlacementConfirmed}:${seedSignature}`;
  const [draft, setDraft] = useState<DeckPrescriptiveDraft>(() =>
    draftForFacts(facts, lengthFeet, widthFeet, visitSeed),
  );
  const [step, setStep] = useState(0);
  const [generated, setGenerated] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pendingFacts, setPendingFacts] = useState<BlueprintFacts | null>(null);
  const [comparisonOnly, setComparisonOnly] = useState(false);
  const [approved, setApproved] = useState(false);
  const [activePackage, setActivePackage] = useState<
    "stairs" | "guards" | "connectors" | null
  >(null);
  const packagePanelRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<SVGSVGElement>(null);
  const [drawingExpanded, setDrawingExpanded] = useState(false);
  const [layoutEditorOpen, setLayoutEditorOpen] = useState(false);
  const [activeDrawingDrag, setActiveDrawingDrag] = useState<Readonly<
    | { type: "beam" }
    | { type: "post"; index: number }
    | { type: "stair" }
    | { type: "corner"; index: number }
  > | null>(null);
  const [outlineMode, setOutlineMode] = useState<"rectangle" | "freeform">(
    "rectangle",
  );
  const [outlinePoints, setOutlinePoints] = useState(() => [
    { x: 0, y: 0 },
    { x: lengthFeet, y: 0 },
    { x: lengthFeet, y: widthFeet },
    { x: 0, y: widthFeet },
  ]);
  const [selectedOutlineEdge, setSelectedOutlineEdge] = useState(0);
  const [proposedLengthFeet, setProposedLengthFeet] = useState(lengthFeet);
  const [proposedWidthFeet, setProposedWidthFeet] = useState(widthFeet);
  const svgTitleId = useId();
  const svgDescriptionId = useId();
  const lastFactsSignature = useRef(factsSignature);
  useEffect(() => {
    if (lastFactsSignature.current === factsSignature) return;
    lastFactsSignature.current = factsSignature;
    if (dirty) {
      setPendingFacts(facts);
      setComparisonOnly(false);
      setApproved(false);
    } else {
      setProposedLengthFeet(lengthFeet);
      setProposedWidthFeet(widthFeet);
      setDraft(draftForFacts(facts, lengthFeet, widthFeet, visitSeed));
    }
  }, [dirty, facts, factsSignature, lengthFeet, visitSeed, widthFeet]);
  const plan = useMemo(
    () =>
      buildPrescriptiveDeckPlan({
        lengthFeet: proposedLengthFeet,
        widthFeet: proposedWidthFeet,
        draft,
      }),
    [proposedLengthFeet, proposedWidthFeet, draft],
  );
  const set = <K extends keyof DeckPrescriptiveDraft>(
    key: K,
    value: DeckPrescriptiveDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setApproved(false);
  };
  const joists =
    plan.quantities?.joists ??
    Math.max(
      2,
      Math.ceil(
        (proposedLengthFeet * 12) / Number(draft.joistSpacingInches || 16),
      ) + 1,
    );
  const beamLines = Math.max(1, Number(draft.beamLineCount || 1));
  const posts = Math.max(1, Number(draft.postCount || 1));
  const postPositions =
    parseDeckPostPositions(draft.postPositionsFeet, proposedLengthFeet) ??
    Array.from(
      { length: posts },
      (_, index) => (proposedLengthFeet * index) / Math.max(1, posts - 1),
    );
  const beamDistance = Number(
    draft.beamDistanceFromHouseFeet || proposedWidthFeet,
  );
  const postDistances =
    parseDeckPostDistances(
      draft.postDistancesFromHouseFeet,
      proposedWidthFeet,
      posts,
    ) ?? Array.from({ length: posts }, () => beamDistance);
  const beamY =
    20 +
    (150 * Math.min(proposedWidthFeet, Math.max(0, beamDistance))) /
      Math.max(0.1, proposedWidthFeet);
  const stairWidthFeet = (() => {
    const found = visitSeed.observedMeasurements.find(
      (item) => item.key === "stair_width",
    );
    if (!found) return 3;
    const n = Number(found.value);
    return Number.isFinite(n) && n > 0
      ? found.unit.toLowerCase().startsWith("in")
        ? n / 12
        : n
      : 3;
  })();
  const stairEdgeLength =
    stairEdge === "left" || stairEdge === "right"
      ? proposedWidthFeet
      : proposedLengthFeet;
  const legacyStairOffset =
    stairPosition === "start"
      ? stairWidthFeet / 2
      : stairPosition === "end"
        ? stairEdgeLength - stairWidthFeet / 2
        : stairEdgeLength / 2;
  const stairOffset =
    Number(stairOffsetFeet) > 0 ? Number(stairOffsetFeet) : legacyStairOffset;
  const stairAlong =
    30 + (260 * stairOffset) / Math.max(0.1, proposedLengthFeet) - 20;
  const stairAcross =
    20 + (150 * stairOffset) / Math.max(0.1, proposedWidthFeet) - 20;
  const callouts = useMemo<BlueprintCallout[]>(() => {
    const values: BlueprintCallout[] = [];
    const add = (value: BlueprintCallout) => {
      if (!values.some((item) => item.id === value.id)) values.push(value);
    };
    const immediateIssues = new Set(
      deckEstimatingImmediateIssueIds({
        lengthFeet: proposedLengthFeet,
        widthFeet: proposedWidthFeet,
        draft,
        stairPlacementConfirmed,
      }),
    );
    if (pendingFacts)
      add({
        id: "stale-field-facts",
        label:
          "This drawing uses outdated field facts and is available for comparison only. Rebuild it before approval.",
        step: 0,
        anchorX: 160,
        anchorY: 95,
        markerX: 160,
        markerY: 12,
        kind: "exception",
      });
    if (immediateIssues.has("dimensions-profile"))
      add({
        id: "dimensions-profile",
        label:
          "The deck dimensions are missing or outside this profile's supported rectangular limits.",
        step: 0,
        anchorX: 160,
        anchorY: 95,
        markerX: 160,
        markerY: 55,
        kind: "exception",
      });
    if (immediateIssues.has("attachment-fact"))
      add({
        id: "attachment-fact",
        label:
          "Confirm whether the replacement layout is ledger-attached or freestanding.",
        step: 0,
        anchorX: 160,
        anchorY: 20,
        markerX: 116,
        markerY: 10,
        kind: "input",
      });
    if (immediateIssues.has("stairs-fact"))
      add({
        id: "stairs-fact",
        label: draft.stairsIncluded
          ? "Place the verified stair opening on the replacement layout and confirm its position."
          : "Confirm whether stairs are included in the replacement layout.",
        step: 0,
        anchorX:
          stairEdge === "left" ? 30 : stairEdge === "right" ? 290 : stairAlong,
        anchorY:
          stairEdge === "top" ? 20 : stairEdge === "yard" ? 170 : stairAcross,
        markerX: 300,
        markerY: 52,
        kind: "input",
      });
    if (immediateIssues.has("railings-fact"))
      add({
        id: "railings-fact",
        label:
          "Confirm whether guards or railings apply from the approved field facts.",
        step: 0,
        anchorX: 290,
        anchorY: 45,
        markerX: 302,
        markerY: 82,
        kind: "input",
      });
    if (immediateIssues.has("outside-profile"))
      add({
        id: "outside-profile",
        label:
          "The proposed replacement geometry or load condition is outside this supported layout profile. Use an engineer/building-department-approved plan.",
        step: 3,
        anchorX: 250,
        anchorY: 145,
        markerX: 302,
        markerY: 154,
        kind: "exception",
      });
    return values;
  }, [
    draft,
    pendingFacts,
    proposedLengthFeet,
    proposedWidthFeet,
    stairAlong,
    stairAcross,
    stairEdge,
    stairPlacementConfirmed,
  ]);

  const resetPostsEvenly = (count: number, nextLength = proposedLengthFeet) => {
    const positions = Array.from({ length: count }, (_, index) =>
      String((nextLength * index) / Math.max(1, count - 1)),
    ).join(",");
    setDraft((current) => ({
      ...current,
      postCount: String(count),
      footingCount: String(count),
      postPositionsFeet: positions,
      postDistancesFromHouseFeet: Array.from({ length: count }, () =>
        String(Number(current.beamDistanceFromHouseFeet) || proposedWidthFeet),
      ).join(","),
    }));
    setDirty(true);
    setApproved(false);
  };
  const snapToStructuralLine = (value: number, maximum: number) => {
    if (draft.postPlacementMode !== "aligned") return value;
    if (value <= 0.5) return 0;
    if (maximum - value <= 0.5) return maximum;
    const gridFeet = Number(draft.postSnapInches) / 12;
    return Math.round(value / gridFeet) * gridFeet;
  };
  const movePost = (index: number, value: number) => {
    const positions = [...postPositions];
    const minimum = index === 0 ? 0 : positions[index - 1] + 0.25;
    const maximum =
      index === positions.length - 1
        ? proposedLengthFeet
        : positions[index + 1] - 0.25;
    const snapped = snapToStructuralLine(value, proposedLengthFeet);
    positions[index] = Number(
      Math.min(maximum, Math.max(minimum, snapped)).toFixed(4),
    );
    set("postPositionsFeet", positions.join(","));
  };
  const movePostDistance = (index: number, value: number) => {
    const distances = [...postDistances];
    distances[index] = Number(
      Math.min(proposedWidthFeet, Math.max(0, value)).toFixed(4),
    );
    set("postDistancesFromHouseFeet", distances.join(","));
  };
  const moveDrawingMember = (clientX: number, clientY: number) => {
    if (!activeDrawingDrag || !drawingRef.current) return;
    const bounds = drawingRef.current.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const drawingX = -10 + ((clientX - bounds.left) * 340) / bounds.width;
    const drawingY = -10 + ((clientY - bounds.top) * 230) / bounds.height;
    if (activeDrawingDrag.type === "corner") {
      const gridFeet = Number(draft.postSnapInches) / 12;
      const rawX = ((drawingX - 30) * proposedLengthFeet) / 260;
      const rawY = ((drawingY - 20) * proposedWidthFeet) / 150;
      const x = Math.min(
        proposedLengthFeet + 2,
        Math.max(-2, Math.round(rawX / gridFeet) * gridFeet),
      );
      const y = Math.min(
        proposedWidthFeet + 2,
        Math.max(-2, Math.round(rawY / gridFeet) * gridFeet),
      );
      setOutlinePoints((current) =>
        current.map((point, index) =>
          index === activeDrawingDrag.index
            ? { x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) }
            : point,
        ),
      );
      setDraft((current) => ({ ...current, unusualGeometry: true }));
      setDirty(true);
      setApproved(false);
      return;
    }
    if (activeDrawingDrag.type === "stair") {
      const candidates = [
        {
          edge: "left" as const,
          distance: Math.abs(drawingX - 30),
          offset: ((drawingY - 20) * proposedWidthFeet) / 150,
        },
        {
          edge: "right" as const,
          distance: Math.abs(drawingX - 290),
          offset: ((drawingY - 20) * proposedWidthFeet) / 150,
        },
        {
          edge: "yard" as const,
          distance: Math.abs(drawingY - 170),
          offset: ((drawingX - 30) * proposedLengthFeet) / 260,
        },
        ...(draft.attachment !== "ledger"
          ? [
              {
                edge: "top" as const,
                distance: Math.abs(drawingY - 20),
                offset: ((drawingX - 30) * proposedLengthFeet) / 260,
              },
            ]
          : []),
      ].sort((a, b) => a.distance - b.distance);
      const nearest = candidates[0];
      const edgeLength =
        nearest.edge === "left" || nearest.edge === "right"
          ? proposedWidthFeet
          : proposedLengthFeet;
      const half = Math.min(stairWidthFeet / 2, edgeLength / 2);
      const snapped =
        Math.round(
          Math.min(edgeLength - half, Math.max(half, nearest.offset)) * 12,
        ) / 12;
      onStairPlacementChange(nearest.edge, snapped);
      return;
    }
    if (activeDrawingDrag.type === "beam") {
      const distance = ((drawingY - 20) * proposedWidthFeet) / 150;
      const snapped = snapToStructuralLine(distance, proposedWidthFeet);
      const nextDistance = Number(
        Math.min(proposedWidthFeet, Math.max(1, snapped)).toFixed(4),
      );
      setDraft((current) => ({
        ...current,
        beamDistanceFromHouseFeet: String(nextDistance),
        postDistancesFromHouseFeet:
          current.postPlacementMode === "aligned"
            ? Array.from({ length: posts }, () => String(nextDistance)).join(
                ",",
              )
            : current.postDistancesFromHouseFeet,
      }));
      setDirty(true);
      setApproved(false);
      return;
    }
    const position = ((drawingX - 30) * proposedLengthFeet) / 260;
    movePost(activeDrawingDrag.index, position);
    if (draft.postPlacementMode === "free")
      movePostDistance(
        activeDrawingDrag.index,
        ((drawingY - 20) * proposedWidthFeet) / 150,
      );
  };
  const outlineSvgPoints = outlinePoints
    .map(
      (point) =>
        `${30 + (260 * point.x) / Math.max(0.1, proposedLengthFeet)},${20 + (150 * point.y) / Math.max(0.1, proposedWidthFeet)}`,
    )
    .join(" ");
  const selectedEdgeStart =
    outlinePoints[Math.min(selectedOutlineEdge, outlinePoints.length - 1)];
  const selectedEdgeEnd =
    outlinePoints[(selectedOutlineEdge + 1) % outlinePoints.length];
  const selectedOutlineEdgeLength = Math.hypot(
    selectedEdgeEnd.x - selectedEdgeStart.x,
    selectedEdgeEnd.y - selectedEdgeStart.y,
  );
  const markCustomOutline = () => {
    setOutlineMode("freeform");
    setDraft((current) => ({ ...current, unusualGeometry: true }));
    setDirty(true);
    setApproved(false);
  };
  const addOutlineStep = (direction: "out" | "in") =>
    setOutlinePoints((current) => {
      if (current.length > 12) return current;
      const edge = Math.min(selectedOutlineEdge, current.length - 1);
      const start = current[edge];
      const end = current[(edge + 1) % current.length];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const edgeLength = Math.hypot(dx, dy);
      if (edgeLength < 2) return current;
      const stepWidth = Math.min(4, Math.max(1, edgeLength / 3));
      const stepDepth = Math.min(2, Math.max(1, Math.min(proposedLengthFeet, proposedWidthFeet) / 6));
      const alongX = dx / edgeLength;
      const alongY = dy / edgeLength;
      const signedArea = current.reduce((sum, point, index) => {
        const next = current[(index + 1) % current.length];
        return sum + point.x * next.y - next.x * point.y;
      }, 0);
      const interiorX = signedArea >= 0 ? -alongY : alongY;
      const interiorY = signedArea >= 0 ? alongX : -alongX;
      const normalScale = direction === "in" ? stepDepth : -stepDepth;
      const midpointX = (start.x + end.x) / 2;
      const midpointY = (start.y + end.y) / 2;
      const snap = (value: number) => Math.round(value * 12) / 12;
      const before = {
        x: snap(midpointX - (alongX * stepWidth) / 2),
        y: snap(midpointY - (alongY * stepWidth) / 2),
      };
      const after = {
        x: snap(midpointX + (alongX * stepWidth) / 2),
        y: snap(midpointY + (alongY * stepWidth) / 2),
      };
      return [
        ...current.slice(0, edge + 1),
        before,
        {
          x: snap(before.x + interiorX * normalScale),
          y: snap(before.y + interiorY * normalScale),
        },
        {
          x: snap(after.x + interiorX * normalScale),
          y: snap(after.y + interiorY * normalScale),
        },
        after,
        ...current.slice(edge + 1),
      ];
    });
  const unresolvedLabels = plan.unresolvedPackages.map((item) =>
    item === "stairs"
      ? "reviewed stair detail"
      : item === "guard_schedule"
        ? "guard/railing attachment schedule"
        : item === "jurisdiction"
          ? "jurisdiction verification"
          : item === "ledger_detail"
            ? "concealed ledger attachment detail"
            : item === "soil_frost"
              ? "soil/frost verification"
              : "compatible connector schedule",
  );
  const openPackageGuidance = (id: string) => {
    const packageName =
      id === "package-stairs"
        ? "stairs"
        : id === "package-guards"
          ? "guards"
          : "connectors";
    setActivePackage(packageName);
    requestAnimationFrame(() => {
      packagePanelRef.current?.focus({ preventScroll: true });
      packagePanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  };
  return (
    <section className="mt-5 rounded-xl border-2 border-violet-600 bg-white p-4">
      <p className="text-xs font-black uppercase tracking-[.16em] text-violet-800">
        Required framing source for a full rebuild
      </p>
      <h4 className="mt-1 text-lg font-black text-slate-950">
        Create or import the framing plan
      </h4>
      <p className="mt-2 rounded-md bg-violet-50 p-3 text-sm font-bold leading-6 text-violet-950">
        Prescriptive estimating draft — not stamped and not a permit plan.
        Subject to field verification and City building-department approval. An
        engineer/AHJ-approved plan may be used instead.
      </p>
      {pendingFacts ? (
        <div
          role="alert"
          className="mt-3 rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm text-red-950"
        >
          <p className="font-black">Outdated field facts — approval blocked</p>
          <p className="mt-1">
            The current drawing no longer matches the latest dimensions or
            applicability. You may keep it visible for comparison, but it cannot
            be approved until updated.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              className={button}
              onClick={() => {
                setProposedLengthFeet(lengthFeet);
                setProposedWidthFeet(widthFeet);
                setDraft(
                  draftForFacts(pendingFacts, lengthFeet, widthFeet, visitSeed),
                );
                setPendingFacts(null);
                setComparisonOnly(false);
                setDirty(false);
                setApproved(false);
                setGenerated(true);
                setStep(4);
              }}
            >
              Rebuild from updated field facts
            </button>
            {!comparisonOnly ? (
              <button
                type="button"
                className="min-h-11 rounded-md border-2 border-red-700 bg-white px-4 py-2 font-bold"
                onClick={() => setComparisonOnly(true)}
              >
                Keep current draft for comparison only
              </button>
            ) : (
              <p className="rounded-md bg-white p-3 font-bold">
                Comparison only. Rebuild from updated field facts to enable
                approval.
              </p>
            )}
          </div>
        </div>
      ) : null}
      {!generated ? (
        <button
          type="button"
          className={`mt-4 w-full ${button}`}
          disabled={disabled}
          onClick={() => {
            setGenerated(true);
            setDetailsOpen(false);
            setStep(4);
          }}
        >
          Generate draft blueprint
        </button>
      ) : (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className={`${button} flex-1`}
            onClick={() => {
              setDetailsOpen(false);
              setStep(4);
            }}
          >
            View draft blueprint
          </button>
          <button
            type="button"
            className="min-h-11 flex-1 rounded-md border-2 border-slate-400 bg-white px-4 py-2 text-sm font-bold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2"
            onClick={() => {
              setDetailsOpen(true);
              setStep(0);
            }}
          >
            Edit blueprint details
          </button>
        </div>
      )}
      {detailsOpen ? (
        <>
          <div
            className="mt-3 grid grid-cols-5 gap-1"
            aria-label={`Step ${step + 1} of ${STEPS.length}`}
          >
            {STEPS.map((label, index) => (
              <button
                type="button"
                key={label}
                aria-label={label}
                className={`min-h-11 rounded px-1 text-xs font-bold ${index === step ? "bg-violet-700 text-white" : "bg-slate-100 text-slate-700"}`}
                onClick={() => setStep(index)}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm font-black">{STEPS[step]}</p>
        </>
      ) : null}
      {detailsOpen && step === 0 ? (
        <div className="mt-3 space-y-3">
          <Field label="Verified authority having jurisdiction">
            <select
              className={control}
              value={draft.jurisdiction}
              onChange={(e) =>
                set(
                  "jurisdiction",
                  e.target.value as DeckPrescriptiveDraft["jurisdiction"],
                )
              }
            >
              <option value="">Choose after verification</option>
              <option value="city_knoxville_verified">
                City of Knoxville verified
              </option>
              <option value="city_knoxville_estimating_assumption">
                City of Knoxville estimating assumption — verify later
              </option>
              <option value="other_or_uncertain">Other or uncertain</option>
            </select>
          </Field>
          <p className="text-xs text-slate-600">
            A Knoxville mailing address does not prove City jurisdiction.
          </p>
          <div className="rounded-md border p-3 text-xs">
            <a
              className="block text-blue-800 underline"
              href={KNOXVILLE_2024_DECK_PROFILE.controllingCodeUrl}
            >
              City adoption · 2024 IRC
            </a>
            <a
              className="block text-blue-800 underline"
              href={KNOXVILLE_2024_DECK_PROFILE.codeSourceUrl}
            >
              IRC 2024 R507 rule source
            </a>
            <a
              className="block text-blue-800 underline"
              href={KNOXVILLE_2024_DECK_PROFILE.formatReferenceUrl}
            >
              City 2018 deck guide · format reference only
            </a>
          </div>
          <p className="rounded-md bg-slate-50 p-3 text-sm">
            Approved blueprint says:{" "}
            <strong>
              {blueprintAttachment === null
                ? "attachment not confirmed"
                : blueprintAttachment === "ledger"
                  ? "attached at house"
                  : "freestanding"}
            </strong>
            ;{" "}
            <strong>
              {blueprintStairs === null
                ? "stairs not confirmed"
                : blueprintStairs
                  ? "stairs included"
                  : "no stairs"}
            </strong>
            ;{" "}
            <strong>
              {blueprintRailings === null
                ? "railings not confirmed"
                : blueprintRailings
                  ? "railings included"
                  : "no railings"}
            </strong>
            .
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Deck attachment">
              <select
                className={control}
                value={draft.attachment}
                onChange={(e) =>
                  set(
                    "attachment",
                    e.target.value as DeckPrescriptiveDraft["attachment"],
                  )
                }
              >
                <option value="">Confirm from field facts</option>
                <option value="ledger">Ledger attached</option>
                <option value="freestanding">Freestanding</option>
              </select>
            </Field>
            <Field label="Stairs">
              <select
                className={control}
                value={draft.stairsIncluded}
                onChange={(e) =>
                  set(
                    "stairsIncluded",
                    e.target.value as DeckPrescriptiveDraft["stairsIncluded"],
                  )
                }
              >
                <option value="">Confirm from field facts</option>
                <option value="yes">Included</option>
                <option value="no">Not included</option>
              </select>
            </Field>
            <Field label="Guards / railings">
              <select
                className={control}
                value={draft.railingsIncluded}
                onChange={(e) =>
                  set(
                    "railingsIncluded",
                    e.target.value as DeckPrescriptiveDraft["railingsIncluded"],
                  )
                }
              >
                <option value="">Confirm from field facts</option>
                <option value="yes">Included</option>
                <option value="no">Not included</option>
              </select>
            </Field>
          </div>
          <label className="flex min-h-11 gap-3 rounded border p-3 text-sm font-bold">
            <input
              type="checkbox"
              checked={draft.attachmentConfirmed}
              onChange={(e) => set("attachmentConfirmed", e.target.checked)}
            />
            I confirmed the attachment fact.
          </label>
          <label className="flex min-h-11 gap-3 rounded border p-3 text-sm font-bold">
            <input
              type="checkbox"
              checked={draft.stairsConfirmed}
              onChange={(e) => set("stairsConfirmed", e.target.checked)}
            />
            I confirmed the stair fact.
          </label>
          {draft.attachment === "ledger" ? (
            <Field label="House attachment substrate">
              <select
                className={control}
                value={draft.ledgerSubstrate}
                onChange={(e) =>
                  set(
                    "ledgerSubstrate",
                    e.target.value as DeckPrescriptiveDraft["ledgerSubstrate"],
                  )
                }
              >
                <option value="">Choose after field check</option>
                <option value="verified_band_rim">
                  Verified wood band/rim joist
                </option>
                <option value="estimating_band_rim_assumption">
                  Wood band/rim estimating assumption — verify concealed
                  condition later
                </option>
                <option value="masonry_veneer">Brick/stone veneer</option>
                <option value="concrete_or_other">Concrete or other</option>
                <option value="unknown">Unknown/concealed</option>
              </select>
            </Field>
          ) : null}
        </div>
      ) : null}
      {detailsOpen && step === 1 ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Lumber species and grade">
            <select
              className={control}
              value={draft.speciesGrade}
              onChange={(e) =>
                set(
                  "speciesGrade",
                  e.target.value as DeckPrescriptiveDraft["speciesGrade"],
                )
              }
            >
              <option value="">Choose</option>
              <option value="southern_pine_no2">Southern Pine No. 2</option>
            </select>
          </Field>
          <Field label="Treatment / service">
            <select
              className={control}
              value={draft.treatmentService}
              onChange={(e) =>
                set(
                  "treatmentService",
                  e.target.value as DeckPrescriptiveDraft["treatmentService"],
                )
              }
            >
              <option value="">Choose</option>
              <option value="pressure_treated_wet_service">
                Pressure-treated · wet service
              </option>
            </select>
          </Field>
          <Field label="Design load profile">
            <select
              className={control}
              value={draft.designLoad}
              onChange={(e) =>
                set(
                  "designLoad",
                  e.target.value as DeckPrescriptiveDraft["designLoad"],
                )
              }
            >
              <option value="">Choose</option>
              <option value="40_live_10_dead">40 psf live + 10 psf dead</option>
            </select>
          </Field>
          <Field label="Joist spacing (inches on center)">
            <select
              className={control}
              value={draft.joistSpacingInches}
              onChange={(e) =>
                set(
                  "joistSpacingInches",
                  e.target.value as DeckPrescriptiveDraft["joistSpacingInches"],
                )
              }
            >
              {["12", "16", "24"].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Joist size">
            <select
              className={control}
              value={draft.joistSize}
              onChange={(e) =>
                set(
                  "joistSize",
                  e.target.value as DeckPrescriptiveDraft["joistSize"],
                )
              }
            >
              {["2x6", "2x8", "2x10", "2x12"].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Beam size">
            <select
              className={control}
              value={draft.beamSize}
              onChange={(e) =>
                set(
                  "beamSize",
                  e.target.value as DeckPrescriptiveDraft["beamSize"],
                )
              }
            >
              {["2x6", "2x8", "2x10", "2x12"].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Beam plies">
            <select
              className={control}
              value={draft.beamPlies}
              onChange={(e) =>
                set(
                  "beamPlies",
                  e.target.value as DeckPrescriptiveDraft["beamPlies"],
                )
              }
            >
              {["1", "2", "3"].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Support/beam lines">
            <input
              className={control}
              inputMode="numeric"
              value={draft.beamLineCount}
              onChange={(e) => set("beamLineCount", e.target.value)}
            />
          </Field>
        </div>
      ) : null}
      {detailsOpen && step === 2 ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <p className="rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-950 sm:col-span-2">
            <strong>Profile recommendation:</strong> the current geometry
            prefilled the smallest encoded passing beam and footing-pad values.
            Review them; every change is checked again.
          </p>
          <Field label="Post count">
            <input
              className={control}
              inputMode="numeric"
              value={draft.postCount}
              onChange={(e) => set("postCount", e.target.value)}
            />
          </Field>
          <Field label="Post size">
            <select
              className={control}
              value={draft.postSize}
              onChange={(e) =>
                set(
                  "postSize",
                  e.target.value as DeckPrescriptiveDraft["postSize"],
                )
              }
            >
              <option value="">Choose</option>
              {["4x4", "6x6"].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Maximum exposed post height (feet)">
            <input
              className={control}
              inputMode="decimal"
              value={draft.postHeightFeet}
              onChange={(e) => set("postHeightFeet", e.target.value)}
            />
          </Field>
          <Field label="Footing count">
            <input
              className={control}
              inputMode="numeric"
              value={draft.footingCount}
              onChange={(e) => set("footingCount", e.target.value)}
            />
          </Field>
          <Field label="Round footing diameter (inches)">
            <input
              className={control}
              inputMode="decimal"
              value={draft.footingDiameterInches}
              onChange={(e) => set("footingDiameterInches", e.target.value)}
            />
          </Field>
          <Field label="Concrete footing thickness (inches)">
            <input
              className={control}
              inputMode="decimal"
              value={draft.footingThicknessInches}
              onChange={(e) => set("footingThicknessInches", e.target.value)}
            />
          </Field>
          <Field label="Bottom of footing depth below grade (inches)">
            <input
              className={control}
              inputMode="decimal"
              value={draft.footingDepthInches}
              onChange={(e) => set("footingDepthInches", e.target.value)}
            />
          </Field>
          <Field label="Verified frost-depth basis">
            <input
              className={control}
              maxLength={160}
              value={draft.frostBasis}
              onChange={(e) => set("frostBasis", e.target.value)}
            />
          </Field>
          <Field
            label="Extra reviewed blocking rows"
            help="Zero is allowed. Add only blocking/bracing shown by a reviewed plan or required detail."
          >
            <input
              className={control}
              inputMode="numeric"
              value={draft.extraBlockingRows}
              onChange={(e) => set("extraBlockingRows", e.target.value)}
            />
          </Field>
          <Field
            label="Connector/fastener notes (not proof of a complete schedule)"
            help="These notes do not complete the connector work package. Supply the actual reviewed schedule and cost source in the takeoff checklist."
          >
            <input
              className={control}
              maxLength={160}
              value={draft.hardwareBasis}
              onChange={(e) => set("hardwareBasis", e.target.value)}
            />
          </Field>
        </div>
      ) : null}
      {detailsOpen && step === 3 ? (
        <div className="mt-3 space-y-2">
          {(
            [
              ["unusualGeometry", "Nonrectangular/unusual geometry"],
              ["cantilever", "Cantilever/overhang"],
              ["roofOrSpecialLoad", "Roof, hot tub, or special load"],
              ["soilOrFootingUncertain", "Soil or frost basis uncertain"],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex min-h-11 gap-3 rounded border p-3 text-sm font-bold"
            >
              <input
                type="checkbox"
                checked={draft[key]}
                onChange={(e) => set(key, e.target.checked)}
              />
              {label}
            </label>
          ))}
          <p className="text-sm text-slate-700">
            Any checked condition stops this bounded profile for engineer/AHJ
            review.
          </p>
        </div>
      ) : null}
      {generated && step === 4 ? (
        <div className="mt-3">
          <div className="overflow-x-auto rounded-lg border-2 border-slate-950 bg-white shadow-sm">
            <svg
              ref={drawingRef}
              viewBox="-10 -10 340 230"
              role="img"
              aria-labelledby={`${svgTitleId} ${svgDescriptionId}`}
              className={
                drawingExpanded
                  ? "min-w-[720px] w-full bg-white"
                  : "min-w-[320px] w-full bg-white"
              }
              style={layoutEditorOpen ? { touchAction: "none" } : undefined}
              onPointerMove={(event) =>
                moveDrawingMember(event.clientX, event.clientY)
              }
              onPointerUp={(event) => {
                if (drawingRef.current?.hasPointerCapture(event.pointerId))
                  drawingRef.current.releasePointerCapture(event.pointerId);
                setActiveDrawingDrag(null);
              }}
              onPointerCancel={() => setActiveDrawingDrag(null)}
            >
              <title id={svgTitleId}>
                Prescriptive estimating draft framing blueprint
              </title>
              <desc id={svgDescriptionId}>
                Main deck framing drawing with joists, beams, posts, footings,
                attachment edge, stair opening when applicable, and numbered
                callouts for missing or unresolved work.
              </desc>
              <polygon
                points={outlineSvgPoints}
                fill="#dbeafe"
                stroke="#0f172a"
                strokeWidth="3"
                strokeDasharray={
                  outlineMode === "rectangle" ? undefined : "6 4"
                }
                data-plan-member="deck-outline"
              />
              {Array.from({ length: Math.min(joists, 30) }, (_, i) => (
                <line
                  data-plan-member="joist"
                  key={`j${i}`}
                  x1={30 + (i * 260) / (Math.min(joists, 30) - 1)}
                  x2={30 + (i * 260) / (Math.min(joists, 30) - 1)}
                  y1="20"
                  y2="170"
                  stroke="#475569"
                  opacity={outlineMode === "rectangle" ? 1 : 0}
                />
              ))}
              {Array.from({ length: beamLines }, (_, i) => (
                <g key={`b${i}`} opacity={outlineMode === "rectangle" ? 1 : 0}>
                  <line
                    data-edit-handle={
                      layoutEditorOpen && beamLines === 1
                        ? "support-beam"
                        : undefined
                    }
                    x1="30"
                    x2="290"
                    y1={
                      beamLines === 1
                        ? beamY
                        : 20 + ((i + 1) * 150) / (beamLines + 1)
                    }
                    y2={
                      beamLines === 1
                        ? beamY
                        : 20 + ((i + 1) * 150) / (beamLines + 1)
                    }
                    stroke="transparent"
                    strokeWidth="18"
                    className={
                      layoutEditorOpen && beamLines === 1
                        ? "cursor-ns-resize"
                        : undefined
                    }
                    onPointerDown={
                      layoutEditorOpen && beamLines === 1
                        ? (event) => {
                            drawingRef.current?.setPointerCapture(
                              event.pointerId,
                            );
                            setActiveDrawingDrag({ type: "beam" });
                          }
                        : undefined
                    }
                  />
                  <line
                    data-plan-member="beam"
                    x1="30"
                    x2="290"
                    y1={
                      beamLines === 1
                        ? beamY
                        : 20 + ((i + 1) * 150) / (beamLines + 1)
                    }
                    y2={
                      beamLines === 1
                        ? beamY
                        : 20 + ((i + 1) * 150) / (beamLines + 1)
                    }
                    stroke="#6d28d9"
                    strokeWidth="4"
                    pointerEvents="none"
                  />
                </g>
              ))}
              {postPositions.map((position, i) => (
                <g
                  key={`p${i}`}
                  opacity={outlineMode === "rectangle" ? 1 : 0}
                  data-edit-handle={
                    layoutEditorOpen ? `post-${i + 1}` : undefined
                  }
                  className={
                    layoutEditorOpen
                      ? draft.postPlacementMode === "free"
                        ? "cursor-move"
                        : "cursor-ew-resize"
                      : undefined
                  }
                  onPointerDown={
                    layoutEditorOpen
                      ? (event) => {
                          drawingRef.current?.setPointerCapture(
                            event.pointerId,
                          );
                          setActiveDrawingDrag({ type: "post", index: i });
                        }
                      : undefined
                  }
                >
                  <circle
                    data-plan-member="footing"
                    cx={
                      30 + (260 * position) / Math.max(0.1, proposedLengthFeet)
                    }
                    cy={
                      20 +
                      (150 * postDistances[i]) /
                        Math.max(0.1, proposedWidthFeet)
                    }
                    r={layoutEditorOpen ? "11" : "7"}
                    fill="#fef08a"
                    stroke="#0f172a"
                    strokeWidth="1.5"
                  />
                  <rect
                    data-plan-member="post"
                    x={
                      26 + (260 * position) / Math.max(0.1, proposedLengthFeet)
                    }
                    y={
                      16 +
                      (150 * postDistances[i]) /
                        Math.max(0.1, proposedWidthFeet)
                    }
                    width="8"
                    height="8"
                    fill="#6d28d9"
                  />
                </g>
              ))}
              <line
                data-plan-member={
                  draft.attachment === "ledger" ? "ledger" : "freestanding-edge"
                }
                x1="30"
                x2="290"
                y1="20"
                y2="20"
                stroke="#0f172a"
                strokeWidth="6"
                opacity={outlineMode === "rectangle" ? 1 : 0}
              />
              {layoutEditorOpen
                ? outlinePoints.map((point, index) => {
                    const next =
                      outlinePoints[(index + 1) % outlinePoints.length];
                    const x1 =
                      30 +
                      (260 * point.x) / Math.max(0.1, proposedLengthFeet);
                    const y1 =
                      20 +
                      (150 * point.y) / Math.max(0.1, proposedWidthFeet);
                    const x2 =
                      30 +
                      (260 * next.x) / Math.max(0.1, proposedLengthFeet);
                    const y2 =
                      20 +
                      (150 * next.y) / Math.max(0.1, proposedWidthFeet);
                    const selected = selectedOutlineEdge === index;
                    return (
                      <g
                        key={`outline-edge-${index}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`Select outline edge ${index + 1}`}
                        data-edit-handle={`outline-edge-${index + 1}`}
                        className="cursor-pointer focus:outline-none"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          setSelectedOutlineEdge(index);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedOutlineEdge(index);
                          }
                        }}
                      >
                        <line
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke="transparent"
                          strokeWidth="18"
                        />
                        <line
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke={selected ? "#ea580c" : "#2563eb"}
                          strokeWidth={selected ? "6" : "3"}
                          strokeDasharray={selected ? undefined : "4 3"}
                          pointerEvents="none"
                        />
                        <circle
                          cx={(x1 + x2) / 2}
                          cy={(y1 + y2) / 2}
                          r={selected ? "9" : "7"}
                          fill={selected ? "#ea580c" : "#2563eb"}
                          stroke="white"
                          strokeWidth="2"
                          pointerEvents="none"
                        />
                        <text
                          x={(x1 + x2) / 2}
                          y={(y1 + y2) / 2 + 3}
                          textAnchor="middle"
                          fontSize="10"
                          fontWeight="900"
                          fill="white"
                          pointerEvents="none"
                          aria-hidden="true"
                        >
                          +
                        </text>
                      </g>
                    );
                  })
                : null}
              {layoutEditorOpen
                ? outlinePoints.map((point, index) => (
                    <g
                      key={`outline-point-${index}`}
                      data-edit-handle={`outline-point-${index + 1}`}
                      className="cursor-move"
                      onPointerDown={(event) => {
                        drawingRef.current?.setPointerCapture(event.pointerId);
                        setOutlineMode("freeform");
                        setActiveDrawingDrag({ type: "corner", index });
                      }}
                    >
                      <circle
                        cx={
                          30 +
                          (260 * point.x) / Math.max(0.1, proposedLengthFeet)
                        }
                        cy={
                          20 +
                          (150 * point.y) / Math.max(0.1, proposedWidthFeet)
                        }
                        r="9"
                        fill="#22d3ee"
                        stroke="#0f172a"
                        strokeWidth="2.5"
                      />
                      <text
                        x={
                          30 +
                          (260 * point.x) / Math.max(0.1, proposedLengthFeet)
                        }
                        y={
                          23 +
                          (150 * point.y) / Math.max(0.1, proposedWidthFeet)
                        }
                        textAnchor="middle"
                        fontSize="8"
                        fontWeight="800"
                        fill="#0f172a"
                      >
                        {index + 1}
                      </text>
                    </g>
                  ))
                : null}
              {outlinePoints.map((point, index) => {
                const next = outlinePoints[(index + 1) % outlinePoints.length];
                const length = Math.hypot(next.x - point.x, next.y - point.y);
                return (
                  <text
                    key={`dimension-${index}`}
                    x={
                      30 +
                      (260 * (point.x + next.x)) /
                        2 /
                        Math.max(0.1, proposedLengthFeet)
                    }
                    y={
                      16 +
                      (150 * (point.y + next.y)) /
                        2 /
                        Math.max(0.1, proposedWidthFeet)
                    }
                    textAnchor="middle"
                    fontSize="7"
                    fontWeight="800"
                    fill="#0f172a"
                  >
                    {length.toFixed(1)} ft
                  </text>
                );
              })}
              {draft.stairsIncluded === "yes" ? (
                <g
                  data-edit-handle={layoutEditorOpen ? "stairs" : undefined}
                  className={layoutEditorOpen ? "cursor-move" : undefined}
                  onPointerDown={
                    layoutEditorOpen
                      ? (event) => {
                          drawingRef.current?.setPointerCapture(
                            event.pointerId,
                          );
                          setActiveDrawingDrag({ type: "stair" });
                        }
                      : undefined
                  }
                >
                  <rect
                    data-plan-member="stair-opening"
                    x={
                      stairEdge === "left"
                        ? 20
                        : stairEdge === "right"
                          ? 275
                          : stairAlong
                    }
                    y={
                      stairEdge === "top"
                        ? 10
                        : stairEdge === "yard"
                          ? 155
                          : stairAcross
                    }
                    width={
                      stairEdge === "left" || stairEdge === "right" ? 25 : 40
                    }
                    height={
                      stairEdge === "left" || stairEdge === "right" ? 40 : 25
                    }
                    fill="#fef3c7"
                    stroke="#92400e"
                    strokeWidth="2"
                  />
                  <text
                    x={
                      stairEdge === "left"
                        ? 32
                        : stairEdge === "right"
                          ? 287
                          : stairAlong + 20
                    }
                    y={
                      stairEdge === "top"
                        ? 25
                        : stairEdge === "yard"
                          ? 170
                          : stairAcross + 22
                    }
                    textAnchor="middle"
                    fontSize="7"
                    fill="#78350f"
                  >
                    drag stairs
                  </text>
                </g>
              ) : null}
              {callouts.map((callout, index) => (
                <g
                  key={callout.id}
                  data-plan-member="blueprint-callout"
                  data-callout-id={callout.id}
                >
                  <line
                    data-plan-member="callout-leader"
                    x1={callout.anchorX}
                    y1={callout.anchorY}
                    x2={callout.markerX}
                    y2={callout.markerY}
                    stroke="#b91c1c"
                    strokeWidth="1.5"
                    strokeDasharray="3 2"
                  />
                  <circle
                    cx={callout.markerX}
                    cy={callout.markerY}
                    r="10"
                    fill="#b91c1c"
                    stroke="white"
                    strokeWidth="2"
                  />
                  <text
                    x={callout.markerX}
                    y={callout.markerY + 3.5}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fill="white"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </text>
                </g>
              ))}
              <text
                x="160"
                y="188"
                textAnchor="middle"
                fontSize="8"
                fontWeight="700"
                fill="#991b1b"
              >
                ESTIMATING DRAFT — NOT FOR PERMIT OR CONSTRUCTION — NOT STAMPED
              </text>
              <text x="160" y="198" textAnchor="middle" fontSize="10">
                {proposedLengthFeet} ft × {proposedWidthFeet} ft · editable
                estimating layout
              </text>
            </svg>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              className="min-h-11 rounded-md bg-violet-700 px-4 py-2 text-sm font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
              aria-expanded={layoutEditorOpen}
              onClick={() => setLayoutEditorOpen((value) => !value)}
            >
              {layoutEditorOpen ? "Close layout editor" : "Edit this drawing"}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-md border-2 border-slate-400 bg-white px-4 py-2 text-sm font-bold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
              aria-pressed={drawingExpanded}
              onClick={() => setDrawingExpanded((value) => !value)}
            >
              {drawingExpanded ? "Fit drawing to screen" : "Expand drawing"}
            </button>
            {draft.stairsIncluded === "yes" ? (
              <button
                type="button"
                className="min-h-11 rounded-md border-2 border-amber-600 bg-white px-4 py-2 text-sm font-bold text-amber-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
                onClick={() => setLayoutEditorOpen(true)}
              >
                Drag stairs on drawing
              </button>
            ) : null}
          </div>
          {layoutEditorOpen ? (
            <section
              className="mt-3 rounded-lg border-2 border-slate-950 bg-white p-3 text-slate-950 shadow-sm"
              aria-labelledby="simple-deck-editor-heading"
            >
              <h5
                id="simple-deck-editor-heading"
                className="font-black text-slate-950"
              >
                Measured deck drawing
              </h5>
              <p className="mt-1 text-sm font-medium text-slate-800">
                The blue outline and bright corner dots are editable. Tap a
                blue edge, then add an outward step or inward notch. Drag posts
                or stairs directly on the drawing.
              </p>
              <fieldset className="mt-3">
                <legend className="text-sm font-black text-slate-950">
                  Deck outline mode
                </legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="flex min-h-11 items-center gap-2 rounded-md border-2 border-blue-700 bg-blue-50 p-3 text-sm font-bold focus-within:ring-2 focus-within:ring-blue-600">
                    <input
                      type="radio"
                      name="outline-mode"
                      checked={outlineMode === "rectangle"}
                      onChange={() => {
                        setOutlineMode("rectangle");
                        setOutlinePoints([
                          { x: 0, y: 0 },
                          { x: proposedLengthFeet, y: 0 },
                          { x: proposedLengthFeet, y: proposedWidthFeet },
                          { x: 0, y: proposedWidthFeet },
                        ]);
                        setSelectedOutlineEdge(0);
                        set("unusualGeometry", false);
                      }}
                    />
                    Square/snap outline
                  </label>
                  <label className="flex min-h-11 items-center gap-2 rounded-md border-2 border-orange-600 bg-orange-50 p-3 text-sm font-bold focus-within:ring-2 focus-within:ring-orange-600">
                    <input
                      type="radio"
                      name="outline-mode"
                      checked={outlineMode === "freeform"}
                      onChange={() => {
                        setOutlineMode("freeform");
                        set("unusualGeometry", true);
                      }}
                    />
                    Free draw outline
                  </label>
                </div>
              </fieldset>
              <div className="mt-3 rounded-md border-2 border-orange-700 bg-orange-50 p-3">
                  <p className="text-sm font-bold text-slate-950">
                    Selected edge: {selectedOutlineEdge + 1}. The orange edge
                    is where the next step will be added. New corners snap to
                    one-inch measurements and can be dragged afterward.
                  </p>
                  <label className="mt-3 block text-sm font-black text-slate-950">
                    Choose an outline edge
                    <select
                      className="mt-1 min-h-11 w-full rounded-md border-2 border-slate-700 bg-white px-3 text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      aria-label="Selected outline edge"
                      value={selectedOutlineEdge}
                      onChange={(event) =>
                        setSelectedOutlineEdge(Number(event.target.value))
                      }
                    >
                      {outlinePoints.map((point, index) => {
                        const next =
                          outlinePoints[(index + 1) % outlinePoints.length];
                        return (
                          <option key={index} value={index}>
                            Edge {index + 1} — {Math.hypot(next.x - point.x, next.y - point.y).toFixed(1)} ft
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      className="min-h-12 rounded-md bg-blue-700 px-4 py-3 text-sm font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50"
                      onClick={() => {
                        markCustomOutline();
                        addOutlineStep("out");
                      }}
                      disabled={
                        outlinePoints.length > 12 ||
                        selectedOutlineEdgeLength < 2
                      }
                    >
                      Add outward step
                    </button>
                    <button
                      type="button"
                      className="min-h-12 rounded-md bg-orange-700 px-4 py-3 text-sm font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 disabled:opacity-50"
                      onClick={() => {
                        markCustomOutline();
                        addOutlineStep("in");
                      }}
                      disabled={
                        outlinePoints.length > 12 ||
                        selectedOutlineEdgeLength < 2
                      }
                    >
                      Add inward notch
                    </button>
                  </div>
                  <p className="mt-3 text-sm font-medium text-slate-800">
                    Edge measurements update as you draw. Automatic structural
                    quantities pause for a custom shape until its takeoff is
                    reviewed.
                  </p>
              </div>
              <fieldset className="mt-3">
                <legend className="text-sm font-black text-slate-950">
                  Post placement mode
                </legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="flex min-h-11 items-center gap-2 rounded-md border-2 border-blue-700 bg-blue-50 p-3 text-sm font-bold focus-within:ring-2 focus-within:ring-blue-600">
                    <input
                      type="radio"
                      name="post-placement-mode"
                      checked={draft.postPlacementMode === "aligned"}
                      onChange={() => {
                        setDraft((current) => ({
                          ...current,
                          postPlacementMode: "aligned",
                          postDistancesFromHouseFeet: Array.from(
                            { length: posts },
                            () => current.beamDistanceFromHouseFeet,
                          ).join(","),
                        }));
                        setDirty(true);
                        setApproved(false);
                      }}
                    />
                    Snap to structural lines (recommended)
                  </label>
                  <label className="flex min-h-11 items-center gap-2 rounded-md border-2 border-amber-500 bg-white p-3 text-sm font-bold">
                    <input
                      type="radio"
                      name="post-placement-mode"
                      checked={draft.postPlacementMode === "free"}
                      onChange={() => set("postPlacementMode", "free")}
                    />
                    Free placement
                  </label>
                </div>
              </fieldset>
              {draft.postPlacementMode === "aligned" ? (
                <>
                  <p className="mt-3 rounded-md bg-white p-3 text-sm font-bold text-violet-950">
                    Posts stay on the selected beam. Beams and end posts dragged
                    within 6 inches of a perimeter snap exactly onto that
                    perimeter so an accidental offset cannot create a false
                    extra beam line.
                  </p>
                  <Field label="Measurement snap spacing">
                    <select
                      className={control}
                      value={draft.postSnapInches}
                      onChange={(event) =>
                        set(
                          "postSnapInches",
                          event.target
                            .value as DeckPrescriptiveDraft["postSnapInches"],
                        )
                      }
                    >
                      <option value="1">1 inch (recommended)</option>
                      <option value="3">3 inches</option>
                      <option value="6">6 inches</option>
                      <option value="12">12 inches</option>
                    </select>
                  </Field>
                </>
              ) : (
                <p
                  role="alert"
                  className="mt-3 rounded-md border-2 border-amber-500 bg-amber-50 p-3 text-sm font-bold text-amber-950"
                >
                  Free placement is for recording an unusual existing layout.
                  Automatic structural quantities pause until a reviewed custom
                  support plan is supplied.
                </p>
              )}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Deck length (feet)">
                  <input
                    className={control}
                    type="number"
                    min="1"
                    max="40"
                    step="0.25"
                    value={proposedLengthFeet}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (!Number.isFinite(value)) return;
                      setProposedLengthFeet(value);
                      resetPostsEvenly(posts, value);
                    }}
                  />
                </Field>
                <Field label="Deck depth from house (feet)">
                  <input
                    className={control}
                    type="number"
                    min="1"
                    max="18"
                    step="0.25"
                    value={proposedWidthFeet}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (!Number.isFinite(value)) return;
                      setProposedWidthFeet(value);
                      setDraft((current) => ({
                        ...current,
                        beamDistanceFromHouseFeet: String(value),
                        postDistancesFromHouseFeet:
                          current.postPlacementMode === "aligned"
                            ? Array.from({ length: posts }, () =>
                                String(value),
                              ).join(",")
                            : current.postDistancesFromHouseFeet,
                      }));
                      setDirty(true);
                      setApproved(false);
                    }}
                  />
                </Field>
              </div>
              <Field
                label={`Support beam distance from house: ${Number.isFinite(beamDistance) ? beamDistance : "?"} ft`}
                help="Drag the support line toward or away from the house. In snap mode, a beam within 6 inches of the outside edge becomes the outside beam instead of creating a second near-parallel line."
              >
                <input
                  className="mt-2 w-full accent-violet-700"
                  type="range"
                  min="1"
                  max={Math.max(1, proposedWidthFeet)}
                  step={Number(draft.postSnapInches) / 12}
                  value={Math.min(
                    proposedWidthFeet,
                    Math.max(1, beamDistance || proposedWidthFeet),
                  )}
                  onChange={(event) => {
                    const snapped = snapToStructuralLine(
                      Number(event.target.value),
                      proposedWidthFeet,
                    );
                    const value = String(snapped);
                    setDraft((current) => ({
                      ...current,
                      beamDistanceFromHouseFeet: value,
                      postDistancesFromHouseFeet:
                        current.postPlacementMode === "aligned"
                          ? Array.from({ length: posts }, () => value).join(",")
                          : current.postDistancesFromHouseFeet,
                    }));
                    setDirty(true);
                    setApproved(false);
                  }}
                />
              </Field>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={button}
                  onClick={() => resetPostsEvenly(posts + 1)}
                  disabled={posts >= 20}
                >
                  Add post
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-md border-2 border-slate-500 bg-white px-4 py-2 text-sm font-bold text-slate-900 disabled:opacity-50"
                  onClick={() => resetPostsEvenly(posts - 1)}
                  disabled={posts <= 2}
                >
                  Remove post
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-md border-2 border-violet-600 bg-white px-4 py-2 text-sm font-bold text-violet-950"
                  onClick={() => resetPostsEvenly(posts)}
                >
                  Space posts evenly
                </button>
              </div>
              <div className="mt-3 space-y-3">
                {postPositions.map((position, index) => (
                  <div
                    key={`post-control-${index}`}
                    className="rounded-md border border-violet-200 bg-white p-3"
                  >
                    <Field
                      label={`Post ${index + 1}: ${position.toFixed(2)} ft from the left edge`}
                    >
                      <input
                        className="mt-2 w-full accent-violet-700"
                        type="range"
                        min={index === 0 ? 0 : postPositions[index - 1] + 0.25}
                        max={
                          index === postPositions.length - 1
                            ? proposedLengthFeet
                            : postPositions[index + 1] - 0.25
                        }
                        step={
                          draft.postPlacementMode === "aligned"
                            ? Number(draft.postSnapInches) / 12
                            : 0.01
                        }
                        value={position}
                        onChange={(event) =>
                          movePost(index, Number(event.target.value))
                        }
                      />
                    </Field>
                    {draft.postPlacementMode === "free" ? (
                      <Field
                        label={`${postDistances[index].toFixed(2)} ft from house`}
                      >
                        <input
                          className="mt-2 w-full accent-amber-700"
                          type="range"
                          min="0"
                          max={proposedWidthFeet}
                          step="0.01"
                          value={postDistances[index]}
                          onChange={(event) =>
                            movePostDistance(index, Number(event.target.value))
                          }
                        />
                      </Field>
                    ) : null}
                  </div>
                ))}
              </div>
              <p className="mt-3 rounded-md bg-white p-3 text-xs font-bold text-violet-950">
                There is intentionally no AI instruction box. What you place on
                this editor is what the estimating drawing records.
              </p>
            </section>
          ) : null}
          <p className="mt-2 rounded-md border border-red-300 bg-red-50 p-3 text-xs font-black text-red-950">
            ESTIMATING DRAFT — NOT FOR PERMIT OR CONSTRUCTION — NOT STAMPED
          </p>
          <section
            className="mt-3 grid gap-3 md:grid-cols-2"
            aria-label="Site visit evidence and proposed estimating assumptions"
          >
            <div className="rounded-lg border border-blue-300 bg-blue-50 p-3">
              <h5 className="font-black text-blue-950">
                Observed existing — completed human site visit
              </h5>
              <p className="mt-1 text-xs text-blue-900">
                Saved field observations are reused as evidence. They are not
                automatically declared to be the replacement design.
              </p>
              <ul className="mt-2 space-y-1 text-sm text-blue-950">
                {visitSeed.observedMeasurements.length ? (
                  visitSeed.observedMeasurements.map((item) => (
                    <li key={`${item.itemKey}:${item.key}`}>
                      <strong>{item.key.replaceAll("_", " ")}:</strong>{" "}
                      {item.value} {item.unit}
                    </li>
                  ))
                ) : (
                  <li>No reusable measurement was saved.</li>
                )}
              </ul>
            </div>
            <div className="rounded-lg border border-violet-300 bg-violet-50 p-3">
              <h5 className="font-black text-violet-950">
                Proposed estimating assumptions — reviewable
              </h5>
              <p className="mt-1 text-xs text-violet-900">
                Supported observed values seed this editable draft only as
                explicit assumptions; the code-profile checks run again.
              </p>
              <ul className="mt-2 space-y-1 text-sm text-violet-950">
                <li>
                  Joists: {draft.joistSize || "not selected"} at{" "}
                  {draft.joistSpacingInches || "?"} inches on center
                </li>
                <li>
                  Beam: {draft.beamPlies || "?"}-ply{" "}
                  {draft.beamSize || "not selected"}
                </li>
                <li>
                  Posts: {draft.postCount || "?"} ×{" "}
                  {draft.postSize || "not selected"}
                </li>
                <li>
                  Attachment/stairs/railings: {draft.attachment || "unanswered"}
                  ; {draft.stairsIncluded || "unanswered"};{" "}
                  {draft.railingsIncluded || "unanswered"}
                </li>
              </ul>
            </div>
          </section>
          {callouts.length ? (
            <section
              aria-labelledby="blueprint-callouts-heading"
              aria-live="polite"
              className="mt-3 rounded-lg border-2 border-amber-400 bg-amber-50 p-3"
            >
              <h5
                id="blueprint-callouts-heading"
                className="font-black text-amber-950"
              >
                What this draft still needs
              </h5>
              <p className="mt-1 text-sm text-amber-900">
                The numbered markers show where missing or unsupported decisions
                affect the drawing.
              </p>
              <ol className="mt-3 space-y-2">
                {callouts.map((callout, index) => (
                  <li key={callout.id}>
                    <button
                      type="button"
                      className="flex min-h-11 w-full gap-3 rounded-md bg-white p-3 text-left text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-700"
                      onClick={() => {
                        if (
                          callout.id === "stairs-fact" &&
                          draft.stairsIncluded === "yes"
                        )
                          onEditStairPlacement();
                        else if (callout.kind === "package")
                          openPackageGuidance(callout.id);
                        else {
                          setDetailsOpen(true);
                          setStep(callout.step);
                        }
                      }}
                    >
                      <span
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-red-700 font-black text-white"
                        aria-hidden="true"
                      >
                        {index + 1}
                      </span>
                      <span>
                        <span className="sr-only">Callout {index + 1}: </span>
                        {callout.label}
                        <span className="mt-1 block text-xs font-bold text-violet-800">
                          {callout.id === "stairs-fact" &&
                          draft.stairsIncluded === "yes"
                            ? "Edit stair placement"
                            : callout.kind === "package"
                              ? "Open package guidance"
                              : `Edit ${STEPS[callout.step]}`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ) : (
            <p className="mt-3 rounded-md border border-blue-400 bg-blue-50 p-3 text-sm font-bold text-blue-950">
              No immediate layout questions remain. Later design, ordering, and
              permit-readiness items are listed separately below.
            </p>
          )}
          <details className="mt-3 rounded-lg border border-slate-300 bg-slate-50 p-3">
            <summary className="min-h-11 cursor-pointer py-2 font-black text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-700">
              Later: design, ordering, and permit readiness
            </summary>
            <p className="mt-2 text-sm text-slate-700">
              These items do not belong in “answer now” drawing callouts. They
              still block canonical approval or final estimate readiness at the
              appropriate later stage.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-800">
              <li>Explicit City jurisdiction verification</li>
              <li>Concealed ledger substrate and attachment detail</li>
              <li>Soil bearing and frost-depth basis</li>
              <li>Reviewed stair and guard details where applicable</li>
              <li>
                Compatible connector products, manufacturer fasteners, prices,
                and traceable sources
              </li>
            </ul>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {plan.unresolvedPackages.includes("stairs") ? (
                <button
                  type="button"
                  className={button}
                  onClick={() => openPackageGuidance("package-stairs")}
                >
                  Stair readiness guidance
                </button>
              ) : null}
              {plan.unresolvedPackages.includes("guard_schedule") ? (
                <button
                  type="button"
                  className={button}
                  onClick={() => openPackageGuidance("package-guards")}
                >
                  Guard readiness guidance
                </button>
              ) : null}
              <button
                type="button"
                className={button}
                onClick={() => openPackageGuidance("package-connectors")}
              >
                Connector readiness guidance
              </button>
            </div>
          </details>
          {activePackage ? (
            <div
              ref={packagePanelRef}
              tabIndex={-1}
              role="region"
              aria-live="polite"
              aria-labelledby="package-guidance-title"
              className="mt-3 rounded-lg border-2 border-violet-500 bg-violet-50 p-4 outline-none focus-visible:ring-2 focus-visible:ring-violet-700"
            >
              <h5
                id="package-guidance-title"
                className="font-black text-violet-950"
              >
                {activePackage === "stairs"
                  ? "Stair package guidance"
                  : activePackage === "guards"
                    ? "Guard and railing package guidance"
                    : "Connector package guidance"}
              </h5>
              <p className="mt-2 text-sm leading-6 text-violet-950">
                {activePackage === "stairs"
                  ? "Complete the Stairs category in the takeoff checklist with a reviewed stair framing/landing/footing detail, purchasable quantities, compatible products, prices, and traceable sources. This drawing does not size stringers or landings."
                  : activePackage === "guards"
                    ? "Complete the Structural connectors category with the reviewed railing system layout: posts, corners, ends, blocking and load path, attachments, manufacturer fasteners, compatible products, prices, and sources."
                    : "Complete the Structural connectors category in the takeoff checklist. Every applicable row needs its compatible product, manufacturer fastener schedule, verified substrate/coating/load path, purchase quantity, price, and traceable source."}
              </p>
              <button
                type="button"
                className="mt-3 min-h-11 rounded-md border-2 border-violet-700 bg-white px-4 py-2 text-sm font-bold text-violet-950"
                onClick={() => setActivePackage(null)}
              >
                Close package guidance
              </button>
            </div>
          ) : null}
          {plan.bom.length ? (
            <div className="mt-3 rounded border border-amber-400 bg-amber-50 p-3">
              <p className="font-black">
                Main deck framing draft is partially ready
              </p>
              <p className="mt-1 text-sm">
                Main-deck framing can move forward, but{" "}
                {unresolvedLabels.join(", ")}{" "}
                {unresolvedLabels.length === 1 ? "is" : "are"} still required
                before the complete estimate is ready.
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {plan.bom.map((x) => (
                  <li key={x.key}>
                    {x.quantity} {x.unit} · {x.description}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <label className="mt-3 flex min-h-11 gap-3 rounded border p-3 text-sm font-bold">
            <input
              type="checkbox"
              disabled={
                !plan.quantities || callouts.length > 0 || Boolean(pendingFacts)
              }
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
            />
            I reviewed the saved field facts, explicit estimating assumptions,
            rule checks, drawing, and preliminary quantities. Later permit and
            ordering packages remain unresolved.
          </label>
          <button
            type="button"
            className={`mt-3 w-full ${button}`}
            disabled={
              disabled ||
              !approved ||
              !plan.quantities ||
              callouts.length > 0 ||
              Boolean(pendingFacts)
            }
            onClick={() => onApprove(plan)}
          >
            Approve estimating layout and use preliminary framing in takeoff
          </button>
        </div>
      ) : null}
      {detailsOpen ? (
        <div className="sticky bottom-2 z-10 mt-4 grid grid-cols-2 gap-2 rounded-lg border border-slate-300 bg-white/95 p-2 shadow-lg backdrop-blur">
          <button
            type="button"
            className={button}
            disabled={step === 0}
            onClick={() => setStep((x) => x - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className={button}
            disabled={step === STEPS.length - 1}
            onClick={() => setStep((x) => x + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}
