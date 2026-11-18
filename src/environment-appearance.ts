import * as THREE from 'three';
import { DISMOUNT_POINT, ENEMY_CONTACTS, MISSION_ROUTE, POINTS_OF_INTEREST, PRACTICE_TARGETS, roadCenterAt, roadDistanceAt } from './world-config.ts';

/** Original dry Front Range foothills. Appearance only: never modifies driving terrain. */
export const SCENERY_BUDGET = { range: { grass: 3200, shrub: 210, tree: 76, stone: 680 }, guided: { grass: 1700, shrub: 60, tree: 15, stone: 90 }, textureSize: 256 } as const;
export type GroundSample = { height: number; kind: 'road' | 'grass' | 'rock' | 'wash' };
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export type Plant = { x: number; z: number; yaw: number; size: number; shade: number };
export type SceneryLayout = Record<'grass' | 'shrub' | 'tree' | 'stone', Plant[]>;
export function sceneryRandom(seed: number): number {
  let value = (seed + 0x6d2b79f5) | 0;
  value = Math.imul(value ^ value >>> 15, value | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
}
const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
/** Low frequency field prevents the independent random speckle/checkerboard look. */
export function groundVariation(x: number, z: number): number {
  return Math.sin(x * .038 + Math.sin(z * .019)) * .032 + Math.cos(z * .047 - x * .014) * .025 + Math.sin(x * .21 + z * .17) * .009;
}
export function sceneryAllowed(x: number, z: number, radius: number, range = true): boolean {
  if (!Number.isFinite(x + z + radius) || radius < 0) return false;
  if ((range ? roadDistanceAt(x,z) : Math.abs(x)) < (range ? 9 : 4.5) + radius) return false;
  if (!range) return true;
  for (const point of POINTS_OF_INTEREST) if (Math.hypot(x - point.x,z - point.z) < point.radius + radius + 3) return false;
  for (const point of [...PRACTICE_TARGETS, ...ENEMY_CONTACTS]) if (Math.hypot(x - point.x, z - point.z) < point.radius + radius + 5) return false;
  for (const point of MISSION_ROUTE) if (Math.hypot(x - point.x, z - point.z) < radius + 9) return false;
  if (Math.hypot(x - DISMOUNT_POINT.x, z - DISMOUNT_POINT.z) < DISMOUNT_POINT.radius + radius + 6) return false;
  // Preserve range signs, departure banners and the existing outbuildings.
  for (const point of [{ x: -11, z: 68 }, { x: 13, z: -112 }, { x: -17, z: -140 }, { x: 17, z: -140 }, { x: roadCenterAt(-430) + 12, z: -430 }, { x: roadCenterAt(-740) - 13, z: -740 }, ...[-385, -645].map(z => ({ x: roadCenterAt(z) + 31, z }))]) {
    if (Math.hypot(x - point.x, z - point.z) < radius + 8) return false;
  }
  return true;
}
/** Seeded, finite rejection sampling, concentrated near the route without covering it. */
export function createSceneryLayout(bounds: Bounds, sample: (x: number, z: number) => GroundSample, range: boolean): SceneryLayout {
  const result: SceneryLayout = { grass: [], shrub: [], tree: [], stone: [] };
  const counts = range ? SCENERY_BUDGET.range : SCENERY_BUDGET.guided;
  for (const [index, kind] of (['grass', 'shrub', 'tree', 'stone'] as const).entries()) {
    for (let attempt = 0; attempt < counts[kind] * 24 && result[kind].length < counts[kind]; attempt++) {
      const seed = 50000 + index * 500000 + attempt * 11;
      const z = bounds.minZ + sceneryRandom(seed) * (bounds.maxZ - bounds.minZ);
      const side = sceneryRandom(seed + 1) < .5 ? -1 : 1;
      const offset = kind === 'tree' ? 24 + sceneryRandom(seed + 2) * (range ? 125 : 36)
        : (range ? 10 : 5) + Math.pow(sceneryRandom(seed + 2), 1.8) * (range ? 140 : 57);
      // Spread some of the same fixed instance budget over the new side-road country.
      const x = range && sceneryRandom(seed + 7) < .55
        ? bounds.minX + sceneryRandom(seed + 8) * (bounds.maxX - bounds.minX)
        : (range ? roadCenterAt(z) : 0) + side * offset;
      if (x < bounds.minX || x > bounds.maxX) continue;
      const size = kind === 'tree' ? 3.6 + sceneryRandom(seed + 3) * 3.8 : kind === 'shrub' ? .6 + sceneryRandom(seed + 3) * .8
        : kind === 'stone' ? .22 + sceneryRandom(seed + 3) * .72 : .45 + sceneryRandom(seed + 3) * .8;
      const radius = size * (kind === 'tree' ? .45 : kind === 'grass' ? .4 : 1);
      if (!sceneryAllowed(x, z, radius, range)) continue;
      const terrain = sample(x, z);
      if (kind !== 'stone' && terrain.kind !== 'grass') continue;
      if (kind === 'stone' && terrain.kind === 'grass' && sceneryRandom(seed + 4) < .7) continue;
      // Gaps and broad patches are deliberate; this is scrubland, not a planted forest.
      if (kind === 'grass' && groundVariation(x * .8, z * .8) < -.022) continue;
      result[kind].push({ x, z, size, yaw: sceneryRandom(seed + 5) * Math.PI * 2, shade: sceneryRandom(seed + 6) });
    }
  }
  return result;
}

/** Two modest, seamless, seeded original maps. World UVs establish a stable metre scale. */
export function createGroundTexture(kind: 'earth' | 'road'): THREE.DataTexture {
  const size = SCENERY_BUDGET.textureSize, pixels = new Uint8Array(size * size * 4);
  const noise = (x: number, y: number, cells: number) => {
    const gx = x / size * cells, gy = y / size * cells, ix = Math.floor(gx), iy = Math.floor(gy);
    const value = (a: number, b: number) => sceneryRandom((a % cells) * 937 + (b % cells) * 1741 + 6100);
    const u = smooth(gx - ix), v = smooth(gy - iy);
    return (value(ix, iy) * (1 - u) + value(ix + 1, iy) * u) * (1 - v) + (value(ix, iy + 1) * (1 - u) + value(ix + 1, iy + 1) * u) * v;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, grain = sceneryRandom(i + 7041), pebble = grain > .973 ? -.16 : grain < .025 ? .10 : 0;
    const luminance = .82 + noise(x, y, 8) * .10 + noise(x, y, 32) * .055 + (grain - .5) * (kind === 'road' ? .12 : .09) + pebble;
    pixels[i * 4] = Math.round(Math.max(0, Math.min(1, luminance)) * 255);
    pixels[i * 4 + 1] = pixels[i * 4]; pixels[i * 4 + 2] = pixels[i * 4]; pixels[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.name = `original-${kind}-grain`; texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}
export function applyWorldUV(geometry: THREE.BufferGeometry, metres = 4): void {
  const position = geometry.getAttribute('position'), uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) { uv[i * 2] = position.getX(i) / metres; uv[i * 2 + 1] = position.getZ(i) / metres; }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
export function groundTint(kind: GroundSample['kind'], x: number, z: number): THREE.Color {
  const colors = { road: 0xbcb097, grass: 0xa59a73, rock: 0x969084, wash: 0xb5a68a };
  return new THREE.Color(colors[kind]).multiplyScalar(1 + groundVariation(x, z));
}
/** Vertex blend shoulders and shallow worn tracks, aligned to the unchanged road center. */
export function createRoadRibbon(minZ: number, maxZ: number, sample: (x: number, z: number) => GroundSample, range: boolean, texture: THREE.Texture): THREE.Mesh {
  const offsets = range ? [-9,-8,-6.2,-2.2,-1.65,-1.05,-.55,.55,1.05,1.65,2.2,6.2,8,9] : [-4.6,-3.8,-3,-2.1,-1.65,-1.05,-.55,.55,1.05,1.65,2.1,3,3.8,4.6];
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  let row = 0;
  for (let z = minZ; z <= maxZ; z += 2) {
    const center = range ? roadCenterAt(z) : 0;
    for (let column = 0; column < offsets.length; column++) {
      const offset = offsets[column], x = center + offset;
      positions.push(x, sample(x, z).height + (range ? .009 : -.021), z);
      const edge = smooth((Math.abs(offset) - (range ? 6 : 3)) / (range ? 3 : 1.6));
      const surface = sample(x,z);
      const tint = new THREE.Color(0xbfb399).lerp(groundTint(surface.kind === 'road' ? 'grass' : surface.kind, x, z), edge);
      const rut = Math.exp(-Math.pow((Math.abs(offset) - 1.35) / .38, 2));
      tint.multiplyScalar(1 + groundVariation(x, z) - rut * (.075 + Math.sin(z * .17) * .015));
      colors.push(tint.r, tint.g, tint.b);
      if (row > 0 && column < offsets.length - 1) { const a = row * offsets.length + column; indices.push(a - offsets.length,a,a + 1,a - offsets.length,a + 1,a - offsets.length + 1); }
    }
    row++;
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); applyWorldUV(geometry);
  const material = new THREE.MeshStandardMaterial({ map: texture, bumpMap: texture, bumpScale: .028, vertexColors: true, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'hardpack-shoulders-and-wheel-tracks'; mesh.receiveShadow = true; return mesh;
}

/** Shared side-road polylines get one bounded ribbon each, sampled on the driving ground. */
export function createPolylineRoadRibbon(points: readonly { x: number; z: number }[], halfWidth: number, sample: (x: number, z: number) => GroundSample, texture: THREE.Texture): THREE.Mesh {
  const offsets = [-1.125,-1,-.775,-.275,-.20625,-.13125,-.06875,.06875,.13125,.20625,.275,.775,1,1.125];
  const rows: { x: number; z: number; nx: number; nz: number }[] = [];
  const valid = points.length > 1 && Number.isFinite(halfWidth) && halfWidth > 0 && points.every(p => Number.isFinite(p.x + p.z));
  const closed = valid && points[0].x === points.at(-1)!.x && points[0].z === points.at(-1)!.z;
  const join = (nx: number, nz: number, a?: { x: number; z: number }, b?: { x: number; z: number }) => {
    if (!a || !b) return {nx,nz};
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx,dz);
    if (length < .001) return {nx,nz};
    const bx = nx - dz / length, bz = nz + dx / length, divisor = bx * nx + bz * nz;
    return divisor > .5 ? {nx:bx / divisor,nz:bz / divisor} : {nx,nz};
  };
  if (valid) for (let segment = 0; segment < points.length - 1; segment++) {
    const a = points[segment], b = points[segment + 1], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx,dz);
    if (length < .001) continue;
    const count = Math.ceil(length / 2);
    const nx = -dz / length, nz = dx / length;
    const start = join(nx,nz,segment > 0 ? points[segment - 1] : closed ? points.at(-2) : undefined,a);
    const end = join(nx,nz,b,segment < points.length - 2 ? points[segment + 2] : closed ? points[1] : undefined);
    for (let i = 0; i <= count; i++) {
      if (segment > 0 && i === 0) continue;
      // Interpolate complete miter edges, so short sample intervals cannot fold at bends.
      const t = i / count;
      rows.push({x:a.x + dx * t,z:a.z + dz * t,nx:start.nx + (end.nx - start.nx) * t,nz:start.nz + (end.nz - start.nz) * t});
    }
  }
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  rows.forEach((row,index) => offsets.forEach((fraction,column) => {
    const offset = fraction * halfWidth, x = row.x + row.nx * offset, z = row.z + row.nz * offset, ground = sample(x,z);
    positions.push(x,ground.height + .012,z);
    const edge = smooth((Math.abs(fraction) - .75) / .375);
    const tint = new THREE.Color(0xbfb399).lerp(groundTint(ground.kind === 'road' ? 'grass' : ground.kind,x,z),edge);
    const rut = Math.exp(-Math.pow((Math.abs(offset) - 1.35) / .38,2));
    tint.multiplyScalar(1 + groundVariation(x,z) - rut * .075); colors.push(tint.r,tint.g,tint.b);
    if (index > 0 && column < offsets.length - 1) {
      const a = index * offsets.length + column;
      indices.push(a - offsets.length,a + 1,a,a - offsets.length,a - offsets.length + 1,a + 1);
    }
  }));
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3)); geometry.setIndex(indices); geometry.computeVertexNormals(); applyWorldUV(geometry);
  const mesh = new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map:texture,bumpMap:texture,bumpScale:.028,vertexColors:true,roughness:1,metalness:0,side:THREE.DoubleSide}));
  mesh.name = 'exploration-side-road'; mesh.receiveShadow = true; return mesh;
}

