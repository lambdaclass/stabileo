import { teAt } from '../../../i18n/engine-text';
import { describe, it, expect, vi } from 'vitest';
import { gravityLayout, type GravityModel } from '../plan-gravity';
import * as gravityPlanner from '../plan-gravity';
import { planAreaLoads } from '../plan-area-loads';
import { floorLoad, type FloorBeam } from '../floor-loads';
import * as floorLoads from '../floor-loads';
import { expandDefinition } from '../../../model/loads/floor-definitions';
import { buildSolverInput3D } from '../../solver-service';
import { withMassSource } from '../../dynamics/mass-source-model';
import { G } from '../../dynamics/requests';
import { buildLoadPlan, roofWeightFor, type LoadModelData, type LoadPlanInput } from '../load-plan';
import { defaultRegulations, type ProjectRegulations } from '../../../codes/roles';
import { snowDriftRefusal } from '../snow-drift-loads';
import type { EngineMessage } from '../../../codes/message';
import { offsetRoof } from './gravity-offset-roof-fixture';
import type { Constraint3D } from '../../types-3d';

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

/** kN a list of planned line loads adds up to (trapezoids over their stretch; a projected one per metre of plan). */
function totalKN(list: Array<{ elementId: number; q: number; qJ?: number; a?: number; b?: number; frame?: string }>, model: GravityModel): number {
  let s = 0;
  for (const d of list) {
    const el = model.elements.get(d.elementId)!;
    const a = model.nodes.get(el.nodeI)!, b = model.nodes.get(el.nodeJ)!;
    const L = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
    const x0 = d.a ?? 0, x1 = d.b ?? L;
    s += ((d.q + (d.qJ ?? d.q)) / 2) * (x1 - x0) * (d.frame === 'projected' ? Math.hypot(b.x - a.x, b.y - a.y) / L : 1);
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

/** kN a list of planned surface loads adds up to: q per m² of shell over each quad's surface. */
function surfaceKN(list: Array<{ quadId: number; q: number }>, model: LoadModelData): number {
  let s = 0;
  for (const d of list) {
    const p = model.quads!.get(d.quadId)!.nodes.map((id) => model.nodes.get(id)!);
    const tri = (a: typeof p[0], b: typeof p[0], c: typeof p[0]) => {
      const u = [b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)], v = [c.x - a.x, c.y - a.y, (c.z ?? 0) - (a.z ?? 0)];
      return Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!) / 2;
    };
    s += d.q * (tri(p[0]!, p[1]!, p[2]!) + tri(p[0]!, p[2]!, p[3]!));
  }
  return s;
}

/**
 * A 10 × 10 m ring of beams at z = 4 under a gable of shells rising 2 m to a ridge along X at
 * y = 5, with `n` quads down each slope.
 */
function gable(n: number) {
  const m = floor(1, 1, 10, 10, 4);
  const quads = new Map<number, { id: number; nodes: number[] }>();
  let nid = 100, qid = 1;
  const row = (y: number, z: number): [number, number] => {
    // The eave rows are the ring's own nodes.
    if (y === 0) return [1, 2];
    if (y === 10) return [3, 4];
    m.nodes.set(nid, { id: nid, x: 0, y, z }); m.nodes.set(nid + 1, { id: nid + 1, x: 10, y, z });
    nid += 2;
    return [nid - 2, nid - 1];
  };
  const rows = new Map<number, [number, number]>();
  for (let k = 0; k <= 2 * n; k++) {
    const y = (10 * k) / (2 * n);
    rows.set(k, row(y, 4 + 2 * (1 - Math.abs(y - 5) / 5)));
  }
  for (let k = 0; k < 2 * n; k++) {
    const [a0, a1] = rows.get(k)!, [b0, b1] = rows.get(k + 1)!;
    quads.set(qid, { id: qid, nodes: [a0, a1, b1, b0] }); qid++;
  }
  return { ...m, quads };
}

function gableWithLeanTo(mesh: number, y: number, drop: number, angle = 0) {
  const model = gable(mesh);
  model.nodes.set(200, { id: 200, x: 0, y, z: 4 - drop });
  model.nodes.set(201, { id: 201, x: 10, y, z: 4 - drop });
  const id = model.quads.size + 1;
  model.quads.set(id, { id, nodes: [1, 2, 201, 200] });
  for (const node of model.nodes.values()) {
    const { x, y } = node;
    node.x = x * Math.cos(angle) - y * Math.sin(angle);
    node.y = x * Math.sin(angle) + y * Math.cos(angle);
  }
  return model;
}

it('#2282 the eave bay under a gable with a descending lean-to needs explicit loads', () => {
  for (const [mesh, angle] of [[1, 0], [3, 0.37]] as const) {
    checkBlockedGravity(gableWithLeanTo(mesh, -4, 1, angle), differentDeck);
  }
});

it('#2282 a descending shell projecting into the eave bay refuses at every layout consumer', () => {
  const model = gableWithLeanTo(2, 0.01, 0.004);
  const reason = { key: 'loadPlan.gravity.overlappingShells', params: { first: 1, second: 5 } };
  for (const loadEveryPanel of [false, true]) {
    for (const slab of ['oneWay', 'twoWay'] as const) {
      const gravity = { mode: 'panels', loadEveryPanel, slab } as const;
      const plan = buildLoadPlan(planInput(model, { gravity }));
      expect(plan.outcome).toBe('BLOCKED');
      expect(plan.blockedKeys).toEqual([reason]);
      expect(plan.distributed).toEqual([]);
      expect(plan.nodal).toEqual([]);
      expect(plan.surface).toEqual([]);
      expect(plan.levels).toEqual([]);
      expect(() => gravityLayout(model, { ...gravity, tributaryWidth: 3 })).toThrow(expect.objectContaining(reason));
      expect(() => roofWeightFor(model, gravity, 3, 2)).toThrow(expect.objectContaining(reason));
    }
  }
  expect(() => snowDriftRefusal(model)).toThrow(expect.objectContaining(reason));
  expect(buildLoadPlan(planInput(model, { gravity: { mode: 'width' } })).outcome).toBe('READY');
});

it('the eave bay under a gable with an ascending extension needs explicit loads', () => {
  checkBlockedGravity(gableWithLeanTo(1, -4, -1), differentDeck);
});

describe('a ring of beams under a roof of shells', () => {
  it('requires explicit loads for the eave bay and still loads the gable by itself', () => {
    for (const n of [1, 2, 3]) for (const angle of [0, 0.37]) {
      const model = gable(n);
      rotatePlan(model, angle);
      checkBlockedGravity(model, differentDeck);
      const roof = { ...model, elements: new Map() };
      const plan = buildLoadPlan(planInput(roof));
      expect(plan.outcome).toBe('READY');
      expect(plan.distributed).toEqual([]);
      expect(plan.nodal).toEqual([]);
      expect(surfaceKN(plan.surface.filter(load => load.caseType === 'D'), roof)).toBeCloseTo(2 * Math.hypot(5, 2) * 10 * 2, 3);
    }
  });

  it('refuses a slab over part of a bay', () => {
    const model = floor(1, 1, 10, 10);
    for (const [id, x, y] of [[10, 4, 0], [11, 4, 10]] as const) model.nodes.set(id, { id, x, y, z: 3 });
    const quads = new Map([[1, { id: 1, nodes: [1, 10, 11, 3] }]]);
    checkBlockedGravity({ ...model, quads }, differentDeck);
  });
});

/** Three gable frames 5 m apart: 10 m span, rafters at 25°, eaves at 4 m, no beams between them. */
function gableFrames(): LoadModelData {
  const rise = 5 * Math.tan((25 * Math.PI) / 180);
  const nodes = new Map<number, { id: number; x: number; y: number; z?: number }>();
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number }>();
  let n = 1, e = 1;
  for (const y of [0, 5, 10]) {
    const [b0, e0, r, e1, b1] = [[0, 0], [0, 4], [5, 4 + rise], [10, 4], [10, 0]].map(([x, z]) => { nodes.set(n, { id: n, x: x!, y, z }); return n++; });
    for (const [i, j] of [[b0, e0], [e0, r], [r, e1], [e1, b1]]) elements.set(e, { id: e++, nodeI: i!, nodeJ: j!, sectionId: 1, materialId: 1 });
  }
  return { nodes, elements, sections: new Map([[1, { id: 1, a: 0.09 }]]), materials: new Map([[1, { id: 1, rho: 25 }]]), loadCases: [] };
}

