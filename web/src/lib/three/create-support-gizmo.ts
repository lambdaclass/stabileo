// Create Three.js gizmos for structural supports
import * as THREE from 'three';
import { COLORS } from './selection-helpers';

export type SupportGizmoType =
  | 'fixed' | 'fixed3d'
  | 'pinned' | 'pinned3d'
  | 'rollerX' | 'rollerY' | 'rollerXZ' | 'rollerXY' | 'rollerYZ'
  | 'spring' | 'spring3d'
  | 'custom3d';

export interface CreateSupportOpts {
  supportId: number;
  supportType: SupportGizmoType;
  selected?: boolean;
  dofRestraints?: { tx: boolean; ty: boolean; tz: boolean; rx: boolean; ry: boolean; rz: boolean };
}

/**
 * Create a visual gizmo for a support at the given position.
 * The gizmo sits below the node in the -Y direction.
 */
export function createSupportGizmo(
  pos: { x: number; y: number; z: number },
  opts: CreateSupportOpts,
): THREE.Group {
  const group = new THREE.Group();
  group.userData = { type: 'support', id: opts.supportId };
  group.position.set(pos.x, pos.y, pos.z);

  const color = opts.selected ? COLORS.elementSelected : COLORS.support;

  switch (opts.supportType) {
    case 'fixed':
    case 'fixed3d':
      addFixedGizmo(group, color);
      break;
    case 'pinned':
    case 'pinned3d':
      addPinnedGizmo(group, color);
      break;
    case 'rollerX':
    case 'rollerXZ':
      addRollerGizmo(group, color, false);
      break;
    case 'rollerY':
      addRollerGizmo(group, color, true);
      break;
    case 'rollerXY':
      // Free in XY, restrain Z — roller oriented along Z axis
      addRollerGizmo(group, color, false);
      group.rotation.x = Math.PI / 2;
      break;
    case 'rollerYZ':
      // Free in YZ, restrain X — roller oriented along X axis
      addRollerGizmo(group, color, false);
      group.rotation.z = -Math.PI / 2;
      break;
    case 'spring':
    case 'spring3d':
      addSpringGizmo(group, color);
      break;
    case 'custom3d':
      addCustom3DGizmo(group, color, opts.dofRestraints);
      break;
    default:
      addPinnedGizmo(group, color);
  }

  return group;
}

/** Fixed support (empotrado): solid block with hash lines in both directions */
function addFixedGizmo(group: THREE.Group, color: number): void {
  const geo = new THREE.BoxGeometry(0.5, 0.15, 0.5);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const box = new THREE.Mesh(geo, mat);
  box.position.set(0, -0.075, 0);
  group.add(box);

  // Hash lines below block (in both X and Z directions for 3D)
  const linesMat = new THREE.LineBasicMaterial({ color: 0x556677 });
  for (let i = -1; i <= 1; i++) {
    // Hash along X direction
    const ptsX = [
      new THREE.Vector3(-0.25 + i * 0.15, -0.15, 0),
      new THREE.Vector3(-0.1 + i * 0.15, -0.3, 0),
    ];
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ptsX), linesMat));
    // Hash along Z direction
    const ptsZ = [
      new THREE.Vector3(0, -0.15, -0.25 + i * 0.15),
      new THREE.Vector3(0, -0.3, -0.1 + i * 0.15),
    ];
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ptsZ), linesMat));
  }
}

/** Pinned support (apoyo fijo): square-base pyramid, vertex touching the node */
function addPinnedGizmo(group: THREE.Group, color: number): void {
  // ConeGeometry with 4 radial segments = square-base pyramid
  // Default: vertex at +height/2, base at -height/2
  const geo = new THREE.ConeGeometry(0.18, 0.35, 4);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  const cone = new THREE.Mesh(geo, mat);
  // Rotate 45° around Y so square base edges align with world X and Z axes
  cone.rotation.y = Math.PI / 4;
  // Center at -height/2 so vertex (at +0.175 from center) lands at y=0 (node)
  // and base (at -0.175 from center) lands at y=-0.35
  cone.position.set(0, -0.175, 0);
  group.add(cone);

  // Ground cross (X + Z lines)
  addGroundCross(group);
}

/** Roller support (apoyo móvil): inverted pyramid + 4 small spheres as wheels */
function addRollerGizmo(group: THREE.Group, color: number, vertical: boolean): void {
  // Pyramid (same as pinned but slightly smaller)
  // Default: vertex at +0.15, base at -0.15
  const coneGeo = new THREE.ConeGeometry(0.16, 0.3, 4);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  const cone = new THREE.Mesh(coneGeo, mat);
  cone.rotation.y = Math.PI / 4;
  // Center at -0.15 so vertex at y=0 (node), base at y=-0.3
  cone.position.set(0, -0.15, 0);
  group.add(cone);

  // 4 small spheres (wheels) below the pyramid base
  const sphereGeo = new THREE.SphereGeometry(0.04, 8, 8);
  const sphereMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
  const baseY = -0.34; // just below pyramid base
  const spread = 0.1;  // distance from center to each wheel
  const wheelPositions: [number, number, number][] = [
    [-spread, baseY, -spread],
    [ spread, baseY, -spread],
    [-spread, baseY,  spread],
    [ spread, baseY,  spread],
  ];
  for (const [wx, wy, wz] of wheelPositions) {
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.set(wx, wy, wz);
    group.add(sphere);
  }

  // Ground cross below wheels
  addGroundCross(group, -0.42);

  if (vertical) {
    // Rotate entire gizmo 90° around Z for vertical roller
    group.rotation.z = -Math.PI / 2;
  }
}

