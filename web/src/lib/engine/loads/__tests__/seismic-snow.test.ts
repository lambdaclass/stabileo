/**
 * Snow in the seismic action, INPRES-CIRSOC 103-2018 Parte I.
 *
 * [3.15] weighs each level as Wi = Di + f1·Li + f2·Si and [3.16] combines 1,20 D ± 1,00 E +
 * f1 L + f2 S, f2 from Tabla 3.3: 0,70 for "cubiertas horizontales o que no permitan la evacuación
 * de la nieve", 0,20 otherwise. The plan left the snow out of the levels (a lighter building, a
 * smaller base shear) and combined 0,2 S whatever the roof: both unsafe where the roof keeps its
 * snow. These pin both.
 */
import { describe, it, expect } from 'vitest';
import { buildLoadPlan, snowWeightByLevel, type LoadModelData, type LoadPlanInput } from '../load-plan';
import { bindRole, defaultRegulations, type ProjectRegulations } from '../../../codes/roles';

/** Two columns 5 m high, two rafters to a ridge 2 m higher at mid-span, span 16 m along x. */
function shed(): LoadModelData {
  const nodes = new Map([
    [1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 16, y: 0, z: 0 }],
    [3, { id: 3, x: 0, y: 0, z: 5 }], [4, { id: 4, x: 16, y: 0, z: 5 }], [5, { id: 5, x: 8, y: 0, z: 7 }],
  ]);
  const elements = new Map([
    [1, { id: 1, nodeI: 1, nodeJ: 3, sectionId: 1, materialId: 1 }],
    [2, { id: 2, nodeI: 2, nodeJ: 4, sectionId: 1, materialId: 1 }],
    [3, { id: 3, nodeI: 3, nodeJ: 5, sectionId: 1, materialId: 1 }],
    [4, { id: 4, nodeI: 5, nodeJ: 4, sectionId: 1, materialId: 1 }],
  ]);
  return {
    nodes, elements, sections: new Map([[1, { id: 1, a: 0.005 }]]), materials: new Map([[1, { id: 1, rho: 78.5 }]]),
    loadCases: [{ id: 1, type: 'D', name: 'D' }],
  };
}
const snow = { pg: 1.5, terrain: 'C' as const, exposure: 'partial' as const, thermal: 'normal' as const, category: 'II' as const, roofKind: 'gable' as const, slippery: false };
const regs = (): ProjectRegulations => {
  const reg = defaultRegulations();
  for (const k of Object.keys(reg) as Array<keyof ProjectRegulations>) if (reg[k].adapterId) reg[k] = { ...reg[k], configComplete: true, state: 'applied' };
  reg.seismic = { ...bindRole('seismic', 'inpres103-2018'), configComplete: true, state: 'applied' };
  return reg;
};
const input = (over: Partial<LoadPlanInput> = {}, seismic: Partial<NonNullable<LoadPlanInput['seismic']>> = {}): LoadPlanInput => ({
  regulations: regs(), model: shed(), dead: [{ labelKey: 'a', q: 0.3 }], occupancyKey: 'vivienda',
  tributaryWidth: 5, reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false,
  generateCombinations: true,
  snow: { enabled: true, source: 'site', ...snow },
  seismic: { enabled: true, coefficient: 0.1, liveParticipation: 0.25, directions: { x: true, y: false }, ...seismic },
  ...over,
});

describe('INPRES-CIRSOC 103 [3.15]: the roof snow weighs in the seismic mass', () => {
  it('adds f2 · S to the levels: 0,70 on a roof that keeps its snow (C_s = 1)', () => {
    const withSnow = buildLoadPlan(input());
    const noSnow = buildLoadPlan(input({ snow: undefined }));
    // The 14° non-slippery gable keeps its snow: C_s = 1, p_s = p_f.
    const ps = Number(withSnow.cases.find((c) => c.nameKey === 'snow.case.balanced')!.nameParams!.ps);
    const snowKN = ps * 5 * 16;
    expect(withSnow.factors.seismicWeight!.value - noSnow.factors.seismicWeight!.value).toBeCloseTo(0.7 * snowKN, 6);
    expect(withSnow.factors.baseShear!.value - noSnow.factors.baseShear!.value).toBeCloseTo(0.1 * 0.7 * snowKN, 6);
    expect(withSnow.derivation.some((m) => m.key === 'loadPlan.derivation.seismicSnow')).toBe(true);
  });

  it('takes 0,20 when the project says the roof sheds its snow', () => {
    const shedding = buildLoadPlan(input({}, { snowRetaining: false }));
    const noSnow = buildLoadPlan(input({ snow: undefined }));
    const ps = Number(shedding.cases.find((c) => c.nameKey === 'snow.case.balanced')!.nameParams!.ps);
    expect(shedding.factors.seismicWeight!.value - noSnow.factors.seismicWeight!.value).toBeCloseTo(0.2 * ps * 5 * 16, 6);
  });

  it('measures a case by its vertical resultant on the level nearest each member', () => {
    const m = shed();
    // −2 kN/m along a rafter 8 m in plan, 8,246 m long: 16 kN vertical whatever the frame.
    const w = snowWeightByLevel(m, [{ elementId: 3, caseType: 'S', caseIndex: 0, q: -2 }], [{ nodeId: 5, caseType: 'S', caseIndex: 0, fx: 0, fy: 0, fz: -1 }], 0, [0, 5, 7]);
    expect(w[0]).toBe(0);
    expect(w[1]! + w[2]!).toBeCloseTo(-(-2) * Math.hypot(8, 2) * (8 / Math.hypot(8, 2)) + 1, 9);
  });
});

describe('INPRES-CIRSOC 103 [3.16]: the seismic combination takes f2 S, not 0,2 S', () => {
  it('combination 5 carries 0,7 S on a roof that keeps its snow', () => {
    const p = buildLoadPlan(input());
    const five = p.combinations.filter((c) => c.basic === 5 && c.terms.some((t) => t.symbol === 'S'));
    expect(five.length).toBeGreaterThan(0);
    for (const c of five) expect(c.terms.find((t) => t.symbol === 'S')!.factor).toBe(0.7);
  });

  it('and CIRSOC 101\'s 0,2 S where the roof sheds it', () => {
    const p = buildLoadPlan(input({}, { snowRetaining: false }));
    const five = p.combinations.filter((c) => c.basic === 5 && c.terms.some((t) => t.symbol === 'S'));
    for (const c of five) expect(c.terms.find((t) => t.symbol === 'S')!.factor).toBe(0.2);
  });
});