describe('the seismic mass is the load the plan puts on the structure', () => {
  it('a level of nodes that carries no floor adds no superimposed load', () => {
    // 3 × 2 bays of 5 × 4 m at z = 3, the columns split at mid-height.
    const m = floor(3, 2, 5, 4);
    const top = [...m.nodes.values()];
    let nid = 1000, eid = 1000;
    for (const n of top) {
      const base = nid++, mid = nid++;
      m.nodes.set(base, { id: base, x: n.x, y: n.y, z: 0 });
      m.nodes.set(mid, { id: mid, x: n.x, y: n.y, z: 1.5 });
      m.elements.set(eid, { id: eid++, nodeI: base, nodeJ: mid, sectionId: 1, materialId: 1 });
      m.elements.set(eid, { id: eid++, nodeI: mid, nodeJ: n.id, sectionId: 1, materialId: 1 });
    }
    const p = buildLoadPlan(planInput(m));
    const mid = p.levels.find((l) => Math.abs(l.elevation - 1.5) < 1e-9)!;
    expect(mid.superimposedKN).toBe(0);
    expect(mid.liveTotalKN).toBe(0);
    const roof = p.levels.find((l) => l.elevation === 3)!;
    expect(roof.superimposedKN).toBeCloseTo(2 * 15 * 8, 6);
  });

  it('sloped members loaded by width weigh their dead load per sloped metre, as the D case applies it', () => {
    const rise = 5 * Math.tan((25 * Math.PI) / 180);
    const m = gableFrames();
    const p = buildLoadPlan(planInput(m, { tributaryWidth: 5 }));
    const deadCase = -totalKN(p.distributed.filter((d) => d.caseType === 'D'), m);
    expect(deadCase).toBeCloseTo(2 * 5 * 6 * Math.hypot(5, rise), 3);
    const deadMass = p.levels.reduce((s, l) => s + l.superimposedKN, 0);
    expect(deadMass).toBeCloseTo(deadCase, 3);
    // The live load is per metre of plan, in the case and in the mass alike.
    const live = p.distributed.filter((d) => d.caseType === 'L' && d.caseIndex === undefined);
    expect(live.every((d) => d.frame === 'projected')).toBe(true);
    expect(p.levels.reduce((s, l) => s + l.liveTotalKN, 0)).toBeCloseTo(2 * 5 * 6 * 5, 3);
  });

  it('the level weights and the full D and unreduced L the plan applies are one and the same load', () => {
    // What the modal method builds its mass from (`store/seismic-modes.ts`: the planned D and L,
    // the L of a plan without the §4.7.2 reduction) against what the static method distributes.
    for (const m of [{ ...gable(2), elements: new Map() }, gableFrames()]) {
      const p = buildLoadPlan(planInput(m, { applyLiveReduction: false, tributaryWidth: 5 }));
      const full = <T extends { caseType: string; caseIndex?: number }>(list: T[], type: string) => list.filter((d) => d.caseType === type && d.caseIndex === undefined);
      const applied = (type: string) => -totalKN(full(p.distributed, type), m) + (m.quads ? surfaceKN(full(p.surface, type), m) : 0);
      expect(applied('D')).toBeGreaterThan(0);
      expect(p.levels.reduce((s, l) => s + l.superimposedKN, 0)).toBeCloseTo(applied('D'), 3);
      expect(p.levels.reduce((s, l) => s + l.liveTotalKN, 0)).toBeCloseTo(applied('L'), 3);
    }
  });
});

describe('alternate loading beside a slab of shells', () => {
  it('says the checkerboards leave the shells out, rather than leaving them out unsaid', () => {
    // 2 × 2 bays of 5 m; the bay at x 0–5, y 0–5 is a slab of one shell.
    const m = floor(2, 2, 5, 5);
    const quads = new Map([[1, { id: 1, nodes: [1, 2, 5, 4] }]]);
    const p = buildLoadPlan(planInput({ ...m, quads }, { patterns: 'checkerboard' }));
    expect(p.cases.some((c) => c.pattern)).toBe(true);
    expect(p.surface.some((s) => s.caseType === 'L')).toBe(true);
    expect(p.unsupportedKeys.some((k) => k.key === 'loadPlan.note.patternsSkipShells')).toBe(true);
  });

  it('and says nothing of the kind when no shell carries the live load', () => {
    const p = buildLoadPlan(planInput(floor(2, 2, 5, 5), { patterns: 'checkerboard' }));
    expect(p.unsupportedKeys.some((k) => k.key === 'loadPlan.note.patternsSkipShells')).toBe(false);
  });
});

/** A level at z = 3 of the given nodes and members, for `gravityLayout` and the plan. */
function drawn(pts: Array<[number, number]>, members: Array<[number, number]>): GravityModel & LoadModelData {
  return {
    nodes: new Map(pts.map(([x, y], i) => [i + 1, { id: i + 1, x, y, z: 3 }])),
    elements: new Map(members.map(([nodeI, nodeJ], i) => [i + 1, { id: i + 1, nodeI, nodeJ, sectionId: 1, materialId: 1 }])),
    sections: new Map([[1, { id: 1, a: 0.09 }]]), materials: new Map([[1, { id: 1, rho: 25 }]]),
    loadCases: [{ id: 1, type: 'D', name: 'D' }, { id: 2, type: 'L', name: 'L' }],
  };
}
const collected = (g: ReturnType<typeof gravityLayout>) => [...g.areaOf.values(), ...g.roofAreaOf.values()].reduce((s, a) => s + a, 0);
const fixtureModel = (f: { nodes: Array<{ id: number; x: number; y: number; z?: number }>; elements: Array<{ id: number; nodeI: number; nodeJ: number; sectionId: number; type?: string }>; quads?: Array<{ id: number; nodes: number[] }> }): GravityModel => ({
  nodes: new Map(f.nodes.map((n) => [n.id, n])),
  elements: new Map(f.elements.map((e) => [e.id, { ...e, type: e.type === 'truss' ? 'truss' as const : 'frame' as const }])),
  quads: new Map((f.quads ?? []).map((q) => [q.id, q])),
});

describe('every member along a panel’s sides is the panel’s, never loaded by width as well', () => {
  // The plane graph keeps one member per pair of nodes; the other one, or a stub along a side,
  // went to the width loop and took 3 m of floor on top of the panel's.
  it('a second member between the same two nodes: the bay is 24 m², and its D 48 kN', () => {
    const m = drawn([[0, 0], [6, 0], [6, 4], [0, 4]], [[1, 2], [2, 3], [3, 4], [4, 1], [1, 2]]);
    const g = gravityLayout(m, { mode: 'panels', tributaryWidth: 3 });
    expect(g.widthMembers).toEqual([]);
    expect(collected(g)).toBeCloseTo(24, 9);
    const p = buildLoadPlan(planInput(m));
    expect(totalKN(p.distributed.filter((d) => d.caseType === 'D'), m)).toBeCloseTo(-48, 6);
  });

  it('a stub lying along a side, to a node of its own', () => {
    const m = drawn([[0, 0], [6, 0], [6, 4], [0, 4], [2.5, 0]], [[1, 2], [2, 3], [3, 4], [4, 1], [1, 5]]);
    const g = gravityLayout(m, { mode: 'panels', tributaryWidth: 3 });
    expect(g.widthMembers).toEqual([]);
    expect(collected(g)).toBeCloseTo(24, 9);
  });

  it('the PRO examples collect what they did before panels learned openings', async () => {
    // Panel mode, width 3: the totals of main before this change (2430, 3132 and 34916.4 with it).
    // The hall was 2988 until its gable girts were split at the column chords they cross: at
    // z = 6 m the end panels now close, and that level collects 480 m² like those at 2 and 4 m
    // instead of 624 (144 m² of it by tributary width along the unsplit girts). The bridge was
    // 34896.6 until its deck was brought under the cables (22 -> 18.7 m wide, so its hangers hang
    // plumb): 720 m × 3.3 m less on each of its two deck levels.
    const want: Array<[string, number]> = [['pipe-rack', 1890], ['3d-nave-industrial', 2844], ['suspension-bridge', 30144.6]];
    for (const [id, area] of want) {
      const f = (await import(`../../../templates/fixtures/${id}.json`)).default;
      expect(collected(gravityLayout(fixtureModel(f), { mode: 'panels', tributaryWidth: 3, loadEveryPanel: true })), id).toBeCloseTo(area, 6);
    }
  });
});

describe('an opening’s ring is loaded once, by its own panel', () => {
  // The panel around the ring was loaded again from its members alone, which found the ring's
  // panel too: a 10 × 10 bay with a 2 × 2 ring collected 104 m².
  const ringBay = () => drawn(
    [[0, 0], [10, 0], [10, 10], [0, 10], [4, 4], [6, 4], [6, 6], [4, 6]],
    [[1, 2], [2, 3], [3, 4], [4, 1], [5, 6], [6, 7], [7, 8], [8, 5]],
  );
  it('a 10 × 10 bay with a 2 × 2 ring: 100 m², and D 200 kN', () => {
    const m = ringBay();
    const g = gravityLayout(m, { mode: 'panels', tributaryWidth: 3 });
    expect(collected(g)).toBeCloseTo(100, 6);
    expect(g.areaByLevel.get(3)).toBeCloseTo(100, 6);
    expect(g.panels).toHaveLength(2);
    // The opening's sides take part of theirs past their ends, at the ring's corners.
    const p = buildLoadPlan(planInput(m));
    const atCorners = p.nodal.filter((n) => n.caseType === 'D').reduce((s, n) => s + n.fz, 0);
    expect(atCorners).toBeLessThan(0);
    expect(totalKN(p.distributed.filter((d) => d.caseType === 'D'), m) + atCorners).toBeCloseTo(-200, 6);
  });

  it('the stadium: each level as the Floor tool loads it, once (18 674 m² were counted twice)', async () => {
    const f = (await import('../../../templates/fixtures/full-stadium.json')).default;
    const m = fixtureModel(f);
    const options = { mode: 'panels', tributaryWidth: 3, loadEveryPanel: true } as const;
    const refusal = { key: 'loadPlan.gravity.nonplanarShell', params: { id: 1 } };
    expect(() => gravityLayout(m, options)).toThrow(expect.objectContaining(refusal));
    expect(teAt(refusal, 'en')).toMatch(/quad 1 is nonplanar/i);
    const g = gravityLayout({ ...m, quads: undefined }, options);
    const byLevel = new Map<number, FloorBeam[]>();
    for (const e of m.elements.values()) {
      const a = m.nodes.get(e.nodeI)!, b = m.nodes.get(e.nodeJ)!;
      if (e.type === 'truss' || Math.abs((a.z ?? 0) - (b.z ?? 0)) > 1e-3) continue;
      const z = Math.round((a.z ?? 0) / 1e-3) * 1e-3;
      (byLevel.get(z) ?? byLevel.set(z, []).get(z)!).push({ id: e.id, nodeI: e.nodeI, nodeJ: e.nodeJ, type: 'frame', sectionId: 1 });
    }
    let levels = 0;
    for (const [z, beams] of byLevel) {
      const tool = floorLoad({ nodes: m.nodes, beams, q: 1, distribution: 'twoWay' }).loadedArea;
      if (tool > 0) levels++;
      expect(g.areaByLevel.get(z) ?? 0, `z = ${z}`).toBeCloseTo(tool, 6);
    }
    expect(levels).toBeGreaterThan(3);
  });
});

