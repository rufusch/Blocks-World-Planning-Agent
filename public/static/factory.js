import * as THREE from "three";
import { IndustrialRobotScene } from "./robot3d.js?v=11";

const vector = (x, y, z) => new THREE.Vector3(x, y, z);
const material = (color, metalness = .12, roughness = .45) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness });
const steel = material(0x929eaa, .64, .32);
const graphite = material(0x253042, .32);
const rubber = material(0x161a22, .02, .8);
const yellow = material(0xe6a923);
const enamel = material(0x326b9a, .55, .25);
const alloy = material(0xbed0de, .44, .24);
const glass = new THREE.MeshStandardMaterial({
  color: 0x81adbf, transparent: true, opacity: .42, roughness: .17, depthWrite: false
});

function mesh(parent, geometry, finish, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, finish);
  object.position.set(x, y, z);
  object.castShadow = object.receiveShadow = true;
  parent.add(object);
  return object;
}

function box(parent, size, finish, position) {
  return mesh(parent, new THREE.BoxGeometry(...size), finish, ...position);
}

function roller(parent, radius, width, finish, position) {
  const object = mesh(parent, new THREE.CylinderGeometry(radius, radius, width, 24), finish, ...position);
  object.rotation.x = Math.PI / 2;
  return object;
}

function profile(parent, finish, points, depth, position = [0, 0, 0], bevel = .018) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => index ? shape.lineTo(x, y) : shape.moveTo(x, y));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, steps: 1
  });
  return mesh(parent, geometry, finish, ...position);
}

function group(parent, position = [0, 0, 0]) {
  const child = new THREE.Group();
  child.position.set(...position);
  parent.add(child);
  return child;
}

function conveyor(parent, z, width, x = 0) {
  const line = group(parent, [x, 0, z]);
  for (const side of [-1, 1]) {
    box(line, [8.4, .2, .09], graphite, [0, .46, side * width / 2]);
    box(line, [8.4, .045, .052], yellow, [0, .55, side * width / 2]);
    for (const leg of [-3.6, 0, 3.6]) {
      box(line, [.09, .42, .09], steel, [leg, .21, side * width * .43]);
      box(line, [.22, .04, .18], graphite, [leg, .03, side * width * .43]);
    }
  }
  for (let i = 0; i < 29; i++) roller(line, .056, width - .1, steel, [-4 + i * .285, .507, 0]);
  box(line, [8.3, .065, width - .1], rubber, [0, .41, 0]);
}

