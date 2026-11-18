import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { alignGunnerCamera, GunnerDisplay } from '../src/gunner-display.ts';
import type { GunnerFrame } from '../src/gunner-display.ts';
import { RangeFireEffects } from '../src/fire-effects.ts';
import { VehicleDamageEffects } from '../src/damage-effects.ts';

const frame = (change:Partial<GunnerFrame> = {}):GunnerFrame => ({time:1,paused:false,engine:true,phone:false,lastShotTime:-Infinity,reducedMotion:false,x:12,z:-40,height:.3,heading:.4,aimYaw:-.2,locked:false,...change});

/** Deliberately no WebGL context: observe exact render inputs and mutable renderer state. */
class FakeRenderer {
  target:THREE.WebGLRenderTarget | null = new THREE.WebGLRenderTarget(16,16);
  cubeFace = 2;
  mipLevel = 1;
  viewport = new THREE.Vector4(11,12,301,202);
  scissor = new THREE.Vector4(13,14,201,102);
  scissorTest = true;
  clearColor = new THREE.Color(0x123456);
  clearAlpha = .4;
  autoClear = false;
  xr = {enabled:true};
  shadowMap = {autoUpdate:true,enabled:true};
  supportedExtensions = new Set(['EXT_color_buffer_float']);
  extensions = {has:(name:string) => this.supportedExtensions.has(name)};
  renders: {scene:THREE.Scene; camera:THREE.Camera; target:THREE.WebGLRenderTarget | null}[] = [];
  targets: (THREE.WebGLRenderTarget | null)[] = [];
  clears = 0;
  onRender: (scene:THREE.Scene,camera:THREE.Camera) => void = () => {};
  getRenderTarget() { return this.target; }
  getActiveCubeFace() { return this.cubeFace; }
  getActiveMipmapLevel() { return this.mipLevel; }
  getViewport(out:THREE.Vector4) { return out.copy(this.viewport); }
  getScissor(out:THREE.Vector4) { return out.copy(this.scissor); }
  getScissorTest() { return this.scissorTest; }
  getClearColor(out:THREE.Color) { return out.copy(this.clearColor); }
  getClearAlpha() { return this.clearAlpha; }
  setRenderTarget(target:THREE.WebGLRenderTarget | null,cubeFace = 0,mipLevel = 0) { this.target = target; this.cubeFace = cubeFace; this.mipLevel = mipLevel; this.targets.push(target); }
  setViewport(x:number | THREE.Vector4,y?:number,w?:number,h?:number) { typeof x === 'number' ? this.viewport.set(x,y!,w!,h!) : this.viewport.copy(x); }
  setScissor(value:THREE.Vector4) { this.scissor.copy(value); }
  setScissorTest(value:boolean) { this.scissorTest = value; }
  setClearColor(value:THREE.ColorRepresentation,alpha:number) { this.clearColor.set(value); this.clearAlpha = alpha; }
  clear() { this.clears++; }
  render(scene:THREE.Scene,camera:THREE.Camera) { this.renders.push({scene,camera,target:this.target}); this.onRender(scene,camera); }
  asRenderer() { return this as unknown as THREE.WebGLRenderer; }
  snapshot() { return {target:this.target,viewport:this.viewport.toArray(),scissor:this.scissor.toArray(),scissorTest:this.scissorTest,
    color:this.clearColor.getHex(),alpha:this.clearAlpha,autoClear:this.autoClear,xr:this.xr.enabled,shadows:this.shadowMap.autoUpdate,shadowEnabled:this.shadowMap.enabled,cubeFace:this.cubeFace,mipLevel:this.mipLevel}; }
}

