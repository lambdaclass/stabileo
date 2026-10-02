import { describe, it, expect } from 'vitest';
import { gravityLayout, type GravityModel } from '../plan-gravity';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput } from '../load-plan';
import { defaultRegulations, type ProjectRegulations } from '../../../codes/roles';

/** A level of `nx` × `ny` bays of `bx` × `by` m at height `z`, beams on every grid line. */
function floor(nx: number, ny: number, bx: number, by: number, z = 3): GravityModel & LoadModelData {
  const nodes = new Map<number, { id: number; x: number; y: number; z?: number }>();
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number }>();
  const at = (i: number, j: number) => j * (nx + 1) + i + 1;
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) nodes.set(at(i, j), { id: at(i, j), x: i * bx, y: j * by, z });
  let e = 1;
  for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) elements.set(e, { id: e++, nodeI: at(i, j), nodeJ: at(i + 1, j), sectionId: 1, materialId: 1 });
  for (let i = 0; i <= nx; i++) for (let j = 0; j < ny; j++) elements.set(e, { id: e++, nodeI: at(i, j), nodeJ: at(i, j + 1), sectionId: 1, materialId: 1 });
  return {
    nodes, elements,
    sections: new Map([[1, { id: 1, a: 0.09 }]]), materials: new Map([[1, { id: 1, rho: 25 }]]),
    loadCases: [{ id: 1, type: 'D', name: 'D' }, { id: 2, type: 'L', name: 'L' }],
  };
}

/** kN a list of planned line loads adds up to (trapezoids over their stretch). */
function totalKN(list: Array<{ elementId: number; q: number; qJ?: number; a?: number; b?: number }>, model: GravityModel): number {
  let s = 0;
  for (const d of list) {
    const el = model.elements.get(d.elementId)!;
    const a = model.nodes.get(el.nodeI)!, b = model.nodes.get(el.nodeJ)!;
    const L = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
    const x0 = d.a ?? 0, x1 = d.b ?? L;
    s += ((d.q + (d.qJ ?? d.q)) / 2) * (x1 - x0);
  }
  return s;
}

function applied(reg: ProjectRegulations): ProjectRegulations {
  const out = { ...reg };
  for (const k of Object.keys(out) as Array<keyof ProjectRegulations>) {
    if (out[k].adapterId) out[k] = { ...out[k], configComplete: true, state: 'applied' };
  }
  return out;
}

const planInput = (model: LoadModelData, over: Partial<LoadPlanInput> = {}): LoadPlanInput => ({
  regulations: applied(defaultRegulations()), model,
  dead: [{ labelKey: 'a', q: 2 }], occupancyKey: 'vivienda', tributaryWidth: 3,
  reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false,
  generateCombinations: false, gravity: { mode: 'panels' }, ...over,
});