/** Spring support: zigzag line */
function addSpringGizmo(group: THREE.Group, color: number): void {
  const points: THREE.Vector3[] = [];
  const coils = 4;
  const width = 0.15;
  const height = 0.4;

  points.push(new THREE.Vector3(0, 0, 0));
  for (let i = 0; i < coils; i++) {
    const y0 = -(i / coils) * height - 0.05;
    const y1 = -((i + 0.5) / coils) * height - 0.05;
    const sign = i % 2 === 0 ? 1 : -1;
    points.push(new THREE.Vector3(sign * width, y0, 0));
    points.push(new THREE.Vector3(-sign * width, y1, 0));
  }
  points.push(new THREE.Vector3(0, -height - 0.05, 0));

  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color, linewidth: 2 });
  group.add(new THREE.Line(geo, mat));

  addGroundLine(group, -height - 0.1);
}

/** Ground cross (X + Z lines) below support — used by pinned and roller */
function addGroundCross(group: THREE.Group, y: number = -0.35): void {
  const lineMat = new THREE.LineBasicMaterial({ color: 0x556677 });
  // Line along X
  const ptsX = [
    new THREE.Vector3(-0.25, y, 0),
    new THREE.Vector3(0.25, y, 0),
  ];
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ptsX), lineMat));
  // Line along Z
  const ptsZ = [
    new THREE.Vector3(0, y, -0.25),
    new THREE.Vector3(0, y, 0.25),
  ];
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ptsZ), lineMat));
}

/** Custom 3D support: shows per-DOF indicators.
 *  Restrained translations → short bars along axis
 *  Restrained rotations → small arcs around axis
 */
function addCustom3DGizmo(
  group: THREE.Group,
  color: number,
  dofRestraints?: { tx: boolean; ty: boolean; tz: boolean; rx: boolean; ry: boolean; rz: boolean },
): void {
  const r = dofRestraints ?? { tx: true, ty: true, tz: true, rx: false, ry: false, rz: false };
  const barLen = 0.25;
  const barMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  const arcMat = new THREE.MeshBasicMaterial({ color: 0xffaa44 });

  // Translation restraints: short cylinders along axes
  const transAxes: [boolean, THREE.Vector3, number][] = [
    [r.tx, new THREE.Vector3(1, 0, 0), 0xff4444],
    [r.ty, new THREE.Vector3(0, 1, 0), 0x44ff44],
    [r.tz, new THREE.Vector3(0, 0, 1), 0x4488ff],
  ];
  for (const [fixed, axis, axisColor] of transAxes) {
    if (!fixed) continue;
    const geo = new THREE.CylinderGeometry(0.025, 0.025, barLen, 6);
    const mat = new THREE.MeshStandardMaterial({ color: axisColor, roughness: 0.5 });
    const mesh = new THREE.Mesh(geo, mat);
    // Rotate cylinder to align with axis
    if (axis.x > 0) mesh.rotation.z = -Math.PI / 2;
    else if (axis.z > 0) mesh.rotation.x = Math.PI / 2;
    // Position below node
    mesh.position.set(0, -0.2, 0);
    group.add(mesh);
  }

  // Rotation restraints: small torus arcs around axes
  const rotAxes: [boolean, THREE.Vector3, number][] = [
    [r.rx, new THREE.Vector3(1, 0, 0), 0xff8844],
    [r.ry, new THREE.Vector3(0, 1, 0), 0x88ff44],
    [r.rz, new THREE.Vector3(0, 0, 1), 0x4488ff],
  ];
  for (const [fixed, axis, axisColor] of rotAxes) {
    if (!fixed) continue;
    const torus = new THREE.TorusGeometry(0.12, 0.015, 6, 12, Math.PI);
    const mat = new THREE.MeshBasicMaterial({ color: axisColor });
    const mesh = new THREE.Mesh(torus, mat);
    // Orient arc perpendicular to the rotation axis
    const quat = new THREE.Quaternion();
    quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    mesh.quaternion.copy(quat);
    mesh.position.set(0, -0.2, 0);
    group.add(mesh);
  }

  // Ground cross
  addGroundCross(group, -0.35);
}

/** Horizontal ground line below support — used by spring */
function addGroundLine(group: THREE.Group, y: number = -0.35): void {
  const pts = [
    new THREE.Vector3(-0.25, y, 0),
    new THREE.Vector3(0.25, y, 0),
  ];
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: 0x556677 });
  group.add(new THREE.Line(geo, mat));
}
