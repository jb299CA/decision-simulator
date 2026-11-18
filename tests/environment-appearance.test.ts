import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { applyWorldUV, createConiferGeometry, createExplorationLandmark, createGrassGeometry, createGroundTexture, createPolylineRoadRibbon, createRoadRibbon, createScenery, createSceneryLayout, createVehicleContactShadow, placeVehicleContactShadow, groundVariation, SCENERY_BUDGET, sceneryAllowed } from '../src/environment-appearance.ts';
import { terrainAt } from '../src/range.ts';
import { ENEMY_CONTACTS, POINTS_OF_INTEREST, PRACTICE_TARGETS, roadCenterAt, SIDE_ROADS, WORLD_BOUNDS } from '../src/world-config.ts';

test('seeded scenery is reproducible, bounded and clears route, targets and contacts by its full silhouette', () => {
  const layout = createSceneryLayout(WORLD_BOUNDS, terrainAt, true);
  assert.deepEqual(layout, createSceneryLayout(WORLD_BOUNDS, terrainAt, true));
  for (const kind of ['grass','tree','shrub','stone'] as const) {
    assert.equal(layout[kind].length, SCENERY_BUDGET.range[kind]);
    for (const plant of layout[kind]) {
      assert.ok(plant.x >= WORLD_BOUNDS.minX && plant.x <= WORLD_BOUNDS.maxX);
      assert.ok(plant.z >= WORLD_BOUNDS.minZ && plant.z <= WORLD_BOUNDS.maxZ);
      const radius = plant.size * (kind === 'tree' ? .45 : kind === 'grass' ? .4 : 1);
      assert.ok(sceneryAllowed(plant.x,plant.z,radius));
      assert.ok(Math.abs(plant.x - roadCenterAt(plant.z)) >= 9 + radius);
      for (const target of [...PRACTICE_TARGETS,...ENEMY_CONTACTS]) assert.ok(Math.hypot(plant.x - target.x,plant.z - target.z) >= target.radius + radius + 5);
    }
  }
  for (let z = WORLD_BOUNDS.minZ; z <= WORLD_BOUNDS.maxZ; z += 3) assert.equal(sceneryAllowed(roadCenterAt(z) + 7.99,z,0),false);
  for (const road of SIDE_ROADS) for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1], b = road.points[i];
    for (const t of [0,.25,.5,.75,1]) assert.equal(sceneryAllowed(a.x + (b.x - a.x) * t,a.z + (b.z - a.z) * t,2),false);
  }
  for (const point of POINTS_OF_INTEREST) {
    assert.equal(sceneryAllowed(point.x,point.z,2),false);
    assert.equal(sceneryAllowed(point.x + point.radius,point.z,2),false);
  }
  assert.ok(layout.stone.some(plant => Math.abs(plant.x) > 320),'fixed scenery budget reaches expanded side country');
  assert.equal(sceneryAllowed(NaN,0,1),false);
});

test('scenery uses five batches with a bounded triangle budget and no alpha-texture foliage', () => {
  const layout = createSceneryLayout(WORLD_BOUNDS,terrainAt,true), scene = createScenery(layout,terrainAt);
  assert.equal(scene.children.length,5);
  let triangles = 0;
  for (const child of scene.children) {
    assert.ok(child instanceof THREE.InstancedMesh);
    const geometry = child.geometry;
    triangles += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3 * child.count;
    assert.ok(child.material instanceof THREE.MeshStandardMaterial);
    assert.equal(child.material.map,null);
    assert.equal(child.material.transparent,false);
    assert.ok(child.instanceColor);
    for (let i = 0; i < child.instanceMatrix.array.length; i++) assert.ok(Number.isFinite(child.instanceMatrix.array[i]));
  }
  assert.ok(triangles <= 90000,`${triangles} static scenery triangles`);
  assert.equal(createGrassGeometry().getAttribute('position').count / 3,10);
  assert.equal(createConiferGeometry().getAttribute('position').count / 3,63);
});

test('metre UVs and coherent tint remain continuous across adjacent terrain geometry', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,4,0,8,8,0,12],3));
  applyWorldUV(geometry);
  assert.deepEqual(Array.from(geometry.getAttribute('uv').array),[0,0,1,2,2,3]);
  assert.ok(Math.abs(groundVariation(20,30) - groundVariation(20.01,30.01)) < .001);
  assert.ok(Math.abs(groundVariation(20,30) - groundVariation(200,300)) > .005);
});

