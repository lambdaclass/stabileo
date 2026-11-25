/**
 * Influence lines and moving loads, against closed-form solutions.
 *
 * The companion to `advanced-analyses-numeric.test.ts`, for the two analyses
 * whose classical answers are the most familiar in the subject — and which had
 * no numerical validation either.
 *
 * The moving-load case also pins the defect this file was written alongside:
 * the per-element envelope was built from element END values, so a simply
 * supported span modelled as one member reported an envelope moment of 1e-14
 * where the real answer is PL/4. The viewport draws the pointwise curves and
 * never read that map, so nothing showed it.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { initSolver, solve } from '../wasm-solver';
import { computeInfluenceLine } from '../influence-service';
import { computeDiagramValueAt } from '../diagrams';
import { solveMovingLoads, solveMovingLoadsAsync, PREDEFINED_TRAINS, type MovingLoadEnvelope } from '../moving-loads';
import type { SolverInput } from '../types';

beforeAll(async () => { await initSolver(); });

/** Steel, in the units the model stores: E in MPa. */
const E = 200_000;
const I = 9.8e-5;
const A = 0.0069;

/** A model as the STORE holds it — influence lines take a ModelData. */
function modelBeam(L: number, n: number) {
  const nodes = new Map<number, unknown>(), elements = new Map<number, unknown>();
  for (let i = 0; i <= n; i++) nodes.set(i + 1, { id: i + 1, x: (L * i) / n, y: 0 });
  for (let i = 0; i < n; i++) {
    elements.set(i + 1, { id: i + 1, nodeI: i + 1, nodeJ: i + 2, materialId: 1, sectionId: 1, type: 'frame', releaseI: {}, releaseJ: {} });
  }
  return {
    nodes, elements,
    materials: new Map([[1, { id: 1, e: E, nu: 0.3, rho: 78.5 }]]),
    sections: new Map([[1, { id: 1, a: A, iz: I, iy: I }]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'pinned' }], [2, { id: 2, nodeId: n + 1, type: 'rollerX' }]]),
    loads: [], plates: new Map(), quads: new Map(),
  } as never;
}

/** A SolverInput — moving loads takes one of these, and its nodes carry `z`. */
function solverBeam(L: number): SolverInput {
  return {
    nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: L, z: 0 }]]),
    elements: new Map([[1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
    materials: new Map([[1, { id: 1, e: E, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: A, iz: I }]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'pinned' as const }], [2, { id: 2, nodeId: 2, type: 'rollerX' as const }]]),
    loads: [],
  };
}

// ─── Premise ───────────────────────────────────────────────────────

describe('the model is what the tests below assume', () => {
  it('a point load at midspan gives PL/4', () => {
    const m = modelBeam(10, 10) as never as Record<string, unknown>;
    const r = solve({
      nodes: m.nodes, materials: m.materials, sections: m.sections,
      elements: m.elements, supports: m.supports,
      loads: [{ type: 'nodal', data: { id: 1, nodeId: 6, fx: 0, fy: -100, mz: 0 } }],
    } as never);
    const worst = Math.max(...r.elementForces.map((e: { mStart: number; mEnd: number }) =>
      Math.max(Math.abs(e.mStart), Math.abs(e.mEnd))));
    expect(worst).toBeCloseTo(250, 1);
  });
});

// ─── Influence lines ───────────────────────────────────────────────

describe('influence lines', () => {
  it('the reaction at A runs linearly from 1 to 0', () => {
    const r = computeInfluenceLine(modelBeam(10, 10), 'Ry' as never, 1, undefined, 0.5, 10);
    expect(typeof r).not.toBe('string');
    const pts = (r as { points: Array<{ x: number; value: number }> }).points;
    const at = (x: number) => pts.reduce((b, p) => (Math.abs(p.x - x) < Math.abs(b.x - x) ? p : b), pts[0]);
    expect(at(0).value).toBeCloseTo(1, 3);
    expect(at(5).value).toBeCloseTo(0.5, 3);
    expect(at(10).value).toBeCloseTo(0, 3);
  });

  it('the midspan moment line is a triangle peaking at L/4', () => {
    const L = 10;
    const r = computeInfluenceLine(modelBeam(L, 10), 'M' as never, undefined, 5, 1.0, 10);
    const pts = (r as { points: Array<{ x: number; value: number }> }).points;
    const peak = pts.reduce((b, p) => (Math.abs(p.value) > Math.abs(b.value) ? p : b), pts[0]);
    expect(Math.abs(peak.value)).toBeCloseTo(L / 4, 3);
    expect(peak.x).toBeCloseTo(L / 2, 1);
  });

  it('the peak scales with span, so it is a length and not a constant', () => {
    const peakFor = (L: number) => {
      const r = computeInfluenceLine(modelBeam(L, 10), 'M' as never, undefined, 5, 1.0, 10);
      const pts = (r as { points: Array<{ value: number }> }).points;
      return Math.max(...pts.map((p) => Math.abs(p.value)));
    };
    expect(peakFor(20) / peakFor(10)).toBeCloseTo(2, 1);
  });
});

// ─── Moving loads ──────────────────────────────────────────────────

