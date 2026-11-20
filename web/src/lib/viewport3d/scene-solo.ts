import type * as THREE from 'three';

const kept = (o: THREE.Object3D) => !o.visible || o.userData.solo === true || (o as THREE.Light).isLight === true || (o as THREE.Camera).isCamera === true;

/** Hand the result to `showAgain` before the frame ends: the hiding belongs to the frame, never to the scene. */
export function hideAllBut(scene: THREE.Object3D): THREE.Object3D[] {
  const hidden = scene.children.filter((o) => !kept(o));
  for (const o of hidden) o.visible = false;
  return hidden;
}

export function showAgain(hidden: readonly THREE.Object3D[]): void {
  for (const o of hidden) o.visible = true;
}
