/**
 * The statics of the generated area loads: whatever carries them (panels, the tributary width,
 * slabs and sloped roofs of shells), a floor's loads add up to q times its area, once.
 *
 * Each case here was a load counted twice or not at all: one-way slabs giving the beams parallel
 * to the span the tributary width on top of the panels, a level with one bay drawn as a slab
 * leaving its other bays unloaded, a roof of sloped shells with no load, the width mode loading
 * sloped members per sloped metre across their axis, the roof's weight class read from the
 * cladding alone (CIRSOC 101 §4.8.1 counts the structure too), the user's own live loads lost from
 * the pattern combinations, and two patterned actions tied at the largest factor multiplying their
 * arrangements.
 */
import { describe, it, expect } from 'vitest';
import { buildLoadPlan, LIVE_PATTERNS, type LoadModelData, type LoadPlanInput } from '../load-plan';
import { gravityLayout } from '../plan-gravity';
import { defaultRegulations, type ProjectRegulations } from '../../../codes/roles';
import { expandCombinations } from '../combination-cases';

type N = { id: number; x: number; y: number; z?: number };
type E = { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number };
type Q = { id: number; nodes: number[]; thickness?: number; materialId?: number };
type Model = LoadModelData & { quads?: Map<number, Q> };

function mk(section = { a: 0.0001, rho: 0 }) {
  const nodes = new Map<number, N>();
  const elements = new Map<number, E>();
  const idx = new Map<string, number>();
  let n = 1, e = 1;
  const node = (x: number, y: number, z: number) => {
    const k = `${x},${y},${z}`;
    if (!idx.has(k)) { idx.set(k, n); nodes.set(n, { id: n, x, y, z }); n++; }
    return idx.get(k)!;
  };
  const bar = (a: number, b: number) => { elements.set(e, { id: e, nodeI: a, nodeJ: b, sectionId: 1, materialId: 1 }); return e++; };
  return {
    nodes, elements, node, bar,
    model: (): Model => ({ nodes, elements, sections: new Map([[1, { id: 1, a: section.a }]]), materials: new Map([[1, { id: 1, rho: section.rho }]]), loadCases: [] }),
  };
}

/** nx × ny bays of bx × by at z, beams on every grid line, columns down to 0. */
function grid(m: ReturnType<typeof mk>, nx: number, ny: number, bx: number, by: number, z: number, x0 = 0) {
  for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) m.bar(m.node(x0 + i * bx, j * by, z), m.node(x0 + (i + 1) * bx, j * by, z));
  for (let i = 0; i <= nx; i++) for (let j = 0; j < ny; j++) m.bar(m.node(x0 + i * bx, j * by, z), m.node(x0 + i * bx, (j + 1) * by, z));
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) m.bar(m.node(x0 + i * bx, j * by, 0), m.node(x0 + i * bx, j * by, z));
}

function applied(reg: ProjectRegulations): ProjectRegulations {
  const out = { ...reg };
  for (const k of Object.keys(out) as Array<keyof ProjectRegulations>) {
    if (out[k].adapterId) out[k] = { ...out[k], configComplete: true, state: 'applied' };
  }
  return out;
}

const input = (model: LoadModelData, over: Partial<LoadPlanInput> = {}): LoadPlanInput => ({
  regulations: applied(defaultRegulations()), model,
  dead: [{ labelKey: 'a', q: 2 }], occupancyKey: 'vivienda', tributaryWidth: 1,
  reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false,
  generateCombinations: false, gravity: { mode: 'panels' }, ...over,
});

type Plan = ReturnType<typeof buildLoadPlan>;

/** Total vertical kN of planned line loads (per projection where `projected`). */
function lineKN(p: Plan, model: LoadModelData, pick: (d: Plan['distributed'][number]) => boolean): number {
  let s = 0;
  for (const d of p.distributed.filter(pick)) {
    const el = model.elements.get(d.elementId)!;
    const a = model.nodes.get(el.nodeI)!, b = model.nodes.get(el.nodeJ)!;
    const L = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
    const Lh = Math.hypot(b.x - a.x, b.y - a.y);
    const x0 = d.a ?? 0, x1 = d.b ?? L;
    const f = d.frame === 'projected' ? Lh / L : 1;
    s += ((d.q + (d.qJ ?? d.q)) / 2) * (x1 - x0) * f;
  }
  return -s;
}

