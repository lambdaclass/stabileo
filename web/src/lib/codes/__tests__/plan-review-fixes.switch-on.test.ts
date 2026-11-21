/**
 * The load generator's code families where the review found them wrong: no direction chosen, a
 * model whose base is not at z = 0, a wind region or a chosen roof, a roof with its own occupancy,
 * a partition weight typed for ASCE 7, and the level masses TBDY reports.
 */
import { describe, expect, it } from 'vitest';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput } from '../../engine/loads/load-plan';
import { bindRole, defaultRegulations, unsetBinding, type ProjectRegulations, type RegulationRole } from '../roles';
import { FAMILY_STACKS } from '../families/stacks';
import { ADAPTER } from '../asce7/inputs';
import { MPH, PSF } from '../asce7/refs';

function frame(dz = 0, storeys = 3, bay = 6, h = 3): LoadModelData {
  const nodes = new Map<number, { id: number; x: number; y: number; z?: number }>();
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number }>();
  let nid = 1, eid = 1;
  const grid: number[][] = [];
  for (let s = 0; s <= storeys; s++) {
    const lvl: number[] = [];
    for (const [x, y] of [[0, 0], [bay, 0], [bay, bay], [0, bay]]) { nodes.set(nid, { id: nid, x: x!, y: y!, z: dz + s * h }); lvl.push(nid++); }
    grid.push(lvl);
  }
  for (let s = 0; s < storeys; s++) {
    for (let i = 0; i < 4; i++) elements.set(eid, { id: eid++, nodeI: grid[s]![i]!, nodeJ: grid[s + 1]![i]!, sectionId: 1, materialId: 1 });
    for (let i = 0; i < 4; i++) elements.set(eid, { id: eid++, nodeI: grid[s + 1]![i]!, nodeJ: grid[s + 1]![(i + 1) % 4]!, sectionId: 1, materialId: 1 });
  }
  return { nodes, elements, sections: new Map([[1, { id: 1, a: 0.09 }]]), materials: new Map([[1, { id: 1, rho: 25 }]]), loadCases: [] };
}

function stack(family: 'eurocode' | 'us' | 'turkey'): ProjectRegulations {
  const reg = defaultRegulations();
  for (const [role, id] of Object.entries(FAMILY_STACKS[family]) as Array<[RegulationRole, string | null]>) {
    reg[role] = id ? { ...bindRole(role, id), configComplete: true, state: 'applied', appliedAtRevision: 0 } : unsetBinding(role);
  }
  return reg;
}

const wind = { enabled: true, basicSpeed: 0, exposure: 'B', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: false, roofSlopeDeg: 0, rigid: true, directions: { x: true, y: true } } as const;
const snow = { enabled: true, pg: 0, source: '', terrain: 'C', exposure: 'partial', thermal: 'normal', category: 'II', roofKind: 'mono', slippery: false } as LoadPlanInput['snow'];
const seismic = (x = true, y = true) => ({ enabled: true, coefficient: 0, liveParticipation: null, directions: { x, y }, vertical: true });
const base = (family: 'eurocode' | 'us' | 'turkey', occupancyKey: string, over: Partial<LoadPlanInput>): LoadPlanInput => ({
  regulations: stack(family), model: frame(), dead: [{ labelKey: 'a', q: 2 }], occupancyKey, tributaryWidth: 3,
  reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, ...over,
});

const keys = (p: ReturnType<typeof buildLoadPlan>) => p.blockedKeys.map((m) => m.key);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('TBDY 2018', () => {
  const tbdy = (over: Partial<LoadPlanInput> = {}) => base('turkey', 'tr_residential', {
    codeInputs: { tbdy2018: { ss: 1.0, s1: 0.3, soil: 'ZC', bks: 3, system: 'A11' } }, seismic: seismic(), ...over,
  });

  it('with no direction chosen, says so instead of failing', () => {
    const p = buildLoadPlan(tbdy({ seismic: seismic(false, false) }));
    expect(keys(p)).toContain('loads.tr.noDirection');
    expect(p.cases.filter((c) => c.type === 'E')).toEqual([]);
  });

  it('reports each level with the mass it weighed, 30 % of the live load', () => {
    const p = buildLoadPlan(tbdy());
    const lv = p.levels.filter((l) => l.elevation > 0);
    for (const l of lv) expect(l.liveParticipatingKN).toBeCloseTo(0.3 * l.liveTotalKN, 9);
    expect(p.factors.seismicWeight!.value).toBeCloseTo(sum(lv.map((l) => l.weightKN)), 6);
  });
});