describe('a share at a re-entrant corner weighs the same in the plan and in the mass source', () => {
  // An L floor sends part of its area to the node at the inner corner. The plan counted it in the
  // level's weight; written by the Floor tool it was a nodal load, which the mass source leaves
  // out (it has no member to carry it), so the same floor weighed less there.
  it('an L floor, D = 2 kN/m²: the plan and the mass source both weigh 2 × 47.44 kN', () => {
    const plan: Array<[number, number]> = [[0, 0], [7.9, 0], [7.9, 1.6], [5.8, 1.6], [5.8, 7.6], [0, 7.6]];
    const area = 47.44, q = 2;
    const m = drawn(plan, plan.map((_, i) => [i + 1, ((i + 1) % plan.length) + 1]));
    // The generator's plan, its share at the corner naming the member it belongs to as well.
    const planned = buildLoadPlan(planInput(m));
    const lv = planned.levels.find((l) => l.elevation === 3)!;
    expect(lv.superimposedKN).toBeCloseTo(q * area, 6);
    const corner = planned.nodal.filter((n) => n.caseType === 'D');
    expect(corner.length).toBeGreaterThan(0);
    expect(corner.every((n) => n.carrier !== undefined && [m.elements.get(n.carrier)!.nodeI, m.elements.get(n.carrier)!.nodeJ].includes(n.nodeId))).toBe(true);
    // The Floor tool, on the same floor standing on columns.
    const nodes = new Map<number, { id: number; x: number; y: number; z: number }>();
    for (const [id, n] of m.nodes) { nodes.set(id, { id, x: n.x, y: n.y, z: 3 }); nodes.set(id + 100, { id: id + 100, x: n.x, y: n.y, z: 0 }); }
    const elements = new Map<number, { id: number; type: 'frame'; nodeI: number; nodeJ: number; materialId: number; sectionId: number }>();
    for (const [id, e] of m.elements) elements.set(id, { id, type: 'frame', nodeI: e.nodeI, nodeJ: e.nodeJ, materialId: 1, sectionId: 1 });
    for (const id of m.nodes.keys()) elements.set(id + 100, { id: id + 100, type: 'frame', nodeI: id + 100, nodeJ: id, materialId: 1, sectionId: 1 });
    const cases = [{ id: 1, type: 'D', name: 'D' }];
    const def = expandDefinition({
      nodes, elements, quads: new Map(), plates: new Map(), sections: new Map(), groups: new Map(), loadCases: cases,
    }, { caseId: 1, q, target: { by: 'level', z: 3 }, distribution: 'twoWay' }, {}, 1, { leftHand: false });
    expect(def.loads.some((l) => l.type === 'nodal3d')).toBe(true);
    expect(def.totalKN).toBeCloseTo(q * area, 6);
    const md = {
      nodes, elements, loads: def.loads.map((l, i) => ({ ...l, data: { ...l.data, id: i + 1 } })),
      supports: new Map([...m.nodes.keys()].map((id) => [id, { id, nodeId: id + 100, type: 'fixed3d' }])),
      materials: new Map([[1, { id: 1, name: 'H', e: 30000, nu: 0.2, rho: 24 }]]),
      sections: new Map([[1, { id: 1, name: 's', a: 0.09, iz: 6.75e-4, iy: 6.75e-4, j: 1.1e-3 }]]),
      quads: new Map(), plates: new Map(), constraints: [], connectors: new Map(),
    };
    const input = buildSolverInput3D(md as never, false, false, { expandMemberOffsets: false })!;
    const ms = withMassSource(md as never, cases, { kind: 'custom', factors: [{ caseId: 1, factor: 1 }] }, input);
    expect(ms.report.excludedNodalKN).toBeCloseTo(0, 9);
    expect(ms.report.addedT.get(1)! * G).toBeCloseTo(q * area, 6);
  });
});

function rectangularShell(model: LoadModelData, id: number, x0: number, x1: number, z0: number, z1 = z0) {
  const start = 100 + id * 4;
  const corners = [[x0, 0, z0], [x1, 0, z0], [x1, 6, z1], [x0, 6, z1]] as const;
  const nodes = corners.map(([x, y, z], i) => {
    const nodeId = start + i;
    model.nodes.set(nodeId, { id: nodeId, x, y, z });
    return nodeId;
  });
  model.quads ??= new Map();
  model.quads.set(id, { id, nodes });
  return nodes;
}

function deadLoadKN(plan: ReturnType<typeof buildLoadPlan>, model: LoadModelData): number {
  return surfaceKN(plan.surface.filter(load => load.caseType === 'D'), model)
    - totalKN(plan.distributed.filter(load => load.caseType === 'D'), model)
    - plan.nodal.filter(load => load.caseType === 'D').reduce((sum, load) => sum + load.fz, 0);
}

function checkBlockedGravity(model: LoadModelData, reason: EngineMessage, tributaryWidth = 3) {
  const plans = [false, true].map(loadEveryPanel => {
    const gravity = { mode: 'panels', loadEveryPanel } as const;
    const plan = buildLoadPlan(planInput(model, { dead: [{ labelKey: 'a', q: 1 }], gravity, generateCombinations: loadEveryPanel, tributaryWidth }));
    return { gravity, plan };
  });
  const detail = JSON.stringify(plans.map(({ gravity, plan }) => ({
    loadEveryPanel: gravity.loadEveryPanel, outcome: plan.outcome, blockedKeys: plan.blockedKeys,
    appliedDeadKN: deadLoadKN(plan, model), levelDeadKN: plan.levels.map(level => level.superimposedKN),
    gravityNotes: plan.derivation.filter(note => note.key.startsWith('loadPlan.gravity.')),
  })));
  for (const { gravity, plan } of plans) {
    expect(plan.outcome, detail).toBe('BLOCKED');
    expect(plan.blockedKeys).toEqual([reason]);
    expect(teAt(reason, 'en')).not.toBe(reason.key);
    expect(plan).toMatchObject({ cases: [], distributed: [], nodal: [], surface: [], thermal: [], combinations: [], levels: [] });
    expect(() => gravityLayout(model, { ...gravity, tributaryWidth: 3 })).toThrow(expect.objectContaining(reason));
    expect(() => roofWeightFor(model, gravity, 3, 1)).toThrow(expect.objectContaining(reason));
  }
  expect(() => snowDriftRefusal(model)).toThrow(expect.objectContaining(reason));
  const width = buildLoadPlan(planInput(model, { gravity: { mode: 'width' } }));
  expect(width.outcome).toBe('READY');
  expect(width.surface).toEqual([]);
  if (model.elements.size) expect(width.distributed.length).toBeGreaterThan(0);
  else expect(width.distributed).toEqual([]);
}

it('#2284 overlapping coplanar shells load the bay only once', () => {
  const model = floor(1, 1, 10, 6);
  rectangularShell(model, 1, 0, 4, 3);
  rectangularShell(model, 2, 2, 6, 3);
  checkBlockedGravity(model, { key: 'loadPlan.gravity.overlappingShells', params: { first: 1, second: 2 } });
});

it('#2284 overlapping shells with elevation rounding block gravity', () => {
  const model = floor(1, 1, 10, 6);
  rectangularShell(model, 1, 0, 4, 3);
  rectangularShell(model, 2, 2, 6, 3.0000001);
  checkBlockedGravity(model, { key: 'loadPlan.gravity.overlappingShells', params: { first: 1, second: 2 } });
});

it('#2284 shells rounded to different levels can claim the same bay', () => {
  const model = floor(1, 1, 10, 6, 3.001);
  rectangularShell(model, 1, 0, 4, 3.0000001);
  rectangularShell(model, 2, 2, 6, 3.0019999);
  checkBlockedGravity(model, { key: 'loadPlan.gravity.overlappingShells', params: { first: 1, second: 2 } });
});

function cornerOrders(nodes: number[]): number[][] {
  return [nodes, [...nodes].reverse()].flatMap(order =>
    order.map((_, start) => [...order.slice(start), ...order.slice(0, start)]),
  );
}

const differentDeck = { key: 'loadPlan.gravity.differentDeck' };
const overlappingShells = { key: 'loadPlan.gravity.overlappingShells', params: { first: 1, second: 2 } } as const;

for (let first = 0; first < 8; first++) for (let second = 0; second < 8; second++) {
  it(`#2284 round 2 parallel shell-only decks overlap with corner orders ${first}/${second}`, () => {
    const model = floor(0, 0, 10, 6);
    const a = rectangularShell(model, 1, 0, 10, 3.0009996, 3.0019995);
    const b = rectangularShell(model, 2, 0, 10, 3.0010006, 3.0020005);
    model.quads!.get(1)!.nodes = cornerOrders(a)[first]!;
    model.quads!.get(2)!.nodes = cornerOrders(b)[second]!;
    checkBlockedGravity(model, overlappingShells);
  });
}

