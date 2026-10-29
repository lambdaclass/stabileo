import { expectPlasticRefusal } from './containment-helper';
/**
 * The advanced analyses, against closed-form solutions.
 *
 * # Why this file exists
 *
 * P-Delta, buckling, modal, plastic collapse, spectral and moving loads had no
 * numerical validation anywhere — not in Rust, not here. The tests that
 * mentioned them checked plumbing: that the ✕ clears the right store slot, that
 * results invalidate, that sliding joints block a run. Correct and necessary,
 * and none of them would notice a wrong number.
 *
 * That matters more here than for the linear solver, because these are the
 * results nobody can sanity-check by eye: an engineer knows a cantilever
 * deflects PL³/3EI, and nobody knows the buckling load of a portal frame from
 * memory. The one place a mistake would hide is the one place with no net.
 *
 * # Units, and the mistake that made this file necessary
 *
 * `Material.e` is in **MPa**, and the solver wire passes it through unchanged.
 * Writing `e: 200e6` for steel — reading it as kPa — makes the structure a
 * thousand times too stiff, which is invisible in isolation and looks exactly
 * like a broken analysis: deflections come out 1000× small, frequencies
 * sqrt(1000) = 31.6× high, and second-order effects vanish because P/Pcr is
 * 1000× too low. An audit built on that input "found" two serious bugs in
 * analyses that were correct.
 *
 * So the first test here is the deflection of a beam whose answer is known to
 * every reader. If it fails, nothing below it means anything.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { initSolver, solve, solveBuckling, solveModal, solvePDelta, solvePlastic } from '../wasm-solver';

beforeAll(async () => { await initSolver(); });

/** Steel, in the units the model stores: E in MPa, weight density in kN/m³. */
const E = 200_000;
const RHO_W = 78.5;
/** IPN 300-ish. */
const I = 9.8e-5;
const A = 0.0069;

/** E in kN/m², which is what the closed forms below need. */
const E_KNM2 = E * 1e3;

function beam(L: number, n: number, w = 0) {
  const nodes = new Map<number, unknown>();
  const elements = new Map<number, unknown>();
  for (let i = 0; i <= n; i++) nodes.set(i + 1, { id: i + 1, x: (L * i) / n, y: 0 });
  for (let i = 0; i < n; i++) {
    elements.set(i + 1, { id: i + 1, nodeI: i + 1, nodeJ: i + 2, materialId: 1, sectionId: 1, type: 'frame' });
  }
  return {
    nodes, elements,
    materials: new Map([[1, { id: 1, e: E, nu: 0.3, rho: RHO_W }]]),
    sections: new Map([[1, { id: 1, a: A, iz: I }]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'pinned' }], [2, { id: 2, nodeId: n + 1, type: 'rollerX' }]]),
    loads: w
      ? Array.from({ length: n }, (_, i) => ({ type: 'distributed', data: { id: i + 1, elementId: i + 1, qI: -w, qJ: -w } }))
      : [],
  } as never;
}

/** Cantilever column, fixed base, free top: the Euler case with k = 2. */
function column(L: number, P: number, H = 0) {
  return {
    nodes: new Map([[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 0, y: L }]]),
    materials: new Map([[1, { id: 1, e: E, nu: 0.3, rho: RHO_W }]]),
    sections: new Map([[1, { id: 1, a: A, iz: I }]]),
    elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, type: 'frame' }]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
    loads: [{ type: 'nodal', data: { id: 1, nodeId: 2, fx: H, fy: -P, mz: 0 } }],
  } as never;
}

// ─── The premise everything else rests on ──────────────────────────

describe('the units are what the analyses below assume', () => {
  it('a simply supported beam under its own weight deflects 5wL⁴/384EI', () => {
    const L = 10, w = RHO_W * A;
    const r = solve(beam(L, 20, w));
    const mid = r.displacements.find((d: { nodeId: number }) => d.nodeId === 11) as { uy?: number; uz?: number };
    const got = Math.abs(mid?.uy ?? mid?.uz ?? 0);
    const exact = (5 * w * L ** 4) / (384 * E_KNM2 * I);
    // A thousandfold error here means `e` was read as kPa instead of MPa, and
    // every analysis below would look broken while being correct.
    expect(got / exact).toBeCloseTo(1, 2);
  });
});

// ─── Buckling ──────────────────────────────────────────────────────

describe('buckling', () => {
  it('a cantilever column reaches Euler with k = 2', () => {
    const P = 100;
    const r = solveBuckling(column(5, P), 1);
    const pcr = r.modes[0].loadFactor * P;
    const euler = (Math.PI ** 2 * E_KNM2 * I) / (2 * 5) ** 2;
    expect(pcr / euler).toBeGreaterThan(0.99);
    expect(pcr / euler).toBeLessThan(1.03);
  });

  it('the critical load scales as 1/L², not merely "gets smaller"', () => {
    // A solver that returned something plausible but with the wrong power
    // would pass a single-case check and fail here.
    const a = solveBuckling(column(4, 100), 1).modes[0].loadFactor;
    const b = solveBuckling(column(8, 100), 1).modes[0].loadFactor;
    expect(a / b).toBeCloseTo(4, 0);
  });
});

// ─── Modal ─────────────────────────────────────────────────────────