function automotive(parent) {
  const car = group(parent);
  const centerZ = .42;
  const shellZ = .62;
  profile(car, enamel, [[-1.84,.38],[-1.8,.57],[-1.69,.65],[-1.3,.72],[-.82,.73],[-.66,.65],[-.66,.36]], 1.12, [0,0,-.56], .065);
  profile(car, enamel, [[.69,.33],[.68,.65],[.96,.76],[1.39,.73],[1.67,.64],[1.79,.53],[1.8,.36]], 1.14, [0,0,-.57], .058);
  const windshield = box(car, [.73,.028,1.07], glass, [-.68,.974,0]);
  windshield.rotation.z = .81;
  const rearGlass = box(car,[.71,.027,1.01],glass,[.94,.981,0]);
  rearGlass.rotation.z = -.81;
  for (const z of [-shellZ, shellZ]) {
    profile(car, enamel, [[-1.64,.21],[1.64,.21],[1.72,.33],[-1.73,.33]], .035, [0,0,z]);
    profile(car, alloy, [[-1.02,.55],[-.62,1.19],[-.46,1.24],[-.43,1.18],[-.83,.55]], .036, [0,0,z]);
    profile(car, alloy, [[.47,.37],[.49,1.23],[.61,1.23],[.61,.38]], .036, [0,0,z]);
    profile(car, enamel, [[.58,1.24],[.76,1.19],[1.27,.61],[1.08,.61],[.65,1.11]], .036, [0,0,z]);
    for (const x of [-1.21, 1.22]) {
      roller(car, .273, .17, rubber, [x, .26, z]);
      roller(car, .17, .18, alloy, [x, .26, z]);
      roller(car, .073, .187, graphite, [x, .26, z]);
      const outerZ = z + Math.sign(z) * .094;
      for (let spoke = 0; spoke < 5; spoke++) {
        const angle = spoke * Math.PI * .4;
        const rim = box(car,[.10,.022,.011],graphite,[x+Math.cos(angle)*.113,.26+Math.sin(angle)*.113,outerZ]);
        rim.rotation.z = angle;
      }
      const arch = mesh(car, new THREE.TorusGeometry(.305, .032, 10, 30, Math.PI), enamel, x, .26, z * 1.12);
      arch.rotation.z = 0;
    }
  }
  profile(car, glass, [[-.93,.59],[-.55,1.17],[.56,1.17],[.56,.59]], .022, [0,0,-.615], 0);
  box(car, [1.16, .077, 1.19], enamel, [.04, 1.23, 0]);
  box(car, [1.17, .08, .05], alloy, [.04, 1.22, .623]);
  box(car, [1.55, .1, 1.16], graphite, [-.07, .28, 0]);
  const lamp = material(0xf3f6f7, .2);
  box(car, [.05, .10, .36], lamp, [-1.78, .51, .33]);
  box(car, [.05, .10, .36], lamp, [-1.78, .51, -.33]);
  box(car, [.052, .10, .32], material(0xc53539), [1.77, .53, .38]);
  box(car, [.052, .10, .32], material(0xc53539), [1.77, .53, -.38]);
  box(car, [.08,.13,1.02],graphite,[-1.81,.35,0]);
  box(car, [.08,.11,1.01],graphite,[1.77,.33,0]);

  const door = group(parent);
  const doorPaint = material(0x4187bb, .48, .27);
  profile(door, doorPaint, [[-.68,-.27],[.49,-.27],[.49,.13],[-.78,.13],[-.78,-.13]], .052);
  const glazing = [[-.73,.14],[-.42,.56],[.43,.56],[.43,.14]];
  profile(door, glass, glazing, .015, [0,0,.027], 0);
  const surround = [[-.78,.12],[-.46,.61],[.49,.61],[.49,.12]];
  for (let i = 0; i < surround.length; i++) {
    const [ax, ay] = surround[i], [bx, by] = surround[(i + 1) % surround.length];
    const edge = box(door, [Math.hypot(bx - ax, by - ay), .045, .061], graphite, [(ax + bx)/2,(ay + by)/2,.026]);
    edge.rotation.z = Math.atan2(by - ay, bx - ax);
  }
  box(door, [.16,.03,.025], alloy, [.29,.055,.074]);
  const rack = group(parent);
  box(rack, [1.53,.11,.76], graphite, [0,-.36,0]);
  for (const z of [-.19,.2]) box(rack,[1.38,.07,.065], rubber,[0,-.27,z]);
  conveyor(parent, -1.5, .94);
  conveyor(parent, centerZ, 1.6);
  return {
    part: door, carrier: rack, receiver: car,
    source: vector(-1.55,.975,-1.5), mount: vector(.18,.56,.664),
    station: vector(.52,.56,centerZ), pickYaw: -.24, placeYaw: 0,
    gripHeight: 1.01, clearance: 3.18, installOffset: .31,
  };
}

function electronics(parent) {
  conveyor(parent, -1.5, 1.03);
  conveyor(parent, .55, 1.25);
  const tray = group(parent);
  box(tray, [1.21,.085,.78], graphite, [0,-.095,0]);
  const enclosure = group(parent);
  box(enclosure, [1.26,.085,.91], steel, [0,.055,0]);
  for (const z of [-.425,.425]) box(enclosure,[1.26,.235,.06],alloy,[0,.16,z]);
  for (const x of [-.60,.60]) box(enclosure,[.055,.235,.91],alloy,[x,.16,0]);
  for (const x of [-.43,.43]) for (const z of [-.28,.28]) {
    mesh(enclosure,new THREE.CylinderGeometry(.032,.04,.08,12),yellow,x,.125,z);
  }
  const board = group(parent);
  box(board, [1.02,.044,.67], material(0x15634a), [0,0,0]);
  const gold = material(0xc9a34d,.65);
  for (let i = 0; i < 12; i++) box(board,[.016,.006,.095],gold,[-.39+i*.033,.025,.272]);
  for (const x of [-.3,.19]) {
    box(board,[.23,.055,.20],graphite,[x,.05,-.05]);
    for (let i = 0; i < 8; i++) box(board,[.014,.013,.268],steel,[x-.09+i*.025,.03,-.05]);
  }
  for (const x of [-.43,.41]) for (const z of [-.26,.25]) {
    mesh(board,new THREE.CylinderGeometry(.024,.024,.009,16),gold,x,.025,z);
  }
  box(board,[.19,.09,.12],alloy,[.36,.057,-.25]);
  return {
    part:board, carrier:tray, receiver:enclosure, source:vector(-1.5,.70,-1.5),
    mount:vector(0,.188,0), station:vector(.73,.56,.55),
    pickYaw:0, placeYaw:0, gripHeight:.49, clearance:2.85, installOffset:0,
  };
}

