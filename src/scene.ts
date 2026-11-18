import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Simulation } from './simulation';
import { CameraMotion } from './camera-motion';
import type { CrewView } from './camera-motion';
import { terrainAt } from './range';
import type { DrivingRange, RangeView } from './range';
import { firingRecoil, shotAge, RangeFireEffects } from './fire-effects';
import { createCabinShell } from './cabin-shell';
import { TargetDebris, destructionAge } from './target-debris';
import { WORLD_BOUNDS, DEPARTURE_Z, POINTS_OF_INTEREST, SIDE_ROADS, roadCenterAt } from './world-config';
import { cloneInspectionModel } from './inspection-model';
import { InstrumentScreen } from './instrument-screen';
import { AftermathClock, VehicleDamageEffects } from './damage-effects';
import { createGunTruck, setGunTruckDamage } from './gun-truck';
import { GunnerDisplay } from './gunner-display';
import { createMountedGun } from './mounted-gun';
import { hatchCameraFrame, isPhoneDrivingViewport } from './crew-camera';
import { fitGuidedModel } from './guided-camera';
import { cabinDisplayBounds, cabinDisplayFov, frameCabinDisplay, RANGE_TERMINAL } from './cabin-display';
import { applyWorldUV, createExplorationLandmark, createGroundTexture, createPolylineRoadRibbon, createRoadRibbon, createScenery, createSceneryLayout, createVehicleContactShadow, placeVehicleContactShadow, groundTint } from './environment-appearance';
import { applyVehicleAppearance } from './vehicle-appearance';
import type { GunnerDisplayMode, VehicleFault } from './mission-contract';
import { closedRampClone, createRearRamp, DismountSquad, updateRearRamp } from './dismount-squad';

