/*
 * A mat foundation is plates and nothing else.
 *
 * Modelling one correctly means keeping the shells, giving them a thickness,
 * and deleting the bars — and until this test existed, doing that produced a
 * model PRO would not solve. The Calcular command never even enabled, because
 * `hasModel` counted FRAME elements, and beneath it `buildSolverInput3D`
 * refused any model with `elements.size < 1` regardless of what else carried
 * load. `inclined-shell.test.ts` says so in its own header and works around it
 * by adding edge beams a ramp does not need.
 *
 * The refusal was in the JS that builds the solver's input, not in the solver:
 * shell stiffness is assembled from `quads`, and nothing in that path wants a
 * frame element to exist. So the gate is what changed, and this is what says
 * it may not come back.
 */
import { describe, it, expect } from 'vitest';
import { validateAndSolve3D, buildSolverInput3D } from '../solver-service';

/** A 2 × 2 grid of quads — a 4 m × 4 m raft — pinned at its four corners. */
function raft() {
  const m: any = {
    name: '',
    nodes: new Map(),
    materials: new Map([[1, { id: 1, name: 'H25', e: 30_000_000, nu: 0.2, rho: 0, fy: 25_000 }]]),
    sections: new Map([[1, { id: 1, name: 'S', a: 0.04, iy: 1.3e-4, iz: 1.3e-4, j: 2e-4, b: 0.2, h: 0.2 }]]),
    elements: new Map(),
    supports: new Map(),
    loads: [] as any[],
    plates: new Map(),
    quads: new Map(),
    constraints: [] as any[],
    loadCases: [],
    combinations: [],
  };
  let id = 0;
  const at = new Map<string, number>();
  for (let iy = 0; iy <= 2; iy++) {
    for (let ix = 0; ix <= 2; ix++) {
      m.nodes.set(++id, { id, x: ix * 2, y: iy * 2, z: 0 });
      at.set(`${ix},${iy}`, id);
    }
  }
  const n = (ix: number, iy: number) => at.get(`${ix},${iy}`)!;
  let q = 0;
  for (let iy = 0; iy < 2; iy++) {
    for (let ix = 0; ix < 2; ix++) {
      q++;
      m.quads.set(q, {
        id: q,
        nodes: [n(ix, iy), n(ix + 1, iy), n(ix + 1, iy + 1), n(ix, iy + 1)],
        materialId: 1,
        thickness: 0.3,
      });
    }
  }
  // Pinned at the four corners: enough to hold the raft without pretending
  // there is soil under it, which is a separate model.
  let s = 0;
  for (const [ix, iy] of [[0, 0], [2, 0], [2, 2], [0, 2]] as const) {
    m.supports.set(++s, { id: s, nodeId: n(ix, iy), type: 'fixed' });
  }
  for (let i = 1; i <= q; i++) {
    m.loads.push({ type: 'surface3d', data: { id: i, quadId: i, q: -10, caseId: 1 } });
  }
  return m;
}

describe('a model made only of shells', () => {
  it('builds a solver input, with no frame element anywhere in it', () => {
    const m = raft();
    expect(m.elements.size, 'the point of the fixture').toBe(0);
    const input = buildSolverInput3D(m, false);
    expect(input, 'a raft is a model, and used to build as null').not.toBeNull();
  });

  it('solves, with finite displacements and recovered shell stresses', () => {
    const r = validateAndSolve3D(raft(), false) as any;
    // A string here is the refusal message, which is the defect itself.
    expect(typeof r, typeof r === 'string' ? String(r) : '').not.toBe('string');

    expect(r.displacements.length).toBe(9);
    for (const d of r.displacements) {
      expect(Number.isFinite(d.ux)).toBe(true);
      expect(Number.isFinite(d.uy)).toBe(true);
      expect(Number.isFinite(d.uz)).toBe(true);
    }
    // It actually deflects: a raft under 10 kN/m² that does not move has not
    // been solved, it has been fixed everywhere.
    const mid = r.displacements.find((d: any) => d.nodeId === 5);
    expect(Math.abs(mid.uz), 'the middle of the raft deflects').toBeGreaterThan(0);

    const qs = r.quadStresses;
    const n = qs ? (Array.isArray(qs) ? qs.length : (qs.size ?? Object.keys(qs).length)) : 0;
    expect(n, 'shell stresses come back for every quad').toBeGreaterThan(0);
  });

  it('still refuses a model with no load-carrying element at all', () => {
    const m = raft();
    m.quads = new Map();
    expect(buildSolverInput3D(m, false), 'nodes and supports are not a structure').toBeNull();
  });
});
