import * as THREE from 'three';

export const VERTICAL_AXIS = 'z' as const;
export const DEFAULT_WORKING_PLANE = 'XY' as const;
export const UP_VECTOR = new THREE.Vector3(0, 0, 1);
export const TOP_VIEW_UP_VECTOR = new THREE.Vector3(0, 1, 0);

export function setCameraUp(camera: THREE.Camera): void {
  camera.up.copy(UP_VECTOR);
}
