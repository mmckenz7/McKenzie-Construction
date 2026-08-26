import { useEffect, useRef } from "react";
// @ts-ignore Isolated prototype dependency.
import { AmbientLight, BoxGeometry, Color, DirectionalLight, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, Vector3, WebGLRenderer } from "three";
// @ts-ignore Isolated prototype dependency.
import type { BufferGeometry, Material, Object3D } from "three";
import { CONCEPTUAL_BEAM_CENTER_OFFSET, CONCEPTUAL_BEAM_HEIGHT, CONCEPTUAL_SUPPORT_POST_SIZE, conceptualSupportPostTop } from "./beamProjection";
// @ts-ignore Isolated prototype dependency.
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RENDER_QUALITY_POLICIES, type RenderQuality } from "./renderQuality";
import { CONCEPTUAL_JOIST_CENTER_OFFSET, CONCEPTUAL_JOIST_HEIGHT } from "./polygonProjection";
import type { CameraPreset } from "./ThreeView";
import type { HouseContextGeometry } from "./houseContextGeometry";
import type { EdgeFinishGeometryV5 } from "./edgeFinishProjectionV5";
import { DISPLAYED_STAIR_LANDING_CENTER_OFFSET, DISPLAYED_STAIR_LANDING_HEIGHT, DISPLAYED_STAIR_TREAD_MINIMUM_HEIGHT } from "./stairRouteGeometryV3";

type FinishGeometry = Partial<EdgeFinishGeometryV5>;
type Point2 = Readonly<{ x: number; z: number }>;
type Point3 = Readonly<{ x: number; y: number; z: number }>;
type Member = Readonly<{ id?: string; start: Point2; end: Point2 }>;
type Post = Readonly<{ x: number; z: number; top: number }>;
export type ThreeViewPlatform = Readonly<{ id: string; elevation: number; construction: Readonly<{ decking: Readonly<{ boardWidth: number }>; railing: Readonly<{ height: number }> }> }>;
export type ThreeViewGeometry = Readonly<{
  footprint: readonly Point2[];
  surfaceBoards: readonly Member[];
  joists: readonly Member[];
  beams: readonly Member[];
  supportPosts: readonly Post[];
  railSegments: readonly Member[];
  landingRailSegments: readonly (Member & Readonly<{ y: number }>)[];
  railPosts: readonly Post[];
  landingRailPosts: readonly Post[];
  stairRailSegments: readonly Readonly<{ start: Point3; end: Point3 }>[];
  stairRailPosts: readonly Readonly<{ x: number; y: number; z: number; height: number }>[];
  stairTreads: readonly Readonly<{ x: number; y: number; z: number; width: number; depth: number; rise: number; rotationY: number; corners: readonly Point2[] }>[];
  landings: readonly Readonly<{ center: Point2; y: number; width: number; depth: number; rotationY: number; corners: readonly Point2[] }>[];
  landingSupportPosts: readonly Post[];
}> & FinishGeometry;
type PlatformView = Readonly<{ platform: ThreeViewPlatform; geometry: ThreeViewGeometry }>;
export type RenderPalette = "cedar" | "brown" | "gray";
export const RENDER_PALETTES = Object.freeze({
  cedar: Object.freeze({ deck: 0x9b633f, border: 0x74462e, fascia: 0x6a432d, skirting: 0x7b563c }),
  brown: Object.freeze({ deck: 0x684630, border: 0x493023, fascia: 0x4a3023, skirting: 0x59402f }),
  gray: Object.freeze({ deck: 0x817b72, border: 0x5d5953, fascia: 0x5d5953, skirting: 0x6b6760 }),
});
export const isPictureFrameBorderMember = (member: Readonly<{ id?: string }>): boolean =>
  member.id?.startsWith("picture-frame-border-") === true || member.id?.startsWith("picture-frame-hole-") === true;
type Props = { platform: ThreeViewPlatform; geometry: ThreeViewGeometry; contextPlatforms?: readonly PlatformView[]; houseGeometry: HouseContextGeometry; gradeElevation: number; preset: CameraPreset; presetRequest: number; showFraming: boolean; quality: RenderQuality; palette?: RenderPalette };
const EMPTY_CONTEXT_PLATFORMS: readonly PlatformView[] = Object.freeze([]);