test('optic origin and ray match the weapon pivot with manual or assisted yaw', () => {
  const camera = new THREE.PerspectiveCamera();
  for (const heading of [0,.4,Math.PI,-2]) for (const aimYaw of [-1.3,0,.7]) {
    const value = frame({heading,aimYaw}); alignGunnerCamera(camera,value);
    const direction = camera.getWorldDirection(new THREE.Vector3()), angle = heading + aimYaw;
    assert.ok(direction.distanceTo(new THREE.Vector3(-Math.sin(angle),0,-Math.cos(angle))) < 1e-10);
    assert.ok(Math.abs(camera.position.x - (12 + Math.cos(heading) * .48 - Math.sin(angle))) < 1e-10);
    assert.ok(Math.abs(camera.position.z - (-40 - Math.sin(heading) * .48 - Math.cos(angle))) < 1e-10);
    assert.equal(camera.position.y,3.3);
  }
});

test('locked game targets pitch the optic to the existing shot height while retaining weapon yaw', () => {
  const camera = new THREE.PerspectiveCamera();
  for (const distance of [0,.001,10,100]) {
    const heading = .8, aimYaw = -.3, angle = heading + aimYaw;
    const originX = 12 + Math.cos(heading) * .48 - Math.sin(angle), originZ = -40 - Math.sin(heading) * .48 - Math.cos(angle);
    const aimPoint = {x:originX - Math.sin(angle) * distance,y:1.25,z:originZ - Math.cos(angle) * distance};
    alignGunnerCamera(camera,frame({heading,aimYaw,locked:true,aimPoint}));
    const direction = camera.getWorldDirection(new THREE.Vector3());
    assert.ok(direction.toArray().every(Number.isFinite));
    assert.ok(Math.abs(Math.atan2(-direction.x,-direction.z) - angle) < 1e-10);
    assert.ok(direction.y < 0);
    const expected = new THREE.Vector3(-Math.sin(angle) * Math.max(.1,distance),1.25 - 3.3,-Math.cos(angle) * Math.max(.1,distance)).normalize();
    assert.ok(direction.distanceTo(expected) < 1e-10);
  }
});

test('sight shot vibration is bounded, deterministic, short and rebuilt without accumulation', () => {
  const camera = new THREE.PerspectiveCamera(), base = new THREE.PerspectiveCamera();
  const value = frame({time:2,lastShotTime:2,aimPoint:{x:0,y:1.25,z:-100}});
  alignGunnerCamera(base,{...value,lastShotTime:-Infinity});
  let peak = 0;
  for (let step = 0; step <= 120; step++) {
    const time = 2 + step / 1000;
    alignGunnerCamera(camera,{...value,time});
    const angle = camera.quaternion.angleTo(base.quaternion); peak = Math.max(peak,angle);
    assert.ok(angle < .003,'less than .18 degrees of optical rotation');
    assert.deepEqual(camera.position.toArray(),base.position.toArray(),'origin and weapon physics stay fixed');
    const paused = camera.quaternion.toArray();
    for (let repeat = 0; repeat < 5; repeat++) {
      alignGunnerCamera(camera,{...value,time,paused:true}); assert.deepEqual(camera.quaternion.toArray(),paused);
    }
  }
  assert.ok(peak > .001);
  for (const change of [{time:2.13},{time:0},{lastShotTime:Infinity},{lastShotTime:-Infinity},{lastShotTime:NaN},{lastShotTime:3},{reducedMotion:true}]) {
    alignGunnerCamera(camera,{...value,...change});
    assert.ok(camera.quaternion.angleTo(base.quaternion) < 1e-7);
  }
});

