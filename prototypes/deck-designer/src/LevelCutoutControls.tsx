import { useState } from "react";
import type { DeckPlatformV3 } from "./modelV3";
import { formatFeetInches } from "./PlanView";
import { V3NumberField } from "./V3NumberField";

type Bounds = Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;

type Props = {
  platforms: readonly DeckPlatformV3[];
  platform: DeckPlatformV3;
  platformBounds: Bounds;
  selectedHoleIndex: number | null;
  levelView: "selected" | "combined";
  onSelectPlatform: (platformId: string) => void;
  onLevelViewChange: (view: "selected" | "combined") => void;
  onAddLevel: (heightFeet: number) => void;
  onRemoveLevel: () => void;
  onSetElevation: (valueFeet: number) => void;
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

export function LevelCutoutControls({ platforms, platform, platformBounds, selectedHoleIndex, levelView, onSelectPlatform, onLevelViewChange, onAddLevel, onRemoveLevel, onSetElevation, onMoveLevel, onAddCutout, onSelectCutout, onUpdateCutout, onRemoveCutout }: Props) {
  const [newLevelHeight, setNewLevelHeight] = useState("");
  const selectedHole = selectedHoleIndex === null ? null : platform.region.holes[selectedHoleIndex] ?? null;
  const selectedBounds = selectedHole ? bounds(selectedHole) : null;
  const nextHeight = Number(newLevelHeight);
  const canAddLevel = newLevelHeight.trim() !== "" && Number.isFinite(nextHeight) && nextHeight >= .5 && nextHeight <= 30;
  return <>
    <section className="level-layer-controls"><div><strong>Deck levels</strong><small>Select a layer to edit independently.</small></div>{platforms.length > 1 && <div className="level-layer-list">{platforms.map((item, index) => <button type="button" key={item.id} className={item.id === platform.id ? "active" : ""} aria-pressed={item.id === platform.id} onClick={() => onSelectPlatform(item.id)}><span>Level {index + 1}</span><strong>{formatFeetInches(item.elevation)}</strong><small>above grade</small></button>)}</div>}{platforms.length > 1 && <fieldset><legend>Plan and model view</legend><div className="toggle-grid two"><button type="button" className={`toggle${levelView === "selected" ? " active" : ""}`} onClick={() => onLevelViewChange("selected")}>Selected layer</button><button type="button" className={`toggle${levelView === "combined" ? " active" : ""}`} onClick={() => onLevelViewChange("combined")}>Combined view</button></div><small>{levelView === "combined" ? "All levels are visible. Drag the selected layer in the plan for rough placement." : "Only the selected level is shown while you edit it."}</small></fieldset>}<V3NumberField label="Height above grade (feet)" value={feet(platform.elevation)} step={.5} onCommit={onSetElevation} /><small className="level-height-note">Enter the measured deck-surface height above grade.</small></section>
    <div className="new-level-controls"><label className="field"><span>New level height above grade (feet)</span><input type="number" min="0.5" max="30" step="0.5" placeholder="Enter measured height" value={newLevelHeight} onChange={(event) => setNewLevelHeight(event.target.value)} /></label><button className="primary" disabled={!canAddLevel} onClick={() => { onAddLevel(nextHeight); setNewLevelHeight(""); }}>Add another level</button></div>
    {platforms.length > 1 && <div className="level-actions single"><button onClick={onRemoveLevel}>Remove selected level</button></div>}
    {platforms.length > 1 && <div className="field-grid level-position-fields"><V3NumberField label="Left/right position (feet)" value={feet(platformBounds.minX)} step={.5} onCommit={(value) => onMoveLevel("x", value)} /><V3NumberField label="Distance from house (feet)" value={feet(platformBounds.minZ)} step={.5} onCommit={(value) => onMoveLevel("z", value)} /></div>}
    <section className="cutout-controls"><div><strong>Cutouts and obstacles</strong><small>For trees, pools, and openings inside this level.</small></div><button onClick={onAddCutout}>Add rectangular cutout</button>{platform.region.holes.length > 0 && <label className="field"><span>Cutout to edit</span><select value={selectedHoleIndex ?? ""} onChange={(event) => onSelectCutout(event.target.value === "" ? null : Number(event.target.value))}><option value="">Choose a cutout…</option>{platform.region.holes.map((_, index) => <option key={index} value={index}>Cutout {index + 1}</option>)}</select></label>}{selectedBounds && selectedHoleIndex !== null && <div className="cutout-editor"><div className="field-grid"><V3NumberField label="Center left/right (feet)" value={feet((selectedBounds.minX + selectedBounds.maxX) / 2)} step={.5} onCommit={(value) => onUpdateCutout(selectedHoleIndex, { centerX: value * 12 })} /><V3NumberField label="Center away (feet)" value={feet((selectedBounds.minZ + selectedBounds.maxZ) / 2)} step={.5} onCommit={(value) => onUpdateCutout(selectedHoleIndex, { centerZ: value * 12 })} /><V3NumberField label="Width (feet)" value={feet(selectedBounds.maxX - selectedBounds.minX)} step={.5} onCommit={(value) => onUpdateCutout(selectedHoleIndex, { width: value * 12 })} /><V3NumberField label="Depth (feet)" value={feet(selectedBounds.maxZ - selectedBounds.minZ)} step={.5} onCommit={(value) => onUpdateCutout(selectedHoleIndex, { depth: value * 12 })} /></div><button onClick={() => onRemoveCutout(selectedHoleIndex)}>Remove cutout</button></div>}</section>
  </>;
}
