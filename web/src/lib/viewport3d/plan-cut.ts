import * as THREE from 'three';
import { toneObject } from './category-tone';
import { modelStore } from '../store/model.svelte';

/** How far under the working level the plan still draws: the beams hanging under it, a slab's thickness. */
export const PLAN_BELOW_LEVEL_M = 0.15;

export type PlanCut = { floorZ: number; below: 'hidden' | 'ghost' };

export const planFloorFor = (levelZ: number): number => levelZ - PLAN_BELOW_LEVEL_M;

const box = new THREE.Box3();
let census = { hidden: 0, ghost: 0 };
let pickFloor: number | null = null;

/** How many objects the last pass hid or toned, for the tests. */
export const planCutCensus = (): { hidden: number; ghost: number } => ({ ...census });

/** Puts back what the last pass hid. Runs before the category tones, so they have the last word. */
export function clearPlanCut(parents: ReadonlyArray<THREE.Object3D | null | undefined>): void {
  for (const p of parents) for (const o of p?.children ?? []) {
    if (o.userData.planHidden) { o.visible = true; delete o.userData.planHidden; }
  }
}

/** What lies wholly under the plan's level: hidden, or in halftone. Runs after the category tones. */
export function toneBelowPlanCut(parents: ReadonlyArray<THREE.Object3D | null | undefined>, cut: PlanCut | null): void {
  census = { hidden: 0, ghost: 0 };
  pickFloor = cut?.below === 'hidden' ? cut.floorZ : null;
  if (!cut) return;
  for (const p of parents) {
    if (!p) continue;
    for (const o of p.children) {
      if (!o.visible || o instanceof THREE.InstancedMesh || o instanceof THREE.Points) continue;
      box.setFromObject(o);
      if (box.isEmpty() || box.max.z >= cut.floorZ) continue;
      if (cut.below === 'hidden') { o.visible = false; o.userData.planHidden = true; census.hidden++; }
      else { toneObject(o, 'halftone'); census.ghost++; }
    }
  }
}

const nodeZ = (id: number) => modelStore.nodes.get(id)?.z ?? 0;

/** Whether a picked node, member or shell lies wholly under the plan's level while it is hidden there. */
export function underPlanFloor(hit: { type: string; id: number } | null): boolean {
  if (pickFloor === null || !hit) return false;
  let nodes: readonly number[] = [];
  if (hit.type === 'node') nodes = [hit.id];
  else if (hit.type === 'element') { const e = modelStore.elements.get(hit.id); nodes = e ? [e.nodeI, e.nodeJ] : []; }
  else if (hit.type === 'plate') nodes = modelStore.plates.get(hit.id)?.nodes ?? [];
  else if (hit.type === 'quad') nodes = modelStore.quads.get(hit.id)?.nodes ?? [];
  return nodes.length > 0 && Math.max(...nodes.map(nodeZ)) < pickFloor;
}
