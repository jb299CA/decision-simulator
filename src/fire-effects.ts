import * as THREE from 'three';
import type { RangeView } from './mission-contract';

type Point = { x: number; y: number; z: number };
export type VisualShot = { id: number; origin: Point; end: Point; hitTargetId?: string; createdAt: number };
export const FIRE_EFFECT_LIFETIME = 1.6;
export const MUZZLE_SMOKE_LIFETIME = .12;
const CAPACITY = 16;

/** Negative/future timestamps cannot create a flash after restart. No wall clock is used. */
export function shotAge(time: number, createdAt: number): number {
  const age = time - createdAt;
  return Number.isFinite(age) && age >= 0 && age < FIRE_EFFECT_LIFETIME ? age : -1;
}

/** Firing moves only the exposed hatch camera. Road vibration is a separate input. */
export function firingRecoil(view: RangeView, reducedMotion: boolean, time: number, createdAt: number): number {
  const age = shotAge(time, createdAt);
  if (view !== 'hatch' || reducedMotion || age < 0 || age >= .14) return 0;
  return .037 * Math.exp(-age * 27) * Math.cos(age * 24);
}

/** World-space ejection path, derived afresh so pause and replay are exactly stable. */
export function casingPosition(shot: VisualShot, age: number, out: Point): Point {
  const dx = shot.end.x - shot.origin.x, dz = shot.end.z - shot.origin.z;
  const length = Math.hypot(dx, dz) || 1, forwardX = dx / length, forwardZ = dz / length;
  const rightX = -forwardZ, rightZ = forwardX;
  const seed = (shot.id * .61803398875) % 1;
  const t = Math.max(0, age);
  out.x = shot.origin.x - forwardX * 1.25 + rightX * (.2 + t * (1.4 + seed * .8));
  out.y = Math.max(shot.origin.y - 2.65, shot.origin.y - .04 + t * (1.8 + seed * .7) - 4.5 * t * t);
  out.z = shot.origin.z - forwardZ * 1.25 + rightZ * (.2 + t * (1.4 + seed * .8)) + forwardZ * t * .35;
  return out;
}

/** Five bounded draw calls for up to sixteen shots; no transient GPU objects per shot. */
export class RangeFireEffects {
  readonly group = new THREE.Group();
  private readonly smoke: THREE.InstancedMesh;
  private readonly brass: THREE.InstancedMesh;
  private readonly dust: THREE.InstancedMesh;
  private readonly tracers: THREE.LineSegments;
  private readonly sparks: THREE.LineSegments;
  private readonly tracerPositions = new Float32Array(CAPACITY * 6);
  private readonly sparkPositions = new Float32Array(CAPACITY * 6 * 6);
  private readonly dummy = new THREE.Object3D();
  private readonly point: Point = { x: 0, y: 0, z: 0 };