test('Day and Thermal omit only local muzzle smoke, retain impact and wreck effects, and restore visibility on failure', () => {
  const shot = {id:1,createdAt:2,origin:{x:0,y:3,z:0},end:{x:0,y:2,z:-50},hitTargetId:'target'};
  for (const mode of ['day','thermal'] as const) for (const failure of [false,true]) {
    const display = new GunnerDisplay(), renderer = new FakeRenderer(), world = new THREE.Scene();
    const fire = new RangeFireEffects(), damage = new VehicleDamageEffects();
    fire.update([shot],2.09,false);
    damage.update({broken:true,x:0,y:0,z:0,heading:0},[{id:'wreck',kind:'vehicle',x:0,z:-50,neutralizedAt:2}],2.09,() => 0);
    world.add(fire.group,damage.group); display.setMode(mode);
    const smoke = fire.group.getObjectByName('local-muzzle-smoke')!;
    const dust = fire.group.children[2] as THREE.InstancedMesh;
    const source = dust.material;
    renderer.onRender = scene => {
      if (scene !== world) return;
      assert.equal(smoke.visible,false); assert.equal(dust.visible,true); assert.equal(dust.count,4);
      for (const mesh of [dust,...damage.group.children] as THREE.InstancedMesh[]) {
        const material = mesh.material as THREE.Material;
        assert.equal(mesh.visible,true); assert.equal(material.transparent,true); assert.equal(material.depthWrite,false);
      }
      if (failure) throw new Error('failed capture');
    };
    if (failure) assert.throws(() => display.capture(renderer.asRenderer(),world,frame({time:2.09}),[],[],[]),/failed capture/);
    else display.capture(renderer.asRenderer(),world,frame({time:2.09}),[],[],[]);
    assert.equal(smoke.visible,true); assert.equal(dust.material,source);
    display.dispose(); damage.dispose();
  }
});

test('transparent thermal variants retain alpha/depth, update from sources, reuse and dispose when removed', () => {
  const display = new GunnerDisplay(), renderer = new FakeRenderer(), world = new THREE.Scene();
  const alphaMap = new THREE.Texture();
  const source = new THREE.MeshBasicMaterial({color:0x555555,transparent:true,opacity:.22,depthWrite:false,alphaMap,alphaTest:.02});
  const dust = new THREE.Mesh(new THREE.BoxGeometry(),source); world.add(dust); display.setMode('thermal');
  let replacement:THREE.Material | undefined, disposed = 0;
  renderer.onRender = scene => {
    if (scene !== world) return;
    const material = dust.material as THREE.MeshBasicMaterial;
    assert.notEqual(material,source); assert.equal(material.opacity,source.opacity);
    assert.equal(material.transparent,true); assert.equal(material.depthWrite,source.depthWrite);
    assert.equal(material.depthTest,source.depthTest); assert.equal(material.alphaMap,alphaMap); assert.equal(material.alphaTest,.02);
    if (replacement) assert.equal(material,replacement);
    else { replacement = material; material.addEventListener('dispose',() => disposed++); }
  };
  for (let step = 0; step < 20; step++) {
    source.opacity = .1 + step * .01; source.depthWrite = step % 2 === 0; source.depthTest = step % 2 !== 0;
    display.capture(renderer.asRenderer(),world,frame({time:2 + step * .05}),[],[],[]);
    assert.equal(dust.material,source);
  }
  renderer.onRender = scene => { if (scene !== world) throw new Error('compositor failure'); };
  assert.throws(() => display.capture(renderer.asRenderer(),world,frame({time:4}),[],[],[]),/compositor failure/);
  assert.equal(dust.material,source); assert.equal(disposed,0);
  world.remove(dust); renderer.onRender = () => {};
  display.capture(renderer.asRenderer(),world,frame({time:5}),[],[],[]);
  assert.equal(disposed,1); display.dispose(); assert.equal(disposed,1);
});