it('#2284 round 2 partial shell overlap just inside the deck tolerance blocks', () => {
  const model = floor(0, 0, 10, 6);
  rectangularShell(model, 1, 0, 8, 3.0001);
  rectangularShell(model, 2, 2, 10, 3.0010999);
  checkBlockedGravity(model, overlappingShells);
});

it('#2284 round 2 elevations shared by a real overlapping bay block gravity', () => {
  const model = floor(1, 1, 10, 6, 3.001);
  rectangularShell(model, 1, 0, 10, 3.0002);
  rectangularShell(model, 2, 0, 10, 3.0018);
  checkBlockedGravity(model, overlappingShells);
});

for (const [label, model, x0, x1, x2, x3, low, high] of [
  ['outside the deck tolerance', floor(0, 0, 10, 6), 0, 8, 2, 10, 3.0001, 3.0011001],
  ['without a beam bay', floor(0, 0, 10, 6), 0, 10, 0, 10, 3.0002, 3.0018],
  ['with a bay touching the common footprint at its edge', floor(1, 1, 10, 6, 3.001), -5, 0, -5, 10, 3.0002, 3.0018],
] as const) {
  it(`#2284 round 2 overlapping shells within the separation limit: ${label}`, () => {
    rectangularShell(model, 1, x0, x1, low);
    rectangularShell(model, 2, x2, x3, high);
    checkBlockedGravity(model, overlappingShells);
  });
}

for (const [label, low, high] of [
  ['parallel sloped', 3.0001, 3.0021],
  ['sloped and horizontal', 3.0015, 3.0015],
] as const) {
  for (let first = 0; first < 8; first++) for (let second = 0; second < 8; second++) {
    it(`#2284 round 3 ${label} decks overlap with corner orders ${first}/${second}`, () => {
      const model = floor(0, 0, 10, 6);
      const a = rectangularShell(model, 1, 0, 10, 3, 3.002);
      const b = rectangularShell(model, 2, 0, 10, low, high);
      model.quads!.get(1)!.nodes = cornerOrders(a)[first]!;
      model.quads!.get(2)!.nodes = cornerOrders(b)[second]!;
      checkBlockedGravity(model, overlappingShells);
    });
  }
}

it('#2284 round 3 a mixed pair just inside the separation limit blocks', () => {
  const model = floor(0, 0, 10, 6);
  rectangularShell(model, 1, 0, 8, 3, 3.0020001);
  rectangularShell(model, 2, 2, 10, 3.003);
  checkBlockedGravity(model, overlappingShells);
});

it('#2284 round 3 a mixed pair claiming the same beam bay blocks', () => {
  const model = floor(1, 1, 10, 6, 3.0004);
  model.nodes.set(5, { id: 5, x: 0, y: 3, z: 2.9991 });
  model.nodes.set(6, { id: 6, x: 10, y: 3, z: 2.9991 });
  model.quads = new Map([
    [1, { id: 1, nodes: [1, 2, 6, 5] }],
    [2, { id: 2, nodes: [5, 6, 4, 3] }],
  ]);
  const flat = rectangularShell(model, 3, 0, 10, 3.0009);
  flat.forEach((id, i) => { model.nodes.get(id)!.y = i < 2 ? 2.5 : 3.5; });
  checkBlockedGravity(model, { key: 'loadPlan.gravity.overlappingShells', params: { first: 1, second: 3 } });
});

for (const [label, x0, low, high] of [
  ['parallel and outside the separation limit', 0, 3.050001, 3.052001],
  ['mixed and just outside the separation limit', 0, 3.052001, 3.052001],
  ['mixed with only a common edge', 10, 3.0015, 3.0015],
] as const) {
  it(`#2284 round 3 independent shells keep their loads ${label}`, () => {
    const model = floor(0, 0, 10, 6);
    rectangularShell(model, 1, 0, 10, 3, 3.002);
    rectangularShell(model, 2, x0, x0 + 10, low, high);
    for (const loadEveryPanel of [false, true]) {
      const gravity = { mode: 'panels', loadEveryPanel } as const;
      const plan = buildLoadPlan(planInput(model, { dead: [{ labelKey: 'a', q: 1 }], gravity }));
      expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
      expect(plan.blockedKeys).toEqual([]);
      expect(plan.surface.filter(load => load.caseType === 'D').sort((a, b) => a.quadId - b.quadId)).toEqual([
        { quadId: 1, caseType: 'D', q: 1 },
        { quadId: 2, caseType: 'D', q: 1 },
      ]);
      expect(plan.nodal).toEqual([]);
      expect(plan.distributed).toEqual([]);
      expect(deadLoadKN(plan, model)).toBeCloseTo(10 * (Math.hypot(6, 0.002) + Math.hypot(6, high - low)), 9);
    }
  });
}

it('#2284 round 3 a lower shell entirely outside the bay band keeps independent load', () => {
  const model = floor(1, 1, 10, 6, 3);
  rectangularShell(model, 1, 0, 10, 2.9481, 2.9489);
  for (const loadEveryPanel of [false, true]) {
    const gravity = { mode: 'panels', loadEveryPanel } as const;
    const plan = buildLoadPlan(planInput(model, { dead: [{ labelKey: 'a', q: 1 }], gravity }));
    expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
    expect(plan.blockedKeys).toEqual([]);
    expect(plan.surface.filter(load => load.caseType === 'D')).toEqual([{ quadId: 1, caseType: 'D', q: 1 }]);
    expect(plan.nodal).toEqual([]);
    expect(totalKN(plan.distributed.filter(load => load.caseType === 'D'), model)).toBeCloseTo(-60, 9);
  }
});

it('#2284 a shell and bay overlap must have a single established owner', () => {
  const model = floor(1, 1, 10, 6, 3.001);
  rectangularShell(model, 1, 0, 10, 3.0000001);
  rectangularShell(model, 2, 2, 6, 3.0020001);
  checkBlockedGravity(model, overlappingShells);
});

it('#2284 overlapping sloped shells also block gravity', () => {
  const model = floor(1, 0, 10, 6);
  rectangularShell(model, 1, 0, 5, 6, 8);
  rectangularShell(model, 2, 2, 6, 6, 8);
  for (const n of model.nodes.values()) {
    const { x, y } = n;
    n.x = x * Math.cos(0.37) + y * Math.sin(0.37);
    n.y = x * Math.sin(0.37) - y * Math.cos(0.37);
  }
  checkBlockedGravity(model, { key: 'loadPlan.gravity.overlappingShells', params: { first: 1, second: 2 } });
});

it('#2284 touching coplanar shell edges and separate levels keep their surface pressure', () => {
  const model = floor(1, 1, 10, 6);
  rectangularShell(model, 1, 0, 4, 3);
  rectangularShell(model, 2, 4, 10, 3);
  rectangularShell(model, 3, 0, 10, 6);
  const plan = buildLoadPlan(planInput(model, { dead: [{ labelKey: 'a', q: 1 }] }));
  expect(plan.outcome).toBe('READY');
  expect(plan.distributed).toEqual([]);
  expect(plan.nodal).toEqual([]);
  expect(plan.surface.filter(load => load.caseType === 'D')).toEqual(
    [1, 2, 3].map(quadId => ({ quadId, caseType: 'D', q: 1 })),
  );
  expect(plan.levels.map(level => [level.elevation, level.superimposedKN])).toEqual([[3, 60], [6, 60]]);
});

it('#2291 a detached sloped shell starting at bay level blocks gravity', () => {
  const model = floor(1, 1, 10, 6);
  rectangularShell(model, 1, 0, 10, 3, 6);
  checkBlockedGravity(model, differentDeck);
});

it('#2295 a rigidly linked rafter under a centered shell gap blocks gravity', () => {
  const { model } = offsetRoof(0.02, 0, 1, false, [4, 6]);
  checkBlockedGravity(model, { key: 'loadPlan.gravity.unresolvedMember', params: { id: 1 } });
});

function linkedShellBay(z: number, dofs = [0, 1, 2, 3, 4, 5]) {
  const model = floor(1, 1, 10, 6);
  const shell = rectangularShell(model, 1, 0, 10, z);
  model.constraints = [1, 2, 4, 3].map((masterNode, i) => ({
    type: 'rigidLink', masterNode, slaveNode: shell[i]!, dofs,
  }));
  return model;
}

it('#2299 a rigidly linked shell and beam bay receive one dead load', () => {
  checkOwnedFloor(linkedShellBay(3.02), [1], 60);
});

function eccentricShellBay(z: number, releaseVertical = false) {
  const model = linkedShellBay(z);
  model.constraints = (model.constraints ?? []).flatMap(link => {
    if (link.type !== 'rigidLink') return [];
    const master = model.nodes.get(link.masterNode)!;
    const slave = model.nodes.get(link.slaveNode)!;
    return [{
      type: 'eccentricConnection' as const,
      masterNode: link.masterNode,
      slaveNode: link.slaveNode,
      offsetZ: slave.z! - master.z!,
      releases: [false, false, releaseVertical, false, false, false],
    }];
  });
  return model;
}

it('#2299 an equivalent eccentric connection assigns the bay to the shell', () => {
  const model = eccentricShellBay(3.02);
  checkOwnedFloor(model, [1], 60);
});

function connectedShells(upperStart = 0, upperEnd = 10, upperHeight = 3.02) {
  const model = floor(0, 0, 10, 6);
  const lower = rectangularShell(model, 1, 0, 10, 3);
  const upper = rectangularShell(model, 2, upperStart, upperEnd, upperHeight);
  model.constraints = lower.map((masterNode, i) => {
    const slaveNode = upper[i]!;
    return { type: 'eccentricConnection', masterNode, slaveNode,
      offsetX: model.nodes.get(slaveNode)!.x - model.nodes.get(masterNode)!.x, offsetZ: upperHeight - 3 };
  });
  return model;
}

