import * as THREE from 'three';
import { toneObject } from './category-tone';
import { modelStore } from '../store/model.svelte';

/** How far under the lowest level its plan still draws: the foundation beams hanging under it, a slab's thickness. */
export const PLAN_BELOW_LEVEL_M = 0.15;
/** Over this height above the floor, a slab belongs to the storey's ceiling: drawn in halftone, so the storey shows through it. */
export const PLAN_OVERHEAD_M = 0.15;

/**
 * The plan of a storey, from its level to the next one: its columns and walls, and the beams and
 * slabs of its ceiling. What sits on its floor belongs to the storey below, except on the lowest
 * level, which has none.
 */
export type PlanCut = { floorZ: number; nodeFloorZ: number; overheadZ: number | null; below: 'hidden' | 'ghost' };

export function planCutFor(levelZ: number, o: { lowest: boolean; ceiling: boolean; below: 'hidden' | 'ghost' }): PlanCut {
  return {
    floorZ: o.lowest ? levelZ - PLAN_BELOW_LEVEL_M : levelZ + 1e-3,
    nodeFloorZ: levelZ - 1e-3,
    overheadZ: o.ceiling ? levelZ + PLAN_OVERHEAD_M : null,
    below: o.below,
  };
}

/** Where the clipping plane goes for a cut at `cutZ`: a hair over it, since a plane through the level's own grid and drawing clips them in flickering dashes. */
export const planClipZ = (cutZ: number): number => cutZ + 1e-3;

const box = new THREE.Box3();
let census = { hidden: 0, ghost: 0, overhead: 0 };
let pick: { floorZ: number; nodeFloorZ: number } | null = null;

/** How many objects the last pass hid or toned, for the tests. */
export const planCutCensus = (): { hidden: number; ghost: number; overhead: number } => ({ ...census });

const nodeZ = (id: number) => modelStore.nodes.get(id)?.z ?? 0;

function nodesOf(hit: { type: string; id: number }): readonly number[] {
  if (hit.type === 'node') return [hit.id];
  if (hit.type === 'element') { const e = modelStore.elements.get(hit.id); return e ? [e.nodeI, e.nodeJ] : []; }
  if (hit.type === 'plate') return modelStore.plates.get(hit.id)?.nodes ?? [];
  if (hit.type === 'quad') return modelStore.quads.get(hit.id)?.nodes ?? [];
  return [];
}

/** The lowest and highest z of what an object draws, read from its nodes when it has them: a section's depth does not move a beam to another level. */
function span(o: THREE.Object3D): { min: number; max: number } | null {
  const u = o.userData as { type?: string; id?: number };
  const ids = typeof u.type === 'string' && typeof u.id === 'number' ? nodesOf({ type: u.type, id: u.id }) : [];
  if (ids.length) { const zs = ids.map(nodeZ); return { min: Math.min(...zs), max: Math.max(...zs) }; }
  box.setFromObject(o);
  return box.isEmpty() ? null : { min: box.min.z, max: box.max.z };
}

/** Puts back what the last pass hid. Runs before the category tones, so they have the last word. */
export function clearPlanCut(parents: ReadonlyArray<THREE.Object3D | null | undefined>): void {
  for (const p of parents) for (const o of p?.children ?? []) {
    if (o.userData.planHidden) { o.visible = true; delete o.userData.planHidden; }
  }
}

/**
 * What lies under the storey: hidden, or in halftone; and the slabs of its ceiling in halftone. Runs
 * after the category tones. `slabs` are the parents whose children are slabs.
 */
export function toneBelowPlanCut(parents: ReadonlyArray<THREE.Object3D | null | undefined>, cut: PlanCut | null, slabs: ReadonlyArray<THREE.Object3D | null | undefined> = []): void {
  census = { hidden: 0, ghost: 0, overhead: 0 };
  pick = cut?.below === 'hidden' ? { floorZ: cut.floorZ, nodeFloorZ: cut.nodeFloorZ } : null;
  if (!cut) return;
  for (const p of parents) {
    if (!p) continue;
    const isSlab = slabs.includes(p);
    for (const o of p.children) {
      if (!o.visible || o instanceof THREE.InstancedMesh || o instanceof THREE.Points) continue;
      const s = span(o);
      if (!s) continue;
      if (s.max < cut.floorZ) {
        if (cut.below === 'hidden') { o.visible = false; o.userData.planHidden = true; census.hidden++; }
        else { toneObject(o, 'halftone'); census.ghost++; }
      } else if (isSlab && cut.overheadZ !== null && s.min > cut.overheadZ) {
        toneObject(o, 'halftone'); census.overhead++;
      }
    }
  }
}

/** Whether a picked node, member or shell lies under the storey while it is hidden there. */
export function underPlanFloor(hit: { type: string; id: number } | null): boolean {
  if (pick === null || !hit) return false;
  const nodes = nodesOf(hit);
  const floor = hit.type === 'node' ? pick.nodeFloorZ : pick.floorZ;
  return nodes.length > 0 && Math.max(...nodes.map(nodeZ)) < floor;
}
