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
    const area = [...g.areaOf.values()].reduce((s, a) => s + a, 0);
    expect(area).toBeCloseTo(24, 6);
    // Short sides (4 m) take a triangle of height 2: 4 m²; long sides the rest, 8 m² each.
    const byLen = [...g.areaOf].map(([id, a]) => {
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
