/**
 * Partial loading, the drifts against parapets and separate structures, and snow on shaped roofs:
 * CIRSOC 101 §4.3.3 and CIRSOC 104 Caps. 5, 6, 7.2 and 8.
 */
import { describe, it, expect } from 'vitest';
import { gravityLayout, type GravityModel } from '../plan-gravity';
import { layoutSpans, layoutUnits, adjacentSpanPatterns, partialSnowPatterns } from '../plan-spans';
import { expandCombinations } from '../combination-cases';
import { driftAndSlidingLoads } from '../snow-drift-loads';
import { parapetDrift } from '../../../codes/cirsoc104/drift';
import { snowDensity, slopeFactor } from '../../../codes/cirsoc104/snow';
import { shapedSnow } from '../snow-shapes';
import { snowLoadCases } from '../snow-loads';

type N = { id: number; x: number; y: number; z?: number };
type E = { id: number; nodeI: number; nodeJ: number; sectionId: number };

/** A one-level grid of beams, `nx` × `ny` bays of 5 m, at +`z`. */
function grid(nx: number, ny: number, z = 3): GravityModel {
  const nodes = new Map<number, N>(), elements = new Map<number, E>();
  const id = (i: number, j: number) => j * (nx + 1) + i + 1;
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) nodes.set(id(i, j), { id: id(i, j), x: 5 * i, y: 5 * j, z });
  let e = 1;
  for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) { elements.set(e, { id: e, nodeI: id(i, j), nodeJ: id(i + 1, j), sectionId: 1 }); e++; }
  for (let i = 0; i <= nx; i++) for (let j = 0; j < ny; j++) { elements.set(e, { id: e, nodeI: id(i, j), nodeJ: id(i, j + 1), sectionId: 1 }); e++; }
  return { nodes, elements };
}

describe('spans and their patterns', () => {
  it('four bays along X: three arrangements each side of a line, two spans and every other one beyond', () => {
    const m = grid(4, 1);
    const layout = gravityLayout(m, { mode: 'panels', tributaryWidth: 3 });
    const spans = layoutSpans(m, layout);
    expect(spans.lines.x).toEqual([0, 5, 10, 15, 20]);
    const units = layoutUnits(layout);
    const pats = adjacentSpanPatterns(spans, units).filter((p) => p.axis === 'x');
    expect(pats.map((p) => p.at)).toEqual([5, 10, 15]);
    const bay = (k: number) => units.find((u) => 'panel' in u && spans.place(u, 'x')!.hasOwnProperty('span') && (spans.place(u, 'x') as { span: number }).span === k)!;
    // At x = 10: bays 2 and 3 (10–15 and 5–10) loaded, the outer ones not; at x = 5, bays 1, 2 and 4.
    const at10 = pats[1]!, at5 = pats[0]!;
    expect([1, 2, 3, 4].map((k) => at10.factor(bay(k)))).toEqual([0, 1, 1, 0]);
    expect([1, 2, 3, 4].map((k) => at5.factor(bay(k)))).toEqual([1, 1, 0, 1]);
  });

  it('CIRSOC 104 §5.1 on three spans: both end spans, the middle one, and each adjacent pair, the rest at half', () => {
    const m = grid(3, 1);
    const layout = gravityLayout(m, { mode: 'panels', tributaryWidth: 3 });
    const spans = layoutSpans(m, layout);
    const units = layoutUnits(layout);
    const pats = partialSnowPatterns(spans, units).filter((p) => p.axis === 'x');
    const f = (p: (typeof pats)[number]) => [1, 2, 3].map((k) => p.factor(units.find((u) => (spans.place(u, 'x') as { span: number }).span === k)!));
    expect(pats.map(f)).toEqual([[1, 0.5, 1], [0.5, 1, 0.5], [1, 1, 0.5], [0.5, 1, 1]]);
    expect(pats.map((p) => p.snowCase)).toEqual([1, 2, 3, 3]);
    // Two spans have nothing partial to add: every case is the full load or half of it.
    expect(partialSnowPatterns(layoutSpans(grid(2, 1), gravityLayout(grid(2, 1), { mode: 'panels', tributaryWidth: 3 })), layoutUnits(gravityLayout(grid(2, 1), { mode: 'panels', tributaryWidth: 3 })))).toEqual([]);
  });
});

