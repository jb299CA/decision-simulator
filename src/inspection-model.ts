import * as THREE from 'three';
import type { FaultId, FaultSeverity } from './mission-contract.ts';

/** Semantic regions of this original model, not equipment wiring or service locations. */
export const SENSOR_REGIONS: Readonly<Record<FaultId, readonly [number, number, number]>> = {
  charging: [.70, .52, .76], cooling: [.34, .53, .90], 'wheel-end': [.985, .15, .82],
};
export const SENSOR_COLORS: Readonly<Record<FaultSeverity, string>> = {
  normal: '#67d5a4', moderate: '#ffc16d', severe: '#ff5841', failed: '#ff5841',
};

/** Clone GPU geometry/material ownership; textures stay borrowed and are never disposed here. */
export function cloneInspectionModel(source: THREE.Group): THREE.Group {
  const clone = source.clone(true);
  clone.position.set(0, 0, 0); clone.quaternion.identity(); clone.scale.setScalar(1); clone.visible = true;
  const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const materials = new Map<THREE.Material, THREE.Material>();
  const copyMaterial = (material: THREE.Material) => {
    if (!materials.has(material)) materials.set(material, material.clone());
    return materials.get(material)!;
  };
  clone.traverse(object => {
    if (object.name === 'inspection-wheel') object.rotation.set(0, 0, 0);
    if (object.name === 'inspection-station') object.visible = true;
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)) return;
    if (!geometries.has(object.geometry)) geometries.set(object.geometry, object.geometry.clone());
    object.geometry = geometries.get(object.geometry)!;
    object.material = Array.isArray(object.material) ? object.material.map(copyMaterial) : copyMaterial(object.material);
  });
  return normalizeInspectionModel(clone);
}

/** Stable centered coordinates independent of the driving vehicle's world pose. */
export function normalizeInspectionModel(model: THREE.Group): THREE.Group {
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3()), longest = Math.max(size.x, size.y, size.z);
  const root = new THREE.Group(); root.name = 'inspection-vehicle'; root.add(model);
  const scale = Number.isFinite(longest) && longest > 0 ? 6 / longest : 1;
  model.position.sub(center); root.scale.setScalar(scale); root.updateMatrixWorld(true);
  return root;
}

export function sensorAnchor(bounds: THREE.Box3, id: FaultId): THREE.Vector3 {
  const region = SENSOR_REGIONS[id], size = bounds.getSize(new THREE.Vector3());
  return new THREE.Vector3(bounds.min.x + size.x * region[0], bounds.min.y + size.y * region[1], bounds.min.z + size.z * region[2]);
}

export function projectSensor(anchor: THREE.Vector3, camera: THREE.Camera, width: number, height: number) {
  const point = anchor.clone().project(camera);
  return { x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2,
    visible: Number.isFinite(point.x + point.y + point.z) && point.z >= -1 && point.z <= 1 && Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1 };
}

/** Dispose only the model's owned geometry/materials; maps may belong to the live scene. */
export function disposeInspectionModel(model: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)) return;
    geometries.add(object.geometry);
    (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
  });
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
  model.removeFromParent();
}
