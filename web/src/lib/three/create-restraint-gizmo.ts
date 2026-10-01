/**
 * A support that is neither fixed nor pinned, drawn as what it restrains, starting at the node.
 *
 * The older drawing put a bar per restrained translation and a half ring per restrained
 * rotation, all centred 0,2 below the node, so a reader saw three coloured sticks floating
 * under the joint and had to know the colour code to tell what they held. Here each restraint
 * is drawn in the notation of a hand sketch, and every piece touches the node:
 *
 *   translation held      a link from the node along that axis to an anchor plate: the node
 *                         cannot move toward or away from the plate
 *   translation on spring the same link as a coil, to the same plate
 *   rotation held         the axis through the node, with a ring around it stopped by a bar:
 *                         the node cannot turn about that axis
 *   rotation on spring    the axis, with a spiral around it
 *
 * The translations read as the support they make when they make one: all three held is the
 * pinned support's pyramid, Z alone held is the roller free in the plane; only a partial set
 * (one horizontal, or springs) is drawn link by link. A rotation held on a pinned support is then
 * a pinned support with that rotation stopped, not three links that read as three rollers.
 *
 * Gravity's axis (Z) goes down from the node; X and Y go toward −X and −Y, so the anchors sit
 * on the sides a support usually has its ground. Colours are the axis triad's (X red, Y green,
 * Z blue), so the axis is read twice: by direction and by colour.
 *
 * Z-up, like every support gizmo. Geometry and materials come from the caller's shared caches.
 */
import * as THREE from 'three';
import { AXIS_COLORS } from './selection-helpers';

export type Restraints = { tx: boolean; ty: boolean; tz: boolean; rx: boolean; ry: boolean; rz: boolean };
export type SupportSprings = Partial<Record<'kx' | 'ky' | 'kz' | 'krx' | 'kry' | 'krz', number>>;

export interface GizmoResources {
  geo: (key: string, build: () => THREE.BufferGeometry) => THREE.BufferGeometry;
  mat: (color: number, roughness: number) => THREE.Material;
  ground: number;
  /** The pinned support's symbol, and the roller free in the plane, from the support gizmo. */
  pinned: (group: THREE.Group) => void;
  rollerPlane: (group: THREE.Group) => void;
}

const LINK = 0.5;         // link length, node to plate: the fixed block's width
const ROD = 0.024;        // rod radius
const PLATE = 0.26;       // anchor plate side
const RING = 0.16;        // rotation ring radius

type Axis = 'x' | 'y' | 'z';
/** Where each axis's anchor lies from the node. */
const OUT: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(-1, 0, 0), y: new THREE.Vector3(0, -1, 0), z: new THREE.Vector3(0, 0, -1),
};
const DIR: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1),
};
const Y_UP = new THREE.Vector3(0, 1, 0);

/** A cylinder from `a` to `b`. */
function rod(res: GizmoResources, a: THREE.Vector3, b: THREE.Vector3, radius: number, m: THREE.Material): THREE.Mesh {
  const d = new THREE.Vector3().subVectors(b, a);
  const mesh = new THREE.Mesh(res.geo('restraint-rod', () => new THREE.CylinderGeometry(1, 1, 1, 8)), m);
  mesh.scale.set(radius, d.length(), radius);
  mesh.quaternion.setFromUnitVectors(Y_UP, d.clone().normalize());
  mesh.position.copy(a).addScaledVector(d, 0.5);
  return mesh;
}

/** Two unit vectors perpendicular to `axis` and to each other. */
function basis(axis: Axis): [THREE.Vector3, THREE.Vector3] {
  return axis === 'x' ? [DIR.y, DIR.z] : axis === 'y' ? [DIR.z, DIR.x] : [DIR.x, DIR.y];
}

/** A polyline as rods: the coil of a spring, the turns of a spiral. */
function polyline(res: GizmoResources, pts: THREE.Vector3[], radius: number, m: THREE.Material, into: THREE.Group): void {
  for (let i = 1; i < pts.length; i++) into.add(rod(res, pts[i - 1]!, pts[i]!, radius, m));
}

