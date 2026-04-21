// Level-of-detail visibility toggles during orbit.
//
// While the user orbits/pans/zooms, we hide decorative groups and swap the
// per-element meshes for a single batched LineSegments2 proxy so camera
// interaction stays smooth on large models. On interaction end the original
// meshes come back.
//
// Extracted as a pure function so the visibility contract can be asserted
// in unit tests — the inline version lived inside Svelte's onMount closure.

import type * as THREE from 'three';

/** Object-like shape — matches both THREE.Object3D and mock {visible} objects. */
export interface Visible {
  visible: boolean;
}

export interface LowDetailGroups {
  nodesParent: Visible | null;
  supportsParent: Visible | null;
  loadsParent: Visible | null;
  resultsParent: Visible | null;
  shellsParent: Visible | null;
  elementsParent: Visible | null;
  elementsProxy: Visible | null;
}

/**
 * Apply the LOD visibility rules. When `on` is true (orbit/pan/zoom is
 * active) hide decorative groups and swap per-element meshes for the batched
 * proxy; when false restore the normal view.
 *
 * `resultsParent` is intentionally *not* toggled — users expect diagrams,
 * deformed shapes, and reaction arrows to stay visible while they orbit, so
 * hiding them broke the feedback loop of "move the camera to inspect a
 * result."
 */
export function applyLowDetail(on: boolean, g: LowDetailGroups): void {
  if (g.nodesParent) g.nodesParent.visible = !on;
  if (g.supportsParent) g.supportsParent.visible = !on;
  if (g.loadsParent) g.loadsParent.visible = !on;
  if (g.shellsParent) g.shellsParent.visible = !on;

  if (on) {
    if (g.elementsParent) g.elementsParent.visible = false;
    if (g.elementsProxy) g.elementsProxy.visible = true;
  } else {
    if (g.elementsParent) g.elementsParent.visible = true;
    if (g.elementsProxy) g.elementsProxy.visible = false;
  }
}

/** Convenience re-export type for callers that want to pass a real scene. */
export type LowDetailGroupsFor<T extends THREE.Object3D> = {
  [K in keyof LowDetailGroups]: T | null;
};
