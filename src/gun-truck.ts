import * as THREE from 'three';

/** Original four-wheel civilian-pattern pickup with an exposed bed-mounted game gun. */
export function createGunTruck(): THREE.Group {
  const truck = new THREE.Group(); truck.name = 'gun-truck';
  const paint = new THREE.MeshStandardMaterial({ color: 0x8b8064, roughness: .92 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x43453b, roughness: .9 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x242723, roughness: 1 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x526d72, roughness: .24, metalness: .3 });
  glass.userData.contactGlass = true;
  const steel = new THREE.MeshStandardMaterial({ color: 0x55594e, roughness: .72, metalness: .35 });
  const light = new THREE.MeshStandardMaterial({ color: 0xd7ccb1, roughness: .45 });
  for (const material of [paint, trim, tire, glass, steel, light]) material.userData.contactBaseColor = material.color.getHex();
  const box = (name: string, size: number[], position: number[], material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
    mesh.name = name; mesh.position.set(position[0], position[1], position[2]); mesh.castShadow = mesh.receiveShadow = true; truck.add(mesh); return mesh;
  };
  // Front is -z: a low hood, tall glazed cab and visibly empty cargo bed behind it.
  box('chassis', [1.8, .22, 4.25], [0, .66, 0], trim);
  box('hood', [1.86, .45, 1.18], [0, 1.05, -1.60], paint);
  box('cab-lower', [1.9, .68, 1.52], [0, 1.17, -.42], paint);
  box('cab-roof', [1.96, .12, 1.53], [0, 2.12, -.42], paint);
  const windshield = box('windshield', [1.62, .58, .045], [0, 1.77, -1.16], glass); windshield.rotation.x = -.13;
  box('rear-window', [1.47, .50, .045], [0, 1.78, .34], glass);
  for (const side of [-1, 1]) {
    box('side-window', [.035, .55, 1.17], [side * .963, 1.78, -.42], glass);
    for (const z of [-1.11, .29]) box('cab-pillar', [.115, .75, .11], [side * .92, 1.76, z], paint);
    box('door-handle', [.04, .05, .2], [side * .97, 1.34, -.07], trim);
    box('mirror', [.19, .21, .13], [side * 1.09, 1.80, -.92], trim);
    box('bed-side', [.12, .55, 1.62], [side * .92, 1.14, 1.27], paint);
    box('headlight', [.44, .21, .045], [side * .62, 1.09, -2.21], light);
    for (const z of [-1.49, 1.44]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.48, .48, .28, 14), tire);
      wheel.name = 'wheel'; wheel.position.set(side * 1.01, .49, z); wheel.rotation.z = Math.PI / 2; wheel.castShadow = true; truck.add(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(.23, .23, .30, 10), steel);
      hub.name = 'wheel-hub'; hub.position.copy(wheel.position); hub.rotation.copy(wheel.rotation); truck.add(hub);
    }
  }
  box('bed-floor', [1.72, .11, 1.65], [0, .90, 1.26], trim);
  box('tailgate', [1.84, .55, .12], [0, 1.14, 2.05], paint);
  box('front-bumper', [2.0, .19, .15], [0, .77, -2.23], steel);
  box('grille', [.73, .24, .045], [0, 1.04, -2.21], trim);
  const mount = new THREE.Mesh(new THREE.CylinderGeometry(.10, .16, 1.08, 8), steel);
  mount.name = 'gun-pedestal'; mount.position.set(0, 1.46, 1.24); truck.add(mount);
  const weapon = new THREE.Group(); weapon.name = 'contact-weapon'; weapon.position.set(0, 2.08, 1.24); truck.add(weapon);
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(.22, .22, .58), trim); weapon.add(receiver);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, 1.08, 8), steel);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, .025, -.79); weapon.add(barrel);
  const ammo = new THREE.Mesh(new THREE.BoxGeometry(.32, .23, .32), paint); ammo.position.set(.29, -.02, .08); weapon.add(ammo);
  return truck;
}

/** Preserve the truck silhouette; only finish and a small suspension sag change. */
export function setGunTruckDamage(truck: THREE.Object3D, defeated: boolean, hitPulse = 0): void {
  truck.traverse(child => {
    if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial)) return;
    const material = child.material;
    material.color.set(defeated ? material.userData.contactGlass ? 0x1b211f : 0x30312a : material.userData.contactBaseColor as number);
    material.emissive.set(0xe05b3a); material.emissiveIntensity = defeated ? 0 : hitPulse * .7;
  });
}
