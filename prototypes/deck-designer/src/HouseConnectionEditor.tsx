import { useEffect, useMemo, useState } from "react";
import { applyHouseConnectionV3, deriveHouseConnectionDraft } from "./houseConnectionV3";
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

function startName(edge: ReturnType<typeof deriveGeometricPolygonEdges>[number] | undefined): string {
  if (!edge) return "side start";
  if (Math.abs(edge.end.x - edge.start.x) >= Math.abs(edge.end.z - edge.start.z)) return edge.start.x <= edge.end.x ? "left corner" : "right corner";
  return edge.start.z <= edge.end.z ? "top corner" : "bottom corner";
}

export function HouseConnectionEditor({ design, platform, onApply, onError }: Props) {
  const draft = useMemo(() => deriveHouseConnectionDraft(design, platform.id), [design, platform.id]);
  const edges = useMemo(() => deriveGeometricPolygonEdges(platform.region.outer), [platform.region.outer]);
  const [edgeId, setEdgeId] = useState(draft.edgeId);
  const [attachment, setAttachment] = useState(draft.attachment);
  const [doorEnabled, setDoorEnabled] = useState(draft.doorEnabled);
  const [doorOffsetFeet, setDoorOffsetFeet] = useState(String(Math.round(draft.doorOffset / 12 * 100) / 100));
  const [doorWidthFeet, setDoorWidthFeet] = useState(String(Math.round(draft.doorWidth / 12 * 100) / 100));
  useEffect(() => {
    setEdgeId(draft.edgeId);
    setAttachment(draft.attachment);
    setDoorEnabled(draft.doorEnabled);
    setDoorOffsetFeet(String(Math.round(draft.doorOffset / 12 * 100) / 100));
    setDoorWidthFeet(String(Math.round(draft.doorWidth / 12 * 100) / 100));
  }, [draft]);
  const selectedEdge = edges.find((edge) => edge.id === edgeId);
  return <section className="house-connection-editor" id="house-connection">
    <div className="section-heading compact"><span>03</span><div><p>House connection</p><small>Place the wall and door from confirmed dimensions</small></div></div>
    <label className="field full"><span>Side touching the house</span><select value={edgeId} onChange={(event) => setEdgeId(event.target.value)}><option value="">Choose a side…</option>{edges.map((edge) => <option key={edge.id} value={edge.id}>{sideName(edge)} · {formatFeetInches(edge.length)}</option>)}</select></label>
    <label className="field full"><span>Connection type</span><select value={attachment} onChange={(event) => setAttachment(event.target.value as typeof attachment)}><option value="unknown">Unknown · field verify</option><option value="ledger">Ledger attached</option><option value="non-ledger">Freestanding / non-ledger</option></select></label>
    <label className="check-row house-door-toggle"><input type="checkbox" checked={doorEnabled} onChange={(event) => setDoorEnabled(event.target.checked)} />Show a door on this wall</label>
    {doorEnabled && <div className="house-door-fields"><label className="field"><span>Door width (feet)</span><input inputMode="decimal" type="number" min="2" max="12" step="0.25" value={doorWidthFeet} onChange={(event) => setDoorWidthFeet(event.target.value)} /></label><label className="field"><span>From {startName(selectedEdge)} (feet)</span><input inputMode="decimal" type="number" min="0" step="0.25" value={doorOffsetFeet} onChange={(event) => setDoorOffsetFeet(event.target.value)} /></label></div>}
    <button className="primary full-action" disabled={!edgeId} onClick={() => { try { onApply(applyHouseConnectionV3(design, platform.id, { edgeId, attachment, doorEnabled, doorOffset: Number(doorOffsetFeet) * 12, doorWidth: Number(doorWidthFeet) * 12 }), attachment); } catch (error) { onError(error instanceof Error ? error.message : "House connection update rejected."); } }}>Update house connection</button>
    <p className="section-help house-connection-help">Nothing is measured from the photo automatically. Unknown connection details stay marked for field verification.</p>
  </section>;
}
