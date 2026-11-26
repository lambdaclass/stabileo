import * as THREE from 'three';
import { toneObject } from './category-tone';

/** How far under the plan's cut its own level is still drawn: the beams and slab the cut sits over. */
export const PLAN_DEPTH_M = 0.3;

export type PlanCut = { cutZ: number; below: 'hidden' | 'ghost' };

const box = new THREE.Box3();
let census = { hidden: 0, ghost: 0 };

/** How many objects the last pass hid or toned, for the tests. */
export const planCutCensus = (): { hidden: number; ghost: number } => ({ ...census });

export const planFloorZ = (cut: PlanCut | null): number | null => (cut ? cut.cutZ - PLAN_DEPTH_M : null);

/** What lies wholly under the plan's level: hidden, or in halftone. Runs after the category tones. */
export function toneBelowPlanCut(parents: ReadonlyArray<THREE.Object3D | null | undefined>, cut: PlanCut | null): void {
  const floor = planFloorZ(cut);
  census = { hidden: 0, ghost: 0 };
  for (const p of parents) {
    if (!p) continue;
    for (const o of p.children) {
      if (o.userData.planHidden) { o.visible = true; delete o.userData.planHidden; }
      if (floor === null || o instanceof THREE.InstancedMesh || o instanceof THREE.Points) continue;
      box.setFromObject(o);
      if (box.isEmpty() || box.max.z >= floor) continue;
      if (cut!.below === 'hidden') {
        if (o.visible) { o.visible = false; o.userData.planHidden = true; census.hidden++; }
      } else { toneObject(o, 'halftone'); census.ghost++; }
    }
  }
}
