import { useEffect, useMemo, useRef, useState } from "react";
import { applyHouseConnectionV3, deriveHouseConnectionDraft, removeHouseConnectionV3 } from "./houseConnectionV3";
import type { HouseAttachment } from "./model";
import type { DeckDesignV3, DeckPlatformV3 } from "./modelV3";
import { deriveGeometricPolygonEdges } from "./polygon";
import { formatFeetInches } from "./PlanView";

type Props = Readonly<{
  design: DeckDesignV3;
  platform: DeckPlatformV3;
  onApply: (design: DeckDesignV3, attachment: HouseAttachment) => void;
  onError: (message: string) => void;
}>;

function sideName(edge: ReturnType<typeof deriveGeometricPolygonEdges>[number]): string {
  if (Math.abs(edge.end.x - edge.start.x) >= Math.abs(edge.end.z - edge.start.z)) {
    return edge.outward.z < 0 ? "Upper side in plan" : "Lower side in plan";
  }
  return edge.outward.x < 0 ? "Left side in plan" : "Right side in plan";
}

const feetInput = (inches: number) => String(Math.round(inches / 12 * 100) / 100);

export function eligibleNewHouseWallEdgeIds(platform: DeckPlatformV3): readonly string[] {
  const edges = deriveGeometricPolygonEdges(platform.region.outer);
  const houseEdges = edges.filter((edge) => platform.edgeConditions.some((condition) => condition.edgeId === edge.id && condition.condition === "house_attachment"));
  return edges.filter((edge) => {
    const free = platform.edgeConditions.some((condition) => condition.edgeId === edge.id && condition.condition === "free");
    const referenced = platform.construction.railing.enabledEdgeIds.includes(edge.id) || platform.construction.stairSystems.some((system) => system.edgeId === edge.id);
    return free && !referenced && houseEdges.some((houseEdge) => Math.abs((edge.end.x - edge.start.x) * (houseEdge.end.x - houseEdge.start.x) + (edge.end.z - edge.start.z) * (houseEdge.end.z - houseEdge.start.z)) < 0.001);
  }).map((edge) => edge.id);
}

export function HouseConnectionEditor({ design, platform, onApply, onError }: Props) {
  const [wallId, setWallId] = useState(design.siteContext.houseWalls[0]?.id ?? "");
  const addingWall = wallId === "new";
  const draft = useMemo(() => deriveHouseConnectionDraft(design, platform.id, addingWall ? null : wallId), [addingWall, design, platform.id, wallId]);
  const edges = useMemo(() => deriveGeometricPolygonEdges(platform.region.outer), [platform.region.outer]);
  const [edgeId, setEdgeId] = useState(draft.edgeId);
  const [attachment, setAttachment] = useState(draft.attachment);
  const [doorEnabled, setDoorEnabled] = useState(draft.doorEnabled);
  const [doorOffsetFeet, setDoorOffsetFeet] = useState(feetInput(draft.doorOffset));
  const [doorWidthFeet, setDoorWidthFeet] = useState(feetInput(draft.doorWidth));
  const sideSelector = useRef<HTMLSelectElement>(null);
  const eligibleNewWallEdgeIds = useMemo(() => eligibleNewHouseWallEdgeIds(platform), [platform]);
  useEffect(() => {
    if (!addingWall) setEdgeId(draft.edgeId);
    setAttachment(draft.attachment);
    setDoorEnabled(draft.doorEnabled);
    setDoorOffsetFeet(feetInput(draft.doorOffset));
    setDoorWidthFeet(feetInput(draft.doorWidth));
  }, [addingWall, draft]);
  useEffect(() => {
    if (wallId !== "new" && !design.siteContext.houseWalls.some((wall) => wall.id === wallId)) setWallId(design.siteContext.houseWalls[0]?.id ?? "");
  }, [design.siteContext.houseWalls, wallId]);
  useEffect(() => { if (addingWall) sideSelector.current?.focus(); }, [addingWall]);
  return <section className="house-connection-editor" id="house-connection">
    <div className="section-heading compact"><span>03</span><div><p>House connection</p></div></div>
    <div className="house-wall-selector" aria-label="Recorded house walls">{design.siteContext.houseWalls.map((wall, index) => <button key={wall.id} type="button" aria-pressed={wallId === wall.id} onClick={() => setWallId(wall.id)}>Wall {index + 1}</button>)}<button type="button" disabled={design.siteContext.houseWalls.length >= 8} onClick={() => { setWallId("new"); setEdgeId(eligibleNewWallEdgeIds.length === 1 ? eligibleNewWallEdgeIds[0] : ""); setAttachment("unknown"); setDoorEnabled(false); }}>{design.siteContext.houseWalls.length < 2 ? "Add second wall" : "Add another wall"}</button></div>
    {addingWall && <div className="stair-railing-note" role="status" aria-live="polite"><strong>Add Wall {design.siteContext.houseWalls.length + 1}</strong><small>Choose a side, then add it.</small></div>}
    <label className="field full"><span>Side touching the house</span><select ref={sideSelector} value={edgeId} onChange={(event) => setEdgeId(event.target.value)}><option value="">Choose a side…</option>{edges.map((edge) => <option key={edge.id} value={edge.id}>{sideName(edge)} · {formatFeetInches(edge.length)}</option>)}</select></label>
    <label className="field full"><span>Connection type</span><select value={attachment} onChange={(event) => setAttachment(event.target.value as typeof attachment)}><option value="unknown">Unknown · verify</option><option value="ledger">Ledger attached</option><option value="non-ledger">Freestanding</option></select></label>
    <label className="check-row house-door-toggle"><input type="checkbox" checked={doorEnabled} onChange={(event) => setDoorEnabled(event.target.checked)} />Show door</label>
    {doorEnabled && <div className="house-door-fields"><label className="field"><span>Door width (feet)</span><input inputMode="decimal" type="number" min="2" max="12" step="0.25" value={doorWidthFeet} onChange={(event) => setDoorWidthFeet(event.target.value)} /></label><label className="field"><span>From side start (feet)</span><input inputMode="decimal" type="number" min="0" step="0.25" value={doorOffsetFeet} onChange={(event) => setDoorOffsetFeet(event.target.value)} /></label></div>}
    <button className="primary full-action" disabled={!edgeId} onClick={() => { try { const next = applyHouseConnectionV3(design, platform.id, { wallId: addingWall ? null : wallId, edgeId, attachment, doorEnabled, doorOffset: Number(doorOffsetFeet) * 12, doorWidth: Number(doorWidthFeet) * 12 }); onApply(next, attachment); if (addingWall) setWallId(next.siteContext.houseWalls.at(-1)?.id ?? ""); } catch (error) { onError(error instanceof Error ? error.message : "House connection update rejected."); } }}>{addingWall ? `Add Wall ${design.siteContext.houseWalls.length + 1}` : "Update house connection"}</button>
    {!addingWall && design.siteContext.houseWalls.length > 1 && <button className="full-action" onClick={() => { try { const next = removeHouseConnectionV3(design, platform.id, wallId); const remaining = next.siteContext.houseWalls[0]; setWallId(remaining.id); onApply(next, remaining.attachment); } catch (error) { onError(error instanceof Error ? error.message : "House wall removal rejected."); } }}>Remove selected wall</button>}
  </section>;
}
