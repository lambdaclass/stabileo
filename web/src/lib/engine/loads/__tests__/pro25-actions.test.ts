/**
 * The generator's wind on a pressure profile and on a part of the model, the snow on a chosen roof,
 * the mass's own weights, and the pushover's lateral pattern and target.
 */
import { describe, it, expect } from 'vitest';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput } from '../load-plan';
import { profileMean } from '../load-plan-wind';
import { defaultRegulations, type ProjectRegulations } from '../../../codes/roles';
import { massWeightLoads, WEIGHT_CASE } from '../../dynamics/mass-weights';
import { lateralPatternLoads, upToTarget } from '../../pushover-pattern';
import type { SolverInput3D } from '../../types-3d';

/** A tower 20 × 10 m in plan, `storeys` of 3 m. */
function tower(storeys = 4, bx = 20, by = 10): LoadModelData {
  const nodes = new Map<number, { id: number; x: number; y: number; z?: number }>();
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number }>();
  let nid = 1, eid = 1;
  const grid: number[][] = [];
  for (let s = 0; s <= storeys; s++) {
    const lvl: number[] = [];
    for (const [x, y] of [[0, 0], [bx, 0], [bx, by], [0, by]]) { nodes.set(nid, { id: nid, x, y, z: s * 3 }); lvl.push(nid); nid++; }
    grid.push(lvl);
  }
  for (let s = 0; s < storeys; s++) {
    for (let i = 0; i < 4; i++) { elements.set(eid, { id: eid, nodeI: grid[s]![i]!, nodeJ: grid[s + 1]![i]!, sectionId: 1, materialId: 1 }); eid++; }
    for (let i = 0; i < 4; i++) { elements.set(eid, { id: eid, nodeI: grid[s + 1]![i]!, nodeJ: grid[s + 1]![(i + 1) % 4]!, sectionId: 1, materialId: 1 }); eid++; }
  }
  return { nodes, elements, sections: new Map([[1, { id: 1, a: 0.25 }]]), materials: new Map([[1, { id: 1, rho: 25 }]]), loadCases: [{ id: 1, type: 'D', name: 'D' }] };
}
const applied = (reg: ProjectRegulations): ProjectRegulations => {
  const out = { ...reg };
  for (const k of Object.keys(out) as Array<keyof ProjectRegulations>) if (out[k].adapterId) out[k] = { ...out[k], configComplete: true, state: 'applied' };
  return out;
};
const plan = (wind: Partial<NonNullable<LoadPlanInput['wind']>>, model = tower()) => buildLoadPlan({
  regulations: applied(defaultRegulations()), model, dead: [{ labelKey: 'a', q: 1 }], occupancyKey: 'vivienda', tributaryWidth: 3,
  reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: false,
  wind: { enabled: true, basicSpeed: 45, exposure: 'C', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, directions: { x: false, y: true }, senses: ['+y'], caseSet: 'all', ...wind },
});
const yAt = (p: ReturnType<typeof buildLoadPlan>, ids: number[]) => p.nodal.filter((n) => n.caseType === 'W' && ids.includes(n.nodeId)).reduce((s, n) => s + n.fy, 0);