function translation(group: THREE.Group, res: GizmoResources, axis: Axis, spring: boolean): void {
  const m = res.mat(AXIS_COLORS[axis], 0.5);
  const out = OUT[axis];
  const end = out.clone().multiplyScalar(LINK);
  if (spring) {
    // Straight lead, a coil of four turns across the middle, straight lead.
    const [u] = basis(axis);
    const pts = [new THREE.Vector3(0, 0, 0), out.clone().multiplyScalar(LINK * 0.18)];
    const turns = 8, a0 = LINK * 0.18, a1 = LINK * 0.82;
    for (let k = 1; k < turns; k++) {
      const s = a0 + ((a1 - a0) * k) / turns;
      pts.push(out.clone().multiplyScalar(s).addScaledVector(u, (k % 2 ? 1 : -1) * 0.08));
    }
    pts.push(out.clone().multiplyScalar(a1), end.clone());
    polyline(res, pts, ROD * 0.75, m, group);
  } else {
    group.add(rod(res, new THREE.Vector3(0, 0, 0), end, ROD, m));
  }
  // The anchor: a plate square to the link.
  const plate = new THREE.Mesh(res.geo('restraint-plate', () => new THREE.BoxGeometry(PLATE, PLATE, 0.02)), res.mat(res.ground, 0.7));
  plate.quaternion.setFromUnitVectors(DIR.z, out);
  plate.position.copy(end).addScaledVector(out, 0.01);
  group.add(plate);
}

function rotation(group: THREE.Group, res: GizmoResources, axis: Axis, spring: boolean): void {
  const m = res.mat(AXIS_COLORS[axis], 0.5);
  const dir = DIR[axis];
  // The axis itself, through the node.
  group.add(rod(res, dir.clone().multiplyScalar(-0.26), dir.clone().multiplyScalar(0.26), ROD * 0.6, m));
  const [u, v] = basis(axis);
  const at = (r: number, t: number) => u.clone().multiplyScalar(r * Math.cos(t)).addScaledVector(v, r * Math.sin(t));
  const pts: THREE.Vector3[] = [];
  if (spring) {
    // A spiral of one and a half turns, out from the axis.
    for (let k = 0; k <= 36; k++) { const t = (k / 36) * 3 * Math.PI; pts.push(at(0.035 + (RING - 0.035) * (k / 36), t)); }
    polyline(res, pts, ROD * 0.55, m, group);
  } else {
    // Three quarters of a ring, its open end closed by a stop across it.
    for (let k = 0; k <= 24; k++) pts.push(at(RING, (k / 24) * 1.5 * Math.PI));
    polyline(res, pts, ROD * 0.7, m, group);
    const end = at(RING, 1.5 * Math.PI);
    const radial = end.clone().normalize();
    group.add(rod(res, end.clone().addScaledVector(radial, -0.05), end.clone().addScaledVector(radial, 0.05), ROD, m));
  }
}

/** Draw `r` (true = held) with `springs` on the free degrees that have a stiffness. */
export function addRestraintGizmo(group: THREE.Group, res: GizmoResources, r: Restraints, springs: SupportSprings): void {
  const k = (key: keyof SupportSprings) => (springs[key] ?? 0) > 0;
  const horizontalFree = !r.tx && !r.ty && !k('kx') && !k('ky');
  if (r.tx && r.ty && r.tz) {
    res.pinned(group);
  } else if (r.tz && horizontalFree) {
    res.rollerPlane(group);
  } else {
    for (const [axis, held, sk] of [['x', r.tx, 'kx'], ['y', r.ty, 'ky'], ['z', r.tz, 'kz']] as const) {
      if (held) translation(group, res, axis, false);
      else if (k(sk)) translation(group, res, axis, true);
    }
  }
  for (const [axis, held, sk] of [['x', r.rx, 'krx'], ['y', r.ry, 'kry'], ['z', r.rz, 'krz']] as const) {
    if (held) rotation(group, res, axis, false);
    else if (k(sk)) rotation(group, res, axis, true);
  }
  // A small ball on the node: the joint all of the above hold.
  group.add(new THREE.Mesh(res.geo('restraint-joint', () => new THREE.SphereGeometry(0.05, 10, 10)), res.mat(res.ground, 0.5)));
}
