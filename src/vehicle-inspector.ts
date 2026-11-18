import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { FaultId, VehicleFault } from './mission-contract.ts';
import { disposeInspectionModel, projectSensor, sensorAnchor, SENSOR_COLORS } from './inspection-model.ts';
import { fitGuidedModel } from './guided-camera.ts';

/** On-demand renderer: inspection can orbit while the exercise clock stays paused. */
export class VehicleInspector {
  private readonly root = document.createElement('div');
  private readonly viewport = document.createElement('div');
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
  private renderer: THREE.WebGLRenderer | null = null;
  private controls: OrbitControls | null = null;
  private observer: ResizeObserver | null = null;
  private readonly markers = new Map<FaultId, HTMLButtonElement>();
  private readonly anchors = new Map<FaultId, THREE.Vector3>();
  private width = 1;
  private height = 1;
  private readonly bounds = new THREE.Box3();
  private disposed = false;

  constructor(host: HTMLElement, private readonly model: THREE.Group | null, private readonly onSelect: (id: FaultId) => void) {
    this.root.className = 'vehicle-inspector';
    Object.assign(this.root.style, { position: 'relative', width: '100%', background: '#101619', borderRadius: '8px', overflow: 'hidden' });
    this.viewport.className = 'vehicle-inspector-viewport';
    Object.assign(this.viewport.style, { position: 'relative', width: '100%', height: 'var(--inspector-height,clamp(230px,35vw,340px))', minHeight: 'var(--inspector-min-height,230px)', touchAction: 'none' });
    this.viewport.tabIndex = 0; this.viewport.setAttribute('role', 'group');
    this.viewport.setAttribute('aria-label', 'Rotatable vehicle sensor model. Drag or use arrow keys to rotate.');
    this.root.append(this.viewport); host.append(this.root);
    const toolbar = document.createElement('div');
    Object.assign(toolbar.style, { display: 'flex', gap: '6px', padding: '8px', justifyContent: 'center', flexWrap: 'wrap' });
    for (const [label, action] of [['Rotate left', () => this.rotate(-Math.PI / 6)], ['Rotate right', () => this.rotate(Math.PI / 6)], ['Reset view', () => this.reset()]] as const) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      Object.assign(button.style, { minHeight: '44px', padding: '6px 12px', background: '#263136', color: '#fff', border: '1px solid #607077', borderRadius: '5px' });
      button.addEventListener('click', action); toolbar.append(button);
    }
    this.root.append(toolbar);
    this.viewport.addEventListener('keydown', this.onKey);
    try {
      if (!model) throw new Error('Model unavailable');
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setClearColor(0x101619, 0); this.viewport.append(this.renderer.domElement);
      Object.assign(this.renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });
      this.renderer.domElement.setAttribute('aria-hidden', 'true');
      this.scene.add(model, new THREE.HemisphereLight(0xe4f2ff, 0x494433, 2.5));
      const light = new THREE.DirectionalLight(0xfff3d7, 3); light.position.set(5, 8, 4); this.scene.add(light);
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = false; this.controls.enablePan = false; this.controls.autoRotate = false;
      this.controls.minDistance = 6; this.controls.maxDistance = 14;
      this.controls.minPolarAngle = .18; this.controls.maxPolarAngle = Math.PI * .68;
      this.controls.addEventListener('change', this.render);
      const bounds = this.bounds.setFromObject(model);
      for (const id of ['charging', 'cooling', 'wheel-end'] as const) {
        this.anchors.set(id, sensorAnchor(bounds, id));
        const marker = document.createElement('button'); marker.type = 'button'; marker.className = 'vehicle-sensor';
        Object.assign(marker.style, { position: 'absolute', width: '44px', height: '44px', margin: '-22px 0 0 -22px', padding: '0', border: '0', borderRadius: '50%', background: 'transparent', color: SENSOR_COLORS.normal, cursor: 'pointer', zIndex: '1' });
        marker.innerHTML = '<span aria-hidden="true" style="display:block;width:14px;height:14px;margin:auto;border:2px solid #fff;border-radius:50%;background:currentColor;box-shadow:0 0 0 4px #101619aa"></span>';
        marker.addEventListener('click', () => this.onSelect(id)); this.viewport.append(marker); this.markers.set(id, marker);
      }
      this.observer = new ResizeObserver(this.resize); this.observer.observe(this.viewport);
      this.reset(); this.resize();
    } catch {
      this.observer?.disconnect();
      this.controls?.dispose(); this.controls = null;
      this.renderer?.dispose(); this.renderer?.forceContextLoss(); this.renderer?.domElement.remove(); this.renderer = null;
      this.markers.forEach(marker => marker.remove()); this.markers.clear();
      const fallback = document.createElement('p'); fallback.textContent = 'Vehicle view unavailable. Select a sensor from the component list.';
      Object.assign(fallback.style, { padding: '28px', color: '#ced7da' }); this.viewport.append(fallback);
      toolbar.hidden = true;
    }
  }

  update(faults: readonly VehicleFault[], selected?: FaultId): void {
    for (const [id, marker] of this.markers) {
      const fault = faults.find(f => f.id === id);
      const label = fault ? (fault.severity === 'normal' ? fault.component : fault.label) : id;
      marker.hidden = !fault;
      marker.style.color = SENSOR_COLORS[fault?.severity ?? 'normal'];
      marker.setAttribute('aria-label', `${label}: ${fault?.severity ?? 'normal'}. Inspect sensor.`);
      marker.setAttribute('aria-pressed', String(selected === id));
      marker.style.outline = selected === id ? '2px solid #fff' : 'none';
      marker.title = `${label} · ${fault?.severity ?? 'normal'}`;
    }
    this.render();
  }

  private readonly resize = () => {
    if (this.disposed || !this.renderer) return;
    this.width = Math.max(1, this.viewport.clientWidth); this.height = Math.max(1, this.viewport.clientHeight);
    this.camera.aspect = this.width / this.height; this.camera.updateProjectionMatrix();
    this.fit(); this.controls?.update();
    this.renderer.setSize(this.width, this.height, false); this.render();
  };
  private readonly render = () => {
    if (this.disposed || !this.renderer) return;
    // Orbiting must not crop the antenna or wheels when the long side turns toward us.
    const fit = fitGuidedModel(this.bounds, this.camera.position.clone().sub(this.controls?.target ?? new THREE.Vector3()), this.camera.fov, this.camera.aspect);
    if (this.camera.position.distanceTo(fit.center) < fit.distance) this.camera.position.copy(fit.position);
    this.camera.updateMatrixWorld();
    this.renderer.render(this.scene, this.camera);
    for (const [id, marker] of this.markers) {
      const point = projectSensor(this.anchors.get(id)!, this.camera, this.width, this.height);
      marker.style.left = `${point.x}px`; marker.style.top = `${point.y}px`;
      marker.style.visibility = point.visible ? 'visible' : 'hidden';
    }
  };
  private fit() {
    const fit = fitGuidedModel(this.bounds, this.camera.position.clone().sub(this.controls?.target ?? new THREE.Vector3()), this.camera.fov, this.camera.aspect);
    this.camera.position.copy(fit.position); this.controls?.target.copy(fit.center);
    if (this.controls) { this.controls.minDistance = fit.distance * .8; this.controls.maxDistance = fit.distance * 3; }
  }
  private reset() { this.camera.position.copy(this.bounds.getCenter(new THREE.Vector3())).add(new THREE.Vector3(7, 4.8, 8)); this.controls?.target.copy(this.bounds.getCenter(new THREE.Vector3())); this.fit(); this.controls?.update(); this.render(); }
  private rotate(angle: number, elevation = 0) {
    if (!this.controls) return;
    const offset = this.camera.position.clone().sub(this.controls.target), spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += angle; spherical.phi = THREE.MathUtils.clamp(spherical.phi + elevation, .18, Math.PI * .68);
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(spherical)); this.controls.update(); this.render();
  }
  private readonly onKey = (event: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Home') this.reset();
    else this.rotate(event.key === 'ArrowLeft' ? -.2 : event.key === 'ArrowRight' ? .2 : 0, event.key === 'ArrowUp' ? -.15 : event.key === 'ArrowDown' ? .15 : 0);
  };
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.observer?.disconnect();
    this.viewport.removeEventListener('keydown', this.onKey);
    this.controls?.removeEventListener('change', this.render); this.controls?.dispose();
    if (this.model) disposeInspectionModel(this.model);
    this.renderer?.dispose(); this.renderer?.forceContextLoss(); this.root.remove();
    this.markers.clear(); this.anchors.clear(); this.scene.clear();
  }
}
