// Create Three.js gizmos for structural supports.
// All gizmos are authored in Z-up convention (camera.up = (0,0,1)):
//   Z = vertical (up), XY = ground plane.
//   Gizmo extends downward from the node in the -Z direction.
//   Three.js ConeGeometry has its axis along Y by default.
//   To point the cone along Z: rotate -π/2 around X.

import * as THREE from 'three';
import { COLORS } from './selection-helpers';

export type SupportGizmoType =
  | 'fixed' | 'fixed3d'
  | 'pinned' | 'pinned3d'
  | 'rollerX' | 'rollerY' | 'rollerZ' | 'rollerXZ' | 'rollerXY' | 'rollerYZ'
  | 'spring' | 'spring3d'
  | 'custom3d';

export interface CreateSupportOpts {
  supportId: number;
  supportType: SupportGizmoType;
  selected?: boolean;
  dofRestraints?: { tx: boolean; ty: boolean; tz: boolean; rx: boolean; ry: boolean; rz: boolean };
}

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
      // Free to slide along X; rollers sit on XZ plane, aligned with X axis
      addRollerGizmo(group, color, 'X');
      break;
    case 'rollerZ':
    case 'rollerY':
      // Free to slide along Y; rollers sit on XY plane, aligned with Y axis
      addRollerGizmo(group, color, 'Y');
      break;
    case 'rollerXY':
      // Restrain Z, free in XY; rollers on XY ground plane
      addRollerGizmo(group, color, 'XY');
      break;
    case 'rollerYZ':
      // Restrain X, free in YZ; rollers aligned along Y axis
      addRollerGizmo(group, color, 'Y');
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

// ─── Helpers ────────────────────────────────────────────────

/** Create a square-base pyramid with vertex at (0,0,0) and base at Z=-height.
 *  Built directly in Z-up coordinates — NO rotations needed.
 *  Vertex = apex = node contact point at Z=0.
 *  Base = 4 corners at Z=-height, radius away from center. */
function createPyramid(radius: number, height: number, color: number): THREE.Mesh {
  const r = radius;
  const h = -height; // base Z position (negative = below node)
  // 4 base corners at 45° diagonals for a square base
  const d = r * Math.SQRT1_2; // r / √2
  const apex = [0, 0, 0];
  const b0 = [ d,  d, h]; // +X +Y
  const b1 = [-d,  d, h]; // -X +Y
  const b2 = [-d, -d, h]; // -X -Y
  const b3 = [ d, -d, h]; // +X -Y

  // 4 triangular faces: apex → base edge → next base edge
  const verts = new Float32Array([
    ...apex, ...b0, ...b1,  // face 0
    ...apex, ...b1, ...b2,  // face 1
    ...apex, ...b2, ...b3,  // face 2
    ...apex, ...b3, ...b0,  // face 3
    // base (2 triangles)
    ...b0, ...b2, ...b1,
    ...b0, ...b3, ...b2,
  ]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  return new THREE.Mesh(geo, mat);
}

/** Ground line cross at a given Z level in the XY plane */
function addGroundCross(group: THREE.Group, z: number = -0.35): void {
  const mat = new THREE.LineBasicMaterial({ color: 0x556677 });
  const half = 0.25;
  group.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-half, 0, z), new THREE.Vector3(half, 0, z)]),
    mat,
  ));
  group.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -half, z), new THREE.Vector3(0, half, z)]),
    mat,
  ));
}

/** Single ground line at a given Z level */
function addGroundLine(group: THREE.Group, z: number = -0.35): void {
  const mat = new THREE.LineBasicMaterial({ color: 0x556677 });
  group.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.25, 0, z), new THREE.Vector3(0.25, 0, z)]),
    mat,
  ));
}

// ─── Support types ──────────────────────────────────────────

/** Fixed support: flat block in XY plane at -Z, with hash lines below */
function addFixedGizmo(group: THREE.Group, color: number): void {
  // Flat block: wide in X and Y, thin in Z
  const geo = new THREE.BoxGeometry(0.5, 0.5, 0.12);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const box = new THREE.Mesh(geo, mat);
  box.position.set(0, 0, -0.06); // half-thickness below node
  group.add(box);

  // Hash lines below the block
  const linesMat = new THREE.LineBasicMaterial({ color: 0x556677 });
  for (let i = -1; i <= 1; i++) {
    // Diagonal hatch in XZ plane
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.25 + i * 0.15, 0, -0.12),
      new THREE.Vector3(-0.1 + i * 0.15, 0, -0.28),
    ]), linesMat));
    // Diagonal hatch in YZ plane
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -0.25 + i * 0.15, -0.12),
      new THREE.Vector3(0, -0.1 + i * 0.15, -0.28),
    ]), linesMat));
  }
}

