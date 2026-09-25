/**
 * Service wind Wa (CIRSOC 102-2025 B.4.2): the 50-year speed converted by Figura C AB.4.2-1,
 * cases of their own, and only in the service combinations.
 */
import { describe, it, expect } from 'vitest';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput } from '../load-plan';
import { defaultRegulations, type ProjectRegulations } from '../../../codes/roles';
import { SERVICE_WIND_FACTOR } from '../../../codes/cirsoc102/wind';
import { generateServiceCombinations } from '../../../codes/cirsoc101/service-combinations';

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
const input = (service?: { enabled: boolean; v50: number; mri: 10 }): LoadPlanInput => ({
  regulations: regs(), model: box(), dead: [{ labelKey: 'a', q: 1 }], occupancyKey: 'vivienda', tributaryWidth: 3,
  reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true,
  combinationSet: 'both',
  wind: {
    enabled: true, basicSpeed: 70, exposure: 'B', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true,
    roofSlopeDeg: 0, rigid: true, directions: { x: true, y: false }, caseSet: 'case1', bothSenses: false, service,
  },
});

describe('service wind Wa', () => {
  it('converts the 50-year speed by the figure’s factor, and gets cases of its own', () => {
    const p = buildLoadPlan(input({ enabled: true, v50: 40, mri: 10 }));
    const wa = p.cases.filter((c) => c.type === 'Wa');
    expect(wa.length).toBeGreaterThan(0);
    expect(wa.every((c) => Number(c.nameParams?.v) === +(40 * SERVICE_WIND_FACTOR[10]).toFixed(1))).toBe(true);
    // The same geometry at a lower speed: the force goes with the square of the speed (at 70 m/s
    // the pressures govern W over §2.1.5's minimum, which Wa does not carry).
    const force = (type: string) => p.nodal.filter((n) => n.caseType === type && n.caseIndex === p.cases.findIndex((c) => c.type === type)).reduce((s, n) => s + n.fx, 0);
    expect(force('Wa') / force('W')).toBeCloseTo(((40 * 0.84) / 70) ** 2, 6);
  });

  it('enters D + Wa and D + 0,5 L + Wa, and no strength combination', () => {
    const p = buildLoadPlan(input({ enabled: true, v50: 40, mri: 10 }));
    const withWa = p.combinations.filter((c) => c.terms.some((t) => t.symbol === 'Wa'));
    expect(withWa.map((c) => c.label).sort()).toEqual(['1.0 D + 0.5 L + 1.0 Wa', '1.0 D + 1.0 Wa']);
    expect(withWa.every((c) => c.purpose === 'service')).toBe(true);
    // Without Wa cases, B.4.2's two Wa combinations are not generated.
    expect(generateServiceCombinations({ present: { L: true, Lr: false, S: false, R: false, W: true, E: false, F: false, H: false } })
      .some((c) => c.terms.some((t) => t.symbol === 'Wa'))).toBe(false);
  });
});
