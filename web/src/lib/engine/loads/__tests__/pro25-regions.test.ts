/**
 * Review of PRO 25's regions: snow on a roof chosen by a region (its columns and covered floors
 * are not roof), the service wind Wa on a profile and on a region, an empty region, and the wind
 * on a box over the upper storeys.
 */
import { describe, it, expect } from 'vitest';
import { snowLoadCases } from '../snow-loads';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput } from '../load-plan';
import { defaultRegulations, type ProjectRegulations } from '../../../codes/roles';
import { regionMembers, regionNodes } from '../../../model/loads/region-nodes';
import { gravityLayout } from '../plan-gravity';
import { SERVICE_WIND_FACTOR } from '../../../codes/cirsoc102/wind';

/**
 * A gable shed of two storeys: three frames 6 m apart along Y, columns at x = 0 and 12 up to
 * +3 m (a floor beam across) and +6 m (the eaves), rafters to a ridge at x = 6, +7.5 m (14°);
 * eave, ridge and floor beams along Y.
 */
function shed2(): LoadModelData {
  const nodes = new Map<number, { id: number; x: number; y: number; z?: number }>();
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number }>();
  let nid = 1, eid = 1;
  const at = new Map<string, number>();
  const node = (x: number, y: number, z: number) => {
    const k = `${x},${y},${z}`;
    if (!at.has(k)) { nodes.set(nid, { id: nid, x, y, z }); at.set(k, nid++); }
    return at.get(k)!;
  };
  const bar = (a: number, b: number) => { elements.set(eid, { id: eid, nodeI: a, nodeJ: b, sectionId: 1, materialId: 1 }); eid++; };
  for (const y of [0, 6, 12]) {
    for (const x of [0, 12]) { bar(node(x, y, 0), node(x, y, 3)); bar(node(x, y, 3), node(x, y, 6)); }
    bar(node(0, y, 3), node(12, y, 3));
    bar(node(0, y, 6), node(6, y, 7.5)); bar(node(6, y, 7.5), node(12, y, 6));
  }
  for (const [y0, y1] of [[0, 6], [6, 12]]) {
    for (const [x, z] of [[0, 3], [12, 3], [0, 6], [12, 6], [6, 7.5]] as const) bar(node(x, y0!, z), node(x, y1!, z));
  }
  return { nodes, elements, sections: new Map([[1, { id: 1, a: 0.005 }]]), materials: new Map([[1, { id: 1, rho: 78.5 }]]), loadCases: [{ id: 1, type: 'D', name: 'D' }] };
}
const defModel = (m: LoadModelData) => ({ ...m, quads: new Map(), plates: new Map(), groups: new Map(), zones: new Map(), loadCases: [] }) as never;
const snow = { pg: 1.5, terrain: 'C' as const, exposure: 'partial' as const, thermal: 'normal' as const, category: 'II' as const, roofKind: 'gable' as const, slippery: false };
/** Total vertical load of a snow case, kN (the normal part's vertical component and the nodal forces). */
function vertical(m: LoadModelData, c: { distributed: Array<{ elementId: number; q: number; qJ?: number; frame?: string }>; nodal: Array<{ fz: number }> }) {
  let v = 0;
  for (const d of c.distributed) {
    const e = m.elements.get(d.elementId)!;
    const a = m.nodes.get(e.nodeI)!, b = m.nodes.get(e.nodeJ)!;
    const Lh = Math.hypot(b.x - a.x, b.y - a.y), L = Math.hypot(Lh, (b.z ?? 0) - (a.z ?? 0));
    const q = (d.q + (d.qJ ?? d.q)) / 2;
    v += d.frame === 'projected' ? q * Lh : q * L * (Lh / L);
  }
  return v + c.nodal.reduce((s, n) => s + n.fz, 0);
}

