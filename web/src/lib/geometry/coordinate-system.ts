import * as THREE from 'three';

export type AnalysisAxis = 'x' | 'y' | 'z';
export type VerticalAxis = 'z';
export type WorkingPlane3D = 'XY' | 'XZ' | 'YZ';
export type CoordinateNode = { x: number; y: number; z?: number };

export const VERTICAL_AXIS: VerticalAxis = 'z';
export const DEFAULT_WORKING_PLANE: WorkingPlane3D = 'XY';
export const HORIZONTAL_PLANE: WorkingPlane3D = 'XY';
export const UP_VECTOR = new THREE.Vector3(0, 0, 1);
export const GRAVITY_VECTOR_3D = new THREE.Vector3(0, 0, -1);
export const TOP_VIEW_UP_VECTOR = new THREE.Vector3(0, 1, 0);

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
