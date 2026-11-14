/**
 * A small frame and each family's stack bound whole, for the tests that run the load plan under
 * every family (`vertical-by-code`, `mixed-occupancies`, `family-isolation`).
 */
import type { LoadModelData, LoadPlanInput } from '../../engine/loads/load-plan';
import { bindRole, defaultRegulations, unsetBinding, type ProjectRegulations, type RegulationRole } from '../roles';
import { FAMILY_STACKS, type LoadFamilyChoice } from '../families/stacks';

/** `storeys` levels of a `bay` × `bay` square of columns and edge beams, `h` apart. */
export function frame(storeys = 3, bay = 6, h = 3): LoadModelData {
  const nodes = new Map<number, { id: number; x: number; y: number; z?: number }>();
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number }>();
  let nid = 1, eid = 1;
  const grid: number[][] = [];
  for (let s = 0; s <= storeys; s++) {
    const lvl: number[] = [];
    for (const [x, y] of [[0, 0], [bay, 0], [bay, bay], [0, bay]]) { nodes.set(nid, { id: nid, x: x!, y: y!, z: s * h }); lvl.push(nid++); }
    grid.push(lvl);
  }
  for (let s = 0; s < storeys; s++) {
    for (let i = 0; i < 4; i++) elements.set(eid, { id: eid++, nodeI: grid[s]![i]!, nodeJ: grid[s + 1]![i]!, sectionId: 1, materialId: 1 });
    for (let i = 0; i < 4; i++) elements.set(eid, { id: eid++, nodeI: grid[s + 1]![i]!, nodeJ: grid[s + 1]![(i + 1) % 4]!, sectionId: 1, materialId: 1 });
  }
  return { nodes, elements, sections: new Map([[1, { id: 1, a: 0.09 }]]), materials: new Map([[1, { id: 1, rho: 25 }]]), loadCases: [] };
}

/** The family's stack, every role applied. */
export function stack(family: LoadFamilyChoice): ProjectRegulations {
  const reg = defaultRegulations();
  for (const [role, id] of Object.entries(FAMILY_STACKS[family]) as Array<[RegulationRole, string | null]>) {
    reg[role] = id ? { ...bindRole(role, id), configComplete: true, state: 'applied', appliedAtRevision: 0 } : unsetBinding(role);
  }
  return reg;
}

/** A floor occupancy of each family's own table. */
export const FLOOR: Readonly<Record<LoadFamilyChoice, string>> = { cirsoc: 'oficina', eurocode: 'ec-B', uk: 'uk-B1', us: 'offices', turkey: 'tr_office' };

export function planInput(family: LoadFamilyChoice, over: Partial<LoadPlanInput> = {}): LoadPlanInput {
  return {
    regulations: stack(family), model: frame(), dead: [{ labelKey: 'a', q: 2 }], occupancyKey: FLOOR[family], tributaryWidth: 3,
    reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, ...over,
  };
}

export const SEISMIC_ON = (vertical: boolean): NonNullable<LoadPlanInput['seismic']> =>
  ({ enabled: true, coefficient: 0, liveParticipation: null, directions: { x: true, y: true }, vertical });