describe('snow on a roof chosen by a region', () => {
  it('a box over the whole shed: its columns and the covered floor are not roof', () => {
    const m = shed2();
    const box = regionMembers(defModel(m), { kind: 'box', x: [-1, 13], y: [-1, 13] })!;
    const chosen = snowLoadCases({ model: m, snow: { ...snow, roof: box }, tributaryWidth: 6 })!;
    const detected = snowLoadCases({ model: m, snow, tributaryWidth: 6 })!;
    // The rafters' 14°, C_s 1: the upper columns read as 90° gave 52° and C_s 0,45.
    expect(chosen.geometry.slopeDeg).toBeCloseTo(detected.geometry.slopeDeg, 9);
    expect(chosen.geometry.slopeDeg).toBeCloseTo((Math.atan(1.5 / 6) * 180) / Math.PI, 9);
    expect(chosen.result.cs).toBeCloseTo(1, 9);
    expect(chosen.result.ps).toBeCloseTo(detected.result.ps, 9);
    // The same cases, on the same members: no zero line load on a column, no snow on the floor.
    expect(chosen.cases.map((c) => vertical(m, c))).toEqual(detected.cases.map((c) => vertical(m, c)));
    const roofIds = new Set(chosen.cases.flatMap((c) => c.distributed.map((d) => d.elementId)));
    for (const id of roofIds) {
      const e = m.elements.get(id)!;
      expect(Math.min(m.nodes.get(e.nodeI)!.z!, m.nodes.get(e.nodeJ)!.z!), `member ${id}`).toBeGreaterThanOrEqual(6);
    }
  });

  it('by panels: the floor under the chosen roof takes none of it', () => {
    const m = shed2();
    const layout = gravityLayout(m, { mode: 'panels', tributaryWidth: 6 });
    const box = regionMembers(defModel(m), { kind: 'box', x: [-1, 13], y: [-1, 13] })!;
    const chosen = snowLoadCases({ model: m, snow: { ...snow, roof: box }, tributaryWidth: 6, layout })!;
    const detected = snowLoadCases({ model: m, snow, tributaryWidth: 6, layout })!;
    expect(chosen.cases.map((c) => +vertical(m, c).toFixed(6))).toEqual(detected.cases.map((c) => +vertical(m, c).toFixed(6)));
  });

  it('half the roof in a box: that slope only, at the roof’s own slope', () => {
    const m = shed2();
    const half = regionMembers(defModel(m), { kind: 'box', x: [-1, 6], z: [2.9, 8] })!;
    const out = snowLoadCases({ model: m, snow: { ...snow, roof: half }, tributaryWidth: 6 })!;
    expect(out.geometry.slopeDeg).toBeCloseTo((Math.atan(1.5 / 6) * 180) / Math.PI, 9);
    const ids = new Set(out.cases[0]!.distributed.map((d) => d.elementId));
    for (const id of ids) {
      const e = m.elements.get(id)!;
      expect(Math.max(m.nodes.get(e.nodeI)!.x, m.nodes.get(e.nodeJ)!.x)).toBeLessThanOrEqual(6);
      expect(Math.min(m.nodes.get(e.nodeI)!.z!, m.nodes.get(e.nodeJ)!.z!)).toBeGreaterThanOrEqual(6);
    }
  });

  it('a flat tower’s top storey in a box: slope 0, C_s 1 (its columns read 90°, C_s 0)', () => {
    const m = tower();
    const top = regionMembers(defModel(m), { kind: 'box', z: [8, 13] })!;
    const out = snowLoadCases({ model: m, snow: { ...snow, roofKind: 'mono', roof: top }, tributaryWidth: 3 })!;
    expect(out.geometry.slopeDeg).toBe(0);
    expect(out.result.cs).toBeCloseTo(1, 9);
    expect(out.cases[0]!.distributed.map((d) => d.elementId).sort((a, b) => a - b)).toEqual([29, 30, 31, 32]);
  });

  it('a region with no members is no roof: no snow, and the plan says so', () => {
    const m = tower();
    expect(snowLoadCases({ model: m, snow: { ...snow, roof: [] }, tributaryWidth: 3 })).toBeNull();
    const p = buildLoadPlan({ ...base(m), snow: { enabled: true, source: 'site', ...snow, roof: [] } });
    expect(p.cases.filter((c) => c.type === 'S')).toHaveLength(0);
    expect(p.unsupportedKeys.map((k) => k.key)).toContain('snow.note.emptyRegion');
  });
});

