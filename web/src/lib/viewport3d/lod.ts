// Level-of-detail visibility toggles during orbit.
//
// While the user orbits/pans/zooms, we hide decorative groups and the heavy
// per-element solid groups (cylinders / extruded sections) so camera motion
// stays smooth on large models. The batched wireframe mesh stays visible —
// since Phase 2 it already collapses every element into a single draw call,
// so there is no need to swap it for a parallel proxy during orbit.
//
// Extracted as a pure function so the visibility contract can be asserted
// in unit tests — the inline version lived inside Svelte's onMount closure.

import type * as THREE from 'three';

export type RenderMode3D = 'wireframe' | 'solid' | 'sections';

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
  /** Parent of per-element groups (cylinders / extruded sections + picking).
   *  Hidden during orbit so heavy solid geometry doesn't render. */
  elementsParent: Visible | null;
  /** The shared batched LineSegments2 (ElementsBatched.mesh). Lives directly
   *  in the scene (outside elementsParent) so it renders whether or not
   *  elementsParent is visible. Forced on during orbit to act as the LOD
   *  stand-in for solid/sections modes. */
  elementsBatchedMesh: Visible | null;
  /** Current render mode — needed to restore `elementsBatchedMesh.visible`
   *  to its idle value when orbit ends. */
  renderMode: RenderMode3D;
}

/**
 * Apply the LOD visibility rules. When `on` is true (orbit/pan/zoom is
 * active) hide decorative groups + the per-element solid groups, and force
 * the batched wireframe on; when false restore the idle visibility.
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
  if (g.elementsParent) g.elementsParent.visible = !on;

  if (g.elementsBatchedMesh) {
    g.elementsBatchedMesh.visible = on ? true : g.renderMode === 'wireframe';
  }
}

/** Convenience re-export type for callers that want to pass a real scene. */
export type LowDetailGroupsFor<T extends THREE.Object3D> = {
  [K in keyof LowDetailGroups as K extends 'renderMode' ? never : K]: T | null;
} & { renderMode: RenderMode3D };
