import type { DeckPlatformV3 } from "./modelV3";
import { V3NumberField } from "./V3NumberField";

type Bounds = Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;

type Props = {
  platforms: readonly DeckPlatformV3[];
  platform: DeckPlatformV3;
  selectedHoleIndex: number | null;
  onKeepSelectedLevel: () => void;
  onSetElevation: (valueFeet: number) => void;
  onAddCutout: () => void;
  onSelectCutout: (index: number | null) => void;
  onUpdateCutout: (index: number, update: Partial<{ centerX: number; centerZ: number; width: number; depth: number }>) => void;
  onRemoveCutout: (index: number) => void;
};

const feet = (inches: number) => Math.round(inches / 12 * 100) / 100;

function bounds(points: readonly Readonly<{ x: number; z: number }>[]): Bounds {
  return points.reduce((result, point) => ({
    minX: Math.min(result.minX, point.x), maxX: Math.max(result.maxX, point.x),
    minZ: Math.min(result.minZ, point.z), maxZ: Math.max(result.maxZ, point.z),
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
}

export function LevelCutoutControls({ platforms, platform, selectedHoleIndex, onKeepSelectedLevel, onSetElevation, onAddCutout, onSelectCutout, onUpdateCutout, onRemoveCutout }: Props) {
  const selectedHole = selectedHoleIndex === null ? null : platform.region.holes[selectedHoleIndex] ?? null;
  const selectedBounds = selectedHole ? bounds(selectedHole) : null;
  return <>
    <section className="level-layer-controls"><div><strong>Deck height</strong><small>Single-level geometry is the active workflow.</small></div><V3NumberField label="Height above grade (feet)" value={feet(platform.elevation)} step={.5} onCommit={onSetElevation} /><small className="level-height-note">Enter the measured deck-surface height above grade.</small></section>
    {platforms.length > 1 && <section className="selected-edge-card review-card"><strong>Multi-level draft paused</strong><p>Keep the selected deck only so this project returns to the dependable single-level workflow.</p><button className="primary" onClick={onKeepSelectedLevel}>Keep selected level only</button></section>}
    <section className="cutout-controls"><div><strong>Cutouts and obstacles</strong><small>For trees, pools, and openings inside this level.</small></div><button onClick={onAddCutout}>Add rectangular cutout</button>{platform.region.holes.length > 0 && <label className="field"><span>Cutout to edit</span><select value={selectedHoleIndex ?? ""} onChange={(event) => onSelectCutout(event.target.value === "" ? null : Number(event.target.value))}><option value="">Choose a cutout…</option>{platform.region.holes.map((_, index) => <option key={index} value={index}>Cutout {index + 1}</option>)}</select></label>}{selectedBounds && selectedHoleIndex !== null && <div className="cutout-editor"><div className="field-grid"><V3NumberField label="Center left/right (feet)" value={feet((selectedBounds.minX + selectedBounds.maxX) / 2)} step={.5} onCommit={(value) => onUpdateCutout(selectedHoleIndex, { centerX: value * 12 })} /><V3NumberField label="Center away (feet)" value={feet((selectedBounds.minZ + selectedBounds.maxZ) / 2)} step={.5} onCommit={(value) => onUpdateCutout(selectedHoleIndex, { centerZ: value * 12 })} /><V3NumberField label="Width (feet)" value={feet(selectedBounds.maxX - selectedBounds.minX)} step={.5} onCommit={(value) => onUpdateCutout(selectedHoleIndex, { width: value * 12 })} /><V3NumberField label="Depth (feet)" value={feet(selectedBounds.maxZ - selectedBounds.minZ)} step={.5} onCommit={(value) => onUpdateCutout(selectedHoleIndex, { depth: value * 12 })} /></div><button onClick={() => onRemoveCutout(selectedHoleIndex)}>Remove cutout</button></div>}</section>
  </>;
}