/** Original scenery props only: these optional destinations never repair or arm the vehicle. */
export function createExplorationLandmark(kind: 'overlook' | 'relay' | 'quarry'): THREE.Group {
  const group = new THREE.Group(); group.name = `exploration-${kind}`;
  const steel = new THREE.MeshStandardMaterial({color:0x656d61,roughness:.8});
  const earth = new THREE.MeshStandardMaterial({color:kind === 'quarry' ? 0xb5a186 : 0x938b75,roughness:1});
  const accent = new THREE.MeshStandardMaterial({color:0xdd7b43,roughness:.85});
  const box = (size: number[], position: number[], material: THREE.Material, roll = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0],size[1],size[2]),material);
    mesh.position.set(position[0],position[1],position[2]); mesh.rotation.z = roll; mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  if (kind === 'overlook') {
    // An open viewing shelter and low rail frame the distant ridge without blocking its pad.
    for (const x of [-4,4]) for (const z of [-3,3]) box([.25,4,.25],[x,2,z],steel);
    box([9,.3,7],[0,4.1,0],earth,.03);
    for (const z of [-3,3]) { box([8,.14,.14],[0,1.3,z],steel); box([7,.25,.85],[0,.65,z * .68],earth); }
    box([.9,.9,.25],[0,1.25,-3.2],accent,.18);
  } else if (kind === 'relay') {
    box([5,2.7,3.5],[4,1.35,1],earth); box([5.4,.23,3.9],[4,2.83,1],steel);
    for (const x of [-1.3,1.3]) for (const z of [-1.3,1.3]) box([.19,11,.19],[x,5.5,z],steel);
    for (const y of [1,4,7,10]) { box([2.9,.16,.16],[0,y,-1.3],steel); box([2.9,.16,.16],[0,y,1.3],steel); }
    box([.2,13,.2],[0,6.5,0],steel);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(1.35,12,6,0,Math.PI * 2,0,Math.PI / 2),accent);
    dish.position.set(0,9,-1.5); dish.rotation.x = -Math.PI / 2; dish.castShadow = true; group.add(dish);
    box([.55,.55,.55],[0,12.8,0],accent);
  } else {
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2, height = 1.4 + sceneryRandom(i + 830) * 2;
      const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(1,0),earth);
      boulder.position.set(Math.cos(a) * 8,height * .36,Math.sin(a) * 6); boulder.scale.set(2.3,height * .65,1.8); boulder.rotation.set(.2,a,.4);
      boulder.castShadow = boulder.receiveShadow = true; group.add(boulder);
    }
    for (const x of [-3,3]) { box([.35,2,.35],[x,1,7],steel); box([.65,.35,.4],[x,1.8,7],accent); }
    box([6,.18,.22],[0,1.5,7],accent);
  }
  return group;
}

