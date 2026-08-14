"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { DeckPlanVisual } from "@/components/estimates/deck-plan-visual";
import type { EstimateBuilderEnvelope } from "@/lib/estimate-builder-client";
import { buildDeckTakeoffPreview, deckFieldDimensions, deckRailingGeometry, type DeckObservationItem, type DeckTakeoffPlan, type DeckTakeoffPreview } from "@/lib/deck-takeoff-v0";

type CatalogMaterial = {
  id: string;
  category?: string;
  description: string;
  unit?: string;
  effective_unit_cost?: number;
  selected_price?: { source_reference?: string | null; suppliers?: { name?: string } | null; supplier_locations?: { name?: string; store_number?: string } | null } | null;
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

const input = "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100";
const primary = "min-h-11 rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const INITIAL_LINES: FixedLine[] = [
  { key: "joists", category: "material", description: "Planned joists", quantity: "", unit: "ea", unitCost: "", catalogMaterialId: null, sourceReference: "" },
  { key: "beams", category: "material", description: "Planned beam lumber", quantity: "", unit: "ln ft", unitCost: "", catalogMaterialId: null, sourceReference: "" },
  { key: "posts", category: "material", description: "Planned posts", quantity: "", unit: "ea", unitCost: "", catalogMaterialId: null, sourceReference: "" },
  { key: "concrete", category: "material", description: "Concrete mix", quantity: "", unit: "bag", unitCost: "", catalogMaterialId: null, sourceReference: "" },
  { key: "stairs", category: "material", description: "Stair materials", quantity: "", unit: "allowance", unitCost: "", catalogMaterialId: null, sourceReference: "" },
  { key: "labor", category: "labor", description: "Deck construction labor", quantity: "", unit: "hr", unitCost: "", catalogMaterialId: null, sourceReference: "" },
  { key: "disposal", category: "other", description: "Demolition and disposal", quantity: "", unit: "allowance", unitCost: "", catalogMaterialId: null, sourceReference: "" },
];

function defaultPlan(): DeckTakeoffPlan {
  return {
    boardRunDirection: "along_length",
    stairEdge: "right",
    stairPosition: "end",
    stairPlacementConfirmed: false,
    boardActualWidthInches: "5.5", boardGapInches: "0.125", boardStockLengthFeet: "",
    boardWastePercent: "10", boardCatalogMaterialId: null, boardUnitCost: "", boardSourceReference: "",
    screwCoverageSquareFeetPerPack: "", screwCatalogMaterialId: null, screwPackUnitCost: "", screwSourceReference: "",
    railingSectionLengthFeet: "", railingCatalogMaterialId: null, railingUnitCost: "", railingSourceReference: "",
    additionalLines: INITIAL_LINES,
  };
}

function Field({ label, children, help }: { label: string; children: React.ReactNode; help?: string }) {
  return <label className="block text-sm font-bold text-slate-800"><span>{label}</span>{children}{help ? <span className="mt-1 block text-xs font-normal leading-5 text-slate-600">{help}</span> : null}</label>;
}

function sourceLabel(material: CatalogMaterial) {
  const supplier = material.selected_price?.suppliers?.name ?? "Catalog";
  const location = material.selected_price?.supplier_locations;
  return `${supplier}${location?.store_number ? ` store ${location.store_number}` : location?.name ? ` · ${location.name}` : ""}`;
}