describe('ASCE 7-22', () => {
  const us = (over: Partial<LoadPlanInput> = {}, seismicInput: Record<string, unknown> = {}, windInput: Record<string, unknown> = {}) => base('us', 'offices', {
    wind, snow, seismic: seismic(),
    codeInputs: {
      [ADAPTER.wind]: { V: 115 * MPH, exposure: 'C', ...windInput },
      [ADAPTER.snow]: { pg: 30 * PSF },
      [ADAPTER.seismic]: { sds: 1.0, sd1: 0.6, s1: 0.5, tl: 8, systemKey: 'steelSMF', periodKey: 'steelMRF', ...seismicInput },
    },
    ...over,
  });

  it('measures heights from the model\'s base: lifted 10 m, the same base shear and the same wind pressure', () => {
    const low = buildLoadPlan(us()), high = buildLoadPlan(us({ model: frame(10) }));
    expect(high.factors.baseShear!.value).toBeCloseTo(low.factors.baseShear!.value, 6);
    expect(high.factors.windQh!.value).toBeCloseTo(low.factors.windQh!.value, 6);
  });

  it('with no seismic direction, or no wind direction, blocks the action instead of looking done', () => {
    expect(keys(buildLoadPlan(us({}, { directions: { x: false, y: false } })))).toContain('loads.tr.noDirection');
    const w = buildLoadPlan(us({}, {}, { directions: [] }));
    expect(keys(w)).toContain('loads.tr.noDirection');
    expect(w.factors.windQh).toBeUndefined();
  });

  it('a partition weight typed here goes into W even without the floors\' partition allowance', () => {
    const without = buildLoadPlan(us()).factors.seismicWeight!.value;
    const typed = buildLoadPlan(us({}, { partitionKNm2: 0.6 })).factors.seismicWeight!.value;
    expect(typed).toBeGreaterThan(without);
  });
});

describe('Eurocode', () => {
  const ec = (over: Partial<LoadPlanInput> = {}) => base('eurocode', 'ec-A-floor', {
    codeInputs: {
      'en1991-1-4': { vb0: 26, terrain: 'III', directions: { x: true, y: false } },
      'en1991-1-3': { sk: 1.0 },
      'en1998-1': { agR: 0.25, groundType: 'C', q: 3.9, periodSystem: 'concreteMrf', directions: { x: true, y: true } },
    },
    wind, snow, seismic: seismic(),
    ...over,
  });

  it('wind measures heights from the model\'s base and loads only the region chosen', () => {
    const low = buildLoadPlan(ec()), high = buildLoadPlan(ec({ model: frame(10) }));
    const force = (p: ReturnType<typeof buildLoadPlan>) => sum(p.nodal.filter((n) => n.caseType === 'W').map((n) => Math.abs(n.fx)));
    expect(high.factors.windQh!.value).toBeCloseTo(low.factors.windQh!.value, 6);
    expect(force(high)).toBeCloseTo(force(low), 6);
    const region = [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15];
    const r = buildLoadPlan(ec({ wind: { ...wind, region } }));
    const loaded = r.nodal.filter((n) => n.caseType === 'W');
    expect(loaded.length).toBeGreaterThan(0);
    expect(loaded.every((n) => region.includes(n.nodeId))).toBe(true);
  });

  it('snow goes only on the roof members chosen', () => {
    const roof = [21, 22];
    const p = buildLoadPlan(ec({ snow: { ...snow!, roof } }));
    const s = p.distributed.filter((d) => d.caseType === 'S');
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((d) => roof.includes(d.elementId))).toBe(true);
  });

  it('a roof with its own occupancy brings that occupancy\'s ψ to the top level\'s mass', () => {
    const p = buildLoadPlan(ec({ roof: { use: 'occupancy', occupancyKey: 'ec-C3', dead: 1, slopeDeg: 0 } }));
    const top = p.levels.reduce((a, b) => (b.elevation > a.elevation ? b : a));
    expect(top.liveTotalKN).toBeGreaterThan(0);
    expect(top.liveParticipatingKN / top.liveTotalKN).toBeCloseTo(0.6, 9);
  });
});
