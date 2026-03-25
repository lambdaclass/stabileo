import * as THREE from 'three';

export type AnalysisAxis = 'x' | 'y' | 'z';
export type VerticalAxis = 'z';
export type WorkingPlane3D = 'XY' | 'XZ' | 'YZ';
export type CoordinateNode = { x: number; y: number; z?: number };
export type ScenePoint = { x: number; y: number; z: number };
export type TypedSupportLike = { type: string };
export type TypedLoadLike = { type: string };

export const VERTICAL_AXIS: VerticalAxis = 'z';
export const DEFAULT_WORKING_PLANE: WorkingPlane3D = 'XY';
export const HORIZONTAL_PLANE: WorkingPlane3D = 'XY';
export const UP_VECTOR = new THREE.Vector3(0, 0, 1);
export const GRAVITY_VECTOR_3D = new THREE.Vector3(0, 0, -1);
export const TOP_VIEW_UP_VECTOR = new THREE.Vector3(0, 1, 0);
export const TWO_D_HORIZONTAL_AXIS_LABEL = 'X';
export const TWO_D_VERTICAL_AXIS_LABEL = 'Z';
export const TWO_D_DISPLACEMENT_LABELS = {
  horizontal: 'ux',
  vertical: 'uz',
  rotation: 'θy',
} as const;
export const TWO_D_REACTION_LABELS = {
  horizontal: 'Rx',
  vertical: 'Rz',
  moment: 'My',
} as const;
export const TWO_D_NODAL_LOAD_LABELS = {
  horizontal: 'Fx',
  vertical: 'Fz',
  moment: 'My',
} as const;

const THREE_D_SUPPORT_TYPES = new Set([
  'fixed3d',
  'pinned3d',
  'rollerXZ',
  'rollerXY',
  'rollerYZ',
  'spring3d',
  'custom3d',
]);

const THREE_D_LOAD_TYPES = new Set([
  'nodal3d',
  'distributed3d',
  'pointOnElement3d',
  'surface3d',
  'thermalQuad3d',
]);

export function setCameraUp(camera: THREE.Camera): void {
  camera.up.copy(UP_VECTOR);
}

export function hasElevation(node: CoordinateNode): boolean {
  return node.z !== undefined;
}

export function getElevation(node: CoordinateNode): number {
  return node.z ?? 0;
}

export function setElevation<T extends CoordinateNode>(node: T, elevation: number): T {
  return { ...node, z: elevation };
}

export function getPlanDepth(node: CoordinateNode): number {
  return node.y;
}

export function get2DDisplayedVertical(node: Pick<CoordinateNode, 'y'>): number {
  return node.y;
}

export function set2DDisplayedVertical<T extends Pick<CoordinateNode, 'y'>>(node: T, vertical: number): T {
  return { ...node, y: vertical };
}

export function get2DDisplayDisplacementVertical<T extends { uz?: number; uy?: number }>(disp: T): number {
  return disp.uz ?? disp.uy ?? 0;
}

export function get2DDisplayRotation<T extends { ry?: number; rz?: number }>(disp: T): number {
  return disp.ry ?? disp.rz ?? 0;
}

export function hasInvalid2DDisplacements(
  displacements: Array<{ ux: number; uz?: number; uy?: number; ry?: number; rz?: number }>,
): boolean {
  return displacements.some(d =>
    !isFinite(d.ux) ||
    !isFinite(get2DDisplayDisplacementVertical(d)) ||
    !isFinite(get2DDisplayRotation(d)),
  );
}

export function hasInvalid3DDisplacements(
  displacements: Array<{ ux: number; uy: number; uz: number }>,
): boolean {
  return displacements.some(d => !isFinite(d.ux) || !isFinite(d.uy) || !isFinite(d.uz));
}

export function get2DDisplayReactionVertical<T extends { rz?: number; ry?: number }>(reaction: T): number {
  return reaction.rz ?? reaction.ry ?? 0;
}

export function get2DDisplayMoment<T extends { my?: number; mz?: number }>(reaction: T): number {
  return reaction.my ?? reaction.mz ?? 0;
}

export function get2DDisplayNodalLoadVertical<T extends { fz?: number; fy?: number }>(load: T): number {
  return load.fz ?? load.fy ?? 0;
}

export function get2DDisplayNodalLoadMoment<T extends { my?: number; mz?: number }>(load: T): number {
  return load.my ?? load.mz ?? 0;
}

export function isHorizontalPlane(plane: WorkingPlane3D): boolean {
  return plane === HORIZONTAL_PLANE;
}

export function planeLevelAxis(plane: WorkingPlane3D): AnalysisAxis {
  switch (plane) {
    case 'XY': return 'z';
    case 'XZ': return 'y';
    case 'YZ': return 'x';
  }
}

export function planeNormal(plane: WorkingPlane3D): THREE.Vector3 {
  switch (plane) {
    case 'XY': return new THREE.Vector3(0, 0, 1);
    case 'XZ': return new THREE.Vector3(0, 1, 0);
    case 'YZ': return new THREE.Vector3(1, 0, 0);
  }
}

export function setPlaneOffset(target: THREE.Object3D, plane: WorkingPlane3D, level: number): void {
  target.position.set(0, 0, 0);
  target.rotation.set(0, 0, 0);
  if (plane === 'XY') {
    target.rotation.x = Math.PI / 2;
    target.position.z = level;
  } else if (plane === 'XZ') {
    target.position.y = level;
  } else {
    target.rotation.z = Math.PI / 2;
    target.position.x = level;
  }
}

export function projectNodeToScene(node: CoordinateNode, project2DToXZ = false): ScenePoint {
  if (project2DToXZ) {
    return { x: node.x, y: 0, z: node.y };
  }
  return { x: node.x, y: node.y, z: node.z ?? 0 };
}

export function toSceneVector(point: ScenePoint): THREE.Vector3 {
  return new THREE.Vector3(point.x, point.y, point.z);
}


export function shouldProjectModelToXZ(params: {
  nodes: Iterable<CoordinateNode>;
  supports?: Iterable<TypedSupportLike>;
  loads?: Iterable<TypedLoadLike>;
  plateCount?: number;
  quadCount?: number;
  analysisMode?: string;
}): boolean {
  // PRO mode always uses direct 3D coordinates — never project to XZ
  if (params.analysisMode === 'pro') return false;
  if ((params.plateCount ?? 0) > 0 || (params.quadCount ?? 0) > 0) return false;

  let hasNodes = false;
  for (const node of params.nodes) {
    hasNodes = true;
    if (Math.abs(node.z ?? 0) > 1e-9) return false;
  }
  if (!hasNodes) return false;

  if (params.supports) {
    for (const support of params.supports) {
      if (THREE_D_SUPPORT_TYPES.has(support.type)) return false;
    }
  }

  if (params.loads) {
    for (const load of params.loads) {
      if (THREE_D_LOAD_TYPES.has(load.type)) return false;
    }
  }

  return true;
}
