import * as THREE from 'three';

/** Cosmetic cutscene pose; no pathfinding, vehicle interaction, or simulation input. */
export function recoveryArrival(elapsed: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  const t = Number.isFinite(elapsed) ? Math.max(0, Math.min(1, elapsed / 3.7)) : 0;
  return t * t * (3 - 2 * t);
}

export class RecoveryVehicle {
  readonly group = new THREE.Group();
  private readonly box = new THREE.BoxGeometry(1, 1, 1);
  private readonly tire = new THREE.CylinderGeometry(.52, .52, .35, 12);
  private readonly amber = new THREE.MeshStandardMaterial({ color: 0xffbc55, emissive: 0xfe981f, emissiveIntensity: 1 });
  private readonly materials = [0xa78a54, 0x24282a, 0x293d43, 0xd5c5a0, 0xfff1c7].map(color => new THREE.MeshStandardMaterial({ color }));
  private readonly wheels: THREE.Mesh[] = [];
  constructor() {
    const add = (material: number, size: [number, number, number], position: [number, number, number]) => {
      const mesh = new THREE.Mesh(this.box, this.materials[material]!);
      mesh.scale.set(...size); mesh.position.set(...position); this.group.add(mesh);
    };
    this.group.name = 'recovery-assistance-vehicle'; this.group.visible = false;
    add(1, [2.45,.46,6.65], [0,.76,0]);   // low chassis
    add(0, [2.42,1.55,1.86], [0,1.85,1.06]); // squared utility cab
    add(0, [2.41,.64,1.31], [0,1.23,2.46]); // bonnet
    add(2, [2.02,.58,.06], [0,2.1,2.013]);  // windscreen
    for (const side of [-1, 1]) {
      add(2, [.04,.56,.95], [side*1.214,2.09,1.27]);
      add(4, [.36,.28,.08], [side*.88,1.24,3.12]);
      add(3, [.055,.17,2.38], [side*1.245,1.47,-1.46]);
      for (const z of [-2.21,-1.08,2.16]) {
        const wheel = new THREE.Mesh(this.tire, this.materials[1]!);
        wheel.position.set(side*1.2,.58,z); wheel.rotation.z = Math.PI/2;
        this.group.add(wheel); this.wheels.push(wheel);
      }
    }
    add(1, [2.48,.27,.29], [0,.89,3.26]);
    add(0, [2.48,.77,3.05], [0,1.24,-1.64]); // closed service body
    add(0, [2.24,.57,2.60], [0,1.81,-1.67]);
    const beacon = new THREE.Mesh(this.box, this.amber);
    beacon.scale.set(.92,.11,.24); beacon.position.set(0,2.64,.96); this.group.add(beacon);
  }

  update(x: number, z: number, heading: number, elapsed: number | null, reducedMotion: boolean, ground: (x: number, z: number) => number): void {
    this.group.visible = elapsed !== null;
    if (elapsed === null) return;
    const arrival = recoveryArrival(elapsed, reducedMotion), cos = Math.cos(heading), sin = Math.sin(heading);
    const forward = -23 + 22 * arrival, side = 4.6;
    const worldX = x + side*cos + forward*sin, worldZ = z - side*sin + forward*cos;
    this.group.position.set(worldX, ground(worldX,worldZ),worldZ);
    this.group.rotation.y = heading;
    for (const wheel of this.wheels) wheel.rotation.set(reducedMotion ? 0 : arrival * 42,0,Math.PI/2,'ZYX');
    this.amber.emissiveIntensity = reducedMotion ? 1 : .65 + .85 * Math.pow(Math.cos(elapsed*5),2);
  }

  dispose(): void { this.group.removeFromParent(); this.box.dispose(); this.tire.dispose(); this.amber.dispose(); this.materials.forEach(material => material.dispose()); }
}
