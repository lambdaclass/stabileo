/**
 * The load plan with the Eurocode and the UK stacks bound: the cases and combinations it writes for
 * a three-storey 6 × 6 m frame, 3 m storeys, flat roof.
 */
import { describe, expect, it } from 'vitest';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput } from '../../../engine/loads/load-plan';
import { bindRole, defaultRegulations, unsetBinding, type ProjectRegulations, type RegulationRole } from '../../roles';
import { FAMILY_STACKS } from '../../families/stacks';
import { designSpectrum, SPECTRUM } from '../seismic';

function frame(storeys = 3, bay = 6, h = 3): LoadModelData {
  const nodes = new Map<number, { id: number; x: number; y: number; z?: number }>();
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number }>();
  let nid = 1, eid = 1;
  const grid: number[][] = [];
  for (let s = 0; s <= storeys; s++) {
    const lvl: number[] = [];
    for (const [x, y] of [[0, 0], [bay, 0], [bay, bay], [0, bay]]) { nodes.set(nid, { id: nid, x: x!, y: y!, z: s * h }); lvl.push(nid); nid++; }
    grid.push(lvl);
  }
  for (let s = 0; s < storeys; s++) {
    for (let i = 0; i < 4; i++) elements.set(eid, { id: eid++, nodeI: grid[s]![i]!, nodeJ: grid[s + 1]![i]!, sectionId: 1, materialId: 1 });
    for (let i = 0; i < 4; i++) elements.set(eid, { id: eid++, nodeI: grid[s + 1]![i]!, nodeJ: grid[s + 1]![(i + 1) % 4]!, sectionId: 1, materialId: 1 });
  }
  return { nodes, elements, sections: new Map([[1, { id: 1, a: 0.09 }]]), materials: new Map([[1, { id: 1, rho: 25 }]]), loadCases: [] };
}

function stack(family: 'eurocode' | 'uk'): ProjectRegulations {
  const reg = defaultRegulations();
  for (const [role, id] of Object.entries(FAMILY_STACKS[family]) as Array<[RegulationRole, string | null]>) {
    reg[role] = id ? { ...bindRole(role, id), configComplete: true, state: 'applied' } : unsetBinding(role);
  }
  return reg;
}

const cirsocWind = { basicSpeed: 45, exposure: 'B', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: false, roofSlopeDeg: 0, rigid: true, directions: { x: true, y: true } } as const;

function input(family: 'eurocode' | 'uk', over: Partial<LoadPlanInput> = {}): LoadPlanInput {
  return {
    regulations: stack(family), model: frame(), dead: [{ labelKey: 'a', q: 2 }],
    occupancyKey: family === 'uk' ? 'uk-B1' : 'ec-B', tributaryWidth: 3,
    reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, ...over,
  };
}

