import { useEffect, useState } from "react";
import type { DeckPlatformGeometryV3 } from "./geometryV3";
import type { DeckPlatformV3 } from "./modelV3";
import { formatFeetInches } from "./PlanView";
import { railingStageSummary, toggleRailingOnExactEdge } from "./railingEditorV3";

type Props = Readonly<{
  platform: DeckPlatformV3;
  geometry: DeckPlatformGeometryV3;
  selectedEdgeId: string | null;
  onRailingChange: (railing: DeckPlatformV3["construction"]["railing"], message: string) => void;
  onHeight: (height: number) => void;
  onBack: () => void;
}>;

export function RailingStageControls({ platform, geometry, selectedEdgeId, onRailingChange, onHeight, onBack }: Props) {
  const summary = railingStageSummary(platform);
  const edge = geometry.platformEdges.find((item) => item.id === selectedEdgeId) ?? null;
  const condition = edge ? platform.edgeConditions.find((item) => item.edgeId === edge.id) : null;
  const enabled = edge ? platform.construction.railing.enabledEdgeIds.includes(edge.id) : false;
  const [height, setHeight] = useState(String(platform.construction.railing.height));
  useEffect(() => setHeight(String(platform.construction.railing.height)), [platform.construction.railing.height]);

  return <>
    <div className="section-heading" id="railing-controls"><span>02</span><div><p>Railings</p><small>The deck layout is locked on this page</small></div></div>
    <section className="railing-stage-summary"><strong>{summary.enabledEdgeCount} of {summary.freeEdgeCount} free sides have railing</strong><p>Tap one side in the railing plan, then add or remove its railing. Stairs automatically create their own opening.</p></section>
    {edge ? <section className="selected-edge-card railing-selection"><strong>{formatFeetInches(edge.length)} side selected</strong><p>{condition?.condition === "house_attachment" ? "This is the house side; railing is not available here." : enabled ? "Railing is currently shown on this side." : "This side is currently open."}</p><button className={enabled ? "" : "primary"} disabled={condition?.condition !== "free"} onClick={() => { const railing = toggleRailingOnExactEdge(platform, edge.id); onRailingChange(railing, railing.enabledEdgeIds.includes(edge.id) ? "Railing added to the selected side." : "Railing removed from the selected side."); }}>{condition?.condition === "house_attachment" ? "House side stays open" : enabled ? "Remove railing from this side" : "Add railing to this side"}</button></section> : <p className="section-help railing-help">Tap a side in the plan. The selected side will highlight before anything changes.</p>}
    <div className="railing-height-field"><label className="field"><span>Railing height (inches)</span><input type="number" min="30" max="48" step="1" value={height} onChange={(event) => setHeight(event.target.value)} onBlur={() => { onHeight(Number(height)); setHeight(String(platform.construction.railing.height)); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label></div>
    <button className="back-to-layout" onClick={onBack}>Back to deck layout</button>
    <small className="railing-stage-note">Changing the outline later requires an explicit unlock so railings are never silently moved to a different side.</small>
  </>;
}

export function RailingMobileActions({ platform, geometry, selectedEdgeId, onRailingChange }: Omit<Props, "onHeight" | "onBack">) {
  const edge = geometry.platformEdges.find((item) => item.id === selectedEdgeId) ?? null;
  if (!edge) return <section className="mobile-plan-edge-actions railing-mobile-actions" aria-live="polite"><p>Tap one side to choose its railing.</p></section>;
  const free = platform.edgeConditions.some((item) => item.edgeId === edge.id && item.condition === "free");
  const enabled = platform.construction.railing.enabledEdgeIds.includes(edge.id);
  return <section className="mobile-plan-edge-actions railing-mobile-actions" aria-live="polite"><div><strong>{formatFeetInches(edge.length)} side selected</strong><small>{free ? enabled ? "Railing is shown here." : "This side is open." : "This is the house side."}</small></div><button className={enabled ? "" : "primary"} disabled={!free} onClick={() => { const railing = toggleRailingOnExactEdge(platform, edge.id); onRailingChange(railing, railing.enabledEdgeIds.includes(edge.id) ? "Railing added to the selected side." : "Railing removed from the selected side."); }}>{!free ? "House side stays open" : enabled ? "Remove railing" : "Add railing"}</button></section>;
}
