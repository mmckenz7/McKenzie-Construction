import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { disposeSceneResources } from "../src/ThreeViewV3";

describe("3D scene resource cleanup", () => {
  it("disposes shared and unique geometry/material resources exactly once", () => {
    const scene = new THREE.Scene();
    const sharedGeometry = new THREE.BoxGeometry(1, 1, 1);
    const uniqueGeometry = new THREE.PlaneGeometry(2, 2);
    const sharedMaterial = new THREE.MeshBasicMaterial();
    const uniqueMaterial = new THREE.MeshBasicMaterial();
    const sharedGeometryDispose = vi.spyOn(sharedGeometry, "dispose");
    const uniqueGeometryDispose = vi.spyOn(uniqueGeometry, "dispose");
    const sharedMaterialDispose = vi.spyOn(sharedMaterial, "dispose");
    const uniqueMaterialDispose = vi.spyOn(uniqueMaterial, "dispose");
    scene.add(
      new THREE.Mesh(sharedGeometry, sharedMaterial),
      new THREE.Mesh(sharedGeometry, [sharedMaterial, uniqueMaterial]),
      new THREE.Mesh(uniqueGeometry, uniqueMaterial),
    );

    expect(disposeSceneResources(scene)).toEqual({ geometries: 2, materials: 2 });
    expect(sharedGeometryDispose).toHaveBeenCalledTimes(1);
    expect(uniqueGeometryDispose).toHaveBeenCalledTimes(1);
    expect(sharedMaterialDispose).toHaveBeenCalledTimes(1);
    expect(uniqueMaterialDispose).toHaveBeenCalledTimes(1);
  });
});
