import * as THREE from 'three';

/** Fit all eight model-bound corners, using the actual lens and host aspect. */
export function fitGuidedModel(bounds: THREE.Box3, direction: THREE.Vector3, fov: number, aspect: number, occupancy: number | readonly [number, number] = .82) {
  const center = bounds.getCenter(new THREE.Vector3());
  const backward = direction.clone().normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), backward).normalize();
  const up = new THREE.Vector3().crossVectors(backward, right);
  const [horizontal, vertical] = typeof occupancy === 'number' ? [occupancy, occupancy] : occupancy;
  const tangent = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const tanY = tangent * vertical;
  const tanX = tangent * horizontal * Math.max(.1, aspect);
  let distance = 1;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const offset = new THREE.Vector3(x, y, z).sub(center), depth = offset.dot(backward);
    distance = Math.max(distance, depth + Math.abs(offset.dot(right)) / tanX, depth + Math.abs(offset.dot(up)) / tanY);
  }
  return { center, distance, position: center.clone().addScaledVector(backward, distance) };
}