describe('patterns in the combinations', () => {
  const cases = [
    { id: 1, type: 'D', name: 'D' },
    { id: 2, type: 'L', name: 'L', alternatives: 'l' }, { id: 3, type: 'L', name: 'LA', alternatives: 'l', pattern: true }, { id: 4, type: 'L', name: 'LB', alternatives: 'l', pattern: true },
    { id: 5, type: 'Lr', name: 'Lr', alternatives: 'r' }, { id: 6, type: 'Lr', name: 'LrA', alternatives: 'r', pattern: true },
  ];
  const spec = (l: number, lr: number) => ({ id: 'x', label: 'x', refs: [], notes: [], terms: [{ symbol: 'D' as const, factor: 1.2 }, { symbol: 'L' as const, factor: l }, { symbol: 'Lr' as const, factor: lr }] });

  it('a pattern varies where its action is the principal one, and enters whole as a companion', () => {
    const a = expandCombinations([spec(1.6, 0.5)], cases);
    expect(a).toHaveLength(3);
    for (const c of a) expect(c.factors.some((f) => f.caseId === 5)).toBe(true);
    const b = expandCombinations([spec(1.0, 1.6)], cases);
    expect(b).toHaveLength(2);
    for (const c of b) expect(c.factors.some((f) => f.caseId === 2)).toBe(true);
    // Equal factors: each is the principal in turn, varying alone with the other whole, and the
    // full load of both is kept once: 3 of L + 2 of Lr − 1, never a pattern of each together.
    const tie = expandCombinations([spec(1.0, 1.0)], cases);
    expect(tie).toHaveLength(4);
    for (const c of tie) expect(c.factors.filter((f) => [3, 4, 6].includes(f.caseId)).length).toBeLessThanOrEqual(1);
    expect(expandCombinations([spec(1.6, 0.5)], cases, { patternsInCompanions: true })).toHaveLength(6);
  });
});

/** A 15 × 5 m flat roof at +4 m, three bays of 5 m along X. */
const roof = () => grid(3, 1, 4);

describe('drifts on exterior edges', () => {
  it('Cap. 8: 0,75 h_d of Figura 9 with l_u the roof upwind, h_c from the snow to the parapet top', () => {
    const g = snowDensity(1);
    const d = parapetDrift({ pg: 1, balanced: 0.7, parapetHeight: 1.2, lu: 30 });
    expect(d.hdWindward).toBeCloseTo(0.75 * 0.924, 6);
    expect(d.hc).toBeCloseTo(1.2 - 0.7 / g, 6);
    expect(d.applies).toBe(true);
    expect(parapetDrift({ pg: 1, balanced: 0.7, parapetHeight: 0.3, lu: 30 }).applies).toBe(false);
  });

  it('a parapet loads the members along every exterior edge, a separate structure only the side it faces', () => {
    const m = roof();
    const layout = gravityLayout(m, { mode: 'panels', tributaryWidth: 3 });
    const base = { pg: 1, balanced: 0.7, pf: 0.7, slippery: false, tributaryWidth: 3 };
    const p = driftAndSlidingLoads(m, layout, { ...base, parapet: { height: 1.2 } });
    expect(p.derivation.filter((x) => x.key === 'snow.derivation.parapet').length).toBe(8);
    expect(p.distributed.length).toBeGreaterThan(0);
    const adj = driftAndSlidingLoads(m, layout, { ...base, adjacent: [{ side: '+x', topZ: 9, separation: 2, length: 20 }] });
    const lines = adj.derivation.filter((x) => x.key === 'snow.derivation.adjacent');
    expect(lines).toHaveLength(1);
    // Every load sits on the bay next to x = 15.
    for (const d of adj.distributed) {
      const el = m.elements.get(d.elementId)!;
      expect(Math.max(m.nodes.get(el.nodeI)!.x, m.nodes.get(el.nodeJ)!.x)).toBeGreaterThan(9.99);
    }
    // At 6 m and more there is no drift.
    const far = driftAndSlidingLoads(m, layout, { ...base, adjacent: [{ side: '+x', topZ: 9, separation: 6, length: 20 }] });
    expect(far.derivation.some((x) => x.key === 'snow.derivation.noAdjacent')).toBe(true);
    expect(far.distributed).toHaveLength(0);
  });

  it('the plan adds the partial snow loads as patterns of the roof group', () => {
    const m = roof();
    const layout = gravityLayout(m, { mode: 'panels', tributaryWidth: 3 });
    const out = snowLoadCases({
      model: m as never, tributaryWidth: 3, layout,
      snow: { pg: 1, terrain: 'B', exposure: 'partial', thermal: 'normal', category: 'II', roofKind: 'mono', slippery: false },
    })!;
    const partial = out.cases.filter((c) => c.pattern);
    expect(partial.map((c) => c.nameKey)).toEqual(['snow.case.partial', 'snow.case.partial', 'snow.case.partialPair', 'snow.case.partialPair']);
    for (const c of partial) expect(c.pattern).toBe(true);
    expect(out.derivation.some((x) => x.key === 'snow.derivation.partial')).toBe(true);
  });
});

