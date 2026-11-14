/**
 * The Turkish stack through the load generator: a 4-storey frame, 6 × 5 m in plan, 3 m storeys,
 * in Istanbul-like conditions (SS = 1,0, S1 = 0,3, ZC: SDS = 1,2, SD1 = 0,45, DTS 1, BYS 6, A11).
 * TpA = 0,1·12^0,75 = 0,6447 s > TB = 0,375 s, so Ra = 8 and SaR = 0,45 / 0,6447 / 8.
 */
import { describe, it, expect } from 'vitest';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput } from '../../../engine/loads/load-plan';
import { bindRole, defaultRegulations, unsetBinding, type ProjectRegulations } from '../../roles';
import { FAMILY_STACKS } from '../../families/stacks';
import { storeyWind, C_GENERAL } from '../ts498-wind';

function frame(): LoadModelData {
  const nodes = new Map<number, { id: number; x: number; y: number; z?: number }>();
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number }>();
  const corners = [[0, 0], [6, 0], [6, 5], [0, 5]] as const;
  let el = 1;
  for (let k = 0; k <= 4; k++) corners.forEach(([x, y], c) => nodes.set(k * 4 + c + 1, { id: k * 4 + c + 1, x, y, z: 3 * k }));
  for (let k = 1; k <= 4; k++) {
    for (let c = 0; c < 4; c++) {
      elements.set(el, { id: el++, nodeI: (k - 1) * 4 + c + 1, nodeJ: k * 4 + c + 1, sectionId: 1, materialId: 1 });
      elements.set(el, { id: el++, nodeI: k * 4 + c + 1, nodeJ: k * 4 + ((c + 1) % 4) + 1, sectionId: 1, materialId: 1 });
    }
  }
  return { nodes, elements, sections: new Map([[1, { id: 1, a: 0.09 }]]), materials: new Map([[1, { id: 1, rho: 25 }]]), loadCases: [] };
}

function regulations(): ProjectRegulations {
  const reg = defaultRegulations();
  for (const [role, id] of Object.entries(FAMILY_STACKS.turkey) as Array<[keyof ProjectRegulations, string | null]>) {
    reg[role] = id ? { ...bindRole(role, id), configComplete: true, state: 'applied' } : unsetBinding(role);
  }
  return reg;
}

