import * as THREE from 'three';
import { DISMOUNT, rampOpenProgress, troopRunProgress } from './dismount.ts';
import type { DismountState } from './dismount.ts';

export const REAR_RAMP = { hingeY: .76, hingeZ: -3.255, length: 1.46, width: 1.54,
  openAngle: -Math.acos(-.71 / 1.46) } as const;
export const RAMP_PIVOT_NAME = 'dismount-ramp-pivot';
export const DOORWAY_NAME = 'dismount-doorway';

/** A real lower-edge hinge, kept in a group outside the static hull batching. */
export function createRearRamp(armor: THREE.Material, edge: THREE.Material) {
  const root = new THREE.Group(); root.name = 'rear-ramp-assembly';
  const doorway = new THREE.Mesh(new THREE.PlaneGeometry(1.59,1.39),new THREE.MeshBasicMaterial({color:0x080d0b}));
  doorway.name = DOORWAY_NAME; doorway.position.set(0,1.43,-3.247); doorway.rotation.y = Math.PI; doorway.visible = false; root.add(doorway);
  const pivot = new THREE.Group(); pivot.name = RAMP_PIVOT_NAME; pivot.position.set(0,REAR_RAMP.hingeY,REAR_RAMP.hingeZ); root.add(pivot);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(REAR_RAMP.width,REAR_RAMP.length,.09),armor);
  panel.position.y = REAR_RAMP.length / 2; panel.castShadow = panel.receiveShadow = true; pivot.add(panel);
  const railGeometry = new THREE.BoxGeometry(1.4,.035,.025);
  for (let i = 0; i < 8; i++) {
    const rail = new THREE.Mesh(railGeometry,edge); rail.position.set(0,.12 + i * .17,.057); pivot.add(rail);
  }
  const latchGeometry = new THREE.BoxGeometry(.07,.19,.065);
  for (const x of [-.55,.55]) {
    const latch = new THREE.Mesh(latchGeometry,edge); latch.position.set(x,1.23,-.07); pivot.add(latch);
  }
  return { root, pivot, doorway };
}

/** Inspection bounds and pose must be independent of an open mission ramp. GPU data is borrowed here. */
export function closedRampClone(source: THREE.Group): THREE.Group {
  const clone = source.clone(true);
  const ramp = clone.getObjectByName(RAMP_PIVOT_NAME); ramp?.rotation.set(0,0,0);
  const doorway = clone.getObjectByName(DOORWAY_NAME); if (doorway) doorway.visible = false;
  return clone;
}

export interface TroopPose { visible:boolean; x:number; y:number; z:number; yaw:number; progress:number; moving:boolean }
const lerp = (a:number,b:number,t:number) => a + (b - a) * t;

/** Broad fictional game poses, with a clear path behind the ramp. This is not a drill. */
export const SQUAD_FAN_RADIUS = 7.5;
const fanAngle = (index:number) => index === DISMOUNT.troopCount - 1 ? 0 :
  (index % 2 ? 1 : -1) * (80 - Math.floor(index / 2) * 20) * Math.PI / 180;

/** Vehicle coordinates: rear is -z. Exit down the ramp, travel, then face away from the vehicle. */
export function sampleTroopPose(elapsed:number,index:number,out:TroopPose = {visible:false,x:0,y:0,z:0,yaw:0,progress:0,moving:false}): TroopPose {
  const p = troopRunProgress(elapsed,index), start = DISMOUNT.rampOpenSeconds + index * DISMOUNT.troopStaggerSeconds;
  const lane = index % 2 ? .22 : -.22;
  out.visible = elapsed >= start; out.progress = p; out.moving = out.visible && p < 1;
  if (p <= .15) {
    const t = p / .15; out.x = lane; out.z = lerp(-2.98,-3.3,t); out.y = REAR_RAMP.hingeY + .055; out.yaw = Math.PI;
  } else if (p <= .48) {
    const t = (p - .15) / .33; out.x = lane; out.z = lerp(-3.3,-4.53,t); out.y = lerp(REAR_RAMP.hingeY + .055,0,t); out.yaw = Math.PI;
  } else {
    const t = (p - .48) / .52, angle = fanAngle(index);
    const endX = Math.sin(angle) * SQUAD_FAN_RADIUS, endZ = -3 - Math.cos(angle) * SQUAD_FAN_RADIUS;
    out.x = lerp(lane,endX,t); out.z = lerp(-4.53,endZ,t); out.y = 0;
    const travelYaw = Math.atan2(endX - lane,endZ + 4.53), outwardYaw = Math.atan2(endX,endZ);
    const turn = Math.max(0,(t - .78) / .22);
    out.yaw = travelYaw + Math.atan2(Math.sin(outwardYaw - travelYaw),Math.cos(outwardYaw - travelYaw)) * turn;
  }
  return out;
}