/** A quad's true area, m²: what `convertSurfaceLoad` multiplies q by (two triangles). */
function quadArea(model: Model, ids: number[]): number {
  const p = ids.map((i) => model.nodes.get(i)!).map((n) => [n.x, n.y, n.z ?? 0] as const);
  const tri = (a: readonly number[], b: readonly number[], c: readonly number[]) => {
    const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
    return Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!) / 2;
  };
  return tri(p[0]!, p[1]!, p[2]!) + tri(p[0]!, p[2]!, p[3]!);
}
function surfKN(p: Plan, model: Model, type: string): number {
  return p.surface.filter((s) => s.caseType === type).reduce((acc, s) => acc + s.q * quadArea(model, model.quads!.get(s.quadId)!.nodes), 0);
}

describe('a floor carries q times its area, once', () => {
  it('2 × 2 bays of 5 × 4 m, two way: D and L total q × 80 m²', () => {
    const m = mk(); grid(m, 2, 2, 5, 4, 3);
    const model = m.model();
    const p = buildLoadPlan(input(model));
    expect(lineKN(p, model, (d) => d.caseType === 'D' && d.caseIndex === undefined)).toBeCloseTo(160, 4);
  });

  it('one way, either span: the beams parallel to the span take nothing, not the tributary width', () => {
    for (const spanAxis of ['x', 'y'] as const) {
      const m = mk(); grid(m, 2, 2, 5, 4, 3);
      const model = m.model();
      const gravity = { mode: 'panels' as const, slab: 'oneWay' as const, spanAxis };
      const p = buildLoadPlan(input(model, { gravity, tributaryWidth: 3 }));
      expect(lineKN(p, model, (d) => d.caseType === 'D' && d.caseIndex === undefined)).toBeCloseTo(160, 4);
      expect(lineKN(p, model, (d) => d.caseType === 'L' && d.caseIndex === undefined)).toBeCloseTo(160, 4);
      // The areas the reduction, R1 and the seismic mass read add up to the floor too.
      const g = gravityLayout(model, { ...gravity, tributaryWidth: 3 });
      expect(g.widthMembers).toHaveLength(0);
      const area = [...g.areaOf.values(), ...g.roofAreaOf.values()].reduce((s, a) => s + a, 0);
      expect(area).toBeCloseTo(80, 6);
    }
  });

  it('a roof for maintenance: D = 1.5 × 400, Lr between 0.58 and 0.96 per member, no L, Lr out of the seismic mass', () => {
    const m = mk(); grid(m, 2, 2, 10, 10, 3);
    const model = m.model();
    const p = buildLoadPlan(input(model, { roof: { use: 'maintenance', weight: 'heavy', dead: 1.5, slopeDeg: 0 } }));
    expect(lineKN(p, model, (d) => d.caseType === 'D')).toBeCloseTo(1.5 * 400, 4);
    const lr = lineKN(p, model, (d) => d.caseType === 'Lr' && d.caseIndex === undefined);
    expect(lr).toBeGreaterThanOrEqual(0.58 * 400 - 1e-6);
    expect(lr).toBeLessThanOrEqual(0.96 * 400 + 1e-6);
    expect(p.distributed.some((d) => d.caseType === 'L')).toBe(false);
    const lvl = p.levels.find((l) => l.elevation === 3)!;
    expect(lvl.liveTotalKN).toBe(0);
    expect(lvl.superimposedKN).toBeCloseTo(1.5 * 400, 4);
  });

  it('a cantilever beside the panels keeps the tributary width: D = 2 × (80 + 1 × 2)', () => {
    const m = mk(); grid(m, 2, 2, 5, 4, 3);
    m.bar(m.node(10, 0, 3), m.node(12, 0, 3));
    const model = m.model();
    const p = buildLoadPlan(input(model));
    expect(lineKN(p, model, (d) => d.caseType === 'D')).toBeCloseTo(2 * (80 + 2), 4);
  });

  it('two levels with a step: each level carries its own area, the step beam floor on one side and roof on the other', () => {
    const m = mk(); grid(m, 2, 1, 6, 6, 3); grid(m, 1, 1, 6, 6, 6);
    const model = m.model();
    const p = buildLoadPlan(input(model, { roof: { use: 'maintenance', weight: 'heavy', dead: 1, slopeDeg: 0 } }));
    const z = (d: { elementId: number }) => model.nodes.get(model.elements.get(d.elementId)!.nodeI)!.z;
    expect(lineKN(p, model, (d) => d.caseType === 'D' && z(d) === 3)).toBeCloseTo(2 * 36 + 1 * 36, 4);
    expect(lineKN(p, model, (d) => d.caseType === 'D' && z(d) === 6)).toBeCloseTo(1 * 36, 4);
    expect(lineKN(p, model, (d) => d.caseType === 'L')).toBeCloseTo(2 * 36, 4);
    expect(lineKN(p, model, (d) => d.caseType === 'Lr' && d.caseIndex === undefined)).toBeCloseTo(0.96 * 72, 4);
  });
});