describe('shaped roofs (§4.3, §6.2 to §6.4)', () => {
  /** A circular vault of radius 10 m along X, springing at the ground: its points every 10°. */
  const vault = (toDeg: number) => {
    const pts: N[] = [];
    let k = 1;
    for (let a = -toDeg; a <= toDeg + 1e-9; a += 10) {
      const t = (a * Math.PI) / 180;
      pts.push({ id: k++, x: 10 * Math.sin(t), y: 0, z: 10 * Math.cos(t) });
    }
    return pts;
  };
  const base = { pf: 1, ce: 1, ct: 1, slippery: false, gamma: snowDensity(1), axis: 'x' as const };

  it('a curved roof: C_s from the slope where each point is, nothing past 70°', () => {
    const s = shapedSnow(vault(80), { ...base, kind: 'curved' })!;
    expect(s.balanced({ x: 0.1, y: 0 })).toBeCloseTo(1, 9);
    // At 45° of slope (between the 40° and 50° points): C_s of Figura 2 for a warm roof.
    const at45 = { x: 10 * Math.sin(Math.PI / 4), y: 0 };
    expect(s.balanced(at45)).toBeCloseTo(slopeFactor(45, 1, false), 1);
    expect(s.balanced({ x: 9.9, y: 0 })).toBe(0);
  });

  it('Figura 3, case 3 (eaves past 70°): 0,5 p_f at the crown, 2 p_f C_s(30°)/C_e at the 30° point, 0 at 70°', () => {
    const s = shapedSnow(vault(80), { ...base, kind: 'curved' })!;
    expect(s.unbalanced.map((u) => u.dir)).toEqual(['+X', '−X']);
    const lee = s.unbalanced[0]!;
    expect(lee.at({ x: 0, y: 0 })).toBeCloseTo(0.5, 6);
    expect(lee.at({ x: -3, y: 0 })).toBe(0);
    const x30 = 10 * Math.sin(Math.PI / 6);
    // The 30° point is read between segment middles: within half a segment of the exact one.
    expect(lee.at({ x: x30, y: 0 })).toBeGreaterThan(1.6);
    expect(lee.at({ x: 9.5, y: 0 })).toBeLessThan(0.3);
  });

  it('§6.2, abutting the ground or another roof: cases 2 and 3 keep the 30° point\'s value out to the eave', () => {
    const x30 = 10 * Math.sin(Math.PI / 6);
    // Case 2 (eaves at 60°): without it, down to 2 p_f C_s(60°)/C_e at the eave; with it, flat past 30°.
    const free = shapedSnow(vault(60), { ...base, kind: 'curved' })!.unbalanced[0]!;
    const abut = shapedSnow(vault(60), { ...base, kind: 'curved', abutting: true })!.unbalanced[0]!;
    expect(free.at({ x: 8.6, y: 0 })).toBeLessThan(free.at({ x: x30 + 0.5, y: 0 }) - 0.5);
    const p30 = abut.at({ x: x30 + 0.5, y: 0 });
    expect(p30).toBeCloseTo((2 * slopeFactor(30, 1, false)) / 1, 9);
    expect(abut.at({ x: 8.6, y: 0 })).toBeCloseTo(p30, 9);
    // Below the 30° point, the same as without it.
    expect(abut.at({ x: 2, y: 0 })).toBeCloseTo(free.at({ x: 2, y: 0 }), 9);
    // Case 3 (eaves at 80°): the load no longer drops to 0 at 70°.
    const abut3 = shapedSnow(vault(80), { ...base, kind: 'curved', abutting: true })!;
    expect(abut3.unbalanced[0]!.at({ x: 9.5, y: 0 })).toBeCloseTo(p30, 9);
    expect(abut3.derivation[0]!.params!.plus).toMatchObject({ key: 'snow.curved.caseAbutting' });
  });

  it('a flat arch has no unbalanced load: the line from the eave to the crown is under 10°', () => {
    expect(shapedSnow(vault(10), { ...base, kind: 'curved' })!.unbalanced).toHaveLength(0);
  });

  it('several ridges (§6.3): p_f balanced, 0,5 p_f at the ridges to 2 p_f/C_e in the valleys, the valley capped', () => {
    // Three sawtooth modules of 6 m, 2 m high: ridges at x = 0, 6, 12, 18 (z 6), valleys between.
    const pts: N[] = [];
    let k = 1;
    for (let i = 0; i <= 3; i++) { pts.push({ id: k++, x: 6 * i, y: 0, z: 6 }); if (i < 3) pts.push({ id: k++, x: 6 * i + 0.01 + 0.1, y: 0, z: 4 }); }
    const s = shapedSnow(pts, { ...base, kind: 'multiple' })!;
    expect(s.balanced({ x: 3, y: 0 })).toBe(1);
    const u = s.unbalanced[0]!;
    expect(u.at({ x: 6, y: 0 })).toBeCloseTo(0.5, 6);
    // 2 p_f/C_e = 2, under the cap 0,5 + γ·2.
    expect(u.at({ x: 0.11, y: 0 })).toBeCloseTo(2, 6);
    // A shallow valley caps it: 0,5 + γ·0,2.
    const low = shapedSnow(pts.map((p) => ({ ...p, z: p.z === 4 ? 5.8 : 6 })), { ...base, kind: 'multiple' })!;
    expect(low.unbalanced[0]!.at({ x: 0.11, y: 0 })).toBeCloseTo(0.5 + snowDensity(1) * 0.2, 6);
  });

  it('a dome (§6.4): the curved unbalanced load on the 90° sector downwind, tapering over 22,5°', () => {
    const pts: N[] = [{ id: 1, x: 0, y: 0, z: 10 }];
    let k = 2;
    for (let a = 10; a <= 80; a += 10) for (let b = 0; b < 360; b += 30) {
      const t = (a * Math.PI) / 180, p = (b * Math.PI) / 180;
      pts.push({ id: k++, x: 10 * Math.sin(t) * Math.cos(p), y: 10 * Math.sin(t) * Math.sin(p), z: 10 * Math.cos(t) });
    }
    const s = shapedSnow(pts, { ...base, kind: 'dome' })!;
    expect(s.unbalanced).toHaveLength(4);
    const toX = s.unbalanced[0]!;
    const r = 3;
    expect(toX.at({ x: r, y: 0 })).toBeGreaterThan(0.5);
    expect(toX.at({ x: -r, y: 0 })).toBe(0);
    // 56,25° off downwind: halfway down the taper.
    const t = (56.25 * Math.PI) / 180;
    expect(toX.at({ x: r * Math.cos(t), y: r * Math.sin(t) })).toBeCloseTo(toX.at({ x: r, y: 0 }) / 2, 2);
  });
});

