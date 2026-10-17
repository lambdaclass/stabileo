/**
 * The §2.1.5 minimum-wind note names its direction.
 *
 * The minimum can govern the same level in X and in Y. Those are two findings; the note used to
 * carry only the level, so both read identically, and the auto-loads dialog's keyed list threw
 * `each_key_duplicate` on them (the whole PRO tab died with it).
 */
import { describe, it, expect } from 'vitest';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput } from '../load-plan';
import { defaultRegulations, type ProjectRegulations } from '../../../codes/roles';
import { messageIdentity } from '../../../codes/message';

function box(): LoadModelData {
  const nodes = new Map<number, { id: number; x: number; y: number; z?: number }>();
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number }>();
  const pts: Array<[number, number]> = [[0, 0], [6, 0], [6, 6], [0, 6]];
  pts.forEach(([x, y], i) => { nodes.set(i + 1, { id: i + 1, x, y, z: 0 }); nodes.set(i + 5, { id: i + 5, x, y, z: 3 }); });
  let id = 1;
  for (let i = 1; i <= 4; i++) elements.set(id, { id: id++, nodeI: i, nodeJ: i + 4, sectionId: 1, materialId: 1 });
  for (let i = 5; i <= 8; i++) elements.set(id, { id: id++, nodeI: i, nodeJ: i === 8 ? 5 : i + 1, sectionId: 1, materialId: 1 });
  return { nodes, elements, sections: new Map([[1, { id: 1, a: 0.09 }]]), materials: new Map([[1, { id: 1, rho: 25 }]]), loadCases: [] };
}
const regs = (): ProjectRegulations => {
  const r = defaultRegulations();
  for (const k of Object.keys(r) as Array<keyof ProjectRegulations>) if (r[k].adapterId) r[k] = { ...r[k], configComplete: true, state: 'applied' };
  return r;
};
// A low speed, so the computed pressures fall under §2.1.5's minimum in both directions.
const input = (): LoadPlanInput => ({
  regulations: regs(), model: box(), dead: [{ labelKey: 'a', q: 1 }], occupancyKey: 'vivienda', tributaryWidth: 3,
  reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true,
  combinationSet: 'both',
  wind: {
    enabled: true, basicSpeed: 20, exposure: 'B', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true,
    roofSlopeDeg: 0, rigid: true, directions: { x: true, y: true }, caseSet: 'case1', bothSenses: false,
  },
});

describe('§2.1.5 minimum wind note', () => {
  it('is raised once per direction, and the two are distinguishable', () => {
    const p = buildLoadPlan(input());
    const notes = p.unsupportedKeys.filter((m) => m.key === 'loadPlan.note.windMinimumGoverns');
    expect(notes.map((m) => m.params?.dir).sort()).toEqual(['X', 'Y']);
    expect(notes.every((m) => m.params?.level === 3)).toBe(true);
    expect(new Set(notes.map(messageIdentity)).size).toBe(notes.length);
  });
});
