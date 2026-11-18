import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Original fictional arcade prop; no equipment dimensions or operating mechanism. */
export function createMountedGun(): THREE.Group {
  const root = new THREE.Group(); root.name = 'illustrative-mounted-gun';
  const material = (color:number,roughness:number,metalness:number) => new THREE.MeshStandardMaterial({color,roughness,metalness});
  const body = material(0x292f30,.63,.58), steel = material(0x56605e,.52,.65);
  const dark = material(0x111819,.88,.18), paint = material(0x69704c,.86,.16);
  const grip = material(0x30302b,.92,.05), brass = material(0x85734b,.65,.48);
  const parts: THREE.Mesh[] = [];
  function add(geometry:THREE.BufferGeometry,mat:THREE.Material,position:number[],rotation?:number[]) {
    const mesh = new THREE.Mesh(geometry,mat); mesh.position.fromArray(position);
    if (rotation) mesh.rotation.set(rotation[0],rotation[1],rotation[2]);
    root.add(mesh); parts.push(mesh); return mesh;
  }
  const box = (size:number[],position:number[],mat:THREE.Material,rotation?:number[]) => add(new THREE.BoxGeometry(size[0],size[1],size[2]),mat,position,rotation);
  const tube = (radius:number,length:number,position:number[],mat:THREE.Material,rotation:number[] = [Math.PI / 2,0,0],segments = 10) => add(new THREE.CylinderGeometry(radius,radius,length,segments),mat,position,rotation);

  tube(.39,.13,[0,2.31,0],paint,[0,0,0],16);
  tube(.09,.43,[0,2.57,.32],steel,[0,0,0]);
  for (const x of [-.16,.16]) box([.055,.24,.37],[x,2.81,.35],steel);
  box([.25,.22,.67],[0,2.99,.43],body);
  box([.265,.033,.59],[0,3.119,.42],steel);
  box([.18,.014,.48],[0,3.143,.43],body);
  for (const x of [-.132,.132]) {
    box([.013,.035,.48],[x,3.08,.44],dark);
    for (const z of [.18,.42,.65]) tube(.018,.015,[x,3.015,z],steel,[0,0,Math.PI / 2],6);
  }
  // Long slender barrel, jacket, collar and shallow muzzle opening. No oversized brake.
  tube(.065,.49,[0,3,-.145],steel,undefined,12);
  for (const z of [-.375,.075]) tube(.074,.035,[0,3,z],body,undefined,12);
  for (let i = 0; i < 5; i++) {
    const z = -.32 + i * .083;
    for (const x of [-.063,.063]) box([.006,.029,.043],[x,3,z],dark);
    box([.029,.006,.043],[0,3.064,z],dark);
  }
  tube(.031,.607,[0,3,-.6965],body,undefined,12);
  tube(.036,.026,[0,3,-.987],steel,undefined,12);
  tube(.023,.003,[0,3,-1.002],dark,undefined,12);
  // Small open sight profiles, hinge and rear cover latch read in silhouette.
  box([.038,.067,.045],[0,3.098,-.30],body);
  for (const x of [-.033,.033]) box([.015,.052,.025],[x,3.13,-.30],steel);
  box([.08,.018,.1],[0,3.153,.62],dark);
  for (const x of [-.038,.038]) box([.012,.055,.018],[x,3.182,.64],steel);
  tube(.021,.25,[0,3.12,.105],steel,[0,0,Math.PI / 2]);
  box([.075,.025,.07],[0,3.15,.75],steel);
  box([.075,.035,.09],[.17,3.025,.56],steel);
  tube(.018,.16,[.19,3.025,.64],body);
  tube(.027,.065,[.19,3.025,.74],grip);
  // Painted ammunition box, lid seam, carrying loop and a short decorative linked belt.
  box([.33,.26,.36],[-.37,2.88,.40],paint);
  box([.35,.028,.38],[-.37,3.025,.40],steel);
  box([.31,.009,.335],[-.37,3.044,.40],paint);
  for (const z of [.26,.54]) box([.018,.03,.04],[-.55,3.045,z],steel);
  for (const x of [-.435,-.305]) box([.015,.043,.02],[x,3.072,.40],dark);
  box([.145,.015,.02],[-.37,3.10,.40],dark);
  box([.14,.035,.17],[-.19,3.02,.37],dark);
  for (let i = 0; i < 5; i++) {
    const x = -.29 + i * .032;
    tube(.012,.13,[x,3.052,.37],brass,undefined,6);
    box([.018,.017,.02],[x,3.064,.37],dark);
  }
  // Paired spade handles and a narrow rear brace, rather than a broad block.
  box([.37,.035,.055],[0,2.985,.82],steel);
  for (const x of [-.17,.17]) {
    box([.04,.205,.06],[x,2.94,.865],grip,[.15,0,0]);
    for (const y of [2.85,3.03]) tube(.025,.055,[x,y,.865],steel,[Math.PI / 2,0,0],8);
  }
  // Six static material batches: added silhouette detail does not add per-part draws.
  const materials = [...new Set(parts.map(part => part.material as THREE.Material))];
  for (const mat of materials) {
    const source = parts.filter(part => part.material === mat);
    const pieces = source.map(part => {
      part.updateMatrix(); const geometry = part.geometry.toNonIndexed(); geometry.applyMatrix4(part.matrix); return geometry;
    });
    const geometry = mergeGeometries(pieces)!;
    const batch = new THREE.Mesh(geometry,mat); batch.castShadow = true; batch.receiveShadow = true; root.add(batch);
    pieces.forEach(piece => piece.dispose());
    source.forEach(part => { root.remove(part); part.geometry.dispose(); });
  }
  root.userData.muzzle = [0,3,-1];
  return root;
}