describe('slabs and roofs drawn with shells', () => {
  it('a level with a slab over one of its two bays still loads the other bay through its beams', () => {
    const m = mk(); grid(m, 2, 1, 5, 4, 3);
    const quads = new Map([[1, { id: 1, nodes: [m.node(0, 0, 3), m.node(5, 0, 3), m.node(5, 4, 3), m.node(0, 4, 3)] }]]);
    const model = { ...m.model(), quads };
    const p = buildLoadPlan(input(model));
    expect(surfKN(p, model, 'D')).toBeCloseTo(2 * 20, 4);
    expect(lineKN(p, model, (d) => d.caseType === 'D')).toBeCloseTo(2 * 20, 4);
    // The beams under the slab take nothing, the shared one only the other bay's half.
    const loaded = new Set(p.distributed.filter((d) => d.caseType === 'D').map((d) => d.elementId));
    const under = [...model.elements.values()].filter((e) => {
      const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
      return a.z === 3 && b.z === 3 && Math.max(a.x, b.x) <= 5 && !(a.x === 5 && b.x === 5);
    });
    expect(under.length).toBe(3);
    for (const e of under) expect(loaded.has(e.id)).toBe(false);
  });

  it('a gable roof drawn with sloped shells only: D per m² of surface, Lr per m² of plan', () => {
    const m = mk();
    const a = m.node(0, 0, 3), b = m.node(6, 0, 3), c = m.node(6, 3, 4), d = m.node(0, 3, 4), e = m.node(6, 6, 3), f = m.node(0, 6, 3);
    for (const [x, y] of [[0, 0], [6, 0], [6, 6], [0, 6]] as const) m.bar(m.node(x, y, 0), m.node(x, y, 3));
    const quads = new Map([[1, { id: 1, nodes: [a, b, c, d] }], [2, { id: 2, nodes: [d, c, e, f] }]]);
    const model = { ...m.model(), quads };
    const p = buildLoadPlan(input(model, { roof: { use: 'maintenance', weight: 'heavy', dead: 1.5, slopeDeg: 18.43 } }));
    const surface = 2 * 6 * Math.hypot(3, 1);
    expect(lineKN(p, model, (x) => x.caseType === 'D')).toBeCloseTo(0, 9);
    expect(surfKN(p, model, 'D')).toBeCloseTo(1.5 * surface, 4);
    // F = 0,12 × 33 % = 4: R2 = 1, and a shell has no tributary area, R1 = 1.
    expect(surfKN(p, model, 'Lr')).toBeCloseTo(0.96 * 36, 4);
    expect(p.derivation.some((x) => x.key === 'loadPlan.gravity.slopedShells')).toBe(true);
    // The seismic mass above the ground takes the dead load over the true surface.
    const top = p.levels.filter((l) => l.elevation > 0).reduce((s, l) => s + l.superimposedKN, 0);
    expect(top).toBeCloseTo(1.5 * surface, 4);
  });

  it('the ring beams, rafters and ridge under a roof of shells take nothing: the shells carry the roof', () => {
    const m = mk();
    const a = m.node(0, 0, 3), b = m.node(6, 0, 3), c = m.node(6, 3, 4), d = m.node(0, 3, 4), e = m.node(6, 6, 3), f = m.node(0, 6, 3);
    for (const [x, y] of [[0, 0], [6, 0], [6, 6], [0, 6]] as const) m.bar(m.node(x, y, 0), m.node(x, y, 3));
    m.bar(a, b); m.bar(f, e); m.bar(a, f); m.bar(b, e);   // the ring at the eaves
    m.bar(a, d); m.bar(d, f); m.bar(b, c); m.bar(c, e);   // the gable rafters
    m.bar(d, c);                                          // the ridge
    const quads = new Map([[1, { id: 1, nodes: [a, b, c, d] }], [2, { id: 2, nodes: [d, c, e, f] }]]);
    const model = { ...m.model(), quads };
    const p = buildLoadPlan(input(model, { roof: { use: 'maintenance', weight: 'heavy', dead: 1.5, slopeDeg: 18.43 } }));
    expect(p.distributed.filter((x) => x.caseType === 'D')).toEqual([]);
    expect(surfKN(p, model, 'D')).toBeCloseTo(1.5 * 2 * 6 * Math.hypot(3, 1), 4);
  });

  it('a wall of shells takes no area load', () => {
    const m = mk(); grid(m, 1, 1, 6, 4, 3);
    const quads = new Map([[1, { id: 1, nodes: [m.node(0, 0, 0), m.node(6, 0, 0), m.node(6, 0, 3), m.node(0, 0, 3)] }]]);
    const model = { ...m.model(), quads };
    const p = buildLoadPlan(input(model));
    expect(p.surface).toEqual([]);
    expect(lineKN(p, model, (d) => d.caseType === 'D')).toBeCloseTo(2 * 24, 4);
  });
});