function logistics(parent) {
  conveyor(parent, -1.5, 1.05);
  conveyor(parent, .6, 1.66);
  const tote = group(parent);
  const plastic = material(0x32566e,.06,.42);
  box(tote,[1.54,.09,1.37],plastic,[0,.045,0]);
  for (const z of [-.65,.65]) {
    box(tote,[1.54,.40,.07],plastic,[0,.24,z]);
    box(tote,[1.61,.06,.11],steel,[0,.46,z]);
    for (let x = -.65; x <= .66; x += .22) box(tote,[.043,.33,.042],graphite,[x,.24,z*1.065]);
  }
  for (const x of [-.75,.75]) {
    box(tote,[.07,.40,1.37],plastic,[x,.24,0]);
    box(tote,[.11,.06,1.45],steel,[x,.46,0]);
  }
  const parcel = group(parent);
  box(parcel,[.81,.53,.68],material(0xbb8650,.02,.79),[0,0,0]);
  box(parcel,[.12,.008,.69],material(0xd6b48a),[0,.269,0]);
  box(parcel,[.26,.01,.17],alloy,[.21,.271,-.13]);
  for (let i = 0; i < 9; i++) box(parcel,[.007,.011,.10],rubber,[.12+i*.02,.275,-.13]);
  return {
    part:parcel, receiver:tote, source:vector(-1.53,.829,-1.5),
    mount:vector(0,.36,0), station:vector(.68,.56,.6),
    pickYaw:0, placeYaw:.12, gripHeight:.67, clearance:2.98, installOffset:0,
  };
}

const models = { automotive, electronics, palletizing: logistics };
const smooth = value => value * value * (3 - 2 * value);

export class FactoryScene extends IndustrialRobotScene {
  constructor(container) {
    super(container, { application: true });
    this.scene.background.set(0x252a3c);
    this.scene.fog = new THREE.Fog(0x252a3c, 15, 27);
    for (const child of this.scene.children) {
      if (child.isGridHelper) child.visible = false;
      if (child.geometry?.type === "PlaneGeometry") {
        child.material.color.set(0x565e71);
        child.scale.set(2, 2, 1);
      }
      if (child.isHemisphereLight) child.intensity = 1.85;
      if (child.isDirectionalLight && child.castShadow) child.intensity = 3.45;
    }
    const rim = new THREE.DirectionalLight(0xc4cfff, 1.7);
    rim.position.set(-1,5,-7);
    this.scene.add(rim);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    for (const child of this.robot.children) {
      if (child.material?.wireframe) child.visible = false;
    }
    this.robot.position.set(-.85, 0, 2.75);
    this.fingerA.visible = this.fingerB.visible = false;
    box(this.gripper,[.25,.22,.17],graphite,[0,-.27,0]);
    mesh(this.gripper,new THREE.CylinderGeometry(.09,.11,.09,24),rubber,0,-.385,0);
    this.setCameraPreset("overview");
  }