describe('moving loads', () => {
  const single = { name: 'single', axles: [{ offset: 0, weight: 100 }] };

  it('a single axle on a simple span envelopes to PL/4', () => {
    const env = solveMovingLoads(solverBeam(10), { train: single, step: 0.25 }) as MovingLoadEnvelope;
    expect(typeof env).not.toBe('string');
    const mom = env.fullEnvelope?.moment as unknown as { elements: Array<{ posValues: number[]; negValues: number[] }> };
    const peak = Math.max(...mom.elements[0].posValues.map(Math.abs), ...mom.elements[0].negValues.map(Math.abs));
    expect(peak).toBeCloseTo(250, 0);
  });

  it('the PER-ELEMENT envelope sees the span maximum, not just the ends', () => {
    // The defect: built from `ef.mStart` and `ef.mEnd`, this reported 1e-14 for
    // a one-element span whose envelope peaks at PL/4 — the whole answer, gone.
    const env = solveMovingLoads(solverBeam(10), { train: single, step: 0.25 }) as MovingLoadEnvelope;
    const e = env.elements.get(1)!;
    const worst = Math.max(Math.abs(e.mMaxPos), Math.abs(e.mMaxNeg));
    expect(worst).toBeCloseTo(250, 0);
  });

  it('the supports carry endpoint axles and the closest interior axle governs member shear', () => {
    const length = 10, step = 0.25;
    const env = solveMovingLoads(solverBeam(length), { train: single, step }) as MovingLoadEnvelope;
    const e = env.elements.get(1)!;
    const weight = single.axles[0]!.weight;
    for (const endpoint of [env.positions[0]!, env.positions[env.positions.length - 1]!]) {
      expect(Math.max(...endpoint.results.reactions.map(r => Math.abs(r.rz)))).toBeCloseTo(weight, 0);
      const forces = endpoint.results.elementForces[0]!;
      expect(Math.max(Math.abs(forces.vStart), Math.abs(forces.vEnd))).toBe(0);
    }
    expect(Math.max(Math.abs(e.vMaxPos), Math.abs(e.vMaxNeg))).toBeCloseTo(weight * (length - step) / length, 0);
  });

  it('a heavier train envelopes proportionally', () => {
    const one = solveMovingLoads(solverBeam(10), { train: single, step: 0.5 }) as MovingLoadEnvelope;
    const two = solveMovingLoads(solverBeam(10), {
      train: { name: 'double', axles: [{ offset: 0, weight: 200 }] }, step: 0.5,
    }) as MovingLoadEnvelope;
    const worst = (env: MovingLoadEnvelope) => Math.abs(env.elements.get(1)!.mMaxNeg);
    expect(worst(two) / worst(one)).toBeCloseTo(2, 2);
  });

  it('the shipped trains are well formed', () => {
    // A train with a NaN weight solves to nothing and reports "no position
    // solved", which reads as a broken analysis rather than bad data.
    for (const t of PREDEFINED_TRAINS) {
      expect(t.axles.length, t.name).toBeGreaterThan(0);
      for (const a of t.axles) {
        expect(Number.isFinite(a.weight), `${t.name} weight`).toBe(true);
        expect(Number.isFinite(a.offset), `${t.name} offset`).toBe(true);
        expect(a.weight, `${t.name} weight`).toBeGreaterThan(0);
      }
      expect(t.axles[0].offset, `${t.name} first offset`).toBe(0);
    }
  });
});

it('#2375 — both plane sweeps retain the axial jump at an interior axle', async () => {
  const solver = solverBeam(4);
  solver.nodes.set(2, { id: 2, x: 0, z: 4 });
  solver.supports.delete(2);
  solver.supports.set(1, { id: 1, nodeId: 1, type: 'fixed' });
  const config = { train: { name: 'single', axles: [{ offset: 0, weight: 1 }] }, step: 1, pathElementIds: [1] };
  for (const sweep of [solveMovingLoads, solveMovingLoadsAsync]) {
    const result = await sweep(solver, config);
    if (typeof result === 'string') throw new Error(result);
    const axialAt = (position: number, t: number) => {
      const station = result.positions.find(entry => entry.refPosition === position)!;
      return computeDiagramValueAt('axial', t, station.results.elementForces[0]);
    };
    expect.soft(axialAt(2, 0.25)).toBeCloseTo(-1, 9);
    expect.soft(axialAt(2, 0.75)).toBeCloseTo(0, 9);
    expect.soft(axialAt(0, 0.5)).toBeCloseTo(0, 9);
    expect.soft(axialAt(4, 0.5)).toBeCloseTo(-1, 9);
    expect.soft(result.elements.get(1)!.nMaxNeg).toBeCloseTo(-1, 9);
  }
});

it('#2375 — an inclined frame axle retains both force components', () => {
  const solver = solverBeam(5);
  solver.nodes.set(2, { id: 2, x: 3, z: 4 });
  solver.supports.delete(2);
  solver.supports.set(1, { id: 1, nodeId: 1, type: 'fixed' });
  const result = solveMovingLoads(solver, { train: { name: 'single', axles: [{ offset: 0, weight: 1 }] }, step: 0.5 });
  if (typeof result === 'string') throw new Error(result);
  const force = result.positions.find(entry => entry.refPosition === 2.5)!.results.elementForces[0];
  expect.soft(computeDiagramValueAt('axial', 0.25, force)).toBeCloseTo(-4 / 5, 9);
  expect.soft(computeDiagramValueAt('axial', 0.75, force)).toBeCloseTo(0, 9);
  expect.soft(Math.abs(computeDiagramValueAt('shear', 0.25, force))).toBeCloseTo(3 / 5, 9);
  expect.soft(computeDiagramValueAt('shear', 0.75, force)).toBeCloseTo(0, 9);
  expect.soft(Math.abs(computeDiagramValueAt('moment', 0, force))).toBeCloseTo(1.5, 9);
});