/** Five bent, tapering blades form a clump, rather than a solid cone. 10 triangles. */
export function createGrassGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let blade = 0; blade < 5; blade++) {
    const angle = blade * 2.399, x = Math.cos(angle) * .10, z = Math.sin(angle) * .10;
    const width = .026 + sceneryRandom(blade + 10) * .025, h = .32 + sceneryRandom(blade + 20) * .29;
    const dx = Math.cos(angle + .8), dz = Math.sin(angle + .8), bend = .09 + sceneryRandom(blade + 30) * .11;
    positions.push(x - dx * width,0,z - dz * width, x + dx * width,0,z + dz * width, x + dx * width * .48 + bend * dz,h * .57,z + dz * width * .48 + bend * dx,
      x - dx * width,0,z - dz * width, x + dx * width * .48 + bend * dz,h * .57,z + dz * width * .48 + bend * dx, x + bend * dz * 1.8,h,z + bend * dx * 1.8);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals(); return geometry;
}
/** Ragged overlapping branch whorls produce a tapered, asymmetric pine silhouette. */
export function createConiferGeometry(): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [];
  for (let tier = 0; tier < 7; tier++) {
    const y = .22 + tier * .105, radius = (.37 - tier * .043), segments = 9;
    for (let wedge = 0; wedge < segments; wedge++) {
      const a = wedge / segments * Math.PI * 2 + tier * .51, b = a + Math.PI * 2 / segments;
      const r1 = radius * (.77 + sceneryRandom(tier * 79 + wedge) * .35), r2 = radius * (.77 + sceneryRandom(tier * 79 + (wedge + 1) % segments) * .35);
      positions.push(Math.cos(a) * r1,y + sceneryRandom(wedge + tier * 40) * .035,Math.sin(a) * r1, .025 * Math.sin(tier),y + .24,0, Math.cos(b) * r2,y + sceneryRandom(wedge + tier * 17) * .035,Math.sin(b) * r2);
      const shade = .78 + tier * .025 + sceneryRandom(wedge + tier * 43) * .13;
      for (let k = 0; k < 3; k++) colors.push(shade,shade,shade);
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals(); return geometry;
}
export function createScenery(layout: SceneryLayout, sample: (x: number, z: number) => GroundSample): THREE.Group {
  const group = new THREE.Group(); group.name = 'seeded-foothills-scenery';
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  const add = (name: string, geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial, plants: Plant[], shape: (plant: Plant) => void, shadows = false) => {
    const mesh = new THREE.InstancedMesh(geometry, material, plants.length); mesh.name = name;
    plants.forEach((plant, index) => {
      dummy.position.set(plant.x, sample(plant.x, plant.z).height - .07, plant.z); dummy.rotation.set(0, plant.yaw, 0); dummy.scale.setScalar(plant.size);
      shape(plant); dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, color.setRGB(1 - plant.shade * .13,1 - plant.shade * .095,1 - plant.shade * .17));
    });
    mesh.castShadow = shadows; mesh.receiveShadow = true; mesh.computeBoundingSphere(); group.add(mesh);
  };
  add('dry-bunchgrass', createGrassGeometry(), new THREE.MeshStandardMaterial({ color: 0xb6a272, roughness: 1, side: THREE.DoubleSide }), layout.grass, () => {});
  const bushGeometry = new THREE.IcosahedronGeometry(1, 1), p = bushGeometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) { const s = .78 + sceneryRandom(i + 340) * .35; p.setXYZ(i,p.getX(i) * s,p.getY(i) * s,p.getZ(i) * s); } bushGeometry.computeVertexNormals();
  add('sage-and-scrub', bushGeometry, new THREE.MeshStandardMaterial({ color: 0x7e8262, roughness: 1, flatShading: true }), layout.shrub, plant => { dummy.position.y += plant.size * .23; dummy.scale.set(plant.size * .8,plant.size * .36,plant.size * .63); });
  add('pine-trunks', new THREE.CylinderGeometry(.026,.042,.64,6), new THREE.MeshStandardMaterial({ color: 0x655b45, roughness: 1 }), layout.tree, plant => { dummy.position.y += plant.size * .30; }, true);
  add('irregular-pine-crowns', createConiferGeometry(), new THREE.MeshStandardMaterial({ color: 0x4b6049, roughness: 1, side: THREE.DoubleSide, vertexColors: true }), layout.tree, () => {}, true);
  add('embedded-stones', new THREE.DodecahedronGeometry(1,0), new THREE.MeshStandardMaterial({ color: 0x918c7d, roughness: 1, flatShading: true }), layout.stone, plant => { dummy.scale.set(plant.size,plant.size * .38,plant.size * .74); dummy.rotation.x = plant.shade * .8; });
  return group;
}