describe('Eurocode stack end to end', () => {
  const p = buildLoadPlan(input('eurocode', {
    combinationSet: 'both',
    codeInputs: {
      'en1991-1-4': { vb0: 26, terrain: 'III', directions: { x: true, y: false } },
      'en1991-1-3': { sk: 1.0 },
      'en1998-1': { agR: 0.25, groundType: 'C', q: 3.9, periodSystem: 'concreteMrf', directions: { x: true, y: true } },
    },
    wind: { ...cirsocWind, enabled: true },
    snow: { enabled: true, pg: 0, source: '', terrain: 'B', exposure: 'partial', thermal: 'normal', category: 'II', roofKind: 'gable', slippery: false },
    seismic: { enabled: true, coefficient: 0, liveParticipation: null, directions: { x: true, y: true } },
  }));

  it('is ready, from EN 1990', () => {
    expect(p.blockedKeys).toEqual([]);
    expect(p.outcome).toBe('READY');
    expect(p.generatedBy).toBe('en1990');
  });

  it('writes the cases: G, Q, wind ±X, snow, and eight seismic cases (±e, ±0,30 of the other direction)', () => {
    expect(p.cases.filter((c) => c.type === 'W').map((c) => c.nameParams?.dir)).toEqual(['+X', '−X']);
    expect(p.cases.filter((c) => c.type === 'S').map((c) => c.nameKey)).toEqual(['loads.ec.snowCase.i']);
    expect(p.cases.filter((c) => c.type === 'E')).toHaveLength(8);
    expect(p.cases.find((c) => c.type === 'D')?.category).toBe('permanent');
    expect(p.cases.find((c) => c.type === 'W')?.category).toBe('wind');
  });

  it('snow on the flat roof is μ1·sk = 0,8 kN/m² over the 3 m width', () => {
    const s = p.distributed.filter((d) => d.caseType === 'S');
    expect(s.length).toBe(4);
    for (const d of s) { expect(d.q).toBeCloseTo(-2.4, 9); expect(d.frame).toBe('projected'); }
  });

  it('the seismic base shear is Sd(T1)·W·λ over the masses with ψE = φ·ψ2', () => {
    const W = p.factors.seismicWeight!.value;
    const T1 = 0.075 * 9 ** 0.75;
    const Fb = designSpectrum(T1, 0.25, SPECTRUM[1].C, 3.9) * W * 0.85;
    expect(p.factors.baseShear!.value).toBeCloseTo(Fb, 6);
    const top = p.levels[p.levels.length - 1]!, mid = p.levels[1]!;
    expect(top.liveParticipatingKN).toBeCloseTo(0.3 * top.liveTotalKN, 9);
    expect(mid.liveParticipatingKN).toBeCloseTo(0.8 * 0.3 * mid.liveTotalKN, 9);
    const ex = p.cases.findIndex((c) => c.type === 'E');
    const fx = p.nodal.filter((n) => n.caseType === 'E' && n.caseIndex === ex).reduce((s, n) => s + n.fx, 0);
    const fy = p.nodal.filter((n) => n.caseType === 'E' && n.caseIndex === ex).reduce((s, n) => s + n.fy, 0);
    expect(fx).toBeCloseTo(Fb, 6);
    expect(Math.abs(fy)).toBeCloseTo(0.3 * Fb, 6);
    expect(p.assumptions.some((a) => a.key === 'loadPlan.assumption.liveParticipation')).toBe(false);
  });

  it('the wind on each level is the net D − E pressure times the front, cs·cd = 1', () => {
    const w = p.cases.findIndex((c) => c.type === 'W');
    const total = p.nodal.filter((n) => n.caseType === 'W' && n.caseIndex === w).reduce((s, n) => s + n.fx, 0);
    expect(total).toBeGreaterThan(0);
    expect(p.factors.windQh!.value).toBeGreaterThan(0);
  });

  it('writes 6.10a, 6.10b, 6.12b and the service sets, each saying it is EN 1990', () => {
    const ids = p.combinations.map((c) => c.id);
    expect(ids.some((i) => i.startsWith('6.10a'))).toBe(true);
    expect(ids.some((i) => i.startsWith('6.10b-W'))).toBe(true);
    expect(ids.some((i) => i.startsWith('6.12b'))).toBe(true);
    expect(ids.some((i) => i.startsWith('6.16b'))).toBe(true);
    expect(p.combinations.find((c) => c.label === '1.0 D + 1.0 E + 0.3 L')).toBeDefined();
    for (const c of p.combinations) expect(c.origin).toMatchObject({ code: 'en1990', family: 'eurocode', rule: c.id });
    const lead = p.combinations.find((c) => c.id.startsWith('6.10b-L') && c.terms.length === 4);
    expect(lead?.terms).toEqual([{ symbol: 'D', factor: 1.1475 }, { symbol: 'L', factor: 1.5 }, { symbol: 'S', factor: 0.75 }, { symbol: 'W', factor: 0.9 }]);
  });

  it('blocks by name when a required value is missing', () => {
    const b = buildLoadPlan(input('eurocode', { wind: { ...cirsocWind, enabled: true }, codeInputs: { 'en1991-1-4': { terrain: 'II' } } }));
    expect(b.outcome).toBe('BLOCKED');
    expect(b.blockedKeys.map((m) => m.key)).toContain('loads.ec.blocked.windSpeed');
  });
});

describe('UK stack end to end', () => {
  it('UK combinations and the snow from zone and altitude', () => {
    const p = buildLoadPlan(input('uk', {
      codeInputs: { 'en1991-1-3-uk': { zone: 3, altitude: 205 } },
      snow: { enabled: true, pg: 0, source: '', terrain: 'B', exposure: 'partial', thermal: 'normal', category: 'II', roofKind: 'gable', slippery: false },
    }));
    expect(p.outcome).toBe('READY');
    const s = p.distributed.filter((d) => d.caseType === 'S');
    expect(s[0]!.q).toBeCloseTo(-0.8 * 0.7 * 3, 9);
    const lead = p.combinations.find((c) => c.id.startsWith('6.10b-L') && c.terms.length === 3);
    expect(lead?.terms).toEqual([{ symbol: 'D', factor: 1.24875 }, { symbol: 'L', factor: 1.5 }, { symbol: 'S', factor: 0.75 }]);
    expect(p.combinations.every((c) => c.origin?.code === 'en1990-uk')).toBe(true);
  });

  it('the UK wind takes vb,map·calt', () => {
    const p = buildLoadPlan(input('uk', {
      codeInputs: { 'en1991-1-4-uk': { vbMap: 22, altitude: 150, terrain: 'II' } },
      wind: { ...cirsocWind, enabled: true },
    }));
    expect(p.outcome).toBe('READY');
    expect(p.derivation.some((d) => d.key === 'loads.ec.wind.ukBasic' && d.params?.vb0 === 25.3)).toBe(true);
    expect(p.cases.filter((c) => c.type === 'W')).toHaveLength(4);
  });
});
