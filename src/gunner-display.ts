import * as THREE from 'three';
import type { GunnerDisplayMode } from './mission-contract.ts';
import { shotAge } from './fire-effects.ts';

export type GunnerFrame = {
  time: number; paused: boolean; engine: boolean; phone: boolean;
  lastShotTime: number; reducedMotion: boolean;
  x: number; z: number; height: number; heading: number; aimYaw: number; locked: boolean;
  aimPoint?: {x:number; y:number; z:number};
};
type Visibility = { object: THREE.Object3D; visible: boolean };

/** Match Three's installed half-float color-buffer extension checks; RGBA8 is the safe fallback. */
export function gunnerRenderTargetType(renderer: Pick<THREE.WebGLRenderer,'extensions'>): THREE.TextureDataType {
  return renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float')
    ? THREE.HalfFloatType : THREE.UnsignedByteType;
}

/** The optic shares the game's muzzle origin and yaw, including manual and assisted aim. */
export function alignGunnerCamera(camera: THREE.PerspectiveCamera, frame: GunnerFrame): void {
  const angle = frame.heading + frame.aimYaw, dx = -Math.sin(angle), dz = -Math.cos(angle);
  camera.position.set(frame.x + Math.cos(frame.heading) * .48 + dx, frame.height + 3,
    frame.z - Math.sin(frame.heading) * .48 + dz);
  camera.up.set(0,1,0);
  const distance = frame.aimPoint ? Math.max(.1,Math.hypot(frame.aimPoint.x - camera.position.x,frame.aimPoint.z - camera.position.z)) : 100;
  camera.lookAt(camera.position.x + dx * distance,frame.aimPoint?.y ?? camera.position.y,camera.position.z + dz * distance);
  // Rebuild the optical pose from the weapon ray every frame, then add only a
  // tiny deterministic sight vibration. This never changes aim or the cabin.
  const age = shotAge(frame.time,frame.lastShotTime);
  if (!frame.reducedMotion && age >= 0 && age < .12) {
    const envelope = (1 - age / .12) ** 2;
    camera.rotateX(.0018 * envelope * Math.cos(age * 110));
    camera.rotateY(.0011 * envelope * Math.sin(age * 140));
    camera.rotateZ(.0008 * envelope * Math.sin(age * 90));
  }
  camera.updateMatrixWorld();
}

