import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface VehicleAppearanceMaterials {
  armor: readonly THREE.MeshStandardMaterial[];
  rubber: readonly THREE.MeshStandardMaterial[];
  metal: readonly THREE.MeshStandardMaterial[];
}

export interface VehicleAppearanceStats {
  treatedMeshes: number;
  vertices: number;
  addedDraws: number;
  addedMaterials: number;
  addedTextures: number;
}

const clamp = THREE.MathUtils.clamp;
const dust = new THREE.Color(0xb5a281);
const point = new THREE.Vector3(), normal = new THREE.Vector3();

/** Smooth seeded variation, evaluated in vehicle coordinates rather than mesh/triangle order. */
function field(x: number, y: number, z: number) {
  return Math.sin(x * 3.1 + z * 1.7 + .7) * Math.cos(z * 4.3 - y * 2.1) * .5
    + Math.sin(x * 15.7 + y * 12.3 + z * 9.1) * .16;
}

/** Give broad hull faces enough samples for continuous dust bands without extra draw calls. */
function sampleArmor(source: THREE.BufferGeometry) {
  const flat = source.index ? source.toNonIndexed() : source.clone();
  const positions = flat.getAttribute('position'), normals = flat.getAttribute('normal');
  const output: number[] = [], outputNormals: number[] = [];
  type Vertex = [number, number, number, number, number, number];
  const vertex = (i: number): Vertex => [positions.getX(i), positions.getY(i), positions.getZ(i),
    normals?.getX(i) ?? 0, normals?.getY(i) ?? 1, normals?.getZ(i) ?? 0];
  const distance = (a: Vertex, b: Vertex) => (a[0]-b[0]) ** 2 + (a[1]-b[1]) ** 2 + (a[2]-b[2]) ** 2;
  const emit = (a: Vertex, b: Vertex, c: Vertex, depth: number) => {
    const lengths = [distance(a,b), distance(b,c), distance(c,a)], longest = Math.max(...lengths);
    if (longest > .55 ** 2 && depth < 9) {
      const edge = lengths.indexOf(longest), v = [a,b,c];
      const first = v[edge], second = v[(edge+1)%3], opposite = v[(edge+2)%3];
      const midpoint = first.map((n,i) => (n+second[i])/2) as Vertex;
      emit(first,midpoint,opposite,depth+1); emit(midpoint,second,opposite,depth+1); return;
    }
    for (const v of [a,b,c]) { output.push(v[0],v[1],v[2]); outputNormals.push(v[3],v[4],v[5]); }
  };
  for (let i = 0; i < positions.count; i += 3) emit(vertex(i),vertex(i+1),vertex(i+2),0);
  flat.dispose();
  const result = new THREE.BufferGeometry();
  result.setAttribute('position',new THREE.Float32BufferAttribute(output,3));
  result.setAttribute('normal',new THREE.Float32BufferAttribute(outputNormals,3));
  return result;
}

/** Original small field stowage and tow eyes, batched with the supplied solid material roles. */
function addFieldDetails(vehicle: THREE.Group, materials: VehicleAppearanceMaterials) {
  const addBatch = (name: string, pieces: THREE.BufferGeometry[], material: THREE.MeshStandardMaterial | undefined) => {
    if (!material) { pieces.forEach(piece => piece.dispose()); return 0; }
    const geometry = mergeGeometries(pieces); pieces.forEach(piece => piece.dispose());
    if (!geometry) return 0;
    const mesh = new THREE.Mesh(geometry,material); mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true; vehicle.add(mesh); return 1;
  };
  const roll = new THREE.CylinderGeometry(.145,.145,.82,12,1);
  roll.rotateZ(Math.PI/2); roll.translate(.55,2.72,-2.05);
  const straps = [-.27,.27].map(x => {
    const strap = new THREE.TorusGeometry(.151,.018,4,12);
    strap.rotateY(Math.PI/2); strap.translate(.55+x,2.72,-2.05); return strap;
  });
  const eyes: THREE.BufferGeometry[] = [];
  for (const z of [-3.21,3.16]) for (const x of [-.77,.77]) {
    const eye = new THREE.TorusGeometry(.082,.024,6,12);
    eye.translate(x,.96,z); eyes.push(eye);
  }
  return addBatch('field-canvas-roll',[roll],materials.armor[1] ?? materials.armor[0])
    + addBatch('field-straps-tow-eyes',[...straps,...eyes],materials.metal[0]);
}