describe('wind on a profile of the user’s and on a part of the model', () => {
  it('the profile’s mean over a band, exactly', () => {
    expect(profileMean([[0, 1], [10, 2]], 0, 10)).toBeCloseTo(1.5, 12);
    expect(profileMean([[0, 1], [4, 1], [8, 3]], 2, 8)).toBeCloseTo((2 * 1 + (1 + 3) / 2 * 4) / 6, 12);
    expect(profileMean([[0, 1], [10, 2]], 12, 14)).toBeCloseTo(2, 12);
  });

  it('a level takes the profile’s pressure on its band times the front, case 1 only, no roof', () => {
    const p = plan({ profile: [[0, 1], [12, 1]] });
    // Level +6 m: band 4.5 to 7.5 m, the 20 m front facing Y: 1 kPa × 20 × 3 = 60 kN.
    expect(yAt(p, [9, 10, 11, 12])).toBeCloseTo(60, 6);
    expect(p.cases.filter((c) => c.type === 'W')).toHaveLength(1);
    expect(p.distributed.filter((d) => d.caseType === 'W')).toHaveLength(0);
  });

  it('on a part of the model, only its nodes, with its own front', () => {
    const m = tower();
    const half = [...m.nodes.values()].filter((n) => n.x === 0).map((n) => n.id);
    const p = plan({ profile: [[0, 1], [12, 1]], region: half }, m);
    expect(p.nodal.filter((n) => n.caseType === 'W').every((n) => half.includes(n.nodeId))).toBe(true);
    // Its nodes span 0 in X: a front of nothing along Y — no force where nothing faces the wind.
    expect(yAt(p, half)).toBeCloseTo(0, 9);
  });
});

describe('the mass’s own weights', () => {
  it('on members, kN/m along each; on a floor in a box, to its beams', () => {
    const m = tower(1);
    const dm = { ...m, quads: new Map(), plates: new Map(), groups: new Map(), loadCases: [] } as never;
    const loads = massWeightLoads(dm, [{ on: 'members', region: { kind: 'box', z: [3, 3] }, w: 2 }], false);
    expect(loads).toHaveLength(4);
    expect(loads.every((l) => l.data.caseId === WEIGHT_CASE)).toBe(true);
    const floor = massWeightLoads(dm, [{ on: 'floor', region: { kind: 'box', z: [3, 3] }, w: 1 }], false);
    const total = floor.reduce((s, l) => s + (l.type === 'distributed3d' ? -(((l.data as { qZI: number }).qZI + (l.data as { qZJ: number }).qZJ) / 2) * (((l.data as { b?: number }).b ?? 0) - ((l.data as { a?: number }).a ?? 0) || 0) : 0), 0);
    expect(total).toBeGreaterThan(0);
  });
});

describe('the pushover’s pattern and target', () => {
  /** Two nodes up a column, 10 kN of gravity at each. */
  const input = {
    nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 3 }], [3, { id: 3, x: 0, y: 0, z: 6 }]]),
    elements: new Map(), supports: new Map([[1, { id: 1, nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
    materials: new Map(), sections: new Map(), loads: [],
  } as unknown as SolverInput3D;
  const gravity = [2, 3].map((n) => ({ type: 'nodal' as const, data: { nodeId: n, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0 } }));

  it('uniform and triangular add up to 1 kN, by weight and by weight times height', () => {
    const u = lateralPatternLoads(input, gravity, 'uniform', 'X')!;
    expect(u.reduce((s, l) => s + (l.data as { fx: number }).fx, 0)).toBeCloseTo(1, 12);
    expect(u.map((l) => (l.data as { fx: number }).fx)).toEqual([0.5, 0.5]);
    const tri = lateralPatternLoads(input, gravity, 'triangular', 'X')!;
    expect(tri.map((l) => +(l.data as { fx: number }).fx.toFixed(12))).toEqual([+(1 / 3).toFixed(12), +(2 / 3).toFixed(12)]);
  });

  it('the curve up to a base shear, the last step interpolated', () => {
    const curve = [
      { step: -1, loadFactor: 0, displacement: 0, baseShear: 0, hinges: [] },
      { step: 0, loadFactor: 100, displacement: 0.01, baseShear: 100, hinges: [] },
      { step: 1, loadFactor: 150, displacement: 0.05, baseShear: 150, hinges: [] },
    ];
    const r = upToTarget(curve, { kind: 'shear', value: 125 });
    expect(r.reached).toBe(true);
    expect(r.curve.at(-1)!.displacement).toBeCloseTo(0.03, 12);
    expect(upToTarget(curve, { kind: 'displacement', value: 1 }).reached).toBe(false);
  });
});
