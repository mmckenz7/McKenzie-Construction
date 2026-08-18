"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { DeckPrescriptivePlanGenerator } from "@/components/estimates/deck-prescriptive-plan-generator";
import type { FinalizedDeckShape } from "@/components/estimates/deck-shape-review";
import type { EstimateBuilderEnvelope } from "@/lib/estimate-builder-client";
import {
  deckShapeStructuralHandoff,
  type DeckPrescriptivePlan,
} from "@/lib/deck-prescriptive-plan";
import {
  buildDeckTakeoffPreview,
  COMPLETE_REBUILD_LINE_KEYS,
  completeRebuildScopeRequirement,
  deckBlueprintVisitSeed,
  deckFieldDimensions,
  deckRailingGeometry,
  deckShapeBindingMatches,
  deckStructuralLineIsComplete,
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
  kind: "deck_board" | "deck_fastener" | "railing_section";
  description: string;
  unitCost: number | null;
  sourceUrl: string;
  stockLengthFeet: number | null;
  coverageSquareFeetPerPack: number | null;
  reason: string;
};

const input =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100";
const primary =
  "min-h-11 rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

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
  onStructureReady: () => void;
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
  const [activeScopeKey, setActiveScopeKey] = useState<CompleteRebuildLineKey>(
    COMPLETE_REBUILD_LINE_KEYS[0],
  );
  const appliedDefaults = useRef(false);
  const layoutDetailsRef = useRef<HTMLDetailsElement>(null);
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

  useEffect(() => {
    if (!approvedShape) return;
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
        "custom_railing",
      ]);
      return {
        ...current,
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
    onStructureReady();
  }

  async function findLowesProducts() {
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
          }),
        },
      );
      const body = (await response.json()) as {
        success?: boolean;
        products?: LowesSuggestion[];
        error?: string;
      };
      if (!response.ok || !body.success || !body.products?.length)
        throw new Error(body.error || "Lowe's defaults could not be found.");
      setSuggestions(body.products);
      const board = body.products.find((item) => item.kind === "deck_board");
      const screw = body.products.find((item) => item.kind === "deck_fastener");
      const railing = body.products.find(
        (item) => item.kind === "railing_section",
      );
      setPlan((current) => {
        return {
          ...current,
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
                railingSectionLengthFeet: railing.stockLengthFeet
                  ? String(railing.stockLengthFeet)
                  : current.railingSectionLengthFeet,
                railingUnitCost: railing.unitCost
                  ? String(railing.unitCost)
                  : "",
                railingSourceReference: railing.sourceUrl,
              }
            : {}),
        };
      });
      setPreview(null);
      const missingPrices = [
        board && !board.unitCost ? "deck-board" : null,
        railingGeometry.railingsPresent && railing && !railing.unitCost
          ? "railing"
          : null,
      ].filter(Boolean);
      setNotice(
        missingPrices.length
          ? `Products found. Enter the current Lowe's ${missingPrices.join(" and ")} price${missingPrices.length === 1 ? "" : "s"} shown on the linked product page, then continue.`
          : "Products and required prices are ready. Continue to calculate quantities and costs.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Lowe's defaults could not be found.",
      );
    } finally {
      setFindingProducts(false);
    }
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
  const recommendedProducts = [
    {
      key: "board",
      label: "Deck boards",
      priceLabel: "Current price per board",
      description:
        selectedBoard?.description ??
        suggestionByKind.get("deck_board")?.description ??
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
      priceLabel: "Current price per box",
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
      priceLabel: "Current price per railing section",
      description:
        selectedRailing?.description ??
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
    (item) => item.kind === "deck_board",
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

  const activeScopeIndex = COMPLETE_REBUILD_LINE_KEYS.indexOf(activeScopeKey);
  const activeScopeLine =
    plan.additionalLines.find((line) => line.key === activeScopeKey) ??
    plan.additionalLines[0];
  const activeScopeRequirement = completeRebuildScopeRequirement(
    activeScopeKey,
    visitItems,
  );
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

  const completeRebuildScope = (
    <section className="mt-5 rounded-lg border-2 border-amber-400 bg-white p-4">
      <p className="text-xs font-black uppercase tracking-[.16em] text-amber-800">
        Required before calculation
      </p>
      <h4 className="mt-1 font-black text-slate-950">
        Complete-rebuild scope and planned quantities
      </h4>
      <p className="mt-1 text-sm text-slate-600">
        Complete the checklist one category at a time. Core rebuild work is
        required. Only delivery, equipment, and conditionally non-applicable
        ledger or stairs may be marked outside this estimate.
      </p>
      <label
        className={`mt-3 flex min-h-11 items-start gap-3 rounded-md border p-3 text-sm font-bold focus-within:ring-2 focus-within:ring-blue-700 ${plan.completeRebuildConfirmed ? "border-emerald-500 bg-emerald-50 text-emerald-950" : "border-amber-400 bg-amber-50 text-amber-950"}`}
      >
        <input
          className="mt-1"
          type="checkbox"
          checked={plan.completeRebuildConfirmed}
          onChange={(event) => {
            setPlan({
              ...plan,
              completeRebuildConfirmed: event.target.checked,
            });
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
        <Field label="Scope category">
          <select
            className={input}
            value={activeScopeKey}
            onChange={(event) =>
              setActiveScopeKey(event.target.value as CompleteRebuildLineKey)
            }
          >
            {plan.additionalLines.map((line) => (
              <option key={line.key} value={line.key}>
                {scopeLineComplete(line.key as CompleteRebuildLineKey)
                  ? "✓ "
                  : ""}
                {line.description}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {activeScopeLine ? (
        <fieldset className="mt-3 rounded-lg border border-slate-300 p-3">
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
          <Field label="Estimate scope">
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
              <option value="include">Include in this estimate</option>
              {activeScopeRequirement === "optional" ? (
                <option value="not_in_scope">Not in this estimate</option>
              ) : null}
            </select>
          </Field>
          {plan.scopeDecisions[activeScopeKey] === "include" ? (
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
                setActiveScopeKey(
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
                setActiveScopeKey(
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
    ...(railingGeometry.railingsPresent ? ["custom_railing"] : []),
  ];
  const customStructuralLines = customReviewedQuantityKeys
    .map((key) => plan.additionalLines.find((line) => line.key === key))
    .filter((line): line is FixedLine => Boolean(line));
  const customFinishLines = [
    plan.additionalLines.find((line) => line.key === "custom_decking"),
    ...(railingGeometry.railingsPresent
      ? [plan.additionalLines.find((line) => line.key === "custom_railing")]
      : []),
  ].filter((line): line is FixedLine => Boolean(line));
  const customStructuralPlanComplete =
    plan.buildPlanReference.trim().length > 0 &&
    plan.buildPlanConfirmed &&
    customStructuralLines.length === customReviewedQuantityKeys.length &&
    customStructuralLines.every(deckStructuralLineIsComplete);
  const activeCustomStructuralLine = customStructuralLines.find(
    (line) => line.key === activeScopeKey,
  ) ?? customStructuralLines[0];

  const customStructuralDesigner = (
    <section className="mt-5 rounded-xl border-2 border-emerald-700 bg-white p-4 sm:p-5">
      <p className="text-xs font-black uppercase tracking-[.16em] text-emerald-800">
        Approved custom footprint
      </p>
      <h4 className="mt-1 text-lg font-black text-slate-950">
        The inset shape and stair location are saved
      </h4>
      <p className="mt-2 rounded-lg bg-emerald-50 p-3 text-sm font-bold leading-6 text-emerald-950">
        You do not need to redraw the deck or place the stairs again. This
        footprint is nonrectangular, so the rectangular prescriptive table is
        not being stretched over it. Enter the quantities from a reviewed
        framing plan that was prepared for this exact saved shape.
      </p>
      <div className="mt-4 rounded-lg border border-slate-300 bg-slate-50 p-3">
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
        <label className="mt-3 flex min-h-11 items-start gap-3 rounded-md border border-slate-300 bg-white p-3 text-sm font-bold text-slate-950 focus-within:ring-2 focus-within:ring-emerald-700">
          <input
            className="mt-1"
            type="checkbox"
            checked={plan.buildPlanConfirmed}
            onChange={(event) =>
              setPlan((current) => ({
                ...current,
                buildPlanConfirmed: event.target.checked,
              }))
            }
          />
          I verified that this framing plan matches the saved inset shape and
          stair location. The app is recording its quantities, not inventing a
          rectangular substitute.
        </label>
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
            <Field
              label="Unit cost"
              help="This can be finished in Takeoff after the structural plan is approved."
            >
              <input
                className={input}
                inputMode="decimal"
                value={activeCustomStructuralLine.unitCost}
                onChange={(event) =>
                  updateLine(
                    activeCustomStructuralLine.key,
                    "unitCost",
                    event.target.value,
                  )
                }
              />
            </Field>
            <Field
              label="Price/source reference"
              help="Required before the takeoff can become customer-ready."
            >
              <input
                className={input}
                value={activeCustomStructuralLine.sourceReference}
                onChange={(event) =>
                  updateLine(
                    activeCustomStructuralLine.key,
                    "sourceReference",
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
        disabled={disabled || !customStructuralPlanComplete}
        onClick={() => {
          setPlan((current) => ({
            ...current,
            framingPlanEvidence: null,
            stairPlacementConfirmed:
              approvedShapeStairPlacementConfirmed,
            scopeDecisions: {
              ...current.scopeDecisions,
              ...Object.fromEntries(
                customStructuralKeys.map((key) => [key, "include"]),
              ),
              ...(railingGeometry.attached === false
                ? { ledger_attachment: "not_in_scope" as const }
                : {}),
              ...(!approvedStairsPresent
                ? { stairs: "not_in_scope" as const }
                : {}),
            },
          }));
          setNotice(
            "The reviewed custom structural plan is recorded. Continue to takeoff and pricing.",
          );
          onStructureReady();
        }}
      >
        Approve reviewed structural plan and continue to takeoff
      </button>
      {!customStructuralPlanComplete ? (
        <p className="mt-2 text-sm font-bold text-amber-900">
          Add the reviewed plan source, confirm it matches this shape, and
          enter each required structural quantity.
        </p>
      ) : null}
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
      <section className="mt-5 rounded-xl border-2 border-violet-700 bg-violet-50 p-4 sm:p-5">
        <p className="text-xs font-black uppercase tracking-[.16em] text-violet-800">
          Structural design only
        </p>
        <h3 className="mt-1 text-xl font-black text-slate-950">
          Build one complete structural plan
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          Work through framing, supports, footings, stairs, railing and attachment here. Material shopping, quantities, Lowe&apos;s products and prices begin only after this plan is approved.
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
    <section className="mt-5 rounded-xl border-2 border-blue-700 bg-blue-50 p-4 sm:p-5">
      <p className="text-xs font-black uppercase tracking-[.16em] text-blue-800">
        Draft material takeoff
      </p>
      <h3 className="mt-1 text-xl font-black text-slate-950">
        Turn field measurements into reviewed true costs
      </h3>
      <p className="mt-2 text-sm leading-6 text-slate-700">
        {customApprovedFootprint
          ? "This is a complete-rebuild takeoff for the exact saved custom footprint. Its reviewed decking and railing quantities are priced below; rectangular board and railing calculators do not apply."
          : "This is a complete-rebuild takeoff: old decking, framing, supports, and footings are not being reused. The app can calculate deck area, decking layout, and a reviewed rectangular railing perimeter. Every structural member, footing, connector, stair, labor, and logistics quantity must come from your named build plan."}
      </p>

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

      {completeRebuildScope}

      {customApprovedFootprint ? (
        <section className="mt-5 rounded-lg border-2 border-blue-300 bg-white p-4">
          <h4 className="font-black text-slate-950">
            Price the reviewed custom-footprint finishes
          </h4>
          <p className="mt-1 text-sm leading-6 text-slate-700">
            These quantities came from the reviewed custom plan. Add the exact
            product description, current unit cost, and traceable price source.
            The app will not substitute a rectangular deck-board or railing
            calculation.
          </p>
          <div className="mt-3 space-y-3">
            {customFinishLines.map((line) => (
              <article
                key={line.key}
                className="rounded-lg border border-slate-300 bg-slate-50 p-3"
              >
                <p className="font-black text-slate-950">
                  {line.key === "custom_decking"
                    ? "Custom-footprint decking"
                    : "Custom-footprint railing"}
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <Field label="Product description">
                    <input
                      className={input}
                      value={line.description}
                      onChange={(event) =>
                        updateLine(line.key, "description", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Reviewed quantity">
                    <input
                      className={input}
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(event) =>
                        updateLine(line.key, "quantity", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Unit">
                    <input
                      className={input}
                      value={line.unit}
                      onChange={(event) =>
                        updateLine(line.key, "unit", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Unit cost">
                    <input
                      className={input}
                      inputMode="decimal"
                      value={line.unitCost}
                      onChange={(event) =>
                        updateLine(line.key, "unitCost", event.target.value)
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
              </article>
            ))}
          </div>
          <button
            type="button"
            className={`mt-4 w-full ${primary}`}
            disabled={disabled || pending}
            onClick={() => void requestPreview()}
          >
            {pending ? "Calculating…" : "Calculate custom quantities and costs"}
          </button>
        </section>
      ) : null}

      {!customApprovedFootprint ? (
        <section className="mt-5 rounded-lg border border-blue-200 bg-white p-4">
        <h4 className="font-black text-slate-950">
          Recommended Lowe&apos;s package
        </h4>
        <p className="mt-1 text-sm text-slate-600">
          The shortest full-length board wins. If no board spans the run, the
          only automatic fallback is a perimeter picture frame with a center
          divider.
        </p>
        <button
          type="button"
          className={`mt-3 w-full ${primary}`}
          disabled={disabled || findingProducts}
          onClick={() => void findLowesProducts()}
        >
          {findingProducts ? "Searching Lowe's…" : "Find Lowe's defaults"}
        </button>
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