describe('the uniform tributary width', () => {
  it('loads a sloped member along global Z: D per metre of member, L per metre of plan', () => {
    const m = mk();
    m.bar(m.node(0, 0, 3), m.node(6, 0, 5));
    const model = m.model();
    const p = buildLoadPlan(input(model, { gravity: { mode: 'width' }, tributaryWidth: 2 }));
    const dead = p.distributed.filter((d) => d.caseType === 'D');
    const live = p.distributed.filter((d) => d.caseType === 'L');
    expect(dead.map((d) => d.frame)).toEqual(['global']);
    expect(live.map((d) => d.frame)).toEqual(['projected']);
    expect(lineKN(p, model, (d) => d.caseType === 'D')).toBeCloseTo(2 * 2 * Math.hypot(6, 2), 6);
    expect(lineKN(p, model, (d) => d.caseType === 'L')).toBeCloseTo(2 * 2 * 6, 6);
  });
});

describe('the roof weight class of §4.8.1 counts the structure, not only the cladding', () => {
  const roofOf = (section: { a: number; rho: number }, quads?: Map<number, Q>) => {
    const m = mk(section); grid(m, 1, 1, 6, 6, 3);
    return { ...m.model(), ...(quads ? { quads } : {}) };
  };
  const lrMax = (p: Plan) => Math.max(...p.distributed.filter((d) => d.caseType === 'Lr' && d.caseIndex === undefined).map((d) => -Math.min(d.q, d.qJ ?? d.q)));
  const maintenance = { use: 'maintenance' as const, dead: 0.4, slopeDeg: 0 };

  it('0.4 kN/m² of finishes on concrete beams is a heavy roof', () => {
    // 4 beams of 0.09 m² × 25 kN/m³ × 6 m = 54 kN over 36 m²: 1.5 kN/m² of structure.
    const p = buildLoadPlan(input(roofOf({ a: 0.09, rho: 25 }), { roof: maintenance }));
    expect(p.roofWeight).toBe('heavy');
    expect(p.derivation.some((x) => x.key === 'loadPlan.derivation.roofWeight')).toBe(true);
    expect(lrMax(p)).toBeGreaterThan(0.765);
  });

  it('0.4 kN/m² on light steel purlins stays light', () => {
    const p = buildLoadPlan(input(roofOf({ a: 0.0005, rho: 78.5 }), { roof: maintenance }));
    expect(p.roofWeight).toBe('light');
  });

  it('a roof slab of shells weighs its thickness; a shell of unknown thickness makes it heavy', () => {
    const slab = (q: Partial<Q>) => {
      const m = mk({ a: 0.0005, rho: 78.5 }); grid(m, 1, 1, 6, 6, 3);
      const quads = new Map([[1, { id: 1, nodes: [m.node(0, 0, 3), m.node(6, 0, 3), m.node(6, 6, 3), m.node(0, 6, 3)], ...q }]]);
      return { ...m.model(), quads };
    };
    expect(buildLoadPlan(input(slab({ thickness: 0.12, materialId: 1 }), { roof: maintenance })).roofWeight).toBe('heavy');
    expect(buildLoadPlan(input(slab({}), { roof: maintenance })).roofWeight).toBe('heavy');
  });

  it('a weight the reader chose is kept', () => {
    const p = buildLoadPlan(input(roofOf({ a: 0.09, rho: 25 }), { roof: { ...maintenance, weight: 'light' } }));
    expect(p.roofWeight).toBe('light');
  });
});

