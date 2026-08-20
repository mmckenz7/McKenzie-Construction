import type { DeckPlatformV3 } from "./modelV3";
import { formatFeetInches } from "./PlanView";
import { V3NumberField } from "./V3NumberField";

type Bounds = Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;

type Props = {
  platforms: readonly DeckPlatformV3[];
  platform: DeckPlatformV3;
  platformBounds: Bounds;
  selectedHoleIndex: number | null;
  onSelectPlatform: (platformId: string) => void;
  onAddLevel: () => void;
  onRemoveLevel: () => void;
  onMoveLevel: (axis: "x" | "z", valueFeet: number) => void;
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

export function LevelCutoutControls({ platforms, platform, platformBounds, selectedHoleIndex, onSelectPlatform, onAddLevel, onRemoveLevel, onMoveLevel, onAddCutout, onSelectCutout, onUpdateCutout, onRemoveCutout }: Props) {
  const selectedHole = selectedHoleIndex === null ? null : platform.region.holes[selectedHoleIndex] ?? null;
  const selectedBounds = selectedHole ? bounds(selectedHole) : null;
  return <>
    {platforms.length > 1 && <label className="field full"><span>Level to edit</span><select value={platform.id} onChange={(event) => onSelectPlatform(event.target.value)}>{platforms.map((item, index) => <option key={item.id} value={item.id}>Level {index + 1} · {formatFeetInches(item.elevation)} high</option>)}</select></label>}
    <div className="level-actions"><button className="primary" onClick={onAddLevel}>Add another level</button><button disabled={platforms.length === 1} onClick={onRemoveLevel}>Remove this level</button></div>
    {platforms.length > 1 && <div className="field-grid level-position-fields"><V3NumberField label="Level left/right (feet)" value={feet(platformBounds.minX)} step={.5} onCommit={(value) => onMoveLevel("x", value)} /><V3NumberField label="Level away (feet)" value={feet(platformBounds.minZ)} step={.5} onCommit={(value) => onMoveLevel("z", value)} /></div>}
    <section className="cutout-controls"><div><strong>Cutouts and obstacles</strong><small>For trees, pools, and openings inside this level.</small></div><button onClick={onAddCutout}>Add rectangular cutout</button>{platform.region.holes.length > 0 && <label className="field"><span>Cutout to edit</span><select value={selectedHoleIndex ?? ""} onChange={(event) => onSelectCutout(event.target.value === "" ? null : Number(event.target.value))}><option value="">Choose a cutout…</option>{platform.region.holes.map((_, index) => <option key={index} value={index}>Cutout {index + 1}</option>)}</select></label>}{selectedBounds && selectedHoleIndex !== null && <div className="cutout-editor"><div className="field-grid"><V3NumberField label="Center left/right (feet)" value={feet((selectedBounds.minX + selectedBounds.maxX) / 2)} step={.5} onCommit={(value) => onUpdateCutout(selectedHoleIndex, { centerX: value * 12 })} /><V3NumberField label="Center away (feet)" value={feet((selectedBounds.minZ + selectedBounds.maxZ) / 2)} step={.5} onCommit={(value) => onUpdateCutout(selectedHoleIndex, { centerZ: value * 12 })} /><V3NumberField label="Width (feet)" value={feet(selectedBounds.maxX - selectedBounds.minX)} step={.5} onCommit={(value) => onUpdateCutout(selectedHoleIndex, { width: value * 12 })} /><V3NumberField label="Depth (feet)" value={feet(selectedBounds.maxZ - selectedBounds.minZ)} step={.5} onCommit={(value) => onUpdateCutout(selectedHoleIndex, { depth: value * 12 })} /></div><button onClick={() => onRemoveCutout(selectedHoleIndex)}>Remove cutout</button></div>}</section>
  </>;
}
