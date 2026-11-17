/**
 * What a click in the 3-D workspace resolved to.
 *
 * ── Why this is a module and not a closure in the viewport ─────────
 *
 * Three rules decide the answer, none of them obvious, and all three were previously buried
 * inside a Svelte component where they could not be exercised without a WebGL context:
 *
 *   1. Conflict markers are asked FIRST and on their own.
 *   2. Among the bar/concrete hits, the first BAR wins over any concrete in front of it.
 *   3. Concrete answers only when no bar was under the cursor at all.
 *
 * Each of them exists because of something that went wrong, and each is stated where it is
 * decided. Pure apart from the ray it is handed, so the ordering is testable directly.
 */

import type * as THREE from 'three';
import type { RebarScene } from './rebar-scene';
import type { SceneConflictMarker, SceneModel } from '../engine/detailing/scene-model';

/** What the viewport reports upwards when the user clicks. */
export interface ScenePick {
  barId?: string;
  solidId?: string;
  /**
   * The conflict marker that was clicked, when one was.
   *
   * Carried whole rather than as an index: the marker slot a raycast reports is a slot in a
   * COMPACTED instance buffer, so it means nothing outside the render that produced it.
   * `conflictAt` resolves it here, once, and everything downstream receives the conflict.
   */
  conflict?: SceneConflictMarker;
  elementIds: number[];
}

/**
 * Resolve one ray against a built scene.
 *
 * Returns null when the ray hit nothing the user can select — which is a real answer and is
 * what clears the selection, not an error.
 */
export function resolvePick(
  built: RebarScene, scene: SceneModel, ray: THREE.Raycaster,
): ScenePick | null {
  /**
   * Conflict markers first, and on their own.
   *
   * A marker is something the app PUT there to be clicked — it says "look at this" — so a
   * click inside one means the conflict, not whatever steel is behind it. Raycast separately
   * rather than merged into `pickable()`: markers sit inside the cage at exactly the places
   * where bars are densest, and letting them compete by distance would take clicks away from
   * every bar around them.
   */
  for (const hit of ray.intersectObjects(built.pickableConflicts(), false)) {
    const slot = hit.instanceId;
    if (slot === undefined || slot === null) continue;
    const conflict = built.conflictAt(slot);
    if (conflict) return { conflict, elementIds: [...conflict.elementIds] };
  }

  /**
   * Then bars, then concrete — and NOT simply the nearest hit.
   *
   * Concrete is translucent and encloses the steel, so the nearest surface under the cursor is
   * almost always concrete; taking it would make bars unselectable everywhere except at the
   * ends where they poke out. The hits are sorted by distance, so the first BAR is preferred
   * and concrete answers only when no bar was under the cursor at all.
   *
   * That ordering is also what makes a member with no steel selectable: nothing else is there
   * to win, and those are precisely the members the user most needs to interrogate.
   */
  const hits = ray.intersectObjects(built.pickable(), false);

  for (const hit of hits) {
    // `faceIndex` is nullable on a non-indexed or point geometry; the picking maps treat
    // absent as "nothing here" rather than as face zero.
    const barId = built.barIdAt(hit.object, hit.faceIndex ?? undefined);
    if (barId) {
      const bar = scene.bars.find((b) => b.barId === barId);
      return { barId, elementIds: bar?.elementIds ?? [] };
    }
  }
  for (const hit of hits) {
    const solidId = built.solidIdAt(hit.object, hit.faceIndex ?? undefined);
    if (solidId) {
      const solid = scene.solids.find((s) => s.id === solidId);
      return { solidId, elementIds: solid?.elementIds ?? [] };
    }
  }
  return null;
}