// ─── Through the planner ─────────────────────────────────────────

import { buildLoadPlan, type LoadModelData, type LoadPlanInput } from '../load-plan';
import { defaultRegulations, type ProjectRegulations } from '../../../codes/roles';

/** Two storeys of 3 × 2 bays of 5 m, columns at every grid node, beams both ways. */
function building(): LoadModelData {
  const nodes = new Map<number, N>(), elements = new Map<number, E & { materialId: number }>();
  const nx = 3, ny = 2;
  let n = 1, e = 1;
  const at = new Map<string, number>();
  for (let s = 0; s <= 2; s++) for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    nodes.set(n, { id: n, x: 5 * i, y: 5 * j, z: 3 * s }); at.set(`${i},${j},${s}`, n++);
  }
  const bar = (a: string, b: string) => { elements.set(e, { id: e, nodeI: at.get(a)!, nodeJ: at.get(b)!, sectionId: 1, materialId: 1 }); e++; };
  for (let s = 1; s <= 2; s++) {
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) bar(`${i},${j},${s - 1}`, `${i},${j},${s}`);
    for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) bar(`${i},${j},${s}`, `${i + 1},${j},${s}`);
    for (let i = 0; i <= nx; i++) for (let j = 0; j < ny; j++) bar(`${i},${j},${s}`, `${i},${j + 1},${s}`);
  }
  return { nodes, elements, sections: new Map([[1, { id: 1, a: 0.09 }]]), materials: new Map([[1, { id: 1, rho: 25 }]]), loadCases: [] };
}
const applied = (reg: ProjectRegulations): ProjectRegulations => Object.fromEntries(Object.entries(reg).map(([k, v]) =>
  [k, v.adapterId ? { ...v, configComplete: true, state: 'applied' } : v])) as ProjectRegulations;
