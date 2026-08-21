import { Suspense, lazy, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { applyPolygonRegionReplacement, PolygonEdgeReviewRequiredError } from "./commandsV3";
import { deriveDeckDesignProjectionV3 } from "./designProjectionV3";
import { derivePlatformGeometryV3 } from "./geometryV3";
import { createHistoryV3, designHistoryReducerV3 } from "./historyV3";
import { DEFAULT_DESIGN, updateDesign } from "./model";
import { deckDesignV3Fingerprint, migrateDeckDesignToV3, normalizeDeckDesignV3, stableDeckDesignV3Json, type DeckDesignV3, type DeckPlatformV3, type StairLandingConnectionV3, type StairLandingV3, type StairSystemV3 } from "./modelV3";
import { PlanViewV3 } from "./PlanViewV3";
import { formatFeetInches } from "./PlanView";
import { saveDeckDesignV3 } from "./storageV3";
import type { CameraPreset } from "./ThreeView";
import type { RenderQuality } from "./renderQuality";
import { addBumpoutOnEdge, movePolygonCorner, movePolygonSegment, resizePolygonEdge } from "./polygonEditorV3";
import { createDesignFromConfirmedPhotoFacts, type ConfirmedPhotoFacts, type PhotoIntakeReview } from "./photoIntake";
import { deriveGeometricPolygonEdges, type PolygonPoint } from "./polygon";
import { deriveHouseContextGeometry } from "./houseContextGeometry";
import { V3NumberField } from "./V3NumberField";

const ThreeViewV3 = lazy(async () => ({ default: (await import("./ThreeViewV3")).ThreeViewV3 }));
const PhotoIntake = lazy(async () => ({ default: (await import("./PhotoIntakeDialog")).PhotoIntake }));
const HouseConnectionEditor = lazy(async () => ({ default: (await import("./HouseConnectionEditor")).HouseConnectionEditor }));
const RailingStageControls = lazy(async () => ({ default: (await import("./RailingStageControls")).RailingStageControls }));
const RailingMobileActions = lazy(async () => ({ default: (await import("./RailingStageControls")).RailingMobileActions }));
const LandingConnectionsEditor = lazy(async () => ({ default: (await import("./LandingConnectionsEditor")).LandingConnectionsEditor }));
const LevelCutoutControls = lazy(async () => ({ default: (await import("./LevelCutoutControls")).LevelCutoutControls }));
type Point = Readonly<{ x: number; z: number }>;

function revisePlatform(design: DeckDesignV3, platform: DeckPlatformV3): DeckDesignV3 {
  return normalizeDeckDesignV3({ ...design, platforms: design.platforms.map((item) => item.id === platform.id ? platform : item), metadata: { ...design.metadata, revision: design.metadata.revision + 1 } });
}

export function V3App({ initialDesign, initialMessage = "Corner editor ready.", startWithPhotos = false }: { initialDesign: DeckDesignV3; initialMessage?: string; startWithPhotos?: boolean }) {
  const [history, dispatch] = useReducer(designHistoryReducerV3, initialDesign, createHistoryV3);
  const [preview, setPreview] = useState<DeckDesignV3 | null>(null);
  const [selectedPlatformId, setSelectedPlatformId] = useState(initialDesign.platforms[0].id);
  const design = preview ?? history.present;
  const platform = design.platforms.find((item) => item.id === selectedPlatformId) ?? design.platforms[0];
  const geometry = useMemo(() => derivePlatformGeometryV3(design, platform.id), [design, platform.id]);
  const contextPlatforms = useMemo(() => design.platforms.filter((item) => item.id !== platform.id).map((item) => ({ platform: item, geometry: derivePlatformGeometryV3(design, item.id) })), [design, platform.id]);
  const houseGeometry = useMemo(() => deriveHouseContextGeometry(design.siteContext), [design.siteContext]);
  const projection = useMemo(() => deriveDeckDesignProjectionV3(design), [design]);
  const [message, setMessage] = useState(initialMessage);
  const [snapIncrement, setSnapIncrement] = useState(6);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedStairSystemId, setSelectedStairSystemId] = useState<string | null>(null);
  const [selectedLandingId, setSelectedLandingId] = useState<string | null>(null);
  const [selectedHoleIndex, setSelectedHoleIndex] = useState<number | null>(null);
  const [landingPositionMode, setLandingPositionMode] = useState<"height" | "distance" | "below" | "above">("below");
  const [workflowStage, setWorkflowStage] = useState<"layout" | "railings">("layout");
  const [showFraming, setShowFraming] = useState(true);
  const [preset, setPreset] = useState<CameraPreset>("perspective");
  const [presetRequest, setPresetRequest] = useState(0);
  const [quality, setQuality] = useState<RenderQuality>("balanced");
  const [photoIntakeOpen, setPhotoIntakeOpen] = useState(startWithPhotos);
  const [photoStartSummary, setPhotoStartSummary] = useState<Readonly<{ photoCount: number; review: PhotoIntakeReview }> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const planActionTray = useRef<HTMLElement>(null);
  const activeStairSystem = platform.construction.stairSystems.find((system) => system.id === selectedStairSystemId) ?? null;
  const activeLanding = activeStairSystem?.landings.find((landing) => landing.id === selectedLandingId) ?? activeStairSystem?.landings.find((landing) => !landing.locked) ?? null;
  const activeTotalRisers = activeStairSystem ? Math.ceil((platform.elevation - design.siteContext.gradeElevation) / activeStairSystem.maxRiserHeight) : 0;
  const activeActualRise = activeTotalRisers ? (platform.elevation - design.siteContext.gradeElevation) / activeTotalRisers : 0;
  const hasEdgeReferences = platform.edgeConditions.some((condition) => condition.condition === "house_attachment") || platform.construction.railing.enabledEdgeIds.length > 0 || platform.construction.stairSystems.length > 0;
  const visibleGeometry = useMemo(() => workflowStage === "layout" ? { ...geometry, railSegments: [], railPosts: [] } : geometry, [geometry, workflowStage]);
  const visibleContextPlatforms = useMemo(() => contextPlatforms.map((item) => ({ platform: item.platform, geometry: workflowStage === "layout" ? { ...item.geometry, railSegments: [], railPosts: [] } : item.geometry })), [contextPlatforms, workflowStage]);
  const apply = (next: DeckDesignV3, nextMessage: string) => { setPreview(null); dispatch({ type: "apply", design: next }); setMessage(nextMessage); };
  const changeHistory = (type: "undo" | "redo") => { setPreview(null); setSelectedEdgeId(null); setSelectedStairSystemId(null); setSelectedLandingId(null); setSelectedHoleIndex(null); dispatch({ type }); setMessage(type === "undo" ? "Last change undone." : "Change restored."); };
  const replaceRegion = (outer: readonly Point[], commit: boolean, holes = platform.region.holes): boolean => {
    try {
      const result = applyPolygonRegionReplacement(history.present, platform.id, { outer, holes });
      if (commit) apply(result.design, result.notices.join(" ")); else setPreview(result.design);
      return true;
    } catch (error) {
      setPreview(null);
      if (error instanceof PolygonEdgeReviewRequiredError) {
        const affected = [...new Set(error.plan.impacts.flatMap((impact) => impact.usages))].join(", ");
        setMessage(`Outline paused: ${affected} linked items.`);
      } else setMessage(error instanceof Error ? error.message : "Outline rejected.");
      return false;
    }
  };
  const moveCorner = (index: number, point: Point, commit: boolean) => replaceRegion(movePolygonCorner(platform.region.outer, index, point, commit, snapIncrement), commit);
  const addCorner = (edgeIndex: number, point: Point) => {
    try {
      const outer = addBumpoutOnEdge(platform.region.outer, edgeIndex, point, snapIncrement);
      if (replaceRegion(outer, true)) {
        setSelectedEdgeId(null);
        setMessage("Bumpout added. Drag its handles to refine it.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Corner rejected.");
    }
  };
  const moveSegment = (edgeIndex: number, distance: number, commit: boolean) => {
    try {
      const current = history.present.platforms.find((item) => item.id === platform.id)!;
      replaceRegion(movePolygonSegment(current.region.outer, edgeIndex, distance, snapIncrement, commit), commit);
      if (commit) setMessage("Segment moved with its corners.");
    } catch (error) {
      setPreview(null);
      setMessage(error instanceof Error ? error.message : "Segment move rejected.");
    }
  };
  const updateSegmentLength = (edgeId: string, length: number) => {
    const edgeIndex = geometry.platformEdges.findIndex((edge) => edge.id === edgeId);
    if (edgeIndex < 0) { setMessage("Select a side before changing its length."); return; }
    try {
      const current = history.present.platforms.find((item) => item.id === platform.id)!;
      const nextOuter = resizePolygonEdge(current.region.outer, edgeIndex, length, snapIncrement);
      if (replaceRegion(nextOuter, true)) {
        setSelectedEdgeId(deriveGeometricPolygonEdges(nextOuter)[edgeIndex]?.id ?? null);
        setMessage(`Selected side changed to ${formatFeetInches(length)}.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Side length rejected.");
    }
  };
  const updatePlatform = (update: Partial<DeckPlatformV3>, nextMessage: string) => {
    const current = history.present.platforms.find((item) => item.id === platform.id)!;
    apply(revisePlatform(history.present, { ...current, ...update }), nextMessage);
  };
  const updateConstruction = (construction: DeckPlatformV3["construction"], nextMessage: string) => updatePlatform({ construction }, nextMessage);
  const platformBounds = platform.region.outer.reduce((bounds, point) => ({ minX: Math.min(bounds.minX, point.x), maxX: Math.max(bounds.maxX, point.x), minZ: Math.min(bounds.minZ, point.z), maxZ: Math.max(bounds.maxZ, point.z) }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  const nextPlatformId = () => { let index = 2; const ids = new Set(design.platforms.map((item) => item.id)); while (ids.has(`platform-${index}`)) index += 1; return `platform-${index}`; };
  const addLevel = async () => {
    try {
      const { addPlatformLevelV3 } = await import("./platformCommandsV3");
      const id = nextPlatformId();
      const result = addPlatformLevelV3(history.present, platform.id, id, Math.min(144, platform.elevation + 24), { x: platformBounds.maxX - platformBounds.minX + 24, z: 0 });
      apply(result.design, `${id.replaceAll("-", " ")} added. Position and height are editable.`);
      setSelectedPlatformId(id); setSelectedEdgeId(null); setSelectedStairSystemId(null); setSelectedLandingId(null); setSelectedHoleIndex(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Level could not be added."); }
  };
  const removeLevel = async () => {
    try {
      const { removePlatformV3 } = await import("./platformCommandsV3");
      const result = removePlatformV3(history.present, platform.id);
      apply(result.design, result.notices.join(" "));
      setSelectedPlatformId(result.design.platforms[0].id); setSelectedEdgeId(null); setSelectedStairSystemId(null); setSelectedLandingId(null); setSelectedHoleIndex(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Level could not be removed."); }
  };
  const movePlatformOrigin = (axis: "x" | "z", valueFeet: number) => {
    const target = valueFeet * 12;
    const delta = target - (axis === "x" ? platformBounds.minX : platformBounds.minZ);
    const translate = (point: Point): Point => Object.freeze({ x: point.x + (axis === "x" ? delta : 0), z: point.z + (axis === "z" ? delta : 0) });
    const outer = platform.region.outer.map(translate);
    const holes = platform.region.holes.map((hole) => hole.map(translate));
    if (replaceRegion(outer, true, holes)) setMessage(`Level position updated ${axis === "x" ? "left/right" : "away from house"}.`);
  };
  const rectangleHole = (centerX: number, centerZ: number, width: number, depth: number): readonly Point[] => Object.freeze([{ x: centerX - width / 2, z: centerZ - depth / 2 }, { x: centerX + width / 2, z: centerZ - depth / 2 }, { x: centerX + width / 2, z: centerZ + depth / 2 }, { x: centerX - width / 2, z: centerZ + depth / 2 }].map((point) => Object.freeze(point)));
  const addCutout = () => {
    try {
      const width = Math.min(36, platformBounds.maxX - platformBounds.minX - 24), depth = Math.min(36, platformBounds.maxZ - platformBounds.minZ - 24);
      if (width < 12 || depth < 12) throw new RangeError("This level is too small for a safe rectangular cutout.");
      const hole = rectangleHole((platformBounds.minX + platformBounds.maxX) / 2, (platformBounds.minZ + platformBounds.maxZ) / 2, width, depth);
      const holes = [...platform.region.holes, hole];
      if (replaceRegion(platform.region.outer, true, holes)) { setSelectedHoleIndex(holes.length - 1); setMessage("Cutout added. Set its exact center and size in feet."); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Cutout rejected."); }
  };
  const updateCutout = (index: number, update: Partial<{ centerX: number; centerZ: number; width: number; depth: number }>) => {
    const current = platform.region.holes[index]; if (!current) return;
    const bounds = current.reduce((result, point) => ({ minX: Math.min(result.minX, point.x), maxX: Math.max(result.maxX, point.x), minZ: Math.min(result.minZ, point.z), maxZ: Math.max(result.maxZ, point.z) }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
    const next = rectangleHole(update.centerX ?? (bounds.minX + bounds.maxX) / 2, update.centerZ ?? (bounds.minZ + bounds.maxZ) / 2, update.width ?? bounds.maxX - bounds.minX, update.depth ?? bounds.maxZ - bounds.minZ);
    const holes = platform.region.holes.map((hole, holeIndex) => holeIndex === index ? next : hole);
    if (replaceRegion(platform.region.outer, true, holes)) setMessage("Cutout updated exactly.");
  };
  const removeCutout = (index: number) => {
    if (replaceRegion(platform.region.outer, true, platform.region.holes.filter((_, holeIndex) => holeIndex !== index))) { setSelectedHoleIndex(null); setMessage("Cutout removed."); }
  };
  const moveCutout = (index: number, hole: readonly Point[], commit: boolean) => {
    const current = history.present.platforms.find((item) => item.id === platform.id)!;
    const holes = current.region.holes.map((item, holeIndex) => holeIndex === index ? hole : item);
    if (replaceRegion(current.region.outer, commit, holes) && commit) setMessage("Cutout position and size updated.");
  };
  const unlockOutline = () => {
    const current = history.present.platforms.find((item) => item.id === platform.id)!;
    const unlocked: DeckPlatformV3 = {
      ...current,
      edgeConditions: current.edgeConditions.map((condition) => ({ ...condition, condition: "free", attachment: "none" })),
      construction: {
        ...current.construction,
        railing: { ...current.construction.railing, enabledEdgeIds: [] },
        stairSystems: [],
      },
    };
    apply(revisePlatform(history.present, unlocked), "Outline unlocked; side options and stairs cleared.");
    setSelectedStairSystemId(null);
    setSelectedLandingId(null);
  };
  const addBumpoutToEdge = (edgeId: string) => {
    const edgeIndex = geometry.platformEdges.findIndex((edge) => edge.id === edgeId);
    const edge = geometry.platformEdges[edgeIndex];
    if (!edge) { setMessage("Select a side for the bumpout."); return; }
    addCorner(edgeIndex, { x: (edge.start.x + edge.end.x) / 2, z: (edge.start.z + edge.end.z) / 2 });
  };
  const applyRailing = (railing: DeckPlatformV3["construction"]["railing"], nextMessage: string) => updateConstruction({ ...platform.construction, railing }, nextMessage);
  const enterRailingStage = () => { setPreview(null); setSelectedEdgeId(null); setSelectedStairSystemId(null); setSelectedLandingId(null); setSelectedHoleIndex(null); setWorkflowStage("railings"); setMessage("Layout locked. Tap railing sides."); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const returnToLayoutStage = () => { setSelectedEdgeId(null); setSelectedStairSystemId(null); setSelectedLandingId(null); setSelectedHoleIndex(null); setWorkflowStage("layout"); setMessage("Layout reopened; attachments stay protected."); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const replaceStairSystems = (systems: readonly StairSystemV3[], nextMessage: string, previewOnly = false) => {
    try {
      const current = history.present.platforms.find((item) => item.id === platform.id)!;
      const next = revisePlatform(history.present, { ...current, construction: { ...current.construction, stairSystems: systems } });
      if (previewOnly) setPreview(next); else apply(next, nextMessage);
    } catch (error) { setPreview(null); setMessage(error instanceof Error ? error.message : "Stair update rejected."); }
  };
  const updateStairSystem = (update: Partial<StairSystemV3>, nextMessage: string, previewOnly = false) => {
    if (!activeStairSystem) { setMessage("Choose or add stairs first."); return; }
    replaceStairSystems(platform.construction.stairSystems.map((system) => system.id === activeStairSystem.id ? { ...system, ...update } : system), nextMessage, previewOnly);
  };
  const updateLanding = (update: Partial<StairLandingV3>, nextMessage: string) => {
    if (!activeStairSystem || !activeLanding) { setMessage("Select a landing first."); return; }
    updateStairSystem({ landings: activeStairSystem.landings.map((landing) => landing.id === activeLanding.id ? { ...landing, ...update } : landing) }, nextMessage);
  };
  const updateLandingConnection = (connectionId: string, update: Partial<StairLandingConnectionV3>, nextMessage: string) => {
    if (!activeLanding) return;
    updateLanding({ connections: activeLanding.connections.map((connection) => connection.id === connectionId ? { ...connection, ...update } : connection) }, nextMessage);
  };
  const nextSystemId = () => { let index = 1; const used = new Set(platform.construction.stairSystems.map((system) => system.id)); while (used.has(`stair-system-${index}`)) index += 1; return `stair-system-${index}`; };
  const lockStairData = (system: StairSystemV3): StairSystemV3 => ({ ...system, locked: true, landings: system.landings.map((landing) => ({ ...landing, locked: true, connections: landing.connections.map((connection) => ({ ...connection, locked: true })) })) });
  const addStairsToEdge = (edgeId: string, edgeLength: number) => {
    if (!platform.edgeConditions.some((condition) => condition.edgeId === edgeId && condition.condition === "free")) { setMessage("Stairs require a free side, not the house side."); return; }
    if (platform.construction.stairSystems.some((system) => system.edgeId === edgeId)) { setMessage("This side already has stairs. Choose another side."); return; }
    const id = nextSystemId();
    const width = 48;
    const system: StairSystemV3 = Object.freeze({ id, locked: false, edgeId, offset: Math.max(0, Math.min(48, edgeLength - width)), width, treadDepth: 10, maxRiserHeight: 7.75, landings: Object.freeze([]) });
    setSelectedStairSystemId(id); setSelectedLandingId(null);
    replaceStairSystems([...platform.construction.stairSystems.map(lockStairData), system], `Added ${id.replaceAll("-", " ")}.`);
  };
  const addLanding = (kind: "top" | "midway") => {
    if (!activeStairSystem || activeStairSystem.locked) { setMessage("Open stairs before adding a landing."); return; }
    const totalRisers = Math.ceil((platform.elevation - design.siteContext.gradeElevation) / activeStairSystem.maxRiserHeight);
    const existingTopLanding = activeStairSystem.landings.find((landing) => landing.afterRiser === 0);
    if (kind === "top" && existingTopLanding) { setSelectedLandingId(existingTopLanding.id); setMessage("This stair system already has a top landing."); return; }
    const midwayLandings = activeStairSystem.landings.filter((landing) => landing.afterRiser > 0);
    const previousMidway = midwayLandings.at(-1);
    const afterRiser = kind === "top" ? 0 : previousMidway ? Math.min(totalRisers - 1, previousMidway.afterRiser + Math.max(1, Math.floor((totalRisers - previousMidway.afterRiser) / 2))) : Math.floor(totalRisers / 2);
    if (kind === "midway" && (totalRisers < 2 || (previousMidway && afterRiser <= previousMidway.afterRiser))) { setMessage("No stair rise remains for another landing."); return; }
    const id = `${activeStairSystem.id}-landing-${activeStairSystem.landings.length + 1}`;
    const landing: StairLandingV3 = Object.freeze({ id, locked: false, afterRiser, width: activeStairSystem.width, depth: 48, turn: "straight", connections: Object.freeze([]) });
    setSelectedLandingId(id);
    updateStairSystem({ landings: [...activeStairSystem.landings, landing].sort((a, b) => a.afterRiser - b.afterRiser) }, `${kind === "top" ? "Top" : "Midway"} landing added.`);
  };
  useEffect(() => {
    if (!selectedLandingId) return;
    requestAnimationFrame(() => planActionTray.current?.scrollTo({ top: planActionTray.current.scrollHeight, behavior: "smooth" }));
  }, [selectedLandingId]);
  const updateMidwayLandingPosition = (mode: "height" | "distance" | "below" | "above", value: number) => {
    if (!activeStairSystem || !activeLanding || activeLanding.afterRiser === 0) return;
    const totalRisers = Math.ceil((platform.elevation - design.siteContext.gradeElevation) / activeStairSystem.maxRiserHeight);
    const actualRise = (platform.elevation - design.siteContext.gradeElevation) / totalRisers;
    let position = value;
    if (mode === "height") position = (platform.elevation - design.siteContext.gradeElevation - value) / actualRise;
    else if (mode === "distance") position = value / activeStairSystem.treadDepth;
    else if (mode === "above") position = totalRisers - value;
    const afterRiser = Math.max(1, Math.min(totalRisers - 1, Math.round(position)));
    if (activeStairSystem.landings.some((landing) => landing.id !== activeLanding.id && landing.afterRiser === afterRiser)) { setMessage("Another landing uses that position."); return; }
    updateLanding({ afterRiser }, "Landing position updated.");
  };
  const midwayLandingValue = () => {
    if (!activeStairSystem || !activeLanding) return 0;
    if (landingPositionMode === "height") return Math.round(((platform.elevation - design.siteContext.gradeElevation) - activeLanding.afterRiser * activeActualRise) * 100) / 100;
    if (landingPositionMode === "distance") return activeLanding.afterRiser * activeStairSystem.treadDepth;
    return landingPositionMode === "above" ? activeTotalRisers - activeLanding.afterRiser : activeLanding.afterRiser;
  };
  const addLandingConnection = (destination: "deck" | "grade", targetPlatformId?: string) => {
    if (!activeStairSystem || !activeLanding?.locked) { setMessage("Lock the landing before adding a flight."); return; }
    if (destination === "deck" && !targetPlatformId && activeLanding.afterRiser === 0) { setMessage("Choose another level or move this landing below the deck first."); return; }
    const last = activeLanding.connections.at(-1);
    if (last && !last.locked) { setMessage("Lock this flight before another."); return; }
    const usedDirections = new Set([activeLanding.turn, ...activeLanding.connections.map((connection) => connection.direction)]);
    const direction = (["left", "right", "straight"] as const).find((candidate) => !usedDirections.has(candidate));
    if (!direction) { setMessage("All landing sides are used."); return; }
    const id = `${activeLanding.id}-connection-${activeLanding.connections.length + 1}`;
    const connection: StairLandingConnectionV3 = Object.freeze({ id, locked: false, destination, direction, width: activeStairSystem.width, treadDepth: activeStairSystem.treadDepth, ...(targetPlatformId ? { targetPlatformId } : {}) });
    updateLanding({ connections: [...activeLanding.connections, connection] }, targetPlatformId ? `${targetPlatformId.replaceAll("-", " ")} elevation recorded for this connected flight. Exact edge alignment remains for review.` : `Connected another stair ${destination === "deck" ? "up to deck" : "down to grade"} through this shared landing.`);
  };
  const lockLanding = () => updateLanding({ locked: true }, "Landing locked. Another may now be added.");
  const lockStairSystem = () => {
    if (!activeStairSystem) return;
    replaceStairSystems(platform.construction.stairSystems.map((system) => system.id === activeStairSystem.id ? lockStairData(system) : system), "Stairs locked. You can add another set.");
    setSelectedStairSystemId(null); setSelectedLandingId(null); setSelectedEdgeId(null);
  };
  const selectLayoutEdge = (edgeId: string) => {
    setSelectedEdgeId(edgeId);
    const system = platform.construction.stairSystems.find((item) => item.edgeId === edgeId) ?? null;
    setSelectedStairSystemId(system?.id ?? null);
    setSelectedLandingId(system?.landings.find((landing) => !landing.locked)?.id ?? system?.landings[0]?.id ?? null);
    setMessage(system ? "Selected side and its stairs." : "Selected side.");
  };
  const updateHouseConnection = (next: DeckDesignV3, attachment: "unknown" | "ledger" | "non-ledger") => apply(next, attachment === "unknown" ? "House updated; connection needs field review." : "House connection updated.");
  const download = () => { const url = URL.createObjectURL(new Blob([stableDeckDesignV3Json(design)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = "deck-design-v3.json"; link.click(); URL.revokeObjectURL(url); };
  const applyTemplate = (kind: "rectangle" | "l-shape") => {
    const legacy = updateDesign(DEFAULT_DESIGN, kind === "rectangle" ? { kind } : { kind, cutoutWidth: 48, cutoutDepth: 48 });
    const next = migrateDeckDesignToV3({ ...legacy, id: design.id, name: design.name, metadata: { ...legacy.metadata, revision: design.metadata.revision + 1 } });
    apply(next, `${kind === "rectangle" ? "Rectangle" : "L-shape"} template applied in v3.`); setSelectedPlatformId(next.platforms[0].id); setSelectedEdgeId(null); setSelectedStairSystemId(null); setSelectedLandingId(null); setSelectedHoleIndex(null); setWorkflowStage("layout");
  };
  const photoBounds = platform.region.outer.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x), maxX: Math.max(bounds.maxX, point.x),
    minZ: Math.min(bounds.minZ, point.z), maxZ: Math.max(bounds.maxZ, point.z),
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  const initialPhotoFacts: ConfirmedPhotoFacts = {
    designName: design.name,
    layoutIntent: "rectangle",
    width: photoBounds.maxX - photoBounds.minX,
    projection: photoBounds.maxZ - photoBounds.minZ,
    surfaceElevation: null,
    doorWidth: null,
    attachment: platform.edgeConditions.find((condition) => condition.condition === "house_attachment")?.attachment as "unknown" | "ledger" | "non-ledger" | undefined ?? "unknown",
  };
  const startFromPhotos = (facts: ConfirmedPhotoFacts, review: PhotoIntakeReview, photoCount: number, confirmedOuter?: readonly PolygonPoint[], stairEdgeId?: string | null, stairOffset?: number | null, stairWidth?: number) => {
    const next = createDesignFromConfirmedPhotoFacts(history.present, facts, confirmedOuter, stairEdgeId, stairOffset, stairWidth);
    setPreview(null);
    dispatch({ type: "reset", design: next });
    setSelectedPlatformId(next.platforms[0].id);
    setSelectedEdgeId(null);
    setSelectedStairSystemId(null);
    setSelectedLandingId(null);
    setSelectedHoleIndex(null);
    setWorkflowStage("layout");
    setPhotoStartSummary(Object.freeze({ photoCount, review }));
    setPhotoIntakeOpen(false);
    setMessage(facts.layoutIntent === "non-standard"
      ? `Created a confirmed ${next.platforms[0].region.outer.length}-corner traced outline.`
      : `Created a confirmed ${formatFeetInches(facts.width)} × ${formatFeetInches(facts.projection)} rectangle.`);
  };

  return <main>
    {photoIntakeOpen && <Suspense fallback={<div className="photo-intake-backdrop"><div className="photo-intake-loading" role="status">Preparing local photo review…</div></div>}><PhotoIntake initialFacts={initialPhotoFacts} fallbackSurfaceElevation={platform.elevation} gradeElevation={design.siteContext.gradeElevation} onCancel={() => setPhotoIntakeOpen(false)} onStartDesign={startFromPhotos} /></Suspense>}
    <header className="topbar"><div className="brand-mark">M</div><div><p className="eyebrow">McKenzie Construction · isolated R&amp;D</p><h1>Deck Designer</h1></div><div className="header-actions"><button className="quiet" onClick={() => setPhotoIntakeOpen(true)}>Start with photos</button><button className="quiet" onClick={() => { saveDeckDesignV3(localStorage, design); setMessage(`Saved v3 locally at revision ${design.metadata.revision}.`); }}>Save locally</button><button className="quiet" onClick={download}>Download JSON</button><button className="primary" onClick={() => fileInput.current?.click()}>Load JSON</button><input ref={fileInput} hidden type="file" accept="application/json,.json" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const next = migrateDeckDesignToV3(JSON.parse(await file.text())); dispatch({ type: "reset", design: next }); setSelectedPlatformId(next.platforms[0].id); setWorkflowStage("layout"); setSelectedEdgeId(null); setSelectedStairSystemId(null); setSelectedLandingId(null); setSelectedHoleIndex(null); setMessage(`Loaded v3 design “${next.name}”.`); } catch (error) { setMessage(error instanceof Error ? `Load rejected: ${error.message}` : "Load rejected."); } event.target.value = ""; }} /></div></header>
    <section className="warning"><strong>Conceptual — not for construction.</strong> Field and qualified review required.</section>
    <nav className="designer-stage-nav" aria-label="Deck design stages"><button className={workflowStage === "layout" ? "active" : "complete"} onClick={returnToLayoutStage}><span>1</span> Deck layout</button><button className={workflowStage === "railings" ? "active" : ""} onClick={workflowStage === "layout" ? enterRailingStage : undefined}><span>2</span> Railings</button><span className="stage-coming-soon">Materials come next</span></nav>
    {workflowStage === "layout" ? <nav className="mobile-workspace-nav" aria-label="Mobile designer sections"><a href="#design-views">Plan &amp; 3D</a><a href="#design-controls">Setup</a><a href="#house-connection">House</a></nav> : <nav className="mobile-workspace-nav railing-mobile-nav" aria-label="Mobile railing sections"><a href="#design-views">Railing plan</a><a href="#railing-controls">Railing controls</a></nav>}
    <div className="workspace"><aside className="controls-panel" id="design-controls">
      {workflowStage === "layout" ? <>
      <div className="section-heading"><span>01</span><div><p>Deck setup</p><small>Global design settings</small></div></div>
      {photoStartSummary && <section className={`photo-start-summary${photoStartSummary.review.outlineWarning ? " needs-outline" : ""}`}><strong>Photo-assisted start</strong><p>{photoStartSummary.photoCount} photo{photoStartSummary.photoCount === 1 ? "" : "s"} reviewed. Confirmed facts made the geometry.</p>{photoStartSummary.review.outlineWarning && <p className="outline-warning">{photoStartSummary.review.outlineWarning}</p>}<small>{photoStartSummary.review.fieldVerification.length} field note{photoStartSummary.review.fieldVerification.length === 1 ? "" : "s"} remain.</small><button onClick={() => setPhotoIntakeOpen(true)}>Review photos</button></section>}
      <div className="shape-switch"><button onClick={() => applyTemplate("rectangle")}>Rectangle</button><button onClick={() => applyTemplate("l-shape")}>L-shape</button></div>
      <label className="field full"><span>Design name</span><input value={design.name} onChange={(event) => { try { apply(normalizeDeckDesignV3({ ...history.present, name: event.target.value, metadata: { ...history.present.metadata, revision: history.present.metadata.revision + 1 } }), "Design name updated."); } catch { /* retain */ } }} /></label>
      <Suspense fallback={<div className="house-editor-loading" role="status">Preparing level controls…</div>}><LevelCutoutControls platforms={design.platforms} platform={platform} platformBounds={platformBounds} selectedHoleIndex={selectedHoleIndex} onSelectPlatform={(platformId) => { setSelectedPlatformId(platformId); setSelectedEdgeId(null); setSelectedStairSystemId(null); setSelectedLandingId(null); setSelectedHoleIndex(null); }} onAddLevel={addLevel} onRemoveLevel={removeLevel} onMoveLevel={movePlatformOrigin} onAddCutout={addCutout} onSelectCutout={setSelectedHoleIndex} onUpdateCutout={updateCutout} onRemoveCutout={removeCutout} /></Suspense>
      <label className="field full"><span>Drag step</span><select value={snapIncrement} onChange={(event) => setSnapIncrement(Number(event.target.value))}><option value="1">1 inch · fine</option><option value="6">6 inches · standard</option><option value="12">12 inches · coarse</option></select></label>
      <div className="field-grid"><V3NumberField label="Level height (feet)" value={Math.round(platform.elevation / 12 * 100) / 100} step={.5} onCommit={(value) => updatePlatform({ elevation: value * 12 }, "Level height updated.")} /><V3NumberField label="Joist spacing (in)" value={platform.construction.framing.joistSpacing} onCommit={(value) => updateConstruction({ ...platform.construction, framing: { ...platform.construction.framing, joistSpacing: value } }, "Joist layout spacing updated.")} /></div>
      {hasEdgeReferences && <section className="selected-edge-card review-card"><strong>Edit deck outline</strong><p>Clear side options before reshaping.</p><button className="primary" onClick={unlockOutline}>Edit deck outline</button><small>Reattach side options afterward.</small></section>}
      <p className="outline-edit-feedback">{message}</p>
      <Suspense fallback={<div className="house-editor-loading" role="status">Preparing house connection…</div>}><HouseConnectionEditor design={design} platform={platform} onApply={updateHouseConnection} onError={setMessage} /></Suspense>
      <section className="stage-continue-card"><span>Layout ready?</span><strong>Lock it before railings.</strong><button className="primary" onClick={enterRailingStage}>Lock &amp; continue</button><small>You can return later.</small></section>
      </> : <Suspense fallback={<div className="house-editor-loading" role="status">Preparing railing workspace…</div>}><RailingStageControls platform={platform} geometry={geometry} selectedEdgeId={selectedEdgeId} onRailingChange={applyRailing} onHeight={(height) => updateConstruction({ ...platform.construction, railing: { ...platform.construction.railing, height } }, "Railing height updated exactly.")} onBack={returnToLayoutStage} /></Suspense>}
      <div className="history-actions"><button disabled={!history.past.length} onClick={() => changeHistory("undo")}>Undo</button><button disabled={!history.future.length} onClick={() => changeHistory("redo")}>Redo</button></div>
      <div className="design-facts"><div><span>Schema</span><strong>DeckDesign v3</strong></div><div><span>Revision</span><strong>{design.metadata.revision}</strong></div><div><span>Fingerprint</span><code>{deckDesignV3Fingerprint(design)}</code></div></div><p className="status-message" aria-live="polite">{message}</p>
    </aside><section className="visual-area" id="design-views">
      <article className="view-card plan-card"><div className="card-title"><div><span>{workflowStage === "layout" ? "Measured plan" : "Railing plan"}</span><small>{workflowStage === "layout" ? `2D · ${platform.id} · ${geometry.platformEdges.length} sides` : "2D · tap a railing side"}</small></div><div className="plan-card-tools"><strong>{formatFeetInches(platform.elevation)} high</strong><div className="plan-history-actions"><button disabled={!history.past.length} onClick={() => changeHistory("undo")}>Undo</button><button disabled={!history.future.length} onClick={() => changeHistory("redo")}>Redo</button></div></div></div><PlanViewV3 platform={platform} activeStairSystem={activeStairSystem} geometry={visibleGeometry} contextPlatforms={contextPlatforms.map((item) => ({ id: item.platform.id, elevation: item.platform.elevation, footprint: item.geometry.footprint }))} houseGeometry={houseGeometry} snapIncrement={snapIncrement} editingEnabled={workflowStage === "layout"} selectedEdgeId={selectedEdgeId} selectedHoleIndex={selectedHoleIndex} onSelectEdge={workflowStage === "layout" ? selectLayoutEdge : setSelectedEdgeId} onSelectContextPlatform={(platformId) => { setSelectedPlatformId(platformId); setSelectedEdgeId(null); setSelectedStairSystemId(null); setSelectedLandingId(null); setSelectedHoleIndex(null); setMessage(`${platformId.replaceAll("-", " ")} selected.`); }} onSelectHole={(index) => { setSelectedHoleIndex(index); setSelectedEdgeId(null); setSelectedStairSystemId(null); setSelectedLandingId(null); setMessage(`Cutout ${index + 1} selected. Drag the center to move it or a corner to resize it.`); }} onHolePreview={(index, hole) => moveCutout(index, hole, false)} onHoleCommit={(index, hole) => moveCutout(index, hole, true)} onCornerPreview={(index, point) => moveCorner(index, point, false)} onCornerCommit={(index, point) => moveCorner(index, point, true)} onCancel={() => setPreview(null)} onStairPreview={(offset) => updateStairSystem({ offset }, "", true)} onStairCommit={(offset) => updateStairSystem({ offset }, `Stairs moved to ${formatFeetInches(offset)}.`)} onSegmentPreview={(index, distance) => moveSegment(index, distance, false)} onSegmentCommit={(index, distance) => moveSegment(index, distance, true)} />
        {workflowStage === "layout" ? <section ref={planActionTray} className={`plan-action-tray${activeStairSystem ? " editing-stairs" : ""}`} aria-live="polite">
          {selectedEdgeId ? (() => {
            const edge = geometry.platformEdges.find((item) => item.id === selectedEdgeId);
            if (!edge) return <div className="plan-action-copy"><strong>Select a blueprint side</strong><small>Only that side’s controls will appear here.</small></div>;
            const isFree = platform.edgeConditions.some((condition) => condition.edgeId === edge.id && condition.condition === "free");
            const horizontal = Math.abs(edge.end.x - edge.start.x) >= Math.abs(edge.end.z - edge.start.z);
            const stairReference = horizontal ? edge.start.x <= edge.end.x ? "left" : "right" : edge.start.z <= edge.end.z ? "top" : "bottom";
            return <>
              <div className="plan-action-copy"><strong>{formatFeetInches(edge.length)} side selected</strong><small>{activeStairSystem ? `This side has stairs with ${activeStairSystem.landings.length} landing${activeStairSystem.landings.length === 1 ? "" : "s"}.` : isFree ? "Length, bumpout, and stair controls apply only to this side." : "House side selected. Stairs are unavailable here."}</small></div>
              <div className="plan-action-fields segment-fields"><V3NumberField label="Deck edge length (feet)" value={Math.round(edge.length / 12 * 100) / 100} step={.5} onCommit={(value) => updateSegmentLength(edge.id, value * 12)} />{activeStairSystem && !activeStairSystem.locked && <><V3NumberField label={`Stairs from ${stairReference} end (feet)`} value={Math.round(activeStairSystem.offset / 12 * 100) / 100} step={.5} onCommit={(value) => updateStairSystem({ offset: value * 12 }, `Stairs moved to ${value} feet from the ${stairReference} end.`)} /><V3NumberField label="Stair width (feet)" value={Math.round(activeStairSystem.width / 12 * 100) / 100} step={.5} onCommit={(value) => { const width = value * 12; updateStairSystem({ width, landings: activeStairSystem.landings.map((landing) => ({ ...landing, width: Math.max(landing.width, width) })) }, "Stair width updated exactly."); }} /></>}</div>
              {!activeStairSystem ? <div className="plan-action-buttons"><button disabled={hasEdgeReferences} onClick={() => addBumpoutToEdge(edge.id)}>{hasEdgeReferences ? "Edit shape first" : "Add bumpout"}</button><button className="primary" disabled={!isFree || edge.length < 48} onClick={() => addStairsToEdge(edge.id, edge.length)}>Add stairs</button></div> : activeStairSystem.locked ? <div className="plan-action-buttons"><button onClick={() => updateStairSystem({ locked: false }, "Stairs reopened for editing.")}>Edit stairs</button><button className="primary" onClick={() => { setSelectedEdgeId(null); setSelectedStairSystemId(null); setSelectedLandingId(null); }}>Close side</button></div> : <>
                <div className="automatic-standard-note"><strong>Step depth is automatic</strong><small>{activeStairSystem.treadDepth}&quot; conceptual standard; local code and field conditions still require review.</small></div>
                <div className="plan-action-buttons"><button onClick={() => addLanding("top")}>Add top landing</button><button onClick={() => addLanding("midway")}>Add midway landing</button><button className="primary" onClick={lockStairSystem}>Done with side</button></div>
                <div className="stair-railing-note"><strong>Stair railings included</strong><small>Tracked separately from deck railings.</small></div>
                {activeStairSystem.landings.length > 0 && <div className="landing-sequence">{activeStairSystem.landings.map((landing) => <button key={landing.id} className={landing.id === activeLanding?.id ? "active" : ""} onClick={() => setSelectedLandingId(landing.id)}><strong>{landing.afterRiser === 0 ? "Top landing" : "Midway landing"}</strong><small>after step {landing.afterRiser} · {landing.connections.length} connected · {landing.locked ? "locked" : "editing"}</small></button>)}</div>}
                {activeLanding && <div className="stair-landing-controls segment-landing-controls">
                  {activeLanding.afterRiser === 0 ? <div className="stair-railing-note"><strong>Top landing</strong><small>At deck height.</small></div> : <><div className="stair-railing-note"><strong>Midway landing position</strong><small>Use a known measurement.</small></div><label className="field"><span>Set midway landing by</span><select value={landingPositionMode} onChange={(event) => setLandingPositionMode(event.target.value as typeof landingPositionMode)}><option value="height">Height above grade</option><option value="distance">Distance from deck edge</option><option value="below">Steps below deck</option><option value="above">Steps above grade</option></select></label><V3NumberField label={landingPositionMode === "height" ? "Height above grade (in)" : landingPositionMode === "distance" ? "Distance from deck (in)" : landingPositionMode === "above" ? "Steps above grade" : "Steps below deck"} value={midwayLandingValue()} step={landingPositionMode === "above" || landingPositionMode === "below" ? 1 : .25} onCommit={(value) => updateMidwayLandingPosition(landingPositionMode, value)} /></>}
                  <div className="field-grid"><V3NumberField label="Landing width (feet)" value={Math.round(activeLanding.width / 12 * 100) / 100} step={.5} onCommit={(value) => updateLanding({ width: value * 12 }, "Landing width updated exactly.")} /><V3NumberField label="Landing depth (feet)" value={Math.round(activeLanding.depth / 12 * 100) / 100} step={.5} onCommit={(value) => updateLanding({ depth: value * 12 }, "Landing depth updated exactly.")} /></div>
                  <fieldset><legend>Direction after landing</legend><div className="toggle-grid">{(["straight", "left", "right"] as const).map((turn) => <button type="button" key={turn} className={`toggle${activeLanding.turn === turn ? " active" : ""}`} onClick={() => updateLanding({ turn, depth: turn === "straight" ? activeLanding.depth : Math.max(activeLanding.depth, activeStairSystem.width) }, `Stairs continue ${turn}.`)}>{turn}</button>)}</div><small>Viewed walking down.</small></fieldset>
                  {!activeLanding.locked && <button className="primary" onClick={lockLanding}>Finish landing details</button>}
                  {activeLanding.locked && <Suspense fallback={<div className="house-editor-loading" role="status">Preparing shared landing controls…</div>}><LandingConnectionsEditor landing={activeLanding} destinationPlatforms={design.platforms.filter((item) => item.id !== platform.id).map((item) => ({ id: item.id, label: `${item.id.replaceAll("-", " ")} · ${formatFeetInches(item.elevation)} high` }))} onAdd={addLandingConnection} onUpdateLanding={(connections, nextMessage) => updateLanding({ connections }, nextMessage)} onUpdateConnection={updateLandingConnection} /></Suspense>}
                </div>}
                <button className="remove-stairs" onClick={() => { const remaining = platform.construction.stairSystems.filter((system) => system.id !== activeStairSystem.id); replaceStairSystems(remaining, "Stairs removed from this side."); setSelectedStairSystemId(null); setSelectedLandingId(null); }}>Remove stairs from this side</button>
              </>}
              <p className="segment-action-status">{message}</p>
            </>;
          })() : <div className="plan-action-copy"><strong>Select a blueprint side</strong><small>Its length, stairs, and landings will appear here—nothing else.</small></div>}
        </section> : <Suspense fallback={<div className="mobile-plan-edge-actions"><p>Preparing railing controls…</p></div>}><RailingMobileActions platform={platform} geometry={geometry} selectedEdgeId={selectedEdgeId} onRailingChange={applyRailing} /></Suspense>}
      </article>
      <article className="view-card three-card"><div className="card-title"><div><span>{workflowStage === "layout" ? "Model view" : "Railing model"}</span><small>3D · design authority</small></div><div className="view-tools"><select value={quality} aria-label="3D quality" onChange={(event) => setQuality(event.target.value as RenderQuality)}><option value="economy">Economy</option><option value="balanced">Balanced</option><option value="detailed">Detailed</option></select><div className="camera-buttons">{(["perspective", "top", "front"] as CameraPreset[]).map((value) => <button key={value} className={preset === value ? "active" : ""} onClick={() => { setPreset(value); setPresetRequest((current) => current + 1); }}>{value}</button>)}</div></div></div><Suspense fallback={<div className="three-loading">Preparing model…</div>}><ThreeViewV3 platform={platform} geometry={visibleGeometry} contextPlatforms={visibleContextPlatforms} houseGeometry={houseGeometry} gradeElevation={design.siteContext.gradeElevation} preset={preset} presetRequest={presetRequest} showFraming={showFraming} quality={quality} /></Suspense><label className="check-row three-framing"><input type="checkbox" checked={showFraming} onChange={(event) => setShowFraming(event.target.checked)} />Show framing</label></article>
    </section></div>
    <section className="quantity-section"><div className="quantity-heading"><div><p className="eyebrow">Deterministic v3</p><h2>Conceptual quantities</h2></div><p>{photoStartSummary?.review.outlineWarning ? "Envelope quantities until reshaped." : "No prices or structural claims."}</p></div><div className="quantity-grid">{projection.aggregateQuantities.map((line) => <article className="quantity-card" key={line.key}><span>{line.key.replaceAll("-", " ")}</span><strong>{line.amount.toLocaleString()} <small>{line.unit}</small></strong><p>{line.sourceGeometry.length} geometry references.</p></article>)}</div></section>
  </main>;
}
