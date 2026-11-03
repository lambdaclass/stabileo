import { describe, it, expect, beforeAll } from 'vitest';
import * as wasm from '../../wasm-solver';
import { computeDiagramValueAt } from '../../diagrams';
import { peakAlong } from '../../governing-case';
import { interiorMoments } from '../beam-column-interior';
import { teachingBuckling } from '../buckling';
import { runPDelta2D, pdeltaConvergence } from '../run-pdelta';
import { DEFAULT_SETTINGS, type SoSettings } from '../settings';
import { column, EI } from './fixtures';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); expect(wasm.isSolverReady()).toBe(true); });

const S = (o: Partial<SoSettings> = {}): SoSettings => ({ ...DEFAULT_SETTINGS, ...o });

describe('the moment inside a member under its axial force, from the beam-column equation', () => {
  const L = 4, a = 1e-3;
  for (const kL of [1.2, 3.5, 5.5]) {
    const k = kL / L, P = EI * k * k;
    const exact = (x: number) => EI * a * k * k * Math.sin(k * x);
    const mEnd = P * a * Math.sin(kL);
    const ef = { mStart: 0, mEnd, vStart: -mEnd / L, vEnd: -mEnd / L, nStart: -P, nEnd: -P, qI: 0, qJ: 0, length: L, pointLoads: [], distributedLoads: [] };
    const xs = [0.1, 0.25, 0.5, 0.8, 1].map((t) => t * L);
    const tI = a * (k - Math.sin(kL) / L), tJ = a * (k * Math.cos(kL) - Math.sin(kL) / L);
    it(`kL = ${kL}: w = a·(sin kx − x·sin kL/L) gives M = EI·a·k²·sin kx from the start, the end, or the end moments`, () => {
      for (const [ti, tj] of [[tI, tJ], [tI, null], [null, tJ]] as const) {
        const got = interiorMoments(ef, EI, P, xs, ti, tj)!;
        got.forEach((m, i) => expect(Math.abs(m - exact(xs[i]))).toBeLessThan(1e-9 * EI * a * k * k));
      }
    });
  }
});

describe('φ draws the second-order moment inside a member', () => {
  const L = 5, w = 4;
  const Pe = (Math.PI ** 2 * EI) / (L * L);
  for (const [label, P] of [['compressed to 0.5 Pe', 0.5 * Pe], ['in tension at 0.5 Pe', -0.5 * Pe]] as const) {
    it(`pin-ended under a uniform load, ${label}: the midspan moment and its peak are the closed form, in the convergence table too`, () => {
      const input = column('pinned', 'rollerZ', L, P);
      input.loads.push({ type: 'distributed', data: { elementId: 1, qI: w, qJ: w } });
      const got = runPDelta2D(input, S({ method: 'phi', n: 1 }));
      if (!got.ok) throw new Error('refused');
      const ef = got.result.results.elementForces[0];
      const N = -(ef.nStart + ef.nEnd) / 2;
      const u = (L / 2) * Math.sqrt(Math.abs(N) / EI);
      const amp = N > 0 ? (2 * (1 / Math.cos(u) - 1)) / (u * u) : (2 * (1 - 1 / Math.cosh(u))) / (u * u);
      const mid = ((w * L * L) / 8) * amp;
      expect(Math.abs(Math.abs(computeDiagramValueAt('moment', 0.5, ef)) - mid) / mid).toBeLessThan(1e-7);
      expect(Math.abs(peakAlong('moment', ef) - mid) / mid).toBeLessThan(1e-6);
      if (P > 0) expect(mid / ((w * L * L) / 8)).toBeGreaterThan(1.9);
      else expect(mid / ((w * L * L) / 8)).toBeLessThan(0.7);
      const phi = pdeltaConvergence(input, S({ method: 'phi' })).find((r) => r.label === 'phi')!;
      expect(Math.abs(phi.m! - mid) / mid).toBeLessThan(1e-6);
    });
  }

  it('cut in 4, φ still passes through the exact moments inside each piece', () => {
    const input = column('pinned', 'rollerZ', L, 0.5 * Pe);
    input.loads.push({ type: 'distributed', data: { elementId: 1, qI: w, qJ: w } });
    const one = runPDelta2D(input, S({ method: 'phi', n: 1 }));
    const four = runPDelta2D(input, S({ method: 'phi', n: 4 }));
    if (!one.ok || !four.ok) throw new Error('refused');
    const a = one.result.results.elementForces[0], b = four.result.results.elementForces[0];
    const mid = Math.abs(computeDiagramValueAt('moment', 0.5, a));
    for (const t of [0.1, 0.3, 0.45, 0.6, 0.9]) expect(Math.abs(computeDiagramValueAt('moment', t, b) - computeDiagramValueAt('moment', t, a)) / mid).toBeLessThan(1e-6);
  });
});

