import * as THREE from 'three';

export const PLAN_CUT_M = 0.15;

/** The two planes a level's plan is drawn between: a cut over the level and one over the level below. */
export function planClipPlanes(levelZ: number, belowZ: number): [THREE.Plane, THREE.Plane] {
  const upper = new THREE.Plane(new THREE.Vector3(0, 0, -1), levelZ + PLAN_CUT_M);
  const lower = new THREE.Plane(new THREE.Vector3(0, 0, 1), Number.isFinite(belowZ) ? -(belowZ + PLAN_CUT_M) : 1e9);
  return [upper, lower];
}

/** Whether a point is drawn under `planes`: the renderer clips what is on the negative side of any of them. */
export const insideClip = (planes: readonly THREE.Plane[]) => (p: THREE.Vector3): boolean => planes.every((pl) => pl.distanceToPoint(p) >= 0);
