import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const ORANGE = 0xe96324;
const DARK = 0x20262d;
const METAL = 0xaeb7c0;
const BLOCK_COLORS = [0x3274c5,0xd85055,0xe3a331,0x2c9a71,0x7458b7,0x298fa3,0xc35e91,0x6f9137];
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const ease = t => t < .5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;

function box(w,h,d,material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d,3,3,3),material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function cylinder(rt,rb,h,material,segments=32) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,segments),material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function labelMaterial(letter,color) {
  const canvas = document.createElement("canvas"); canvas.width=256; canvas.height=256;
  const ctx = canvas.getContext("2d"); ctx.fillStyle=`#${color.toString(16).padStart(6,"0")}`; ctx.fillRect(0,0,256,256);
  ctx.strokeStyle="rgba(255,255,255,.22)"; ctx.lineWidth=10; ctx.strokeRect(12,12,232,232);
  ctx.fillStyle="#fff"; ctx.font="700 104px Arial"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(letter,128,136);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy=4;
  return new THREE.MeshStandardMaterial({map:texture,roughness:.38,metalness:.06});
}

export class IndustrialRobotScene {
  constructor(container,{application=false,onCycle,onStep}={}) {
    this.container=container; this.application=application; this.onCycle=onCycle; this.onStep=onStep;
    this.scene=new THREE.Scene(); this.scene.background=new THREE.Color(0xf0f2f4);
    this.camera=new THREE.PerspectiveCamera(34,1,.1,100); this.camera.position.set(0,5.5,10.5);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:"high-performance"});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2)); this.renderer.shadowMap.enabled=true; this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace; this.renderer.toneMapping=THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure=1.05;
    container.replaceChildren(this.renderer.domElement); this.renderer.domElement.setAttribute("aria-label","Interactive 3D industrial robot workcell");
    this.controls=new OrbitControls(this.camera,this.renderer.domElement); this.controls.enableDamping=true; this.controls.dampingFactor=.07; this.controls.target.set(-.25,1.35,.2); this.controls.minDistance=5.5; this.controls.maxDistance=15; this.controls.maxPolarAngle=Math.PI*.49;
    this.orange=new THREE.MeshStandardMaterial({color:ORANGE,roughness:.28,metalness:.12});
    this.dark=new THREE.MeshStandardMaterial({color:DARK,roughness:.4,metalness:.5});
    this.metal=new THREE.MeshStandardMaterial({color:METAL,roughness:.25,metalness:.8});
    this.blockSize=.46; this.stackPitch=.5; this.transferCorridorZ=.82;
    this.blockMeshes=new Map(); this.lastPositions=new Map(); this.animationToken=0; this.currentTarget=new THREE.Vector3(.3,2.5,0);
    this.reducedMotion=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches||false;
    this.buildEnvironment(); this.buildRobot();
    if(this.application)this.table.visible=false;
    this.setTarget(this.currentTarget,.35);
    this.resizeObserver=new ResizeObserver(()=>this.resize()); this.resizeObserver.observe(container); this.resize(); this.loop();
  }

  buildEnvironment() {
    const hemi=new THREE.HemisphereLight(0xffffff,0x8b9299,2.2); this.scene.add(hemi);
    const key=new THREE.DirectionalLight(0xffffff,4.1); key.position.set(-3,8,5); key.castShadow=true; key.shadow.mapSize.set(2048,2048); key.shadow.camera.left=-7; key.shadow.camera.right=7; key.shadow.camera.top=7; key.shadow.camera.bottom=-7; key.shadow.bias=-.00035; this.scene.add(key);
    const fill=new THREE.DirectionalLight(0xffd4bc,1.35); fill.position.set(6,4,-4); this.scene.add(fill);
    const floorMat=new THREE.MeshStandardMaterial({color:0xd9dde1,roughness:.76,metalness:.03});
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(18,14),floorMat); floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; this.scene.add(floor);
    const grid=new THREE.GridHelper(18,36,0xb2b9c0,0xcbd0d5); grid.position.y=.003; grid.material.transparent=true; grid.material.opacity=.46; this.scene.add(grid);
    this.table=new THREE.Group();
    const top=box(5.4,.18,3.0,new THREE.MeshStandardMaterial({color:0x67727c,roughness:.38,metalness:.65})); top.position.set(-.35,.88,0); this.table.add(top);
    for(const x of [-2.55,1.85]) for(const z of [-1.17,1.17]) { const leg=box(.13,.82,.13,this.dark); leg.position.set(x,.41,z); this.table.add(leg); }
    this.scene.add(this.table);
    const guardMat=new THREE.MeshStandardMaterial({color:0xf2b13d,roughness:.5});
    for(const z of [-3.15,3.15]) { const rail=box(8.2,.055,.055,guardMat); rail.position.set(-.35,.03,z); this.scene.add(rail); }
    this.destinationMarker=new THREE.Mesh(new THREE.RingGeometry(.28,.38,32),new THREE.MeshBasicMaterial({color:ORANGE,transparent:true,opacity:.72,side:THREE.DoubleSide})); this.destinationMarker.rotation.x=-Math.PI/2; this.destinationMarker.visible=false; this.scene.add(this.destinationMarker);
  }

  buildRobot() {
    // The pedestal sits outside the long edge of the table, centered on every block lane.
    // This gives the arm a collision-free radial path to all eight supported positions.
    this.robot=new THREE.Group(); this.robot.position.set(-.35,0,2.24); this.scene.add(this.robot);
    const basePlate=box(1.15,.12,1.15,this.dark); basePlate.position.y=.06; this.robot.add(basePlate);
    const base=cylinder(.52,.62,.5,this.dark); base.position.y=.35; this.robot.add(base);
    this.baseYaw=new THREE.Group(); this.baseYaw.position.y=.59; this.robot.add(this.baseYaw);
    const turret=cylinder(.48,.52,.42,this.orange); turret.position.y=.2; this.baseYaw.add(turret);
    const shoulderHousing=cylinder(.4,.4,.48,this.orange); shoulderHousing.rotation.x=Math.PI/2; shoulderHousing.position.y=.58; this.baseYaw.add(shoulderHousing);
    const shoulderCap1=cylinder(.29,.29,.5,this.dark); shoulderCap1.rotation.x=Math.PI/2; shoulderCap1.position.set(0,.58,.02); this.baseYaw.add(shoulderCap1);
    this.shoulder=new THREE.Group(); this.shoulder.position.y=.58; this.baseYaw.add(this.shoulder);
    this.L1=2.9; this.L2=2.75;
    const upper=cylinder(.25,.34,this.L1,this.orange); upper.position.y=this.L1/2; upper.scale.z=.76; this.shoulder.add(upper);
    const upperTrim=box(.12,this.L1*.68,.36,this.dark); upperTrim.position.set(.02,this.L1*.42,.02); this.shoulder.add(upperTrim);
    this.elbow=new THREE.Group(); this.elbow.position.y=this.L1; this.shoulder.add(this.elbow);
    const elbowJoint=cylinder(.32,.32,.48,this.orange); elbowJoint.rotation.x=Math.PI/2; this.elbow.add(elbowJoint);
    const elbowCap=cylinder(.22,.22,.5,this.dark); elbowCap.rotation.x=Math.PI/2; this.elbow.add(elbowCap);
    const fore=cylinder(.19,.27,this.L2,this.orange); fore.position.y=this.L2/2; fore.scale.z=.8; this.elbow.add(fore);
    this.wrist=new THREE.Group(); this.wrist.position.y=this.L2; this.elbow.add(this.wrist);
    const wristHousing=cylinder(.23,.25,.45,this.orange); wristHousing.rotation.z=Math.PI/2; this.wrist.add(wristHousing);
    const wristDark=cylinder(.17,.17,.51,this.dark); wristDark.rotation.z=Math.PI/2; this.wrist.add(wristDark);
    this.gripper=new THREE.Group(); this.gripper.position.y=.03; this.wrist.add(this.gripper);
    const palm=box(.2,.22,.58,this.metal); palm.position.y=-.13; this.gripper.add(palm);
    this.fingerA=box(.12,.42,.12,this.metal); this.fingerB=box(.12,.42,.12,this.metal); this.fingerA.position.set(0,-.38,.25); this.fingerB.position.set(0,-.38,-.25); this.gripper.add(this.fingerA,this.fingerB);
    for(const mesh of [this.fingerA,this.fingerB]) { const tip=box(.16,.12,.12,this.metal); tip.position.y=-.23; mesh.add(tip); }
    const cableCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(.2,.8,.25),new THREE.Vector3(.35,this.L1*.62,.35),new THREE.Vector3(.15,this.L1+this.L2*.68,.25)]);
    const cable=new THREE.Mesh(new THREE.TubeGeometry(cableCurve,30,.035,8,false),new THREE.MeshStandardMaterial({color:0x111418,roughness:.7})); this.shoulder.add(cable);
    const envelope=new THREE.Mesh(new THREE.SphereGeometry(this.L1+this.L2,32,16,0,Math.PI*2,0,Math.PI/2),new THREE.MeshBasicMaterial({color:ORANGE,wireframe:true,transparent:true,opacity:.025,depthWrite:false})); envelope.position.set(0,.05,0); envelope.scale.y=.82; this.robot.add(envelope);
  }

  setGripper(open) {
    const gap=open?.7:.28; this.fingerA.position.z=.13+gap*.16; this.fingerB.position.z=-.13-gap*.16;
  }

  setTarget(target,grip=.35) {
    this.currentTarget.copy(target);
    const baseWorld=new THREE.Vector3(); this.robot.getWorldPosition(baseWorld);
    const shoulderY=baseWorld.y+.59+.58; const dx=target.x-baseWorld.x, dz=target.z-baseWorld.z;
    const radial=Math.max(.18,Math.hypot(dx,dz)); const vertical=target.y-shoulderY; const distance=clamp(Math.hypot(radial,vertical),.35,this.L1+this.L2-.06);
    const cosElbow=clamp((distance*distance-this.L1*this.L1-this.L2*this.L2)/(2*this.L1*this.L2),-1,1);
    const elbowAngle=clamp(Math.acos(cosElbow),.12,2.78); const shoulderAngle=clamp(Math.atan2(radial,vertical)-Math.atan2(this.L2*Math.sin(elbowAngle),this.L1+this.L2*Math.cos(elbowAngle)),this.application ? -1.55 : -.15,2.62);
    this.baseYaw.rotation.y=Math.atan2(dz,-dx); this.shoulder.rotation.z=shoulderAngle; this.elbow.rotation.z=elbowAngle; this.wrist.rotation.z=-(shoulderAngle+elbowAngle); this.setGripper(grip);
  }

  blockPosition(block,level=0) {
    const index=Math.max(0,block.charCodeAt(0)-65); return new THREE.Vector3(-2.45+index*.54,1.18+level*this.stackPitch,-.3);
  }

  positionsFor(snapshot) {
    const positions=new Map();
    (snapshot?.stacks||[]).forEach(stack=>stack.forEach((block,level)=>positions.set(block,this.blockPosition(stack[0],level))));
    if(snapshot?.holding) positions.set(snapshot.holding,this.lastPositions.get(snapshot.holding)?.clone()||new THREE.Vector3(-.3,2.35,-.3));
    return positions;
  }

  ensureBlock(name) {
    if(this.blockMeshes.has(name)) return this.blockMeshes.get(name);
    const index=Math.max(0,name.charCodeAt(0)-65); const mesh=box(this.blockSize,this.blockSize,this.blockSize,labelMaterial(name,BLOCK_COLORS[index%BLOCK_COLORS.length]));
    mesh.userData.block=name; this.scene.add(mesh); this.blockMeshes.set(name,mesh); return mesh;
  }

  hasBlockCollision(positions) {
    const entries=[...positions.entries()]; const threshold=this.blockSize-.002;
    for(let i=0;i<entries.length;i++) for(let j=i+1;j<entries.length;j++) {
      const a=entries[i][1],b=entries[j][1];
      if(Math.abs(a.x-b.x)<threshold&&Math.abs(a.y-b.y)<threshold&&Math.abs(a.z-b.z)<threshold)return true;
    }
    return false;
  }

  setWorld(snapshot,focus=true) {
    const positions=this.positionsFor(snapshot); const names=new Set();
    if(this.hasBlockCollision(positions)) throw new Error("Unsafe Blocks World state: two block volumes overlap.");
    positions.forEach((position,name)=>{ names.add(name); const mesh=this.ensureBlock(name); mesh.visible=true; mesh.position.copy(position); this.lastPositions.set(name,position.clone()); });
    this.blockMeshes.forEach((mesh,name)=>{if(!names.has(name)) mesh.visible=false;});
    if(focus&&positions.size){const top=[...positions.values()].at(-1);this.setTarget(new THREE.Vector3(top.x,top.y+.55,top.z),.7);}
  }

  async tweenTarget(target,duration,{mesh=null,carry=false,grip=.35,token=this.animationToken}={}) {
    if(this.reducedMotion) duration=1;
    const from=this.currentTarget.clone(); const start=performance.now();
    return new Promise(resolve=>{
      const frame=now=>{
        if(token!==this.animationToken){resolve(false);return;} const p=clamp((now-start)/Math.max(1,duration),0,1); const point=from.clone().lerp(target,ease(p)); this.setTarget(point,grip);
        if(mesh&&carry){mesh.position.set(point.x,point.y-.43,point.z);this.lastPositions.set(mesh.userData.block,mesh.position.clone());}
        if(p<1)requestAnimationFrame(frame);else resolve(true);
      }; requestAnimationFrame(frame);
    });
  }

  parseAction(action) { const match=/^(PICKUP|PUTDOWN|STACK|UNSTACK)\(([^,)]+)/.exec(action||""); return match?{name:match[1],block:match[2]}:null; }

  transferHeight(previous,next,movingBlock) {
    let highest=1.18;
    for(const snapshot of [previous,next]) {
      this.positionsFor(snapshot).forEach((position,name)=>{ if(name!==movingBlock) highest=Math.max(highest,position.y); });
    }
    // A full block plus clearance keeps the carried cube above every occupied stack.
    return highest+this.blockSize+.24;
  }

  async animateAction(previous,next,action,duration=1100) {
    const parsed=this.parseAction(action); if(!parsed){this.setWorld(next);return;}
    const token=++this.animationToken; this.setWorld(previous,false); const mesh=this.ensureBlock(parsed.block); mesh.visible=true;
    const placing=parsed.name==="STACK"||parsed.name==="PUTDOWN"; const nextPositions=this.positionsFor(next);
    const start=this.lastPositions.get(parsed.block)?.clone()||this.blockPosition(parsed.block,0); const end=placing?(nextPositions.get(parsed.block)?.clone()||start):start.clone();
    const transferCenterY=this.transferHeight(previous,next,parsed.block); const transferTargetY=transferCenterY+.43;
    if(placing){this.destinationMarker.position.set(end.x,.995,end.z);this.destinationMarker.visible=true;}else this.destinationMarker.visible=false;
    const segment=Math.max(70,duration/(placing?5:4));
    if(placing){
      const corridorStart=new THREE.Vector3(start.x,transferTargetY,this.transferCorridorZ); const corridorEnd=new THREE.Vector3(end.x,transferTargetY,this.transferCorridorZ); const aboveEnd=new THREE.Vector3(end.x,transferTargetY,end.z); const lower=new THREE.Vector3(end.x,end.y+.48,end.z);
      await this.tweenTarget(corridorStart,segment,{mesh,carry:true,grip:.15,token});
      await this.tweenTarget(corridorEnd,segment,{mesh,carry:true,grip:.15,token});
      await this.tweenTarget(aboveEnd,segment,{mesh,carry:true,grip:.15,token});
      await this.tweenTarget(lower,segment,{mesh,carry:true,grip:.15,token});
      this.setGripper(.75); mesh.position.copy(end); this.lastPositions.set(parsed.block,end.clone());
      await this.tweenTarget(new THREE.Vector3(end.x,Math.max(end.y+.95,transferTargetY),end.z),segment*.75,{grip:.75,token});
    } else {
      const above=new THREE.Vector3(start.x,Math.max(start.y+.95,transferTargetY),start.z); const contact=new THREE.Vector3(start.x,start.y+.48,start.z); const lift=new THREE.Vector3(start.x,transferTargetY,start.z); const corridor=new THREE.Vector3(start.x,transferTargetY,this.transferCorridorZ);
      await this.tweenTarget(above,segment,{grip:.75,token});
      await this.tweenTarget(contact,segment,{grip:.75,token}); this.setGripper(.15);
      await this.tweenTarget(lift,segment,{mesh,carry:true,grip:.15,token});
      await this.tweenTarget(corridor,segment,{mesh,carry:true,grip:.15,token});
    }
    if(token===this.animationToken)this.setWorld(next,false); this.destinationMarker.visible=false;
  }

  clearApplication() { if(this.appGroup)this.scene.remove(this.appGroup); this.appGroup=new THREE.Group(); this.scene.add(this.appGroup); this.blockMeshes.forEach(mesh=>mesh.visible=false); this.animationToken++; this.appRunning=false; }

  setApplication(type) {
    this.clearApplication(); this.applicationType=type;
    const steel=new THREE.MeshStandardMaterial({color:0x5c6873,roughness:.38,metalness:.68}); const blue=new THREE.MeshStandardMaterial({color:0x2f70aa,roughness:.34,metalness:.45});
    if(type==="automotive"){
      // Two indexed production lines: a narrow door feed and a vehicle body conveyor.
      const conveyorMat=new THREE.MeshStandardMaterial({color:0x3d4750,roughness:.42,metalness:.7});
      const buildConveyor=(z,width)=>{const group=new THREE.Group();const frame=box(4.8,.18,width,conveyorMat);frame.position.set(-.8,.72,z);group.add(frame);for(let i=0;i<11;i++){const roller=cylinder(.07,.07,width-.12,this.metal,16);roller.rotation.x=Math.PI/2;roller.position.set(-3+i*.44,.86,z);group.add(roller);}for(const dz of [-width/2,width/2]){const rail=box(4.9,.08,.06,new THREE.MeshStandardMaterial({color:0xe2a62d,roughness:.5}));rail.position.set(-.8,1.02,z+dz);group.add(rail);}this.appGroup.add(group);};
      buildConveyor(-1.18,.72); buildConveyor(.62,1.48);

      const car=new THREE.Group();
      const lower=box(2.6,.35,1.08,blue);lower.position.y=.32;car.add(lower);
      const hood=box(.72,.3,1.02,blue);hood.position.set(-1.05,.64,0);car.add(hood);
      const roof=box(.92,.12,.92,blue);roof.position.set(.2,1.16,0);car.add(roof);
      const farSide=box(1.4,.62,.08,blue);farSide.position.set(.18,.78,-.49);car.add(farSide);
      const glassMat=new THREE.MeshStandardMaterial({color:0x9fc8dc,roughness:.14,metalness:.18,transparent:true,opacity:.78});
      const glass=box(.82,.48,.05,glassMat);glass.position.set(.2,.93,-.54);car.add(glass);
      for(const x of [-.92,.82])for(const z of [-.57,.57]){const wheel=cylinder(.23,.23,.16,this.dark,24);wheel.rotation.x=Math.PI/2;wheel.position.set(x,.2,z);car.add(wheel);}
      car.position.set(-.72,.93,.62);this.appGroup.add(car);

      this.part=new THREE.Group();
      const doorPanel=box(.9,.78,.085,blue);this.part.add(doorPanel);
      const window=box(.58,.3,.075,glassMat);window.position.set(.04,.43,0);this.part.add(window);
      const handle=box(.18,.045,.045,this.metal);handle.position.set(.23,.11,.07);this.part.add(handle);
      for(const y of [-.25,.25]){const hinge=cylinder(.045,.045,.12,this.metal,16);hinge.rotation.x=Math.PI/2;hinge.position.set(-.43,y,.05);this.part.add(hinge);}
      this.source=new THREE.Vector3(-2.2,1.48,-1.18);this.destination=new THREE.Vector3(-.45,1.7,1.19);this.part.position.copy(this.source);this.appGroup.add(this.part);

      const station=new THREE.Mesh(new THREE.RingGeometry(.24,.3,24),new THREE.MeshBasicMaterial({color:0x9bed35,side:THREE.DoubleSide}));station.rotation.x=-Math.PI/2;station.position.set(this.source.x,.98,this.source.z);this.appGroup.add(station);
    }else if(type==="electronics"){
      const tray=box(1.5,.1,1.25,this.dark);tray.position.set(-1.9,1.05,-.65);this.appGroup.add(tray);const fixture=box(1.7,.16,1.25,steel);fixture.position.set(-.55,1.08,.75);this.appGroup.add(fixture);
      const pcbMat=new THREE.MeshStandardMaterial({color:0x19734c,roughness:.42,metalness:.12});this.part=box(.72,.055,.52,pcbMat);for(let i=0;i<9;i++){const chip=box(.08,.04,.08,this.dark);chip.position.set((i%3-.9)*.19,.05,(Math.floor(i/3)-1)*.15);this.part.add(chip);}this.source=new THREE.Vector3(-1.9,1.18,-.65);this.destination=new THREE.Vector3(-.55,1.22,.75);this.part.position.copy(this.source);this.appGroup.add(this.part);
    }else{
      const conveyor=box(2.7,.25,1.0,steel);conveyor.position.set(-1.55,.93,-.85);this.appGroup.add(conveyor);for(let i=0;i<6;i++){const roller=cylinder(.08,.08,.9,this.dark,16);roller.rotation.x=Math.PI/2;roller.position.set(-2.55+i*.42,1.08,-.85);this.appGroup.add(roller);}const pallet=box(1.45,.16,1.25,new THREE.MeshStandardMaterial({color:0x9b6a3c,roughness:.75}));pallet.position.set(-.65,.12,.88);this.appGroup.add(pallet);
      this.part=box(.58,.48,.55,new THREE.MeshStandardMaterial({color:0xc28a4d,roughness:.72}));this.source=new THREE.Vector3(-2.15,1.42,-.85);this.destination=new THREE.Vector3(-.65,.52,.88);this.part.position.copy(this.source);this.appGroup.add(this.part);
    }
    this.setTarget(new THREE.Vector3(this.source.x,2.35,this.source.z),.75);
  }

  async runApplicationCycle() {
    if(this.appRunning)return; this.appRunning=true; const token=++this.animationToken; let cycles=0;
    while(this.appRunning&&token===this.animationToken){
      this.part.position.copy(this.source);this.part.visible=true;this.setGripper(.75);this.onStep?.("LOCATE");
      await this.tweenTarget(new THREE.Vector3(this.source.x,2.35,this.source.z),420,{grip:.75,token});await this.tweenTarget(new THREE.Vector3(this.source.x,this.source.y+.48,this.source.z),360,{grip:.75,token});this.onStep?.("PICK");this.setGripper(.15);
      await this.tweenTarget(new THREE.Vector3(this.source.x,2.45,this.source.z),430,{mesh:this.part,carry:true,grip:.15,token});this.onStep?.("MOVE");await this.tweenTarget(new THREE.Vector3(this.destination.x,2.45,this.destination.z),620,{mesh:this.part,carry:true,grip:.15,token});await this.tweenTarget(new THREE.Vector3(this.destination.x,this.destination.y+.48,this.destination.z),420,{mesh:this.part,carry:true,grip:.15,token});this.onStep?.("PLACE");this.setGripper(.75);this.part.position.copy(this.destination);
      await this.tweenTarget(new THREE.Vector3(this.destination.x,2.35,this.destination.z),380,{grip:.75,token});this.onStep?.("VERIFY");cycles++;this.onCycle?.(cycles);await new Promise(r=>setTimeout(r,600));
    }
  }

  pauseApplication(){this.appRunning=false;this.animationToken++;}
  emergencyStop(){this.appRunning=false;this.animationToken++;this.destinationMarker.visible=false;this.setGripper(.75);}
  setCameraPreset(name="overview"){
    const presets={overview:[[0,5.5,10.5],[-.25,1.35,.2]],robot:[[4.8,3.6,6.7],[-.35,1.65,1.15]],top:[[-.25,11.8,.01],[-.25,1,0]]};const [position,target]=presets[name]||presets.overview;this.camera.position.set(...position);this.controls.target.set(...target);this.controls.update();
  }
  resetCamera(){this.setCameraPreset("overview");}
  resize(){const w=Math.max(1,this.container.clientWidth),h=Math.max(1,this.container.clientHeight);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);}
  loop(){if(this.disposed)return;requestAnimationFrame(()=>this.loop());this.controls.update();this.renderer.render(this.scene,this.camera);}
  dispose(){this.disposed=true;this.resizeObserver.disconnect();this.renderer.dispose();this.controls.dispose();}
}