  constructor() {
    this.smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xbeb7a6, transparent: true, opacity: .07, depthWrite: false }), CAPACITY);
    // A muzzle-adjacent camera must never look through its own cosmetic puff.
    // Only this local effect is excluded; impact dust and vehicle smoke remain visible.
    this.smoke.name = 'local-muzzle-smoke';
    this.smoke.userData.gunnerSightHidden = true;
    this.brass = new THREE.InstancedMesh(new THREE.CylinderGeometry(.027, .027, .14, 6), new THREE.MeshStandardMaterial({ color: 0xecc16b, metalness: .72, roughness: .35 }), CAPACITY);
    this.dust = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xccad7d, transparent: true, opacity: .3, depthWrite: false }), CAPACITY * 4);
    const tracerGeometry = new THREE.BufferGeometry();
    tracerGeometry.setAttribute('position', new THREE.BufferAttribute(this.tracerPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracers = new THREE.LineSegments(tracerGeometry, new THREE.LineBasicMaterial({ color: 0xffdc8b, transparent: true, opacity: .92, depthWrite: false }));
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparks = new THREE.LineSegments(sparkGeometry, new THREE.LineBasicMaterial({ color: 0xffcf67, transparent: true, opacity: .95, depthWrite: false }));
    for (const mesh of [this.smoke, this.brass, this.dust]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
    }
    this.tracers.frustumCulled = this.sparks.frustumCulled = false;
    this.group.add(this.smoke, this.brass, this.dust, this.tracers, this.sparks);
    this.reset();
  }

  reset() {
    this.smoke.count = this.brass.count = this.dust.count = 0;
    this.tracers.geometry.setDrawRange(0, 0); this.sparks.geometry.setDrawRange(0, 0);
  }

  update(shots: readonly VisualShot[], time: number, reducedMotion: boolean) {
    let smokeCount = 0, casingCount = 0, dustCount = 0, tracerCount = 0, sparkCount = 0;
    for (let index = Math.max(0, shots.length - CAPACITY); index < shots.length; index++) {
      const shot = shots[index], age = shotAge(time, shot.createdAt);
      if (age < 0) continue;
      const dx = shot.end.x - shot.origin.x, dy = shot.end.y - shot.origin.y, dz = shot.end.z - shot.origin.z;
      const length = Math.hypot(dx, dy, dz) || 1, fx = dx / length, fy = dy / length, fz = dz / length;
      if (age < .115) {
        // Full bright ray is brief, followed by a moving tracer tail along the same physical ray.
        const end = Math.min(1, .14 + age * 20), start = age < .035 ? 0 : Math.max(0, end - .26);
        const offset = tracerCount++ * 6;
        this.tracerPositions[offset] = shot.origin.x + dx * start; this.tracerPositions[offset + 1] = shot.origin.y + dy * start; this.tracerPositions[offset + 2] = shot.origin.z + dz * start;
        this.tracerPositions[offset + 3] = shot.origin.x + dx * end; this.tracerPositions[offset + 4] = shot.origin.y + dy * end; this.tracerPositions[offset + 5] = shot.origin.z + dz * end;
      }
      if (reducedMotion) continue;
      if (age < MUZZLE_SMOKE_LIFETIME) {
        const drift = .18 + age * .65, spread = .018;
        this.dummy.position.set(shot.origin.x + fx * drift + Math.sin(shot.id) * spread, shot.origin.y + fy * drift + age * .12, shot.origin.z + fz * drift + Math.cos(shot.id) * spread);
        this.dummy.rotation.set(0, age, shot.id); this.dummy.scale.setScalar((.035 + age * .12) * (1 - age / MUZZLE_SMOKE_LIFETIME));
        this.dummy.updateMatrix(); this.smoke.setMatrixAt(smokeCount++, this.dummy.matrix);
      }
      casingPosition(shot, age, this.point);
      this.dummy.position.set(this.point.x, this.point.y, this.point.z);
      this.dummy.rotation.set(age * 18 + shot.id, age * 25, age * 13); this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix(); this.brass.setMatrixAt(casingCount++, this.dummy.matrix);
      const impactAge = age - .045;
      // Miss endpoints mark the arcade ray's range, not a confirmed surface intersection.
      if (shot.hitTargetId && impactAge >= 0 && impactAge < .85) {
        for (let puff = 0; puff < 4; puff++) {
          const angle = shot.id * 2.4 + puff * 1.57, spread = impactAge * (.7 + puff * .2);
          this.dummy.position.set(shot.end.x + Math.cos(angle) * spread, shot.end.y + impactAge * .8 + .04 * puff, shot.end.z + Math.sin(angle) * spread);
          this.dummy.rotation.set(puff, shot.id, impactAge); this.dummy.scale.setScalar((.08 + impactAge * .65) * (1 - impactAge / .85));
          this.dummy.updateMatrix(); this.dust.setMatrixAt(dustCount++, this.dummy.matrix);
        }
        if (impactAge < .24) for (let spark = 0; spark < 6; spark++) {
          const angle = shot.id + spark * 2.4, travel = impactAge * (3 + spark * .3), tail = Math.max(0, travel - .25);
          const sx = Math.cos(angle), sz = Math.sin(angle), sy = .6 + (spark % 3) * .55, offset = sparkCount++ * 6;
          this.sparkPositions[offset] = shot.end.x + sx * tail; this.sparkPositions[offset + 1] = shot.end.y + sy * tail; this.sparkPositions[offset + 2] = shot.end.z + sz * tail;
          this.sparkPositions[offset + 3] = shot.end.x + sx * travel; this.sparkPositions[offset + 4] = shot.end.y + sy * travel; this.sparkPositions[offset + 5] = shot.end.z + sz * travel;
        }
      }
    }
    this.smoke.count = smokeCount; this.brass.count = casingCount; this.dust.count = dustCount;
    this.smoke.instanceMatrix.needsUpdate = true; this.brass.instanceMatrix.needsUpdate = true; this.dust.instanceMatrix.needsUpdate = true;
    this.tracers.geometry.setDrawRange(0, tracerCount * 2); this.sparks.geometry.setDrawRange(0, sparkCount * 2);
    this.tracers.geometry.getAttribute('position').needsUpdate = true; this.sparks.geometry.getAttribute('position').needsUpdate = true;
  }
}