test('paused sight refreshes reduced motion once, clears frozen vibration, and reset discards shot pose', () => {
  const display = new GunnerDisplay(), renderer = new FakeRenderer(), world = new THREE.Scene();
  const value = frame({time:2,lastShotTime:2});
  display.capture(renderer.asRenderer(),world,value,[],[],[]);
  const vibrating = display.camera.quaternion.clone(), before = renderer.renders.length;
  assert.equal(display.capture(renderer.asRenderer(),world,{...value,paused:true},[],[],[]),false);
  assert.deepEqual(display.camera.quaternion.toArray(),vibrating.toArray());
  assert.equal(display.capture(renderer.asRenderer(),world,{...value,paused:true,reducedMotion:true},[],[],[]),true);
  assert.equal(renderer.renders.length,before + 2);
  const base = new THREE.PerspectiveCamera(); alignGunnerCamera(base,{...value,reducedMotion:true});
  assert.ok(display.camera.quaternion.angleTo(base.quaternion) < 1e-7);
  assert.equal(display.capture(renderer.asRenderer(),world,{...value,paused:true,reducedMotion:true},[],[],[]),false);
  display.reset();
  display.capture(renderer.asRenderer(),world,{...value,time:0,lastShotTime:-Infinity,paused:true},[],[],[]);
  assert.ok(display.camera.quaternion.angleTo(base.quaternion) < 1e-7);
  display.dispose();
});

test('world feed uses the same scene, separate target, bounded phone size and no cabin feedback', () => {
  const display = new GunnerDisplay(), renderer = new FakeRenderer(), world = new THREE.Scene();
  const range = new THREE.Group(), cabin = new THREE.Group(); range.visible = false; world.add(range,cabin);
  const prior = renderer.snapshot();
  renderer.onRender = scene => { if (scene === world) { assert.equal(range.visible,true); assert.equal(cabin.visible,false); } };
  assert.equal(display.capture(renderer.asRenderer(),world,frame({phone:true}),[range],[cabin],[]),true);
  assert.equal(renderer.renders[0].scene,world); assert.equal(renderer.renders[0].camera,display.camera);
  assert.equal(renderer.renders[0].target!.width,512); assert.equal(renderer.renders[0].target!.height,306);
  assert.notEqual(renderer.renders[0].target,renderer.renders[1].target);
  assert.equal(renderer.renders[1].target!.texture,display.texture);
  assert.equal(display.texture.colorSpace,THREE.LinearSRGBColorSpace);
  assert.equal(range.visible,false); assert.equal(cabin.visible,true); assert.deepEqual(renderer.snapshot(),prior);
  display.dispose();
});

test('float-color-buffer capability selects both HDR targets or safe linear RGBA8 fallback', () => {
  for (const extensions of [[],['EXT_color_buffer_float'],['EXT_color_buffer_half_float']]) {
    const display = new GunnerDisplay(), renderer = new FakeRenderer(), world = new THREE.Scene();
    renderer.supportedExtensions = new Set(extensions);
    display.capture(renderer.asRenderer(),world,frame({phone:true}),[],[],[]);
    const expected = extensions.length ? THREE.HalfFloatType : THREE.UnsignedByteType;
    for (const render of renderer.renders) {
      assert.equal(render.target!.texture.type,expected);
      assert.equal(render.target!.texture.colorSpace,THREE.LinearSRGBColorSpace);
    }
    assert.equal(renderer.renders[0].scene,world);
    display.dispose();
  }
});

