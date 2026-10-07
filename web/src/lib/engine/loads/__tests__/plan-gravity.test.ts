import { describe, it, expect } from 'vitest';
import { gravityLayout, type GravityModel } from '../plan-gravity';
import { floorLoad, type FloorBeam } from '../floor-loads';
import { expandDefinition } from '../../../model/loads/floor-definitions';
import { buildSolverInput3D } from '../../solver-service';
import { withMassSource } from '../../dynamics/mass-source-model';
import { G } from '../../dynamics/requests';
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
function gable(n: number): LoadModelData {
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

describe('a ring of beams under a roof of shells', () => {
  it('the eave ring takes no area load, however many quads make up each slope', () => {
    for (const n of [1, 2, 3]) {
      const m = gable(n);
      const p = buildLoadPlan(planInput(m));
      expect(totalKN(p.distributed.filter((d) => d.caseType === 'D'), m)).toBeCloseTo(0, 6);
      expect(totalKN(p.distributed.filter((d) => d.caseType === 'L'), m)).toBeCloseTo(0, 6);
      // The shells carry the roof: 2 kN/m² over their surface.
      const surface = Math.hypot(5, 2) * 10 * 2;
      expect(surfaceKN(p.surface.filter((s) => s.caseType === 'D'), m)).toBeCloseTo(2 * surface, 3);
    }
  });

  it('a slab over part of a bay leaves the rest of the bay to its beams', () => {
    // One 10 × 10 bay at z = 3; a slab of shells over x 0 to 4 only.
    const m = floor(1, 1, 10, 10);
    for (const [id, x, y] of [[10, 4, 0], [11, 4, 10]] as const) m.nodes.set(id, { id, x, y, z: 3 });
    const quads = new Map([[1, { id: 1, nodes: [1, 10, 11, 3] }]]);
    const p = buildLoadPlan(planInput({ ...m, quads }));
    const onBeams = -totalKN(p.distributed.filter((d) => d.caseType === 'D'), m);
    const onShells = surfaceKN(p.surface.filter((s) => s.caseType === 'D'), { ...m, quads });
    expect(onShells).toBeCloseTo(2 * 40, 6);
    // The bay is loaded once: 2 kN/m² over 100 m², the slab's 40 m² on the shells.
    expect(onBeams + onShells).toBeCloseTo(2 * 100, 0);
    expect(p.derivation.some((d) => d.key === 'loadPlan.gravity.partlyUnderShells')).toBe(true);
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
    // A gable of shells over its ring (dead load per m² of sloped shell, live per m² of plan), and
    // gable frames whose rafters are loaded by width, standing on supports at z = 0.
    for (const m of [gable(2), gableFrames()]) {
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
    const want: Array<[string, number]> = [['pipe-rack', 1890], ['3d-nave-industrial', 2988], ['suspension-bridge', 34896.6]];
    for (const [id, area] of want) {
      const f = (await import(`../../../templates/fixtures/${id}.json`)).default;
      expect(collected(gravityLayout(fixtureModel(f), { mode: 'panels', tributaryWidth: 3 })), id).toBeCloseTo(area, 6);
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
    const g = gravityLayout(m, { mode: 'panels', tributaryWidth: 3 });
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
