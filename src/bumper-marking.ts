import * as THREE from 'three';

/** Fictional exercise identity only; never add an inferred real unit designation. */
export function bumperCallsign(callsign: string): { company: string; number: string; key: string } {
  const match = /^(AZTEC|BRAVE|CRAZY HORSE) ([123]-6)$/.exec(callsign.trim().toUpperCase().replace(/\s+/g, ' '));
  return match ? { company: match[1], number: match[2], key: `${match[1]} ${match[2]}` }
    : { company: 'EXERCISE', number: '', key: 'EXERCISE' };
}

/** Below the .76 m ramp hinge; remains attached to the hull when the ramp opens. */
export const REAR_BUMPER = { width: 2.46, height: .30, depth: .10, y: .51, z: -3.27,
  faceZ: -3.326, canvasWidth: 1536, canvasHeight: 192 } as const;

/** Immutable maps let inspection clones borrow a frozen identity without owning textures. */
export class RearBumperMarking {
  readonly root = new THREE.Group();
  readonly material = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0,
    // A little fill keeps painted lettering readable in the vehicle's own shadow.
    emissive: 0x777568, emissiveIntensity: .28 });
  private readonly maps = new Map<string, THREE.CanvasTexture>();
  private identity = '';
  private disposed = false;
  private readonly createCanvas: () => HTMLCanvasElement;

  constructor(createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas')) {
    this.createCanvas = createCanvas;
    this.root.name = 'rear-bumper-marking';
    const backing = new THREE.Mesh(new THREE.BoxGeometry(REAR_BUMPER.width, REAR_BUMPER.height, REAR_BUMPER.depth),
      new THREE.MeshStandardMaterial({ color: 0x353e2d, roughness: .98 }));
    backing.position.set(0, REAR_BUMPER.y, REAR_BUMPER.z);
    backing.castShadow = backing.receiveShadow = true;
    const paint = new THREE.Mesh(new THREE.PlaneGeometry(REAR_BUMPER.width - .04, REAR_BUMPER.height - .025), this.material);
    paint.name = 'rear-bumper-callsign';
    paint.position.set(0, REAR_BUMPER.y, REAR_BUMPER.faceZ);
    // Plane +Z becomes rear −Z. Viewed from behind, its text remains left-to-right.
    paint.rotation.y = Math.PI;
    this.root.add(backing, paint);
    this.update('');
  }

  /** No canvas work, texture allocation or upload when the identity has not changed. */
  update(callsign: string): boolean {
    if (this.disposed) return false;
    const marking = bumperCallsign(callsign);
    if (marking.key === this.identity) return false;
    let texture = this.maps.get(marking.key);
    if (!texture) {
      const canvas = this.createCanvas();
      canvas.width = REAR_BUMPER.canvasWidth; canvas.height = REAR_BUMPER.canvasHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Rear bumper marking requires a two-dimensional canvas');
      context.fillStyle = '#353e2d'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#e8e4cc'; context.textBaseline = 'middle'; context.textAlign = 'left';
      context.font = `900 ${marking.company === 'CRAZY HORSE' ? 116 : 132}px "Courier New", monospace`;
      context.fillText(marking.company, 35, 104, marking.number ? 1050 : 1460);
      if (marking.number) {
        context.textAlign = 'right'; context.font = '900 174px "Courier New", monospace';
        context.fillText(marking.number, canvas.width - 30, 106, 420);
      }
      // Small paint-color cuts create stencil bridges without adding weathered clutter.
      context.fillStyle = '#353e2d';
      for (const y of [68, 126]) context.fillRect(20, y, canvas.width - 40, 3);
      texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.anisotropy = 4;
      this.maps.set(marking.key, texture);
    }
    this.material.map = texture; this.material.emissiveMap = texture; this.material.needsUpdate = true;
    this.identity = marking.key;
    return true;
  }

  /** Scene traversal owns geometry/materials; this owner alone releases its ten possible maps. */
  disposeTextures(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.maps.forEach(texture => texture.dispose()); this.maps.clear();
  }
}