function checkOwnedFloor(model: LoadModelData, owners: number[], expected: number) {
  for (const loadEveryPanel of [false, true]) {
    const gravity = { mode: 'panels', loadEveryPanel } as const;
    const plan = buildLoadPlan(planInput(model, { dead: [{ labelKey: 'a', q: 1 }], gravity, generateCombinations: true }));
    expect(plan.outcome, JSON.stringify({ blocked: plan.blockedKeys, dead: deadLoadKN(plan, model) })).toBe('READY');
    expect(plan.surface.filter(load => load.caseType === 'D').map(load => load.quadId).sort((a, b) => a - b)).toEqual(owners);
    expect(deadLoadKN(plan, model)).toBeCloseTo(expected, 10);
    expect(plan.levels.reduce((total, level) => total + level.superimposedKN, 0)).toBeCloseTo(expected, 10);
    expect(plan.combinations.length).toBeGreaterThan(0);

    const layout = gravityLayout(model, { ...gravity, tributaryWidth: 3 });
    expect(layout.shellQuads.map(quad => quad.quadId).sort((a, b) => a - b)).toEqual(owners);
    expect([...layout.areaByLevel.values()].reduce((total, area) => total + area, 0)).toBeCloseTo(expected, 10);
    expect(roofWeightFor(model, gravity, 3, 1)).toBe('heavy');
    expect(() => snowDriftRefusal(model)).not.toThrow();
  }
}

it('#2299 a connected beam bay gives its covered area to the shell', () => {
  for (const model of [linkedShellBay(3.02), eccentricShellBay(3.02), commonMasterShellBay(3.02)]) {
    checkOwnedFloor(model, [1], 60);
  }
});

it('#2299 subdividing a connected beam bay preserves the shell owner through rotation and reflection', () => {
  for (const angle of [0, 0.37]) for (const mirror of [1, -1]) {
    const model = floor(2, 1, 5, 6);
    const shell = rectangularShell(model, 1, 0, 10, 3.02);
    model.constraints = [1, 3, 6, 4].map((masterNode, i) => ({
      type: 'eccentricConnection', masterNode, slaveNode: shell[i]!, offsetZ: 0.02,
    }));
    for (const node of model.nodes.values()) node.x *= mirror;
    rotatePlan(model, angle);
    checkOwnedFloor(model, [1], 60);
    expect(gravityLayout(model, { mode: 'panels', tributaryWidth: 3 }).areaByLevel.get(3.02)).toBeCloseTo(60, 10);
  }
});

it('#2499 overlapping offset shells refuse automatic ownership', () => {
  checkBlockedGravity(connectedShells(), overlappingShells);
});

for (const [name, mirror, rotate, reverse, subdivide, renumber] of [
  ['rotation', false, 0.37, false, false, false],
  ['mirror and corner reversal', true, 0, true, false, false],
  ['upper shell subdivision', false, 0, false, true, false],
  ['renumbering and reverse insertion', false, 0, true, false, true],
] as const) {
  it(`#2499 ownership refusal survives ${name}`, () => {
    const model = connectedShells();
    if (subdivide) {
      const [a, b, c, d] = model.quads!.get(2)!.nodes;
      const left = 501, right = 502;
      model.nodes.set(left, { id: left, x: 5, y: 0, z: 3.02 });
      model.nodes.set(right, { id: right, x: 5, y: 6, z: 3.02 });
      model.quads!.get(2)!.nodes = [a!, left, right, d!];
      model.quads!.set(3, { id: 3, nodes: [left, b!, c!, right] });
    }
    if (reverse) for (const shell of model.quads!.values()) shell.nodes.reverse();
    if (renumber) {
      model.quads = new Map([...model.quads!.values()].reverse().map(shell => {
        const id = 40 - shell.id;
        return [id, { ...shell, id }];
      }));
    }
    if (mirror) for (const node of model.nodes.values()) node.x = -node.x;
    rotatePlan(model, rotate);
    checkBlockedGravity(model, { key: overlappingShells.key, params: { first: renumber ? 38 : 1, second: renumber ? 39 : 2 } });
  });
}

const verticalTies: Record<string, (masterNode: number, slaveNode: number) => Constraint3D> = {
  'rigid link': (masterNode, slaveNode) => ({ type: 'rigidLink', masterNode, slaveNode }),
  'equal DOF': (masterNode, slaveNode) => ({ type: 'equalDOF', masterNode, slaveNode, dofs: [2] }),
  'vertical diaphragm': (masterNode, slaveNode) => ({ type: 'diaphragm', masterNode, slaveNodes: [slaveNode], plane: 'xz' }),
  'linear equation': (masterNode, slaveNode) => ({ type: 'linearMPC', terms: [
    { nodeId: masterNode, dof: 2, coefficient: 2 },
    { nodeId: slaveNode, dof: 2, coefficient: -2 },
  ] }),
};

for (const [name, tie] of Object.entries(verticalTies)) {
  it(`#2499 a ${name} cannot choose a shell owner`, () => {
    const model = connectedShells();
    const lower = model.quads!.get(1)!.nodes, upper = model.quads!.get(2)!.nodes;
    model.constraints = lower.map((master, i) => tie(master, upper[i]!));
    checkBlockedGravity(model, overlappingShells);
  });
}

it('#2499 roof weight refuses when overlapping shells have no owner', () => {
  const model = connectedShells();
  expect(() => roofWeightFor(model, { mode: 'panels' }, 3, 0)).toThrow(expect.objectContaining(overlappingShells));
});

it('#2499 a gap just beyond the level tolerance does not establish separate decks', () => {
  checkBlockedGravity(connectedShells(0, 10, 3.001001), overlappingShells);
});

it('#2499 near-horizontal overlapping shells refuse in every corner order', () => {
  const model = connectedShells(0, 10, 3.0192);
  for (const node of model.quads!.get(2)!.nodes.slice(2)) model.nodes.get(node)!.z = 3.02;
  model.constraints = model.constraints!.map(link => link.type === 'eccentricConnection'
    ? { ...link, offsetZ: model.nodes.get(link.slaveNode)!.z! - 3 } : link);
  for (const nodes of cornerOrders(model.quads!.get(2)!.nodes)) {
    model.quads!.get(2)!.nodes = nodes;
    checkBlockedGravity(model, overlappingShells);
  }
});

it('#2499 the upper shell is unresolved just inside the shared elevation tolerance', () => {
  checkBlockedGravity(connectedShells(0, 10, 3.000999), overlappingShells);
});

it('#2499 class: two vertically tied beam bays with the same footprint identify both conflicting carriers', () => {
  const model = floor(1, 1, 10, 6);
  for (const node of [...model.nodes.values()]) model.nodes.set(node.id + 10, { ...node, id: node.id + 10, z: 3.02 });
  for (const beam of [...model.elements.values()]) model.elements.set(beam.id + 10,
    { ...beam, id: beam.id + 10, nodeI: beam.nodeI + 10, nodeJ: beam.nodeJ + 10 });
  model.constraints = [1, 2, 3, 4].map(node => verticalTies['rigid link']!(node, node + 10));
  const input = planInput(model, { dead: [{ labelKey: 'a', q: 1 }], generateCombinations: true });
  const plan = buildLoadPlan(input);
  expect(plan.outcome).toBe('BLOCKED');
  expect(plan.blockedKeys).toEqual([{ key: 'loadPlan.gravity.overlappingBays', params: { first: '1, 2, 3, 4', second: '11, 12, 13, 14' } }]);
  expect(plan.distributed).toEqual([]);
  expect(plan.combinations).toEqual([]);
  model.constraints = [];
  expect(buildLoadPlan(input).blockedKeys).toEqual(plan.blockedKeys);
});

it('#2499 class: the case conservation gate blocks a surface pressure that would otherwise be dropped', () => {
  const model = floor(0, 0, 10, 6);
  rectangularShell(model, 1, 0, 10, 3);
  const plan = buildLoadPlan(planInput(model, { dead: [{ labelKey: 'a', q: -1 }], generateCombinations: true }));
  expect(plan.outcome).toBe('BLOCKED');
  expect(plan.blockedKeys).toEqual([{ key: 'loadPlan.gravity.caseResultant', params: { z: 3, action: 'D' } }]);
  expect(plan.surface).toEqual([]);
  expect(plan.combinations).toEqual([]);
  checkOwnedFloor(model, [1], 60);
});

it('#2499 partial overlap cannot load the lower quad uniformly', () => {
  checkBlockedGravity(connectedShells(8, 18), overlappingShells);
});

it('#2499 releasing vertical transfer cannot settle close shell ownership', () => {
  const model = connectedShells();
  model.constraints = model.constraints!.map(link =>
    link.type === 'eccentricConnection' ? { ...link, releases: [false, false, true] } : link);
  checkBlockedGravity(model, overlappingShells);
});

it('#2284 unresolved roundoff-separated shell ownership keeps its translated refusal', () => {
  checkBlockedGravity(connectedShells(0, 10, 3.0000001), overlappingShells);
});

it('#2299 opening the vertical release leaves an ambiguous overlap', () => {
  checkBlockedGravity(eccentricShellBay(3.02, true), differentDeck);
});

it('#2299 a linked shell within the bay elevation band keeps the load on the shell', () => {
  const model = linkedShellBay(3.001);
  const plan = buildLoadPlan(planInput(model, { dead: [{ labelKey: 'a', q: 1 }] }));
  expect(plan.outcome).toBe('READY');
  expect(plan.distributed).toEqual([]);
  expect(plan.nodal).toEqual([]);
  expect(plan.surface.filter(load => load.caseType === 'D')).toEqual([{ quadId: 1, caseType: 'D', q: 1 }]);
});

