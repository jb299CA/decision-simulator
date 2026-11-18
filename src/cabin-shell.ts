import * as THREE from 'three';

/** Opaque illustrative crew compartment; no windows or forward glazing. */
export function createCabinShell(armor: THREE.Material, floor: THREE.Material) {
  const shell = new THREE.Group();
  const panel = (name: string, size: [number, number, number], position: [number, number, number], material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    shell.add(mesh);
    return mesh;
  };
  // Overlapping edges seal the perimeter from the floor through the roof underside.
  panel('port armor', [.18, 2.3, 5.12], [-2.25, 1.2, 1.25], armor);
  panel('starboard armor', [.18, 2.3, 5.12], [2.25, 1.2, 1.25], armor);
  panel('forward armor', [4.68, 2.3, .18], [0, 1.2, -1.25], armor);
  panel('rear armor', [4.68, 2.3, .18], [0, 1.2, 3.75], armor);
  panel('crew floor', [4.68, .18, 5.18], [0, .1, 1.25], floor);
  // Seated view closes the hatch overhead. Exposed Hatch view retains its raised lid.
  const ceiling = panel('closed overhead armor', [4.68, .16, 5.18], [0, 2.27, 1.25], armor);
  return { shell, ceiling };
}