/** A bounded same-world camera. No additional WebGL context or independently simulated world. */
export class GunnerDisplay {
  readonly camera = new THREE.PerspectiveCamera(38,640 / 384,.15,350);
  private readonly worldTarget = new THREE.WebGLRenderTarget(640,384,{depthBuffer:true,type:THREE.UnsignedByteType});
  private readonly displayTarget = new THREE.WebGLRenderTarget(640,384,{depthBuffer:false,type:THREE.UnsignedByteType});
  private targetTypeConfigured = false;
  private readonly presentation = new THREE.Scene();
  private readonly flatCamera = new THREE.OrthographicCamera(-1,1,1,-1,0,2);
  private readonly geometry = new THREE.PlaneGeometry(2,2);
  private readonly imageMaterial: THREE.MeshBasicMaterial;
  private readonly overlayMaterial: THREE.MeshBasicMaterial;
  private readonly overlayCanvas = typeof document === 'undefined' ? null : document.createElement('canvas');
  private readonly overlay: THREE.Texture;
  private readonly cool = Array.from({length:8},(_,i) => new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(.11 + i * .035,.12 + i * .035,.13 + i * .035),side:THREE.DoubleSide}));
  private readonly hot = new THREE.MeshBasicMaterial({color:0xf8f8f8,side:THREE.DoubleSide});
  // Only alpha-tested/transparent sources need their own thermal variant.
  // Reuse these across captures and prune vanished sources, bounding GPU ownership
  // to currently present materials rather than allocating materials per frame.
  private readonly alphaMaterials = new Map<THREE.Material,Map<boolean,THREE.MeshBasicMaterial>>();
  private mode: GunnerDisplayMode = 'day';
  private dirty = true;
  private lastBucket = -1;
  private lastTime = -1;
  private lastEngine: boolean | undefined;
  private lastPhone: boolean | undefined;
  private lastReducedMotion: boolean | undefined;
  private overlayKey = '';
  private logo: HTMLImageElement | null = null;
  private brandingDirty = false;
  private disposed = false;

  constructor() {
    // Keep intermediate feeds linear, with HDR only when the renderer supports it.
    // RGBA8 fallback clips highlights but retains a visible feed and the same final
    // canvas output transform instead of risking an incomplete floating framebuffer.
    this.worldTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.displayTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;
    if (this.overlayCanvas) {
      this.overlayCanvas.width = 640; this.overlayCanvas.height = 384;
      this.overlay = new THREE.CanvasTexture(this.overlayCanvas);
    } else this.overlay = new THREE.Texture();
    this.overlay.colorSpace = THREE.SRGBColorSpace;
    this.imageMaterial = new THREE.MeshBasicMaterial({map:this.worldTarget.texture,depthTest:false,depthWrite:false,toneMapped:false});
    this.overlayMaterial = new THREE.MeshBasicMaterial({map:this.overlay,transparent:true,depthTest:false,depthWrite:false,toneMapped:false});
    const image = new THREE.Mesh(this.geometry,this.imageMaterial), overlay = new THREE.Mesh(this.geometry,this.overlayMaterial);
    image.position.z = -1; overlay.position.z = -.5; overlay.renderOrder = 1;
    this.presentation.add(image,overlay);
    this.flatCamera.position.z = 0;
    if (this.overlayCanvas && typeof Image !== 'undefined') {
      const logo = new Image(); this.logo = logo;
      logo.onload = () => {
        if (this.disposed) return;
        this.overlayKey = ''; this.brandingDirty = true;
      };
      logo.src = '/branding/shift5-logo.svg';
    }
  }

  get texture(): THREE.Texture { return this.displayTarget.texture; }
  setMode(mode: GunnerDisplayMode): void { if (this.mode !== mode) { this.mode = mode; this.dirty = true; } }
  reset(): void { this.lastBucket = -1; this.lastTime = -1; this.lastEngine = undefined; this.dirty = true; }

  /** Simulation-time buckets freeze on pause; an explicit filter/power change can refresh once. */
  needsFrame(frame: GunnerFrame): boolean {
    if (this.disposed || this.mode === 'mfocs') return false;
    const bucket = Math.floor(frame.time * (frame.phone ? 12 : 20) + 1e-6);
    return this.brandingDirty || this.dirty || this.lastEngine !== frame.engine || this.lastPhone !== frame.phone || this.lastReducedMotion !== frame.reducedMotion || frame.time < this.lastTime ||
      (!frame.paused && bucket !== this.lastBucket);
  }

  private thermalMaterial(source:THREE.Material, hot:boolean, used:Set<THREE.Material>): THREE.Material {
    const color = 'color' in source ? source.color as THREE.Color : null;
    const level = color ? THREE.MathUtils.clamp(Math.round((color.r + color.g + color.b) / 3 * 7),0,7) : 3;
    const base = hot ? this.hot : this.cool[level];
    if (!source.transparent && source.opacity === 1 && source.depthWrite && source.alphaTest === 0) return base;
    used.add(source);
    let variants = this.alphaMaterials.get(source);
    if (!variants) { variants = new Map(); this.alphaMaterials.set(source,variants); }
    let material = variants.get(hot);
    if (!material) { material = new THREE.MeshBasicMaterial(); variants.set(hot,material); }
    const textured = source as THREE.MeshBasicMaterial;
    const map = textured.map ?? null, alphaMap = textured.alphaMap ?? null;
    if (material.map !== map || material.alphaMap !== alphaMap || material.transparent !== source.transparent || material.side !== source.side || material.alphaTest !== source.alphaTest || material.premultipliedAlpha !== source.premultipliedAlpha)
      material.needsUpdate = true;
    material.color.copy(base.color);
    material.map = map; material.alphaMap = alphaMap;
    material.opacity = source.opacity; material.transparent = source.transparent;
    material.depthWrite = source.depthWrite; material.depthTest = source.depthTest;
    material.alphaTest = source.alphaTest; material.side = source.side;
    material.blending = source.blending; material.premultipliedAlpha = source.premultipliedAlpha;
    material.colorWrite = source.colorWrite; material.visible = source.visible;
    return material;
  }

  private pruneAlphaMaterials(used:Set<THREE.Material>): void {
    for (const [source,variants] of this.alphaMaterials) if (!used.has(source)) {
      variants.forEach(material => material.dispose()); this.alphaMaterials.delete(source);
    }
  }

  private drawOverlay(frame: GunnerFrame): void {
    const key = `${this.mode}/${frame.engine}/${frame.locked}`;
    if (key === this.overlayKey) return;
    this.overlayKey = key;
    const ctx = this.overlayCanvas?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0,0,640,384);
    ctx.fillStyle = 'rgba(4,8,11,.82)'; ctx.fillRect(0,0,640,43); ctx.fillRect(0,354,640,30);
    ctx.fillStyle = '#f4f6f7'; ctx.font = 'bold 18px sans-serif';
    ctx.fillText(frame.engine ? this.mode === 'thermal' ? 'THERMAL · WHITE HOT' : 'DAY · LIVE GAME VIEW' : 'NO SIGNAL · ENGINE OFF',18,27);
    ctx.font = '13px sans-serif';
    ctx.fillText(this.mode === 'thermal' ? 'SIMULATED CONTRAST · NOT TEMPERATURE DATA' : 'FICTIONAL GAME CAMERA',18,374);
    if (this.logo?.complete && this.logo.naturalWidth > 0) {
      ctx.save(); ctx.globalAlpha = .6;
      ctx.drawImage(this.logo,540,360,83.5,20); ctx.restore();
    }
    if (frame.engine) {
      ctx.strokeStyle = frame.locked ? '#ff9b52' : '#f4f6f7'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (const sign of [-1,1]) { ctx.moveTo(320 + sign * 10,192); ctx.lineTo(320 + sign * 27,192); ctx.moveTo(320,192 + sign * 10); ctx.lineTo(320,192 + sign * 27); }
      ctx.stroke(); ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(319,191,2,2);
      if (frame.locked) { ctx.strokeRect(282,154,76,76); ctx.font = 'bold 13px sans-serif'; ctx.fillText('AIM ASSIST',493,27); }
    }
    this.overlay.needsUpdate = true;
  }

  /** All temporary world and renderer changes are restored even if either render throws. */
  capture(renderer: THREE.WebGLRenderer, scene: THREE.Scene, frame: GunnerFrame,
    show: THREE.Object3D[], hide: THREE.Object3D[], hotRoots: THREE.Object3D[]): boolean {
    if (!this.needsFrame(frame)) return false;
    if (!this.targetTypeConfigured) {
      const type = gunnerRenderTargetType(renderer);
      for (const target of [this.worldTarget,this.displayTarget]) { target.texture.type = type; target.texture.needsUpdate = true; }
      this.targetTypeConfigured = true;
    }
    const target = renderer.getRenderTarget(), cubeFace = renderer.getActiveCubeFace(), mipLevel = renderer.getActiveMipmapLevel();
    const viewport = renderer.getViewport(new THREE.Vector4()), scissor = renderer.getScissor(new THREE.Vector4());
    const scissorTest = renderer.getScissorTest(), clearColor = renderer.getClearColor(new THREE.Color()), clearAlpha = renderer.getClearAlpha();
    const autoClear = renderer.autoClear, xrEnabled = renderer.xr.enabled, shadows = renderer.shadowMap.autoUpdate, shadowEnabled = renderer.shadowMap.enabled;
    const background = scene.background, fog = scene.fog, overrideMaterial = scene.overrideMaterial;
    const visibility: Visibility[] = [], materials = new Map<THREE.Mesh,THREE.Material | THREE.Material[]>();
    const usedAlphaMaterials = new Set<THREE.Material>();
    const hotMeshes = new Set<THREE.Object3D>();
    const setVisible = (object:THREE.Object3D, visible:boolean) => { visibility.push({object,visible:object.visible}); object.visible = visible; };
    try {
      const width = frame.phone ? 512 : 640, height = frame.phone ? 306 : 384;
      if (this.worldTarget.width !== width) { this.worldTarget.setSize(width,height); this.displayTarget.setSize(width,height); }
      this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); alignGunnerCamera(this.camera,frame);
      renderer.xr.enabled = false; renderer.shadowMap.enabled = false; renderer.shadowMap.autoUpdate = false; renderer.autoClear = true; renderer.setScissorTest(false);
      renderer.setClearColor(0x000000,1);
      show.forEach(object => setVisible(object,true)); hide.forEach(object => setVisible(object,false));
      // Local muzzle puffs are cosmetic exterior effects, never optical occluders.
      // Keep impact dust, breakdown steam and wreck smoke in the shared world.
      scene.traverse(object => { if (object.userData.gunnerSightHidden) setVisible(object,false); });
      scene.background = new THREE.Color(this.mode === 'thermal' ? 0x151a20 : 0xc3c6ba);
      scene.fog = new THREE.FogExp2(this.mode === 'thermal' ? 0x151a20 : 0xc3c6ba,.0037);
      scene.overrideMaterial = null;
      if (this.mode === 'thermal') {
        hotRoots.forEach(root => root.traverse(object => hotMeshes.add(object)));
        scene.traverse(object => {
          if (object instanceof THREE.Mesh) {
            if (object.userData.gunnerSightHidden) return;
            materials.set(object,object.material);
            const hot = hotMeshes.has(object);
            object.material = Array.isArray(object.material)
              ? object.material.map(source => this.thermalMaterial(source,hot,usedAlphaMaterials))
              : this.thermalMaterial(object.material,hot,usedAlphaMaterials);
          } else if (object instanceof THREE.Points || object instanceof THREE.Line) setVisible(object,false);
        });
      }
      renderer.setRenderTarget(this.worldTarget); renderer.setViewport(0,0,width,height);
      // Asset arrival can update the bezel while keeping a paused world feed frozen.
      const brandingOnly = this.brandingDirty && frame.paused && !this.dirty && this.lastEngine === frame.engine && this.lastPhone === frame.phone && this.lastReducedMotion === frame.reducedMotion && frame.time >= this.lastTime;
      if (!brandingOnly) {
        if (frame.engine) renderer.render(scene,this.camera); else renderer.clear();
      }
      this.drawOverlay(frame);
      renderer.setRenderTarget(this.displayTarget); renderer.setViewport(0,0,width,height);
      renderer.render(this.presentation,this.flatCamera);
      this.lastBucket = Math.floor(frame.time * (frame.phone ? 12 : 20) + 1e-6);
      this.lastTime = frame.time; this.lastEngine = frame.engine; this.lastPhone = frame.phone; this.lastReducedMotion = frame.reducedMotion; this.dirty = false; this.brandingDirty = false;
      return true;
    } finally {
      materials.forEach((material,mesh) => { mesh.material = material; });
      this.pruneAlphaMaterials(usedAlphaMaterials);
      for (let i = visibility.length - 1; i >= 0; i--) visibility[i].object.visible = visibility[i].visible;
      scene.background = background; scene.fog = fog; scene.overrideMaterial = overrideMaterial;
      renderer.autoClear = autoClear; renderer.xr.enabled = xrEnabled; renderer.shadowMap.autoUpdate = shadows; renderer.shadowMap.enabled = shadowEnabled;
      renderer.setRenderTarget(target,cubeFace,mipLevel); renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest); renderer.setClearColor(clearColor,clearAlpha);
    }
  }

  /** Letterbox the completed feed in the existing canvas, preserving its optical aspect. */
  renderExpanded(renderer: THREE.WebGLRenderer, width:number, height:number): void {
    const target = renderer.getRenderTarget(), cubeFace = renderer.getActiveCubeFace(), mipLevel = renderer.getActiveMipmapLevel();
    const viewport = renderer.getViewport(new THREE.Vector4()), scissor = renderer.getScissor(new THREE.Vector4());
    const scissorTest = renderer.getScissorTest(), autoClear = renderer.autoClear;
    const clearColor = renderer.getClearColor(new THREE.Color()), clearAlpha = renderer.getClearAlpha();
    const map = this.imageMaterial.map, toneMapped = this.imageMaterial.toneMapped, overlayVisible = this.presentation.children[1].visible;
    try {
      this.imageMaterial.map = this.displayTarget.texture; this.imageMaterial.toneMapped = true; this.presentation.children[1].visible = false;
      renderer.setRenderTarget(null); renderer.autoClear = false; renderer.setScissorTest(false); renderer.setClearColor(0x030607,1); renderer.clear();
      const aspect = this.displayTarget.width / this.displayTarget.height, w = Math.min(width,height * aspect), h = w / aspect;
      renderer.setViewport((width - w) / 2,(height - h) / 2,w,h);
      renderer.render(this.presentation,this.flatCamera);
    } finally {
      this.imageMaterial.map = map; this.imageMaterial.toneMapped = toneMapped; this.presentation.children[1].visible = overlayVisible;
      renderer.autoClear = autoClear; renderer.setRenderTarget(target,cubeFace,mipLevel); renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest); renderer.setClearColor(clearColor,clearAlpha);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.logo) { this.logo.onload = null; this.logo.onerror = null; }
    this.logo = null;
    this.worldTarget.dispose(); this.displayTarget.dispose(); this.geometry.dispose();
    this.imageMaterial.dispose(); this.overlayMaterial.dispose(); this.overlay.dispose();
    this.cool.forEach(material => material.dispose()); this.hot.dispose();
    this.pruneAlphaMaterials(new Set());
  }
}