describe('patterns of partial loading', () => {
  it('every arrangement is a subset of the full load; a combination never takes two of a group', () => {
    const m = mk(); grid(m, 3, 2, 5, 4, 3);
    const model = m.model();
    const p = buildLoadPlan(input(model, { patterns: 'all', generateCombinations: true, combinationSet: 'both' }));
    const full = lineKN(p, model, (d) => d.caseType === 'L' && d.caseIndex === undefined);
    expect(full).toBeCloseTo(2 * 120, 4);
    const idx = p.cases.map((c, i) => ({ c, i })).filter(({ c }) => c.pattern).map(({ i }) => i);
    expect(idx.length).toBeGreaterThan(2);
    for (const i of idx) {
      const t = lineKN(p, model, (d) => d.caseIndex === i);
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThan(full);
    }
    const cases = p.cases.map((c, i) => ({ id: i + 1, type: c.type, name: `${c.type}${i}`, alternatives: c.alternatives, pattern: c.pattern }));
    const combos = expandCombinations(p.combinations, cases);
    for (const cb of combos) {
      const groups = new Map<string, number>();
      for (const f of cb.factors) {
        const g = cases[f.caseId - 1]!.alternatives;
        if (g) groups.set(g, (groups.get(g) ?? 0) + 1);
      }
      for (const n of groups.values()) expect(n).toBe(1);
    }
  });

  it('the generated full live load does not take over the user’s own live case, whose loads the patterns would drop', () => {
    const m = mk(); grid(m, 3, 2, 5, 4, 3);
    const model = { ...m.model(), loadCases: [{ id: 7, type: 'L', name: 'Mis sobrecargas' }] };
    const patterned = buildLoadPlan(input(model, { patterns: 'checkerboard' }));
    const full = patterned.cases.find((c) => c.type === 'L' && !c.pattern)!;
    expect(full.alternatives).toBe(LIVE_PATTERNS);
    expect(full.existingId).toBeNull();
    // A case already of the group is the generator's own, from an earlier apply: reused.
    const again = { ...model, loadCases: [...model.loadCases, { id: 9, type: 'L', name: 'L (auto)', alternatives: LIVE_PATTERNS }] };
    expect(buildLoadPlan(input(again, { patterns: 'checkerboard' })).cases.find((c) => c.type === 'L' && !c.pattern)!.existingId).toBe(9);
    // Without patterns nothing is dropped: the user's case takes the generated load as before.
    expect(buildLoadPlan(input(model)).cases.find((c) => c.type === 'L')!.existingId).toBe(7);
  });

  it('service D + L + Lr: L and Lr tie at 1.0, and each varies alone with the other whole', () => {
    const m = mk(); grid(m, 3, 1, 5, 5, 3); grid(m, 3, 1, 5, 5, 6);
    const model = m.model();
    const p = buildLoadPlan(input(model, { patterns: 'checkerboard', generateCombinations: true, combinationSet: 'service',
      roof: { use: 'maintenance', weight: 'heavy', dead: 1, slopeDeg: 0 } }));
    const cases = p.cases.map((c, i) => ({ id: i + 1, type: c.type, name: `${c.type}${i}`, alternatives: c.alternatives, pattern: c.pattern }));
    const combos = expandCombinations(p.combinations, cases);
    const patternsIn = (cb: (typeof combos)[number]) => cb.factors.filter((f) => cases[f.caseId - 1]!.pattern).map((f) => cases[f.caseId - 1]!.type);
    const factorOf = (s: (typeof p.combinations)[number], sym: string) => s.terms.find((t) => t.symbol === sym)?.factor ?? 0;
    const spec = p.combinations.find((s) => factorOf(s, 'L') === 1 && factorOf(s, 'Lr') === 1)!;
    const tied = combos.filter((cb) => cb.specId === spec.id);
    expect(tied.filter((cb) => patternsIn(cb).length > 1).map((c) => c.name)).toEqual([]);
    // Both arrangements of L and both of Lr, and the full load of both once: 2 + 2 + 1.
    expect(tied.filter((cb) => patternsIn(cb).includes('L'))).toHaveLength(2);
    expect(tied.filter((cb) => patternsIn(cb).includes('Lr'))).toHaveLength(2);
    expect(tied.filter((cb) => patternsIn(cb).length === 0)).toHaveLength(1);
  });
});