const planIn = (over: Partial<LoadPlanInput> = {}): LoadPlanInput => ({
  regulations: applied(defaultRegulations()), model: building(),
  dead: [{ labelKey: 'a', q: 1.5 }], occupancyKey: 'vivienda', tributaryWidth: 3,
  reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: true, generateCombinations: true,
  gravity: { mode: 'panels' },
  roof: { use: 'maintenance', weight: 'heavy', dead: 1.0, slopeDeg: 0 },
  ...over,
});

describe('partial loading through the plan', () => {
  it('adjacent-span arrangements of L and Lr are pattern cases of their groups', () => {
    const p = buildLoadPlan(planIn({ patterns: 'all' }));
    expect(p.outcome).toBe('READY');
    const adjacent = p.cases.filter((c) => c.nameKey === 'autoLoad.liveCaseAdjacent');
    // Three spans along X give two interior lines. Two along Y give one, whose two spans are the
    // whole floor: the full load, not an arrangement.
    expect(adjacent).toHaveLength(2);
    expect(adjacent.map((c) => c.nameParams!.axis)).toEqual(['X', 'X']);
    for (const c of adjacent) { expect(c.pattern).toBe(true); expect(c.alternatives).toBe('live-patterns'); }
    expect(p.cases.filter((c) => c.nameKey === 'autoLoad.roofLiveCaseAdjacent')).toHaveLength(2);
    expect(p.derivation.some((d) => d.key === 'loadPlan.derivation.adjacentSpans')).toBe(true);
    // Every adjacent case carries load on its own case index.
    for (const c of adjacent) expect(p.distributed.some((d) => d.caseIndex === p.cases.indexOf(c))).toBe(true);
  });

  it('as companions the arrangements enter whole, which keeps the combinations from multiplying', () => {
    const plan = buildLoadPlan(planIn({ patterns: 'all' }));
    const cases = plan.cases.map((c, i) => ({ id: i + 1, type: c.type, name: String(i), alternatives: c.alternatives, pattern: c.pattern }));
    const principal = expandCombinations(plan.combinations, cases).length;
    const exhaustive = expandCombinations(plan.combinations, cases, { patternsInCompanions: true }).length;
    expect(exhaustive).toBeGreaterThan(principal);
    // 1,2 D + 1,6 L + 0,5 Lr: the full L, its two checkerboards and two adjacent arrangements; Lr whole.
    expect(expandCombinations(plan.combinations.filter((s) => s.terms.some((t) => t.symbol === 'L' && t.factor === 1.6) && s.terms.some((t) => t.symbol === 'Lr')), cases).length).toBe(5);
  });

  it('the checkerboard alone, as before, and none', () => {
    expect(buildLoadPlan(planIn({ patterns: 'checkerboard' })).cases.filter((c) => c.pattern)).toHaveLength(4);
    expect(buildLoadPlan(planIn({ patterns: 'none' })).cases.filter((c) => c.pattern)).toHaveLength(0);
  });
});