it('#2299 an independent upper shell and lower deck each carry gravity', () => {
  const model = linkedShellBay(6, [0, 1]);
  const plan = buildLoadPlan(planInput(model, { dead: [{ labelKey: 'a', q: 1 }] }));
  expect(plan.outcome).toBe('READY');
  expect(plan.surface.filter(load => load.caseType === 'D')).toEqual([{ quadId: 1, caseType: 'D', q: 1 }]);
  expect(plan.nodal).toEqual([]);
  for (const [id, area] of [[1, 21], [2, 21], [3, 9], [4, 9]]) {
    expect(totalKN(plan.distributed.filter(load => load.caseType === 'D' && load.elementId === id), model)).toBeCloseTo(-area!, 10);
  }
});

function commonMasterShellBay(z: number, untied?: 'beam' | 'shell') {
  const model = linkedShellBay(z);
  model.constraints = (model.constraints ?? []).flatMap(link => {
    if (link.type !== 'rigidLink') return [];
    const beam = model.nodes.get(link.masterNode)!;
    const masterNode = beam.id + 200;
    model.nodes.set(masterNode, { ...beam, id: masterNode, z: (3 + z) / 2 });
    return [
      { ...link, masterNode, slaveNode: beam.id, dofs: untied === 'beam' ? [0, 1] : link.dofs },
      { ...link, masterNode, dofs: untied === 'shell' ? [0, 1] : link.dofs },
    ];
  });
  return model;
}

function exteriorStripShellBay(edges: number[], disconnected = false) {
  const model = floor(1, 1, 10, 6);
  let previous: number[] | undefined;
  for (let i = 1; i < edges.length; i++) {
    const x0 = edges[i - 1]!;
    const nodes = rectangularShell(model, i, x0, edges[i]!, 3.02);
    if (i === 1) {
      model.constraints = [1, 3].map((masterNode, j) => ({
        type: 'rigidLink', masterNode, slaveNode: nodes[j * 3]!, dofs: [0, 1, 2, 3, 4, 5],
      }));
    }
    if (previous && !(disconnected && x0 === 0)) {
      model.nodes.delete(nodes[0]!);
      model.nodes.delete(nodes[3]!);
      nodes[0] = previous[1]!;
      nodes[3] = previous[2]!;
    }
    previous = nodes;
  }
  return model;
}

it('#2299 a common rigid master connects the beam and offset shell corners', () => {
  checkOwnedFloor(commonMasterShellBay(3.02), [1], 60);
});

it('#2299 an attachment to an exterior strip cannot establish the bay owner', () => {
  checkBlockedGravity(exteriorStripShellBay([-2, 0, 10]), differentDeck);
});

it('#2299 subdividing the exterior strip does not establish bay ownership', () => {
  checkBlockedGravity(exteriorStripShellBay([-2, -1, 0, 10]), differentDeck);
});

it('#2299 common-master shells within the elevation band carry gravity once', () => {
  const model = commonMasterShellBay(3.001);
  const plan = buildLoadPlan(planInput(model, { dead: [{ labelKey: 'a', q: 1 }] }));
  expect(plan.outcome).toBe('READY');
  expect(plan.distributed).toEqual([]);
  expect(plan.nodal).toEqual([]);
  expect(plan.surface.filter(load => load.caseType === 'D')).toEqual([{ quadId: 1, caseType: 'D', q: 1 }]);
  expect(deadLoadKN(plan, model)).toBeCloseTo(10 * 6, 10);
});

it('#2299 breaking a common-master link leaves the deck ambiguous', () => {
  for (const untied of ['beam', 'shell'] as const) {
    const model = commonMasterShellBay(3.02, untied);
    checkBlockedGravity(model, differentDeck);
  }
});

it('#2299 a linked strip touching only the bay edge keeps both loads', () => {
  const model = exteriorStripShellBay([-2, 0]);
  const plan = buildLoadPlan(planInput(model, { dead: [{ labelKey: 'a', q: 1 }] }));
  expect(plan.outcome).toBe('READY');
  expect(plan.surface.filter(load => load.caseType === 'D')).toEqual([{ quadId: 1, caseType: 'D', q: 1 }]);
  expect(deadLoadKN(plan, model)).toBeCloseTo((10 + 2) * 6, 10);
});

it('#2299 the unattached shell over a bay with an exterior strip is ambiguous', () => {
  checkBlockedGravity(exteriorStripShellBay([-2, 0, 10], true), differentDeck);
});

function tiedExteriorStripShellBay(useCommonMaster: boolean, dofs?: number[], masterOffset = 0) {
  const model = exteriorStripShellBay([-2, 0, 10], true);
  const strip = model.quads!.get(1)!.nodes;
  const interior = model.quads!.get(2)!.nodes;
  const ties = [[strip[1]!, interior[0]!], [strip[2]!, interior[3]!]] as const;
  model.constraints = [...model.constraints!, ...ties.flatMap(([stripNode, interiorNode], i) => {
    const masterNode = useCommonMaster ? 200 + i : stripNode;
    if (useCommonMaster) {
      const seam = model.nodes.get(stripNode)!;
      model.nodes.set(masterNode, { ...seam, id: masterNode, x: seam.x + masterOffset, z: (seam.z ?? 0) + masterOffset });
    }
    return (useCommonMaster ? [stripNode, interiorNode] : [interiorNode]).map(slaveNode => ({
      type: 'rigidLink' as const, masterNode, slaveNode, dofs,
    }));
  })];
  return model;
}

const allShellDofs = [0, 1, 2, 3, 4, 5];

it('#2299 a tie in six DOFs at the strip seam does not establish bay ownership', () => {
  checkBlockedGravity(tiedExteriorStripShellBay(false, allShellDofs), differentDeck);
});

it('#2347 offset seam masters do not establish bay ownership', () => {
  checkBlockedGravity(tiedExteriorStripShellBay(true, allShellDofs, 0.25), differentDeck);
});

it('#2299 coincident seam masters do not establish bay ownership', () => {
  checkBlockedGravity(tiedExteriorStripShellBay(true, allShellDofs), differentDeck);
});

it('#2347 rotating a rigid chain across an offset seam preserves the refusal', () => {
  const model = tiedExteriorStripShellBay(true, allShellDofs, -0.25);
  model.constraints = model.constraints!.flatMap(link => {
    if (link.type !== 'rigidLink' || link.slaveNode !== model.quads!.get(2)!.nodes[0]) return [link];
    const intermediate = 300;
    model.nodes.set(intermediate, { id: intermediate, x: -0.5, y: 0, z: 3.25 });
    return [{ ...link, slaveNode: intermediate }, { ...link, masterNode: intermediate }];
  });
  rotatePlan(model, 0.37);
  checkBlockedGravity(model, differentDeck);
});

it('#2347 one ULP at a fully tied seam preserves the refusal', () => {
  for (const useCommonMaster of [false, true]) {
    const model = tiedExteriorStripShellBay(useCommonMaster, allShellDofs, 0.25);
    for (const id of model.quads!.get(2)!.nodes) model.nodes.get(id)!.z! += 2 ** -51;
    checkBlockedGravity(model, differentDeck);
  }
});

it('#2347 a seam just inside the point tolerance leaves ownership unresolved', () => {
  const model = tiedExteriorStripShellBay(true, allShellDofs, 0.25);
  for (const id of model.quads!.get(2)!.nodes) model.nodes.get(id)!.z! += 0.999e-8;
  checkBlockedGravity(model, differentDeck);
});

it('#2347 a seam just outside the point tolerance leaves ownership unresolved', () => {
  const model = tiedExteriorStripShellBay(true, allShellDofs, 0.25);
  for (const id of model.quads!.get(2)!.nodes) model.nodes.get(id)!.z! += 1.001e-8;
  checkBlockedGravity(model, differentDeck);
});

it('#2347 breaking a seam tie leaves ownership unresolved', () => {
  const model = tiedExteriorStripShellBay(true, allShellDofs, 0.25);
  const inner = model.quads!.get(2)!.nodes;
  model.constraints = model.constraints!.map(link =>
    link.type === 'rigidLink' && inner.includes(link.slaveNode) ? { ...link, dofs: [0, 1, 2, 3, 4] } : link);
  checkBlockedGravity(model, differentDeck);
});

it('#2347 horizontal offsets across a seam leave ownership unresolved', () => {
  const model = tiedExteriorStripShellBay(true, allShellDofs, 0.25);
  for (const id of model.quads!.get(2)!.nodes) model.nodes.get(id)!.y += 0.25;
  checkBlockedGravity(model, differentDeck);
});

it('#2299 a free rotation at a seam leaves ownership unresolved', () => {
  for (const dofs of [[0, 1, 2, 3, 4], [0, 1, 2, 3, 4, 4], [], undefined]) {
    checkBlockedGravity(tiedExteriorStripShellBay(false, dofs), differentDeck);
  }
});

it('#2299 ties at different seam heights leave ownership unresolved', () => {
  const model = tiedExteriorStripShellBay(false, allShellDofs);
  for (const nodeId of model.quads!.get(2)!.nodes) model.nodes.get(nodeId)!.z! += 1 / 2048;
  checkBlockedGravity(model, differentDeck);
});

it('#2299 a seam within the level tolerance cannot decide bay ownership', () => {
  const model = tiedExteriorStripShellBay(false, allShellDofs);
  for (const quad of model.quads!.values()) for (const id of quad.nodes) model.nodes.get(id)!.z = 3.001;
  checkBlockedGravity(model, differentDeck);
});

