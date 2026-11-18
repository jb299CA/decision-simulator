import * as THREE from 'three';

export type DestructibleTarget = { id: string; x: number; z: number; radius: number; kind?: 'training' | 'enemy'; destroyedAt: number | null; destroyedBy: 'shot' | 'vehicle' | null };
export const DEBRIS_PIECES = 12;
export const DEBRIS_TARGET_CAPACITY = 12;
type Pose = { x: number; y: number; z: number; rx: number; ry: number; rz: number; sx: number; sy: number; sz: number };
const seed = (value: number) => ((Math.sin(value * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;
const idSeed = (id: string) => { let sum = 0; for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i) * (i + 1); return sum; };

/** Destruction is a persistent simulation event; future timestamps never create restart ghosts. */
export function destructionAge(time: number, destroyedAt: number | null): number {
  if (destroyedAt === null || !Number.isFinite(time) || !Number.isFinite(destroyedAt)) return -1;
  const age = time - destroyedAt;
  return age >= 0 ? age : -1;
}

/** Twelve recognizable panel/frame fragments. Pure simulation-time trajectory, then permanent ground rest. */
export function debrisPose(target: DestructibleTarget, piece: number, age: number, ground: (x: number, z: number) => number, out: Pose): Pose {
  const panel = piece < 8, leg = piece >= 8 && piece < 10, n = idSeed(target.id) + piece * 13;
  const initialX = panel ? ((piece % 4) - 1.5) * target.radius * .5 : (piece % 2 ? 1 : -1) * target.radius * .5;
  const initialY = panel ? 1.73 + Math.floor(piece / 4) * 1.34 : leg ? .57 : .07;
  const angle = seed(n) * Math.PI * 2;
  const crush = target.destroyedBy === 'vehicle';
  const velocity = (crush ? 1.0 : 2.0) + seed(n + 1) * (crush ? 1.4 : 3.0);
  const vy = crush ? .4 + seed(n + 2) : 1.8 + seed(n + 2) * 2.3;
  const flight = (vy + Math.sqrt(vy * vy + 19.6 * initialY)) / 9.8;
  const t = Math.min(Math.max(0, age), flight);
  out.x = target.x + initialX + Math.cos(angle) * velocity * t;
  out.z = target.z + Math.sin(angle) * velocity * t + (crush ? -t * 1.6 : 0);
  out.sx = panel ? target.radius * .48 : leg ? .09 : target.radius * .75;
  out.sy = panel ? 1.29 : leg ? 1.12 : .09;
  out.sz = panel ? .17 : leg ? .18 : .65;
  const restingY = ground(out.x, out.z) + (panel ? .085 : leg ? .09 : .045) + .025;
  const startY = ground(target.x, target.z) + initialY;
  out.y = t >= flight ? restingY : Math.max(restingY, startY + vy * t - 4.9 * t * t);
  const settled = t >= flight || out.y <= restingY;
  out.rx = settled ? (panel || leg ? Math.PI / 2 : 0) : t * (2.2 + seed(n + 3) * 4);
  out.ry = angle + (settled ? flight : t) * 1.4;
  out.rz = settled ? 0 : t * (seed(n + 4) - .5) * 5;
  return out;
}

/** Fixed 144-piece pool: no meshes, geometry, materials or vectors allocated during update. */
export class TargetDebris {
  readonly group = new THREE.Group();
  private readonly panels = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .94, metalness: .12 }), DEBRIS_TARGET_CAPACITY * 8);
  private readonly metal = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x535a50, roughness: .88, metalness: .32 }), DEBRIS_TARGET_CAPACITY * 4);
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private readonly pose: Pose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
  constructor() {
    for (const mesh of [this.panels, this.metal]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
    }
    this.group.add(this.panels, this.metal); this.reset();
  }
  reset() { this.panels.count = this.metal.count = 0; }
  update(targets: readonly DestructibleTarget[], time: number, ground: (x: number, z: number) => number, reducedMotion = false) {
    let panels = 0, metal = 0, count = 0;
    for (const target of targets) {
      const age = destructionAge(time, target.destroyedAt);
      if (target.kind === 'enemy' || age < 0 || target.destroyedBy === null || count >= DEBRIS_TARGET_CAPACITY) continue;
      count++;
      for (let piece = 0; piece < DEBRIS_PIECES; piece++) {
        const p = debrisPose(target, piece, reducedMotion ? 10 : age, ground, this.pose);
        this.dummy.position.set(p.x, p.y, p.z); this.dummy.rotation.set(p.rx, p.ry, p.rz); this.dummy.scale.set(p.sx, p.sy, p.sz); this.dummy.updateMatrix();
        if (piece < 8) {
          this.panels.setMatrixAt(panels, this.dummy.matrix);
          // Pale bullseye fragments remain distinguishable among orange panel edges.
          this.color.set(piece === 1 || piece === 2 || piece === 5 || piece === 6 ? 0xd8d2b6 : 0xcf6938);
          this.panels.setColorAt(panels++, this.color);
        } else this.metal.setMatrixAt(metal++, this.dummy.matrix);
      }
    }
    this.panels.count = panels; this.metal.count = metal;
    this.panels.instanceMatrix.needsUpdate = this.metal.instanceMatrix.needsUpdate = true;
    if (this.panels.instanceColor) this.panels.instanceColor.needsUpdate = true;
  }
}