/** Rear-observer framing in the scene's camera coordinates (+z behind the vehicle). */
export function dismountCameraFrame(aspect:number,fov:number) {
  const distance = Math.max(22,(SQUAD_FAN_RADIUS + 1.7) / (Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect));
  return { eye: [0,Math.max(10,distance * .55),distance] as const, lookAt: [0,.8,4.1] as const };
}

export function vehicleLocalToWorld(x:number,z:number,position:{x:number;z:number},heading:number,out:{x:number;z:number} = {x:0,z:0}) {
  const angle = heading + Math.PI, cos = Math.cos(angle), sin = Math.sin(angle);
  out.x = position.x + x * cos + z * sin; out.z = position.z - x * sin + z * cos; return out;
}

interface Arm { upper:THREE.Mesh; lower:THREE.Mesh; hand:THREE.Mesh; side:number }
interface Soldier {root:THREE.Group; leftHip:THREE.Group;rightHip:THREE.Group;leftKnee:THREE.Group;rightKnee:THREE.Group;rifle:THREE.Group;arms:Arm[];pose:TroopPose;world:{x:number;z:number}}
const armAxis = new THREE.Vector3(0,1,0);
const shoulder = new THREE.Vector3(), elbow = new THREE.Vector3(), grip = new THREE.Vector3(), segment = new THREE.Vector3();
function joinArm(mesh:THREE.Mesh,from:THREE.Vector3,to:THREE.Vector3,width:number) {
  segment.subVectors(to,from); mesh.position.copy(from).addScaledVector(segment,.5);
  mesh.scale.set(width,segment.length(),width); mesh.quaternion.setFromUnitVectors(armAxis,segment.normalize());
}
function holdRifle(soldier:Soldier) {
  soldier.rifle.updateMatrix();
  for (const arm of soldier.arms) {
    shoulder.set(arm.side * .265,1.33,0);
    elbow.set(arm.side > 0 ? .30 : -.29,arm.side > 0 ? 1.04 : 1.07,arm.side > 0 ? .03 : .24);
    // Both hand centers remain on their matching grip in every carry/raised pose.
    grip.set(arm.side * .045,arm.side > 0 ? -.075 : -.04,arm.side > 0 ? 0 : .35).applyMatrix4(soldier.rifle.matrix);
    joinArm(arm.upper,shoulder,elbow,.12); joinArm(arm.lower,elbow,grip,.105);
    arm.hand.position.copy(grip); arm.hand.quaternion.copy(soldier.rifle.quaternion);
  }
}