/** A single bounded contact patch grounds tires when phone shadow maps are disabled. */
export function createVehicleContactShadow(): THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial> {
  const size = 64, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) / size * 2 - 1, v = (y + .5) / size * 2 - 1;
    const radius = Math.pow(Math.pow(Math.abs(u),3) + Math.pow(Math.abs(v),4),1 / 3);
    pixels[(y * size + x) * 4 + 3] = Math.round((1 - smooth((radius - .38) / .58)) * 84);
  }
  const texture = new THREE.DataTexture(pixels,size,size,THREE.RGBAFormat);
  texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.needsUpdate = true; texture.name = 'original-soft-contact';
  const geometry = new THREE.PlaneGeometry(4.6,7.8,4,6); geometry.rotateX(-Math.PI / 2);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(),6);
  const mesh = new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
  mesh.name = 'vehicle-ground-contact'; mesh.renderOrder = 1; return mesh;
}
/** Reuses the same 35 vertices; never allocates geometry or textures during driving. */
export function placeVehicleContactShadow(mesh: THREE.Mesh, x: number, z: number, heading: number, sample: (x: number, z: number) => GroundSample, lift = .018): void {
  const position = mesh.geometry.getAttribute('position'), c = Math.cos(heading), s = Math.sin(heading);
  mesh.position.set(x,0,z); mesh.rotation.set(0,heading,0);
  for (let i = 0; i < position.count; i++) {
    const localX = position.getX(i), localZ = position.getZ(i);
    position.setY(i,sample(x + localX * c + localZ * s,z - localX * s + localZ * c).height + lift);
  }
  position.needsUpdate = true;
}