export function disposeSceneResources(root: Object3D): Readonly<{ geometries: number; materials: number }> {
  const geometries = new Set<BufferGeometry>(), materials = new Set<Material>();
  root.traverse((object: Object3D) => {
    if (!(object instanceof Mesh)) return;
    const mesh = object as Mesh<BufferGeometry, Material | Material[]>;
    geometries.add(mesh.geometry);
    const meshMaterials: readonly Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    meshMaterials.forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  return Object.freeze({ geometries: geometries.size, materials: materials.size });
}

export function ThreeViewV3({ platform, geometry, contextPlatforms = EMPTY_CONTEXT_PLATFORMS, houseGeometry, gradeElevation, preset, presetRequest, showFraming, quality, palette = "cedar" }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const platformViews = [...contextPlatforms, { platform, geometry }];
  const visiblePoints = platformViews.flatMap((item) => [...item.geometry.footprint, ...item.geometry.stairTreads.flatMap((tread) => tread.corners), ...item.geometry.landings.flatMap((landing) => landing.corners)]);
  const xs = visiblePoints.map((point) => point.x), zs = visiblePoints.map((point) => point.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const centerX = (minX + maxX) / 2, centerZ = (minZ + maxZ) / 2, span = Math.max(maxX - minX, maxZ - minZ, 120);

  useEffect(() => {
    const mount = mountRef.current; if (!mount) return;
    const policy = RENDER_QUALITY_POLICIES[quality];
    const scene = new Scene(); scene.background = new Color(0xdde8ec);
    const camera = new PerspectiveCamera(40, 1, 1, 4000); cameraRef.current = camera;
    const renderer = new WebGLRenderer({ antialias: quality !== "economy" }); renderer.setPixelRatio(Math.min(devicePixelRatio, policy.maxPixelRatio)); renderer.shadowMap.enabled = policy.shadows; mount.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.screenSpacePanning = true; controlsRef.current = controls;
    scene.add(new AmbientLight(0xfff3db, 1.35));
    const sun = new DirectionalLight(0xfff0d2, 2.5); sun.position.set(-220, 360, 160); sun.castShadow = true; sun.shadow.mapSize.set(policy.shadowMapSize, policy.shadowMapSize); Object.assign(sun.shadow.camera, { left: -500, right: 500, top: 500, bottom: -500, far: 1200 }); sun.shadow.camera.updateProjectionMatrix(); scene.add(sun);
    const ground = new Mesh(new PlaneGeometry(3000, 3000), new MeshStandardMaterial({ color: 0x718866, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = gradeElevation; ground.receiveShadow = true; scene.add(ground);
    const model = new Group();
    const colors = RENDER_PALETTES[palette];
    const unitBox = new BoxGeometry(1, 1, 1);
    const box = (width: number, height: number, depth: number, material: Material) => { const mesh = new Mesh(unitBox, material); mesh.scale.set(width, height, depth); mesh.castShadow = true; model.add(mesh); return mesh; };
    const member = (value: Member, y: number, height: number, depth: number, material: Material) => { const dx = value.end.x - value.start.x, dz = value.end.z - value.start.z; const mesh = box(Math.hypot(dx, dz), height, depth, material); mesh.position.set((value.start.x + value.end.x) / 2, y, (value.start.z + value.end.z) / 2); mesh.rotation.y = -Math.atan2(dz, dx); mesh.receiveShadow = true; };
    const slopedMember = (value: Readonly<{ start: Point3; end: Point3 }>, thickness: number, material: Material) => { const direction = new Vector3(value.end.x - value.start.x, value.end.y - value.start.y, value.end.z - value.start.z); const mesh = box(direction.length(), thickness, thickness, material); mesh.position.set((value.start.x + value.end.x) / 2, (value.start.y + value.end.y) / 2, (value.start.z + value.end.z) / 2); mesh.quaternion.setFromUnitVectors(new Vector3(1, 0, 0), direction.normalize()); mesh.receiveShadow = true; };
    const deck = new MeshStandardMaterial({ color: colors.deck, roughness: .7 });
    const deckBorder = new MeshStandardMaterial({ color: colors.border, roughness: .68 });
    const frame = new MeshStandardMaterial({ color: 0x76563d, roughness: .86 });
    const rail = new MeshStandardMaterial({ color: 0x25332e, roughness: .55 });
    const fascia = new MeshStandardMaterial({ color: colors.fascia, roughness: .75 });
    const skirting = new MeshStandardMaterial({ color: colors.skirting, roughness: .9 });
    const house = new MeshStandardMaterial({ color: 0xd8d2c4, roughness: .92 });
    for (const panel of houseGeometry.houseWallPanels) member(panel, panel.baseElevation + panel.height / 2, panel.height, 8, house);
    for (const view of platformViews) {
      const itemPlatform = view.platform, itemGeometry = view.geometry;
      for (const board of itemGeometry.surfaceBoards) member(board, itemPlatform.elevation, 1, itemPlatform.construction.decking.boardWidth, isPictureFrameBorderMember(board) ? deckBorder : deck);
      if (showFraming) {
        for (const joist of itemGeometry.joists) member(joist, itemPlatform.elevation - CONCEPTUAL_JOIST_CENTER_OFFSET, CONCEPTUAL_JOIST_HEIGHT, 1.5, frame);
        for (const beam of itemGeometry.beams) member(beam, itemPlatform.elevation - CONCEPTUAL_BEAM_CENTER_OFFSET, CONCEPTUAL_BEAM_HEIGHT, 4.5, frame);
        for (const post of itemGeometry.supportPosts) { const top = conceptualSupportPostTop(post.top, gradeElevation); const height = top - gradeElevation; const mesh = box(CONCEPTUAL_SUPPORT_POST_SIZE, height, CONCEPTUAL_SUPPORT_POST_SIZE, frame); mesh.position.set(post.x, gradeElevation + height / 2, post.z); }
      }
      for (const span of itemGeometry.fasciaSpans ?? []) member(span, itemPlatform.elevation - 4, 8, 1.5, fascia);
      for (const panel of itemGeometry.skirtingPanels ?? []) member(panel, (panel.top + panel.bottom) / 2, Math.max(1, panel.top - panel.bottom), 1.5, skirting);
      for (const segment of itemGeometry.railSegments) { member(segment, itemPlatform.elevation + itemPlatform.construction.railing.height - 2, 3, 2.5, rail); member(segment, itemPlatform.elevation + 7, 2, 2, rail); }
      for (const segment of itemGeometry.landingRailSegments) { member(segment, segment.y + itemPlatform.construction.railing.height - 2, 3, 2.5, rail); member(segment, segment.y + 7, 2, 2, rail); }
      for (const post of [...itemGeometry.railPosts, ...itemGeometry.landingRailPosts]) { const mesh = box(4, itemPlatform.construction.railing.height, 4, rail); mesh.position.set(post.x, post.top - itemPlatform.construction.railing.height / 2, post.z); }
      for (const segment of itemGeometry.stairRailSegments) slopedMember(segment, 3, rail);
      for (const post of itemGeometry.stairRailPosts) { const mesh = box(4, post.height, 4, rail); mesh.position.set(post.x, post.y + post.height / 2, post.z); }
      for (const tread of itemGeometry.stairTreads) { const height = Math.max(DISPLAYED_STAIR_TREAD_MINIMUM_HEIGHT, tread.rise); const mesh = box(tread.width, height, tread.depth, deck); mesh.position.set(tread.x, tread.y + height / 2, tread.z); mesh.rotation.y = tread.rotationY; }
      for (const landing of itemGeometry.landings) { const mesh = box(landing.width, DISPLAYED_STAIR_LANDING_HEIGHT, landing.depth, deck); mesh.position.set(landing.center.x, landing.y + DISPLAYED_STAIR_LANDING_CENTER_OFFSET, landing.center.z); mesh.rotation.y = landing.rotationY; }
      if (showFraming) for (const post of itemGeometry.landingSupportPosts) { const height = Math.max(1, post.top - gradeElevation); const mesh = box(6, height, 6, frame); mesh.position.set(post.x, gradeElevation + height / 2, post.z); }
    }
    scene.add(model);
    const resize = () => { const width = Math.max(1, mount.clientWidth), height = Math.max(1, mount.clientHeight); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(mount); resize();
    camera.position.set(centerX + span, platform.elevation + span, centerZ + span); controls.target.set(centerX, platform.elevation / 2, centerZ); controls.update();
    let frameId = 0; const animate = () => { controls.update(); renderer.render(scene, camera); frameId = requestAnimationFrame(animate); }; animate();
    return () => {
      cancelAnimationFrame(frameId); observer.disconnect(); controls.dispose(); renderer.dispose();
      disposeSceneResources(scene);
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      if (cameraRef.current === camera) cameraRef.current = null;
      if (controlsRef.current === controls) controlsRef.current = null;
    };
  }, [platform, geometry, contextPlatforms, houseGeometry, gradeElevation, quality, showFraming, palette, centerX, centerZ, span]);

  useEffect(() => {
    const camera = cameraRef.current, controls = controlsRef.current; if (!camera || !controls) return;
    const center = new Vector3(centerX, platform.elevation / 2, centerZ); controls.target.copy(center);
    if (preset === "top") camera.position.set(centerX, platform.elevation + span * 1.5, centerZ + .01);
    if (preset === "front") camera.position.set(centerX, platform.elevation + 45, maxZ + span * 1.4);
    if (preset === "perspective") camera.position.set(centerX + span, platform.elevation + span, centerZ + span);
    camera.lookAt(center); controls.update();
  }, [preset, presetRequest, centerX, centerZ, maxZ, span, platform.elevation, geometry, contextPlatforms, houseGeometry, gradeElevation, quality, showFraming, palette]);
  return <div className="three-mount" ref={mountRef} aria-label="Interactive polygon deck model" />;
}
