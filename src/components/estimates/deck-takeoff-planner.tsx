"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { DeckPrescriptivePlanGenerator } from "@/components/estimates/deck-prescriptive-plan-generator";
import type { FinalizedDeckShape } from "@/components/estimates/deck-shape-review";
import type { EstimateBuilderEnvelope } from "@/lib/estimate-builder-client";
import {
  DECK_FINISH_DRAFT_VERSION,
  parseDeckFinishDraftSnapshot,
  type DeckFinishDraftSnapshot,
} from "@/lib/deck-finish-draft";
import {
  buildDefaultAluminumRailingPackage,
  buildDefaultCableRailingPackage,
  buildDefaultVinylRailingPackage,
  type DeckRailingProductRole,
} from "@/lib/deck-railing-system";
import {
  buildCustomDeckStructuralDraft,
  customDeckEstimatingConceptJoistLine,
  deckOutlineOutwardNormal,
  deckShapeStructuralHandoff,
  type CustomDeckJoistDirection,
  type CustomDeckEstimatingConcept,
  type DeckPrescriptivePlan,
} from "@/lib/deck-prescriptive-plan";
import {
  buildDeckTakeoffPreview,
  COMPLETE_REBUILD_LINE_KEYS,
  completeRebuildScopeRequirement,
  customDeckFinishGeometry,
  deckBlueprintVisitSeed,
  deckFieldDimensions,
  deckRailingGeometry,
  deckShapeBindingMatches,
  deckStructuralLineIsComplete,
  estimateCustomDeckBoardPieces,
  estimateCustomSquareEdgePieces,
  type CompleteRebuildLineKey,
  type DeckObservationItem,
  type DeckTakeoffPlan,
  type DeckTakeoffPreview,
} from "@/lib/deck-takeoff-v0";

type CatalogMaterial = {
  id: string;
  category?: string;
  description: string;
  unit?: string;
  effective_unit_cost?: number;
  selected_price?: {
    source_reference?: string | null;
    suppliers?: { name?: string } | null;
    supplier_locations?: { name?: string; store_number?: string } | null;
  } | null;
};

type FixedLine = DeckTakeoffPlan["additionalLines"][number];
type LowesSuggestion = {
  kind:
    | "deck_board"
    | "deck_board_grooved"
    | "deck_board_square_edge"
    | "deck_fastener"
    | DeckRailingProductRole;
  description: string;
  unitCost: number | null;
  sourceUrl: string;
  stockLengthFeet: number | null;
  coverageSquareFeetPerPack: number | null;
  manufacturer: string | null;
  productLine: string | null;
  reason: string;
  catalogMaterialId: string | null;
  priceBasis: "current_retail" | "cached_retail" | "catalog_estimate" | "live_public_retail" | "unpriced";
  priceCheckedAt: string | null;
};

function estimatingPriceLabel(product: LowesSuggestion | undefined) {
  if (!product?.unitCost) return "Price needs a manual estimate";
  if (product.priceBasis === "current_retail" || product.priceBasis === "live_public_retail") {
    return "Current public retail estimate";
  }
  if (product.priceBasis === "cached_retail") return "Last verified retail estimate";
  return "Saved catalog estimate";
}

type DeckingFamily = "wood" | "composite";
type CompositeColor = "brown" | "gray" | "cedar" | "redwood" | "coastal";
type RailingFamily = "wood" | "metal" | "vinyl" | "cable" | "none";

const COMPOSITE_COLORS: readonly {
  key: CompositeColor;
  label: string;
  swatch: string;
}[] = [
  { key: "brown", label: "Brown", swatch: "#765341" },
  { key: "gray", label: "Gray", swatch: "#64748b" },
  { key: "cedar", label: "Cedar", swatch: "#b77948" },
  { key: "redwood", label: "Redwood", swatch: "#8f4638" },
  { key: "coastal", label: "Coastal", swatch: "#9ba8a5" },
] as const;

const DEFAULT_WOOD_RAILING_RATE = "25";

const input =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100";
const primary =
  "min-h-11 rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const secondary =
  "min-h-11 rounded-md border border-slate-400 bg-white px-4 py-2 text-sm font-bold text-slate-950 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const INITIAL_LINES: FixedLine[] = [
  {
    key: "ledger_attachment",
    category: "material",
    description: "Ledger and house attachment",
    quantity: "",
    unit: "allowance",
    unitCost: "",
    catalogMaterialId: null,
    sourceReference: "",
  },
  {
    key: "joists",
    category: "material",
    description: "Planned joists",
    quantity: "",
    unit: "ea",
    unitCost: "",
    catalogMaterialId: null,
    sourceReference: "",
  },
  {
    key: "beams",
    category: "material",
    description: "Beam / support system",
    quantity: "",
    unit: "ln ft",
    unitCost: "",
    catalogMaterialId: null,
    sourceReference: "",
  },
  {
    key: "posts",
    category: "material",
    description: "Posts / supports",
    quantity: "",
    unit: "ea",
    unitCost: "",
    catalogMaterialId: null,
    sourceReference: "",
  },
  {
    key: "footings",
    category: "material",
    description: "Foundations / footings and concrete",
    quantity: "",
    unit: "allowance",
    unitCost: "",
    catalogMaterialId: null,
    sourceReference: "",
  },
  {
    key: "blocking",
    category: "material",
    description: "Blocking and bracing",
    quantity: "",
    unit: "allowance",
    unitCost: "",
    catalogMaterialId: null,
    sourceReference: "",
  },
  {
    key: "structural_connectors",
    category: "material",
    description: "Structural connectors and fasteners",
    quantity: "",
    unit: "allowance",
    unitCost: "",
    catalogMaterialId: null,
    sourceReference: "",
  },
  {
    key: "stairs",
    category: "material",
    description: "Stair materials",
    quantity: "",
    unit: "allowance",
    unitCost: "",
    catalogMaterialId: null,
    sourceReference: "",
  },
  {
    key: "demolition_disposal",
    category: "other",
    description: "Demolition and disposal",
    quantity: "",
    unit: "allowance",
    unitCost: "",
    catalogMaterialId: null,
    sourceReference: "",
  },
  {
    key: "delivery",
    category: "other",
    description: "Material delivery",
    quantity: "",
    unit: "allowance",
    unitCost: "",
    catalogMaterialId: null,
    sourceReference: "",
  },
  {
    key: "equipment",
    category: "equipment",
    description: "Equipment and rentals",
    quantity: "",
    unit: "allowance",
    unitCost: "",
    catalogMaterialId: null,
    sourceReference: "",
  },
  {
    key: "labor",
    category: "labor",
    description: "Deck construction labor",
    quantity: "",
    unit: "hr",
    unitCost: "",
    catalogMaterialId: null,
    sourceReference: "",
  },
  {
    key: "custom_decking",
    category: "material",
    description: "Deck boards from reviewed custom-footprint layout",
    quantity: "",
    unit: "ea",
    unitCost: "",
    catalogMaterialId: null,
    sourceReference: "",
  },
  {
    key: "custom_decking_square_edge",
    category: "material",
    description: "Square-edge picture-frame and divider boards",
    quantity: "",
    unit: "ea",
    unitCost: "",
    catalogMaterialId: null,
    sourceReference: "",
  },
  {
    key: "custom_railing",
    category: "material",
    description: "Railing from reviewed custom-footprint layout",
    quantity: "",
    unit: "ea",
    unitCost: "",
    catalogMaterialId: null,
    sourceReference: "",
  },
];

const LINE_GUIDANCE: Record<CompleteRebuildLineKey, string> = {
  ledger_attachment:
    "Use the reviewed attachment detail. Do not copy the existing ledger connection or choose fasteners from photos.",
  joists:
    "Enter the member quantity from the reviewed framing layout. Deck dimensions alone do not decide joist size, span, spacing, doubles, or openings.",
  beams:
    "Enter the beam or alternate support-system material from the reviewed framing plan. The app does not select size, plies, span, or support locations.",
  posts:
    "Enter the posts or alternate supports from the reviewed support plan. Existing visible posts do not set the replacement layout.",
  footings:
    "Enter the reviewed foundation, footing, and concrete quantity. The app does not choose count, diameter, depth, reinforcement, or soil capacity.",
  blocking:
    "Enter blocking and bracing from the reviewed framing plan, including any picture-frame or railing support requirements.",
  structural_connectors:
    "Include the specified hangers, bases, caps, ties, bolts, screws, and other connectors from the reviewed details.",
  stairs:
    "Enter the reviewed stair framing and finish materials. Field rise and width do not size stringers, landings, or foundations.",
  demolition_disposal:
    "Include full-deck removal, hauling, disposal fees, and any separated hazardous or special handling actually in scope.",
  delivery:
    "Enter the quoted delivery or handling charge, or mark it not in this estimate.",
  equipment:
    "Enter reviewed rental or equipment costs, or mark them not in this estimate.",
  labor:
    "Enter reviewed labor hours and rate. The app does not create production rates from deck area or photos.",
};

const INITIAL_SCOPE_DECISIONS = Object.fromEntries(
  COMPLETE_REBUILD_LINE_KEYS.map((key) => [key, ""]),
) as DeckTakeoffPlan["scopeDecisions"];