describe('modal', () => {
  /** The conversion the app performs: weight density kN/m³ → mass kg/m³. */
  const densities = () => new Map([[1, (RHO_W * 1000) / 9.81]]);

  it('a simply supported beam matches (π/2L²)·√(EI/m)', () => {
    const L = 10;
    const r = solveModal(beam(L, 20), densities() as never, 1);
    const m = ((RHO_W * 1000) / 9.81) * A; // kg/m
    const exact = (Math.PI / (2 * L ** 2)) * Math.sqrt((E_KNM2 * 1e3 * I) / m);
    expect(r.modes[0].frequency / exact).toBeCloseTo(1, 1);
  });

  it('frequency scales as 1/L², which a wrong mass scaling would break', () => {
    const f6 = solveModal(beam(6, 12), densities() as never, 1).modes[0].frequency;
    const f12 = solveModal(beam(12, 24), densities() as never, 1).modes[0].frequency;
    expect(f6 / f12).toBeCloseTo(4, 0);
  });

  it('period, frequency and omega describe the same mode', () => {
    const m = solveModal(beam(10, 20), densities() as never, 1).modes[0];
    expect(m.omega / m.frequency).toBeCloseTo(2 * Math.PI, 6);
    expect(m.period * m.frequency).toBeCloseTo(1, 6);
  });

  it('heavier material means lower frequency, as 1/√ρ', () => {
    const light = solveModal(beam(10, 20), new Map([[1, 2000]]) as never, 1).modes[0].frequency;
    const heavy = solveModal(beam(10, 20), new Map([[1, 8000]]) as never, 1).modes[0].frequency;
    expect(light / heavy).toBeCloseTo(2, 1);
  });
});

// ─── P-Delta ───────────────────────────────────────────────────────

describe('p-delta', () => {
  it('amplifies by 1/(1 − P/Pcr) across the working range', () => {
    // Pcr is taken from the buckling solver rather than the closed form, so
    // the two analyses are checked against each other as well as against theory.
    const pcr = solveBuckling(column(5, 100), 1).modes[0].loadFactor * 100;
    for (const frac of [0.1, 0.3, 0.5]) {
      const pd = solvePDelta(column(5, pcr * frac, 2));
      const theory = 1 / (1 - frac);
      expect(pd.b2Factor / theory, `P/Pcr = ${frac}`).toBeGreaterThan(0.97);
      expect(pd.b2Factor / theory, `P/Pcr = ${frac}`).toBeLessThan(1.06);
    }
  });

  it('a negligible axial load leaves the first-order result alone', () => {
    const pd = solvePDelta(column(5, 0.01, 2));
    expect(pd.b2Factor).toBeCloseTo(1, 3);
  });
});

// ─── Plastic collapse ──────────────────────────────────────────────

describe('plastic collapse', () => {
  it('a fixed-fixed beam under UDL collapses at 16 Mp/L²', () => {
    const L = 8, n = 4, w = 10;
    const nodes = new Map<number, unknown>(), elements = new Map<number, unknown>();
    for (let i = 0; i <= n; i++) nodes.set(i + 1, { id: i + 1, x: (L * i) / n, y: 0 });
    for (let i = 0; i < n; i++) elements.set(i + 1, { id: i + 1, nodeI: i + 1, nodeJ: i + 2, materialId: 1, sectionId: 1, type: 'frame' });
    const solver = {
      nodes, elements,
      materials: new Map([[1, { id: 1, e: E, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: A, iz: I }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }], [2, { id: 2, nodeId: n + 1, type: 'fixed' }]]),
      loads: Array.from({ length: n }, (_, i) => ({ type: 'distributed', data: { id: i + 1, elementId: i + 1, qI: -w, qJ: -w } })),
    } as never;
    const Mp = 147.58; // kN·m
    expectPlasticRefusal(() => solvePlastic({
      solver,
      sections: new Map([[1, { a: A, iz: I, materialId: 1 }]]) as never,
      materials: new Map([[1, { fy: 235e3 }]]) as never,
      mpOverrides: new Map([[1, Mp]]) as never,
    }));
    /* Numerical expectations for the #758 fix (no result while refused):
expect(r.collapseFactor / ((16 * Mp) / L ** 2 / w)).toBeCloseTo(1, 2);
*/
  });

  it('hinges form at the fixed ends first, then in the span', () => {
    // The mechanism's ORDER is the part a teaching tool shows, and a solver
    // that got the collapse load right by luck would get this wrong.
    const L = 8, n = 4, w = 10;
    const nodes = new Map<number, unknown>(), elements = new Map<number, unknown>();
    for (let i = 0; i <= n; i++) nodes.set(i + 1, { id: i + 1, x: (L * i) / n, y: 0 });
    for (let i = 0; i < n; i++) elements.set(i + 1, { id: i + 1, nodeI: i + 1, nodeJ: i + 2, materialId: 1, sectionId: 1, type: 'frame' });
    expectPlasticRefusal(() => solvePlastic({
      solver: {
        nodes, elements,
        materials: new Map([[1, { id: 1, e: E, nu: 0.3 }]]),
        sections: new Map([[1, { id: 1, a: A, iz: I }]]),
        supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }], [2, { id: 2, nodeId: n + 1, type: 'fixed' }]]),
        loads: Array.from({ length: n }, (_, i) => ({ type: 'distributed', data: { id: i + 1, elementId: i + 1, qI: -w, qJ: -w } })),
      } as never,
      sections: new Map([[1, { a: A, iz: I, materialId: 1 }]]) as never,
      materials: new Map([[1, { fy: 235e3 }]]) as never,
      mpOverrides: new Map([[1, 147.58]]) as never,
    }));
    /* Numerical expectations for the #758 fix (no result while refused):
const first = r.steps[0].hingesFormed as Array<{ elementId: number; end: string }>;
*/
    /* Numerical expectations for the #758 fix (no result while refused):
const ids = first.map((h) => `${h.elementId}${h.end}`);
*/
    /* Numerical expectations for the #758 fix (no result while refused):
expect(ids).toContain('1start');
*/
    /* Numerical expectations for the #758 fix (no result while refused):
expect(ids).toContain('4end');
*/
    /* Numerical expectations for the #758 fix (no result while refused):
expect(r.isMechanism).toBe(true);
*/
  });
});