describe('area loads by the panels the beams close', () => {
  it('a 6 × 4 m panel sends its whole area to its four beams, triangles and trapezoids', () => {
    const m = floor(1, 1, 6, 4);
    const g = gravityLayout(m, { mode: 'panels', tributaryWidth: 3 });
    // Nothing stands over this floor: what it collects is roof area.
    expect(g.areaOf.size).toBe(0);
    const area = [...g.roofAreaOf.values()].reduce((s, a) => s + a, 0);
    expect(area).toBeCloseTo(24, 6);
    // Short sides (4 m) take a triangle of height 2: 4 m²; long sides the rest, 8 m² each.
    const byLen = [...g.roofAreaOf].map(([id, a]) => {
      const e = m.elements.get(id)!;
      const L = Math.abs(m.nodes.get(e.nodeJ)!.x - m.nodes.get(e.nodeI)!.x) + Math.abs(m.nodes.get(e.nodeJ)!.y - m.nodes.get(e.nodeI)!.y);
      return [L, a];
    });
    for (const [L, a] of byLen) expect(a).toBeCloseTo(L === 4 ? 4 : 8, 6);
    expect(g.widthMembers).toHaveLength(0);
  });

  it('the plan carries q times the floor area, along global Z, wherever the width says otherwise', () => {
    const m = floor(3, 2, 5, 4);
    const p = buildLoadPlan(planInput(m, { tributaryWidth: 9 }));
    const dead = p.distributed.filter((d) => d.caseType === 'D');
    expect(dead.every((d) => d.frame === 'global')).toBe(true);
    expect(totalKN(dead, m)).toBeCloseTo(-2 * 15 * 8, 4);
    const live = p.distributed.filter((d) => d.caseType === 'L');
    expect(totalKN(live, m)).toBeCloseTo(-2 * 15 * 8, 4);   // vivienda, Lo = 2 kN/m², unreduced here
  });

  it('a plane frame closes no panel: its beams take the tributary width, and the plan says so', () => {
    const m = floor(3, 0, 5, 4);   // one line of beams
    const p = buildLoadPlan(planInput(m, { tributaryWidth: 2.5 }));
    const dead = p.distributed.filter((d) => d.caseType === 'D');
    expect(dead).toHaveLength(3);
    for (const d of dead) { expect(d.q).toBeCloseTo(-5, 9); expect(d.frame).toBe('global'); }
    expect(p.derivation.some((x) => x.key === 'loadPlan.gravity.width')).toBe(true);
  });

  it('a floor drawn with quads takes the load as a surface load, and its beams none', () => {
    const m = floor(1, 1, 6, 4);
    const quads = new Map([[1, { id: 1, nodes: [1, 2, 4, 3] }]]);
    const p = buildLoadPlan(planInput({ ...m, quads }));
    expect(p.distributed.filter((d) => d.caseType === 'D')).toHaveLength(0);
    expect(p.surface).toEqual([
      { quadId: 1, caseType: 'D', q: 2 },
      { quadId: 1, caseType: 'L', q: 2 },
    ]);
  });

  it('each beam is reduced by its own tributary area', () => {
    // 10 × 10 m bays: an interior beam collects 50 m², K_LL·A_T = 100 m² ≥ 37 m².
    const m = floor(2, 2, 10, 10);
    const p = buildLoadPlan(planInput(m, { applyLiveReduction: true }));
    const live = p.distributed.filter((d) => d.caseType === 'L');
    const peak = (id: number) => Math.max(...live.filter((d) => d.elementId === id).map((d) => -Math.min(d.q, d.qJ ?? d.q)));
    // The interior beam (two panels) carries a higher reduction than an edge beam (one).
    const interior = [...m.elements.values()].find((e) => m.nodes.get(e.nodeI)!.y === 10 && m.nodes.get(e.nodeJ)!.y === 10)!.id;
    const edge = [...m.elements.values()].find((e) => m.nodes.get(e.nodeI)!.y === 0 && m.nodes.get(e.nodeJ)!.y === 0)!.id;
    // Peak ordinate over q·depth: an edge beam's triangle reaches 5 m, an interior beam's 10 m.
    expect(peak(interior) / 10).toBeLessThan(peak(edge) / 5);
    expect(p.derivation.some((x) => x.key === 'loadPlan.derivation.reductionPerMember')).toBe(true);
  });

  it('the seismic mass of a level is the floor it carries, not the box around its nodes', () => {
    // An L-shaped floor: three 5 × 5 bays of a 2 × 2 grid.
    const m = floor(2, 2, 5, 5);
    // Drop the beams of the top-right bay that bound nothing else.
    const at = (i: number, j: number) => j * 3 + i + 1;
    for (const [id, e] of [...m.elements]) {
      const ends = [e.nodeI, e.nodeJ].sort();
      if ((ends[0] === at(1, 2) && ends[1] === at(2, 2)) || (ends[0] === at(2, 1) && ends[1] === at(2, 2))) m.elements.delete(id);
    }
    m.nodes.delete(at(2, 2));
    const p = buildLoadPlan(planInput(m));
    const lvl = p.levels.find((l) => l.elevation === 3)!;
    expect(lvl.planAreaM2).toBeCloseTo(75, 4);
  });
});

/** Two levels of one 6 × 6 bay; with `stepTo`, a second bay at x 6–12 rises only to the first. */
function building(step = false): LoadModelData {
  const nodes = new Map<number, { id: number; x: number; y: number; z?: number }>();
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number }>();
  let n = 1, e = 1;
  const id = new Map<string, number>();
  const node = (x: number, y: number, z: number) => {
    const k = `${x},${y},${z}`;
    if (!id.has(k)) { id.set(k, n); nodes.set(n, { id: n, x, y, z }); n++; }
    return id.get(k)!;
  };
  const seen = new Set<string>();
  const ring = (x0: number, x1: number, z: number) => {
    const c = [node(x0, 0, z), node(x1, 0, z), node(x1, 6, z), node(x0, 6, z)];
    for (let i = 0; i < 4; i++) {
      const k = [c[i]!, c[(i + 1) % 4]!].sort().join('-');
      if (seen.has(k)) continue;
      seen.add(k);
      elements.set(e, { id: e++, nodeI: c[i]!, nodeJ: c[(i + 1) % 4]!, sectionId: 1, materialId: 1 });
    }
  };
  const posts = (x0: number, x1: number, z0: number, z1: number) => {
    for (const [x, y] of [[x0, 0], [x1, 0], [x1, 6], [x0, 6]] as const) elements.set(e, { id: e++, nodeI: node(x, y, z0), nodeJ: node(x, y, z1), sectionId: 1, materialId: 1 });
  };
  posts(0, 6, 0, 3); ring(0, 6, 3); posts(0, 6, 3, 6); ring(0, 6, 6);
  if (step) { for (const [x, y] of [[12, 0], [12, 6]] as const) elements.set(e, { id: e++, nodeI: node(x, y, 0), nodeJ: node(x, y, 3), sectionId: 1, materialId: 1 }); ring(6, 12, 3); }
  return {
    nodes, elements, sections: new Map([[1, { id: 1, a: 0.09 }]]), materials: new Map([[1, { id: 1, rho: 25 }]]),
    loadCases: [{ id: 1, type: 'D', name: 'D' }],
  };
}

