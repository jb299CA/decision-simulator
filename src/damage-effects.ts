import * as THREE from 'three';

export const DAMAGE_VEHICLE_CAPACITY = 4;
export const SMOKE_PUFFS = 14;
export const FLAMES_PER_VEHICLE = 5;
export type DamageContact = { id: string; kind: 'troop' | 'vehicle'; x: number; z: number; neutralizedAt: number | null };
export type BrokenVehicle = { broken: boolean; x: number; y: number; z: number; heading: number };

/** Extends presentation after a terminal event without advancing mission/debrief time. */
export class AftermathClock {
  private lastSimulationTime = -1;
  private terminalOffset = 0;
  private wasTerminal = false;
  reset(): void { this.lastSimulationTime = -1; this.terminalOffset = 0; this.wasTerminal = false; }
  update(simulationTime: number, delta: number, terminal: boolean, paused: boolean, entering = false): number {
    const time = Number.isFinite(simulationTime) ? Math.max(0, simulationTime) : 0;
    if (entering || time < this.lastSimulationTime || time === 0 && this.lastSimulationTime > 0) this.reset();
    if (!terminal) this.terminalOffset = 0;
    else if (this.wasTerminal && !paused && Number.isFinite(delta) && delta > 0) this.terminalOffset += Math.min(delta, .1);
    this.lastSimulationTime = time; this.wasTerminal = terminal;
    return time + this.terminalOffset;
  }
}

/** Four bounded draw calls: light engine steam, dark wreck smoke and two flame layers. */
export class VehicleDamageEffects {
  readonly group = new THREE.Group();
  private readonly gray = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xbfc4c2, transparent: true, opacity: .35, depthWrite: false }), SMOKE_PUFFS);
  private readonly dark = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x252724, transparent: true, opacity: .49, depthWrite: false }), DAMAGE_VEHICLE_CAPACITY * SMOKE_PUFFS);
  private readonly flame = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), new THREE.MeshBasicMaterial({ color: 0xff641c, transparent: true, opacity: .88, depthWrite: false }), DAMAGE_VEHICLE_CAPACITY * FLAMES_PER_VEHICLE);
  private readonly core = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), new THREE.MeshBasicMaterial({ color: 0xffd660, transparent: true, opacity: .96, depthWrite: false }), DAMAGE_VEHICLE_CAPACITY * FLAMES_PER_VEHICLE);
  private readonly dummy = new THREE.Object3D();
  private brokenAt: number | null = null;
  private disposed = false;
  constructor() {
    this.group.name = 'vehicle-damage-effects';
    for (const mesh of [this.gray, this.dark, this.flame, this.core]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.renderOrder = 2;
      this.group.add(mesh);
    }
    this.reset();
  }
  reset(): void { this.brokenAt = null; this.gray.count = this.dark.count = this.flame.count = this.core.count = 0; }
  private smoke(mesh: THREE.InstancedMesh, start: number, x: number, y: number, z: number, age: number, wreck: boolean): void {
    for (let i = 0; i < SMOKE_PUFFS; i++) {
      // A prewarmed column makes the event readable on the first rendered frame.
      const t = (age * .23 + i / SMOKE_PUFFS) % 1;
      const width = (wreck ? .42 : .23) + t * (wreck ? 1.65 : 1.0);
      this.dummy.position.set(x + t * .85 + Math.sin(i * 2.4) * width * .32, y + t * (wreck ? 7.4 : 4.5), z + Math.cos(i * 2.4) * width * .35);
      this.dummy.rotation.set(i * .7, i * 1.1 + age * .07, i * .3);
      const size = width * (.7 + Math.sin(Math.PI * t) * .4);
      this.dummy.scale.set(size, size * 1.15, size); this.dummy.updateMatrix(); mesh.setMatrixAt(start + i, this.dummy.matrix);
    }
  }
  update(own: BrokenVehicle, contacts: readonly DamageContact[], time: number, ground: (x: number, z: number) => number, reducedMotion = false): void {
    if (this.disposed) return;
    this.gray.count = this.dark.count = this.flame.count = this.core.count = 0;
    if (!Number.isFinite(time) || time < 0) { this.brokenAt = null; return; }
    if (own.broken) {
      if (this.brokenAt === null || this.brokenAt > time) this.brokenAt = time;
      const cos = Math.cos(own.heading), sin = Math.sin(own.heading);
      this.smoke(this.gray, 0, own.x + .7 * cos - 1.8 * sin, own.y + 2.12, own.z - .7 * sin - 1.8 * cos, reducedMotion ? 0 : time - this.brokenAt, false);
      this.gray.count = SMOKE_PUFFS;
    } else this.brokenAt = null;
    let vehicles = 0;
    for (const contact of contacts) {
      if (contact.kind !== 'vehicle' || contact.neutralizedAt === null || !Number.isFinite(contact.neutralizedAt) || contact.neutralizedAt > time || vehicles >= DAMAGE_VEHICLE_CAPACITY) continue;
      const age = reducedMotion ? 0 : time - contact.neutralizedAt, y = ground(contact.x, contact.z);
      this.smoke(this.dark, vehicles * SMOKE_PUFFS, contact.x, y + 1.4, contact.z - .8, age, true);
      for (let i = 0; i < FLAMES_PER_VEHICLE; i++) {
        const pulse = reducedMotion ? 1 : 1 + Math.sin(age * 7 + i * 2.1) * .17;
        const height = (1.25 + i % 3 * .48) * pulse;
        const x = contact.x + Math.sin(i * 2.4) * .62, z = contact.z - .9 + Math.cos(i * 2.4) * .78;
        this.dummy.position.set(x, y + .95 + height / 2, z); this.dummy.rotation.set(.09 * Math.sin(i), i, .12 * Math.cos(i));
        this.dummy.scale.set(.32 + i % 2 * .09, height, .30); this.dummy.updateMatrix(); this.flame.setMatrixAt(vehicles * FLAMES_PER_VEHICLE + i, this.dummy.matrix);
        this.dummy.position.y = y + .95 + height * .26; this.dummy.scale.set((.32 + i % 2 * .09) * .58, height * .55, .30 * .58);
        this.dummy.updateMatrix(); this.core.setMatrixAt(vehicles * FLAMES_PER_VEHICLE + i, this.dummy.matrix);
      }
      vehicles++;
    }
    this.dark.count = vehicles * SMOKE_PUFFS; this.flame.count = this.core.count = vehicles * FLAMES_PER_VEHICLE;
    for (const mesh of [this.gray, this.dark, this.flame, this.core]) mesh.instanceMatrix.needsUpdate = true;
  }
  /** Explicit ownership lets the scene remove these resources before its general disposal pass. */
  dispose(): void {
    if (this.disposed) return;
    this.reset(); this.disposed = true;
    for (const mesh of [this.gray, this.dark, this.flame, this.core]) { mesh.dispose(); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
    this.group.removeFromParent();
  }
}
