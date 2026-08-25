import { useEffect, useRef } from "react";
// @ts-ignore Isolated prototype dependency.
import * as THREE from "three";
// @ts-ignore Isolated prototype dependency.
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RENDER_QUALITY_POLICIES, type RenderQuality } from "./renderQuality";
import type { CameraPreset } from "./ThreeView";
import type { HouseContextGeometry } from "./houseContextGeometry";
import type { EdgeFinishGeometryV5 } from "./edgeFinishProjectionV5";

type FinishGeometry = Partial<EdgeFinishGeometryV5>;
type Point2 = Readonly<{ x: number; z: number }>;
type Point3 = Readonly<{ x: number; y: number; z: number }>;
type Member = Readonly<{ start: Point2; end: Point2 }>;
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
type Props = { platform: ThreeViewPlatform; geometry: ThreeViewGeometry; contextPlatforms?: readonly PlatformView[]; houseGeometry: HouseContextGeometry; gradeElevation: number; preset: CameraPreset; presetRequest: number; showFraming: boolean; quality: RenderQuality };
const EMPTY_CONTEXT_PLATFORMS: readonly PlatformView[] = Object.freeze([]);

export function disposeSceneResources(root: THREE.Object3D): Readonly<{ geometries: number; materials: number }> {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse((object: THREE.Object3D) => {
    if (!(object instanceof THREE.Mesh)) return;
    const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
    geometries.add(mesh.geometry);
    const meshMaterials: readonly THREE.Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    meshMaterials.forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  return Object.freeze({ geometries: geometries.size, materials: materials.size });
}

function member(group: THREE.Group, value: Readonly<{ start: { x: number; z: number }; end: { x: number; z: number } }>, y: number, height: number, depth: number, material: THREE.Material) {
  const dx = value.end.x - value.start.x, dz = value.end.z - value.start.z;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(dx, dz), height, depth), material);
  mesh.position.set((value.start.x + value.end.x) / 2, y, (value.start.z + value.end.z) / 2);
  mesh.rotation.y = -Math.atan2(dz, dx); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
}

function slopedMember(group: THREE.Group, value: Readonly<{ start: { x: number; y: number; z: number }; end: { x: number; y: number; z: number } }>, thickness: number, material: THREE.Material) {
  const direction = new THREE.Vector3(value.end.x - value.start.x, value.end.y - value.start.y, value.end.z - value.start.z);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(direction.length(), thickness, thickness), material);
  mesh.position.set((value.start.x + value.end.x) / 2, (value.start.y + value.end.y) / 2, (value.start.z + value.end.z) / 2);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction.normalize());
  mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
}