describe('roofs: what nothing higher covers', () => {
  const roof = { use: 'maintenance' as const, weight: 'heavy' as const, dead: 1.5, slopeDeg: 0 };

  it('the top floor takes the roof dead load and Lr; the floor under it D and L', () => {
    const m = building();
    const p = buildLoadPlan(planInput(m, { roof, generateCombinations: true }));
    const top = (d: { elementId: number }) => (m.nodes.get(m.elements.get(d.elementId)!.nodeI)!.z ?? 0) === 6;
    const dead = p.distributed.filter((d) => d.caseType === 'D');
    expect(totalKN(dead.filter(top), m)).toBeCloseTo(-1.5 * 36, 4);
    expect(totalKN(dead.filter((d) => !top(d)), m)).toBeCloseTo(-2 * 36, 4);
    // Lr only on the roof: each beam collects 9 m² (< 20 m², R1 = 1), flat: 0,96 kN/m².
    const lr = p.distributed.filter((d) => d.caseType === 'Lr');
    expect(lr.length).toBeGreaterThan(0);
    expect(lr.every(top)).toBe(true);
    expect(totalKN(lr, m)).toBeCloseTo(-0.96 * 36, 4);
    expect(p.distributed.filter((d) => d.caseType === 'L').every((d) => !top(d))).toBe(true);
    expect(p.cases.some((c) => c.type === 'Lr')).toBe(true);
    expect(p.combinations.some((c) => c.terms.some((f) => f.symbol === 'Lr'))).toBe(true);
  });

  it('a lower roof beside a step is a roof too', () => {
    const m = building(true);
    const p = buildLoadPlan(planInput(m, { roof }));
    const lr = p.distributed.filter((d) => d.caseType === 'Lr');
    // The 6 × 6 upper roof and the 6 × 6 lower roof beside it.
    expect(totalKN(lr, m)).toBeCloseTo(-0.96 * 72, 4);
  });

  it('a one-storey roof for maintenance has no L case', () => {
    const m = floor(1, 1, 6, 6);
    const p = buildLoadPlan(planInput(m, { roof, generateCombinations: true }));
    expect(p.cases.map((c) => c.type)).toEqual(['D', 'Lr']);
    expect(p.combinations.every((c) => c.terms.every((f) => f.symbol !== 'L'))).toBe(true);
  });
});

describe('alternate loading (§4.3.3): checkerboards that replace the full live load', () => {
  it('a 2 × 2 bay floor: two arrangements, each half the area, neighbours apart', () => {
    const m = floor(2, 2, 5, 5);
    const p = buildLoadPlan(planInput(m, { patterns: true, generateCombinations: true }));
    const pats = p.cases.map((c, i) => ({ c, i })).filter(({ c }) => c.type === 'L' && c.nameKey === 'autoLoad.liveCasePattern');
    expect(pats).toHaveLength(2);
    for (const { i } of pats) {
      const loads = p.distributed.filter((d) => d.caseIndex === i);
      expect(totalKN(loads, m)).toBeCloseTo(-2 * 50, 4);   // two of the four 25 m² bays
    }
    const full = p.distributed.filter((d) => d.caseType === 'L' && d.caseIndex === undefined);
    expect(totalKN(full, m)).toBeCloseTo(-2 * 100, 4);
    // The full load and both checkerboards are one alternatives group: one of the three per combination.
    expect(p.cases.filter((c) => c.type === 'L').map((c) => c.alternatives)).toEqual(['live-patterns', 'live-patterns', 'live-patterns']);
    // 1.2 D + 1.6 L becomes three combinations: full, A and B.
    expect(p.derivation.some((x) => x.key === 'loadPlan.derivation.patterns')).toBe(true);
  });

  it('a single panel has nothing to alternate with, and no arrangement case', () => {
    const p = buildLoadPlan(planInput(floor(1, 1, 6, 4), { patterns: true }));
    expect(p.cases.filter((c) => c.alternatives)).toHaveLength(0);
  });

  it('the floors above alternate the other way', () => {
    const m = building();   // one bay, two levels: one panel each, neighbours only across floors
    const p = buildLoadPlan(planInput(m, { patterns: true }));
    // One panel per level is still one colour per level, so A is one floor and B the other.
    const pats = p.cases.map((c, i) => ({ c, i })).filter(({ c }) => c.type === 'L' && c.nameKey === 'autoLoad.liveCasePattern');
    expect(pats).toHaveLength(2);
    const levelsOf = (i: number) => new Set(p.distributed.filter((d) => d.caseIndex === i).map((d) => m.nodes.get(m.elements.get(d.elementId)!.nodeI)!.z));
    expect([...levelsOf(pats[0]!.i)]).toHaveLength(1);
    expect([...levelsOf(pats[1]!.i)]).toHaveLength(1);
    expect([...levelsOf(pats[0]!.i)][0]).not.toBe([...levelsOf(pats[1]!.i)][0]);
  });
});