/** A tower 20 × 10 m in plan, `storeys` of 3 m (as `pro25-actions.test.ts`). */
function tower(storeys = 4, bx = 20, by = 10): LoadModelData {
  const nodes = new Map<number, { id: number; x: number; y: number; z?: number }>();
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number }>();
  let nid = 1, eid = 1;
  const grid: number[][] = [];
  for (let s = 0; s <= storeys; s++) {
    const lvl: number[] = [];
    for (const [x, y] of [[0, 0], [bx, 0], [bx, by], [0, by]]) { nodes.set(nid, { id: nid, x: x!, y: y!, z: s * 3 }); lvl.push(nid); nid++; }
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
const base = (model: LoadModelData): LoadPlanInput => ({
  regulations: applied(defaultRegulations()), model, dead: [{ labelKey: 'a', q: 1 }], occupancyKey: 'vivienda', tributaryWidth: 3,
  reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: false,
});
const plan = (wind: Partial<NonNullable<LoadPlanInput['wind']>>, model = tower()) => buildLoadPlan({
  ...base(model),
  wind: { enabled: true, basicSpeed: 45, exposure: 'C', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, directions: { x: false, y: true }, senses: ['+y'], caseSet: 'all', ...wind },
});
const shear = (p: ReturnType<typeof buildLoadPlan>, type: 'W' | 'Wa', index = 0) => {
  const at = p.cases.map((c, i) => [c, i] as const).filter(([c]) => c.type === type)[index]![1];
  return p.nodal.filter((n) => n.caseIndex === at).reduce((s, n) => s + n.fy, 0);
};

describe('service wind Wa on a profile and on a region', () => {
  const service = { enabled: true, v50: 30, mri: 10 as const };

  it('a profile: Wa is the profile times (V_service / V)², case 1 once, no roof pressures', () => {
    const p = plan({ profile: [[0, 1], [12, 1]], service });
    const wa = p.cases.filter((c) => c.type === 'Wa');
    expect(wa).toHaveLength(1);
    expect(p.distributed.filter((d) => d.caseType === 'Wa')).toHaveLength(0);
    expect(shear(p, 'W')).toBeCloseTo(240, 6);
    const vs = 30 * SERVICE_WIND_FACTOR[10];
    expect(shear(p, 'Wa')).toBeCloseTo(240 * (vs / 45) ** 2, 6);
  });

  it('a region: Wa’s roof loads only on the members inside, as W’s', () => {
    const m = tower();
    const half = [...m.nodes.values()].filter((n) => n.x === 20).map((n) => n.id);
    const inside = (id: number) => { const e = m.elements.get(id)!; return half.includes(e.nodeI) && half.includes(e.nodeJ); };
    const p = plan({ region: half, service, caseSet: 'case1' }, m);
    const wa = p.distributed.filter((d) => d.caseType === 'Wa');
    expect(p.distributed.filter((d) => d.caseType === 'W').every((d) => inside(d.elementId))).toBe(true);
    expect(wa.length).toBeGreaterThan(0);
    expect(wa.every((d) => inside(d.elementId))).toBe(true);
    expect(p.nodal.filter((n) => n.caseType === 'Wa').every((n) => half.includes(n.nodeId))).toBe(true);
  });
});

describe('wind on an empty region', () => {
  it('no wind at all, and the plan says why (it was the whole model’s)', () => {
    const p = plan({ region: [] });
    expect(p.cases.filter((c) => c.type === 'W')).toHaveLength(0);
    expect(p.nodal.filter((n) => n.caseType === 'W')).toHaveLength(0);
    expect(p.unsupportedKeys.map((k) => k.key)).toContain('loadPlan.note.windEmptyRegion');
  });
});

describe('a profile on a structure that is not a building', () => {
  it('is not used, and the plan says so', () => {
    const p = plan({ profile: [[0, 1], [12, 1]], structure: { kind: 'freeRoof', roof: 'pitched', blocked: false } });
    expect(p.unsupportedKeys.map((k) => k.key)).toContain('loadPlan.note.windProfileOther');
  });
});

describe('wind on a box over the upper storeys', () => {
  it('the lowest level in the box takes its own band, not the storeys below it', () => {
    const m = tower();
    const upper = regionNodes(defModel(m), { kind: 'box', z: [6, 12] })!;
    const p = plan({ profile: [[0, 1], [12, 1]], region: upper }, m);
    const at = (z: number) => p.nodal.filter((n) => n.caseType === 'W' && m.nodes.get(n.nodeId)!.z === z).reduce((s, n) => s + n.fy, 0);
    // Level +6 m: the band 4,5 to 7,5 m, as in the whole model: 1 kPa × 20 m × 3 m = 60 kN.
    expect(at(6)).toBeCloseTo(60, 6);
    expect(at(9)).toBeCloseTo(60, 6);
    expect(at(12)).toBeCloseTo(30, 6);
  });
});