/**
 * Apply once after construction/compaction and before inspection/exercise clones.
 * Only explicitly supplied solid roles are touched: lamps, vision blocks and glyph UVs stay intact.
 * All added resources are ordinary scene meshes, so existing scene/inspection disposal owns them.
 */
export function applyVehicleAppearance(vehicle: THREE.Group, materials: VehicleAppearanceMaterials): VehicleAppearanceStats {
  if (vehicle.userData.fieldAppearance) return { ...vehicle.userData.fieldAppearance };
  const addedDraws = addFieldDetails(vehicle,materials);
  const armor = new Set(materials.armor), rubber = new Set(materials.rubber), metal = new Set(materials.metal);
  materials.armor.forEach((material,i) => {
    material.color.set([0x858b69,0x727a58,0x92967a][i%3]);
    material.roughness = .96; material.metalness = .035; material.vertexColors = true; material.needsUpdate = true;
  });
  materials.rubber.forEach(material => { material.color.set(0x343932); material.roughness = 1; material.metalness = 0; material.vertexColors = true; material.needsUpdate = true; });
  materials.metal.forEach(material => { material.color.set(0x72765d); material.roughness = .86; material.metalness = .16; material.vertexColors = true; material.needsUpdate = true; });
  vehicle.updateWorldMatrix(true,true);
  const inverse = vehicle.matrixWorld.clone().invert(), oldGeometries = new Set<THREE.BufferGeometry>();
  let treatedMeshes = 0, vertices = 0;
  vehicle.traverse(object => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const material = object.material as THREE.MeshStandardMaterial;
    const isArmor = armor.has(material), isRubber = rubber.has(material);
    if (!isArmor && !isRubber && !metal.has(material)) return;
    const geometry = isArmor ? sampleArmor(object.geometry) : object.geometry.clone();
    oldGeometries.add(object.geometry); object.geometry = geometry;
    const transform = inverse.clone().multiply(object.matrixWorld), normalTransform = new THREE.Matrix3().getNormalMatrix(transform);
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    const colors: number[] = [], uvs: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions,i).applyMatrix4(transform);
      const variation = field(point.x,point.y,point.z), grain = .94 + variation * .065;
      // Dry soil settles across the underbody and tire shoulders; upper armor keeps its olive paint.
      const band = clamp((1.52-point.y)/1.35,0,1);
      const amount = clamp((isRubber ? .31 : .27)*band + variation*.035,0,isRubber ? .34 : .3);
      // Color attributes multiply the paint: use a ratio so pale dust can actually lighten dark rubber.
      const color = material.color.clone().multiplyScalar(grain).lerp(dust,amount);
      color.r /= Math.max(material.color.r,.001); color.g /= Math.max(material.color.g,.001); color.b /= Math.max(material.color.b,.001);
      if (object.name === 'field-canvas-roll') color.multiply(new THREE.Color(0xd4c5a5));
      colors.push(color.r,color.g,color.b);
      if (isArmor) {
        normal.set(normals.getX(i),normals.getY(i),normals.getZ(i)).applyMatrix3(normalTransform).normalize();
        const ax = Math.abs(normal.x), ay = Math.abs(normal.y), az = Math.abs(normal.z);
        // Same meter scale on each face; custom hull no longer samples a single texture pixel.
        if (ay >= ax && ay >= az) uvs.push(point.x*.42,point.z*.42);
        else if (ax >= az) uvs.push(point.z*.42,point.y*.42);
        else uvs.push(point.x*.42,point.y*.42);
      }
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    if (isArmor) geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere(); treatedMeshes++; vertices += positions.count;
  });
  // Some callers may share a geometry with an excluded decal: do not invalidate its ownership.
  vehicle.traverse(object => { if (object instanceof THREE.Mesh) oldGeometries.delete(object.geometry); });
  oldGeometries.forEach(geometry => geometry.dispose());
  const stats = { treatedMeshes, vertices, addedDraws, addedMaterials:0, addedTextures:0 };
  vehicle.userData.fieldAppearance = stats; return { ...stats };
}