  load(name) {
    if (this.factory) {
      this.scene.remove(this.factory);
      this.factory.traverse(item => item.geometry?.dispose());
    }
    this.factory = group(this.scene);
    this.cell = models[name](this.factory);
    for (const x of [-4.3,-2.15,0,2.15,4.3]) {
      box(this.factory,[.085,1.26,.085],graphite,[x,.63,-2.28]);
      box(this.factory,[.22,.045,.21],steel,[x,.025,-2.28]);
    }
    for (const y of [.31,1.22]) box(this.factory,[8.65,.065,.065],yellow,[0,y,-2.28]);
    for (let i=0; i<42; i++) box(this.factory,[.021,.84,.02],graphite,[-4.2+i*.205,.77,-2.28]);
    const plinth = box(this.factory,[1.5,.08,1.5],graphite,[-.85,.034,2.75]);
    plinth.receiveShadow = true;
    this.name = name;
    this.duration = name === "automotive" ? 8700 : 7800;
    this.renderCycle(0);
  }

  setCameraPreset(name) {
    const shots = {
      overview: [[5.9,5.55,10.65],[.0,1.03,.1]],
      hero: [[5.5,4.5,10.8],[-.35,1.7,.35]],
      robot: [[4.8,3.55,6.4],[-.6,1.9,.36]],
      installation: [[3.7,2.8,5.85],[.8,1.22,.88]],
      top: [[.2,13,.1],[.1,0,0]]
    };
    const [eye, focus] = shots[name] || shots.overview;
    this.controls.minDistance = 3.6;
    this.controls.maxDistance = 24;
    this.camera.position.set(...eye);
    this.controls.target.set(...focus);
    this.controls.update();
  }

  renderCycle(time) {
    const cell = this.cell;
    const auto = this.name === "automotive";
    const fraction = (begin, end) => smooth(THREE.MathUtils.clamp((time-begin)/(end-begin), 0, 1));
    const seat = cell.station.clone().add(cell.mount);
    const align = seat.clone().add(vector(0,0,cell.installOffset));
    const lift = vector(cell.source.x, cell.clearance - cell.gripHeight, cell.source.z);
    const approach = vector(align.x,lift.y,align.z);
    const grip = position => position.clone().add(vector(0,cell.gripHeight,0));
    const home = vector(-2.35, 3.25, -.15);
    const placeEnd = auto ? 6500 : 5600;
    const releaseEnd = placeEnd + 620;
    const depart = fraction(releaseEnd, this.duration) * 3.3;
    const incoming = (1 - fraction(0, 1320)) * -2.55;
    cell.receiver.position.copy(cell.station).add(vector(incoming + depart,0,0));
    if (cell.carrier) {
      cell.carrier.position.copy(cell.source).add(vector(incoming + fraction(3400, 7200)*3,0,0));
    }
    let part = cell.source.clone().add(vector(incoming,0,0));
    let target = home.clone();
    let yaw = cell.pickYaw;
    let operator = 0;
    const pickStart = 1350, pickEnd = 2700, liftEnd = 3400, transferEnd = 4520, alignEnd = 5520;
    const abovePick = grip(cell.source).add(vector(0,.63,0));
    if (time >= pickStart && time < pickEnd) {
      operator = 1;
      target = time < 2050
        ? home.clone().lerp(abovePick,fraction(pickStart,2050))
        : abovePick.lerp(grip(cell.source),fraction(2050,pickEnd));
    } else if (time >= pickEnd && time < placeEnd) {
      operator = time < transferEnd ? 2 : auto && time >= alignEnd ? 4 : 3;
      if (time < liftEnd) part = cell.source.clone().lerp(lift,fraction(pickEnd,liftEnd));
      else if (time < transferEnd) part = lift.clone().lerp(approach,fraction(liftEnd,transferEnd));
      else if (time < alignEnd) part = approach.clone().lerp(align,fraction(transferEnd,alignEnd));
      else part = align.clone().lerp(seat,fraction(alignEnd,placeEnd));
      yaw = THREE.MathUtils.lerp(cell.pickYaw,cell.placeYaw,fraction(liftEnd,transferEnd));
      target = grip(part);
    } else if (time >= placeEnd) {
      operator = 4;
      part = cell.receiver.position.clone().add(cell.mount);
      yaw = cell.placeYaw;
      target = grip(seat).lerp(grip(seat).add(vector(0,.74,auto ? .24 : 0)),fraction(placeEnd,releaseEnd));
    }
    this.setTarget(target, .7);
    this.gripper.rotation.y = yaw - this.baseYaw.rotation.y;
    cell.part.position.copy(part);
    cell.part.rotation.y = yaw;
    return operator;
  }
}
