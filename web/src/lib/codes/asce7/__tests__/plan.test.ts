import { describe, it, expect } from 'vitest';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput } from '../../../engine/loads/load-plan';
import { bindRole, defaultRegulations, unsetBinding, type ProjectRegulations } from '../../roles';
import { FAMILY_STACKS } from '../../families/stacks';
import { ADAPTER } from '../inputs';
import { kz } from '../wind';
import { MPH, PSF } from '../refs';
import { PERIOD_PARAMETERS, responseCoefficient } from '../seismic';

function frame(storeys = 3, bay = 6, h = 3.5): LoadModelData {
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

function usRegulations(): ProjectRegulations {
  const reg = defaultRegulations();
  for (const [role, id] of Object.entries(FAMILY_STACKS.us) as Array<[keyof ProjectRegulations, string | null]>) {
    reg[role] = id ? { ...bindRole(role, id), configComplete: true, state: 'applied', appliedAtRevision: 0 } : unsetBinding(role);
  }
  return reg;
}

const V = 115 * MPH;
function input(over: Partial<LoadPlanInput> = {}): LoadPlanInput {
  return {
    regulations: usRegulations(), model: frame(), dead: [{ labelKey: 'a', q: 2 }], occupancyKey: 'offices', tributaryWidth: 3,
    reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true,
    wind: { enabled: true, basicSpeed: 0, exposure: 'B', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: false, roofSlopeDeg: 0, rigid: true, directions: { x: true, y: true } },
    snow: { enabled: true, pg: 0, source: '', terrain: 'C', exposure: 'partial', thermal: 'normal', category: 'II', roofKind: 'mono', slippery: false } as LoadPlanInput['snow'],
    seismic: { enabled: true, coefficient: 0, liveParticipation: null, directions: { x: true, y: true }, vertical: true },
    codeInputs: {
      [ADAPTER.wind]: { V, exposure: 'C' },
      [ADAPTER.snow]: { pg: 30 * PSF },
      [ADAPTER.seismic]: { sds: 1.0, sd1: 0.6, s1: 0.5, tl: 8, systemKey: 'steelSMF', periodKey: 'steelMRF' },
    },
    ...over,
  };
}

describe('a plan generated with the ASCE/SEI 7-22 stack', () => {
  const plan = buildLoadPlan(input());

  it('is ready, with the actions of every role', () => {
    expect(plan.blockedKeys).toEqual([]);
    expect(plan.outcome).toBe('READY');
    const count = (t: string) => plan.cases.filter((c) => c.type === t).length;
    expect(count('D')).toBe(1);
    expect(count('L')).toBe(1);
    expect(count('S')).toBe(1);
    expect(count('W')).toBe(28);
    expect(count('E')).toBe(4);
    expect(plan.generatedBy).toBe('asce7-22-basis');
  });

  it('the live load is Table 4.3-1 offices, 50 psf', () => {
    expect(plan.factors.occupancy.value).toBeCloseTo(50 * PSF, 9);
    const live = plan.distributed.filter((d) => d.caseType === 'L');
    expect(Math.max(...live.map((d) => Math.abs(d.q)))).toBeGreaterThan(0);
  });

  it('qh = 0,613 Kz V² at the roof, and the windward + leeward forces of each level', () => {
    expect(plan.factors.windQh!.value).toBeCloseTo(0.613 * kz(10.5, 'C') * V * V, 6);
    const first = plan.cases.findIndex((c) => c.type === 'W');
    const fx = plan.nodal.filter((n) => n.caseType === 'W' && n.caseIndex === first).reduce((s, n) => s + n.fx, 0);
    expect(fx).toBeGreaterThan(0);
    const qh = plan.factors.windQh!.value;
    const roofBand = (0.85 * 0.85 * 0.8 * qh + 0.85 * 0.85 * 0.5 * qh) / 1000 * 6 * 1.75;
    const top = plan.nodal.filter((n) => n.caseType === 'W' && n.caseIndex === first && plan.levels.find((l) => l.elevation === 10.5)!.nodeIds.includes(n.nodeId));
    expect(top.reduce((s, n) => s + n.fx, 0)).toBeCloseTo(roofBand, 0);
  });

  it('V = Cs·W with W of §12.7.2 (no live load for offices), distributed by §12.8.3', () => {
    const W = plan.factors.seismicWeight!.value;
    const elevated = plan.levels.filter((l) => l.elevation > 0);
    expect(W).toBeCloseTo(elevated.reduce((s, l) => s + l.selfWeightKN + l.superimposedKN, 0), 6);
    const ta = PERIOD_PARAMETERS.steelMRF!.ct * 10.5 ** 0.8;
    const cs = responseCoefficient({ sds: 1, sd1: 0.6, s1: 0.5, r: 8, ie: 1, t: ta, tl: 8 }).cs;
    expect(plan.factors.baseShear!.value).toBeCloseTo(cs * W, 6);
    const ex = plan.cases.findIndex((c) => c.type === 'E');
    const fx = plan.nodal.filter((n) => n.caseType === 'E' && n.caseIndex === ex).reduce((s, n) => s + n.fx, 0);
    expect(fx).toBeCloseTo(cs * W, 6);
  });

  it('combines by §2.3.1 and §2.3.6 with Ev = 0,2·S_DS·D, each combination saying it is ASCE 7-22', () => {
    const labels = plan.combinations.map((c) => c.label);
    for (const want of ['1.4 D', '1.2 D + 1.6 L + 0.3 S', '1.2 D + 1.0 S + 0.5 L', '1.2 D + 1.0 W + 0.5 L + 0.3 S', '0.9 D + 1.0 W', '1.4 D + 1.0 E + 0.5 L + 0.15 S', '0.7 D + 1.0 E']) {
      expect(labels).toContain(want);
    }
    expect(plan.combinations.every((c) => c.origin?.code === 'asce7-22-basis' && c.origin.family === 'aci-aisc')).toBe(true);
  });

  it('pm of §7.3.4 governs the flat roof: 30 psf for Risk Category II', () => {
    const s = plan.cases.find((c) => c.type === 'S')!;
    expect(Number(s.nameParams!.ps)).toBeCloseTo(30 * PSF, 3);
  });

  it('blocks by name when a required value is missing', () => {
    const p = buildLoadPlan(input({ codeInputs: { [ADAPTER.wind]: { exposure: 'C' }, [ADAPTER.snow]: { pg: 1 }, [ADAPTER.seismic]: { sds: 1, sd1: 0.6, tl: 8 } } }));
    expect(p.outcome).toBe('BLOCKED');
    expect(p.blockedKeys.map((m) => m.key)).toContain('loads.asce7.wind.blocked.noSpeed');
  });

  it('100 % + 30 % cases of §12.5.3 when asked', () => {
    const p = buildLoadPlan(input({ codeInputs: { ...input().codeInputs, [ADAPTER.seismic]: { sds: 1.0, sd1: 0.6, s1: 0.5, tl: 8, orthogonal: true, rho: 1.3 } } }));
    const e = p.cases.map((c, i) => [c, i] as const).filter(([c]) => c.type === 'E');
    expect(e).toHaveLength(8);
    const [, i0] = e[0]!;
    const sum = (k: 'fx' | 'fy') => p.nodal.filter((n) => n.caseType === 'E' && n.caseIndex === i0).reduce((s, n) => s + n[k], 0);
    expect(sum('fy') / sum('fx')).toBeCloseTo(0.3, 9);
    expect(sum('fx')).toBeCloseTo(1.3 * p.factors.baseShear!.value, 6);
  });
});