export function DeckTakeoffPlanner({
  estimateId, visitId, visitRevision, visitItems, calculationRevision, takeoffApplied, disabled, onApplied,
}: {
  estimateId: string;
  visitId: string;
  visitRevision: number;
  visitItems: readonly DeckObservationItem[];
  calculationRevision: number;
  takeoffApplied: boolean;
  disabled: boolean;
  onApplied: (state: EstimateBuilderEnvelope) => void;
}) {
  const [plan, setPlan] = useState<DeckTakeoffPlan>(defaultPlan);
  const [catalog, setCatalog] = useState<CatalogMaterial[]>([]);
  const [preview, setPreview] = useState<DeckTakeoffPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checks, setChecks] = useState({ dimensions: false, quantities: false, prices: false });
  const [suggestions, setSuggestions] = useState<LowesSuggestion[]>([]);
  const [findingProducts, setFindingProducts] = useState(false);
  const appliedDefaults = useRef(false);
  const dimensions = useMemo(() => deckFieldDimensions(visitItems), [visitItems]);
  const railingGeometry = useMemo(() => deckRailingGeometry(visitItems), [visitItems]);

  function productLengthFeet(description: string) {
    const matches = [...description.matchAll(/(?:^|\s|x|-)(\d+(?:\.\d+)?)\s*(?:ft|foot|feet)(?:\b|-)/gi)];
    return matches.length ? Number(matches.at(-1)?.[1]) : null;
  }

  function isLowes(material: CatalogMaterial) {
    return (material.selected_price?.suppliers?.name ?? "").toLowerCase().includes("lowe");
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/material-catalog?active=true&includePrices=true", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { materials?: CatalogMaterial[] };
        if (!response.ok) throw new Error();
        if (active) setCatalog(body.materials ?? []);
      })
      .catch(() => { if (active) setNotice("The catalog could not be loaded. You can still enter a verified cost and source manually."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (appliedDefaults.current || !catalog.length) return;
    const pricedLowes = catalog.filter((material) => isLowes(material) && Number(material.effective_unit_cost) > 0);
    const boardCandidates = pricedLowes
      .map((material) => ({ material, length: productLengthFeet(material.description) }))
      .filter((entry): entry is { material: CatalogMaterial; length: number } =>
        Boolean(entry.length) && /deck.*board|decking/i.test(entry.material.description));
    const run = plan.boardRunDirection === "along_width" ? dimensions.widthFeet : dimensions.lengthFeet;
    const board = run
      ? [...boardCandidates].sort((a, b) => {
          const aFits = a.length >= run ? 0 : a.length * 2 >= run ? 1 : 2;
          const bFits = b.length >= run ? 0 : b.length * 2 >= run ? 1 : 2;
          return aFits - bFits || Math.abs(a.length - run) - Math.abs(b.length - run) || Number(a.material.effective_unit_cost) - Number(b.material.effective_unit_cost);
        })[0]
      : boardCandidates.sort((a, b) => b.length - a.length)[0];
    const screw = pricedLowes.find((material) => /deck.*(?:screw|fastener)|(?:screw|fastener).*deck/i.test(material.description));
    const railing = pricedLowes
      .map((material) => ({ material, length: productLengthFeet(material.description) }))
      .filter((entry): entry is { material: CatalogMaterial; length: number } => Boolean(entry.length) && /rail/i.test(entry.material.description))
      .sort((a, b) => b.length - a.length)[0];
    if (!board && !screw && !railing) return;
    const pricedSource = (material: CatalogMaterial) => material.selected_price?.source_reference || `catalog:${material.id}:${sourceLabel(material)}`;
    setPlan((current) => ({
      ...current,
      ...(board ? {
        boardStockLengthFeet: String(board.length),
        boardCatalogMaterialId: board.material.id,
        boardUnitCost: String(board.material.effective_unit_cost),
        boardSourceReference: pricedSource(board.material),
      } : {}),
      ...(screw ? {
        screwCatalogMaterialId: screw.id,
        screwPackUnitCost: String(screw.effective_unit_cost),
        screwSourceReference: pricedSource(screw),
      } : {}),
      ...(railing ? {
        railingSectionLengthFeet: String(railing.length),
        railingCatalogMaterialId: railing.material.id,
        railingUnitCost: String(railing.material.effective_unit_cost),
        railingSourceReference: pricedSource(railing.material),
      } : {}),
    }));
    appliedDefaults.current = true;
  }, [catalog, dimensions.lengthFeet, dimensions.widthFeet, plan.boardRunDirection]);

  const catalogById = useMemo(() => new Map(catalog.map((material) => [material.id, material])), [catalog]);

  function chooseCatalog(target: "board" | "screw" | string, id: string) {
    const material = catalogById.get(id);
    const cost = material?.effective_unit_cost;
    const source = material ? material.selected_price?.source_reference || `catalog:${material.id}:${sourceLabel(material)}` : "";
    if (target === "board") setPlan({ ...plan, boardCatalogMaterialId: id || null, boardUnitCost: cost ? String(cost) : "", boardSourceReference: source });
    else if (target === "screw") setPlan({ ...plan, screwCatalogMaterialId: id || null, screwPackUnitCost: cost ? String(cost) : "", screwSourceReference: source });
    else if (target === "railing") setPlan({ ...plan, railingCatalogMaterialId: id || null, railingUnitCost: cost ? String(cost) : "", railingSourceReference: source, railingSectionLengthFeet: material ? String(productLengthFeet(material.description) ?? "") : "" });
    else setPlan({ ...plan, additionalLines: plan.additionalLines.map((line) => line.key === target ? { ...line, catalogMaterialId: id || null, unitCost: cost ? String(cost) : "", sourceReference: source } : line) });
    setPreview(null);
  }

  function updateLine(key: string, field: keyof FixedLine, value: string) {
    setPlan({ ...plan, additionalLines: plan.additionalLines.map((line) => line.key === key ? { ...line, [field]: value, ...(field === "unitCost" || field === "sourceReference" ? { catalogMaterialId: null } : {}) } : line) });
    setPreview(null);
  }

  async function findLowesProducts() {
    setFindingProducts(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/estimates/${encodeURIComponent(estimateId)}/deck-product-suggestions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId, expectedVisitRevision: visitRevision, boardRunDirection: plan.boardRunDirection }),
      });
      const body = await response.json() as { success?: boolean; products?: LowesSuggestion[]; error?: string };
      if (!response.ok || !body.success || !body.products?.length) throw new Error(body.error || "Lowe's defaults could not be found.");
      setSuggestions(body.products);
      setPlan((current) => {
        const board = body.products?.find((item) => item.kind === "deck_board");
        const screw = body.products?.find((item) => item.kind === "deck_fastener");
        const railing = body.products?.find((item) => item.kind === "railing_section");
        return {
          ...current,
          ...(board ? {
            boardCatalogMaterialId: null,
            boardStockLengthFeet: board.stockLengthFeet ? String(board.stockLengthFeet) : current.boardStockLengthFeet,
            boardUnitCost: board.unitCost ? String(board.unitCost) : "",
            boardSourceReference: board.sourceUrl,
          } : {}),
          ...(screw ? {
            screwCatalogMaterialId: null,
            screwCoverageSquareFeetPerPack: screw.coverageSquareFeetPerPack ? String(screw.coverageSquareFeetPerPack) : current.screwCoverageSquareFeetPerPack,
            screwPackUnitCost: screw.unitCost ? String(screw.unitCost) : "",
            screwSourceReference: screw.sourceUrl,
          } : {}),
          ...(railing ? {
            railingCatalogMaterialId: null,
            railingSectionLengthFeet: railing.stockLengthFeet ? String(railing.stockLengthFeet) : current.railingSectionLengthFeet,
            railingUnitCost: railing.unitCost ? String(railing.unitCost) : "",
            railingSourceReference: railing.sourceUrl,
          } : {}),
        };
      });
      setPreview(null);
      setNotice("Lowe's defaults are ready. Review the three product cards, then calculate the takeoff.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Lowe's defaults could not be found.");
    } finally {
      setFindingProducts(false);
    }
  }

  async function requestPreview() {
    setPending(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/estimates/${encodeURIComponent(estimateId)}/deck-takeoff`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId, expectedVisitRevision: visitRevision, plan }),
      });
      const body = await response.json() as DeckTakeoffPreview & { error?: string };
      if (!response.ok) throw new Error(body.error || "Draft takeoff could not be calculated.");
      setPreview(body); setChecks({ dimensions: false, quantities: false, prices: false });
      if (body.status === "ready") setNotice("Draft takeoff is ready for your review.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Draft takeoff could not be calculated."); }
    finally { setPending(false); }
  }

  async function applyTakeoff() {
    if (!preview || preview.status !== "ready" || !checks.dimensions || !checks.quantities || !checks.prices) return;
    setPending(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/estimates/${encodeURIComponent(estimateId)}/deck-takeoff`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitId, expectedVisitRevision: visitRevision, expectedCalculationRevision: calculationRevision,
          applicationId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(),
          applicationVersion: preview.version, previewBinding: preview.previewBinding, plan,
        }),
      });
      const body = await response.json() as EstimateBuilderEnvelope & { success?: boolean; error?: string };
      if (!response.ok || !body.success) throw new Error(body.error || "Reviewed takeoff could not be added.");
      onApplied(body); setNotice("Reviewed takeoff added as true-cost estimate lines. Continue to OH&P below.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Reviewed takeoff could not be added."); }
    finally { setPending(false); }
  }

  const catalogOptions = (lineKey: string) => catalog.filter((material) => {
    const text = material.description.toLowerCase();
    if (lineKey === "board") return text.includes("deck") && (text.includes("board") || text.includes("lumber"));
    if (lineKey === "screw") return text.includes("screw") || text.includes("fastener");
    if (lineKey === "concrete") return text.includes("concrete");
    if (lineKey === "railing") return text.includes("rail");
    if (lineKey === "joists" || lineKey === "posts") return text.includes("lumber");
    return [];
  });
  const selectedBoard = catalogById.get(plan.boardCatalogMaterialId ?? "");
  const selectedScrew = catalogById.get(plan.screwCatalogMaterialId ?? "");
  const selectedRailing = catalogById.get(plan.railingCatalogMaterialId ?? "");
  const suggestionByKind = new Map(suggestions.map((item) => [item.kind, item]));
  const boardSuggestions = suggestions.filter((item) => item.kind === "deck_board");
  const railingSuggestions = suggestions.filter((item) => item.kind === "railing_section");
  const productCombinations = boardSuggestions.flatMap((board) =>
    (railingGeometry.railingsPresent ? railingSuggestions : [null]).map((railing) => {
      const optionPlan: DeckTakeoffPlan = {
        ...plan,
        boardCatalogMaterialId: null,
        boardStockLengthFeet: board.stockLengthFeet ? String(board.stockLengthFeet) : plan.boardStockLengthFeet,
        boardUnitCost: board.unitCost ? String(board.unitCost) : "",
        boardSourceReference: board.sourceUrl,
        ...(railing ? {
          railingCatalogMaterialId: null,
          railingSectionLengthFeet: railing.stockLengthFeet ? String(railing.stockLengthFeet) : plan.railingSectionLengthFeet,
          railingUnitCost: railing.unitCost ? String(railing.unitCost) : "",
          railingSourceReference: railing.sourceUrl,
        } : {}),
      };
      const optionPreview = buildDeckTakeoffPreview({ items: visitItems, plan: optionPlan, catalog: new Map() });
      const materialSubtotal = optionPreview.lines
        .filter((line) => line.category === "material")
        .reduce((total, line) => total + Number(line.quantity) * Number(line.unitCost), 0);
      return { board, railing, optionPlan, optionPreview, materialSubtotal };
    }),
  ).filter((option) => option.optionPreview.lines.some((line) => line.key === "decking"));

  if (takeoffApplied) return <section className="mt-5 rounded-xl border-2 border-emerald-700 bg-emerald-50 p-5"><p className="text-xs font-black uppercase tracking-[.16em] text-emerald-800">Draft takeoff complete</p><h3 className="mt-1 text-xl font-black text-emerald-950">Reviewed quantities and true costs are in the estimate</h3><p className="mt-2 text-sm text-emerald-950">Review the saved lines below. Then continue to OH&amp;P and the customer proposal.</p></section>;

  return <section className="mt-5 rounded-xl border-2 border-blue-700 bg-blue-50 p-4 sm:p-5">
    <p className="text-xs font-black uppercase tracking-[.16em] text-blue-800">Draft material takeoff</p>
    <h3 className="mt-1 text-xl font-black text-slate-950">Turn field measurements into reviewed true costs</h3>
    <p className="mt-2 text-sm leading-6 text-slate-700">Start with one recommended Lowe&apos;s package. The app optimizes board length, calculates a rectangular railing run, and keeps framing and labor as reviewed build-plan inputs. AI suggestions never become a price or purchase without a traceable Lowe&apos;s page and your review.</p>

    <section className="mt-5 rounded-xl border border-slate-300 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-black uppercase tracking-[.16em] text-slate-500">Plan verification</p><h4 className="mt-1 text-lg font-black text-slate-950">Deck blueprint</h4></div>
        <p className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-900">{dimensions.lengthFeet ?? "?"} ft × {dimensions.widthFeet ?? "?"} ft</p>
      </div>
      {dimensions.lengthFeet && dimensions.widthFeet ? <div className="mt-4"><DeckPlanVisual design={{ lengthFeet: dimensions.lengthFeet, widthFeet: dimensions.widthFeet, boardRunDirection: plan.boardRunDirection, deckingLayout: preview?.deckingLayout ?? "seamless", railingLengthFeet: railingGeometry.railingLengthFeet, attached: railingGeometry.attached, stairsPresent: railingGeometry.stairsPresent, stairWidthFeet: railingGeometry.stairsPresent ? railingGeometry.stairWidthFeet : null, stairEdge: plan.stairEdge, stairPosition: plan.stairPosition }} /></div> : <div className="mt-4 grid min-h-48 place-items-center rounded-lg border border-dashed border-amber-400 bg-amber-50 p-5 text-center text-sm font-bold text-amber-950">Enter the deck length and width in Field Measurements to create the plan.</div>}
      <fieldset className="mt-4"><legend className="text-sm font-black text-slate-900">Board direction</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">
        {([['along_length', 'Run boards along the deck length'], ['along_width', 'Run boards across the deck width']] as const).map(([value, label]) => <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm font-bold focus-within:ring-2 focus-within:ring-blue-700 ${plan.boardRunDirection === value ? "border-blue-700 bg-blue-50 text-blue-950" : "border-slate-300 text-slate-800"}`}><input type="radio" name="board-direction" checked={plan.boardRunDirection === value} onChange={() => { setPlan({ ...plan, boardRunDirection: value }); setPreview(null); appliedDefaults.current = false; }} />{label}</label>)}
      </div></fieldset>
      {railingGeometry.stairsPresent ? <fieldset className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <legend className="px-1 text-sm font-black text-slate-900">Place the stairs on the drawing</legend>
        <p className="mt-1 text-xs leading-5 text-slate-600">{railingGeometry.attached ? "The house is at the top." : "The top label sets the drawing orientation."} Choose the deck edge, then where the opening sits on that edge. This changes the plan—not your field measurements.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Stair edge">
            <select className={input} value={plan.stairEdge} onChange={(event) => { setPlan({ ...plan, stairEdge: event.target.value as DeckTakeoffPlan["stairEdge"], stairPlacementConfirmed: false }); setPreview(null); }}>
              {railingGeometry.attached === false ? <option value="top">Top edge of drawing</option> : null}
              <option value="left">Left side</option>
              <option value="right">Right side</option>
              <option value="yard">Yard edge</option>
            </select>
          </Field>
          <Field label="Position on that edge">
            <select className={input} value={plan.stairPosition} onChange={(event) => { setPlan({ ...plan, stairPosition: event.target.value as DeckTakeoffPlan["stairPosition"], stairPlacementConfirmed: false }); setPreview(null); }}>
              {plan.stairEdge === "yard" || plan.stairEdge === "top" ? <>
                <option value="start">Left side of this edge</option>
                <option value="center">Center of this edge</option>
                <option value="end">Right side of this edge</option>
              </> : <>
                <option value="start">{railingGeometry.attached ? "Nearest the house" : "Nearest the top of the drawing"}</option>
                <option value="center">Middle of the side</option>
                <option value="end">{railingGeometry.attached ? "Farthest from the house" : "Farthest from the top of the drawing"}</option>
              </>}
            </select>
          </Field>
        </div>
        <p className="mt-3 rounded-md bg-blue-100 p-3 text-sm font-bold text-blue-950">Current plan: stairs on the {plan.stairEdge === "yard" ? "yard edge" : plan.stairEdge === "top" ? "top edge" : `${plan.stairEdge} side`}, {plan.stairEdge === "yard" || plan.stairEdge === "top" ? plan.stairPosition === "start" ? "toward the left" : plan.stairPosition === "center" ? "centered" : "toward the right" : plan.stairPosition === "start" ? railingGeometry.attached ? "nearest the house" : "nearest the top of the drawing" : plan.stairPosition === "center" ? "in the middle" : railingGeometry.attached ? "farthest from the house" : "farthest from the top of the drawing"}.</p>
        <label className={`mt-3 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm font-bold focus-within:ring-2 focus-within:ring-blue-700 ${plan.stairPlacementConfirmed ? "border-emerald-600 bg-emerald-50 text-emerald-950" : "border-amber-400 bg-amber-50 text-amber-950"}`}><input type="checkbox" checked={plan.stairPlacementConfirmed} onChange={(event) => { setPlan({ ...plan, stairPlacementConfirmed: event.target.checked }); setPreview(null); }} />I checked this stair location against the jobsite.</label>
      </fieldset> : null}
      <p className="mt-3 text-xs leading-5 text-slate-600">This drawing is a quantity plan, not a permit or structural drawing. If the shape or dimensions are wrong, return to Field Measurements and correct them before approving the takeoff.</p>
    </section>

    <section className="mt-5 rounded-lg border border-blue-200 bg-white p-4">
      <h4 className="font-black text-slate-950">Recommended Lowe&apos;s package</h4>
      <p className="mt-1 text-sm text-slate-600">The shortest full-length board wins. If no board spans the run, the only automatic fallback is a perimeter picture frame with a center divider.</p>
      <button type="button" className={`mt-3 w-full ${primary}`} disabled={disabled || findingProducts} onClick={() => void findLowesProducts()}>{findingProducts ? "Searching Lowe's…" : "Find Lowe's defaults"}</button>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {([
          ["Deck boards", selectedBoard?.description ?? suggestionByKind.get("deck_board")?.description ?? "No verified Lowe's default selected", plan.boardUnitCost, plan.boardSourceReference],
          ["Fasteners", selectedScrew?.description ?? suggestionByKind.get("deck_fastener")?.description ?? "No verified Lowe's default selected", plan.screwPackUnitCost, plan.screwSourceReference],
          ["Railing", selectedRailing?.description ?? suggestionByKind.get("railing_section")?.description ?? "No verified Lowe's default selected", plan.railingUnitCost, plan.railingSourceReference],
        ] as const).map(([label, description, cost, source]) => <article key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-sm font-bold text-slate-950">{description}</p>
          <p className="mt-1 text-xs text-slate-600">{cost ? `$${cost}` : "Price still needs verification"}</p>
          {source.startsWith("https://www.lowes.com/") || source.startsWith("https://lowes.com/") ? <a className="mt-2 inline-block text-xs font-bold text-blue-800 underline" href={source} target="_blank" rel="noreferrer">Open Lowe&apos;s product</a> : null}
        </article>)}
      </div>
      {productCombinations.length ? <section className="mt-4 border-t border-slate-200 pt-4"><h5 className="font-black text-slate-950">Compare deck-board and railing combinations</h5><p className="mt-1 text-xs leading-5 text-slate-600">These are material-only comparisons. Labor, framing, tax, and OH&amp;P are added by the complete estimate before anything is shown to the customer.</p><div className="mt-3 grid gap-3 lg:grid-cols-2">{productCombinations.slice(0, 6).map((option, index) => <article key={`${option.board.sourceUrl}:${option.railing?.sourceUrl ?? "no-rail"}`} className="rounded-lg border border-slate-300 bg-slate-50 p-3"><p className="text-xs font-black uppercase tracking-wide text-blue-800">Option {index + 1}</p><p className="mt-1 text-sm font-bold text-slate-950">{option.board.description}</p><p className="mt-1 text-xs text-slate-700">{option.railing?.description ?? "No railing system required"}</p><p className="mt-2 text-sm font-black text-slate-950">Known materials: {option.materialSubtotal > 0 ? `$${option.materialSubtotal.toFixed(2)}` : "prices incomplete"}</p><button type="button" className={`mt-3 w-full ${primary}`} onClick={() => { setPlan(option.optionPlan); setPreview(null); setNotice(`Option ${index + 1} selected. Calculate the takeoff to verify every quantity and cost.`); }}>Use this combination</button></article>)}</div></section> : null}
    </section>

    <details className="mt-4 rounded-lg border border-slate-300 bg-white p-4">
      <summary className="min-h-11 cursor-pointer font-black text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700">Change products, costs, or advanced quantities</summary>

    <div className="mt-4 rounded-lg bg-slate-50 p-4">
      <h4 className="font-black text-slate-950">1. Decking calculation</h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Actual board width (inches)"><input className={input} inputMode="decimal" value={plan.boardActualWidthInches} onChange={(e) => { setPlan({ ...plan, boardActualWidthInches: e.target.value }); setPreview(null); }} /></Field>
        <Field label="Board gap (inches)"><input className={input} inputMode="decimal" value={plan.boardGapInches} onChange={(e) => { setPlan({ ...plan, boardGapInches: e.target.value }); setPreview(null); }} /></Field>
        <Field label="Stock board length (feet)" help="Full-length boards are preferred. Shorter boards are allowed only when two pieces reach the run and a picture-frame center divider is included."><input className={input} inputMode="decimal" value={plan.boardStockLengthFeet} onChange={(e) => { setPlan({ ...plan, boardStockLengthFeet: e.target.value }); setPreview(null); }} /></Field>
        <Field label="Waste (%)"><input className={input} inputMode="decimal" value={plan.boardWastePercent} onChange={(e) => { setPlan({ ...plan, boardWastePercent: e.target.value }); setPreview(null); }} /></Field>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Field label="Exact catalog product"><select className={input} value={plan.boardCatalogMaterialId ?? ""} onChange={(e) => chooseCatalog("board", e.target.value)}><option value="">Enter verified cost manually</option>{catalogOptions("board").map((material) => <option key={material.id} value={material.id}>{material.description} · ${material.effective_unit_cost ?? "?"}</option>)}</select></Field>
        <Field label="Unit cost"><input className={input} inputMode="decimal" value={plan.boardUnitCost} onChange={(e) => { setPlan({ ...plan, boardUnitCost: e.target.value, boardCatalogMaterialId: null }); setPreview(null); }} /></Field>
        <Field label="Price source" help="Lowe's product URL, quote number, or another traceable reference."><input className={input} value={plan.boardSourceReference} onChange={(e) => { setPlan({ ...plan, boardSourceReference: e.target.value, boardCatalogMaterialId: null }); setPreview(null); }} /></Field>
      </div>
    </div>

    <div className="mt-4 rounded-lg bg-slate-50 p-4">
      <h4 className="font-black text-slate-950">2. Fasteners (optional)</h4>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <Field label="Coverage per package (sq ft)" help="Use the fastener manufacturer's installation guidance."><input className={input} inputMode="decimal" value={plan.screwCoverageSquareFeetPerPack} onChange={(e) => { setPlan({ ...plan, screwCoverageSquareFeetPerPack: e.target.value }); setPreview(null); }} /></Field>
        <Field label="Exact catalog product"><select className={input} value={plan.screwCatalogMaterialId ?? ""} onChange={(e) => chooseCatalog("screw", e.target.value)}><option value="">Enter verified cost manually</option>{catalogOptions("screw").map((material) => <option key={material.id} value={material.id}>{material.description} · ${material.effective_unit_cost ?? "?"}</option>)}</select></Field>
        <Field label="Package cost"><input className={input} inputMode="decimal" value={plan.screwPackUnitCost} onChange={(e) => { setPlan({ ...plan, screwPackUnitCost: e.target.value, screwCatalogMaterialId: null }); setPreview(null); }} /></Field>
        <Field label="Price source"><input className={input} value={plan.screwSourceReference} onChange={(e) => { setPlan({ ...plan, screwSourceReference: e.target.value, screwCatalogMaterialId: null }); setPreview(null); }} /></Field>
      </div>
    </div>

    <div className="mt-4 rounded-lg bg-slate-50 p-4">
      <h4 className="font-black text-slate-950">3. Automatic railing</h4>
      <p className="mt-1 text-sm text-slate-600">The app uses the rectangular deck perimeter, removes the house side when attached, and subtracts the verified stair opening. You review the result before it becomes an estimate line.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <Field label="Railing section length (feet)"><input className={input} inputMode="decimal" value={plan.railingSectionLengthFeet} onChange={(e) => { setPlan({ ...plan, railingSectionLengthFeet: e.target.value }); setPreview(null); }} /></Field>
        <Field label="Exact catalog product"><select className={input} value={plan.railingCatalogMaterialId ?? ""} onChange={(e) => chooseCatalog("railing", e.target.value)}><option value="">Use verified Lowe&apos;s result</option>{catalogOptions("railing").map((material) => <option key={material.id} value={material.id}>{material.description} · ${material.effective_unit_cost ?? "?"}</option>)}</select></Field>
        <Field label="Section cost"><input className={input} inputMode="decimal" value={plan.railingUnitCost} onChange={(e) => { setPlan({ ...plan, railingUnitCost: e.target.value, railingCatalogMaterialId: null }); setPreview(null); }} /></Field>
        <Field label="Price source"><input className={input} value={plan.railingSourceReference} onChange={(e) => { setPlan({ ...plan, railingSourceReference: e.target.value, railingCatalogMaterialId: null }); setPreview(null); }} /></Field>
      </div>
    </div>

    <div className="mt-4 rounded-lg bg-slate-50 p-4">
      <h4 className="font-black text-slate-950">4. Planned quantities geometry cannot decide</h4>
      <p className="mt-1 text-sm text-slate-600">Leave a row blank when it does not apply. These quantities must come from your reviewed build plan, not AI.</p>
      <div className="mt-3 space-y-4">{plan.additionalLines.map((line) => <fieldset key={line.key} className="rounded-lg border border-slate-200 p-3"><legend className="px-1 font-bold text-slate-900">{line.description}</legend><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Quantity"><input className={input} inputMode="decimal" value={line.quantity} onChange={(e) => updateLine(line.key, "quantity", e.target.value)} /></Field>
        <Field label="Unit"><input className={input} value={line.unit} onChange={(e) => updateLine(line.key, "unit", e.target.value)} /></Field>
        {line.category === "material" ? <Field label="Exact catalog product"><select className={input} value={line.catalogMaterialId ?? ""} onChange={(e) => chooseCatalog(line.key, e.target.value)}><option value="">Enter verified cost manually</option>{catalogOptions(line.key).map((material) => <option key={material.id} value={material.id}>{material.description} · ${material.effective_unit_cost ?? "?"}</option>)}</select></Field> : <div />}
        <Field label="Unit cost"><input className={input} inputMode="decimal" value={line.unitCost} onChange={(e) => updateLine(line.key, "unitCost", e.target.value)} /></Field>
        <Field label="Cost source"><input className={input} value={line.sourceReference} onChange={(e) => updateLine(line.key, "sourceReference", e.target.value)} /></Field>
      </div></fieldset>)}</div>
    </div>
    </details>

    {error ? <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-900">{error}</p> : null}
    {notice ? <p role="status" className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">{notice}</p> : null}
    <button type="button" className={`mt-5 w-full ${primary}`} disabled={disabled || pending} onClick={() => void requestPreview()}>{pending ? "Working…" : "Calculate draft takeoff"}</button>

    {preview ? <section className="mt-5 rounded-lg border border-slate-300 bg-white p-4">
      <h4 className="text-lg font-black text-slate-950">Review before adding costs</h4>
      <p className="mt-1 text-sm text-slate-700">Verified deck area: {preview.deckAreaSquareFeet ? `${preview.deckAreaSquareFeet} sq ft` : "not available"}</p>
      {preview.deckingLayout ? <p className="mt-1 text-sm font-bold text-slate-800">Board layout: {preview.deckingLayout === "seamless" ? "Full-length boards · no field joints" : "Picture frame + center divider · no unsupported butt joints"}</p> : null}
      {preview.railingLengthFeet ? <p className="mt-1 text-sm font-bold text-slate-800">Calculated railing: {preview.railingLengthFeet} linear ft</p> : null}
      {preview.unresolved.length ? <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3"><p className="font-bold text-amber-950">Still needs input</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-950">{preview.unresolved.map((value) => <li key={value}>{value}</li>)}</ul></div> : null}
      <div className="mt-3 space-y-2">{preview.lines.map((line) => <details key={line.key} className="rounded-lg border border-slate-200 p-3"><summary className="min-h-11 cursor-pointer font-bold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">{line.customerDescription}: {line.quantity} {line.unit} × ${line.unitCost}</summary><p className="mt-2 text-sm text-slate-700">{line.formula}</p><p className="mt-1 break-all text-xs text-slate-600">Cost source: {line.sourceReference}</p></details>)}</div>
      {preview.status === "ready" ? <div className="mt-4 space-y-3">{[
        ["dimensions", "I reviewed the field dimensions used by this takeoff."],
        ["quantities", "I reviewed the build-plan quantities and formulas."],
        ["prices", "I reviewed every true cost and its source."],
      ].map(([key, label]) => <label key={key} className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm font-bold text-slate-900"><input type="checkbox" checked={checks[key as keyof typeof checks]} onChange={(e) => setChecks({ ...checks, [key]: e.target.checked })} />{label}</label>)}<button type="button" className={`w-full ${primary}`} disabled={disabled || pending || !checks.dimensions || !checks.quantities || !checks.prices} onClick={() => void applyTakeoff()}>{pending ? "Adding…" : "Add reviewed takeoff to estimate"}</button></div> : null}
    </section> : null}
  </section>;
}