export function ThreeViewV3({ platform, geometry, contextPlatforms = EMPTY_CONTEXT_PLATFORMS, houseGeometry, gradeElevation, preset, presetRequest, showFraming, quality }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const platformViews = [...contextPlatforms, { platform, geometry }];
  const visiblePoints = platformViews.flatMap((item) => [...item.geometry.footprint, ...item.geometry.stairTreads.flatMap((tread) => tread.corners), ...item.geometry.landings.flatMap((landing) => landing.corners)]);
  const xs = visiblePoints.map((point) => point.x), zs = visiblePoints.map((point) => point.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const centerX = (minX + maxX) / 2, centerZ = (minZ + maxZ) / 2, span = Math.max(maxX - minX, maxZ - minZ, 120);

  useEffect(() => {
    const mount = mountRef.current; if (!mount) return;
    const policy = RENDER_QUALITY_POLICIES[quality];
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe8eee9);
    const camera = new THREE.PerspectiveCamera(40, 1, 1, 4000); cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ antialias: quality !== "economy" }); renderer.setPixelRatio(Math.min(devicePixelRatio, policy.maxPixelRatio)); renderer.shadowMap.enabled = policy.shadows; mount.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.screenSpacePanning = true; controlsRef.current = controls;
    scene.add(new THREE.HemisphereLight(0xfff8e8, 0x54685d, 2.1));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-220, 360, 160); sun.castShadow = true; sun.shadow.mapSize.set(policy.shadowMapSize, policy.shadowMapSize); scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color: 0x7f9675, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = gradeElevation; ground.receiveShadow = true; scene.add(ground);
    const model = new THREE.Group();
    const deck = new THREE.MeshStandardMaterial({ color: 0x8b6545, roughness: .68 });
    const frame = new THREE.MeshStandardMaterial({ color: 0xb48a5d, roughness: .86 });
    const rail = new THREE.MeshStandardMaterial({ color: 0x263a32, roughness: .55 });
    const fascia = new THREE.MeshStandardMaterial({ color: 0x60422d, roughness: .75 });
    const skirting = new THREE.MeshStandardMaterial({ color: 0x71523a, roughness: .9 });
    const house = new THREE.MeshStandardMaterial({ color: 0xd9d5ca, roughness: .92 });
    for (const panel of houseGeometry.houseWallPanels) member(model, panel, panel.baseElevation + panel.height / 2, panel.height, 8, house);
    for (const view of platformViews) {
      const itemPlatform = view.platform, itemGeometry = view.geometry;
      for (const board of itemGeometry.surfaceBoards) member(model, board, itemPlatform.elevation, 1, itemPlatform.construction.decking.boardWidth, deck);
      if (showFraming) {
        for (const joist of itemGeometry.joists) member(model, joist, itemPlatform.elevation - 5, 7.25, 1.5, frame);
        for (const beam of itemGeometry.beams) member(model, beam, itemPlatform.elevation - 13, 9.25, 4.5, frame);
        for (const post of itemGeometry.supportPosts) { const height = Math.max(1, post.top - gradeElevation); const mesh = new THREE.Mesh(new THREE.BoxGeometry(5.5, height, 5.5), frame); mesh.position.set(post.x, gradeElevation + height / 2, post.z); mesh.castShadow = true; model.add(mesh); }
      }
      for (const span of itemGeometry.fasciaSpans ?? []) member(model, span, itemPlatform.elevation - 4, 8, 1.5, fascia);
      for (const panel of itemGeometry.skirtingPanels ?? []) member(model, panel, (panel.top + panel.bottom) / 2, Math.max(1, panel.top - panel.bottom), 1.5, skirting);
      for (const segment of itemGeometry.railSegments) { member(model, segment, itemPlatform.elevation + itemPlatform.construction.railing.height - 2, 3, 2.5, rail); member(model, segment, itemPlatform.elevation + 7, 2, 2, rail); }
      for (const segment of itemGeometry.landingRailSegments) { member(model, segment, segment.y + itemPlatform.construction.railing.height - 2, 3, 2.5, rail); member(model, segment, segment.y + 7, 2, 2, rail); }
      for (const post of [...itemGeometry.railPosts, ...itemGeometry.landingRailPosts]) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, itemPlatform.construction.railing.height, 4), rail); mesh.position.set(post.x, post.top - itemPlatform.construction.railing.height / 2, post.z); mesh.castShadow = true; model.add(mesh); }
      for (const segment of itemGeometry.stairRailSegments) slopedMember(model, segment, 3, rail);
      for (const post of itemGeometry.stairRailPosts) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, post.height, 4), rail); mesh.position.set(post.x, post.y + post.height / 2, post.z); mesh.castShadow = true; model.add(mesh); }
      for (const tread of itemGeometry.stairTreads) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(tread.width, Math.max(1.5, tread.rise), tread.depth), deck); mesh.position.set(tread.x, tread.y + Math.max(1.5, tread.rise) / 2, tread.z); mesh.rotation.y = tread.rotationY; mesh.castShadow = true; model.add(mesh); }
      for (const landing of itemGeometry.landings) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(landing.width, 5.5, landing.depth), deck); mesh.position.set(landing.center.x, landing.y - 2.25, landing.center.z); mesh.rotation.y = landing.rotationY; model.add(mesh); }
      if (showFraming) for (const post of itemGeometry.landingSupportPosts) { const height = Math.max(1, post.top - gradeElevation); const mesh = new THREE.Mesh(new THREE.BoxGeometry(6, height, 6), frame); mesh.position.set(post.x, gradeElevation + height / 2, post.z); mesh.castShadow = true; model.add(mesh); }
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
  }, [platform, geometry, contextPlatforms, houseGeometry, gradeElevation, quality, showFraming, centerX, centerZ, span]);

  useEffect(() => {
    const camera = cameraRef.current, controls = controlsRef.current; if (!camera || !controls) return;
    const center = new THREE.Vector3(centerX, platform.elevation / 2, centerZ); controls.target.copy(center);
    if (preset === "top") camera.position.set(centerX, platform.elevation + span * 1.5, centerZ + .01);
    if (preset === "front") camera.position.set(centerX, platform.elevation + 45, maxZ + span * 1.4);
    if (preset === "perspective") camera.position.set(centerX + span, platform.elevation + span, centerZ + span);
    camera.lookAt(center); controls.update();
  }, [preset, presetRequest, centerX, centerZ, maxZ, span, platform.elevation]);
  return <div className="three-mount" ref={mountRef} aria-label="Interactive polygon deck model" />;
}