/** Pinned support: pyramid vertex at node, base below, ground cross at base */
function addPinnedGizmo(group: THREE.Group, color: number): void {
  group.add(createPyramid(0.18, 0.35, color));
  addGroundCross(group, -0.35);
}

/** Roller support: pyramid + spheres below, all extending downward in -Z.
 *  The `rollAxis` param controls which direction the rollers are arranged:
 *  - 'X': 2 rollers along X (rolls in X direction)
 *  - 'Y': 2 rollers along Y (rolls in Y direction)
 *  - 'XY': 4 rollers in XY grid (rolls in any horizontal direction) */
function addRollerGizmo(group: THREE.Group, color: number, rollAxis: 'X' | 'Y' | 'XY'): void {
  // Pyramid
  group.add(createPyramid(0.16, 0.3, color));

  // Roller spheres below pyramid base
  const sphereGeo = new THREE.SphereGeometry(0.04, 8, 8);
  const sphereMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
  const baseZ = -0.34;
  const s = 0.1;

  let positions: [number, number, number][];
  if (rollAxis === 'X') {
    positions = [[-s, 0, baseZ], [s, 0, baseZ]];
  } else if (rollAxis === 'Y') {
    positions = [[0, -s, baseZ], [0, s, baseZ]];
  } else {
    positions = [[-s, -s, baseZ], [s, -s, baseZ], [-s, s, baseZ], [s, s, baseZ]];
  }

  for (const [px, py, pz] of positions) {
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.set(px, py, pz);
    group.add(sphere);
  }

  addGroundCross(group, -0.42);
}

/** Spring support: zigzag line extending downward in -Z */
function addSpringGizmo(group: THREE.Group, color: number): void {
  const points: THREE.Vector3[] = [];
  const coils = 4;
  const width = 0.15;
  const height = 0.4;

  points.push(new THREE.Vector3(0, 0, 0));
  for (let i = 0; i < coils; i++) {
    const z0 = -(i / coils) * height - 0.05;
    const z1 = -((i + 0.5) / coils) * height - 0.05;
    const sign = i % 2 === 0 ? 1 : -1;
    points.push(new THREE.Vector3(sign * width, 0, z0));
    points.push(new THREE.Vector3(-sign * width, 0, z1));
  }
  points.push(new THREE.Vector3(0, 0, -height - 0.05));

  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color, linewidth: 2 });
  group.add(new THREE.Line(geo, mat));

  addGroundLine(group, -height - 0.1);
}

/** Custom 3D support: per-DOF restraint indicators */
function addCustom3DGizmo(
  group: THREE.Group,
  _color: number,
  dofRestraints?: { tx: boolean; ty: boolean; tz: boolean; rx: boolean; ry: boolean; rz: boolean },
): void {
  const r = dofRestraints ?? { tx: true, ty: true, tz: true, rx: false, ry: false, rz: false };
  const barLen = 0.25;

  // Translation restraints: cylinders along axes
  const transAxes: [boolean, THREE.Vector3, number][] = [
    [r.tx, new THREE.Vector3(1, 0, 0), 0xff4444],
    [r.ty, new THREE.Vector3(0, 1, 0), 0x44ff44],
    [r.tz, new THREE.Vector3(0, 0, 1), 0x4488ff],
  ];
  for (const [fixed, axis, axisColor] of transAxes) {
    if (!fixed) continue;
    // CylinderGeometry axis is Y. Rotate to align with the target axis.
    const geo = new THREE.CylinderGeometry(0.025, 0.025, barLen, 6);
    const mat = new THREE.MeshStandardMaterial({ color: axisColor, roughness: 0.5 });
    const mesh = new THREE.Mesh(geo, mat);
    if (axis.x > 0) mesh.rotation.z = -Math.PI / 2;       // Y → X
    else if (axis.z > 0) mesh.rotation.x = -Math.PI / 2;   // Y → Z
    // else axis.y: no rotation needed
    mesh.position.set(0, 0, -0.2);
    group.add(mesh);
  }

  // Rotation restraints: torus arcs
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
    const quat = new THREE.Quaternion();
    quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    mesh.quaternion.copy(quat);
    mesh.position.set(0, 0, -0.2);
    group.add(mesh);
  }

  addGroundCross(group, -0.35);
}
