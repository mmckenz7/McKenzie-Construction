import { useEffect, useRef } from "react";
// @ts-ignore The production root intentionally does not install this isolated prototype package's dependencies.
import * as THREE from "three";
// @ts-ignore The production root intentionally does not install this isolated prototype package's dependencies.
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { DeckDesignV1 } from "./model";
import type { DeckGeometry, LinearMember } from "./geometry";

export type CameraPreset = "perspective" | "top" | "front";

type Props = {
  design: DeckDesignV1;
  geometry: DeckGeometry;
  preset: CameraPreset;
  presetRequest: number;
  showFraming: boolean;
};

function addLinearMember(
  group: THREE.Group,
  member: LinearMember,
  y: number,
  height: number,
  depth: number,
  material: THREE.Material,
) {
  const dx = member.end.x - member.start.x;
  const dz = member.end.z - member.start.z;
  const length = Math.hypot(dx, dz);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, height, depth), material);
  mesh.position.set((member.start.x + member.end.x) / 2, y, (member.start.z + member.end.z) / 2);
  mesh.rotation.y = -Math.atan2(dz, dx);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

export function ThreeView({ design, geometry, preset, presetRequest, showFraming }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe8eee9);
    scene.fog = new THREE.Fog(0xe8eee9, 700, 1500);
    const camera = new THREE.PerspectiveCamera(40, 1, 1, 3000);
    cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.screenSpacePanning = true;
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight(0xfff8e8, 0x54685d, 2.1));
    const sun = new THREE.DirectionalLight(0xffffff, 2.3);
    sun.position.set(-220, 360, 160);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -500;
    sun.shadow.camera.right = 500;
    sun.shadow.camera.top = 500;
    sun.shadow.camera.bottom = -500;
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshStandardMaterial({ color: 0x7f9675, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const house = new THREE.Mesh(
      new THREE.BoxGeometry(design.platform.width + 160, 220, 12),
      new THREE.MeshStandardMaterial({ color: 0xd6d1c5, roughness: 0.92 }),
    );
    house.position.set(design.platform.width / 2, 110, -8);
    house.castShadow = true;
    house.receiveShadow = true;
    scene.add(house);

    const model = new THREE.Group();
    const deckingMaterial = new THREE.MeshStandardMaterial({ color: 0x8b6545, roughness: 0.68 });
    const framingMaterial = new THREE.MeshStandardMaterial({ color: 0xb48a5d, roughness: 0.86 });
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x263a32, roughness: 0.55 });

    const boardPitch = design.construction.decking.boardWidth + design.construction.decking.gap;
    for (const board of geometry.surfaceBoards) {
      addLinearMember(
        model,
        board,
        design.platform.surfaceElevation,
        1,
        Math.min(design.construction.decking.boardWidth, boardPitch),
        deckingMaterial,
      );
    }
    if (showFraming) {
      for (const joist of geometry.joists) {
        addLinearMember(model, joist, design.platform.surfaceElevation - 5, 7.25, 1.5, framingMaterial);
      }
      for (const beam of geometry.beams) {
        addLinearMember(model, beam, design.platform.surfaceElevation - 13, 9.25, 4.5, framingMaterial);
      }
      for (const post of geometry.supportPosts) {
        const height = Math.max(1, post.top);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(5.5, height, 5.5), framingMaterial);
        mesh.position.set(post.x, height / 2, post.z);
        mesh.castShadow = true;
        model.add(mesh);
      }
      for (const post of geometry.landingSupportPosts) {
        const height = Math.max(1, post.top);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(5.5, height, 5.5), framingMaterial);
        mesh.position.set(post.x, height / 2, post.z);
        mesh.castShadow = true;
        model.add(mesh);
      }
    }
    for (const post of geometry.railPosts) {
      const height = design.construction.railing.height;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, height, 4), railMaterial);
      mesh.position.set(post.x, design.platform.surfaceElevation + height / 2, post.z);
      mesh.castShadow = true;
      model.add(mesh);
    }
    for (const rail of geometry.railSegments) {
      addLinearMember(
        model,
        rail,
        design.platform.surfaceElevation + design.construction.railing.height - 2,
        3,
        2.5,
        railMaterial,
      );
      addLinearMember(
        model,
        rail,
        design.platform.surfaceElevation + 7,
        2,
        2,
        railMaterial,
      );
    }
    for (const post of geometry.landingRailPosts) {
      const height = design.construction.railing.height;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, height, 4), railMaterial);
      mesh.position.set(post.x, design.platform.surfaceElevation + height / 2, post.z);
      mesh.castShadow = true;
      model.add(mesh);
    }
    for (const rail of geometry.landingRailSegments) {
      addLinearMember(
        model,
        rail,
        design.platform.surfaceElevation + design.construction.railing.height - 2,
        3,
        2.5,
        railMaterial,
      );
      addLinearMember(model, rail, design.platform.surfaceElevation + 7, 2, 2, railMaterial);
    }
    for (const tread of geometry.stairTreads) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(tread.width, Math.max(1.5, tread.rise), tread.depth),
        deckingMaterial,
      );
      mesh.position.set(tread.x, tread.y + Math.max(1.5, tread.rise) / 2, tread.z);
      mesh.rotation.y = tread.rotationY;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      model.add(mesh);
    }
    if (geometry.landing) {
      const landing = new THREE.Mesh(
        new THREE.BoxGeometry(geometry.landing.width, 5.5, geometry.landing.depth),
        deckingMaterial,
      );
      landing.position.set(
        geometry.landing.center.x,
        design.platform.surfaceElevation - 2.25,
        geometry.landing.center.z,
      );
      landing.rotation.y = geometry.landing.rotationY;
      landing.castShadow = true;
      landing.receiveShadow = true;
      model.add(landing);
    }
    scene.add(model);

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    camera.position.set(design.platform.width * 1.05, design.platform.surfaceElevation + 190, design.platform.projection * 1.55);
    controls.target.set(design.platform.width / 2, design.platform.surfaceElevation / 2, design.platform.projection / 2);
    controls.update();

    let frame = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse((object: any) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      for (const material of [deckingMaterial, framingMaterial, railMaterial]) material.dispose();
      mount.removeChild(renderer.domElement);
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, [design, geometry, showFraming]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const { width, projection, surfaceElevation } = design.platform;
    const center = new THREE.Vector3(width / 2, surfaceElevation / 2, projection / 2);
    controls.target.copy(center);
    if (preset === "top") camera.position.set(width / 2, Math.max(width, projection) * 1.35 + surfaceElevation, projection / 2 + 0.01);
    if (preset === "front") camera.position.set(width / 2, surfaceElevation + 45, projection * 2.15);
    if (preset === "perspective") camera.position.set(width * 1.05, surfaceElevation + 190, projection * 1.55);
    camera.lookAt(center);
    controls.update();
  }, [design.platform, preset, presetRequest]);

  return <div className="three-mount" ref={mountRef} aria-label="Interactive three-dimensional deck model" />;
}