test('textured shoulder and wheel tracks follow the whole winding road without changing terrain', () => {
  const texture = createGroundTexture('road'), road = createRoadRibbon(-1000,120,terrainAt,true,texture);
  const position = road.geometry.getAttribute('position');
  for (let i = 0; i < position.count; i += 14) {
    const z = position.getZ(i), center = (position.getX(i) + position.getX(i + 13)) / 2;
    assert.ok(Math.abs(center - roadCenterAt(z)) < .00002);
    for (let column = 0; column < 14; column++) {
      const x = position.getX(i + column);
      assert.ok(Math.abs(position.getY(i + column) - terrainAt(x,z).height - .009) < .00001);
    }
  }
  const color = road.geometry.getAttribute('color');
  assert.notEqual(color.getX(5),color.getX(7),'worn wheel track is distinct from central hardpack');
});

test('original texture budget is two deterministic 256-square RGBA maps with mipmaps', () => {
  for (const kind of ['earth','road'] as const) {
    const a = createGroundTexture(kind), b = createGroundTexture(kind);
    assert.equal(a.image.width,256); assert.equal(a.image.height,256);
    assert.deepEqual(a.image.data,b.image.data);
    assert.equal(a.image.data.byteLength,256 * 256 * 4);
    assert.equal(a.wrapS,THREE.RepeatWrapping); assert.equal(a.generateMipmaps,true);
    assert.equal(a.colorSpace,THREE.SRGBColorSpace);
  }
});

test('optional loop ribbons follow the shared terrain and stay within a bounded geometry budget', () => {
  const texture = createGroundTexture('road'); let triangles = 0;
  for (const road of SIDE_ROADS) {
    const ribbon = createPolylineRoadRibbon(road.points,road.halfWidth,terrainAt,texture), position = ribbon.geometry.getAttribute('position');
    triangles += ribbon.geometry.index!.count / 3;
    assert.ok(position.count > road.points.length * 14);
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), z = position.getZ(i), y = position.getY(i);
      assert.ok(Number.isFinite(x + z + y));
      assert.ok(Math.abs(y - terrainAt(x,z).height - .012) < 3e-5,'road samples the same height as driving');
    }
    const normal = ribbon.geometry.getAttribute('normal');
    for (let i = 0; i < normal.count; i++) assert.ok(normal.getY(i) > 0,'road faces the sky through bends');
    const start = road.points[0], end = road.points.at(-1)!;
    assert.ok(Math.hypot((position.getX(0) + position.getX(13)) / 2 - start.x,(position.getZ(0) + position.getZ(13)) / 2 - start.z) < 1e-4);
    const last = position.count - 14;
    assert.ok(Math.hypot((position.getX(last) + position.getX(last + 13)) / 2 - end.x,(position.getZ(last) + position.getZ(last + 13)) / 2 - end.z) < 1e-4);
  }
  assert.ok(triangles < 50000,`${triangles} branch-road triangles`);
});

test('three original exploration landmarks have distinct finite silhouettes and a small fixed budget', () => {
  const dimensions: number[][] = []; let triangles = 0;
  for (const kind of ['overlook','relay','quarry'] as const) {
    const landmark = createExplorationLandmark(kind);
    assert.equal(landmark.name,`exploration-${kind}`);
    const bounds = new THREE.Box3().setFromObject(landmark), size = bounds.getSize(new THREE.Vector3());
    dimensions.push(size.toArray());
    assert.ok(size.x > 2 && size.y > 1 && size.z > 2);
    landmark.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
      assert.equal((object.material as THREE.MeshStandardMaterial).map,null);
      for (const value of object.geometry.getAttribute('position').array) assert.ok(Number.isFinite(value));
    });
  }
  assert.ok(dimensions[1][1] > dimensions[0][1] * 2,'relay is a tall mast');
  assert.ok(dimensions[2][0] > dimensions[0][0],'quarry is a low, broad stone ring');
  assert.ok(triangles < 2000,`${triangles} landmark triangles`);
});

test('phone contact shadow follows terrain without joining vehicle bounds or allocating new geometry', () => {
  const shadow = createVehicleContactShadow(), geometry = shadow.geometry, attribute = geometry.getAttribute('position');
  const sample = (x: number, z: number) => ({ height: x * .02 + z * .01, kind: 'grass' as const });
  for (const heading of [0,.4,Math.PI]) {
    placeVehicleContactShadow(shadow,120,-440,heading,sample);
    assert.equal(shadow.geometry,geometry); assert.equal(shadow.geometry.getAttribute('position'),attribute);
    shadow.updateMatrixWorld();
    for (let i = 0; i < attribute.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(attribute,i).applyMatrix4(shadow.matrixWorld);
      assert.ok(Math.abs(point.y - sample(point.x,point.z).height - .018) < 1e-6);
    }
  }
  assert.equal(geometry.index!.count / 3,48);
  assert.equal(shadow.material.depthWrite,false);
  assert.equal(shadow.material.map!.image.width,64);
  assert.equal(shadow.parent,null);
});