/** Original, entirely procedural illustration. No asset downloads or live interfaces. */
export class VehicleScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(43, 1, .1, 350);
  private readonly exterior = new THREE.Group();
  private readonly cabin = new THREE.Group();
  private cabinCeiling!: THREE.Mesh;
  private readonly exercise = new THREE.Group();
  private readonly vehicle = new THREE.Group();
  private readonly dismountSquad = new DismountSquad();
  private rearRamp!: ReturnType<typeof createRearRamp>;
  private readonly contactShadow = createVehicleContactShadow();
  private readonly guidedVehicleBounds = new THREE.Box3();
  private readonly guidedTerrain = new THREE.Group();
  private readonly rangeWorld = new THREE.Group();
  private readonly rangeWeapon = new THREE.Group();
  private readonly originalStation = new THREE.Group();
  private readonly rangeTargets = new Map<string, THREE.Group>();
  private readonly rangeContacts = new Map<string, THREE.Group>();
  private readonly rangeReturnTracers = new Map<string, THREE.Line>();
  private readonly rangeWaypoints = new Map<number, THREE.Group>();
  private readonly rangeObjective = new THREE.Group();
  private readonly explorationMarker = new THREE.Group();
  private explorationGroundRing!: THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>;
  private lastNavigationX = NaN;
  private lastNavigationZ = NaN;
  private readonly fireEffects = new RangeFireEffects();
  private readonly targetDebris = new TargetDebris();
  private readonly damageEffects = new VehicleDamageEffects();
  private readonly aftermathClock = new AftermathClock();
  private lastRangeTime = -1;
  private readonly brokenVehicle = { broken: false, x: 0, y: 0, z: 0, heading: 0 };
  private readonly rangeHorizon = new THREE.Group();
  private readonly debrisGround = (x:number,z:number) => terrainAt(x,z).height;
  private rangeFlash!: THREE.Mesh;
  private rangeFlashCore!: THREE.Mesh;
  private readonly rangeAimMarker = new THREE.Group();
  private readonly rangeLockMarker = new THREE.Group();
  private rangeActive = false;
  private rangeWheelRoll = 0;
  private rangeSteer = 0;
  private readonly wheels: THREE.Group[] = [];
  private readonly movingGround = new THREE.Group();
  private readonly dust: THREE.Points;
  private readonly screen: THREE.Mesh;
  private readonly screenMaterial: THREE.MeshBasicMaterial;
  private readonly cabinTerminal: THREE.Group;
  private readonly cabinTerminalBounds: THREE.Box3;
  private readonly instrumentScreen = new InstrumentScreen();
  private readonly gunnerDisplay = new GunnerDisplay();
  private gunnerDisplayMode: GunnerDisplayMode = 'day';
  private cabinDisplayFocused = false;
  private readonly leds: THREE.MeshStandardMaterial;
  private readonly serviceRing: THREE.Mesh;
  private readonly target = new THREE.Vector3();
  private readonly aim = new THREE.Vector3();
  private readonly basePosition = new THREE.Vector3();
  private readonly baseAim = new THREE.Vector3();
  private readonly fromPosition = new THREE.Vector3();
  private readonly fromAim = new THREE.Vector3();
  private readonly motion = new CameraMotion();
  private readonly curtain = document.createElement('div');
  private viewMode: CrewView = 'inside';
  private cameraKey = '';
  private readonly sun: THREE.DirectionalLight;
  private width = 1;
  private height = 1;
  private lastTime = 0;
  private firstFrame = true;
  private readonly textures: THREE.Texture[] = [];
  private earthTexture!: THREE.DataTexture;
  private roadTexture!: THREE.DataTexture;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.domElement.setAttribute('aria-label', 'Original three-dimensional illustration of an eight-wheeled vehicle, crew cabin, and protected service exercise');
    this.renderer.domElement.setAttribute('role', 'img');
    container.appendChild(this.renderer.domElement);
    // Fade only the environment. Controls, captions and evidence stay steady and readable.
    this.curtain.setAttribute('aria-hidden', 'true');
    Object.assign(this.curtain.style, { position: 'absolute', inset: '0', background: '#07111b', opacity: '0', pointerEvents: 'none' });
    container.appendChild(this.curtain);
    this.scene.add(this.exterior, this.cabin, this.exercise, this.rangeWorld);
    this.rangeWorld.add(this.dismountSquad.group);
    this.exterior.add(this.guidedTerrain);
    this.scene.add(new THREE.HemisphereLight(0xd8e5ee, 0x78684c, 1.6));
    this.sun = new THREE.DirectionalLight(0xffe5bf, 3.3);
    this.sun.position.set(-8, 12, 7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: .5, far: 50 });
    this.sun.shadow.normalBias = .035;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.createTerrain();
    this.createVehicle();
    this.createRange();
    this.exterior.add(this.vehicle,this.contactShadow);
    this.textures.push(this.contactShadow.material.map!);
    const dustGeometry = new THREE.BufferGeometry();
    const dustPositions: number[] = [];
    for (let i = 0; i < 65; i++) dustPositions.push((this.random(i + 200) - .5) * 3, this.random(i + 600) * .8, -3 - this.random(i + 400) * 5);
    dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dustPositions, 3));
    this.dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0xcbb694, size: .19, transparent: true, opacity: .2, depthWrite: false }));
    this.exterior.add(this.dust);
    const display = this.createCabin();
    this.screen = display.screen;
    this.screenMaterial = display.material;
    this.cabinTerminal = display.terminal;
    this.cabinTerminalBounds = cabinDisplayBounds(this.cabinTerminal);
    this.leds = display.leds;
    this.serviceRing = this.createExercise();
    this.camera.position.set(-9, 5, 10);
    this.resize();
  }

  private random(n: number): number { return ((Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1; }
  private material(color: THREE.ColorRepresentation, roughness = .85, metalness = .08) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }
  private box(parent: THREE.Object3D, size: number[], position: number[], material: THREE.Material, rotation?: number[]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
    mesh.position.set(position[0], position[1], position[2]);
    if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  private cylinder(parent: THREE.Object3D, radius: number, depth: number, position: number[], material: THREE.Material, rotation?: number[], segments = 24) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, segments), material);
    mesh.position.set(position[0], position[1], position[2]);
    if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  /** Merge static pieces per material; wheels and the weapon retain independent transforms. */
  private compactMeshes(parent: THREE.Group) {
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const object of parent.children) {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) continue;
      const batch = batches.get(object.material) ?? []; batch.push(object); batches.set(object.material,batch);
    }
    for (const [material, meshes] of batches) {
      if (meshes.length < 2) continue;
      const pieces = meshes.map(mesh => {
        mesh.updateMatrix();
        const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        geometry.applyMatrix4(mesh.matrix);
        // All procedural solid meshes share positions/normals/UVs; the custom hull has no UV map.
        if (!geometry.getAttribute('uv')) geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 2),2));
        return geometry;
      });
      const merged = mergeGeometries(pieces);
      pieces.forEach(piece => piece.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged,material); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
      meshes.forEach(piece => { parent.remove(piece); piece.geometry.dispose(); });
    }
  }
  /** Seeded paint variation and fine abrasion; all marks are generated locally. */
  private surfaceTexture(kind: 'armor' | 'earth') {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = kind === 'armor' ? '#b8b9ad' : '#b3aa94'; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 11000; i++) {
      const value = Math.floor((kind === 'armor' ? 140 : 120) + this.random(i + 4400) * 80);
      ctx.fillStyle = `rgba(${value},${value},${value},${kind === 'armor' ? .13 : .26})`;
      const size = kind === 'armor' ? 1 + this.random(i + 900) * 3 : 1 + this.random(i + 900) * 5;
      ctx.fillRect(this.random(i + 2400) * 512, this.random(i + 3400) * 512, size, size);
    }
    for (let i = 0; i < 110; i++) {
      ctx.strokeStyle = kind === 'armor' ? 'rgba(61,65,54,.055)' : 'rgba(70,65,51,.10)';
      ctx.lineWidth = .5 + this.random(i + 60) * 2;
      const x = this.random(i + 710) * 512, y = this.random(i + 190) * 512;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + this.random(i + 12) * 22, y + 2); ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(kind === 'armor' ? 2 : 32, kind === 'armor' ? 2 : 32);
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.textures.push(texture); return texture;
  }
  private textTexture(lines: string[], foreground: string, background: string, width = 1024, height = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = foreground;
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
      ctx.font = i === 0 ? '600 42px monospace' : '28px monospace';
      ctx.fillText(line, 42, 40 + i * 66);
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(texture);
    return texture;
  }

  private createTerrain() {
    // Local procedural sky keeps a pale, sunlit horizon behind the Front Range.
    const skyCanvas = document.createElement('canvas'); skyCanvas.width = 16; skyCanvas.height = 512;
    const skyContext = skyCanvas.getContext('2d')!;
    const skyGradient = skyContext.createLinearGradient(0,0,0,512);
    skyGradient.addColorStop(0,'#4d7797'); skyGradient.addColorStop(.39,'#91afbd');
    skyGradient.addColorStop(.55,'#cbd0c5'); skyGradient.addColorStop(.68,'#d6ceb8'); skyGradient.addColorStop(1,'#c0b399');
    skyContext.fillStyle = skyGradient; skyContext.fillRect(0,0,16,512);
    const skyTexture = new THREE.CanvasTexture(skyCanvas); skyTexture.colorSpace = THREE.SRGBColorSpace; this.textures.push(skyTexture);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(280,32,16),new THREE.MeshBasicMaterial({map:skyTexture,side:THREE.BackSide,fog:false,depthWrite:false}));
    sky.renderOrder = -10; this.guidedTerrain.add(sky);
    this.earthTexture = createGroundTexture('earth'); this.roadTexture = createGroundTexture('road');
    for (const texture of [this.earthTexture, this.roadTexture]) {
      texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy()); this.textures.push(texture);
    }
    const earth = new THREE.MeshStandardMaterial({ color: 0xada17d, map: this.earthTexture, bumpMap: this.earthTexture, bumpScale: .035, roughness: 1 });
    const ground = this.box(this.guidedTerrain, [240, .12, 220], [0, -.12, -60], earth);
    // Map from world metres instead of stretching one UV tile over the whole landscape.
    ground.geometry.translate(0,0,-60); ground.position.z = 0; applyWorldUV(ground.geometry);
    this.guidedTerrain.add(createRoadRibbon(-130, 40, () => ({ height: 0, kind: 'grass' }), false, this.roadTexture));
    this.guidedTerrain.add(this.movingGround);
    const guidedSample = () => ({ height: -.045, kind: 'grass' as const });
    this.guidedTerrain.add(createScenery(createSceneryLayout({ minX: -75, maxX: 75, minZ: -95, maxZ: 25 }, guidedSample, false), guidedSample));
    // Small, embedded road stones convey guided motion without a moving vegetation carpet.
    const gravel = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.04,0),this.material(0xbeb39b),260);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 260; i++) {
      dummy.position.set((this.random(i + 20) - .5) * 7.4,-.015,this.random(i + 1000) * 44 - 28);
      dummy.rotation.set(this.random(i),this.random(i + 1) * 6,this.random(i + 2));
      dummy.scale.set(.5 + this.random(i + 3),.25,.7); dummy.updateMatrix(); gravel.setMatrixAt(i,dummy.matrix);
    }
    this.movingGround.add(gravel);
    // Uneven intermediate foothills sit in front of the high, distant skyline.
    const foothillVertices: number[] = [], foothillIndices: number[] = [];
    for (let i = 0; i < 35; i++) {
      const x = -145 + i * 8.6, height = 2.8 + this.random(i + 2081) * 3.7;
      foothillVertices.push(x,-.05,-68,x,height,-88 - this.random(i + 2082) * 12,x,-.05,-113);
      if (i < 34) { const n = i * 3; foothillIndices.push(n,n + 1,n + 3,n + 1,n + 4,n + 3,n + 1,n + 2,n + 4,n + 2,n + 5,n + 4); }
    }
    const foothillGeometry = new THREE.BufferGeometry(); foothillGeometry.setAttribute('position',new THREE.Float32BufferAttribute(foothillVertices,3)); foothillGeometry.setIndex(foothillIndices); foothillGeometry.computeVertexNormals();
    const foothills = new THREE.Mesh(foothillGeometry,this.material(0x92917c)); foothills.material.side = THREE.DoubleSide; this.guidedTerrain.add(foothills);
    // Layered low-poly Front Range ridges, including a distinct broad high summit.
    for (let layer = 0; layer < 3; layer++) {
      const vertices: number[] = [], indices: number[] = [];
      for (let i = 0; i < 27; i++) {
        const x = -150 + i * 12;
        const peak = 5 + this.random(i + 60 + layer * 100) * 6 + Math.max(0, 1 - Math.abs(i - 9) / 5) * (layer === 2 ? 16 : 7);
        vertices.push(x, -.1, -108 - layer * 20, x, peak, -108 - layer * 20);
        if (i < 26) { const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.setIndex(indices); geo.computeVertexNormals();
      const mountain = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: [0x8b8c86, 0x9fa39d, 0xb0b8b5][layer], side: THREE.DoubleSide })); this.guidedTerrain.add(mountain);
    }
  }

  private createVehicle() {
    const armor = this.material(0x727750, .91, .14), panel = this.material(0x606847, .94, .12), edge = this.material(0x8c8d70, .83, .2);
    const paint = this.surfaceTexture('armor');
    armor.map = paint; panel.map = paint; edge.map = paint;
    const recess = this.material(0x313b2e, .98), fastener = this.material(0x555e45, .76, .3);
    const rubber = this.material(0x242924, .97, 0), hub = this.material(0x666a52, .8, .2);
    // A closed angular hull: narrow lower body, broad shoulder, sloping front glacis.
    const vertices = [
      -1.02,.68,-3.05, 1.02,.68,-3.05, -1.02,.68,2.55, 1.02,.68,2.55,
      -1.37,1.38,-3.13, 1.37,1.38,-3.13, -1.37,1.38,3.12, 1.37,1.38,3.12,
      -1.16,2.12,-2.86, 1.16,2.12,-2.86, -1.16,2.12,2.10, 1.16,2.12,2.10,
    ];
    const faces = [0,2,1,1,2,3, 0,1,4,1,5,4, 4,5,8,5,9,8, 2,6,3,3,6,7, 6,10,7,7,10,11, 8,9,10,9,11,10,
      0,4,2,2,4,6,4,8,6,6,8,10, 1,3,5,3,7,5,5,7,9,7,11,9];
    // Reverse the closed hull's inward construction winding before computing outward normals.
    for (let i = 0; i < faces.length; i += 3) [faces[i + 1], faces[i + 2]] = [faces[i + 2], faces[i + 1]];
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(faces);
    const hullGeometry = geometry.toNonIndexed(); hullGeometry.computeVertexNormals(); geometry.dispose();
    const hull = new THREE.Mesh(hullGeometry, armor); hull.castShadow = true; hull.receiveShadow = true; this.vehicle.add(hull);
    this.box(this.vehicle, [2.35,.14,4.5], [0,2.16,-.35], armor);
    this.box(this.vehicle, [1.72,1.25,.075], [0,1.44,-3.14], panel);
    this.box(this.vehicle, [1.4,.04,.15], [0,.9,-3.22], edge);
    for (const side of [-1, 1]) {
      for (const z of [-2.12, -.71, .71, 2.12]) {
        const wheel = new THREE.Group(); wheel.name = 'inspection-wheel'; wheel.position.set(side * 1.36,.63,z); this.vehicle.add(wheel); this.wheels.push(wheel);
        this.cylinder(wheel,.605,.43,[0,0,0],rubber,[0,0,Math.PI / 2],40);
        // Rounded shoulders, recessed steel rim and bead ring give the tire depth.
        for (const shoulder of [-.19,.19]) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(.465,.135,8,40),rubber);
          ring.rotation.y = Math.PI / 2; ring.position.x = shoulder; ring.castShadow = true; wheel.add(ring);
        }
        const outer = side * .255;
        this.cylinder(wheel,.36,.027,[outer,0,0],recess,[0,0,Math.PI / 2],32);
        this.cylinder(wheel,.303,.04,[outer + side * .015,0,0],hub,[0,0,Math.PI / 2],32);
        const bead = new THREE.Mesh(new THREE.TorusGeometry(.325,.025,6,32),hub);
        bead.rotation.y = Math.PI / 2; bead.position.x = outer + side * .025; wheel.add(bead);
        this.cylinder(wheel,.13,.10,[outer + side * .06,0,0],panel,[0,0,Math.PI / 2],16);
        for (let k = 0; k < 28; k++) {
          const a = k / 28 * Math.PI * 2;
          for (const row of [-1,1]) {
            this.box(wheel,[.225,.075,.13],[row * .115,Math.sin(a) * .602,Math.cos(a) * .602],rubber,[a + Math.PI / 2,0,row * .27]);
          }
        }
        for (let k = 0; k < 10; k++) {
          const a = k / 10 * Math.PI * 2;
          this.cylinder(wheel,.024,.035,[outer + side * .047,Math.sin(a) * .235,Math.cos(a) * .235],edge,[0,0,Math.PI / 2],6);
        }
        this.box(this.vehicle,[.46,.12,1.25],[side * 1.34,1.31,z],panel);
      }
      // Separate shoulder plates with visible seams and recessed bolt heads.
      for (let j = 0; j < 4; j++) {
        const z = -2.15 + j * 1.18;
        this.box(this.vehicle,[.075,.54,1.10],[side * 1.285,1.72,z],panel,[0,0,side * .24]);
        for (const y of [1.51,1.92]) for (const dz of [-.43,.43])
          this.cylinder(this.vehicle,.023,.022,[side * (1.34 - (y - 1.51) * .2),y,z + dz],fastener,[0,0,Math.PI / 2],6);
      }
      // Rub rails and small tie-down loops remain distinct from the hull plates.
      this.box(this.vehicle,[.09,.075,4.65],[side * 1.37,1.36,-.14],panel);
      for (const z of [-2.58,-1.1,.5,1.9]) {
        this.box(this.vehicle,[.09,.06,.24],[side * 1.30,2.04,z],edge);
        this.box(this.vehicle,[.09,.065,.13],[side * 1.32,2.10,z],panel);
      }
      this.box(this.vehicle,[.2,.16,.3],[side * 1.12,1.38,3.0],edge);
      const lamp = this.material(0xe2d3aa,.3,.1);
      this.cylinder(this.vehicle,.10,.07,[side * 1.12,1.4,3.17],lamp,[Math.PI / 2,0,0],12);
      this.box(this.vehicle,[.16,.31,.13],[side * 1.1,.88,-3.16],rubber);
    }
    // Angled glacis applique, engine deck louvers and small protected vision blocks.
    this.box(this.vehicle,[1.15,.045,1.02],[.48,1.80,2.62],panel,[-.69,0,0]);
    for (let i = 0; i < 10; i++) this.box(this.vehicle,[.83,.025,.045],[.62,2.245,.12 + i * .105],recess);
    for (let i = 0; i < 3; i++) {
      this.box(this.vehicle,[.22,.13,.16],[-.89 + i * .25,2.17,2.08],panel,[-.12,0,0]);
      this.box(this.vehicle,[.16,.047,.012],[-.89 + i * .25,2.21,2.167],this.material(0x263b35,.22,.4));
    }
    for (const x of [-.98,.98]) {
      this.box(this.vehicle,[.29,.08,.16],[x,1.15,3.12],panel);
      this.cylinder(this.vehicle,.065,.09,[x,.99,3.16],recess,[Math.PI / 2,0,0],12);
      this.box(this.vehicle,[.38,.05,.22],[x,1.55,3.02],panel);
    }
    // The hinge group stays separate from static hull compaction. A dark inset
    // masks the original closed illustrative hull only while the ramp is open.
    this.rearRamp = createRearRamp(panel,edge); this.vehicle.add(this.rearRamp.root);
    // Commander's and driver's hatches, periscopes, low remote station, stowage and aerials.
    this.cylinder(this.vehicle,.46,.11,[-.6,2.29,1.25],panel);
    this.cylinder(this.vehicle,.4,.07,[-.6,2.36,1.25],armor);
    for (let j = 0; j < 3; j++) this.box(this.vehicle,[.19,.1,.12],[-.91 + j * .28,2.34,1.78],this.material(0x293b36,.25,.25),[-.2,0,0]);
    this.vehicle.add(this.originalStation);
    this.originalStation.name = 'inspection-station';
    this.cylinder(this.originalStation,.47,.14,[.48,2.3,-.65],panel);
    this.box(this.originalStation,[.58,.4,.7],[.48,2.55,-.65],armor);
    this.box(this.originalStation,[.4,.29,.37],[.48,2.83,-.48],panel);
    this.box(this.originalStation,[.07,.07,1.25],[.48,2.83,.25],this.material(0x333a31));
    this.box(this.vehicle,[.65,.4,.5],[.55,2.4,-2.05],panel);
    for (const x of [-.95,.95]) {
      this.cylinder(this.vehicle,.025,2.1,[x,3.17,-2.36],this.material(0x373e31),[0,0,x * .06],6);
      this.cylinder(this.vehicle,.09,.16,[x,2.24,-2.36],panel);
    }
    this.box(this.vehicle,[.74,.17,1.1],[-.62,2.32,-1.55],this.material(0x918770));
    for (const z of [-1.92,-1.21]) this.box(this.vehicle,[.79,.025,.055],[-.62,2.42,z],panel);
    const marking = this.textTexture(['EXERCISE', 'ILLUSTRATIVE'], '#d7d2b8', '#666b49', 512, 256);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(.76,.38),new THREE.MeshStandardMaterial({map:marking,roughness:1})); sign.position.set(-1.338,1.72,-2.0); sign.rotation.y = -Math.PI / 2; this.vehicle.add(sign);
    this.wheels.forEach(wheel => this.compactMeshes(wheel));
    this.compactMeshes(this.originalStation);
    this.compactMeshes(this.vehicle);
    applyVehicleAppearance(this.vehicle,{armor:[armor,panel,edge],rubber:[rubber],metal:[hub,fastener]});
    this.guidedVehicleBounds.setFromObject(this.vehicle);
  }

  /** An original, bounded arcade landscape. Surface colors match the driving model. */
  private createRange() {
    this.rangeWorld.visible = false;
    // The horizon follows the observer outside the drivable world; mountains cannot be driven through.
    const sky = this.guidedTerrain.children[0].clone(); this.rangeHorizon.add(sky);
    this.rangeWorld.add(this.rangeHorizon, this.targetDebris.group, this.damageEffects.group);
    const positions: number[] = [], vertexColors: number[] = [], indices:number[] = [];
    const minX = WORLD_BOUNDS.minX - 32, maxX = WORLD_BOUNDS.maxX + 32;
    const minZ = WORLD_BOUNDS.minZ - 32, maxZ = WORLD_BOUNDS.maxZ + 32, step = 8;
    const columns = Math.round((maxX - minX) / step) + 1, rows = Math.round((maxZ - minZ) / step) + 1;
    // A bounded indexed coarse mesh replaces the old two-unit triangle soup.
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const x = minX + column * step, z = minZ + row * step, sample = terrainAt(x,z);
      const color = groundTint(sample.kind,x,z);
      positions.push(x,sample.height - .055,z); vertexColors.push(color.r,color.g,color.b);
      if (row < rows - 1 && column < columns - 1) {
        const a = row * columns + column, b = a + columns;
        indices.push(a,b,a + 1,a + 1,b,b + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3)); geometry.setAttribute('color',new THREE.Float32BufferAttribute(vertexColors,3)); geometry.setIndex(indices); geometry.computeVertexNormals(); applyWorldUV(geometry);
    const ground = new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,map:this.earthTexture,bumpMap:this.earthTexture,bumpScale:.035,roughness:1})); ground.name = 'expanded-range-ground'; ground.receiveShadow = true; this.rangeWorld.add(ground);
    // Main and optional loop roads share their layout with traction and the map.
    this.rangeWorld.add(createRoadRibbon(minZ,maxZ,terrainAt,true,this.roadTexture));
    for (const road of SIDE_ROADS) this.rangeWorld.add(createPolylineRoadRibbon(road.points,road.halfWidth,terrainAt,this.roadTexture));
    this.rangeWorld.add(createScenery(createSceneryLayout(WORLD_BOUNDS,terrainAt,true),terrainAt));
    const white = this.material(0xe9e6d9), orange = this.material(0xec692e), rail = this.material(0x656650);
    const markers = new THREE.Group();
    for (let z = WORLD_BOUNDS.minZ; z <= WORLD_BOUNDS.maxZ; z += 18) for (const side of [-1,1]) {
      const x = roadCenterAt(z) + side * 6.4, height = terrainAt(x,z).height;
      this.box(markers,[.10,.76,.10],[x,height + .36,z],white); this.box(markers,[.15,.23,.13],[x,height + .65,z],orange);
    }
    for (let x = WORLD_BOUNDS.minX; x <= WORLD_BOUNDS.maxX; x += 24) for (const z of [WORLD_BOUNDS.minZ,WORLD_BOUNDS.maxZ]) this.box(markers,[.18,1.0,.18],[x,terrainAt(x,z).height + .5,z],orange);
    for (let z = WORLD_BOUNDS.minZ; z <= WORLD_BOUNDS.maxZ; z += 24) for (const x of [WORLD_BOUNDS.minX,WORLD_BOUNDS.maxX]) this.box(markers,[.18,1.0,.18],[x,terrainAt(x,z).height + .5,z],orange);
    this.compactMeshes(markers); this.rangeWorld.add(markers);
    const sign = (x:number,z:number,lines:string[],signWidth = 6.4) => {
      const y = terrainAt(x,z).height;
      this.box(this.rangeWorld,[signWidth,1.15,.12],[x,y + 2.25,z],orange);
      for (const dx of [-signWidth * .36,signWidth * .36]) this.box(this.rangeWorld,[.10,2.3,.10],[x + dx,y + 1.1,z],rail);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(signWidth - .15,1.01),new THREE.MeshBasicMaterial({map:this.textTexture(lines,'#ffffff','#b94b21',1024,256),side:THREE.DoubleSide}));
      face.position.set(x,y + 2.25,z + .067); this.rangeWorld.add(face);
    };
    sign(-11,68,['SHIFT5 / PRACTICE','BREAK PANELS / TEST DRIVE']);
    sign(13,-112,['LINE OF DEPARTURE','COMBAT EXERCISE AHEAD']);
    sign(roadCenterAt(-430) + 12,-430,['RIDGE PASS','FOLLOW THE WINDING ROAD']);
    sign(roadCenterAt(-740) - 13,-740,['DISMOUNT ZONE AHEAD','CLEAR FICTIONAL CONTACTS']);
    // A physical stripe and paired banners make crossing the departure line unmistakable.
    const departure = new THREE.Group();
    this.box(departure,[30,.045,2.2],[roadCenterAt(DEPARTURE_Z),.045,DEPARTURE_Z],orange);
    for (let i = 0; i < 15; i++) this.box(departure,[1,.012,2.24],[roadCenterAt(DEPARTURE_Z) - 14 + i * 2,.074,DEPARTURE_Z],white);
    for (const side of [-1,1]) {
      const x = roadCenterAt(DEPARTURE_Z) + side * 17;
      this.box(departure,[.16,5.4,.16],[x,2.7,DEPARTURE_Z],rail);
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(3.3,2),new THREE.MeshBasicMaterial({map:this.textTexture(['LINE OF','DEPARTURE'],'#ffffff','#aa3529',512,256),side:THREE.DoubleSide})); banner.position.set(x,4.3,DEPARTURE_Z); departure.add(banner);
    }
    this.compactMeshes(departure); this.rangeWorld.add(departure);
    const landmarks = new THREE.Group(), concrete = this.material(0x858474), rust = this.material(0x876f51);
    for (const z of [-385,-645]) {
      const x = roadCenterAt(z) + 27, y = terrainAt(x,z).height;
      this.box(landmarks,[8,2.8,4.5],[x,y + 1.4,z],concrete);
      this.box(landmarks,[8.5,.25,5],[x,y + 2.9,z],rust,[0,0,.035]);
      this.box(landmarks,[1.6,2.0,.1],[x,y + 1.0,z + 2.3],rail);
      this.cylinder(landmarks,1.7,4,[x + 8,y + 2,z],rust,undefined,12);
    }
    this.compactMeshes(landmarks); this.rangeWorld.add(landmarks);
    for (const point of POINTS_OF_INTEREST) {
      const landmark = createExplorationLandmark(point.id === 'west-overlook' ? 'overlook' : point.id === 'signal-relay' ? 'relay' : 'quarry');
      landmark.position.set(point.x,terrainAt(point.x,point.z).height,point.z);
      this.compactMeshes(landmark); this.rangeWorld.add(landmark);
      sign(point.x + 13,point.z + 5,[point.label.toUpperCase(),'OPTIONAL EXPLORATION STOP'],7.8);
    }
    // One unobtrusive world-space marker; no beam, animation or screen overlay.
    const navigationMaterial = new THREE.MeshBasicMaterial({color:0x73dce0,side:THREE.DoubleSide});
    this.explorationGroundRing = new THREE.Mesh(new THREE.RingGeometry(5.8,6.2,32).rotateX(-Math.PI / 2),navigationMaterial);
    this.explorationMarker.add(this.explorationGroundRing);
    const navigationCap = new THREE.Mesh(new THREE.OctahedronGeometry(.7,0),navigationMaterial);
    navigationCap.position.y = 3; this.explorationMarker.add(navigationCap);
    this.explorationMarker.name = 'selected-exploration-waypoint'; this.explorationMarker.visible = false;
    this.rangeWorld.add(this.explorationMarker);
    for (let layer = 0; layer < 3; layer++) {
      const vertices:number[] = [], ridgeIndices:number[] = [];
      for (let i = 0; i <= 48; i++) {
        const angle = i / 48 * Math.PI * 2, radius = 245 + layer * 11;
        const peak = 13 + this.random(i + layer * 100 + 61) * 17 + Math.max(0,1 - Math.abs(i - 34) / 5) * (34 + layer * 5);
        vertices.push(Math.cos(angle) * radius,-3,Math.sin(angle) * radius,Math.cos(angle) * radius,peak,Math.sin(angle) * radius);
        if (i < 48) { const n = i * 2; ridgeIndices.push(n,n + 1,n + 2,n + 1,n + 3,n + 2); }
      }
      const ridge = new THREE.BufferGeometry(); ridge.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)); ridge.setIndex(ridgeIndices);
      const mountains = new THREE.Mesh(ridge,new THREE.MeshBasicMaterial({color:[0x8b8c7b,0x9da69f,0xb1bcb8][layer],side:THREE.DoubleSide})); this.rangeHorizon.add(mountains);
    }
    // The visual prop shares the unchanged local muzzle and aim transform.
    this.rangeWeapon.add(createMountedGun());
    this.rangeFlash = new THREE.Mesh(new THREE.ConeGeometry(.17,.64,7),new THREE.MeshBasicMaterial({color:0xffa83c,transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending}));
    this.rangeFlash.rotation.x = -Math.PI / 2; this.rangeFlash.position.set(0,3,-1.28); this.rangeFlash.visible = false; this.rangeWeapon.add(this.rangeFlash);
    this.rangeFlashCore = new THREE.Mesh(new THREE.SphereGeometry(.09,7,5),new THREE.MeshBasicMaterial({color:0xfff4c6,transparent:true,opacity:.95,depthWrite:false,blending:THREE.AdditiveBlending}));
    this.rangeFlashCore.position.set(0,3,-1.07); this.rangeFlashCore.scale.set(.8,.8,2.1); this.rangeFlashCore.visible = false; this.rangeWeapon.add(this.rangeFlashCore);
    this.rangeWorld.add(this.rangeWeapon);
    this.rangeWorld.add(this.fireEffects.group);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.38,.026,6,36),new THREE.MeshBasicMaterial({color:0xff8e4b,depthTest:false,transparent:true,opacity:.85}));
    ring.renderOrder = 2; this.rangeAimMarker.add(ring);
    for (const angle of [0,Math.PI / 2]) {
      const tick = new THREE.Mesh(new THREE.BoxGeometry(.15,.025,.015),ring.material); tick.position.set(Math.cos(angle) * .52,Math.sin(angle) * .52,0); tick.rotation.z = angle; this.rangeAimMarker.add(tick);
    }
    this.rangeWorld.add(this.rangeAimMarker);
    const lockRing = new THREE.Mesh(new THREE.RingGeometry(.72,.80,4),new THREE.MeshBasicMaterial({color:0xf4f8ff,side:THREE.DoubleSide,depthTest:false,depthWrite:false,transparent:true,opacity:.94}));
    lockRing.renderOrder = 3; this.rangeLockMarker.add(lockRing);
    this.rangeLockMarker.visible = false; this.rangeWorld.add(this.rangeLockMarker);
    const objectiveOrange = new THREE.MeshBasicMaterial({color:0xff9a4e,side:THREE.DoubleSide});
    const objectiveWhite = new THREE.MeshBasicMaterial({color:0xfff6df,side:THREE.DoubleSide});
    for (const [inner,outer,material] of [[7.65,8,objectiveOrange],[6.8,6.93,objectiveWhite]] as const) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(inner,outer,64),material);
      ring.rotation.x = -Math.PI / 2; ring.position.y = .10; ring.name = 'objective-ground-ring'; this.rangeObjective.add(ring);
    }
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,7,8),new THREE.MeshBasicMaterial({color:0xffbc73,transparent:true,opacity:.66}));
    beacon.position.y = 3.5; this.rangeObjective.add(beacon);
    const cap = new THREE.Mesh(new THREE.OctahedronGeometry(.68),objectiveOrange); cap.position.y = 7.3; this.rangeObjective.add(cap);
    const objectiveLabel = new THREE.Mesh(new THREE.PlaneGeometry(7.8,1.1),new THREE.MeshBasicMaterial({map:this.textTexture(['DISMOUNT ZONE'],'#fff7e8','#a45124',1024,128),side:THREE.DoubleSide}));
    objectiveLabel.position.set(0,4.5,0); this.rangeObjective.add(objectiveLabel);
    this.rangeWorld.add(this.rangeObjective);
  }

  private createRangeContact(id:string,x:number,z:number,_radius:number,kind:'troop' | 'vehicle' = 'vehicle') {
    const contact = new THREE.Group(); contact.position.set(x,terrainAt(x,z).height,z);
    const body = new THREE.Group(); body.name = 'contact-body'; contact.add(body);
    if (kind === 'troop') {
      const olive = this.material(0x697052,.93,.12), dark = this.material(0x30352e), sand = this.material(0x9a9271), skin = this.material(0xa58b6d), steel = this.material(0x4b5147,.73,.36);
      // Original fictional infantry: human proportions, equipment and a relaxed, uneven stance.
      this.box(body,[.43,.54,.25],[0,1.23,0],olive,[.05,0,-.035]);
      this.box(body,[.45,.4,.12],[0,1.25,-.17],sand,[.05,0,0]);
      this.box(body,[.35,.42,.18],[0,1.26,.22],dark,[.08,0,0]); // backpack
      for (const side of [-1,1]) {
        this.box(body,[.13,.18,.10],[side * .135,1.19,-.26],olive);
        this.box(body,[.17,.40,.19],[side * .13,.78,side * .04],olive,[side * .10,0,side * .08]);
        this.box(body,[.145,.40,.16],[side * .155,.41,side * .065],sand,[-side * .08,0,side * .02]);
        this.box(body,[.19,.14,.31],[side * .16,.13,side * .065 - .055],dark);
      }
      this.cylinder(body,.075,.10,[0,1.56,0],skin,undefined,7);
      const head = new THREE.Mesh(new THREE.SphereGeometry(.135,10,8),skin); head.position.set(0,1.72,-.005); head.scale.set(.87,1.13,.94); body.add(head);
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(.16,10,8,0,Math.PI * 2,0,Math.PI * .59),olive); helmet.position.set(0,1.78,.005); body.add(helmet);
      this.box(body,[.32,.035,.26],[0,1.77,-.025],olive);
      this.box(body,[.22,.055,.035],[0,1.72,-.128],dark); // goggles
      this.box(body,[.14,.32,.17],[-.285,1.30,-.035],olive,[.18,0,-.30]);
      this.box(body,[.12,.29,.14],[-.255,1.07,-.16],sand,[.95,0,-.23]);
      this.box(body,[.14,.33,.17],[.27,1.30,-.04],olive,[.32,0,.19]);
      this.box(body,[.12,.29,.14],[.22,1.10,-.22],sand,[.9,0,.27]);
      for (const side of [-1,1]) this.box(body,[.105,.10,.12],[side * .17,1.05,-.35],dark);
      const weapon = new THREE.Group(); weapon.name = 'contact-weapon'; weapon.position.set(0,1.10,-.35); weapon.rotation.set(.18,0,-.18);
      this.box(weapon,[.085,.13,.37],[0,0,0],dark);
      this.box(weapon,[.065,.07,.27],[0,.005,.29],sand);
      this.cylinder(weapon,.022,.45,[0,.02,-.35],steel,[Math.PI / 2,0,0],6);
      this.box(weapon,[.065,.18,.10],[0,-.12,.03],dark,[.18,0,0]);
      this.compactMeshes(weapon); body.add(weapon); body.rotation.y = -.12;
    } else {
      const truck = createGunTruck(); this.compactMeshes(truck); body.add(truck);
    }
    this.compactMeshes(body);
    body.traverse(child => { if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) child.material.userData.contactBaseColor = child.material.color.getHex(); });
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(kind === 'troop' ? .23 : .42),new THREE.MeshBasicMaterial({color:0xff4e3c}));
    marker.position.set(0,kind === 'troop' ? 2.25 : 3.4,0); marker.name = 'contact-marker'; contact.add(marker);
    const halo = new THREE.Mesh(new THREE.RingGeometry(kind === 'troop' ? .63 : 2.0,kind === 'troop' ? .73 : 2.12,32),new THREE.MeshBasicMaterial({color:0xbe3f30,side:THREE.DoubleSide})); halo.rotation.x = -Math.PI / 2; halo.position.y = .045; halo.name = 'contact-ground-marker'; contact.add(halo);
    this.rangeContacts.set(id,contact); this.rangeWorld.add(contact);
    return contact;

  }

  private createRangeWaypoint(index:number,x:number,z:number) {
    const marker = new THREE.Group(); marker.position.set(x,terrainAt(x,z).height,z);
    const material = new THREE.MeshBasicMaterial({color:0xffbc73,side:THREE.DoubleSide});
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.0,3.18,40),material); ring.rotation.x = -Math.PI / 2; ring.position.y = .09; marker.add(ring);
    for (const side of [-1,1]) {
      this.box(marker,[.15,2.2,.15],[side * 3.2,1.1,0],material);
      this.box(marker,[.65,.22,.2],[side * 3.2,2.15,0],material);
    }
    this.compactMeshes(marker); this.rangeWaypoints.set(index,marker); this.rangeWorld.add(marker);
    return marker;
  }

  private createRangeTarget(id:string,x:number,z:number,radius:number) {
    const target = new THREE.Group(); target.position.set(x,terrainAt(x,z).height,z);
    const orange = this.material(0xe7783e,.9,.12), steel = this.material(0x5c625a,.85,.25), pale = this.material(0xe2d9ba);
    this.box(target,[radius * 2,2.7,.17],[0,2.4,0],orange);
    this.box(target,[radius * 1.76,2.44,.19],[0,2.4,.015],steel);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(radius * .57,24),pale); disc.position.set(0,2.4,.12); target.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * .31,radius * .39,24),orange); ring.position.set(0,2.4,.13); target.add(ring);
    for (const dx of [-radius * .5,radius * .5]) this.box(target,[.09,1.12,.18],[dx,.53,-.02],steel);
    this.box(target,[radius * 1.7,.09,.80],[0,.04,0],steel);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(radius * 1.5,.28),new THREE.MeshBasicMaterial({map:this.textTexture([id.toUpperCase()],'#fff5df','#b75c2c',512,128)})); label.position.set(0,3.55,.14); target.add(label);
    this.compactMeshes(target); this.rangeTargets.set(id,target); this.rangeWorld.add(target);
    return target;
  }

  private createCabin() {
    const wall = this.material(0x555e48,.94,.15), dark = this.material(0x262e25), tan = this.material(0xaaa185,.87,.16), steel = this.material(0x5c6653,.62,.35);
    wall.map = this.surfaceTexture('armor');
    // Enclosed armored crew station, with a separately exposed commander hatch view.
    // This is an ergonomic impression, not an engineering reconstruction of a variant.
    const deck = new THREE.Shape();
    deck.moveTo(-3.2,-2.8); deck.lineTo(3.2,-2.8); deck.lineTo(3.2,4.1); deck.lineTo(-3.2,4.1); deck.closePath();
    const aperture = new THREE.Path(); aperture.absarc(-.65,1.85,1.43,0,Math.PI * 2,true); deck.holes.push(aperture);
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(deck,{depth:.16,bevelEnabled:false}),wall);
    roof.rotation.x = Math.PI / 2; roof.position.y = 2.35; roof.castShadow = true; roof.receiveShadow = true; this.cabin.add(roof);
    // The shape's positive drawing Y maps to positive world Z after rotation.
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.43,.105,10,80),steel);
    rim.rotation.x = Math.PI / 2; rim.position.set(-.65,2.35,1.85); rim.castShadow = true; this.cabin.add(rim);
    const seal = new THREE.Mesh(new THREE.TorusGeometry(1.35,.042,6,80),dark);
    seal.rotation.x = Math.PI / 2; seal.position.copy(rim.position); seal.position.y += .055; this.cabin.add(seal);
    // Raised hatch lid and its hinges sit off the commander's left shoulder.
    const lid = new THREE.Group(); lid.position.set(-2.04,2.45,1.85); lid.rotation.z = -.16; this.cabin.add(lid);
    this.cylinder(lid,1.22,.13,[0,1.02,0],wall,[0,0,Math.PI / 2],48);
    this.cylinder(lid,1.06,.025,[.079,1.02,0],dark,[0,0,Math.PI / 2],48);
    this.box(lid,[.10,.12,.56],[.12,1.1,0],steel);
    for (const z of [1.12,2.58]) this.box(this.cabin,[.28,.19,.22],[-2.02,2.42,z],steel);
    for (let i = 0; i < 16; i++) {
      const angle = i / 16 * Math.PI * 2;
      this.cylinder(this.cabin,.026,.028,[-.65 + Math.cos(angle) * 1.52,2.365,1.85 + Math.sin(angle) * 1.52],steel,undefined,6);
    }
    const enclosure = createCabinShell(wall,dark);
    this.cabin.add(enclosure.shell); this.cabinCeiling = enclosure.ceiling;
    for (const x of [-1.9,-.55,.85]) this.box(this.cabin,[.075,1.8,.075],[x,1.2,-1.14],steel);
    // Nearby restraint, seat and grab rails anchor the enclosed crew station.
    this.box(this.cabin,[.94,1.18,.25],[-1.36,.92,2.82],dark,[.1,0,0]);
    this.box(this.cabin,[.95,.20,.85],[-1.36,.38,2.43],dark);
    this.box(this.cabin,[.085,1.03,.045],[-1.62,1.0,2.65],this.material(0x868773),[0,0,.14]);
    for (const x of [-1.72,.45]) {
      this.cylinder(this.cabin,.032,.43,[x,2.56,.56],steel,undefined,10);
      this.cylinder(this.cabin,.032,.31,[x,2.76,.72],steel,[Math.PI / 2,0,0],10);
    }
    // Compact MFoCS-family-style terminal on a rigid hatch-adjacent bracket.
    const terminal = new THREE.Group(); terminal.position.set(.42,1.68,1.22); terminal.rotation.set(-.12,-.16,0); terminal.scale.setScalar(.66); this.cabin.add(terminal);
    this.box(this.cabin,[.16,.65,.18],[.42,1.72,1.12],steel);
    this.box(this.cabin,[.55,.10,.22],[.45,1.99,1.12],steel);
    this.box(terminal,[1.93,1.35,.24],[0,0,0],tan);
    this.box(terminal,[1.63,1.02,.035],[0,.035,.138],dark);
    const material = new THREE.MeshBasicMaterial({map:this.instrumentScreen.texture});
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.49,.89),material); screen.position.set(0,.035,.16); terminal.add(screen);
    const black = this.material(0x353c31);
    for (const x of [-1.07,1.07]) {
      this.box(terminal,[.12,1.0,.14],[x,0,.04],black);
      for (const y of [-.38,.38]) this.box(terminal,[.21,.1,.17],[x * .94,y,.04],tan);
    }
    for (const x of [-.85,.85]) for (const y of [-.56,.56]) this.cylinder(terminal,.035,.015,[x,y,.14],steel,[Math.PI/2,0,0],8);
    for (let i = 0; i < 6; i++) this.box(terminal,[.14,.055,.03],[-.56 + i * .22,-.57,.145],black);
    const leds = new THREE.MeshStandardMaterial({color:0x9dbf87,emissive:0x699b70,emissiveIntensity:.7,roughness:.4});
    this.cylinder(terminal,.027,.025,[.79,-.56,.148],leds,[Math.PI/2,0,0],10);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(.89,.1),new THREE.MeshBasicMaterial({map:this.textTexture(['CREW TERMINAL'], '#c9c5b5','#4b5144',1024,128)})); label.position.set(0,.58,.14); terminal.add(label);
    // All conduit is enclosed; service is represented only in the abstract later view.
    this.box(this.cabin,[.08,.65,.10],[.44,1.64,1.12],dark);
    const cabinLight = new THREE.PointLight(0xe8debd,6,5,2); cabinLight.position.set(-.6,2.0,2.4); this.cabin.add(cabinLight);
    return {screen,material,leds,terminal};
  }

  private createExercise() {
    const floor = this.material(0x182622,.9,.25);
    this.cylinder(this.exercise,4.8,.15,[-.5,-.19,0],floor,undefined,80);
    const model = this.vehicle.clone(true); model.scale.setScalar(.7); model.position.set(-.5,0,0); this.exercise.add(model);
    const ringMaterial = new THREE.MeshStandardMaterial({color:0xb8ac7c,emissive:0x958960,emissiveIntensity:.3,roughness:.55});
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.7,.025,8,96),ringMaterial); ring.rotation.x = -Math.PI/2; ring.position.set(-.5,-.07,0); this.exercise.add(ring);
    for (let i = 0; i < 40; i++) {
      const angle = i / 40 * Math.PI * 2;
      this.box(this.exercise,[.025,.012,i % 5 === 0 ? .21 : .10],[-.5 + Math.sin(angle) * 4.15,-.09,Math.cos(angle) * 4.15],this.material(0x617669),[0,angle,0]);
    }
    const grid = new THREE.GridHelper(34,34,0x2d4c40,0x21392f); grid.position.y = -.29; this.exercise.add(grid);
    return ring;
  }

  setViewMode(view: CrewView) { this.viewMode = view; }

  /** Range Inside only. Guided exercise always retains its normal instrument display. */
  setGunnerDisplay(mode: GunnerDisplayMode, focused: boolean): void {
    this.gunnerDisplayMode = mode;
    this.cabinDisplayFocused = focused;
    this.gunnerDisplay.setMode(mode);
  }

  /** Independent GPU ownership; the inspection never changes driving geometry or pose. */
  createInspectionModel(): THREE.Group { return cloneInspectionModel(closedRampClone(this.vehicle)); }

  update(sim: Simulation, delta: number, reducedMotion: boolean, faults?: readonly VehicleFault[]) {
    this.screenMaterial.map = this.instrumentScreen.texture;
    this.screen.scale.y = 1;
    this.cabinTerminal.rotation.set(-.12,-.16,0);
    this.camera.up.set(0,1,0);
    if (this.rangeActive) {
      this.rangeActive = false;
      this.gunnerDisplay.reset();
      this.fireEffects.reset(); this.damageEffects.reset(); this.aftermathClock.reset(); this.lastRangeTime = -1;
      this.rangeWorld.visible = false; this.guidedTerrain.visible = true;
      this.vehicle.position.set(0,0,0); this.vehicle.rotation.set(0,0,0);
      this.rearRamp.pivot.rotation.set(0,0,0); this.rearRamp.doorway.visible = false; this.dismountSquad.reset();
      this.cabin.position.set(0,0,0); this.cabin.rotation.set(0,0,0);
      this.cabinTerminal.position.set(.42,1.68,1.22); this.cabinTerminal.scale.setScalar(.66);
      this.leds.emissive.set(0x699b70);
      this.originalStation.visible = true; this.wheels.forEach(wheel => wheel.rotation.set(0,0,0));
      this.sun.position.set(-8,12,7); this.sun.target.position.set(0,0,0);
      this.firstFrame = true; this.cameraKey = '';
    }
    const pose = this.motion.update({ phase: sim.phase, view: this.viewMode, delta, paused: sim.paused, reducedMotion, moving: sim.moving, speed: sim.speed });
    const exterior = pose.phase === 'title' || pose.phase === 'exterior';
    const exercise = ['secured','service','debrief'].includes(pose.phase);
    // Keep the old stage through fade-out, then cut beneath the dark frame. No hull fly-through.
    const seated = !exterior && !exercise && pose.view === 'inside';
    this.exterior.visible = exterior || (!exercise && !seated); this.vehicle.visible = exterior;
    this.guidedTerrain.visible = true; this.cabinCeiling.visible = seated;
    this.cabin.visible = !exterior && !exercise; this.exercise.visible = exercise;
    this.cabinTerminal.position.set(.42,seated ? 1.68 : 2.12,1.22);
    this.cabinTerminal.scale.setScalar(seated ? .66 : .72);
    const mobile = isPhoneDrivingViewport(this.width, this.height);
    this.camera.fov = mobile ? 55 : 48;
    this.camera.clearViewOffset();
    if (exterior) {
      this.scene.background = new THREE.Color(0xc3c6ba);
      this.scene.fog = new THREE.FogExp2(0xc3c6ba,.006);
      const approach = pose.phase === 'exterior' ? .9 : 0;
      this.target.set((mobile ? -11.2 : -10.4) + approach, mobile ? 5.6 : 4.9, (mobile ? 13.7 : 12.3) - approach);
      // Desktop hero copy occupies the left half; frame the vehicle to its right.
      this.aim.set(mobile ? 0 : -4.1,mobile ? -.2 : 1.05,0);
      if (mobile) {
        const portrait = this.width < this.height;
        // Match the unobstructed phone stage: above the briefing in portrait,
        // and to its left in landscape. Keep the antenna and every wheel visible.
        const frame = fitGuidedModel(this.guidedVehicleBounds, new THREE.Vector3(-10, 5, 12), this.camera.fov, this.camera.aspect,
          portrait ? [.82, .50] : [.57, .65]);
        this.target.copy(frame.position); this.aim.copy(frame.center);
        this.camera.setViewOffset(this.width, this.height, portrait ? 0 : this.width * .175, portrait ? this.height * .1125 : -this.height * .02, this.width, this.height);
      }
      this.sun.intensity = 3.3;
    } else if (exercise) {
      this.scene.background = new THREE.Color(0x0c1715);
      this.scene.fog = new THREE.FogExp2(0x0c1715,.035);
      const service = pose.phase === 'service', debrief = pose.phase === 'debrief';
      this.target.set((mobile ? -9 : -7.3) + (service ? 1.1 : debrief ? -1.1 : 0), (mobile ? 6.5 : 5.1) + (debrief ? .6 : 0), (mobile ? 10.8 : 8.8) + (service ? -.7 : debrief ? 1.1 : 0));
      this.aim.set(mobile ? 0 : 1.8,mobile ? -1.3 : .25,service ? -.3 : 0);
      this.sun.intensity = 2.1;
    } else {
      this.scene.background = new THREE.Color(seated ? 0x262e25 : 0xc3c6ba);
      this.scene.fog = seated ? null : new THREE.FogExp2(0xc3c6ba,.0048);
      const inspection = ['feed','manifold','turbine'].includes(pose.phase);
      const insight = pose.phase === 'insight';
      const focus = inspection ? .1 : insight ? .2 : 0;
      if (pose.view === 'inside') {
        // Seated below the hatch rim: monitor, armored walls, restraint and roof stay in view.
        this.target.set(-.88 + focus,1.64 + focus * .2,3.32 - focus);
        this.aim.set(mobile ? .4 : .64,mobile ? 1.50 : 1.68,1.12);
      } else {
        this.target.set((mobile ? -.78 : -.65) + focus,mobile ? 3.28 : 3.08,(mobile ? 4.35 : 3.85) - focus);
        this.aim.set(mobile ? -.85 : -1.25,mobile ? 2.75 : 2.58,-15 + focus * 15);
      }
      this.sun.intensity = 3.0;
    }
    const changed = this.cameraKey !== pose.key;
    if (changed) { this.fromPosition.copy(this.basePosition); this.fromAim.copy(this.baseAim); this.cameraKey = pose.key; }
    if (this.firstFrame || reducedMotion || pose.cut) {
      this.basePosition.copy(this.target); this.baseAim.copy(this.aim);
    } else if (!sim.paused && delta > 0) {
      this.basePosition.lerpVectors(this.fromPosition,this.target,pose.progress);
      this.baseAim.lerpVectors(this.fromAim,this.aim,pose.progress);
    }
    // Offsets are recomputed from the immutable base each frame, so vibration cannot drift.
    if (!sim.paused || this.firstFrame) {
      this.camera.position.copy(this.basePosition);
      this.camera.lookAt(this.baseAim);
      this.camera.translateX(pose.offset[0]); this.camera.translateY(pose.offset[1]); this.camera.translateZ(pose.offset[2]);
      this.camera.rotateX(pose.pitch); this.camera.rotateZ(pose.roll);
      this.curtain.style.opacity = String(pose.fade);
    }
    const elapsed = Math.max(0,sim.time - this.lastTime);
    if (sim.moving && !sim.paused) {
      for (const wheel of this.wheels) wheel.rotation.x -= elapsed * sim.speed * 3.3;
    }
    this.movingGround.position.z = reducedMotion ? 0 : (sim.drivingTime * 2.2) % 8;
    this.contactShadow.visible = exterior;
    placeVehicleContactShadow(this.contactShadow,0,0,0,() => ({height:0,kind:'road'}),-.008);
    this.vehicle.position.y = !reducedMotion && sim.moving ? Math.sin(sim.time * 7) * .014 * sim.speed : 0;
    this.dust.visible = exterior && sim.moving && sim.speed > .1 && !reducedMotion;
    this.dust.position.z = -(sim.drivingTime * .8) % 1.5;
    // Physical equipment is dark after shutdown. The later exercise view is separate from the cabin.
    this.instrumentScreen.update({ mode: 'guided', time: sim.time, engine: sim.engine, speed: sim.speed * 18,
      rpm: sim.engine ? 720 + sim.speed * 1500 : 0, load: sim.latest.load, integrity: 100,
      status: sim.alert ? 'CHARGING TREND ALERT  /  REVIEW EVIDENCE' : sim.secured ? 'ENGINE OFF  /  VEHICLE SECURED' : 'CREW SYSTEMS  /  MONITORING',
      voltage: sim.latest.voltage, voltageHistory: sim.observations.map(observation => observation.voltage), alert: sim.alert, faults });
    this.screen.visible = true;
    this.screenMaterial.color.set(0xffffff);
    this.leds.emissiveIntensity = sim.engine ? .7 : 0;
    this.leds.color.set(sim.engine ? 0x9dbf87 : 0x32392e);
    const ringMaterial = this.serviceRing.material as THREE.MeshStandardMaterial;
    ringMaterial.color.set(sim.isolated ? 0x86bb9a : 0xb8ac7c);
    ringMaterial.emissive.set(sim.isolated ? 0x406c51 : 0x958960);
    this.lastTime = sim.time; this.firstFrame = false;
    this.renderer.render(this.scene,this.camera);
  }

  updateRange(range: DrivingRange, delta: number, reducedMotion: boolean, view: RangeView) {
    this.camera.clearViewOffset();
    const entering = !this.rangeActive;
    if (entering || range.time < this.lastRangeTime) this.gunnerDisplay.reset();
    const restarted = entering || range.time < this.lastRangeTime || range.time === 0;
    if (restarted) this.damageEffects.reset();
    const damageTime = this.aftermathClock.update(range.time,delta,range.missionEnded,range.paused,restarted);
    this.lastRangeTime = range.time;
    this.rangeActive = true;
    this.rangeWorld.visible = view !== 'inside'; this.guidedTerrain.visible = false; this.exterior.visible = view !== 'inside';
    const outside = view !== 'inside' && view !== 'hatch';
    this.vehicle.visible = outside; this.cabin.visible = !outside; this.exercise.visible = false;
    this.cabinCeiling.visible = view === 'inside';
    this.originalStation.visible = false;
    this.curtain.style.opacity = '0';
    this.scene.background = new THREE.Color(view === 'inside' ? 0x262e25 : 0xc3c6ba); this.scene.fog = view === 'inside' ? null : new THREE.FogExp2(0xc3c6ba,.0037);
    const terrain = range.terrain, speed = Math.abs(range.speed), mobile = isPhoneDrivingViewport(this.width,this.height);
    // Hatch keeps the exposed gun/environment view; Inside places the observer below the roof.
    if (view === 'inside') {
      this.cabinTerminal.position.fromArray(RANGE_TERMINAL.position);
      this.cabinTerminal.rotation.set(...RANGE_TERMINAL.rotation);
      this.cabinTerminal.scale.setScalar(RANGE_TERMINAL.scale);
    } else {
      this.cabinTerminal.position.set(-1.05,1.91,-.32); this.cabinTerminal.scale.setScalar(.36);
      this.cabinTerminal.rotation.set(-.12,-.16,0);
    }
    const engine = range.audioState.engine;
    this.instrumentScreen.update({ mode: 'range', time: range.time, engine, speed: range.speedMph,
      rpm: range.powertrain.rpm, load: range.powertrain.load, integrity: range.mission.integrity,
      status: range.health.phase === 'nominal' ? 'CREW SYSTEMS  /  MONITORING' : range.health.message,
      faults: range.health.faults });
    const focused = view === 'inside' && this.cabinDisplayFocused;
    const shaking = !reducedMotion && !focused && speed > .1;
    const amplitude = shaking ? Math.min(1,speed / 10) * terrain.roughness : 0;
    const bob = Math.sin(range.time * 12.3) * amplitude * .045;
    const recoil = firingRecoil(view,reducedMotion,range.time,range.lastShotTime);
    this.contactShadow.visible = outside;
    placeVehicleContactShadow(this.contactShadow,range.position.x,range.position.z,range.heading,terrainAt);
    this.vehicle.position.set(range.position.x,terrain.height + bob,range.position.z);
    this.vehicle.rotation.set(Math.sin(range.time * 7.2) * amplitude * .012,range.heading + Math.PI,Math.sin(range.time * 8.7) * amplitude * .016);
    updateRearRamp(this.rearRamp.pivot,this.rearRamp.doorway,range.dismount,reducedMotion);
    this.dismountSquad.update(range.dismount,this.debrisGround,reducedMotion);
    this.cabin.position.set(range.position.x,terrain.height + bob,range.position.z); this.cabin.rotation.set(0,range.heading,0);
    const cos = Math.cos(range.heading), sin = Math.sin(range.heading);
    // Shot origins and the illustrated muzzle share the same transform in every camera.
    this.rangeWeapon.position.set(range.position.x + cos * .48,terrain.height,range.position.z - sin * .48);
    this.rangeWeapon.rotation.set(0,range.heading + range.aimYaw,0);
    const dt = !range.paused ? Math.min(Math.max(delta,0),.1) : 0;
    if (entering || range.time === 0) { this.rangeWheelRoll = 0; this.rangeSteer = 0; this.fireEffects.reset(); }
    this.rangeWheelRoll += range.speed * dt / .605;
    // Render the same speed-limited wheel angle used by the driving model.
    if (dt > 0) this.rangeSteer = range.steeringAngle;
    for (const wheel of this.wheels) {
      wheel.rotation.set(this.rangeWheelRoll,wheel.position.z > 0 ? this.rangeSteer : 0,0,'YXZ');
    }
    const flashAge = shotAge(damageTime,range.lastShotTime);
    this.rangeFlash.visible = this.rangeFlashCore.visible = !reducedMotion && flashAge >= 0 && flashAge < .055;
    if (this.rangeFlash.visible) {
      this.rangeFlash.scale.setScalar(.8 + Math.sin(flashAge * 130) * .2);
      this.rangeFlash.rotation.y = flashAge * 85;
    }
    this.fireEffects.update(range.shots,damageTime,reducedMotion);
    this.targetDebris.update(range.targets,damageTime,this.debrisGround,reducedMotion);
    Object.assign(this.brokenVehicle,{broken:range.health.phase === 'broken',x:range.position.x,y:terrain.height,z:range.position.z,heading:range.heading});
    this.damageEffects.update(this.brokenVehicle,range.mission.departureCrossed ? range.mission.contacts : [],damageTime,this.debrisGround,reducedMotion);
    this.rangeHorizon.position.set(range.position.x,0,range.position.z);
    this.dust.visible = outside && speed > 2 && !reducedMotion;
    this.dust.position.set(range.position.x + sin * 2,terrain.height + .15,range.position.z + cos * 2); this.dust.rotation.y = range.heading + Math.PI;
    this.screen.visible = true; this.screenMaterial.color.set(0xffffff); this.leds.emissiveIntensity = engine ? .7 : 0; this.leds.color.set(engine ? 0xff9957 : 0x32392e); this.leds.emissive.set(0xb55727);
    this.sun.intensity = 3.1; this.sun.position.set(range.position.x - 8,terrain.height + 12,range.position.z + 7);
    this.sun.target.position.set(range.position.x,terrain.height + 1,range.position.z);
    // Restore other views after the wider Hatch lens, including rotations while seated.
    const nextFov = view === 'inside' ? cabinDisplayFov(this.width,this.height)
      : view === 'hatch' ? hatchCameraFrame(this.width,this.height).fov : mobile ? 55 : 48;
    if (this.camera.fov !== nextFov) { this.camera.fov = nextFov; this.camera.updateProjectionMatrix(); }
    // Every view observes this same vehicle/weapon state. Only Top is fixed to world north.
    this.camera.up.set(0,1,0);
    if (view === 'top') {
      const elevation = Math.max(27,(mobile ? 10.5 : 17) / (Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect));
      this.target.set(range.position.x,terrain.height + elevation,range.position.z);
      this.aim.set(range.position.x,terrain.height,range.position.z);
      this.camera.up.set(0,0,-1);
    } else if (view === 'chase') {
      if (range.dismount.phase !== 'stowed') {
        // Centerline rear observer sees the hinge and all nine exits. Portrait
        // framing fits the side fan without soldiers passing through the camera.
        const distance = Math.max(12.6,6.0 / (Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect));
        this.target.set(0,Math.max(6.8,distance * .52),distance);
        this.aim.set(0,.8,1.0);
      } else {
        this.target.set(0,mobile ? 6.1 : 5.2,mobile ? 13.0 : 11.4);
        this.aim.set(0,1.6,-4.2);
      }
    } else if (view === 'hatch') {
      const frame = hatchCameraFrame(this.width,this.height);
      this.target.fromArray(frame.eye);
      this.aim.fromArray(frame.lookAt);
    } else if (view === 'inside') {
      this.cabinTerminal.updateMatrix();
      const frame = frameCabinDisplay(this.cabinTerminalBounds,this.cabinTerminal.matrix,
        this.width,this.height,this.camera.fov,focused);
      this.target.copy(frame.position); this.aim.copy(frame.center);
      // Cabin and camera share the heading; the focused lens looks squarely at the glass.
      this.camera.up.set(frame.up.x * cos + frame.up.z * sin,frame.up.y,-frame.up.x * sin + frame.up.z * cos);
      this.camera.setViewOffset(this.width,this.height,frame.offsetX,frame.offsetY,this.width,this.height);
    }
    const rotateToWorld = (point:THREE.Vector3) => {
      const x = point.x, z = point.z;
      point.set(range.position.x + x * cos + z * sin,point.y + terrain.height,range.position.z - x * sin + z * cos);
    };
    if (view !== 'top') { rotateToWorld(this.target); rotateToWorld(this.aim); }
    this.camera.position.copy(this.target); this.camera.lookAt(this.aim);
    if (!reducedMotion && !focused && view !== 'top') {
      this.camera.translateX(Math.sin(range.time * 15.3) * amplitude * .018);
      this.camera.translateY(bob * (outside ? .4 : 1.2));
      this.camera.rotateX(Math.sin(range.time * 10.2) * amplitude * .003);
      this.camera.rotateZ(Math.sin(range.time * 8.6) * amplitude * .003);
    }
    // Focus steadies road vibration, but a shot still kicks the cabin/physical display.
    // The base pose above is rebuilt each frame, so this never accumulates camera drift.
    if (recoil !== 0) this.camera.rotateX(recoil);
    const angle = range.heading + range.aimYaw, dx = -Math.sin(angle), dz = -Math.cos(angle);
    // A near witness point keeps the gun's actual world-space ray visible in the overhead view.
    const aimDistance = view === 'top' ? 10 : 41;
    this.rangeAimMarker.position.set(range.position.x + cos * .48 + dx * aimDistance,terrain.height + 3,range.position.z - sin * .48 + dz * aimDistance);
    this.rangeAimMarker.lookAt(this.camera.position);
    const lockedTarget = range.aimLock ? range.targets.find(target => target.id === range.aimLock!.targetId && target.destroyedAt === null) : undefined;
    this.rangeLockMarker.visible = !!lockedTarget && !range.missionEnded && view !== 'inside';
    if (lockedTarget) {
      const contact = range.mission.contacts.find(item => item.id === lockedTarget.id);
      const targetHeight = contact ? contact.kind === 'troop' ? 1.25 : 2.2 : 2.4;
      this.rangeLockMarker.position.set(lockedTarget.x,terrainAt(lockedTarget.x,lockedTarget.z).height + targetHeight,lockedTarget.z);
      const markerSize = Math.max(lockedTarget.radius + .5,Math.min(3,this.rangeLockMarker.position.distanceTo(this.camera.position) * .015));
      this.rangeLockMarker.scale.setScalar(markerSize);
      this.rangeLockMarker.lookAt(this.camera.position);
    }
    for (const target of range.targets) {
      if (target.kind === 'enemy') continue;
      const visual = this.rangeTargets.get(target.id) ?? this.createRangeTarget(target.id,target.x,target.z,target.radius);
      visual.visible = destructionAge(range.time,target.destroyedAt) < 0;
      visual.rotation.x = 0;
    }
    const mission = range.mission;
    const destination = range.navigationTarget;
    this.explorationMarker.visible = !!destination && !range.missionEnded && view !== 'inside';
    if (destination && (destination.x !== this.lastNavigationX || destination.z !== this.lastNavigationZ)) {
      const height = terrainAt(destination.x,destination.z).height;
      this.explorationMarker.position.set(destination.x,height,destination.z);
      // Map-selected off-road points follow the same ground, using existing vertices.
      const positions = this.explorationGroundRing.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) positions.setY(i,terrainAt(destination.x + positions.getX(i),destination.z + positions.getZ(i)).height - height + .12);
      positions.needsUpdate = true; this.explorationGroundRing.geometry.computeBoundingSphere();
      this.lastNavigationX = destination.x; this.lastNavigationZ = destination.z;
    }
    const objectiveHeight = terrainAt(mission.objective.x,mission.objective.z).height;
    this.rangeObjective.position.set(mission.objective.x,objectiveHeight,mission.objective.z);
    this.rangeObjective.visible = !range.missionEnded;
    for (const child of this.rangeObjective.children) if (child.name === 'objective-ground-ring') child.scale.set(mission.objective.radius / 8,mission.objective.radius / 8,1);
    const label = this.rangeObjective.children.find(child => child instanceof THREE.Mesh && child.geometry instanceof THREE.PlaneGeometry);
    label?.lookAt(this.camera.position);
    for (let index = 0; index < mission.waypoints.length; index++) {
      const waypoint = mission.waypoints[index];
      const visual = this.rangeWaypoints.get(index) ?? this.createRangeWaypoint(index,waypoint.x,waypoint.z);
      visual.visible = index >= mission.currentWaypoint && !range.missionEnded;
      for (const child of visual.children) if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
        child.material.color.set(index === mission.currentWaypoint ? 0xffc28b : 0xb6baa1);
      }
    }
    for (const contact of mission.contacts) {
      const visual = this.rangeContacts.get(contact.id) ?? this.createRangeContact(contact.id,contact.x,contact.z,contact.radius,contact.kind);
      visual.position.set(contact.x,terrainAt(contact.x,contact.z).height,contact.z);
      let hitPulse = 0;
      for (const shot of range.shots) if (shot.hitTargetId === contact.id) {
        const age = shotAge(damageTime,shot.createdAt);
        if (age >= 0 && age < .4) hitPulse = Math.max(hitPulse,1 - age / .4);
      }
      const defeated = contact.health <= 0;
      visual.visible = mission.departureCrossed;
      visual.rotation.z = reducedMotion || defeated ? 0 : Math.sin(range.time * 34) * hitPulse * .045;
      const body = visual.getObjectByName('contact-body');
      if (body) {
        const fallAge = destructionAge(damageTime,contact.neutralizedAt), collapse = defeated ? reducedMotion ? 1 : Math.min(1,Math.max(0,fallAge) / .7) : 0;
        body.rotation.x = contact.kind === 'troop' ? collapse * 1.45 : 0;
        body.position.y = contact.kind === 'troop' ? 0 : -collapse * .22;
        const weapon = body.getObjectByName('contact-weapon'); if (weapon) weapon.rotation.x = .18 + collapse * .9;
        if (contact.kind === 'vehicle') setGunTruckDamage(body,defeated,hitPulse);
        else body.traverse(child => { if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.color.set(defeated ? 0x65675e : child.material.userData.contactBaseColor as number);
          child.material.emissive.set(0xe05b3a);
          child.material.emissiveIntensity = Math.max(hitPulse * .7,!defeated && damageTime - contact.lastAttackTime >= 0 && damageTime - contact.lastAttackTime < .12 ? .45 : 0);
        }});
      }
      for (const child of visual.children) if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
        child.material.color.set(defeated ? 0x7e8376 : 0xff4e3c);
        if (child.name === 'contact-marker') child.scale.setScalar(defeated ? .5 : contact.detected ? 1.1 : 1);
      }
      const attackAge = damageTime - contact.lastAttackTime;
      let tracer = this.rangeReturnTracers.get(contact.id);
      if (!tracer) {
        tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:0xff5848,transparent:true,opacity:.75}));
        tracer.frustumCulled = false; this.rangeReturnTracers.set(contact.id,tracer); this.rangeWorld.add(tracer);
      }
      tracer.visible = mission.departureCrossed && !defeated && attackAge >= 0 && attackAge < .16;
      if (tracer.visible) {
        const points = tracer.geometry.getAttribute('position');
        points.setXYZ(0,contact.x,visual.position.y + (contact.kind === 'troop' ? 1.15 : 2.4),contact.z);
        points.setXYZ(1,range.position.x,terrain.height + 1.6,range.position.z); points.needsUpdate = true;
        (tracer.material as THREE.LineBasicMaterial).opacity = (1 - attackAge / .16) * .8;
      }
    }
    this.firstFrame = false;
    const opticActive = view === 'inside' && this.gunnerDisplayMode !== 'mfocs';
    if (opticActive) {
      // The actual world is visible to this camera while the closed cabin remains opaque
      // to its seated observer. Never capture the terminal that consumes the feed.
      const hidden: THREE.Object3D[] = [this.cabin,this.vehicle,this.contactShadow,this.rangeWeapon,this.rangeAimMarker,this.rangeLockMarker,this.rangeObjective,this.explorationMarker,this.dust,...this.rangeWaypoints.values()];
      for (const contact of this.rangeContacts.values()) for (const child of contact.children) if (child.name !== 'contact-body') hidden.push(child);
      const hot = [...this.rangeContacts.values()].map(contact => contact.getObjectByName('contact-body')).filter((body): body is THREE.Object3D => !!body);
      const lockedContact = lockedTarget ? range.mission.contacts.find(contact => contact.id === lockedTarget.id) : undefined;
      const aimPoint = lockedTarget ? {x:lockedTarget.x,z:lockedTarget.z,
        y:terrainAt(lockedTarget.x,lockedTarget.z).height + (lockedContact ? lockedContact.kind === 'troop' ? 1.25 : 2.2 : 2.4)} : undefined;
      this.gunnerDisplay.capture(this.renderer,this.scene,{time:range.time,paused:range.paused,engine,phone:mobile,
        lastShotTime:range.lastShotTime,reducedMotion,
        x:range.position.x,z:range.position.z,height:terrain.height,heading:range.heading,aimYaw:range.aimYaw,locked:!!lockedTarget && !range.missionEnded,aimPoint},
        [this.rangeWorld,this.exterior],hidden,hot);
    }
    this.screenMaterial.map = opticActive ? this.gunnerDisplay.texture : this.instrumentScreen.texture;
    // Phone feeds use a slightly different bounded render size; preserve the actual
    // selected texture's aspect on the physical glass in both framing modes.
    const image = this.screenMaterial.map.image as { width: number; height: number };
    this.screen.scale.y = (1.49 / (image.width / image.height)) / .89;
    // Focus always remains a view of the physical terminal, including MFoCS.
    this.renderer.render(this.scene,this.camera);
  }

  resize() {
    this.width = Math.max(1,this.container.clientWidth);
    this.height = Math.max(1,this.container.clientHeight);
    const phone = isPhoneDrivingViewport(this.width,this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, phone ? 1.25 : 1.8));
    // Avoid a second geometry pass for every wheel/tread on phone GPUs.
    this.renderer.shadowMap.enabled = !phone;
    this.renderer.setSize(this.width,this.height,false);
    this.camera.aspect = this.width / this.height;
    this.camera.fov = phone ? 55 : 48;
    this.camera.updateProjectionMatrix();
    this.firstFrame = true;
  }

  dispose() {
    this.dismountSquad.dispose();
    this.damageEffects.dispose(); this.aftermathClock.reset();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
    });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); this.textures.forEach(texture => texture.dispose());
    this.instrumentScreen.dispose();
    this.gunnerDisplay.dispose();
    this.renderer.dispose(); this.renderer.domElement.remove(); this.curtain.remove();
  }
}
