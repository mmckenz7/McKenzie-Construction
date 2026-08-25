import type { DeckPlatformGeometryV3 } from "./geometryV3";
import type { DeckPlatformV5, EdgeFinishIntentV5 } from "./modelV5";
import { formatFeetInches } from "./PlanView";

type Props = Readonly<{
  platform: DeckPlatformV5;
  geometry: DeckPlatformGeometryV3;
  selectedEdgeId: string | null;
  gradeElevation: number;
  onChange: (edgeId: string, update: Readonly<{ fasciaEnabled: boolean; skirtingEnabled: boolean }>) => void;
  onBack: () => void;
}>;

function selectedFinish(platform: DeckPlatformV5, edgeId: string | null): EdgeFinishIntentV5 | null {
  return platform.construction.edgeFinishes.find((finish) => finish.edgeId === edgeId) ?? null;
}

function FinishActions({ platform, geometry, selectedEdgeId, gradeElevation, onChange }: Omit<Props, "onBack">) {
  const edge = geometry.platformEdges.find((candidate) => candidate.id === selectedEdgeId) ?? null;
  const isFree = Boolean(edge && platform.edgeConditions.some((condition) => condition.edgeId === edge.id && condition.condition === "free"));
  const finish = selectedFinish(platform, edge?.id ?? null);
  if (!edge) return <div className="plan-action-copy"><strong>Select a deck side</strong><small>Fascia and skirting choices will appear only for that highlighted side.</small></div>;
  if (!isFree) return <div className="plan-action-copy"><strong>House side selected</strong><small>Exposed fascia and skirting are unavailable on the recorded house attachment.</small></div>;
  const fasciaEnabled = finish?.fasciaEnabled ?? false;
  const skirtingEnabled = finish?.skirtingEnabled ?? false;
  return <>
    <div className="plan-action-copy"><strong>{formatFeetInches(edge.length)} free side selected</strong><small>Choose either finish independently. Stair openings are removed automatically.</small></div>
    <div className="toggle-grid two finish-toggle-grid">
      <button type="button" className={`toggle${fasciaEnabled ? " active" : ""}`} aria-pressed={fasciaEnabled} onClick={() => onChange(edge.id, { fasciaEnabled: !fasciaEnabled, skirtingEnabled })}>{fasciaEnabled ? "✓ Fascia" : "Add fascia"}</button>
      <button type="button" className={`toggle${skirtingEnabled ? " active" : ""}`} aria-pressed={skirtingEnabled} onClick={() => onChange(edge.id, { fasciaEnabled, skirtingEnabled: !skirtingEnabled })}>{skirtingEnabled ? "✓ Skirting" : "Add skirting"}</button>
    </div>
    {skirtingEnabled && <div className="automatic-standard-note"><strong>Recorded panel height: {formatFeetInches(platform.elevation - gradeElevation)}</strong><small>Measured from recorded grade to deck elevation. Product, ventilation, access, waste, labor, and code details remain undetermined.</small></div>}
  </>;
}

export function FinishStageControls(props: Props) {
  const fasciaCount = props.platform.construction.edgeFinishes.filter((finish) => finish.fasciaEnabled).length;
  const skirtingCount = props.platform.construction.edgeFinishes.filter((finish) => finish.skirtingEnabled).length;
  return <>
    <section className="selected-edge-card finish-summary-card"><strong>Deck finishes</strong><p>{fasciaCount} fascia side{fasciaCount === 1 ? "" : "s"} · {skirtingCount} skirting side{skirtingCount === 1 ? "" : "s"}</p><small>Tap one side in the plan. Only that side’s choices appear.</small></section>
    <section id="finish-controls" className="selected-edge-card finish-controls"><FinishActions {...props} /></section>
    <button onClick={props.onBack}>Back to railings</button>
  </>;
}

export function FinishMobileActions(props: Omit<Props, "onBack">) {
  return <section className="plan-action-tray finish-mobile-actions" aria-live="polite"><FinishActions {...props} /></section>;
}