/** Camouflage-inspired colors on one small shared game texture. */
function squadCloth() {
  const colors = [[98,99,72],[124,110,81],[145,126,91],[71,77,57],[169,147,108]];
  const pixels = new Uint8Array(16 * 16 * 4);
  for (let y=0;y<16;y++) for (let x=0;x<16;x++) {
    const index=(x*13+y*7+(x+y)%3+Math.floor(x/3)*3+Math.floor(y/2)*5)%11;
    pixels.set([...colors[index<4?0:index<7?1:index<9?2:index<10?3:4],255],4*(x+16*y));
  }
  const tex = new THREE.DataTexture(pixels,16,16);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Nine pooled original figures with nonfunctional, purely cosmetic game props. */
export class DismountSquad {
  readonly group = new THREE.Group();
  private readonly geometries = [new THREE.BoxGeometry(1,1,1),new THREE.SphereGeometry(1,8,6)];
  private readonly cloth = squadCloth();
  private readonly materials = [0xffffff,0x655b40,0x262c25,0xaa8262,0x726847,0x2b3030,0x66503b,0xd1a37d]
    .map((color,index) => new THREE.MeshStandardMaterial({color,roughness:.97,map:index === 0 ? this.cloth : null}));
  private readonly soldiers:Soldier[] = [];
  private disposed = false;
  constructor() {
    this.group.name = 'deployed-squad'; this.group.visible = false;
    const mesh = (parent:THREE.Object3D,size:readonly number[],position:readonly number[],material:number,round=false) => {
      const object = new THREE.Mesh(this.geometries[round ? 1 : 0],this.materials[material]);
      object.scale.set(size[0],size[1],size[2]); object.position.set(position[0],position[1],position[2]);
      object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
    };
    for (let i = 0; i < DISMOUNT.troopCount; i++) {
      const root = new THREE.Group(); root.name = `dismount-soldier-${i + 1}`; this.group.add(root);
      mesh(root,[.37,.44,.25],[0,1.11,0],0); // uniform and shaped protective vest
      mesh(root,[.41,.35,.3],[0,1.15,.01],1);
      mesh(root,[.28,.3,.13],[0,1.13,-.2],4); // compact pack
      for (const x of [-.1,.1]) mesh(root,[.12,.13,.06],[x,1.08,.19],4);
      const skin = [3,6,7][i%3];
      mesh(root,[.12,.13,.12],[0,1.4,0],skin);
      mesh(root,[.171,.2,.163],[0,1.56,.014],skin,true);
      mesh(root,[.28,.22,.274],[0,1.635,-.015],0,true).name = 'cloth-covered-helmet';
      mesh(root,[.24,.031,.206],[0,1.6,.053],4);
      mesh(root,[.139,.043,.035],[0,1.554,.079],5).name = 'protective-eyewear';
      mesh(root,[.098,.09,.075],[.11,1.155,-.193],2);
      const prop = new THREE.Group();
      prop.name = 'cosmetic-rifle'; prop.position.set(.01,1.17,.16); root.add(prop);
      mesh(prop,[.09,.10,.29],[0,0,.07],5).name = 'rifle-receiver';
      mesh(prop,[.075,.08,.24],[0,0,.31],5).name = 'rifle-handguard';
      mesh(prop,[.034,.034,.22],[0,0,.54],5).name = 'rifle-barrel';
      mesh(prop,[.095,.13,.25],[0,-.008,-.17],5).name = 'rifle-stock';
      mesh(prop,[.055,.12,.05],[0,-.075,0],5).name = 'rifle-trigger-grip';
      mesh(prop,[.06,.15,.09],[0,-.10,.12],5).name = 'rifle-magazine';
      mesh(prop,[.035,.045,.05],[0,.074,.23],5).name = 'rifle-sight';
      const arms = [-1,1].map(side => {
        const upper=mesh(root,[.12,.26,.12],[0,0,0],0), lower=mesh(root,[.105,.26,.105],[0,0,0],0);
        const hand=mesh(root,[.085,.10,.10],[0,0,0],skin);
        hand.name = side > 0 ? 'trigger-hand' : 'support-hand';
        return {upper,lower,hand,side};
      });
      const leg = (x:number) => {
        const joint = new THREE.Group(); joint.position.set(x,.85,0); root.add(joint);
        const length = .36, width = .145;
        mesh(joint,[width,length,width],[0,-length/2,0],0);
        const bend = new THREE.Group(); bend.position.y = -length; joint.add(bend);
        mesh(bend,[width * .9,length,width * .9],[0,-length/2,0],0);
        mesh(bend,[.103,.105,.035],[0,-.049,.067],4);
        mesh(bend,[.16,.12,.27],[0,-length-.06,.055],2);
        return {joint,bend};
      };
      const left = leg(-.115), right = leg(.115);
      this.soldiers.push({root,leftHip:left.joint,rightHip:right.joint,leftKnee:left.bend,rightKnee:right.bend,rifle:prop,arms,
        pose:{visible:false,x:0,y:0,z:0,yaw:0,progress:0,moving:false},world:{x:0,z:0}});
    }
  }

  update(state:DismountState,ground:(x:number,z:number)=>number,reducedMotion:boolean) {
    this.group.visible = state.phase !== 'stowed';
    if (!this.group.visible) return;
    const base = ground(state.position.x,state.position.z);
    // This is a pure projection of the simulation's elapsed clock. Repeated paused renders cannot advance it.
    for (let i = 0; i < this.soldiers.length; i++) {
      const s = this.soldiers[i], pose = sampleTroopPose(state.elapsed,i,s.pose);
      s.root.visible = pose.visible; if (!pose.visible) continue;
      vehicleLocalToWorld(pose.x,pose.z,state.position,state.heading,s.world);
      const surface = ground(s.world.x,s.world.z), rampHeight = pose.progress <= .48 ? base + pose.y : surface;
      const stride = !reducedMotion && pose.moving ? Math.sin((state.elapsed - i * DISMOUNT.troopStaggerSeconds) * 16) : 0;
      s.root.position.set(s.world.x,rampHeight + .01 + Math.abs(stride) * .035,s.world.z);
      s.root.rotation.set(0,state.heading + Math.PI + pose.yaw,0);
      s.leftHip.rotation.x = stride * .65; s.rightHip.rotation.x = -stride * .65;
      s.leftKnee.rotation.x = Math.max(0,-stride) * .65; s.rightKnee.rotation.x = Math.max(0,stride) * .65;
      s.rifle.position.y = pose.moving ? 1.17 : 1.24;
      s.rifle.rotation.x = pose.moving ? .38 : 0;
      holdRifle(s);
    }
  }

  reset() { this.group.visible = false; for (const s of this.soldiers) s.root.visible = false; }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.group.removeFromParent();
    this.geometries.forEach(geometry => geometry.dispose()); this.materials.forEach(material => material.dispose()); this.cloth.dispose();
  }
}

export function updateRearRamp(pivot:THREE.Group,doorway:THREE.Object3D,state:DismountState,reducedMotion:boolean) {
  const active = state.phase !== 'stowed';
  const progress = active ? reducedMotion ? 1 : rampOpenProgress(state.elapsed) : 0;
  pivot.rotation.x = progress > 0 ? REAR_RAMP.openAngle * progress : 0;
  doorway.visible = active;
}
