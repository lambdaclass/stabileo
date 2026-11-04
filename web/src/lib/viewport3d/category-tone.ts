import type * as THREE from 'three';
import { HALFTONE_OPACITY, type CategoryState } from '../store/view-categories.svelte';

type Tone = { opacity: number; transparent: boolean; depthWrite: boolean };

/** Draw a category's objects as its state says: as they are, in halftone, or not at all. */
export function toneObject(root: THREE.Object3D | null | undefined, state: CategoryState): void {
  if (!root) return;
  root.visible = state !== 'hidden';
  if (state === 'hidden') return;
  const half = state === 'halftone';
  root.traverse((o) => {
    if (o.userData?.pickingHelper) return;
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) tone(mat, half);
  });
}

function tone(mat: THREE.Material, half: boolean): void {
  const saved = mat.userData.halftone as Tone | undefined;
  if (half) {
    if (saved) return;
    mat.userData.halftone = { opacity: mat.opacity, transparent: mat.transparent, depthWrite: mat.depthWrite } satisfies Tone;
    mat.transparent = true;
    mat.opacity = mat.opacity * HALFTONE_OPACITY;
    mat.depthWrite = false;
    mat.needsUpdate = true;
  } else if (saved) {
    mat.opacity = saved.opacity;
    mat.transparent = saved.transparent;
    mat.depthWrite = saved.depthWrite;
    delete mat.userData.halftone;
    mat.needsUpdate = true;
  }
}