const input = (): LoadPlanInput => ({
  regulations: regulations(), model: frame(), dead: [{ labelKey: 'a', q: 2 }], occupancyKey: 'tr_residential', tributaryWidth: 3,
  reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true,
  codeInputs: {
    tbdy2018: { ss: 1.0, s1: 0.3, soil: 'ZC', bks: 3, system: 'A11' },
    'ts498-1997-snow': { zone: 'II', altitudeM: 900 },
  },
  wind: {
    enabled: true, basicSpeed: 28, exposure: 'B', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: false,
    roofSlopeDeg: 0, rigid: true, directions: { x: true, y: true },
  },
  snow: { enabled: true, pg: 0, source: 'site', terrain: 'C', exposure: 'partial', thermal: 'normal', category: 'II', roofKind: 'gable', slippery: false },
  seismic: { enabled: true, coefficient: 0, liveParticipation: null, directions: { x: true, y: true }, vertical: true },
});

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('the Turkish stack, end to end', () => {
  const plan = buildLoadPlan(input());

  it('is ready, with only Turkish clauses for the seismic action', () => {
    expect(plan.blockedKeys).toEqual([]);
    expect(plan.outcome).toBe('READY');
    expect(plan.refs.some((r) => String(r.regulation).startsWith('inpres'))).toBe(false);
    expect(plan.refs.some((r) => String(r.regulation) === 'tbdy' && r.clause === 'Tablo 4.1')).toBe(true);
  });

  it('four wind cases, each the storeys of Çizelge 5 on the 5 m or 6 m front', () => {
    const w = plan.cases.map((c, i) => ({ c, i })).filter(({ c }) => c.type === 'W');
    expect(w.map(({ c }) => c.nameParams?.dir)).toEqual(['+X', '−X', '+Y', '−Y']);
    const levels = [0, 3, 6, 9, 12].map((z) => ({ elevation: z, nodeIds: [] }));
    const fx = sum(storeyWind(levels, 0, C_GENERAL, 5).map((s) => s.force));
    const fy = sum(storeyWind(levels, 0, C_GENERAL, 6).map((s) => s.force));
    expect(fx).toBeCloseTo(1.2 * (0.5 * (8 - 1.5) + 0.8 * (12 - 8)) * 5, 9);
    expect(sum(plan.nodal.filter((n) => n.caseIndex === w[0]!.i).map((n) => n.fx))).toBeCloseTo(fx, 9);
    expect(sum(plan.nodal.filter((n) => n.caseIndex === w[3]!.i).map((n) => n.fy))).toBeCloseTo(-fy, 9);
  });

  it('snow Pk = 0,95 kN/m² (zone II, 900 m) over the roof beams by width', () => {
    const s = plan.cases.findIndex((c) => c.type === 'S');
    const loads = plan.distributed.filter((d) => d.caseType === 'S' && d.caseIndex === s);
    expect(loads).toHaveLength(4);
    expect(loads.every((d) => d.frame === 'projected' && Math.abs(d.q + 0.95 * 3) < 1e-9)).toBe(true);
  });

  it('VtE = W·SaR(TpA) on each axis, with 30 % of live load and 30 % of the roof snow in W', () => {
    const tpa = 0.1 * 12 ** 0.75;
    const sar = 0.45 / tpa / 8;
    const lv = plan.levels.filter((l) => l.elevation > 0);
    const W = sum(lv.map((l) => l.selfWeightKN + l.superimposedKN + 0.3 * l.liveTotalKN)) + 0.3 * 0.95 * 3 * 22;
    expect(plan.factors.seismicWeight!.value).toBeCloseTo(W, 6);
    expect(plan.factors.baseShear!.value).toBeCloseTo(W * sar, 6);
    const e = plan.cases.map((c, i) => ({ c, i })).filter(({ c }) => c.type === 'E');
    expect(e).toHaveLength(8);
    const first = plan.nodal.filter((n) => n.caseIndex === e[0]!.i);
    expect(sum(first.map((n) => n.fx))).toBeCloseTo(W * sar, 6);
    expect(sum(first.map((n) => n.fy))).toBeCloseTo(0.3 * W * sar, 6);
    expect(e[0]!.c.nameParams).toEqual({ dir: 'X', ortho: ' + 0.3 Y', ecc: ' (+e)' });
  });

  it('the combinations of TS 500 and TBDY, with the vertical effect 0,3·(2/3)·SDS·G', () => {
    const l = plan.combinations.map((c) => c.label);
    expect(l).toContain('1.4 D + 1.6 L + 1.6 S');
    expect(l).toContain('1.0 D + 1.3 L + 1.3 S + 0.65 W');
    expect(l).toContain('0.9 D + 1.3 W');
    expect(l).toContain('1.24 D + 1.0 L + 0.2 S + 1.0 E');
    expect(l).toContain('0.66 D + 1.0 E');
    expect(plan.combinations.every((c) => c.origin?.code === 'ts500-2000-basis' && c.origin.family === 'turkey')).toBe(true);
    expect(plan.cases.find((c) => c.type === 'E')?.category).toBe('seismic');
  });

  it('blocks by name without the spectral coefficients', () => {
    const i = input();
    const p = buildLoadPlan({ ...i, codeInputs: { ...i.codeInputs, tbdy2018: { soil: 'ZC' } } });
    expect(p.outcome).toBe('BLOCKED');
    expect(p.blockedKeys.map((m) => m.key)).toEqual(['loads.tr.seismic.blocked.spectrum']);
  });
});
