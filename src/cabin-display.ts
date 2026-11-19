import * as THREE from 'three';
import type { GunnerDisplayMode, RangeView } from './mission-contract.ts';

/** The range terminal is slightly larger and faces the seated observer more directly. */
export const RANGE_TERMINAL = { scale: .75, position: [.42, 1.64, 1.22], rotation: [-.08, -.06, 0] } as const;
const GLASS_BOUNDS = new THREE.Box3(new THREE.Vector3(-.745,.035 - .447,.16),new THREE.Vector3(.745,.035 + .447,.16));

/** Presentation state only: focusing the physical monitor never pauses or changes the exercise. */
export class CabinDisplayState {
  mode: GunnerDisplayMode = 'day';
  focused = false;
  private beforeInspection?: { view: RangeView; mode: GunnerDisplayMode; focused: boolean };
  select(mode: GunnerDisplayMode): void { this.mode = mode; }
  toggleFocus(): void { this.focused = !this.focused; }
  leaveInside(): void { this.focused = false; }
  inspectHealth(view: RangeView): RangeView {
    this.beforeInspection ??= { view, mode: this.mode, focused: view === 'inside' && this.focused };
    this.mode = 'mfocs'; this.focused = false;
    return 'inside';
  }
  finishHealth(outcome: 'resume' | 'recovery' = 'resume'): RangeView | undefined {
    const previous = this.beforeInspection;
    if (!previous) return;
    this.beforeInspection = undefined;
    this.mode = previous.mode;
    this.focused = outcome === 'resume' && previous.focused;
    return outcome === 'recovery' ? 'chase' : previous.view;
  }
  reset(): void { this.beforeInspection = undefined; this.mode = 'day'; this.focused = false; }
}

/** Include the rugged case, grab handles and fasteners, in terminal-local coordinates. */
export function cabinDisplayBounds(terminal: THREE.Object3D): THREE.Box3 {
  terminal.updateWorldMatrix(true, true);
  const inverse = terminal.matrixWorld.clone().invert(), bounds = new THREE.Box3();
  terminal.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.computeBoundingBox();
    const local = object.geometry.boundingBox!.clone().applyMatrix4(inverse.clone().multiply(object.matrixWorld));
    bounds.union(local);
  });
  return bounds;
}

export function boxCorners(bounds: THREE.Box3): THREE.Vector3[] {
  return [bounds.min.x, bounds.max.x].flatMap(x => [bounds.min.y, bounds.max.y].flatMap(y =>
    [bounds.min.z, bounds.max.z].map(z => new THREE.Vector3(x, y, z))));
}

/** Clear fractions of the full scene canvas, with phone driving controls at its edges. */
export function cabinDisplayRegion(width: number, height: number, focused: boolean) {
  const portrait = width < height;
  const phone = width <= 760 || (height <= 540 && width <= 1180);
  if (phone && portrait) return { x: .5, y: height <= 700 ? .55 : .49, width: focused ? .94 : .90, height: focused ? .38 : .34 };
  if (phone) return { x: .51, y: .49, width: focused ? .67 : .57, height: focused ? .72 : .58 };
  return { x: .5, y: .53, width: focused ? .90 : .69, height: focused ? .76 : .56 };
}

/** Preserve horizontal room on portrait phones without moving behind the rear armor. */
export function cabinDisplayFov(width: number, height: number): number {
  return width < height ? 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(27.5)) * height / Math.max(1, width)) * 180 / Math.PI
    : height <= 540 ? 60 : 55;
}

/** Fit the physical monitor using its actual bounds and face orientation.
 * Narrow portrait screens prioritize the complete glass; the outer grab handles
 * may crop while the rugged top/bottom bezel and cabin remain in view.
 * A projection shift reserves controls/captions without skewing the display texture.
 */
export function frameCabinDisplay(bounds: THREE.Box3, matrix: THREE.Matrix4, width: number, height: number,
  fov: number, focused: boolean) {
  const region = cabinDisplayRegion(width, height, focused);
  const portraitPhone = width < height && width <= 760;
  const fittedBounds = portraitPhone ? GLASS_BOUNDS : bounds;
  const center = fittedBounds.getCenter(new THREE.Vector3()).applyMatrix4(matrix);
  const rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(matrix));
  const backward = new THREE.Vector3(focused ? 0 : -.20, focused ? 0 : -.015, 1).normalize().applyQuaternion(rotation);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
  const right = new THREE.Vector3().crossVectors(up, backward).normalize();
  up.crossVectors(backward, right).normalize();
  const tangent = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const tanX = tangent * width / Math.max(1, height) * region.width, tanY = tangent * region.height;
  const corners = boxCorners(fittedBounds).map(point => point.applyMatrix4(matrix));
  let distance = .2;
  for (const corner of corners) {
    const offset = corner.clone().sub(center), depth = offset.dot(backward);
    distance = Math.max(distance, depth + Math.abs(offset.dot(right)) / tanX, depth + Math.abs(offset.dot(up)) / tanY);
  }
  return { center, position: center.clone().addScaledVector(backward, distance), up, region,
    offsetX: width * (.5 - region.x), offsetY: height * (.5 - region.y) };
}