test('thermal preserves depth-tested geometry and restores original materials and world on render errors', () => {
  const display = new GunnerDisplay(), renderer = new FakeRenderer(), world = new THREE.Scene();
  const original = new THREE.MeshStandardMaterial({color:0x447755}), hotOriginal = new THREE.MeshStandardMaterial({color:0x998877});
  const wall = new THREE.Mesh(new THREE.BoxGeometry(),original), contact = new THREE.Mesh(new THREE.BoxGeometry(),hotOriginal);
  const hidden = new THREE.Group(); world.add(wall,contact,hidden);
  const background = new THREE.Color(0x789abc), fog = new THREE.Fog(0x789abc,2,30), override = new THREE.MeshBasicMaterial();
  world.background = background; world.fog = fog; world.overrideMaterial = override;
  const prior = renderer.snapshot(); display.setMode('thermal');
  renderer.onRender = scene => {
    if (scene !== world) return;
    assert.notEqual(wall.material,original); assert.notEqual(contact.material,hotOriginal);
    assert.equal(contact.material.depthTest,true); assert.equal(contact.material.depthWrite,true);
    assert.ok((contact.material as THREE.MeshBasicMaterial).color.r > (wall.material as THREE.MeshBasicMaterial).color.r);
    assert.equal(hidden.visible,false); assert.equal(scene.overrideMaterial,null);
    throw new Error('simulated GPU render failure');
  };
  assert.throws(() => display.capture(renderer.asRenderer(),world,frame(),[],[hidden],[contact]),/GPU render failure/);
  assert.equal(wall.material,original); assert.equal(contact.material,hotOriginal); assert.equal(hidden.visible,true);
  assert.equal(world.background,background); assert.equal(world.fog,fog); assert.equal(world.overrideMaterial,override);
  assert.deepEqual(renderer.snapshot(),prior); assert.equal(display.needsFrame(frame()),true);
  display.dispose();
});

test('cadence, pause, filter changes, engine off, reset and MFoCS never leave a zombie live feed', () => {
  const display = new GunnerDisplay(), renderer = new FakeRenderer(), world = new THREE.Scene();
  const capture = (value:GunnerFrame) => display.capture(renderer.asRenderer(),world,value,[],[],[]);
  capture(frame()); assert.equal(display.needsFrame(frame({time:1.049})),false);
  assert.equal(display.needsFrame(frame({time:1.05})),true);
  assert.equal(display.needsFrame(frame({time:2,paused:true})),false);
  display.setMode('thermal'); assert.equal(capture(frame({paused:true})),true);
  assert.equal(capture(frame({paused:true})),false);
  const before = renderer.renders.length;
  capture(frame({paused:true,engine:false}));
  assert.equal(renderer.renders.length,before + 1); assert.notEqual(renderer.renders.at(-1)!.scene,world); assert.equal(renderer.clears,1);
  assert.equal(capture(frame({time:1.1,paused:true,engine:false})),false);
  display.setMode('mfocs'); assert.equal(capture(frame({time:2})),false);
  display.setMode('day'); capture(frame({phone:true}));
  assert.equal(display.needsFrame(frame({phone:true,time:1.08})),false);
  assert.equal(display.needsFrame(frame({phone:true,time:1.084})),true);
  display.reset(); assert.equal(display.needsFrame(frame({phone:true,paused:true})),true);
  display.dispose(); assert.equal(display.needsFrame(frame()),false);
});

test('compositor failure restores renderer state and fullscreen uses only the existing renderer', () => {
  const display = new GunnerDisplay(), renderer = new FakeRenderer(), world = new THREE.Scene();
  const prior = renderer.snapshot();
  renderer.onRender = scene => { if (scene !== world) throw new Error('compositor failed'); };
  assert.throws(() => display.capture(renderer.asRenderer(),world,frame(),[],[],[]),/compositor failed/);
  assert.deepEqual(renderer.snapshot(),prior);
  renderer.onRender = () => {};
  display.capture(renderer.asRenderer(),world,frame(),[],[],[]);
  const before = renderer.renders.length;
  display.renderExpanded(renderer.asRenderer(),390,844);
  assert.equal(renderer.renders.length,before + 1); assert.equal(renderer.renders.at(-1)!.target,null); assert.deepEqual(renderer.snapshot(),prior);
  renderer.onRender = () => { throw new Error('fullscreen failed'); };
  assert.throws(() => display.renderExpanded(renderer.asRenderer(),1280,720),/fullscreen failed/);
  assert.deepEqual(renderer.snapshot(),prior);
  display.dispose();
});

