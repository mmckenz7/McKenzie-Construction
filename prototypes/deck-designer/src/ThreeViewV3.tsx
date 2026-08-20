import { useEffect, useRef } from "react";
// @ts-ignore Isolated prototype dependency.
import * as THREE from "three";
// @ts-ignore Isolated prototype dependency.
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { DeckPlatformGeometryV3 } from "./geometryV3";
import type { DeckPlatformV3 } from "./modelV3";
import { RENDER_QUALITY_POLICIES, type RenderQuality } from "./renderQuality";
import type { CameraPreset } from "./ThreeView";
import type { HouseContextGeometry } from "./houseContextGeometry";

type Props = { platform: DeckPlatformV3; geometry: DeckPlatformGeometryV3; houseGeometry: HouseContextGeometry; gradeElevation: number; preset: CameraPreset; presetRequest: number; showFraming: boolean; quality: RenderQuality };

function member(group: THREE.Group, value: Readonly<{ start: { x: number; z: number }; end: { x: number; z: number } }>, y: number, height: number, depth: number, material: THREE.Material) {
  const dx = value.end.x - value.start.x, dz = value.end.z - value.start.z;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(dx, dz), height, depth), material);
  mesh.position.set((value.start.x + value.end.x) / 2, y, (value.start.z + value.end.z) / 2);
  mesh.rotation.y = -Math.atan2(dz, dx); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
}

export function ThreeViewV3({ platform, geometry, houseGeometry, gradeElevation, preset, presetRequest, showFraming, quality }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const xs = geometry.footprint.map((point) => point.x), zs = geometry.footprint.map((point) => point.z);
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
    const house = new THREE.MeshStandardMaterial({ color: 0xd9d5ca, roughness: .92 });
    for (const panel of houseGeometry.houseWallPanels) member(model, panel, panel.baseElevation + panel.height / 2, panel.height, 8, house);
    for (const board of geometry.surfaceBoards) member(model, board, platform.elevation, 1, platform.construction.decking.boardWidth, deck);
    if (showFraming) for (const joist of geometry.joists) member(model, joist, platform.elevation - 5, 7.25, 1.5, frame);
    for (const segment of geometry.railSegments) { member(model, segment, platform.elevation + platform.construction.railing.height - 2, 3, 2.5, rail); member(model, segment, platform.elevation + 7, 2, 2, rail); }
    for (const post of [...geometry.railPosts, ...geometry.landingRailPosts]) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, platform.construction.railing.height, 4), rail); mesh.position.set(post.x, platform.elevation + platform.construction.railing.height / 2, post.z); mesh.castShadow = true; model.add(mesh); }
    for (const tread of geometry.stairTreads) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(tread.width, Math.max(1.5, tread.rise), tread.depth), deck); mesh.position.set(tread.x, tread.y + Math.max(1.5, tread.rise) / 2, tread.z); mesh.rotation.y = tread.rotationY; mesh.castShadow = true; model.add(mesh); }
    if (geometry.landing) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(geometry.landing.width, 5.5, geometry.landing.depth), deck); mesh.position.set(geometry.landing.center.x, platform.elevation - 2.25, geometry.landing.center.z); mesh.rotation.y = geometry.landing.rotationY; model.add(mesh); }
    scene.add(model);
    const resize = () => { const width = Math.max(1, mount.clientWidth), height = Math.max(1, mount.clientHeight); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(mount); resize();
    camera.position.set(centerX + span, platform.elevation + span, centerZ + span); controls.target.set(centerX, platform.elevation / 2, centerZ); controls.update();
    let frameId = 0; const animate = () => { controls.update(); renderer.render(scene, camera); frameId = requestAnimationFrame(animate); }; animate();
    return () => { cancelAnimationFrame(frameId); observer.disconnect(); controls.dispose(); renderer.dispose(); scene.traverse((object: any) => { if (object instanceof THREE.Mesh) object.geometry.dispose(); }); [deck, frame, rail, house].forEach((value) => value.dispose()); if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement); };
  }, [platform, geometry, houseGeometry, gradeElevation, quality, showFraming, centerX, centerZ, span]);

  useEffect(() => {
    const camera = cameraRef.current, controls = controlsRef.current; if (!camera || !controls) return;
    const center = new THREE.Vector3(centerX, platform.elevation / 2, centerZ); controls.target.copy(center);
    if (preset === "top") camera.position.set(centerX, platform.elevation + span * 1.5, centerZ + .01);
    if (preset === "front") camera.position.set(centerX, platform.elevation + 45, maxZ + span * 1.4);
    if (preset === "perspective") camera.position.set(centerX + span, platform.elevation + span, centerZ + span);
    camera.lookAt(center); controls.update();
  }, [preset, presetRequest, centerX, centerZ, maxZ, span, platform.elevation]);
  return <div className="three-mount" ref={mountRef} aria-label="Interactive v3 polygon deck model" />;
}