describe('a compressed member next to a far larger tension elsewhere', () => {
  it('a −100 kN cantilever beside a column pulled at 1e12 kN still buckles at its own Euler load', () => {
    const L = 3;
    const input = column('fixed', null, L, 100);
    input.nodes.set(3, { id: 3, x: 5, z: 0 });
    input.nodes.set(4, { id: 4, x: 5, z: L });
    input.elements.set(2, { ...input.elements.get(1)!, id: 2, nodeI: 3, nodeJ: 4 });
    input.supports.set(3, { id: 3, nodeId: 3, type: 'fixed' });
    input.loads.push({ type: 'nodal', data: { nodeId: 4, fx: 0, fz: 1e12, my: 0 } });
    const b = teachingBuckling(input, { method: 'phi', axialRigid: false }, 1);
    if (!b.ok) throw new Error(b.reason.key);
    expect(b.run.modes[0].lambda * 100).toBeCloseTo((Math.PI ** 2 * EI) / (4 * L * L), 3);
  });
});

describe('φ draws a sway column through its own end moments', () => {
  const L = 4;
  const sway = (P: number, H: number, rotationHeld: boolean) => {
    const input = column('fixed', null, L, P, H);
    if (rotationHeld) input.supports.set(2, { id: 2, nodeId: 2, type: 'spring', kx: 0, ky: 0, kz: 1e14 });
    return input;
  };
  const cases: Array<[string, number, boolean, (k: number, H: number, x: number) => number]> = [
    ['cantilever, kL = 1.2', 1.2, false, (k, H, x) => (H / k) * Math.sin(k * (L - x)) / Math.cos(k * L)],
    ['cantilever, kL = 1.5', 1.5, false, (k, H, x) => (H / k) * Math.sin(k * (L - x)) / Math.cos(k * L)],
    ['fixed base, top free to sway with its rotation held, kL = 2.8', 2.8, true, (k, H, x) => (H / k) * Math.sin(k * (L / 2 - x)) / Math.cos(k * L / 2)],
    ['fixed base, top free to sway with its rotation held, kL = 3.05', 3.05, true, (k, H, x) => (H / k) * Math.sin(k * (L / 2 - x)) / Math.cos(k * L / 2)],
  ];
  for (const [label, kL, held, exact] of cases) {
    it(`${label}: M(x) is the closed form and meets mStart and mEnd`, () => {
      const k = kL / L, P = EI * k * k, H = 10;
      const got = runPDelta2D(sway(P, H, held), S({ method: 'phi', n: 1 }));
      if (!got.ok) throw new Error('refused');
      const ef = got.result.results.elementForces[0];
      const ref = Math.abs(exact(k, H, 0));
      const sgn = Math.sign(computeDiagramValueAt('moment', 0, ef)) * Math.sign(exact(k, H, 0));
      for (const t of [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 0.97, 0.99, 1]) {
        expect(Math.abs(computeDiagramValueAt('moment', t, ef) - sgn * exact(k, H, t * L)) / ref).toBeLessThan(1e-6);
      }
      expect(Math.abs(computeDiagramValueAt('moment', 1, ef) - ef.mEnd) / ref).toBeLessThan(1e-9);
    });
  }
});

describe('the shear φ draws inside a compressed member is the section shear, normal to the deformed axis', () => {
  const L = 4, H = 10;
  for (const kL of [0.8, 1.2]) {
    it(`cantilever under P and H, kL = ${kL}: V = dM/dx = H·cos k(L−x)/cos kL, and at the free end H + P·θ balances it`, () => {
      const k = kL / L, P = EI * k * k;
      const got = runPDelta2D(column('fixed', null, L, P, H), S({ method: 'phi', n: 1 }));
      if (!got.ok) throw new Error('refused');
      const ef = got.result.results.elementForces[0];
      const q = (x: number) => (H * Math.cos(k * (L - x))) / Math.cos(k * L);
      for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        const v = computeDiagramValueAt('shear', t, ef);
        expect(Math.abs(Math.abs(v) - q(t * L)) / q(L)).toBeLessThan(2e-3);
        const h = 1e-4;
        const dm = (computeDiagramValueAt('moment', t + h, ef) - computeDiagramValueAt('moment', t - h, ef)) / (2 * h * L);
        expect(Math.abs(Math.abs(dm) - Math.abs(v)) / q(L)).toBeLessThan(2e-3);
      }
      const top = got.result.results.displacements.find((d) => d.nodeId === 2)!;
      expect(Math.abs(H + P * Math.abs(top.ry) - q(L)) / q(L)).toBeLessThan(1e-6);
      expect(Math.abs(Math.abs(computeDiagramValueAt('shear', 0.995, ef)) - q(L)) / q(L)).toBeLessThan(2e-3);
    });
  }
});