function defaultPlan(): DeckTakeoffPlan {
  return {
    customStructuralPlanRevisionId: null,
    shapeBinding: null,
    takeoffScope: "complete_rebuild",
    completeRebuildConfirmed: false,
    buildPlanReference: "",
    buildPlanConfirmed: false,
    framingPlanEvidence: null,
    hardwareSelections: [],
    scopeDecisions: INITIAL_SCOPE_DECISIONS,
    boardRunDirection: "along_length",
    stairEdge: "right",
    stairPosition: "end",
    stairOffsetFeet: "",
    stairPlacementConfirmed: false,
    boardActualWidthInches: "5.5",
    boardGapInches: "0.125",
    boardStockLengthFeet: "",
    boardWastePercent: "10",
    boardCatalogMaterialId: null,
    boardUnitCost: "",
    boardSourceReference: "",
    screwCoverageSquareFeetPerPack: "",
    screwCatalogMaterialId: null,
    screwPackUnitCost: "",
    screwSourceReference: "",
    railingSectionLengthFeet: "",
    railingCatalogMaterialId: null,
    railingUnitCost: "",
    railingSourceReference: "",
    additionalLines: INITIAL_LINES,
  };
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
    <label className="block text-sm font-bold text-slate-800">
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

function sourceLabel(material: CatalogMaterial) {
  const supplier = material.selected_price?.suppliers?.name ?? "Catalog";
  const location = material.selected_price?.supplier_locations;
  return `${supplier}${location?.store_number ? ` store ${location.store_number}` : location?.name ? ` · ${location.name}` : ""}`;
}

export function DeckTakeoffPlanner({
  estimateId,
  visitId,
  visitRevision,
  visitItems,
  calculationRevision,
  takeoffApplied,
  disabled,
  workflowPhase,
  approvedShape,
  onApplied,
  onStructureReady,
}: {
  estimateId: string;
  visitId: string;
  visitRevision: number;
  visitItems: readonly DeckObservationItem[];
  calculationRevision: number;
  takeoffApplied: boolean;
  disabled: boolean;
  workflowPhase: "structure" | "takeoff";
  approvedShape: FinalizedDeckShape | null;
  onApplied: (state: EstimateBuilderEnvelope) => void;
  onStructureReady: (readiness: "preliminary_geometry" | "approved_plan") => void;
}) {
  const [plan, setPlan] = useState<DeckTakeoffPlan>(defaultPlan);
  const [catalog, setCatalog] = useState<CatalogMaterial[]>([]);
  const [preview, setPreview] = useState<DeckTakeoffPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checks, setChecks] = useState({
    dimensions: false,
    quantities: false,
    prices: false,
  });
  const [suggestions, setSuggestions] = useState<LowesSuggestion[]>([]);
  const [findingProducts, setFindingProducts] = useState(false);
  const [deckingFamily, setDeckingFamily] = useState<DeckingFamily>("wood");
  const [compositeColor, setCompositeColor] =
    useState<CompositeColor>("brown");
  const [railingFamily, setRailingFamily] = useState<RailingFamily>("wood");
  const [stairRailSides, setStairRailSides] = useState<1 | 2>(2);
  const [woodRailingRate, setWoodRailingRate] = useState(
    DEFAULT_WOOD_RAILING_RATE,
  );
  const [activeScopeKey, setActiveScopeKey] = useState<CompleteRebuildLineKey>(
    COMPLETE_REBUILD_LINE_KEYS[0],
  );
  const [customJoistDirection, setCustomJoistDirection] =
    useState<CustomDeckJoistDirection>("house_to_yard");
  const [customJoistSpacing, setCustomJoistSpacing] = useState<12 | 16 | 24>(16);
  const [customPlanRevision, setCustomPlanRevision] = useState(0);
  const [savedCustomPlan, setSavedCustomPlan] = useState<{
    id: string;
    shapeRevisionId: string;
    shapeRevision: number;
    shapeDigest: string;
    concept: CustomDeckEstimatingConcept;
  } | null>(null);
  const [customPlanLoading, setCustomPlanLoading] = useState(false);
  const [finishDraftRevision, setFinishDraftRevision] = useState(0);
  const [finishDraftLoading, setFinishDraftLoading] = useState(false);
  const customPlanSaveKey = useRef("");
  const finishDraftSaveKey = useRef("");
  const finishApplicationId = useRef("");
  const finishApplicationKey = useRef("");
  const productRequestSequence = useRef(0);
  const appliedDefaults = useRef(false);
  const layoutDetailsRef = useRef<HTMLDetailsElement>(null);
  const scopeEditorRef = useRef<HTMLFieldSetElement>(null);
  const fieldDimensions = useMemo(
    () => deckFieldDimensions(visitItems),
    [visitItems],
  );
  const approvedShapeDimensions = useMemo(() => {
    if (!approvedShape?.outline.length) return null;
    const xs = approvedShape.outline.map((point) => point.x);
    const ys = approvedShape.outline.map((point) => point.y);
    return {
      lengthFeet: Math.max(...xs) - Math.min(...xs),
      widthFeet: Math.max(...ys) - Math.min(...ys),
    };
  }, [approvedShape]);
  const dimensions = plan.framingPlanEvidence
    ? {
        lengthFeet: plan.framingPlanEvidence.inputs.lengthFeet,
        widthFeet: plan.framingPlanEvidence.inputs.widthFeet,
      }
    : approvedShapeDimensions ?? fieldDimensions;
  const railingGeometry = useMemo(
    () =>
      deckRailingGeometry(
        visitItems,
        plan.framingPlanEvidence
          ? {
              lengthFeet: plan.framingPlanEvidence.inputs.lengthFeet,
              widthFeet: plan.framingPlanEvidence.inputs.widthFeet,
            }
          : approvedShapeDimensions,
      ),
    [approvedShapeDimensions, plan.framingPlanEvidence, visitItems],
  );
  useEffect(() => {
    if (railingGeometry.railingsPresent === false) setRailingFamily("none");
    else if (railingFamily === "none") setRailingFamily("wood");
  }, [railingGeometry.railingsPresent, railingFamily]);
  const blueprintVisitSeed = useMemo(
    () => deckBlueprintVisitSeed(visitItems),
    [visitItems],
  );
  const approvedStairsPresent = approvedShape?.stairsPresent ?? railingGeometry.stairsPresent;
  const approvedShapeHandoff = useMemo(
    () => (approvedShape ? deckShapeStructuralHandoff(approvedShape) : null),
    [approvedShape],
  );
  const approvedShapeStairPlacementConfirmed =
    approvedShapeHandoff?.stairPlacementConfirmed ?? false;
  const customApprovedFootprint =
    approvedShapeHandoff?.footprintMode === "reviewed_custom_plan";
  const customFinishGeometry = useMemo(
    () =>
      customApprovedFootprint && approvedShape
        ? customDeckFinishGeometry({
            outline: approvedShape.outline,
            attached: railingGeometry.attached,
            stairsPresent: approvedShape.stairsPresent,
            stairPlacement: approvedShape.stairPlacement,
          })
        : null,
    [approvedShape, customApprovedFootprint, railingGeometry.attached],
  );
  const finishRailingLengthFeet = customApprovedFootprint
    ? customFinishGeometry?.levelRailingFeet ?? null
    : railingGeometry.railingLengthFeet;
  const stairProjectionFeet =
    plan.shapeBinding?.stairPlacement?.projectionFeet ?? null;
  const woodRailingFeet = Math.max(
    0,
    (finishRailingLengthFeet ?? 0) +
      (railingGeometry.stairsPresent && stairProjectionFeet
        ? stairProjectionFeet * stairRailSides
        : 0),
  );
  const customDeckBoardEstimate = useMemo(() => {
    if (!customFinishGeometry) return null;
    return estimateCustomDeckBoardPieces({
      areaSquareFeet: customFinishGeometry.areaSquareFeet,
      boardActualWidthInches: Number(plan.boardActualWidthInches),
      boardGapInches: Number(plan.boardGapInches),
      stockLengthFeet: Number(plan.boardStockLengthFeet),
      wastePercent: Number(plan.boardWastePercent),
    });
  }, [
    customFinishGeometry,
    plan.boardActualWidthInches,
    plan.boardGapInches,
    plan.boardStockLengthFeet,
    plan.boardWastePercent,
  ]);
  const customSquareEdgeEstimate = useMemo(() => {
    if (!customFinishGeometry || !approvedShape?.outline.length) return null;
    const xs = approvedShape.outline.map((point) => point.x);
    const ys = approvedShape.outline.map((point) => point.y);
    const widthFeet = Math.max(...xs) - Math.min(...xs);
    const projectionFeet = Math.max(...ys) - Math.min(...ys);
    const boardRunFeet =
      plan.boardRunDirection === "along_width" ? widthFeet : projectionFeet;
    const dividerSpanFeet =
      plan.boardRunDirection === "along_width" ? projectionFeet : widthFeet;
    return estimateCustomSquareEdgePieces({
      perimeterFeet: customFinishGeometry.perimeterFeet,
      boardRunFeet,
      dividerSpanFeet,
      stockLengthFeet: Number(plan.boardStockLengthFeet),
      wastePercent: Number(plan.boardWastePercent),
    });
  }, [
    approvedShape,
    customFinishGeometry,
    plan.boardRunDirection,
    plan.boardStockLengthFeet,
    plan.boardWastePercent,
  ]);
  const customDeckingCoverageSquareFeet = customFinishGeometry
    ? customFinishGeometry.areaSquareFeet *
      (1 + Math.max(0, Number(plan.boardWastePercent) || 0) / 100)
    : null;

  useEffect(() => {
    if (!customApprovedFootprint || !customFinishGeometry) return;
    setPlan((current) => {
      const nextDeckQuantity = customDeckBoardEstimate
        ? String(customDeckBoardEstimate.pieces)
        : customDeckingCoverageSquareFeet?.toFixed(2) ?? "";
      const nextDeckUnit = customDeckBoardEstimate ? "ea" : "sq ft";
      const nextRailQuantity =
        railingGeometry.railingsPresent === false
          ? ""
          : railingFamily === "wood"
            ? woodRailingFeet.toFixed(2)
            : finishRailingLengthFeet?.toFixed(2) ?? "";
      let changed = false;
      const additionalLines = current.additionalLines.map((line) => {
        if (line.key === "custom_decking") {
          if (line.quantity === nextDeckQuantity && line.unit === nextDeckUnit)
            return line;
          changed = true;
          return { ...line, quantity: nextDeckQuantity, unit: nextDeckUnit };
        }
        if (line.key === "custom_decking_square_edge") {
          const nextQuantity =
            deckingFamily === "composite" && customSquareEdgeEstimate
              ? String(customSquareEdgeEstimate.pieces)
              : "";
          if (line.quantity === nextQuantity && line.unit === "ea") return line;
          changed = true;
          return { ...line, quantity: nextQuantity, unit: "ea" };
        }
        if (line.key === "custom_railing") {
          if (
            railingFamily !== "wood" &&
            line.sourceReference.trim() &&
            line.quantity &&
            line.unit
          )
            return line;
          if (line.quantity === nextRailQuantity && line.unit === "ln ft")
            return line;
          changed = true;
          return {
            ...line,
            quantity: nextRailQuantity,
            unit: "ln ft",
          };
        }
        return line;
      });
      return changed ? { ...current, additionalLines } : current;
    });
  }, [
    customApprovedFootprint,
    customDeckBoardEstimate,
    customDeckingCoverageSquareFeet,
    customFinishGeometry,
    customSquareEdgeEstimate,
    deckingFamily,
    finishRailingLengthFeet,
    railingFamily,
    railingGeometry.railingsPresent,
    woodRailingFeet,
  ]);

  useEffect(() => {
    if (!approvedShape) return;
    customPlanSaveKey.current = "";
    const nextBinding = {
      id: approvedShape.id,
      shapeRevision: approvedShape.shapeRevision,
      outline: approvedShape.outline,
      stairsPresent: approvedShape.stairsPresent,
      stairPlacement: approvedShape.stairPlacement,
    } as const;
    setPlan((current) => {
      const shapeChanged = !deckShapeBindingMatches(
        current.shapeBinding,
        nextBinding,
      );
      const placement = approvedShapeHandoff?.rectangularStairPlacement;
      if (!shapeChanged) {
        return current.stairPlacementConfirmed ===
          approvedShapeStairPlacementConfirmed
          ? current
          : {
              ...current,
              stairPlacementConfirmed: approvedShapeStairPlacementConfirmed,
            };
      }
      const structuralKeys = new Set<CompleteRebuildLineKey>([
        "ledger_attachment",
        "joists",
        "beams",
        "posts",
        "footings",
        "blocking",
        "structural_connectors",
        "stairs",
      ]);
      const resetLineKeys = new Set<string>([
        ...structuralKeys,
        "custom_decking",
        "custom_decking_square_edge",
        "custom_railing",
      ]);
      return {
        ...current,
        customStructuralPlanRevisionId: null,
        shapeBinding: nextBinding,
        stairEdge: placement?.edge ?? current.stairEdge,
        stairOffsetFeet: placement ? String(placement.offsetFeet) : "",
        stairPlacementConfirmed: approvedShapeStairPlacementConfirmed,
        buildPlanReference: "",
        buildPlanConfirmed: false,
        framingPlanEvidence: null,
        hardwareSelections: [],
        scopeDecisions: {
          ...current.scopeDecisions,
          ...Object.fromEntries([...structuralKeys].map((key) => [key, ""])),
        },
        additionalLines: current.additionalLines.map((line) =>
          resetLineKeys.has(line.key)
            ? { ...line, quantity: "", unitCost: "", sourceReference: "", catalogMaterialId: null }
            : line,
        ),
      };
    });
    setPreview(null);
  }, [
    approvedShape,
    approvedShapeHandoff,
    approvedShapeStairPlacementConfirmed,
  ]);
  useEffect(() => {
    if (!customApprovedFootprint || !approvedShape) {
      setSavedCustomPlan(null);
      setCustomPlanRevision(0);
      return;
    }
    let cancelled = false;
    setCustomPlanLoading(true);
    fetch(
      `/api/guided-site-visits/${encodeURIComponent(visitId)}/deck-structural-plan-revisions`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const body = (await response.json()) as {
          success?: boolean;
          error?: string;
          staleShape?: boolean;
          currentPlanRevision?: number;
          latestPlan?: {
            id: string;
            planRevision: number;
            shapeRevisionId: string;
            shapeRevision: number;
            shapeDigest: string;
            concept: CustomDeckEstimatingConcept;
          } | null;
        };
        if (!response.ok || !body.success)
          throw new Error(body.error || "The preliminary Deck plan could not be loaded.");
        if (cancelled) return;
        if (body.staleShape) {
          setSavedCustomPlan(null);
          setCustomPlanRevision(body.currentPlanRevision ?? 0);
          setNotice("The saved footprint changed. Generate a new preliminary estimating plan for this revision.");
          return;
        }
        const latest = body.latestPlan ?? null;
        setCustomPlanRevision(body.currentPlanRevision ?? latest?.planRevision ?? 0);
        setSavedCustomPlan(
          latest
            ? {
                id: latest.id,
                shapeRevisionId: latest.shapeRevisionId,
                shapeRevision: latest.shapeRevision,
                shapeDigest: latest.shapeDigest,
                concept: latest.concept,
              }
            : null,
        );
        if (latest) {
          setCustomJoistDirection(latest.concept.joistDirection);
          setCustomJoistSpacing(latest.concept.joistSpacingInches);
          const line = customDeckEstimatingConceptJoistLine(latest.concept);
          setPlan((current) => ({
            ...current,
            customStructuralPlanRevisionId: latest.id,
            buildPlanConfirmed: false,
            framingPlanEvidence: null,
            additionalLines: current.additionalLines.map((item) =>
              item.key === "joists"
                ? { ...item, ...line, unitCost: "", sourceReference: "", catalogMaterialId: null }
                : item,
            ),
          }));
        }
      })
      .catch((caught) => {
        if (!cancelled)
          setError(caught instanceof Error ? caught.message : "The preliminary Deck plan could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setCustomPlanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [approvedShape, customApprovedFootprint, visitId]);

  useEffect(() => {
    if (!customApprovedFootprint || !savedCustomPlan || !approvedShape) {
      setFinishDraftRevision(0);
      return;
    }
    let cancelled = false;
    setFinishDraftLoading(true);
    fetch(
      `/api/guided-site-visits/${encodeURIComponent(visitId)}/deck-finish-selection`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const body = (await response.json()) as {
          success?: boolean;
          error?: string;
          staleDesign?: boolean;
          currentSelectionRevision?: number;
          latestSelection?: {
            selectionRevision: number;
            selection: DeckFinishDraftSnapshot;
          } | null;
        };
        if (!response.ok || !body.success)
          throw new Error(
            body.error || "The saved finish selections could not be loaded.",
          );
        if (cancelled) return;
        setFinishDraftRevision(body.currentSelectionRevision ?? 0);
        if (body.staleDesign) {
          setNotice(
            "The saved Deck design changed. Choose finishes again for this revision.",
          );
          return;
        }
        if (!body.latestSelection) return;
        const saved = parseDeckFinishDraftSnapshot(
          body.latestSelection.selection,
        );
        setDeckingFamily(saved.deckingFamily);
        if (saved.compositeColor) setCompositeColor(saved.compositeColor);
        setRailingFamily(saved.railingFamily);
        setStairRailSides(saved.stairRailSides);
        setWoodRailingRate(
          saved.woodRailingRate === null
            ? DEFAULT_WOOD_RAILING_RATE
            : String(saved.woodRailingRate),
        );
        setPlan((current) => ({
          ...current,
          boardActualWidthInches: String(saved.board.actualWidthInches),
          boardGapInches: String(saved.board.gapInches),
          boardStockLengthFeet:
            saved.board.stockLengthFeet === null
              ? ""
              : String(saved.board.stockLengthFeet),
          boardWastePercent: String(saved.board.wastePercent),
          additionalLines: current.additionalLines.map((line) => {
            const savedLine = saved.lines.find((item) => item.key === line.key);
            return savedLine
              ? {
                  ...line,
                  description: savedLine.description,
                  quantity:
                    savedLine.quantity === null
                      ? ""
                      : String(savedLine.quantity),
                  unit: savedLine.unit,
                  unitCost:
                    savedLine.unitCost === null
                      ? ""
                      : String(savedLine.unitCost),
                  sourceReference: savedLine.sourceReference,
                  catalogMaterialId: savedLine.catalogMaterialId,
                }
              : line;
          }),
        }));
        setNotice("Saved finish selections and working costs restored.");
      })
      .catch((caught) => {
        if (!cancelled)
          setError(
            caught instanceof Error
              ? caught.message
              : "The saved finish selections could not be loaded.",
          );
      })
      .finally(() => {
        if (!cancelled) setFinishDraftLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [approvedShape, customApprovedFootprint, savedCustomPlan, visitId]);

  function productLengthFeet(description: string) {
    const matches = [
      ...description.matchAll(
        /(?:^|\s|x|-)(\d+(?:\.\d+)?)\s*(?:ft|foot|feet)(?:\b|-)/gi,
      ),
    ];
    return matches.length ? Number(matches.at(-1)?.[1]) : null;
  }

  function isLowes(material: CatalogMaterial) {
    return (material.selected_price?.suppliers?.name ?? "")
      .toLowerCase()
      .includes("lowe");
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/material-catalog?active=true&includePrices=true", {
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          materials?: CatalogMaterial[];
        };
        if (!response.ok) throw new Error();
        if (active) setCatalog(body.materials ?? []);
      })
      .catch(() => {
        if (active)
          setNotice(
            "The catalog could not be loaded. You can still enter a verified cost and source manually.",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (appliedDefaults.current || !catalog.length) return;
    const pricedLowes = catalog.filter(
      (material) =>
        isLowes(material) && Number(material.effective_unit_cost) > 0,
    );
    const boardCandidates = pricedLowes
      .map((material) => ({
        material,
        length: productLengthFeet(material.description),
      }))
      .filter(
        (entry): entry is { material: CatalogMaterial; length: number } =>
          Boolean(entry.length) &&
          /deck.*board|decking/i.test(entry.material.description),
      );
    const run =
      plan.boardRunDirection === "along_width"
        ? dimensions.widthFeet
        : dimensions.lengthFeet;
    const board = run
      ? [...boardCandidates].sort((a, b) => {
          const aFits = a.length >= run ? 0 : a.length * 2 >= run ? 1 : 2;
          const bFits = b.length >= run ? 0 : b.length * 2 >= run ? 1 : 2;
          return (
            aFits - bFits ||
            Math.abs(a.length - run) - Math.abs(b.length - run) ||
            Number(a.material.effective_unit_cost) -
              Number(b.material.effective_unit_cost)
          );
        })[0]
      : boardCandidates.sort((a, b) => b.length - a.length)[0];
    const screw = pricedLowes.find((material) =>
      /deck.*(?:screw|fastener)|(?:screw|fastener).*deck/i.test(
        material.description,
      ),
    );
    const railing = pricedLowes
      .map((material) => ({
        material,
        length: productLengthFeet(material.description),
      }))
      .filter(
        (entry): entry is { material: CatalogMaterial; length: number } =>
          Boolean(entry.length) && /rail/i.test(entry.material.description),
      )
      .sort((a, b) => b.length - a.length)[0];
    if (!board && !screw && !railing) return;
    const pricedSource = (material: CatalogMaterial) =>
      material.selected_price?.source_reference ||
      `catalog:${material.id}:${sourceLabel(material)}`;
    setPlan((current) => ({
      ...current,
      ...(board
        ? {
            boardStockLengthFeet: String(board.length),
            boardCatalogMaterialId: board.material.id,
            boardUnitCost: String(board.material.effective_unit_cost),
            boardSourceReference: pricedSource(board.material),
          }
        : {}),
      ...(screw
        ? {
            screwCatalogMaterialId: screw.id,
            screwPackUnitCost: String(screw.effective_unit_cost),
            screwSourceReference: pricedSource(screw),
          }
        : {}),
      ...(railing
        ? {
            railingSectionLengthFeet: String(railing.length),
            railingCatalogMaterialId: railing.material.id,
            railingUnitCost: String(railing.material.effective_unit_cost),
            railingSourceReference: pricedSource(railing.material),
          }
        : {}),
    }));
    appliedDefaults.current = true;
  }, [
    catalog,
    dimensions.lengthFeet,
    dimensions.widthFeet,
    plan.boardRunDirection,
  ]);

  const catalogById = useMemo(
    () => new Map(catalog.map((material) => [material.id, material])),
    [catalog],
  );

  function chooseCatalog(target: "board" | "screw" | string, id: string) {
    const material = catalogById.get(id);
    const cost = material?.effective_unit_cost;
    const source = material
      ? material.selected_price?.source_reference ||
        `catalog:${material.id}:${sourceLabel(material)}`
      : "";
    if (target === "board")
      setPlan({
        ...plan,
        boardCatalogMaterialId: id || null,
        boardUnitCost: cost ? String(cost) : "",
        boardSourceReference: source,
      });
    else if (target === "screw")
      setPlan({
        ...plan,
        screwCatalogMaterialId: id || null,
        screwPackUnitCost: cost ? String(cost) : "",
        screwSourceReference: source,
      });
    else if (target === "railing")
      setPlan({
        ...plan,
        railingCatalogMaterialId: id || null,
        railingUnitCost: cost ? String(cost) : "",
        railingSourceReference: source,
        railingSectionLengthFeet: material
          ? String(productLengthFeet(material.description) ?? "")
          : "",
      });
    else
      setPlan({
        ...plan,
        additionalLines: plan.additionalLines.map((line) =>
          line.key === target
            ? {
                ...line,
                catalogMaterialId: id || null,
                unitCost: cost ? String(cost) : "",
                sourceReference: source,
              }
            : line,
        ),
      });
    setPreview(null);
  }

  function updateLine(key: string, field: keyof FixedLine, value: string) {
    const generatedMainKeys = new Set([
      "ledger_attachment",
      "joists",
      "beams",
      "posts",
      "footings",
      "blocking",
    ]);
    const generatedShapeChanged = Boolean(
      plan.framingPlanEvidence &&
      generatedMainKeys.has(key) &&
      ["description", "quantity", "unit"].includes(field),
    );
    setPlan({
      ...plan,
      framingPlanEvidence: generatedShapeChanged
        ? null
        : plan.framingPlanEvidence,
      buildPlanConfirmed: generatedShapeChanged
        ? false
        : plan.buildPlanConfirmed,
      additionalLines: plan.additionalLines.map((line) =>
        line.key === key
          ? {
              ...line,
              [field]: value,
              ...(field === "unitCost" || field === "sourceReference"
                ? { catalogMaterialId: null }
                : {}),
            }
          : line,
      ),
    });
    setPreview(null);
  }

  function updateScopeDecision(
    key: CompleteRebuildLineKey,
    value: DeckTakeoffPlan["scopeDecisions"][CompleteRebuildLineKey],
  ) {
    setPlan((current) => ({
      ...current,
      scopeDecisions: { ...current.scopeDecisions, [key]: value },
    }));
    setPreview(null);
  }

  function updateHardwareSelection(
    key: string,
    field:
      "quantity" | "unitCost" | "sourceReference" | "verificationReference",
    value: string,
  ) {
    setPlan((current) => ({
      ...current,
      hardwareSelections: (current.hardwareSelections ?? []).map((item) =>
        item.key === key
          ? {
              ...item,
              [field]: value,
              ...(field === "unitCost" || field === "sourceReference"
                ? { catalogMaterialId: null }
                : {}),
            }
          : item,
      ),
    }));
    setPreview(null);
  }

  function usePrescriptivePlan(approvedPlan: DeckPrescriptivePlan) {
    if (!approvedPlan.quantities || !approvedPlan.reference) return;
    const attachmentIsLedger = approvedPlan.quantities.ledgerLinearFeet > 0;
    if (
      railingGeometry.attached !== null &&
      attachmentIsLedger !== railingGeometry.attached
    ) {
      setError(
        "The framing draft attachment does not match the approved blueprint. Correct the blueprint or framing draft before using it.",
      );
      return;
    }
    const stairsIncluded = approvedPlan.inputs.draft.stairsIncluded === "yes";
    if (
      approvedStairsPresent !== null &&
      stairsIncluded !== approvedStairsPresent
    ) {
      setError(
        "The framing draft stair choice does not match the approved blueprint. Correct the blueprint or framing draft before using it.",
      );
      return;
    }
    const railingsIncluded =
      approvedPlan.inputs.draft.railingsIncluded === "yes";
    if (
      railingGeometry.railingsPresent !== null &&
      railingsIncluded !== railingGeometry.railingsPresent
    ) {
      setError(
        "The framing draft railing choice does not match the approved field facts. Correct the field facts or framing draft before using it.",
      );
      return;
    }
    const quantities: Partial<
      Record<CompleteRebuildLineKey, { quantity: string; unit: string }>
    > = {
      ledger_attachment: {
        quantity: String(approvedPlan.quantities.ledgerLinearFeet),
        unit: "ln ft",
      },
      joists: { quantity: String(approvedPlan.quantities.joists), unit: "ea" },
      beams: {
        quantity: String(approvedPlan.quantities.beamLinearFeet),
        unit: "ln ft",
      },
      posts: { quantity: String(approvedPlan.quantities.posts), unit: "ea" },
      footings: {
        quantity: String(
          approvedPlan.quantities.footings +
            approvedPlan.quantities.stairLandingFootings,
        ),
        unit: "ea",
      },
      blocking: {
        quantity: String(approvedPlan.quantities.blockingPieces),
        unit: "ea",
      },
    };
    setPlan((current) => ({
      ...current,
      buildPlanReference: approvedPlan.reference!,
      buildPlanConfirmed: false,
      framingPlanEvidence: approvedPlan,
      hardwareSelections: approvedPlan.hardwareSchedule.map((item) => ({
        key: item.key,
        description: item.specification,
        quantity: item.quantity > 0 ? String(item.quantity) : "",
        unit: item.unit,
        unitCost: "",
        catalogMaterialId: null,
        sourceReference: "",
        verificationReference: "",
      })),
      scopeDecisions: {
        ...current.scopeDecisions,
        ledger_attachment: attachmentIsLedger ? "include" : "not_in_scope",
        joists: "include",
        beams: "include",
        posts: "include",
        footings: "include",
        blocking: "include",
        structural_connectors: "",
        stairs: stairsIncluded ? "" : "not_in_scope",
      },
      additionalLines: current.additionalLines.map((line) => {
        const next = quantities[line.key as CompleteRebuildLineKey];
        const bom = approvedPlan.bom.filter(
          (item) =>
            item.key === line.key ||
            (line.key === "ledger_attachment" && item.key === "ledger") ||
            (line.key === "beams" && item.key === "beam_plies") ||
            (line.key === "footings" && item.key === "footing_concrete") ||
            (line.key === "blocking" &&
              ["rim_long", "extra_blocking"].includes(item.key)),
        );
        if (line.key === "structural_connectors")
          return {
            ...line,
            description: `Price compatible hardware: ${approvedPlan.hardwareSchedule.map((item) => `${item.key} ${item.quantity}`).join(", ")}`,
            quantity: "",
            unit: "",
            unitCost: "",
            catalogMaterialId: null,
            sourceReference: "",
          };
        return next
          ? {
              ...line,
              ...next,
              ...(bom.length
                ? {
                    description: bom.map((item) => item.description).join("; "),
                    quantity: String(
                      bom.reduce((sum, item) => sum + item.quantity, 0),
                    ),
                    unit: bom[0].unit,
                  }
                : {}),
            }
          : line;
      }),
    }));
    setPreview(null);
    setError("");
    if (approvedPlan.unresolvedPackages.length) {
      setNotice(
        `Main framing is saved, but the structural step is not finished. Complete: ${approvedPlan.unresolvedPackages.join(", ").replaceAll("_", " ")}.`,
      );
      return;
    }
    setNotice("The complete structural plan is approved. Continue to takeoff and pricing.");
    onStructureReady("approved_plan");
  }

  async function findLowesProducts(
    overrides?: Partial<{
      deckingFamily: DeckingFamily;
      compositeColor: CompositeColor;
      railingFamily: RailingFamily;
    }>,
  ) {
    const requestSequence = productRequestSequence.current + 1;
    productRequestSequence.current = requestSequence;
    const requestedDecking = overrides?.deckingFamily ?? deckingFamily;
    const requestedColor = overrides?.compositeColor ?? compositeColor;
    const requestedRailing = overrides?.railingFamily ?? railingFamily;
    setFindingProducts(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/estimates/${encodeURIComponent(estimateId)}/deck-product-suggestions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            visitId,
            expectedVisitRevision: visitRevision,
            boardRunDirection: plan.boardRunDirection,
            deckingFamily: requestedDecking,
            compositeColor:
              requestedDecking === "composite" ? requestedColor : null,
            railingFamily:
              railingGeometry.railingsPresent === false
                ? "none"
                : requestedRailing,
          }),
        },
      );
      const body = (await response.json()) as {
        success?: boolean;
        products?: LowesSuggestion[];
        error?: string;
        pricingNotice?: string;
        liveLookupStatus?: "not_needed" | "completed" | "unavailable";
        missingKinds?: LowesSuggestion["kind"][];
        unpricedKinds?: LowesSuggestion["kind"][];
      };
      if (!response.ok || !body.success || !body.products?.length)
        throw new Error(body.error || "Lowe's defaults could not be found.");
      if (productRequestSequence.current !== requestSequence) return;
      setSuggestions(body.products);
      const board = body.products.find((item) =>
        requestedDecking === "composite"
          ? item.kind === "deck_board_grooved"
          : item.kind === "deck_board",
      );
      const squareEdgeBoard =
        requestedDecking === "composite"
          ? body.products.find(
              (item) => item.kind === "deck_board_square_edge",
            )
          : undefined;
      const screw = body.products.find((item) => item.kind === "deck_fastener");
      const aluminumPackage =
        requestedRailing === "metal"
          ? buildDefaultAluminumRailingPackage({
              products: body.products,
              railingLengthFeet: finishRailingLengthFeet,
              stairsPresent: railingGeometry.stairsPresent,
              stairProjectionFeet:
                plan.shapeBinding?.stairPlacement?.projectionFeet ?? null,
              stairRailSides,
            })
          : null;
      const cablePackage =
        requestedRailing === "cable"
          ? buildDefaultCableRailingPackage({
              products: body.products,
              railingLengthFeet: finishRailingLengthFeet,
              stairsPresent: railingGeometry.stairsPresent,
              stairProjectionFeet:
                plan.shapeBinding?.stairPlacement?.projectionFeet ?? null,
              stairRailSides,
            })
          : null;
      const vinylPackage =
        requestedRailing === "vinyl"
          ? buildDefaultVinylRailingPackage({
              products: body.products,
              railingLengthFeet: finishRailingLengthFeet,
              stairsPresent: railingGeometry.stairsPresent,
              stairProjectionFeet:
                plan.shapeBinding?.stairPlacement?.projectionFeet ?? null,
              stairRailSides,
            })
          : null;
      const manufacturedPackage = aluminumPackage ?? vinylPackage ?? cablePackage;
      const railing = body.products.find((item) =>
        requestedRailing === "metal" || requestedRailing === "vinyl" || requestedRailing === "cable"
          ? item.kind === "railing_level_kit"
          : item.kind === "railing_section",
      );
      const railingDescription = manufacturedPackage
        ? `${manufacturedPackage.manufacturer} ${manufacturedPackage.productLine} ${manufacturedPackage.railHeightInches}-in ${requestedRailing} railing system: ${manufacturedPackage.lines.map((line) => `${line.quantity} ${line.label}`).join(", ")}. Included kit parts: ${[...new Set(manufacturedPackage.lines.flatMap((line) => line.includedComponents))].join(", ")}.`
        : railing?.description;
      const railingUnitCost = manufacturedPackage
        ? manufacturedPackage.totalCost
        : railing?.unitCost ?? null;
      const railingSource = manufacturedPackage
        ? manufacturedPackage.sourceReference || manufacturedPackage.installationReference
        : railing?.sourceUrl ?? "";
      setPlan((current) => {
        const boardPieces =
          board?.stockLengthFeet && customFinishGeometry
            ? estimateCustomDeckBoardPieces({
                areaSquareFeet: customFinishGeometry.areaSquareFeet,
                boardActualWidthInches: Number(current.boardActualWidthInches),
                boardGapInches: Number(current.boardGapInches),
                stockLengthFeet: board.stockLengthFeet,
                wastePercent: Number(current.boardWastePercent),
              })?.pieces ?? null
            : null;
        const customRailingQuantity = manufacturedPackage
          ? 1
          : requestedRailing === "wood"
            ? woodRailingFeet
          : railing?.stockLengthFeet && finishRailingLengthFeet
            ? Math.ceil(finishRailingLengthFeet / railing.stockLengthFeet)
            : finishRailingLengthFeet;
        const customFinishPrices = customApprovedFootprint
          ? current.additionalLines.map((line) => {
              if (line.key === "custom_decking" && board) {
                return {
                  ...line,
                  description: board.description,
                  quantity: boardPieces ? String(boardPieces) : "",
                  unit: "ea",
                  unitCost: board.unitCost ? String(board.unitCost) : "",
                  sourceReference: board.sourceUrl,
                  catalogMaterialId: null,
                };
              }
              if (
                line.key === "custom_decking_square_edge" &&
                squareEdgeBoard
              ) {
                return {
                  ...line,
                  description: squareEdgeBoard.description,
                  quantity: customSquareEdgeEstimate
                    ? String(customSquareEdgeEstimate.pieces)
                    : "",
                  unit: "ea",
                  unitCost: squareEdgeBoard.unitCost
                    ? String(squareEdgeBoard.unitCost)
                    : "",
                  sourceReference: squareEdgeBoard.sourceUrl,
                  catalogMaterialId: null,
                };
              }
              if (line.key === "custom_railing" && requestedRailing === "wood") {
                const rate = Number(woodRailingRate);
                return {
                  ...line,
                  description: "Wood railing material allowance",
                  quantity: woodRailingFeet.toFixed(2),
                  unit: "ln ft",
                  unitCost:
                    Number.isFinite(rate) && rate > 0
                      ? woodRailingRate
                      : "",
                  sourceReference:
                    Number.isFinite(rate) && rate > 0
                      ? "McKenzie wood railing per-linear-foot estimating allowance"
                      : "",
                  catalogMaterialId: null,
                };
              }
              if (line.key === "custom_railing" && railing) {
                return {
                  ...line,
                  description: railingDescription ?? railing.description,
                  quantity: customRailingQuantity
                    ? String(customRailingQuantity)
                    : "",
                  unit: manufacturedPackage
                    ? "system"
                    : railing.stockLengthFeet
                      ? "ea"
                      : "ln ft",
                  unitCost: railingUnitCost ? String(railingUnitCost) : "",
                  sourceReference: railingSource,
                  catalogMaterialId: null,
                };
              }
              return line;
            })
          : current.additionalLines;
        return {
          ...current,
          additionalLines: customFinishPrices,
          ...(board
            ? {
                boardCatalogMaterialId: null,
                boardStockLengthFeet: board.stockLengthFeet
                  ? String(board.stockLengthFeet)
                  : current.boardStockLengthFeet,
                boardUnitCost: board.unitCost ? String(board.unitCost) : "",
                boardSourceReference: board.sourceUrl,
              }
            : {}),
          ...(screw
            ? {
                screwCatalogMaterialId: null,
                screwCoverageSquareFeetPerPack: screw.coverageSquareFeetPerPack
                  ? String(screw.coverageSquareFeetPerPack)
                  : current.screwCoverageSquareFeetPerPack,
                screwPackUnitCost: screw.unitCost ? String(screw.unitCost) : "",
                screwSourceReference: screw.sourceUrl,
              }
            : {}),
          ...(railing
            ? {
                railingCatalogMaterialId: null,
                railingSectionLengthFeet: manufacturedPackage && finishRailingLengthFeet
                  ? String(finishRailingLengthFeet)
                  : railing.stockLengthFeet
                    ? String(railing.stockLengthFeet)
                    : current.railingSectionLengthFeet,
                railingUnitCost: railingUnitCost ? String(railingUnitCost) : "",
                railingSourceReference: railingSource,
              }
            : {}),
        };
      });
      setPreview(null);
      const missingPrices = [
        board && !board.unitCost ? "deck-board" : null,
        squareEdgeBoard && !squareEdgeBoard.unitCost
          ? "square-edge board"
          : null,
        railingGeometry.railingsPresent && railing && !railingUnitCost
          ? "railing"
          : null,
      ].filter(Boolean);
      const priceNotice = body.pricingNotice ? ` ${body.pricingNotice}` : "";
      const partialNotice = body.missingKinds?.length
        ? ` Live lookup could not fill: ${body.missingKinds.join(", ").replaceAll("_", " ")}. The saved products above remain usable and can be completed manually.`
        : body.unpricedKinds?.length && body.liveLookupStatus === "unavailable"
          ? ` Live pricing was unavailable for: ${body.unpricedKinds.join(", ").replaceAll("_", " ")}. Their saved product pages remain attached for manual estimating prices.`
        : body.liveLookupStatus === "unavailable"
          ? " Live price refresh was unavailable, so the saved product package was kept."
          : "";
      setNotice(
        missingPrices.length
          ? `Saved products loaded. Enter an estimating Lowe's ${missingPrices.join(" and ")} price${missingPrices.length === 1 ? "" : "s"} from the linked product page, then continue.${partialNotice}${priceNotice}`
          : customApprovedFootprint
            ? `Matching ${requestedDecking}${requestedDecking === "composite" ? ` ${requestedColor}` : ""} decking and ${requestedRailing} railing products are filled in. The approved polygon now calculates the finish quantities automatically.${manufacturedPackage?.unresolved.length ? ` The ${manufacturedPackage.manufacturer} ${manufacturedPackage.productLine} package still needs prices for: ${manufacturedPackage.unresolved.map((line) => line.label).join(", ")}.` : ""}${partialNotice}${priceNotice}`
            : `Matching ${requestedDecking}${requestedDecking === "composite" ? ` ${requestedColor}` : ""} decking and ${requestedRailing} railing products are ready. Review the calculated finish quantities next.${manufacturedPackage?.unresolved.length ? ` The ${manufacturedPackage.manufacturer} ${manufacturedPackage.productLine} package still needs prices for: ${manufacturedPackage.unresolved.map((line) => line.label).join(", ")}.` : ""}${partialNotice}${priceNotice}`,
      );
    } catch (caught) {
      if (productRequestSequence.current !== requestSequence) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "Lowe's defaults could not be found.",
      );
    } finally {
      if (productRequestSequence.current === requestSequence)
        setFindingProducts(false);
    }
  }

  function updateManufacturedRailingComponentPrice(
    role: DeckRailingProductRole,
    value: string,
  ) {
    const parsed = Number(value);
    const unitCost = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    const packageBuilder = railingFamily === "cable"
      ? buildDefaultCableRailingPackage
      : railingFamily === "vinyl"
        ? buildDefaultVinylRailingPackage
        : buildDefaultAluminumRailingPackage;
    const currentPackage = packageBuilder({
      products: suggestions,
      railingLengthFeet: finishRailingLengthFeet,
      stairsPresent: railingGeometry.stairsPresent,
      stairProjectionFeet:
        plan.shapeBinding?.stairPlacement?.projectionFeet ?? null,
      stairRailSides,
    });
    const fallbackProduct = currentPackage.lines.find(
      (line) => line.role === role,
    )?.product;
    if (!fallbackProduct) return;
    const found = suggestions.some((product) => product.kind === role);
    const updatedSuggestions: LowesSuggestion[] = found
      ? suggestions.map((product) =>
          product.kind === role
            ? {
                ...product,
                unitCost,
                priceBasis: unitCost ? "catalog_estimate" : "unpriced",
              }
            : product,
        )
      : [
          ...suggestions,
          {
            ...fallbackProduct,
            kind: role,
            unitCost,
            coverageSquareFeetPerPack: null,
            reason: `Default ${currentPackage.manufacturer} ${currentPackage.productLine} system component`,
            catalogMaterialId: null,
            priceBasis: unitCost ? "catalog_estimate" : "unpriced",
            priceCheckedAt: null,
          },
        ];
    setSuggestions(updatedSuggestions);
    const nextPackage = packageBuilder({
      products: updatedSuggestions,
      railingLengthFeet: finishRailingLengthFeet,
      stairsPresent: railingGeometry.stairsPresent,
      stairProjectionFeet:
        plan.shapeBinding?.stairPlacement?.projectionFeet ?? null,
      stairRailSides,
    });
    const description = `${nextPackage.manufacturer} ${nextPackage.productLine} ${nextPackage.railHeightInches}-in ${railingFamily} railing system: ${nextPackage.lines.map((line) => `${line.quantity} ${line.label}`).join(", ")}. Included kit parts: ${[...new Set(nextPackage.lines.flatMap((line) => line.includedComponents))].join(", ")}.`;
    const source =
      nextPackage.sourceReference || nextPackage.installationReference;
    setPlan((current) => ({
      ...current,
      railingCatalogMaterialId: null,
      railingSectionLengthFeet: finishRailingLengthFeet
        ? String(finishRailingLengthFeet)
        : current.railingSectionLengthFeet,
      railingUnitCost: nextPackage.totalCost
        ? String(nextPackage.totalCost)
        : "",
      railingSourceReference: source,
      additionalLines: customApprovedFootprint
        ? current.additionalLines.map((line) =>
            line.key === "custom_railing"
              ? {
                  ...line,
                  description,
                  quantity: "1",
                  unit: "system",
                  unitCost: nextPackage.totalCost
                    ? String(nextPackage.totalCost)
                    : "",
                  sourceReference: source,
                  catalogMaterialId: null,
                }
              : line,
          )
        : current.additionalLines,
    }));
    setPreview(null);
  }

  async function requestPreview() {
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/estimates/${encodeURIComponent(estimateId)}/deck-takeoff`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            visitId,
            expectedVisitRevision: visitRevision,
            plan,
          }),
        },
      );
      const body = (await response.json()) as DeckTakeoffPreview & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error || "Draft takeoff could not be calculated.");
      setPreview(body);
      setChecks({ dimensions: false, quantities: false, prices: false });
      if (body.status === "ready")
        setNotice("Draft takeoff is ready for your review.");
      else if (body.lines.length)
        setNotice(
          "Known costs are calculated below. They stay in the draft until the remaining required takeoff inputs are completed.",
        );
      else
        setNotice(
          "No priced lines are ready yet. Add a product price, quantity, and source to calculate costs.",
        );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Draft takeoff could not be calculated.",
      );
    } finally {
      setPending(false);
    }
  }

  async function saveWorkingFinishSelection() {
    if (!customApprovedFootprint || !savedCustomPlan) return;
    const numberOrNull = (value: string) => {
      if (!value.trim()) return null;
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0)
        throw new TypeError("Enter a valid nonnegative number before saving.");
      return parsed;
    };
    setPending(true);
    setError("");
    setNotice("");
    try {
      const selection = parseDeckFinishDraftSnapshot({
        version: DECK_FINISH_DRAFT_VERSION,
        deckingFamily,
        compositeColor: deckingFamily === "composite" ? compositeColor : null,
        railingFamily,
        stairRailSides,
        woodRailingRate: numberOrNull(woodRailingRate),
        board: {
          actualWidthInches: Number(plan.boardActualWidthInches),
          gapInches: Number(plan.boardGapInches),
          stockLengthFeet: numberOrNull(plan.boardStockLengthFeet),
          wastePercent: Number(plan.boardWastePercent),
        },
        lines: plan.additionalLines
          .filter(
            (line) =>
              line.key === "custom_decking" ||
              line.key === "custom_decking_square_edge" ||
              line.key === "custom_railing",
          )
          .map((line) => ({
            key: line.key,
            description: line.description,
            quantity: numberOrNull(line.quantity),
            unit: line.unit,
            unitCost: numberOrNull(line.unitCost),
            sourceReference: line.sourceReference,
            catalogMaterialId: line.catalogMaterialId,
          })),
      });
      if (!finishDraftSaveKey.current)
        finishDraftSaveKey.current = crypto.randomUUID();
      const response = await fetch(
        `/api/guided-site-visits/${encodeURIComponent(visitId)}/deck-finish-selection`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedSelectionRevision: finishDraftRevision,
            idempotencyKey: finishDraftSaveKey.current,
            shapeRevisionId: savedCustomPlan.shapeRevisionId,
            shapeRevision: savedCustomPlan.shapeRevision,
            shapeDigest: savedCustomPlan.shapeDigest,
            structuralPlanRevisionId: savedCustomPlan.id,
            selection,
          }),
        },
      );
      const body = (await response.json()) as {
        success?: boolean;
        error?: string;
        id?: string;
        selectionRevision?: number;
      };
      if (!response.ok || !body.success || !body.id || !body.selectionRevision)
        throw new Error(
          body.error || "The working finish selections could not be saved.",
        );
      setFinishDraftRevision(body.selectionRevision);
      finishDraftSaveKey.current = "";
      setNotice(
        "Working finish selections and estimating costs saved. They will return after refresh; they are not customer-ready estimate lines yet.",
      );
      return { id: body.id, selectionRevision: body.selectionRevision };
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The working finish selections could not be saved.",
      );
    } finally {
      setPending(false);
    }
  }

  async function addFinishMaterialsToEstimate() {
    setError("");
    setNotice("");
    try {
      const saved = await saveWorkingFinishSelection();
      if (!saved)
        throw new Error("Save the current Deck shape and finish selections first.");
      setPending(true);
      const previewResponse = await fetch(
        `/api/estimates/${encodeURIComponent(estimateId)}/deck-finish-materials`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            visitId,
            finishSelectionRevisionId: saved.id,
            expectedFinishSelectionRevision: saved.selectionRevision,
          }),
        },
      );
      const finishPreview = (await previewResponse.json()) as {
        success?: boolean;
        error?: string;
        version?: string;
        previewBinding?: string;
        materialSubtotal?: number;
      };
      if (
        !previewResponse.ok ||
        !finishPreview.success ||
        !finishPreview.version ||
        !finishPreview.previewBinding
      )
        throw new Error(
          finishPreview.error || "The finish-material subtotal could not be prepared.",
        );
      if (!finishApplicationId.current)
        finishApplicationId.current = crypto.randomUUID();
      if (!finishApplicationKey.current)
        finishApplicationKey.current = crypto.randomUUID();
      const applyResponse = await fetch(
        `/api/estimates/${encodeURIComponent(estimateId)}/deck-finish-materials`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            visitId,
            finishSelectionRevisionId: saved.id,
            expectedFinishSelectionRevision: saved.selectionRevision,
            expectedCalculationRevision: calculationRevision,
            applicationId: finishApplicationId.current,
            idempotencyKey: finishApplicationKey.current,
            applicationVersion: finishPreview.version,
            previewBinding: finishPreview.previewBinding,
          }),
        },
      );
      const body = (await applyResponse.json()) as EstimateBuilderEnvelope & {
        success?: boolean;
        error?: string;
        materialSubtotal?: number;
      };
      if (!applyResponse.ok || !body.success)
        throw new Error(body.error || "Finish-material costs could not be added.");
      finishApplicationId.current = "";
      finishApplicationKey.current = "";
      onApplied(body);
      setNotice(
        `$${Number(body.materialSubtotal ?? finishPreview.materialSubtotal ?? 0).toFixed(2)} of reviewed finish materials was added to the estimate. Framing, hardware, labor, and margin remain separate.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Finish-material costs could not be added.",
      );
    } finally {
      setPending(false);
    }
  }

  async function applyTakeoff() {
    if (
      !preview ||
      preview.status !== "ready" ||
      !checks.dimensions ||
      !checks.quantities ||
      !checks.prices
    )
      return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/estimates/${encodeURIComponent(estimateId)}/deck-takeoff`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            visitId,
            expectedVisitRevision: visitRevision,
            expectedCalculationRevision: calculationRevision,
            applicationId: crypto.randomUUID(),
            idempotencyKey: crypto.randomUUID(),
            applicationVersion: preview.version,
            previewBinding: preview.previewBinding,
            plan,
          }),
        },
      );
      const body = (await response.json()) as EstimateBuilderEnvelope & {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || !body.success)
        throw new Error(body.error || "Reviewed takeoff could not be added.");
      onApplied(body);
      setNotice(
        "Reviewed takeoff added as true-cost estimate lines. Continue to OH&P below.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Reviewed takeoff could not be added.",
      );
    } finally {
      setPending(false);
    }
  }

  const catalogOptions = (lineKey: string) =>
    catalog.filter((material) => {
      const text = material.description.toLowerCase();
      if (lineKey === "board")
        return (
          text.includes("deck") &&
          (text.includes("board") || text.includes("lumber"))
        );
      if (lineKey === "screw")
        return text.includes("screw") || text.includes("fastener");
      if (lineKey === "concrete") return text.includes("concrete");
      if (lineKey === "railing") return text.includes("rail");
      if (lineKey === "joists" || lineKey === "posts")
        return text.includes("lumber");
      return [];
    });
  const selectedBoard = catalogById.get(plan.boardCatalogMaterialId ?? "");
  const selectedScrew = catalogById.get(plan.screwCatalogMaterialId ?? "");
  const selectedRailing = catalogById.get(plan.railingCatalogMaterialId ?? "");
  const suggestionByKind = new Map(
    suggestions.map((item) => [item.kind, item]),
  );
  const aluminumRailingPackage =
    railingFamily === "metal"
      ? buildDefaultAluminumRailingPackage({
          products: suggestions,
          railingLengthFeet: finishRailingLengthFeet,
          stairsPresent: railingGeometry.stairsPresent,
          stairProjectionFeet:
            plan.shapeBinding?.stairPlacement?.projectionFeet ?? null,
          stairRailSides,
        })
      : null;
  const cableRailingPackage =
    railingFamily === "cable"
      ? buildDefaultCableRailingPackage({
          products: suggestions,
          railingLengthFeet: finishRailingLengthFeet,
          stairsPresent: railingGeometry.stairsPresent,
          stairProjectionFeet:
            plan.shapeBinding?.stairPlacement?.projectionFeet ?? null,
          stairRailSides,
        })
      : null;
  const vinylRailingPackage =
    railingFamily === "vinyl"
      ? buildDefaultVinylRailingPackage({
          products: suggestions,
          railingLengthFeet: finishRailingLengthFeet,
          stairsPresent: railingGeometry.stairsPresent,
          stairProjectionFeet:
            plan.shapeBinding?.stairPlacement?.projectionFeet ?? null,
          stairRailSides,
        })
      : null;
  const manufacturedRailingPackage = aluminumRailingPackage ?? vinylRailingPackage ?? cableRailingPackage;
  function applyWoodRailingRate(value: string, sides = stairRailSides) {
    setWoodRailingRate(value);
    const rate = Number(value);
    const totalFeet = Math.max(
      0,
      (finishRailingLengthFeet ?? 0) +
        (railingGeometry.stairsPresent && stairProjectionFeet
          ? stairProjectionFeet * sides
          : 0),
    );
    const totalCost = Number.isFinite(rate) && rate > 0 ? rate * totalFeet : 0;
    setPlan((current) => ({
      ...current,
      railingCatalogMaterialId: null,
      // The rectangular preview represents this as one reviewed railing
      // allowance; the UI retains and displays the exact per-foot math.
      railingSectionLengthFeet:
        finishRailingLengthFeet && finishRailingLengthFeet > 0
          ? String(finishRailingLengthFeet)
          : "1",
      railingUnitCost: totalCost > 0 ? totalCost.toFixed(2) : "",
      railingSourceReference:
        totalCost > 0
          ? `McKenzie wood railing allowance: ${totalFeet.toFixed(2)} ln ft at $${rate.toFixed(2)}/ln ft`
          : "",
      additionalLines: customApprovedFootprint
        ? current.additionalLines.map((line) =>
            line.key === "custom_railing"
              ? {
                  ...line,
                  description: "Wood railing material allowance",
                  quantity: totalFeet.toFixed(2),
                  unit: "ln ft",
                  unitCost: value,
                  sourceReference:
                    totalCost > 0
                      ? "McKenzie wood railing per-linear-foot estimating allowance"
                      : "",
                }
              : line,
          )
        : current.additionalLines,
    }));
    setPreview(null);
  }
  const recommendedProducts = [
    {
      key: "board",
      label: "Deck boards",
      priceLabel: "Estimating retail price per board",
      description:
        selectedBoard?.description ??
        suggestionByKind.get(
          deckingFamily === "composite"
            ? "deck_board_grooved"
            : "deck_board",
        )?.description ??
        "No Lowe's product found yet",
      cost: plan.boardUnitCost,
      source: plan.boardSourceReference,
      setCost: (value: string) =>
        setPlan((current) => ({
          ...current,
          boardCatalogMaterialId: null,
          boardUnitCost: value,
        })),
    },
    {
      key: "screw",
      label: "Fasteners",
      priceLabel: "Estimating retail price per box",
      description:
        selectedScrew?.description ??
        suggestionByKind.get("deck_fastener")?.description ??
        "No Lowe's product found yet",
      cost: plan.screwPackUnitCost,
      source: plan.screwSourceReference,
      setCost: (value: string) =>
        setPlan((current) => ({
          ...current,
          screwCatalogMaterialId: null,
          screwPackUnitCost: value,
        })),
    },
    {
      key: "railing",
      label: "Railing",
      priceLabel: "Estimating retail price per railing section",
      description:
        manufacturedRailingPackage?.lines.length
          ? `${manufacturedRailingPackage.manufacturer} ${manufacturedRailingPackage.productLine} complete component package`
          : railingFamily === "wood"
            ? `Wood railing allowance · ${woodRailingFeet.toFixed(1)} linear ft`
          : selectedRailing?.description ??
            suggestionByKind.get("railing_section")?.description ??
        "No Lowe's product found yet",
      cost: plan.railingUnitCost,
      source: plan.railingSourceReference,
      setCost: (value: string) =>
        setPlan((current) => ({
          ...current,
          railingCatalogMaterialId: null,
          railingUnitCost: value,
        })),
    },
  ] as const;
  const missingRequiredPrices = [
    plan.boardSourceReference && !(Number(plan.boardUnitCost) > 0)
      ? "deck-board price"
      : null,
    railingGeometry.railingsPresent &&
    plan.railingSourceReference &&
    !(Number(plan.railingUnitCost) > 0)
      ? "railing price"
      : null,
  ].filter((value): value is string => Boolean(value));
  const boardSuggestions = suggestions.filter(
    (item) =>
      item.kind === "deck_board" || item.kind === "deck_board_grooved",
  );
  const railingSuggestions = suggestions.filter(
    (item) => item.kind === "railing_section",
  );
  const productCombinations = boardSuggestions
    .flatMap((board) =>
      (railingGeometry.railingsPresent ? railingSuggestions : [null]).map(
        (railing) => {
          const optionPlan: DeckTakeoffPlan = {
            ...plan,
            boardCatalogMaterialId: null,
            boardStockLengthFeet: board.stockLengthFeet
              ? String(board.stockLengthFeet)
              : plan.boardStockLengthFeet,
            boardUnitCost: board.unitCost ? String(board.unitCost) : "",
            boardSourceReference: board.sourceUrl,
            ...(railing
              ? {
                  railingCatalogMaterialId: null,
                  railingSectionLengthFeet: railing.stockLengthFeet
                    ? String(railing.stockLengthFeet)
                    : plan.railingSectionLengthFeet,
                  railingUnitCost: railing.unitCost
                    ? String(railing.unitCost)
                    : "",
                  railingSourceReference: railing.sourceUrl,
                }
              : {}),
          };
          const optionPreview = buildDeckTakeoffPreview({
            items: visitItems,
            plan: optionPlan,
            catalog: new Map(),
          });
          const materialSubtotal = optionPreview.lines
            .filter((line) => line.category === "material")
            .reduce(
              (total, line) =>
                total + Number(line.quantity) * Number(line.unitCost),
              0,
            );
          return {
            board,
            railing,
            optionPlan,
            optionPreview,
            materialSubtotal,
          };
        },
      ),
    )
    .filter((option) =>
      option.optionPreview.lines.some((line) => line.key === "decking"),
    );

  function clearFinishProducts() {
    setSuggestions([]);
    setPlan((current) => ({
      ...current,
      boardCatalogMaterialId: null,
      boardStockLengthFeet: "",
      boardUnitCost: "",
      boardSourceReference: "",
      screwCatalogMaterialId: null,
      screwCoverageSquareFeetPerPack: "",
      screwPackUnitCost: "",
      screwSourceReference: "",
      railingCatalogMaterialId: null,
      railingSectionLengthFeet: "",
      railingUnitCost: "",
      railingSourceReference: "",
      additionalLines: current.additionalLines.map((line) =>
        line.key === "custom_decking" ||
        line.key === "custom_decking_square_edge" ||
        line.key === "custom_railing"
          ? {
              ...line,
              description:
                line.key === "custom_decking"
                  ? "Decking for the approved custom footprint"
                  : line.key === "custom_decking_square_edge"
                    ? "Square-edge picture-frame and divider boards"
                    : "Railing for the approved custom footprint",
              unitCost: "",
              sourceReference: "",
              catalogMaterialId: null,
            }
          : line,
      ),
    }));
    setPreview(null);
  }

  const finishSelectionControls = (
    <section className="mt-5 rounded-xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs font-black uppercase tracking-[.16em] text-blue-800">
        Finish selections
      </p>
      <h4 className="mt-1 text-xl font-black text-slate-950">
        Choose what the customer will see
      </h4>
      <p className="mt-1 text-sm leading-6 text-slate-700">
        Framing quantities stay unchanged. These choices select the decking,
        railing, compatible fasteners, and retail estimating prices used for
        the customer options. No Pro discount is assumed; the complete takeoff
        can be repriced by the Pro desk before purchasing.
      </p>

      <fieldset className="mt-4">
        <legend className="text-sm font-black text-slate-950">Decking</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(
            [
              ["wood", "Wood decking", "Pressure-treated deck boards"],
              ["composite", "Composite decking", "Choose a color family next"],
            ] as const
          ).map(([value, label, help]) => (
            <label
              key={value}
              className={`flex min-h-20 cursor-pointer items-start gap-3 rounded-lg border p-3 transition focus-within:ring-2 focus-within:ring-blue-700 ${deckingFamily === value ? "border-blue-700 bg-blue-50 ring-1 ring-blue-200" : "border-slate-300 bg-slate-50 hover:bg-slate-100"}`}
            >
              <input
                type="radio"
                name="decking-family"
                className="mt-1"
                checked={deckingFamily === value}
                onChange={() => {
                  setDeckingFamily(value);
                  clearFinishProducts();
                  void findLowesProducts({ deckingFamily: value });
                }}
              />
              <span>
                <strong className="block text-sm text-slate-950">{label}</strong>
                <span className="mt-1 block text-xs leading-5 text-slate-600">{help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {deckingFamily === "composite" ? (
        <fieldset className="mt-4">
          <legend className="text-sm font-black text-slate-950">
            Composite color family
          </legend>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {COMPOSITE_COLORS.map((color) => (
              <label
                key={color.key}
                className={`cursor-pointer rounded-lg border p-2 text-center transition focus-within:ring-2 focus-within:ring-blue-700 ${compositeColor === color.key ? "border-blue-700 bg-blue-50 ring-1 ring-blue-200" : "border-slate-300 bg-slate-50 hover:bg-slate-100"}`}
              >
                <input
                  type="radio"
                  name="composite-color"
                  className="sr-only"
                  checked={compositeColor === color.key}
                  onChange={() => {
                    setCompositeColor(color.key);
                    clearFinishProducts();
                    void findLowesProducts({
                      deckingFamily: "composite",
                      compositeColor: color.key,
                    });
                  }}
                />
                <span
                  aria-hidden="true"
                  className="mx-auto block h-10 w-10 rounded-md border border-slate-400 shadow-inner"
                  style={{ backgroundColor: color.swatch }}
                />
                <span className="mt-1 block text-xs font-bold text-slate-950">
                  {color.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {railingGeometry.railingsPresent === false ? (
        <p className="mt-4 rounded-lg bg-slate-100 p-3 text-sm font-bold text-slate-800">
          No railing was included in the approved field facts, so no railing
          product is being selected.
        </p>
      ) : (
        <fieldset className="mt-4">
          <legend className="text-sm font-black text-slate-950">Railing</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                ["wood", "Wood", "▥"],
                ["metal", "Aluminum", "▦"],
                ["vinyl", "Vinyl", "▤"],
                ["cable", "Cable", "≡"],
              ] as const
            ).map(([value, label, icon]) => (
              <label
                key={value}
                className={`cursor-pointer rounded-lg border p-3 text-center transition focus-within:ring-2 focus-within:ring-blue-700 ${railingFamily === value ? "border-blue-700 bg-blue-50 ring-1 ring-blue-200" : "border-slate-300 bg-slate-50 hover:bg-slate-100"}`}
              >
                <input
                  type="radio"
                  name="railing-family"
                  className="sr-only"
                  checked={railingFamily === value}
                  onChange={() => {
                    setRailingFamily(value);
                    clearFinishProducts();
                    void findLowesProducts({ railingFamily: value });
                  }}
                />
                <span aria-hidden="true" className="block text-3xl leading-none text-slate-700">
                  {icon}
                </span>
                <span className="mt-2 block text-sm font-bold text-slate-950">{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {railingGeometry.stairsPresent ? (
        <fieldset className="mt-4 rounded-lg border border-slate-300 bg-slate-50 p-3">
          <legend className="px-1 text-sm font-black text-slate-950">Stair railing coverage</legend>
          <p className="mb-2 text-xs leading-5 text-slate-600">
            Saved stair run: {stairProjectionFeet?.toFixed(1) ?? "unknown"} ft. A stair rail kit is one rail for one side.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {([[1, "One side"], [2, "Both sides"]] as const).map(([sides, label]) => (
              <label key={sides} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-bold transition focus-within:ring-2 focus-within:ring-blue-700 ${stairRailSides === sides ? "border-blue-700 bg-blue-50 text-slate-950" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}>
                <input
                  type="radio"
                  name="stair-rail-sides"
                  checked={stairRailSides === sides}
                  onChange={() => {
                    setStairRailSides(sides);
                    if (railingFamily === "wood") applyWoodRailingRate(woodRailingRate, sides);
                    else clearFinishProducts();
                  }}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {railingFamily === "wood" && railingGeometry.railingsPresent !== false ? (
        <section className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-slate-950">
          <p className="text-xs font-black uppercase tracking-[.14em] text-emerald-800">Wood railing allowance</p>
          <p className="mt-1 text-sm leading-6 text-slate-700">
            {woodRailingFeet.toFixed(1)} total linear ft = {(finishRailingLengthFeet ?? 0).toFixed(1)} ft level rail{railingGeometry.stairsPresent && stairProjectionFeet ? ` + ${stairProjectionFeet.toFixed(1)} ft × ${stairRailSides} stair side${stairRailSides === 1 ? "" : "s"}` : ""}.
          </p>
          <label className="mt-3 block text-sm font-bold text-slate-950">
            Estimating material cost per linear foot
            <span className="mt-1 flex min-h-11 items-center rounded-md border border-slate-500 bg-white px-3 text-slate-950 focus-within:ring-2 focus-within:ring-emerald-300">
              <span aria-hidden="true" className="mr-1">$</span>
              <input
                className="w-full bg-transparent py-2 text-sm font-bold outline-none"
                inputMode="decimal"
                value={woodRailingRate}
                onChange={(event) => applyWoodRailingRate(event.target.value)}
                aria-label="Wood railing estimating material cost per linear foot"
              />
            </span>
          </label>
        </section>
      ) : null}

      {manufacturedRailingPackage ? (
        <section className="mt-4 rounded-lg border border-slate-300 bg-slate-50 p-3 text-slate-950">
          <p className="text-xs font-black uppercase tracking-[.14em] text-blue-800">
            Default complete system
          </p>
          <h5 className="mt-1 text-base font-black">
            {manufacturedRailingPackage.manufacturer} {manufacturedRailingPackage.productLine} · {manufacturedRailingPackage.railHeightInches}-in · {manufacturedRailingPackage.finish}
          </h5>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Every line below stays in this manufacturer and product line. Parts already included in a kit are not counted twice.
          </p>
          <div className="mt-3 space-y-2">
            {manufacturedRailingPackage.lines.map((line) => (
              <article
                key={line.role}
                className="rounded-md border border-slate-300 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-950">
                      {line.quantity} × {line.label}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      Includes: {line.includedComponents.join(", ")}
                    </p>
                  </div>
                  <p className={`shrink-0 text-sm font-black ${line.product?.unitCost ? "text-emerald-300" : "text-amber-300"}`}>
                    {line.product?.unitCost
                      ? `$${(line.quantity * line.product.unitCost).toFixed(2)}`
                      : "Price needed"}
                  </p>
                </div>
                {line.product ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-end">
                    {line.product.sourceUrl ? (
                      <a
                        className="inline-flex min-h-11 items-center text-xs font-bold text-blue-700 underline"
                        href={line.product.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open matching Lowe&apos;s component
                      </a>
                    ) : (
                      <p className="py-2 text-xs font-bold text-amber-900">
                        Draft company default — select the exact compatible product line in Materials.
                      </p>
                    )}
                    <label className="block text-xs font-bold text-slate-950">
                      Retail estimate each
                      <span className="mt-1 flex min-h-11 items-center rounded-md border border-slate-500 bg-white px-2 text-slate-950 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-300">
                        <span aria-hidden="true" className="mr-1">$</span>
                        <input
                          className="w-full bg-transparent py-2 text-sm font-bold outline-none"
                          inputMode="decimal"
                          aria-label={`${line.label} retail estimate each`}
                          value={line.product.unitCost ?? ""}
                          onChange={(event) =>
                            updateManufacturedRailingComponentPrice(
                              line.role,
                              event.target.value,
                            )
                          }
                        />
                      </span>
                    </label>
                  </div>
                ) : (
                  <p className="mt-2 text-xs font-bold text-amber-900">
                    Matching component not found yet; the system estimate remains incomplete.
                  </p>
                )}
              </article>
            ))}
          </div>
          <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-950">
            Post anchoring fasteners are not included with the post kits. They remain in the structural hardware schedule because the correct anchor depends on the deck framing and approved attachment detail.
          </p>
          {manufacturedRailingPackage.installationReference ? (
            <a
              className="mt-2 inline-block min-h-11 py-2 text-xs font-bold text-blue-700 underline"
              href={manufacturedRailingPackage.installationReference}
              target="_blank"
              rel="noreferrer"
            >
              Review manufacturer installation instructions
            </a>
          ) : null}
        </section>
      ) : null}

      <button
        type="button"
        className={`mt-5 w-full ${primary}`}
        disabled={disabled || findingProducts}
        onClick={() => void findLowesProducts()}
      >
        {findingProducts ? "Loading saved products and checking gaps…" : "Load products and estimating costs"}
      </button>
    </section>
  );

  const activeScopeIndex = COMPLETE_REBUILD_LINE_KEYS.indexOf(activeScopeKey);
  const activeScopeLine =
    plan.additionalLines.find((line) => line.key === activeScopeKey) ??
    plan.additionalLines[0];
  const activeScopeRequirement = completeRebuildScopeRequirement(
    activeScopeKey,
    visitItems,
  );
  const activeScopeIncluded =
    plan.scopeDecisions[activeScopeKey] === "include" ||
    (activeScopeRequirement === "required" && plan.completeRebuildConfirmed);
  const approvedHouseEdgeFeet =
    railingGeometry.attached === true
      ? (customFinishGeometry?.houseEdgeFeet ?? dimensions.lengthFeet)
      : null;
  const formattedFeet = (value: number) =>
    value.toFixed(2).replace(/\.0+$|(?<=\.[0-9]*?)0+$/g, "");
  const observedMeasurement = (...keys: string[]) =>
    blueprintVisitSeed.observedMeasurements
      .filter((item) => keys.includes(item.key))
      .filter((item) => {
        const numericParts = item.value.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
        return !numericParts?.length || numericParts.some((value) => value !== 0);
      })
      .map((item) =>
        `${item.key.replaceAll("_", " ")}: ${item.value} ${item.unit}`,
      );
  const scopeVisitEvidence = (key: CompleteRebuildLineKey) => {
    let facts: string[] = [];
    if (key === "ledger_attachment")
      facts = [
        railingGeometry.attached === true
          ? "Site visit recorded this deck as attached to the house."
          : railingGeometry.attached === false
            ? "Site visit recorded this deck as freestanding."
            : "House attachment was not resolved during the site visit.",
        ...(approvedHouseEdgeFeet && approvedHouseEdgeFeet > 0
          ? [
              `Approved replacement house edge: ${formattedFeet(approvedHouseEdgeFeet)} ft.`,
            ]
          : []),
        ...observedMeasurement("ledger_length"),
      ];
    else if (key === "joists")
      facts = observedMeasurement("joist_spacing", "joist_depth");
    else if (key === "beams") facts = observedMeasurement("beam_depth");
    else if (key === "posts")
      facts = observedMeasurement("post_dimensions", "support_spacing");
    else if (key === "footings")
      facts = observedMeasurement("exposed_footing_dimensions");
    else if (key === "stairs")
      facts = [
        approvedStairsPresent
          ? "The approved footprint includes stairs and their saved location."
          : "The approved footprint has no stairs.",
        ...observedMeasurement(
          "stair_width",
          "total_rise",
          "tread_depth",
          "representative_riser",
          "landing_dimensions",
        ),
      ];
    else if (key === "demolition_disposal" && plan.completeRebuildConfirmed)
      facts = [
        "Complete replacement means removal and disposal are part of the working scope.",
      ];
    return facts.length
      ? facts
      : [
          "The site visit did not establish this proposed quantity or cost. Add it from the reviewed framing plan, supplier quote, or company cost record.",
        ];
  };
  const prefillScopeLineFromSavedFacts = (line: FixedLine): FixedLine => {
    const facts = scopeVisitEvidence(line.key as CompleteRebuildLineKey).filter(
      (fact) => !fact.startsWith("The site visit did not establish"),
    );
    const existingReference = facts.length ? ` ${facts.join(" ")}` : "";
    const preserveDescription =
      line.description.trim() &&
      line.description !==
        INITIAL_LINES.find((candidate) => candidate.key === line.key)
          ?.description;
    const description = preserveDescription
      ? line.description
      : line.key === "ledger_attachment"
        ? approvedHouseEdgeFeet && approvedHouseEdgeFeet > 0
          ? `Replacement ledger run along the ${formattedFeet(approvedHouseEdgeFeet)} ft approved house edge. Final ledger size, attachment, flashing, and fastener schedule follow the reviewed structural detail.`
          : `Replacement ledger and house attachment.${existingReference} Final attachment and flashing follow the reviewed plan.`
        : line.key === "beams"
          ? `Replacement beam / support system.${existingReference} Final member size, plies, span, and bearing follow the reviewed plan.`
          : line.key === "posts"
            ? `Replacement posts / supports.${existingReference} Final count, locations, and connections follow the reviewed plan.`
            : line.key === "footings"
              ? `Replacement foundations / footings and concrete.${existingReference} Final count, dimensions, depth, and reinforcement follow the reviewed plan.`
              : line.key === "blocking"
                ? "Replacement blocking and bracing, including support required for picture framing, guards, and openings, per the reviewed plan."
                : line.key === "structural_connectors"
                  ? "Complete structural connector and fastener package matched to the reviewed framing plan and selected treated-lumber system."
                  : line.key === "stairs"
                    ? `Replacement stair assembly.${existingReference} Final stringers, landing, foundations, guards, and connections follow the reviewed plan.`
                    : line.key === "demolition_disposal"
                      ? "Remove the complete existing deck structure; haul and dispose of demolition debris."
                      : line.key === "labor"
                        ? "Labor to demolish and replace the complete deck, including framing, finishes, stairs, railing, and jobsite cleanup."
                        : line.description;

    if (
      line.key === "ledger_attachment" &&
      !line.quantity.trim() &&
      approvedHouseEdgeFeet &&
      approvedHouseEdgeFeet > 0
    ) {
      return {
        ...line,
        description,
        quantity: formattedFeet(approvedHouseEdgeFeet),
        unit: "ln ft",
      };
    }
    if (line.key === "demolition_disposal" && !line.quantity.trim()) {
      return { ...line, description, quantity: "1", unit: "job" };
    }
    return { ...line, description };
  };
  const openScopeCategory = (key: CompleteRebuildLineKey) => {
    setActiveScopeKey(key);
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        const editor = scopeEditorRef.current;
        if (!editor) return;
        editor
          .querySelector<HTMLElement>("select, input, button")
          ?.focus({ preventScroll: true });
        editor.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
          block: "start",
        });
      }),
    );
  };
  const scopeLineComplete = (key: CompleteRebuildLineKey) => {
    const requirement = completeRebuildScopeRequirement(key, visitItems);
    const decision = plan.scopeDecisions[key];
    if (requirement === "applicability_unknown" || !decision) return false;
    if (decision === "not_in_scope") return requirement === "optional";
    if (key === "structural_connectors" && plan.framingPlanEvidence)
      return plan.framingPlanEvidence.hardwareSchedule.every((requirement) => {
        const selection = (plan.hardwareSelections ?? []).find(
          (item) => item.key === requirement.key,
        );
        if (
          requirement.key === "picture_frame_blocking_connectors" &&
          !(
            Number(plan.boardStockLengthFeet) > 0 &&
            dimensions.lengthFeet &&
            dimensions.widthFeet &&
            Number(plan.boardStockLengthFeet) <
              (plan.boardRunDirection === "along_length"
                ? dimensions.lengthFeet
                : dimensions.widthFeet)
          )
        )
          return true;
        return Boolean(
          selection &&
          Number(selection.quantity) > 0 &&
          Number(selection.quantity) >= requirement.quantity &&
          Number(selection.unitCost) > 0 &&
          selection.sourceReference.trim() &&
          selection.verificationReference.trim(),
        );
      });
    const line = plan.additionalLines.find(
      (candidate) => candidate.key === key,
    );
    return Boolean(
      line &&
      Number(line.quantity) > 0 &&
      line.unit.trim() &&
      Number(line.unitCost) > 0 &&
      line.sourceReference.trim(),
    );
  };
  const completedScopeCount =
    COMPLETE_REBUILD_LINE_KEYS.filter(scopeLineComplete).length;
  const incompleteScopeKeys = COMPLETE_REBUILD_LINE_KEYS.filter(
    (key) => !scopeLineComplete(key),
  );
  const nextIncompleteScopeKey =
    incompleteScopeKeys.find((key) => key !== activeScopeKey) ??
    incompleteScopeKeys[0] ??
    null;
  const scopeLineStatus = (key: CompleteRebuildLineKey) => {
    const requirement = completeRebuildScopeRequirement(key, visitItems);
    const decision = plan.scopeDecisions[key];
    const line = plan.additionalLines.find((candidate) => candidate.key === key);
    if (requirement === "applicability_unknown")
      return "Field condition still needs confirmation";
    const quantity = Number(line?.quantity);
    const quantityReady = Boolean(
      line && Number.isFinite(quantity) && quantity > 0 && line.unit.trim(),
    );
    const quantityLabel = quantityReady ? `${line!.quantity} ${line!.unit}` : "";
    if (!decision)
      return quantityReady
        ? `${quantityLabel} available · choose whether this is included; member or cost details may still be needed`
        : "Choose whether this is included";
    if (decision === "not_in_scope") return "Not included in this estimate";
    if (!line) return "Material or cost line is missing";
    if (!quantityReady)
      return "Reviewed quantity is still needed";
    if (!(Number(line.unitCost) > 0 && line.sourceReference.trim()))
      return `${quantityLabel} calculated or entered · price and source needed`;
    return `${quantityLabel} · ready`;
  };

  const completeRebuildScope = (
    <section className="mt-5 rounded-lg border-2 border-amber-400 bg-white p-4">
      <p className="text-xs font-black uppercase tracking-[.16em] text-amber-800">
        Required before calculation
      </p>
      <h4 className="mt-1 font-black text-slate-950">
        Framing materials, hardware, labor, and remaining costs
      </h4>
      <p className="mt-1 text-sm text-slate-600">
        Every required category is shown below. Calculated geometry appears
        immediately; anything the saved shape cannot determine stays plainly
        marked as needing a reviewed plan, quantity, product, or cost source.
        Only delivery, equipment, and conditionally non-applicable ledger or
        stairs may be marked outside this estimate.
      </p>
      <label
        className={`mt-3 flex min-h-11 items-start gap-3 rounded-md border p-3 text-sm font-bold focus-within:ring-2 focus-within:ring-blue-700 ${plan.completeRebuildConfirmed ? "border-emerald-500 bg-emerald-50 text-emerald-950" : "border-amber-400 bg-amber-50 text-amber-950"}`}
      >
        <input
          className="mt-1"
          type="checkbox"
          checked={plan.completeRebuildConfirmed}
          onChange={(event) => {
            const confirmed = event.target.checked;
            setPlan((current) => ({
              ...current,
              completeRebuildConfirmed: confirmed,
              additionalLines: confirmed
                ? current.additionalLines.map(prefillScopeLineFromSavedFacts)
                : current.additionalLines,
              scopeDecisions: confirmed
                ? (Object.fromEntries(
                    COMPLETE_REBUILD_LINE_KEYS.map((key) => {
                      const requirement = completeRebuildScopeRequirement(
                        key,
                        visitItems,
                      );
                      if (requirement === "required") return [key, "include"];
                      if (
                        (key === "ledger_attachment" &&
                          railingGeometry.attached === false) ||
                        (key === "stairs" && approvedStairsPresent === false)
                      )
                        return [key, "not_in_scope"];
                      return [key, current.scopeDecisions[key]];
                    }),
                  ) as DeckTakeoffPlan["scopeDecisions"])
                : current.scopeDecisions,
            }));
            setPreview(null);
          }}
        />
        This estimate replaces the entire deck, including decking, framing,
        supports, and footings.
      </label>
      <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
        <Field
          label="Reviewed build-plan source"
          help="Name the reviewed framing/build plan, engineer detail, or manufacturer installation detail used as applicable. A casual note is not a structural design or quantity source. This is separate from material price sources."
        >
          <input
            className={input}
            value={plan.buildPlanReference}
            maxLength={500}
            onChange={(event) => {
              setPlan({
                ...plan,
                buildPlanReference: event.target.value,
                buildPlanConfirmed: false,
                framingPlanEvidence: null,
              });
              setPreview(null);
            }}
          />
        </Field>
        <label className="mt-3 flex min-h-11 items-start gap-3 rounded-md border border-amber-400 bg-white p-3 text-sm font-bold text-amber-950 focus-within:ring-2 focus-within:ring-amber-700">
          <input
            className="mt-1"
            type="checkbox"
            checked={plan.buildPlanConfirmed}
            onChange={(event) => {
              setPlan({ ...plan, buildPlanConfirmed: event.target.checked });
              setPreview(null);
            }}
          />
          {plan.framingPlanEvidence
            ? "The bounded profile generated and checked this framing draft; I reviewed and approved its inputs, exceptions, and quantities."
            : "I entered the framing and support quantities from the named reviewed source. This app did not size the structure or choose code requirements."}
        </label>
      </div>
      <div className="mt-3 rounded-lg border border-slate-300 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-black text-slate-950">
            Checklist progress
          </p>
          <p className="text-sm font-bold text-slate-700">
            {completedScopeCount} of {COMPLETE_REBUILD_LINE_KEYS.length}{" "}
            complete
          </p>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"
          aria-hidden="true"
        >
          <div
            className="h-full bg-emerald-600"
            style={{
              width: `${(completedScopeCount / COMPLETE_REBUILD_LINE_KEYS.length) * 100}%`,
            }}
          />
        </div>
        {nextIncompleteScopeKey ? (
          <button
            type="button"
            className={`mt-3 w-full ${primary}`}
            onClick={() => openScopeCategory(nextIncompleteScopeKey)}
          >
            Continue with next missing detail
          </button>
        ) : (
          <p className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm font-black text-emerald-950">
            Every framing, cost, and scope item is complete.
          </p>
        )}
        <details className="mt-3 rounded-md border border-slate-300 bg-white">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 py-2 text-sm font-black text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700">
            See all categories and progress
          </summary>
          <div className="grid gap-2 border-t border-slate-200 p-3 sm:grid-cols-2">
            {COMPLETE_REBUILD_LINE_KEYS.map((key) => {
              const line = plan.additionalLines.find(
                (candidate) => candidate.key === key,
              );
              const complete = scopeLineComplete(key);
              const knownFact = scopeVisitEvidence(key).find(
                (fact) => !fact.startsWith("The site visit did not establish"),
              );
              return (
                <button
                  key={key}
                  type="button"
                  aria-controls="deck-scope-category-editor"
                  className={`min-h-16 rounded-md border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${activeScopeKey === key ? "border-blue-700 bg-blue-50" : complete ? "border-emerald-400 bg-emerald-50" : "border-slate-300 bg-white"}`}
                  onClick={() => openScopeCategory(key)}
                >
                  <span className="block text-sm font-black text-slate-950">
                    {complete ? "✓ " : ""}
                    {line?.description || key.replaceAll("_", " ")}
                  </span>
                  <span
                    className={`mt-1 block text-xs font-bold leading-5 ${complete ? "text-emerald-800" : "text-amber-900"}`}
                  >
                    {scopeLineStatus(key)}
                  </span>
                  {knownFact ? (
                    <span className="mt-1 block text-xs leading-5 text-slate-600">
                      Site fact: {knownFact}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </details>
      </div>
      {activeScopeLine ? (
        <fieldset
          id="deck-scope-category-editor"
          ref={scopeEditorRef}
          tabIndex={-1}
          className="mt-3 scroll-mt-28 rounded-lg border border-slate-300 bg-white p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
        >
          <legend className="px-1 font-bold text-slate-900">
            {activeScopeLine.description}
          </legend>
          <p
            className={`inline-block rounded-full px-2 py-1 text-xs font-black ${activeScopeRequirement === "required" ? "bg-red-100 text-red-900" : activeScopeRequirement === "optional" ? "bg-blue-100 text-blue-900" : "bg-amber-100 text-amber-900"}`}
          >
            {activeScopeRequirement === "required"
              ? "Required for complete rebuild"
              : activeScopeRequirement === "optional"
                ? "Optional or not applicable"
                : "Applicability must be confirmed in Field Measurements"}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            {LINE_GUIDANCE[activeScopeKey]}
          </p>
          <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs font-black uppercase tracking-wide text-blue-900">
              Already known from the site visit and approved structural geometry
            </p>
            <ul className="mt-1 space-y-1 text-sm leading-5 text-slate-800">
              {scopeVisitEvidence(activeScopeKey).map((fact) => (
                <li key={fact}>• {fact}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs font-bold text-slate-600">
              Visible existing conditions are reference evidence only. They do
              not silently become replacement member sizes or hidden connection
              details.
            </p>
          </div>
          {activeScopeRequirement === "required" ? (
            <p
              className={`mt-3 rounded-md border p-3 text-sm font-black ${plan.completeRebuildConfirmed ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}
            >
              {plan.completeRebuildConfirmed
                ? "Included automatically because this is a complete replacement."
                : "Confirm complete replacement above and this category will be included automatically."}
            </p>
          ) : (
            <Field label="Is this part of the estimate?">
              <select
                className={input}
                value={plan.scopeDecisions[activeScopeKey]}
                disabled={activeScopeRequirement === "applicability_unknown"}
                onChange={(event) =>
                  updateScopeDecision(
                    activeScopeKey,
                    event.target
                      .value as DeckTakeoffPlan["scopeDecisions"][CompleteRebuildLineKey],
                  )
                }
              >
                <option value="">Choose one</option>
                <option value="include">Yes, include it</option>
                <option value="not_in_scope">No, leave it out</option>
              </select>
            </Field>
          )}
          {activeScopeIncluded ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {activeScopeKey === "structural_connectors" &&
              plan.framingPlanEvidence ? (
                <div className="sm:col-span-2 lg:col-span-5 space-y-3">
                  {plan.framingPlanEvidence.hardwareSchedule.map(
                    (requirement) => {
                      const selection = (plan.hardwareSelections ?? []).find(
                        (item) => item.key === requirement.key,
                      );
                      return (
                        <fieldset
                          key={requirement.key}
                          className="rounded-md border border-slate-300 bg-white p-3"
                        >
                          <legend className="px-1 text-sm font-black text-slate-950">
                            {requirement.key.replaceAll("_", " ")}
                          </legend>
                          <p className="text-xs leading-5 text-slate-700">
                            {requirement.specification}
                          </p>
                          <p className="mt-1 text-xs font-bold text-blue-900">
                            Basis: {requirement.sourceId}
                          </p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <Field
                              label={`Purchase quantity (${requirement.unit})`}
                            >
                              <input
                                className={input}
                                inputMode="decimal"
                                value={selection?.quantity ?? ""}
                                onChange={(event) =>
                                  updateHardwareSelection(
                                    requirement.key,
                                    "quantity",
                                    event.target.value,
                                  )
                                }
                              />
                            </Field>
                            <Field label="Unit price">
                              <input
                                className={input}
                                inputMode="decimal"
                                value={selection?.unitCost ?? ""}
                                onChange={(event) =>
                                  updateHardwareSelection(
                                    requirement.key,
                                    "unitCost",
                                    event.target.value,
                                  )
                                }
                              />
                            </Field>
                            <Field label="Compatible product / price source">
                              <input
                                className={input}
                                value={selection?.sourceReference ?? ""}
                                onChange={(event) =>
                                  updateHardwareSelection(
                                    requirement.key,
                                    "sourceReference",
                                    event.target.value,
                                  )
                                }
                              />
                            </Field>
                            <Field
                              label="Compatibility / reviewed-detail verification"
                              help="Record the checked model, manufacturer schedule, coating, substrate and load-path detail that applies."
                            >
                              <input
                                className={input}
                                value={selection?.verificationReference ?? ""}
                                onChange={(event) =>
                                  updateHardwareSelection(
                                    requirement.key,
                                    "verificationReference",
                                    event.target.value,
                                  )
                                }
                              />
                            </Field>
                          </div>
                        </fieldset>
                      );
                    },
                  )}
                  <p className="rounded-md bg-amber-50 p-3 text-xs font-bold text-amber-950">
                    Verify product model, treated-lumber coating, substrate,
                    anchors, and every manufacturer fastener schedule. General
                    deck screws are not structural connector fasteners.
                  </p>
                </div>
              ) : null}
              {activeScopeKey !== "structural_connectors" ||
              !plan.framingPlanEvidence ? (
                <>
                  <div className="sm:col-span-2 lg:col-span-5">
                    <Field
                      label="Planned material or work description"
                      help="Describe what will actually be purchased or performed. Existing visible material is not copied automatically."
                    >
                      <input
                        className={input}
                        value={activeScopeLine.description}
                        onChange={(event) =>
                          updateLine(
                            activeScopeLine.key,
                            "description",
                            event.target.value,
                          )
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Reviewed quantity">
                    <input
                      className={input}
                      inputMode="decimal"
                      value={activeScopeLine.quantity}
                      onChange={(e) =>
                        updateLine(
                          activeScopeLine.key,
                          "quantity",
                          e.target.value,
                        )
                      }
                    />
                  </Field>
                  <Field label="Unit">
                    <input
                      className={input}
                      value={activeScopeLine.unit}
                      onChange={(e) =>
                        updateLine(activeScopeLine.key, "unit", e.target.value)
                      }
                    />
                  </Field>
                  {activeScopeLine.category === "material" ? (
                    <Field label="Exact catalog product">
                      <select
                        className={input}
                        value={activeScopeLine.catalogMaterialId ?? ""}
                        onChange={(e) =>
                          chooseCatalog(activeScopeLine.key, e.target.value)
                        }
                      >
                        <option value="">Enter verified cost manually</option>
                        {catalogOptions(activeScopeLine.key).map((material) => (
                          <option key={material.id} value={material.id}>
                            {material.description} · $
                            {material.effective_unit_cost ?? "?"}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : (
                    <div />
                  )}
                  <Field label="Unit cost">
                    <input
                      className={input}
                      inputMode="decimal"
                      value={activeScopeLine.unitCost}
                      onChange={(e) =>
                        updateLine(
                          activeScopeLine.key,
                          "unitCost",
                          e.target.value,
                        )
                      }
                    />
                  </Field>
                  <Field label="Cost source">
                    <input
                      className={input}
                      value={activeScopeLine.sourceReference}
                      onChange={(e) =>
                        updateLine(
                          activeScopeLine.key,
                          "sourceReference",
                          e.target.value,
                        )
                      }
                    />
                  </Field>
                </>
              ) : null}
            </div>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className={primary}
              disabled={activeScopeIndex === 0}
              onClick={() =>
                openScopeCategory(
                  COMPLETE_REBUILD_LINE_KEYS[activeScopeIndex - 1],
                )
              }
            >
              Previous
            </button>
            <button
              type="button"
              className={primary}
              disabled={
                activeScopeIndex === COMPLETE_REBUILD_LINE_KEYS.length - 1
              }
              onClick={() =>
                openScopeCategory(
                  COMPLETE_REBUILD_LINE_KEYS[activeScopeIndex + 1],
                )
              }
            >
              Next category
            </button>
          </div>
        </fieldset>
      ) : null}
    </section>
  );

  const customStructuralKeys: CompleteRebuildLineKey[] = [
    ...(railingGeometry.attached === true
      ? (["ledger_attachment"] as const)
      : []),
    "joists",
    "beams",
    "posts",
    "footings",
    "blocking",
    "structural_connectors",
    ...(approvedStairsPresent ? (["stairs"] as const) : []),
  ];
  const customReviewedQuantityKeys = [
    ...customStructuralKeys,
    "custom_decking",
    ...(deckingFamily === "composite"
      ? ["custom_decking_square_edge"]
      : []),
    ...(railingGeometry.railingsPresent ? ["custom_railing"] : []),
  ];
  const customStructuralLines = customReviewedQuantityKeys
    .map((key) => plan.additionalLines.find((line) => line.key === key))
    .filter((line): line is FixedLine => Boolean(line));
  const customFinishLines = [
    plan.additionalLines.find((line) => line.key === "custom_decking"),
    ...(deckingFamily === "composite"
      ? [
          plan.additionalLines.find(
            (line) => line.key === "custom_decking_square_edge",
          ),
        ]
      : []),
    ...(railingGeometry.railingsPresent
      ? [plan.additionalLines.find((line) => line.key === "custom_railing")]
      : []),
  ].filter((line): line is FixedLine => Boolean(line));
  const finishLineTotal = (line: FixedLine) => {
    const quantity = Number(line.quantity);
    const unitCost = Number(line.unitCost);
    return Number.isFinite(quantity) &&
      quantity > 0 &&
      Number.isFinite(unitCost) &&
      unitCost > 0
      ? quantity * unitCost
      : 0;
  };
  const customFinishMaterialsReady =
    customFinishLines.length > 0 &&
    customFinishLines.every(
      (line) =>
        line.description.trim() &&
        line.unit.trim() &&
        line.sourceReference.trim() &&
        finishLineTotal(line) > 0,
    );
  const customFinishMaterialSubtotal = customFinishLines.reduce(
    (total, line) => total + finishLineTotal(line),
    0,
  );
  const customStructuralDraft = useMemo(
    () =>
      approvedShape
        ? buildCustomDeckStructuralDraft({
            outline: approvedShape.outline,
            joistDirection: customJoistDirection,
            joistSpacingInches: customJoistSpacing,
          })
        : null,
    [approvedShape, customJoistDirection, customJoistSpacing],
  );
  const customDraftReady =
    savedCustomPlan !== null &&
    savedCustomPlan.concept.shapeBinding.id === approvedShape?.id &&
    savedCustomPlan.concept.shapeBinding.shapeRevision === approvedShape?.shapeRevision &&
    savedCustomPlan.concept.joistDirection === customJoistDirection &&
    savedCustomPlan.concept.joistSpacingInches === customJoistSpacing;
  const customDrawing = useMemo(() => {
    if (!approvedShape?.outline.length) return null;
    const xs = approvedShape.outline.map((point) => point.x);
    const ys = approvedShape.outline.map((point) => point.y);
    const minimumX = Math.min(...xs);
    const maximumX = Math.max(...xs);
    const minimumY = Math.min(...ys);
    const maximumY = Math.max(...ys);
    const scale = Math.min(
      260 / Math.max(0.1, maximumX - minimumX),
      160 / Math.max(0.1, maximumY - minimumY),
    );
    const toSvg = (point: { x: number; y: number }) => ({
      x: 20 + (point.x - minimumX) * scale,
      y: 20 + (point.y - minimumY) * scale,
    });
    const stair = approvedShape.stairPlacement
      ? (() => {
          const placement = approvedShape.stairPlacement;
          const start = approvedShape.outline[placement.edgeIndex];
          const end =
            approvedShape.outline[
              (placement.edgeIndex + 1) % approvedShape.outline.length
            ];
          const length = Math.hypot(end.x - start.x, end.y - start.y);
          const outward = deckOutlineOutwardNormal(
            approvedShape.outline,
            placement.edgeIndex,
          );
          if (!outward || length <= 0) return null;
          const tangent = {
            x: (end.x - start.x) / length,
            y: (end.y - start.y) / length,
          };
          const center = {
            x: start.x + tangent.x * placement.offsetFeet,
            y: start.y + tangent.y * placement.offsetFeet,
          };
          const nearStart = {
            x: center.x - tangent.x * placement.widthFeet / 2,
            y: center.y - tangent.y * placement.widthFeet / 2,
          };
          const nearEnd = {
            x: center.x + tangent.x * placement.widthFeet / 2,
            y: center.y + tangent.y * placement.widthFeet / 2,
          };
          return [
            nearStart,
            nearEnd,
            {
              x: nearEnd.x + outward.x * placement.projectionFeet,
              y: nearEnd.y + outward.y * placement.projectionFeet,
            },
            {
              x: nearStart.x + outward.x * placement.projectionFeet,
              y: nearStart.y + outward.y * placement.projectionFeet,
            },
          ].map(toSvg);
        })()
      : null;
    return {
      outline: approvedShape.outline.map(toSvg),
      joists: (customStructuralDraft?.joistSegments ?? []).map((segment) => ({
        start: toSvg(segment.start),
        end: toSvg(segment.end),
      })),
      stair,
    };
  }, [approvedShape, customStructuralDraft]);
  const activeCustomStructuralLine = customStructuralLines.find(
    (line) => line.key === activeScopeKey,
  ) ?? customStructuralLines[0];
  const invalidateCustomDraft = () => {
    customPlanSaveKey.current = "";
    setSavedCustomPlan(null);
    setPlan((current) => ({
      ...current,
      customStructuralPlanRevisionId: null,
      buildPlanConfirmed: false,
      additionalLines: current.additionalLines.map((line) =>
        line.key === "joists"
          ? {
              ...line,
              quantity: "",
              unitCost: "",
              sourceReference: "",
              catalogMaterialId: null,
            }
          : line,
      ),
    }));
    setPreview(null);
  };
  const generateCustomStructuralPlan = async () => {
    if (
      !approvedShape ||
      !customStructuralDraft ||
      customStructuralDraft.status !== "geometry_ready" ||
      customStructuralDraft.joistLinearFeet === null
    )
      return;
    setPending(true);
    setError("");
    try {
      if (!customPlanSaveKey.current)
        customPlanSaveKey.current = crypto.randomUUID();
      const response = await fetch(
        `/api/guided-site-visits/${encodeURIComponent(visitId)}/deck-structural-plan-revisions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedPlanRevision: customPlanRevision,
            idempotencyKey: customPlanSaveKey.current,
            joistDirection: customJoistDirection,
            joistSpacingInches: customJoistSpacing,
          }),
        },
      );
      const body = (await response.json()) as {
        success?: boolean;
        error?: string;
        id?: string;
        planRevision?: number;
        shapeRevisionId?: string;
        shapeRevision?: number;
        shapeDigest?: string;
        concept?: CustomDeckEstimatingConcept;
      };
      if (
        !response.ok ||
        !body.success ||
        !body.id ||
        !body.shapeRevisionId ||
        !body.shapeRevision ||
        !body.shapeDigest ||
        !body.concept
      )
        throw new Error(body.error || "The preliminary estimating plan could not be saved.");
      const line = customDeckEstimatingConceptJoistLine(body.concept);
      setSavedCustomPlan({
        id: body.id,
        shapeRevisionId: body.shapeRevisionId,
        shapeRevision: body.shapeRevision,
        shapeDigest: body.shapeDigest,
        concept: body.concept,
      });
      customPlanSaveKey.current = "";
      setCustomPlanRevision(body.planRevision ?? customPlanRevision + 1);
      setPlan((current) => ({
        ...current,
        customStructuralPlanRevisionId: body.id,
        buildPlanConfirmed: false,
        framingPlanEvidence: null,
        additionalLines: current.additionalLines.map((item) =>
          item.key === "joists"
            ? { ...item, ...line, unitCost: "", sourceReference: "", catalogMaterialId: null }
            : item,
        ),
      }));
      setActiveScopeKey("joists");
      setNotice("Preliminary custom-footprint estimating plan saved. Review its unresolved packages, then continue to Takeoff.");
      setPreview(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The preliminary estimating plan could not be saved.");
    } finally {
      setPending(false);
    }
  };

  const customStructuralDesigner = (
    <section className="mt-5 rounded-xl border-2 border-emerald-700 bg-white p-4 sm:p-5">
      <p className="text-xs font-black uppercase tracking-[.16em] text-emerald-800">
        Approved custom footprint
      </p>
      <h4 className="mt-1 text-lg font-black text-slate-950">
        Generate a preliminary estimating plan
      </h4>
      <p className="mt-2 rounded-lg bg-emerald-50 p-3 text-sm font-bold leading-6 text-emerald-950">
        The drawing starts with saved shape revision {approvedShape?.shapeRevision}
        and its exact stair placement. The app can total interior joist-run
        geometry after you choose a direction and spacing. It will not size the
        structure or invent bearings, beams, posts, footings, connectors, or
        concealed attachment facts.
      </p>
      <div className="relative mt-4 overflow-hidden rounded-lg border-2 border-slate-950 bg-slate-50 p-2">
        <svg
          viewBox="0 0 300 220"
          role="img"
          aria-label="Exact saved custom deck footprint with preliminary interior joist runs and saved stair placement"
          className="block w-full"
        >
          <rect width="300" height="220" fill="#f8fafc" />
          {customDrawing ? (
            <>
              <polygon
                points={customDrawing.outline
                  .map((point) => `${point.x},${point.y}`)
                  .join(" ")}
                fill="#dbeafe"
                stroke="#0f172a"
                strokeWidth="3"
              />
              {customDraftReady
                ? customDrawing.joists.map((segment, index) => (
                    <line
                      key={`custom-joist-${index}`}
                      x1={segment.start.x}
                      y1={segment.start.y}
                      x2={segment.end.x}
                      y2={segment.end.y}
                      stroke="#2563eb"
                      strokeWidth="1.5"
                      data-plan-member="custom-interior-joist-run"
                    />
                  ))
                : null}
              {customDrawing.stair ? (
                <polygon
                  points={customDrawing.stair
                    .map((point) => `${point.x},${point.y}`)
                    .join(" ")}
                  fill="#fed7aa"
                  stroke="#c2410c"
                  strokeWidth="2"
                  data-plan-member="saved-custom-stair"
                />
              ) : null}
            </>
          ) : null}
          <text
            x="150"
            y="104"
            textAnchor="middle"
            fontSize="13"
            fontWeight="900"
            fill="#991b1b"
            opacity="0.78"
          >
            PRELIMINARY ESTIMATING PLAN
          </text>
          <text
            x="150"
            y="121"
            textAnchor="middle"
            fontSize="10"
            fontWeight="800"
            fill="#991b1b"
            opacity="0.78"
          >
            NOT FOR CONSTRUCTION — NOT STAMPED
          </text>
        </svg>
      </div>
      <div className="mt-4 rounded-lg border-2 border-blue-300 bg-blue-50 p-3">
        <p className="font-black text-slate-950">Joist-run estimating assumptions</p>
        <p className="mt-1 text-xs leading-5 text-slate-700">
          These inputs position lines on the saved footprint only. A reviewed
          plan must still approve member size, species/grade, spans, bearing,
          doubles, trimmers, and openings.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Joist direction">
            <select
              className={input}
              value={customJoistDirection}
              onChange={(event) => {
                invalidateCustomDraft();
                setCustomJoistDirection(
                  event.target.value as CustomDeckJoistDirection,
                );
              }}
            >
              <option value="house_to_yard">House toward yard</option>
              <option value="side_to_side">Side to side</option>
            </select>
          </Field>
          <Field label="Joist spacing (inches on center)">
            <select
              className={input}
              value={customJoistSpacing}
              onChange={(event) => {
                invalidateCustomDraft();
                setCustomJoistSpacing(Number(event.target.value) as 12 | 16 | 24);
              }}
            >
              <option value="12">12 inches on center</option>
              <option value="16">16 inches on center</option>
              <option value="24">24 inches on center</option>
            </select>
          </Field>
        </div>
        {blueprintVisitSeed.estimatingAssumptions.joistSize ? (
          <p className="mt-3 rounded-md border border-slate-300 bg-white p-3 text-sm leading-6 text-slate-800">
            <strong>Observed existing deck:</strong>{" "}
            {blueprintVisitSeed.estimatingAssumptions.joistSize}. This is shown
            for comparison only and is not being selected for the replacement.
          </p>
        ) : null}
        <button
          type="button"
          className={`mt-4 w-full ${primary}`}
          disabled={
            disabled ||
            pending ||
            customPlanLoading ||
            customStructuralDraft?.status !== "geometry_ready"
          }
          onClick={generateCustomStructuralPlan}
        >
          Generate preliminary estimating plan
        </button>
        {customStructuralDraft?.status === "unsupported_outline" ? (
          <p className="mt-2 text-sm font-bold text-red-900">
            This geometry draft supports simple right-angle custom footprints
            only. Use an external reviewed plan for this outline.
          </p>
        ) : null}
      </div>
      {customDraftReady && customStructuralDraft ? (
        <section className="mt-4 rounded-lg border-2 border-violet-400 bg-violet-50 p-3">
          <h5 className="font-black text-violet-950">
            PRELIMINARY ESTIMATING PLAN — NOT FOR CONSTRUCTION
          </h5>
          <p className="mt-1 text-sm font-bold text-violet-950">
            {customStructuralDraft.joistSegmentCount} interior run segments · {customStructuralDraft.joistLinearFeet} linear ft · longest run {customStructuralDraft.longestJoistRunFeet} ft
          </p>
          <p className="mt-2 text-xs leading-5 text-violet-900">
            Only this interior run geometry was generated. The following items
            still require an external reviewed framing/build plan:
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm font-bold text-violet-950">
            {customStructuralDraft.unresolved.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          <p className="mt-3 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm font-black text-amber-950">
            This generated estimating concept is saved as an immutable revision
            bound to shape revision {approvedShape?.shapeRevision}. It is not a
            reviewed custom structural plan. Takeoff receives only the polygon
            geometry and preliminary joist-run quantity; all listed structural,
            hardware, ordering, and permit packages remain blocked.
          </p>
          <button
            type="button"
            className={`mt-3 w-full ${primary}`}
            disabled={disabled || pending || !savedCustomPlan}
            onClick={() => {
              setNotice("Preliminary geometry carried into Takeoff. Complete the reviewed structural and hardware packages before pricing or final use.");
              onStructureReady("preliminary_geometry");
            }}
          >
            Use preliminary geometry in Takeoff
          </button>
        </section>
      ) : null}
      <details className="mt-4 rounded-lg border border-slate-400 bg-slate-50 p-3">
        <summary className="min-h-11 cursor-pointer py-2 font-black text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
          Use an external reviewed framing plan instead
        </summary>
      <div className="mt-4 rounded-lg border border-slate-300 bg-white p-3">
        <Field
          label="Reviewed custom framing-plan source"
          help="Name the drawing, engineer detail, manufacturer plan, or building-department-reviewed layout used for this exact inset footprint."
        >
          <input
            className={input}
            value={plan.buildPlanReference}
            maxLength={500}
            onChange={(event) => {
              setPlan((current) => ({
                ...current,
                buildPlanReference: event.target.value,
                buildPlanConfirmed: false,
                framingPlanEvidence: null,
              }));
              setPreview(null);
            }}
          />
        </Field>
        <p className="mt-3 rounded-md border-2 border-amber-400 bg-amber-50 p-3 text-sm font-black leading-6 text-amber-950">
          A typed source name and checkbox are not proof of a reviewed plan.
          Approval remains unavailable until the app can save and recheck the
          reviewed plan as immutable evidence bound to this shape revision.
        </p>
      </div>
      <div className="mt-4 rounded-lg border border-slate-300 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-black text-slate-950">Structural quantities</p>
          <p className="text-sm font-bold text-slate-700">
            {customStructuralLines.filter(
              deckStructuralLineIsComplete,
            ).length}{" "}
            of {customReviewedQuantityKeys.length}
          </p>
        </div>
        <Field label="Structural category">
          <select
            className={input}
            value={activeCustomStructuralLine?.key ?? ""}
            onChange={(event) =>
              setActiveScopeKey(event.target.value as CompleteRebuildLineKey)
            }
          >
            {customStructuralLines.map((line) => (
              <option key={line.key} value={line.key}>
                {deckStructuralLineIsComplete(line) ? "✓ " : ""}
                {line.description}
              </option>
            ))}
          </select>
        </Field>
        {activeCustomStructuralLine ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Plan description">
              <input
                className={input}
                value={activeCustomStructuralLine.description}
                onChange={(event) =>
                  updateLine(
                    activeCustomStructuralLine.key,
                    "description",
                    event.target.value,
                  )
                }
              />
            </Field>
            <Field label="Reviewed quantity">
              <input
                className={input}
                inputMode="decimal"
                value={activeCustomStructuralLine.quantity}
                onChange={(event) =>
                  updateLine(
                    activeCustomStructuralLine.key,
                    "quantity",
                    event.target.value,
                  )
                }
              />
            </Field>
            <Field label="Unit">
              <input
                className={input}
                value={activeCustomStructuralLine.unit}
                onChange={(event) =>
                  updateLine(
                    activeCustomStructuralLine.key,
                    "unit",
                    event.target.value,
                  )
                }
              />
            </Field>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className={`mt-4 w-full ${primary}`}
        disabled
      >
        Reviewed-plan evidence is required before Takeoff
      </button>
      <p className="mt-2 text-sm font-bold text-amber-900">
        You may prepare the source and quantities here, but this screen will not
        treat free text as reviewed structural evidence.
      </p>
      </details>
    </section>
  );

  const structuralDesigner = dimensions.lengthFeet && dimensions.widthFeet ? (
    <DeckPrescriptivePlanGenerator
      lengthFeet={dimensions.lengthFeet}
      widthFeet={dimensions.widthFeet}
      blueprintAttachment={
        railingGeometry.attached === null
          ? null
          : railingGeometry.attached
            ? "ledger"
            : "freestanding"
      }
      blueprintStairs={approvedStairsPresent}
      blueprintRailings={railingGeometry.railingsPresent}
      stairPlacementConfirmed={
        approvedShapeStairPlacementConfirmed
      }
      visitSeed={blueprintVisitSeed}
      stairEdge={
        approvedShapeHandoff?.rectangularStairPlacement?.edge ?? plan.stairEdge
      }
      stairPosition={plan.stairPosition}
      stairOffsetFeet={
        approvedShapeHandoff?.rectangularStairPlacement
          ? String(approvedShapeHandoff.rectangularStairPlacement.offsetFeet)
          : plan.stairOffsetFeet
      }
      approvedStairWidthFeet={
        approvedShapeHandoff?.rectangularStairPlacement?.widthFeet
      }
      approvedStairProjectionFeet={
        approvedShapeHandoff?.rectangularStairPlacement?.projectionFeet
      }
      approvedOutline={approvedShape?.outline}
      disabled={disabled}
      onStairPlacementChange={(edge, offsetFeet) => {
        setPlan((current) => ({
          ...current,
          stairEdge: edge,
          stairOffsetFeet: String(offsetFeet),
          stairPlacementConfirmed: false,
        }));
        setPreview(null);
      }}
      onEditStairPlacement={() => {
        if (layoutDetailsRef.current) {
          layoutDetailsRef.current.open = true;
          layoutDetailsRef.current.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      }}
      onApprove={usePrescriptivePlan}
    />
  ) : (
    <div className="mt-5 grid min-h-44 place-items-center rounded-xl border-2 border-amber-400 bg-amber-50 p-5 text-center text-sm font-bold text-amber-950">
      Enter the deck length and width in Field Measurements before generating
      the structural plan.
    </div>
  );

  if (workflowPhase === "structure")
    return (
      <section className="mt-5 rounded-xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5">
        <p className="text-xs font-black uppercase tracking-[.16em] text-blue-800">
          Structural design only
        </p>
        <h3 className="mt-1 text-xl font-black text-slate-950">
          {customApprovedFootprint
            ? "Generate the custom-footprint estimating plan"
            : "Build one complete structural plan"}
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          {customApprovedFootprint
            ? "Save the exact footprint and preliminary run geometry here. The drawing is not a reviewed structural plan; sizing, supports, foundations, attachment, stairs, guards and hardware remain later blockers."
            : "Work through framing, supports, footings, stairs, railing and attachment here. Material shopping, quantities, Lowe's products and prices begin only after this plan is approved."}
        </p>
        {customApprovedFootprint ? customStructuralDesigner : structuralDesigner}
      </section>
    );

  if (takeoffApplied)
    return (
      <section className="mt-5 rounded-xl border-2 border-emerald-700 bg-emerald-50 p-5">
        <p className="text-xs font-black uppercase tracking-[.16em] text-emerald-800">
          Draft takeoff complete
        </p>
        <h3 className="mt-1 text-xl font-black text-emerald-950">
          Reviewed quantities and true costs are in the estimate
        </h3>
        <p className="mt-2 text-sm text-emerald-950">
          Review the saved lines below. Then continue to OH&amp;P and the
          customer proposal.
        </p>
      </section>
    );

  return (
    <section className="mt-5 rounded-xl border border-slate-300 bg-slate-50 p-4 shadow-sm sm:p-5">
      <p className="text-xs font-black uppercase tracking-[.16em] text-blue-800">
        Finish material selections
      </p>
      <h3 className="mt-1 text-xl font-black text-slate-950">
        Select decking and railing without cluttering the framing plan
      </h3>
      <p className="mt-2 text-sm leading-6 text-slate-700">
        {customApprovedFootprint
          ? "The exact custom footprint, stairs, and preliminary quantities carry forward. Choose only the visible finish families here; unresolved structural work remains tracked separately."
          : "The approved shape and framing quantities carry forward. Choose the visible finish families here, then review the matching products and calculated finish costs."}
      </p>

      {finishSelectionControls}

      {!customApprovedFootprint ? (
        <details
          ref={layoutDetailsRef}
          className="mt-5 scroll-mt-24 rounded-xl border border-slate-300 bg-white p-4"
        >
        <summary className="min-h-11 cursor-pointer py-2 font-black text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700">
          Edit board layout and stair placement
        </summary>
        <div className="mt-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[.16em] text-slate-500">
                Plan verification
              </p>
              <h4 className="mt-1 text-lg font-black text-slate-950">
                Deck blueprint
              </h4>
            </div>
            <p className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-900">
              {dimensions.lengthFeet ?? "?"} ft × {dimensions.widthFeet ?? "?"}{" "}
              ft
            </p>
          </div>
          <fieldset className="mt-4">
            <legend className="text-sm font-black text-slate-900">
              Board direction
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["along_length", "Run boards along the deck length"],
                  ["along_width", "Run boards across the deck width"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm font-bold focus-within:ring-2 focus-within:ring-blue-700 ${plan.boardRunDirection === value ? "border-blue-700 bg-blue-50 text-blue-950" : "border-slate-300 text-slate-800"}`}
                >
                  <input
                    type="radio"
                    name="board-direction"
                    checked={plan.boardRunDirection === value}
                    onChange={() => {
                      setPlan({ ...plan, boardRunDirection: value });
                      setPreview(null);
                      appliedDefaults.current = false;
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          {approvedStairsPresent ? (
            <fieldset className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <legend className="px-1 text-sm font-black text-slate-900">
                Place the stairs on the drawing
              </legend>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {railingGeometry.attached
                  ? "The house is at the top."
                  : "The top label sets the drawing orientation."}{" "}
                Choose the deck edge, then where the opening sits on that edge.
                This changes the plan—not your field measurements.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Stair edge">
                  <select
                    className={input}
                    value={plan.stairEdge}
                    onChange={(event) => {
                      setPlan({
                        ...plan,
                        stairEdge: event.target
                          .value as DeckTakeoffPlan["stairEdge"],
                        stairOffsetFeet: "",
                        stairPlacementConfirmed: false,
                      });
                      setPreview(null);
                    }}
                  >
                    {railingGeometry.attached === false ? (
                      <option value="top">Top edge of drawing</option>
                    ) : null}
                    <option value="left">Left side</option>
                    <option value="right">Right side</option>
                    <option value="yard">Yard edge</option>
                  </select>
                </Field>
                <Field label="Position on that edge">
                  <select
                    className={input}
                    value={plan.stairPosition}
                    onChange={(event) => {
                      setPlan({
                        ...plan,
                        stairPosition: event.target
                          .value as DeckTakeoffPlan["stairPosition"],
                        stairOffsetFeet: "",
                        stairPlacementConfirmed: false,
                      });
                      setPreview(null);
                    }}
                  >
                    {plan.stairEdge === "yard" || plan.stairEdge === "top" ? (
                      <>
                        <option value="start">Left side of this edge</option>
                        <option value="center">Center of this edge</option>
                        <option value="end">Right side of this edge</option>
                      </>
                    ) : (
                      <>
                        <option value="start">
                          {railingGeometry.attached
                            ? "Nearest the house"
                            : "Nearest the top of the drawing"}
                        </option>
                        <option value="center">Middle of the side</option>
                        <option value="end">
                          {railingGeometry.attached
                            ? "Farthest from the house"
                            : "Farthest from the top of the drawing"}
                        </option>
                      </>
                    )}
                  </select>
                </Field>
              </div>
              <p className="mt-3 rounded-md bg-blue-100 p-3 text-sm font-bold text-blue-950">
                Current plan: stairs on the{" "}
                {plan.stairEdge === "yard"
                  ? "yard edge"
                  : plan.stairEdge === "top"
                    ? "top edge"
                    : `${plan.stairEdge} side`}
                ,{" "}
                {plan.stairOffsetFeet !== ""
                  ? `${Number(plan.stairOffsetFeet).toFixed(2)} ft from the start of that edge`
                  : plan.stairEdge === "yard" || plan.stairEdge === "top"
                    ? plan.stairPosition === "start"
                      ? "toward the left"
                      : plan.stairPosition === "center"
                        ? "centered"
                        : "toward the right"
                    : plan.stairPosition === "start"
                      ? railingGeometry.attached
                        ? "nearest the house"
                        : "nearest the top of the drawing"
                      : plan.stairPosition === "center"
                        ? "in the middle"
                        : railingGeometry.attached
                          ? "farthest from the house"
                          : "farthest from the top of the drawing"}
                .
              </p>
              <label
                className={`mt-3 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm font-bold focus-within:ring-2 focus-within:ring-blue-700 ${plan.stairPlacementConfirmed ? "border-emerald-600 bg-emerald-50 text-emerald-950" : "border-amber-400 bg-amber-50 text-amber-950"}`}
              >
                <input
                  type="checkbox"
                  checked={plan.stairPlacementConfirmed}
                  onChange={(event) => {
                    setPlan({
                      ...plan,
                      stairPlacementConfirmed: event.target.checked,
                    });
                    setPreview(null);
                  }}
                />
                I checked this stair location against the jobsite.
              </label>
            </fieldset>
          ) : null}
          <p className="mt-3 text-xs leading-5 text-slate-600">
            This drawing is a quantity plan, not a permit or structural drawing.
            If the shape or dimensions are wrong, return to Field Measurements
            and correct them before approving the takeoff.
          </p>
        </div>
        </details>
      ) : null}

      {customApprovedFootprint ? (
        <section className="mt-5 rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
          <h4 className="font-black text-slate-950">
            Matching products for the custom footprint
          </h4>
          <p className="mt-1 text-sm leading-6 text-slate-700">
            Choose the finishes above. The app fills the matching Lowe&apos;s
            product and its price source. The approved polygon calculates deck
            area, board count, and level-railing length automatically. Framing
            products are not selected on this screen.
          </p>
          {customFinishGeometry ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-slate-950">
                <p className="text-xs font-black uppercase tracking-wide text-blue-800">
                  Approved deck area
                </p>
                <p className="mt-1 text-xl font-black">
                  {customFinishGeometry.areaSquareFeet.toFixed(1)} sq ft
                </p>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-slate-950">
                <p className="text-xs font-black uppercase tracking-wide text-blue-800">
                  Level railing
                </p>
                <p className="mt-1 text-xl font-black">
                  {customFinishGeometry.levelRailingFeet === null
                    ? "Needs attachment answer"
                    : `${customFinishGeometry.levelRailingFeet.toFixed(1)} ln ft`}
                </p>
              </div>
            </div>
          ) : null}
          <div className="mt-3 space-y-3">
            {customFinishLines.map((line) => {
              const isDecking = line.key === "custom_decking";
              const isSquareEdge =
                line.key === "custom_decking_square_edge";
              const isWoodRailing =
                line.key === "custom_railing" && railingFamily === "wood";
              const lowesPage =
                line.sourceReference.startsWith("https://www.lowes.com/") ||
                line.sourceReference.startsWith("https://lowes.com/");
              const priceReady = Number(line.unitCost) > 0;
              return (
                <article
                  key={line.key}
                  className="rounded-lg border border-slate-300 bg-slate-50 p-3"
                >
                  <p className="font-black text-slate-950">
                    {isDecking
                      ? deckingFamily === "composite"
                        ? "Grooved field boards"
                        : "Decking"
                      : isSquareEdge
                        ? "Square-edge border and divider boards"
                        : "Railing"}
                  </p>
                  <p className="mt-1 text-sm font-bold leading-6 text-slate-700">
                    {isWoodRailing
                      ? "Wood railing material allowance"
                      : line.description || "Finding a matching product…"}
                  </p>
                  {isWoodRailing ? (
                    <p className="mt-2 text-sm font-bold text-emerald-800">
                      Quantity comes from the approved perimeter and selected
                      stair sides. Enter the estimating cost per linear foot
                      above; no individual railing SKU is required.
                    </p>
                  ) : lowesPage ? (
                    <a
                      className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-blue-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                      href={line.sourceReference}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open Lowe&apos;s product
                    </a>
                  ) : (
                    <p className="mt-2 text-sm font-bold text-amber-900">
                      Choose a finish above to find a matching product.
                    </p>
                  )}

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field
                      label={
                        isDecking
                          ? customDeckBoardEstimate
                            ? "Calculated boards to purchase"
                            : "Calculated decking coverage"
                          : isSquareEdge
                            ? "Calculated square-edge boards to purchase"
                          : "Calculated railing package quantity"
                      }
                    >
                      <input
                        aria-describedby={`${line.key}-quantity-help`}
                        className={`${input} cursor-not-allowed bg-slate-100 text-slate-950`}
                        inputMode="decimal"
                        readOnly
                        value={
                          isDecking || isSquareEdge
                            ? line.quantity
                            : isWoodRailing
                              ? woodRailingFeet.toFixed(2)
                            : line.quantity
                        }
                      />
                      <span
                        id={`${line.key}-quantity-help`}
                        className="mt-1 block text-xs leading-5 text-slate-600"
                      >
                        {isDecking
                          ? customDeckBoardEstimate
                            ? `Calculated from the approved polygon, ${plan.boardStockLengthFeet || "selected-length"}-ft boards, and ${plan.boardWastePercent || "0"}% waste.`
                            : `The approved polygon requires ${customDeckingCoverageSquareFeet?.toFixed(1) ?? "0"} sq ft including ${plan.boardWastePercent || "0"}% waste. The app converts this to boards when the selected product length is known.`
                          : isSquareEdge
                            ? customSquareEdgeEstimate
                              ? `Includes ${customFinishGeometry?.perimeterFeet.toFixed(1) ?? "0"} ft of picture frame plus ${customSquareEdgeEstimate.dividerCount} full-width divider${customSquareEdgeEstimate.dividerCount === 1 ? "" : "s"} where the board run exceeds stock length, with ${plan.boardWastePercent || "0"}% waste.`
                              : "Calculated after the matching square-edge stock length is known."
                          : "Calculated from the exact open-edge perimeter and selected railing system. Stair-side components are included in the system summary."}
                      </span>
                    </Field>
                    {priceReady ? (
                      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950">
                        <p className="font-black">Estimating retail price</p>
                        <p className="mt-1 text-lg font-black">
                          ${line.unitCost} per {line.unit || "item"}
                        </p>
                        <p className="mt-1 text-xs leading-5">
                          No Pro discount is assumed. Reprice the complete
                          takeoff before purchasing.
                        </p>
                      </div>
                    ) : (
                      <Field
                        label={
                          isWoodRailing
                            ? "Estimating material cost per linear foot"
                            : "Estimating Lowe's price per item"
                        }
                      >
                        <span className="mt-1 flex items-center rounded-md border border-slate-300 bg-white focus-within:border-emerald-700 focus-within:ring-2 focus-within:ring-emerald-100">
                          <span className="pl-3 text-slate-600">$</span>
                          <input
                            className="min-h-11 w-full rounded-md bg-transparent px-2 py-2 text-sm text-slate-950 outline-none"
                            inputMode="decimal"
                            value={line.unitCost}
                            onChange={(event) =>
                              updateLine(line.key, "unitCost", event.target.value)
                            }
                          />
                        </span>
                      </Field>
                    )}
                  </div>

                  <details className="mt-3 rounded-lg border border-slate-300 bg-white p-3">
                    <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700">
                      Correct product details manually
                    </summary>
                    <div className="mt-2 grid gap-3 sm:grid-cols-3">
                      <Field label="Product description">
                        <input
                          className={input}
                          value={line.description}
                          onChange={(event) =>
                            updateLine(
                              line.key,
                              "description",
                              event.target.value,
                            )
                          }
                        />
                      </Field>
                      <Field label="Purchase unit">
                        <input
                          className={input}
                          value={line.unit}
                          onChange={(event) =>
                            updateLine(line.key, "unit", event.target.value)
                          }
                        />
                      </Field>
                      <Field label="Price source">
                        <input
                          className={input}
                          value={line.sourceReference}
                          onChange={(event) =>
                            updateLine(
                              line.key,
                              "sourceReference",
                              event.target.value,
                            )
                          }
                        />
                      </Field>
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
          <section className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
            <p className="text-xs font-black uppercase tracking-wide text-emerald-800">
              Finish material estimate
            </p>
            <div className="mt-2 space-y-2">
              {customFinishLines.map((line) => (
                <div
                  key={`${line.key}-subtotal`}
                  className="flex items-start justify-between gap-3 text-sm"
                >
                  <span>{line.description || line.key.replaceAll("_", " ")}</span>
                  <strong className="whitespace-nowrap">
                    {finishLineTotal(line) > 0
                      ? `$${finishLineTotal(line).toFixed(2)}`
                      : "Needs price"}
                  </strong>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-end justify-between gap-3 border-t border-emerald-300 pt-3">
              <span className="font-black">Selected finish subtotal</span>
              <span className="text-2xl font-black">
                ${customFinishMaterialSubtotal.toFixed(2)}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-emerald-800">
              This includes only the reviewed decking and railing materials shown
              above. Framing, hardware, labor, tax, waste not already included,
              overhead, and profit remain separate.
            </p>
          </section>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className={`w-full ${secondary}`}
              disabled={
                disabled ||
                pending ||
                finishDraftLoading ||
                !savedCustomPlan
              }
              onClick={() => void saveWorkingFinishSelection()}
            >
              {finishDraftLoading
                ? "Loading saved selections…"
                : pending
                  ? "Saving…"
                  : finishDraftRevision
                    ? "Save updated working costs"
                    : "Save working materials and costs"}
            </button>
            <button
              type="button"
              className={`w-full ${primary}`}
              disabled={
                disabled ||
                pending ||
                finishDraftLoading ||
                !savedCustomPlan ||
                !customFinishMaterialsReady
              }
              onClick={() => void addFinishMaterialsToEstimate()}
            >
              {pending
                ? "Adding finish costs…"
                : customFinishMaterialsReady
                  ? `Add $${customFinishMaterialSubtotal.toFixed(2)} finish materials to estimate`
                  : "Complete quantities and prices above"}
            </button>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-300">
            Saving keeps these selections and working prices available after a
            refresh. The second button adds only the complete finish-material
            subtotal now; it does not wait for framing or labor.
          </p>
        </section>
      ) : null}

      {!customApprovedFootprint ? (
        <section className="mt-5 rounded-lg border border-blue-200 bg-white p-4">
        <h4 className="font-black text-slate-950">
          Matching Lowe&apos;s product package
        </h4>
        <p className="mt-1 text-sm text-slate-600">
          These results match the selected finish families. Board lengths are
          optimized to avoid joints; when a joint is unavoidable, the takeoff
          uses the approved picture-frame and divider layout.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {recommendedProducts.map((product) => {
            const lowesPage =
              product.source.startsWith("https://www.lowes.com/") ||
              product.source.startsWith("https://lowes.com/");
            const priced = Number(product.cost) > 0;
            return (
              <article
                key={product.key}
                className={`rounded-lg border p-3 ${priced ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}
              >
                <p className="text-xs font-black uppercase tracking-wide text-slate-600">
                  {product.label}
                </p>
                <p className="mt-1 text-sm font-bold text-slate-950">
                  {product.description}
                </p>
                {lowesPage ? (
                  <a
                    className="mt-2 inline-block min-h-11 py-2 text-sm font-bold text-blue-800 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                    href={product.source}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Lowe&apos;s product and check price
                  </a>
                ) : null}
                {product.source ? (
                  <label className="mt-2 block text-sm font-bold text-slate-900">
                    <span>{product.priceLabel}</span>
                    <span className="mt-1 flex items-center rounded-md border border-slate-300 bg-white focus-within:border-emerald-700 focus-within:ring-2 focus-within:ring-emerald-100">
                      <span className="pl-3 text-slate-600">$</span>
                      <input
                        aria-label={product.priceLabel}
                        className="min-h-11 w-full rounded-md bg-transparent px-2 py-2 text-slate-950 outline-none"
                        inputMode="decimal"
                        value={product.cost}
                        onChange={(event) => {
                          product.setCost(event.target.value);
                          setPreview(null);
                        }}
                      />
                    </span>
                  </label>
                ) : (
                  <p className="mt-2 text-sm font-bold text-amber-900">
                    Find a Lowe&apos;s product to continue.
                  </p>
                )}
                <p
                  className={`mt-2 text-xs font-bold ${priced ? "text-emerald-800" : "text-amber-900"}`}
                >
                  {priced
                    ? `Price ready: $${product.cost}`
                    : product.source
                      ? "Enter the current price shown on the Lowe's page."
                      : "Product and price still needed."}
                </p>
              </article>
            );
          })}
        </div>
        {missingRequiredPrices.length ? (
          <div
            role="status"
            className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
          >
            <p className="font-black">Before continuing</p>
            <p className="mt-1">
              Enter the current {missingRequiredPrices.join(" and ")} in the
              cards above. The Lowe&apos;s links are already saved as the price
              sources.
            </p>
          </div>
        ) : null}
        <button
          type="button"
          className={`mt-4 w-full ${primary}`}
          disabled={disabled || pending || missingRequiredPrices.length > 0}
          onClick={() => void requestPreview()}
        >
          {pending
            ? "Calculating…"
            : missingRequiredPrices.length
              ? `Enter ${missingRequiredPrices.length} missing price${missingRequiredPrices.length === 1 ? "" : "s"} to continue`
              : "Calculate quantities and costs"}
        </button>
        {productCombinations.length ? (
          <section className="mt-4 border-t border-slate-200 pt-4">
            <h5 className="font-black text-slate-950">
              Compare deck-board and railing combinations
            </h5>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              These are material-only comparisons. Labor, framing, tax, and
              OH&amp;P are added by the complete estimate before anything is
              shown to the customer.
            </p>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {productCombinations.slice(0, 6).map((option, index) => (
                <article
                  key={`${option.board.sourceUrl}:${option.railing?.sourceUrl ?? "no-rail"}`}
                  className="rounded-lg border border-slate-300 bg-slate-50 p-3"
                >
                  <p className="text-xs font-black uppercase tracking-wide text-blue-800">
                    Option {index + 1}
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-950">
                    {option.board.description}
                  </p>
                  <p className="mt-1 text-xs text-slate-700">
                    {option.railing?.description ??
                      "No railing system required"}
                  </p>
                  <p className="mt-2 text-xs font-bold text-slate-700">
                    Decking price: {estimatingPriceLabel(option.board)}
                    {option.railing
                      ? ` · Railing price: ${estimatingPriceLabel(option.railing)}`
                      : ""}
                  </p>
                  {option.railing?.manufacturer &&
                  option.railing.productLine ? (
                    <p className="mt-2 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-950">
                      Compatible system: {option.railing.manufacturer} ·{" "}
                      {option.railing.productLine}
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm font-black text-slate-950">
                    Known materials:{" "}
                    {option.materialSubtotal > 0
                      ? `$${option.materialSubtotal.toFixed(2)}`
                      : "prices incomplete"}
                  </p>
                  <button
                    type="button"
                    className={`mt-3 w-full ${primary}`}
                    onClick={() => {
                      setPlan(option.optionPlan);
                      setPreview(null);
                      setNotice(
                        `Option ${index + 1} selected. Calculate the takeoff to verify every quantity and cost.`,
                      );
                    }}
                  >
                    Use this combination
                  </button>
                </article>
              ))}
            </div>
          </section>
        ) : null}
        </section>
      ) : null}

      <details
        className="mt-5 rounded-lg border border-slate-300 bg-white p-4"
        open={workflowPhase === "takeoff" && !takeoffApplied}
      >
        <summary className="min-h-11 cursor-pointer py-2 font-black text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700">
          Complete framing, hardware, labor, and remaining costs
        </summary>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Finish materials can be saved first, but they do not make a complete
          estimate. Review each required category here and enter only quantities
          and costs supported by the framing plan, a quote, or your company cost
          records.
        </p>
        {completeRebuildScope}
      </details>

      <details className="mt-4 rounded-lg border border-slate-300 bg-white p-4">
        <summary className="min-h-11 cursor-pointer font-black text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700">
          Change products, costs, or advanced quantities
        </summary>

        {!customApprovedFootprint ? (
          <div className="mt-4 rounded-lg bg-slate-50 p-4">
          <h4 className="font-black text-slate-950">1. Decking calculation</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Actual board width (inches)">
              <input
                className={input}
                inputMode="decimal"
                value={plan.boardActualWidthInches}
                onChange={(e) => {
                  setPlan({ ...plan, boardActualWidthInches: e.target.value });
                  setPreview(null);
                }}
              />
            </Field>
            <Field label="Board gap (inches)">
              <input
                className={input}
                inputMode="decimal"
                value={plan.boardGapInches}
                onChange={(e) => {
                  setPlan({ ...plan, boardGapInches: e.target.value });
                  setPreview(null);
                }}
              />
            </Field>
            <Field
              label="Stock board length (feet)"
              help="Full-length boards are preferred. Shorter boards are allowed only when two pieces reach the run and a picture-frame center divider is included."
            >
              <input
                className={input}
                inputMode="decimal"
                value={plan.boardStockLengthFeet}
                onChange={(e) => {
                  setPlan({ ...plan, boardStockLengthFeet: e.target.value });
                  setPreview(null);
                }}
              />
            </Field>
            <Field label="Waste (%)">
              <input
                className={input}
                inputMode="decimal"
                value={plan.boardWastePercent}
                onChange={(e) => {
                  setPlan({ ...plan, boardWastePercent: e.target.value });
                  setPreview(null);
                }}
              />
            </Field>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <Field label="Exact catalog product">
              <select
                className={input}
                value={plan.boardCatalogMaterialId ?? ""}
                onChange={(e) => chooseCatalog("board", e.target.value)}
              >
                <option value="">Enter verified cost manually</option>
                {catalogOptions("board").map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.description} · $
                    {material.effective_unit_cost ?? "?"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Unit cost">
              <input
                className={input}
                inputMode="decimal"
                value={plan.boardUnitCost}
                onChange={(e) => {
                  setPlan({
                    ...plan,
                    boardUnitCost: e.target.value,
                    boardCatalogMaterialId: null,
                  });
                  setPreview(null);
                }}
              />
            </Field>
            <Field
              label="Price source"
              help="Lowe's product URL, quote number, or another traceable reference."
            >
              <input
                className={input}
                value={plan.boardSourceReference}
                onChange={(e) => {
                  setPlan({
                    ...plan,
                    boardSourceReference: e.target.value,
                    boardCatalogMaterialId: null,
                  });
                  setPreview(null);
                }}
              />
            </Field>
          </div>
          </div>
        ) : null}

        <div className="mt-4 rounded-lg bg-slate-50 p-4">
          <h4 className="font-black text-slate-950">
            2. Deck-board fasteners (required)
          </h4>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <Field
              label="Coverage per package (sq ft)"
              help="Use the fastener manufacturer's installation guidance."
            >
              <input
                className={input}
                inputMode="decimal"
                value={plan.screwCoverageSquareFeetPerPack}
                onChange={(e) => {
                  setPlan({
                    ...plan,
                    screwCoverageSquareFeetPerPack: e.target.value,
                  });
                  setPreview(null);
                }}
              />
            </Field>
            <Field label="Exact catalog product">
              <select
                className={input}
                value={plan.screwCatalogMaterialId ?? ""}
                onChange={(e) => chooseCatalog("screw", e.target.value)}
              >
                <option value="">Enter verified cost manually</option>
                {catalogOptions("screw").map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.description} · $
                    {material.effective_unit_cost ?? "?"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Package cost">
              <input
                className={input}
                inputMode="decimal"
                value={plan.screwPackUnitCost}
                onChange={(e) => {
                  setPlan({
                    ...plan,
                    screwPackUnitCost: e.target.value,
                    screwCatalogMaterialId: null,
                  });
                  setPreview(null);
                }}
              />
            </Field>
            <Field label="Price source">
              <input
                className={input}
                value={plan.screwSourceReference}
                onChange={(e) => {
                  setPlan({
                    ...plan,
                    screwSourceReference: e.target.value,
                    screwCatalogMaterialId: null,
                  });
                  setPreview(null);
                }}
              />
            </Field>
          </div>
        </div>

        {!customApprovedFootprint ? (
          <div className="mt-4 rounded-lg bg-slate-50 p-4">
          <h4 className="font-black text-slate-950">3. Automatic railing</h4>
          <p className="mt-1 text-sm text-slate-600">
            The app uses the rectangular deck perimeter, removes the house side
            when attached, and subtracts the verified stair opening. You review
            the result before it becomes an estimate line.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <Field label="Railing section length (feet)">
              <input
                className={input}
                inputMode="decimal"
                value={plan.railingSectionLengthFeet}
                onChange={(e) => {
                  setPlan({
                    ...plan,
                    railingSectionLengthFeet: e.target.value,
                  });
                  setPreview(null);
                }}
              />
            </Field>
            <Field label="Exact catalog product">
              <select
                className={input}
                value={plan.railingCatalogMaterialId ?? ""}
                onChange={(e) => chooseCatalog("railing", e.target.value)}
              >
                <option value="">Use verified Lowe&apos;s result</option>
                {catalogOptions("railing").map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.description} · $
                    {material.effective_unit_cost ?? "?"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Section cost">
              <input
                className={input}
                inputMode="decimal"
                value={plan.railingUnitCost}
                onChange={(e) => {
                  setPlan({
                    ...plan,
                    railingUnitCost: e.target.value,
                    railingCatalogMaterialId: null,
                  });
                  setPreview(null);
                }}
              />
            </Field>
            <Field label="Price source">
              <input
                className={input}
                value={plan.railingSourceReference}
                onChange={(e) => {
                  setPlan({
                    ...plan,
                    railingSourceReference: e.target.value,
                    railingCatalogMaterialId: null,
                  });
                  setPreview(null);
                }}
              />
            </Field>
          </div>
          </div>
        ) : null}
      </details>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-900"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-900"
        >
          {notice}
        </p>
      ) : null}
      {preview ? (
        <section className="mt-5 rounded-lg border border-slate-300 bg-white p-4">
          <h4 className="text-lg font-black text-slate-950">
            Review before adding costs
          </h4>
          <p className="mt-1 text-sm text-slate-700">
            Verified deck area:{" "}
            {preview.deckAreaSquareFeet
              ? `${preview.deckAreaSquareFeet} sq ft`
              : "not available"}
          </p>
          {preview.deckingLayout ? (
            <p className="mt-1 text-sm font-bold text-slate-800">
              Board layout:{" "}
              {preview.deckingLayout === "seamless"
                ? "Full-length boards · no field joints"
                : preview.deckingLayout === "picture_frame_divider"
                  ? "Picture frame + center divider · no unsupported butt joints"
                  : "Reviewed custom-footprint board layout"}
            </p>
          ) : null}
          {preview.railingLengthFeet ? (
            <p className="mt-1 text-sm font-bold text-slate-800">
              Calculated railing: {preview.railingLengthFeet} linear ft
            </p>
          ) : null}
          {preview.lines.length ? (
            <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-emerald-950">
              <p className="text-xs font-black uppercase tracking-wide">
                Priced so far
              </p>
              <p className="mt-1 text-2xl font-black">
                ${preview.lines
                  .reduce(
                    (total, line) =>
                      total + Number(line.quantity) * Number(line.unitCost),
                    0,
                  )
                  .toFixed(2)}
              </p>
              {preview.status !== "ready" ? (
                <p className="mt-1 text-xs font-semibold">
                  This is a working subtotal. It is not added to the estimate
                  until the remaining required takeoff inputs are complete.
                </p>
              ) : null}
            </div>
          ) : null}
          {preview.unresolved.length ? (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="font-bold text-amber-950">Still needs input</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-950">
                {preview.unresolved.map((value) => (
                  <li key={value}>{value}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-3 space-y-2">
            {preview.lines.map((line) => (
              <details
                key={line.key}
                className="rounded-lg border border-slate-200 p-3"
              >
                <summary className="min-h-11 cursor-pointer font-bold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
                  {line.customerDescription}: {line.quantity} {line.unit} × $
                  {line.unitCost}
                </summary>
                <p className="mt-2 text-sm text-slate-700">{line.formula}</p>
                <p className="mt-1 break-all text-xs text-slate-600">
                  Cost source: {line.sourceReference}
                </p>
              </details>
            ))}
          </div>
          {preview.status === "ready" ? (
            <div className="mt-4 space-y-3">
              {[
                [
                  "dimensions",
                  "I reviewed the field dimensions used by this takeoff.",
                ],
                [
                  "quantities",
                  "I reviewed the build-plan quantities and formulas.",
                ],
                ["prices", "I reviewed every true cost and its source."],
              ].map(([key, label]) => (
                <label
                  key={key}
                  className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm font-bold text-slate-900"
                >
                  <input
                    type="checkbox"
                    checked={checks[key as keyof typeof checks]}
                    onChange={(e) =>
                      setChecks({ ...checks, [key]: e.target.checked })
                    }
                  />
                  {label}
                </label>
              ))}
              <button
                type="button"
                className={`w-full ${primary}`}
                disabled={
                  disabled ||
                  pending ||
                  !checks.dimensions ||
                  !checks.quantities ||
                  !checks.prices
                }
                onClick={() => void applyTakeoff()}
              >
                {pending ? "Adding…" : "Add reviewed takeoff to estimate"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