function rotatePlan(model: GravityModel, angle: number): void {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  for (const node of model.nodes.values()) {
    const { x, y } = node;
    node.x = cos * x - sin * y;
    node.y = sin * x + cos * y;
  }
}

function subdivideMembers(model: LoadModelData, cuts: readonly number[]): void {
  let nodeId = Math.max(...model.nodes.keys()) + 1;
  let elementId = Math.max(...model.elements.keys()) + 1;
  for (const element of [...model.elements.values()]) {
    const a = model.nodes.get(element.nodeI)!, b = model.nodes.get(element.nodeJ)!;
    let start = a.id;
    for (const t of cuts) {
      const id = nodeId++;
      model.nodes.set(id, { id, x: (1 - t) * a.x + t * b.x, y: (1 - t) * a.y + t * b.y, z: (1 - t) * (a.z ?? 0) + t * (b.z ?? 0) });
      const next = elementId++;
      model.elements.set(next, { ...element, id: next, nodeI: start, nodeJ: id });
      start = id;
    }
    model.elements.set(element.id, { ...element, nodeI: start });
  }
}

it('#2254 the geodesic dome refuses indeterminate gravity carrier selection in every orientation', async () => {
  const fixture = (await import('../../../templates/fixtures/geodesic-dome.json')).default;
  const base: LoadModelData = {
    ...fixtureModel(fixture),
    nodes: new Map(fixture.nodes.map(n => [n.id, { ...n }])),
    elements: new Map(fixture.elements.map(e => [e.id, {
      ...e, type: e.type === 'truss' ? 'truss' as const : 'frame' as const,
    }])),
    sections: new Map(fixture.sections.map(s => [s.id, s])),
    materials: new Map(fixture.materials.map(m => [m.id, m])),
    loadCases: [{ id: 1, type: 'D', name: 'D' }],
  };
  for (const [angle, mirror, cuts] of [
    [0, false, []], [0.37, false, []], [0.61, true, []], [0, false, [0.125, 0.5, 0.875]],
  ] as const) {
    const model = structuredClone(base);
    if (cuts.length) subdivideMembers(model, cuts);
    if (mirror) for (const node of model.nodes.values()) node.x *= -1;
    rotatePlan(model, angle);
    const plan = buildLoadPlan(planInput(model, { dead: [{ labelKey: 'a', q: 1 }], tributaryWidth: 1,
      gravity: { mode: 'panels', loadEveryPanel: true } }));
    expect(plan.outcome).toBe('BLOCKED');
    expect(plan.blockedKeys).toEqual([expect.objectContaining({ key: 'loadPlan.gravity.memberSlopeLimit' })]);
    expect(plan).toMatchObject({ cases: [], distributed: [], nodal: [], surface: [], levels: [] });
  }
});

it('#2254 gravity refuses an indeterminate carrier at the beam slope limit', () => {
  const model = floor(1, 0, Math.sqrt(3), 6);
  model.nodes.get(2)!.z = 4;
  const expected = { key: 'loadPlan.gravity.memberSlopeLimit', params: { id: 1 } };
  for (const mode of ['panels', 'width'] as const) {
    const gravity = { mode };
    const plan = buildLoadPlan(planInput(model, { gravity }));
    expect(plan.outcome).toBe('BLOCKED');
    expect(plan.blockedKeys).toEqual([expected]);
    expect(plan).toMatchObject({ cases: [], distributed: [], nodal: [], surface: [], levels: [] });
    expect(() => gravityLayout(model, { ...gravity, tributaryWidth: 3 })).toThrow(expect.objectContaining(expected));
    expect(() => roofWeightFor(model, gravity, 3, 1)).toThrow(expect.objectContaining(expected));
  }
});

it('#2254 clear carrier slopes on both sides of the limit retain their member loads', () => {
  const limit = Math.sqrt(3);
  const below = limit + 0.01;
  const above = limit - 0.01;
  const width = 3;
  const q = 2;
  for (const angle of [0, 0.37]) for (const cuts of [[], [0.17, 0.63]]) {
    const model = floor(1, 0, below, 6);
    model.nodes.get(2)!.z = 4;
    model.nodes.set(3, { id: 3, x: 0, y: 10, z: 3 });
    model.nodes.set(4, { id: 4, x: above, y: 10, z: 4 });
    model.elements.set(2, { ...model.elements.get(1)!, id: 2, nodeI: 3, nodeJ: 4, sectionId: 2 });
    const steep = new Set([2, ...(cuts.length ? [5, 6] : [])]);
    subdivideMembers(model, cuts);
    rotatePlan(model, angle);
    for (const mode of ['panels', 'width'] as const) {
      const plan = buildLoadPlan(planInput(model, { tributaryWidth: width, gravity: { mode } }));
      expect(plan.outcome).toBe('READY');
      const carriers = [...model.elements.keys()].filter(id => !steep.has(id)).sort();
      const length = Math.hypot(below, 1);
      for (const [caseType, pressure, frame, carrierLength] of [
        ['D', q, 'global', length], ['L', plan.factors.occupancy.value, 'projected', below],
      ] as const) {
        const loads = plan.distributed.filter(load => load.caseType === caseType);
        expect(loads.map(load => load.elementId).sort()).toEqual(carriers);
        for (const load of loads) expect(load).toMatchObject({ q: -pressure * width, frame });
        expect(totalKN(loads, model)).toBeCloseTo(-pressure * width * carrierLength, 10);
      }
      expect(plan.surface).toEqual([]);
      expect(plan.nodal).toEqual([]);
    }
  }
});

it('#2512 a single shared vertical restraint preserves both platform loads', () => {
  for (const tie of Object.values(verticalTies)) {
    const model = connectedShells(0, 10, 6);
    model.nodes.set(900, { id: 900, x: -1, y: -1, z: 0 });
    const lower = model.quads!.get(1)!.nodes;
    const upper = model.quads!.get(2)!.nodes;
    for (const stations of [1, 4]) {
      model.constraints = [...lower.slice(0, stations), ...upper.slice(0, stations)].map(node => tie(900, node));
      checkOwnedFloor(model, [1, 2], 120);
    }
  }
});

it('#2512 two aligned stations are insufficient to choose a shell owner', () => {
  const model = connectedShells();
  model.constraints = model.constraints!.slice(0, 2);
  checkBlockedGravity(model, overlappingShells);
});

for (const end of [10, 6]) it(`#2512 shell-owned bay area cannot mask a lower roof at x=${end}`, () => {
  const roof = { use: 'maintenance', weight: 'heavy', dead: 1, slopeDeg: 0 } as const;
  for (const loadEveryPanel of [false, true]) {
    const model = linkedShellBay(2.96);
    const shell = model.quads!.get(1)!;
    for (const id of shell.nodes) {
      const node = model.nodes.get(id)!;
      if (node.x === 10) node.x = end;
    }
    if (end < 10) model.constraints = model.constraints!.filter(link => link.type === 'rigidLink' && [1, 3].includes(link.masterNode));
    const input = { roof, dead: [{ labelKey: 'a', q: 1 }], gravity: { mode: 'panels', loadEveryPanel } as const };
    const isolated = buildLoadPlan(planInput({ ...model, elements: new Map() }, input));
    const expectedRoof = isolated.surface.filter(load => load.caseType === 'Lr');
    expect(expectedRoof).toHaveLength(1);
    const plan = buildLoadPlan(planInput(model, input));
    if (end === 10) {
      expect(plan.blockedKeys).toEqual([{ key: 'loadPlan.blocked.concentratedRoof' }]);
      expect(plan.surface.filter(load => load.caseType === 'Lr')).toEqual(expectedRoof);
      expect(surfaceKN(plan.surface.filter(load => load.caseType === 'Lr'), model)).toBeGreaterThan(0);
      expect(deadLoadKN(plan, model)).toBeCloseTo(60, 10);
      expect(gravityLayout(model, { ...input.gravity, tributaryWidth: 3 }).roofQuads.has(1)).toBe(true);
    } else {
      checkBlockedGravity(model, differentDeck);
    }

    for (const id of shell.nodes) model.nodes.get(id)!.z = 2.8;
    const separate = buildLoadPlan(planInput(model, input));
    expect(separate.blockedKeys).toEqual(isolated.blockedKeys);
    expect(separate.surface.filter(load => load.caseType === 'Lr')).toEqual([]);
    expect(deadLoadKN(separate, model)).toBeCloseTo(60 + 6 * end, 10);
  }
});

function concaveBayWithUnresolvedTransfer() {
  const model = floor(0, 0, 10, 6);
  model.nodes.clear();
  const corners = [[8, 0], [4.3, 2.5], [2.5, 4.3], [0, 1], [-4.5, 7.8], [-7.8, 4.5],
    [-1, 0], [-4.3, -2.5], [-4, -6.9], [0, -7], [1.5, -2.6], [3.5, -2]];
  corners.forEach(([x, y], i) => {
    const id = i + 1;
    model.nodes.set(id, { id, x: x!, y: y!, z: 3 });
    model.elements.set(id, { id, nodeI: id, nodeJ: (id % corners.length) + 1, sectionId: 1, materialId: 1 });
  });
  return model;
}