test('all owned GPU resources dispose once, including both targets and thermal materials', () => {
  const display = new GunnerDisplay(), renderer = new FakeRenderer(), world = new THREE.Scene();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({color:0x445566}));
  const contact = new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()); world.add(wall,contact);
  let thermalMaterials = 0;
  renderer.onRender = scene => { if (scene === world) for (const mesh of [wall,contact]) mesh.material.addEventListener('dispose',() => thermalMaterials++); };
  display.setMode('thermal'); display.capture(renderer.asRenderer(),world,frame(),[],[],[contact]);
  const targets = new Set(renderer.targets.filter((target):target is THREE.WebGLRenderTarget => !!target && target !== renderer.target));
  let disposedTargets = 0, disposedTexture = 0;
  for (const target of targets) target.addEventListener('dispose',() => disposedTargets++);
  display.texture.addEventListener('dispose',() => disposedTexture++);
  const presentation = renderer.renders[1].scene;
  let materials = 0, geometries = 0, overlayTextures = 0;
  const seenGeometries = new Set<THREE.BufferGeometry>();
  presentation.traverse(object => { if (object instanceof THREE.Mesh) {
    object.material.addEventListener('dispose',() => materials++);
    if (!seenGeometries.has(object.geometry)) { seenGeometries.add(object.geometry); object.geometry.addEventListener('dispose',() => geometries++); }
    if (object.material.transparent) object.material.map.addEventListener('dispose',() => overlayTextures++);
  }});
  display.dispose(); display.dispose();
  assert.equal(disposedTargets,2); assert.equal(materials,2); assert.equal(geometries,1); assert.equal(overlayTextures,1); assert.equal(thermalMaterials,2);
  // RenderTarget owns its attachment lifecycle; no independent texture disposal is required.
  assert.equal(disposedTexture,0);
});


test('bundled optic branding composites once while paused and ignores late loads after disposal', () => {
  const oldDocument = globalThis.document, oldImage = globalThis.Image;
  const images: unknown[][] = [];
  const context = new Proxy({}, {get: (_,property) => property === 'drawImage' ? (...args:unknown[]) => images.push(args) : () => {}, set: () => true});
  class FakeImage {
    complete = false; naturalWidth = 0; src = '';
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
  }
  let logo: FakeImage;
  globalThis.document = {createElement: () => ({width:0,height:0,getContext: () => context})} as unknown as Document;
  globalThis.Image = class extends FakeImage {constructor() {super(); logo = this;}} as unknown as typeof Image;
  try {
    const display = new GunnerDisplay(), renderer = new FakeRenderer(), world = new THREE.Scene();
    display.capture(renderer.asRenderer(),world,frame(),[],[],[]);
    assert.equal(logo!.src,'/branding/shift5-logo.svg');
    assert.equal(display.needsFrame(frame({paused:true})),false);
    logo!.complete = true; logo!.naturalWidth = 167; logo!.onload!();
    const before = renderer.renders.length, prior = renderer.snapshot();
    assert.equal(display.capture(renderer.asRenderer(),world,frame({paused:true}),[],[],[]),true);
    assert.equal(renderer.renders.length,before + 1,'paused asset arrival only recomposites the existing world texture');
    assert.notEqual(renderer.renders.at(-1)!.scene,world);
    assert.deepEqual(images[0].slice(1),[540,360,83.5,20]);
    assert.deepEqual(renderer.snapshot(),prior);
    assert.equal(display.needsFrame(frame({paused:true})),false);
    logo!.onload!();
    const beforePreference = renderer.renders.length;
    display.capture(renderer.asRenderer(),world,frame({paused:true,reducedMotion:true}),[],[],[]);
    assert.equal(renderer.renders.length,beforePreference + 2,'simultaneous branding and motion preference updates must repaint the frozen world once');
    assert.equal(renderer.renders.at(-2)!.scene,world);
    const lateLoad = logo!.onload!;
    display.dispose();
    assert.equal(logo!.onload,null); assert.equal(logo!.onerror,null);
    lateLoad(); assert.equal(display.needsFrame(frame()),false);
  } finally {globalThis.document = oldDocument; globalThis.Image = oldImage;}
});