it('#2512 a positive bay with null tributary transfer blocks gravity', () => {
  const model = concaveBayWithUnresolvedTransfer();
  const beams: FloorBeam[] = [...model.elements.values()].map(beam => ({ ...beam, sectionId: beam.sectionId ?? 1, type: 'frame' }));
  const floorResult = floorLoad({ nodes: model.nodes, beams, q: 1, distribution: 'twoWay' });
  expect(floorResult.panels).toHaveLength(1);
  expect(floorResult.panels[0]).toMatchObject({ area: 83.55, loaded: false, reason: 'unresolved' });
  expect(floorResult.totalKN).toBe(0);
  checkBlockedGravity(model, { key: 'loadPlan.gravity.areaResultant', params: { z: 3 } }, 1);
});

it('#2512 the concave bay conserves the full footprint when a valid one-way transfer is selected', () => {
  const model = concaveBayWithUnresolvedTransfer();
  const gravity = { mode: 'panels', slab: 'oneWay', spanAxis: 'x', loadEveryPanel: true } as const;
  const plan = buildLoadPlan(planInput(model, { gravity, dead: [{ labelKey: 'a', q: 1 }] }));
  expect(plan.outcome).toBe('READY');
  expect(deadLoadKN(plan, model)).toBeCloseTo(83.55, 10);
});

function planWithScaledBayTransfer(model: LoadModelData, scale: number) {
  const prepare = floorLoads.preparePhysicalFloorLoad;
  const mock = vi.spyOn(floorLoads, 'preparePhysicalFloorLoad').mockImplementation(input => {
    const floor = prepare(input);
    return { ...floor, generate: ownership => {
      const result = floor.generate(ownership);
      if (!ownership) return result;
      for (const panel of result.panels) {
        if (!panel.own) continue;
        if (scale === 0) {
          panel.loaded = false;
          delete panel.own;
        } else {
          panel.own.loads = panel.own.loads.map(load => ({ ...load, qI: scale * load.qI, qJ: scale * load.qJ }));
        }
      }
      return result;
    } };
  });
  try {
    return buildLoadPlan(planInput(model, { dead: [{ labelKey: 'a', q: 1 }], tributaryWidth: 1,
      gravity: { mode: 'panels', loadEveryPanel: true }, generateCombinations: true }));
  } finally {
    mock.mockRestore();
  }
}

it('#2512 a positive bay with no emitted transfer blocks gravity', () => {
  const model = floor(1, 1, 10, 6);
  expect(planWithScaledBayTransfer(model, 1).outcome).toBe('READY');
  const plan = planWithScaledBayTransfer(model, 0);
  expect(plan.outcome, JSON.stringify({ dead: deadLoadKN(plan, model), expected: 60 })).toBe('BLOCKED');
  expect(plan.blockedKeys).toEqual([{ key: 'loadPlan.gravity.areaResultant', params: { z: 3 } }]);
  expect(plan).toMatchObject({ cases: [], distributed: [], nodal: [], surface: [], combinations: [] });
});

for (const shellEnd of [0, 6]) it(`#2512 the area gate checks incomplete and excess transfer with a separated shell of extent ${shellEnd}`, () => {
  const model = floor(1, 1, 10, 6);
  if (shellEnd > 0) rectangularShell(model, 1, 0, shellEnd, 6);
  const control = planWithScaledBayTransfer(model, 1);
  expect(control.outcome).toBe('READY');
  expect(deadLoadKN(control, model)).toBeCloseTo(60 + shellEnd * 6, 10);
  for (const scale of [0.5, 1.5]) {
    const plan = planWithScaledBayTransfer(model, scale);
    expect(plan.outcome).toBe('BLOCKED');
    expect(plan.blockedKeys).toEqual([{ key: 'loadPlan.gravity.areaResultant', params: { z: 3 } }]);
    expect(plan).toMatchObject({ cases: [], distributed: [], nodal: [], surface: [], combinations: [] });
  }
});

it('#2512 a fixed restraint shared by several stations keeps both platform loads', () => {
  for (const tie of Object.values(verticalTies)) {
    const model = connectedShells(0, 10, 6);
    const lower = model.quads!.get(1)!.nodes, upper = model.quads!.get(2)!.nodes;
    const masterNode = 900;
    model.nodes.set(masterNode, { id: masterNode, x: -1, y: -1, z: 0 });
    const support = { id: 1, nodeId: masterNode, type: 'fixed3d' as const };
    model.supports = new Map([[1, support]]);
    model.constraints = [
      ...[...lower.slice(0, 3), ...upper.slice(0, 3)].map(node => tie(masterNode, node)),
      tie(lower[3]!, upper[3]!),
    ];
    checkOwnedFloor(model, [1, 2], 120);
  }
});

function splitEccentricLinks(model: LoadModelData, released = false) {
  let nextId = Math.max(...model.nodes.keys()) + 1;
  model.constraints = model.constraints!.flatMap<Constraint3D>(link => {
    if (link.type !== 'eccentricConnection') return [link];
    const a = model.nodes.get(link.masterNode)!, b = model.nodes.get(link.slaveNode)!;
    const point = { id: nextId++, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z! + b.z!) / 2 };
    model.nodes.set(point.id, point);
    return [
      { ...link, slaveNode: point.id, offsetX: point.x - a.x, offsetY: point.y - a.y, offsetZ: point.z - a.z! },
      { ...link, masterNode: point.id, offsetX: b.x - point.x, offsetY: b.y - point.y, offsetZ: b.z! - point.z, releases: [false, false, released] },
    ];
  });
}

it('#2512 a split shifted eccentric deck has the direct connection’s ownership', () => {
  const model = connectedShells(2, 12);
  const split = structuredClone(model);
  splitEccentricLinks(split);
  checkBlockedGravity(model, overlappingShells);
  checkBlockedGravity(split, overlappingShells);
  const released = structuredClone(model);
  splitEccentricLinks(released, true);
  checkBlockedGravity(released, overlappingShells);
});

it('#2512 a split eccentric rafter attachment keeps the shell as carrier', () => {
  const { model } = offsetRoof(0.02);
  const input = planInput(model, { dead: [{ labelKey: 'a', q: 1 }] });
  const direct = buildLoadPlan(input);
  expect(direct.outcome).toBe('READY');
  expect(direct.distributed.filter(load => load.caseType === 'D')).toEqual([]);
  const constraints: Constraint3D[] = model.constraints.map(link => ({
    type: 'eccentricConnection', masterNode: link.masterNode, slaveNode: link.slaveNode, offsetZ: -0.02,
  }));
  const split = { ...model, constraints };
  splitEccentricLinks(split);
  const plan = buildLoadPlan({ ...input, model: split });
  expect(plan.outcome).toBe('READY');
  expect(plan.distributed).toEqual(direct.distributed);
  expect(plan.surface).toEqual(direct.surface);
  const released = { ...structuredClone(model), constraints };
  splitEccentricLinks(released, true);
  expect(buildLoadPlan({ ...input, model: released }).distributed.some(load => load.caseType === 'D')).toBe(true);
});

it('#2512 roof coverage follows the shell boundary in both gravity modes', () => {
  for (const mode of ['width', 'panels'] as const) for (const edge of [5.01, 5, 4.99]) {
    const model = floor(0, 0, 10, 6);
    rectangularShell(model, 1, 0, 10, 3);
    rectangularShell(model, 2, edge, 10, 6);
    const layout = gravityLayout(model, { mode, tributaryWidth: 3 });
    expect(layout.roofQuads.has(1)).toBe(edge > 5);
    if (mode === 'width') continue;
    const area = planAreaLoads({
      layout, tributaryWidth: 3, floor: { dead: 1, lo: 0, liveOf: () => 0 },
      roof: { use: 'occupancy', weight: 'heavy', dead: 2, slopePercent: 0 },
    });
    expect(area.surface.find(load => load.quadId === 1 && load.caseType === 'D')?.q).toBe(edge > 5 ? 2 : 1);
  }
});

it('#2512 a plane member does not cover a point beyond its endpoint', () => {
  for (const mode of ['width', 'panels'] as const) for (const edge of [5.01, 5, 4.99]) {
    const model = floor(1, 0, 10, 6);
    model.nodes.set(3, { id: 3, x: edge, y: 0, z: 6 });
    model.nodes.set(4, { id: 4, x: 10, y: 0, z: 6 });
    model.elements.set(2, { ...model.elements.get(1)!, id: 2, nodeI: 3, nodeJ: 4 });
    const layout = gravityLayout(model, { mode, tributaryWidth: 1 });
    expect(layout.roof.has(1)).toBe(edge > 5);
  }
});

it('#2512 case accounting refuses lost and excess emitted panel loads', () => {
  const model = floor(1, 1, 10, 6);
  const input = planInput(model, { dead: [{ labelKey: 'a', q: 1 }], generateCombinations: true });
  expect(deadLoadKN(buildLoadPlan(input), model)).toBeCloseTo(60, 10);
  for (const scale of [0, 0.5, 1.5]) {
    const mock = vi.spyOn(gravityPlanner, 'gravityLayout').mockImplementation((m, options) => {
      const checked = gravityLayoutBeforeFault(m, options);
      return { ...checked, pieces: scale === 0 ? [] : checked.pieces.map(piece => ({ ...piece, wI: piece.wI * scale, wJ: piece.wJ * scale })) };
    });
    try {
      const plan = buildLoadPlan(input);
      expect(plan.outcome, JSON.stringify({ dead: deadLoadKN(plan, model) })).toBe('BLOCKED');
      expect(plan.blockedKeys).toEqual([{ key: 'loadPlan.gravity.caseResultant', params: { z: 3, action: 'D' } }]);
      expect(plan).toMatchObject({ cases: [], distributed: [], nodal: [], surface: [], combinations: [] });
    } finally {
      mock.mockRestore();
    }
  }
});

const gravityLayoutBeforeFault = gravityLayout;
