import { describe, it, expect, beforeAll } from 'vitest';
import * as wasm from '../../wasm-solver';
import { modelStore, historyStore } from '../../../store';
import { runPDelta2D, pdeltaConvergence, displacementAmplification } from '../run-pdelta';
import { runBuckling2D, bucklingConvergence } from '../run-buckling';
import { refineInput } from '../refine';
import { DEFAULT_SETTINGS, firstModeB2, type SoSettings } from '../settings';
import { generate } from '../../__tests__/helpers/random-models-2d';
import { column, portal, EI } from './fixtures';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); expect(wasm.isSolverReady()).toBe(true); });

const S = (o: Partial<SoSettings> = {}): SoSettings => ({ ...DEFAULT_SETTINGS, ...o });

describe('B₂ = 1/(1 − 1/λ₁)', () => {
  it('is 1 with nothing compressed, ∞ past the critical load', () => {
    expect(firstModeB2(Infinity)).toBe(1);
    expect(firstModeB2(0.8)).toBe(Infinity);
    expect(firstModeB2(2)).toBeCloseTo(2, 12);
    expect(firstModeB2(null)).toBeNaN();
  });

  /*
   * The models the sweep found the engine's per-DOF ratio wrong on (advanced-sweep-2d, KNOWN D10):
   * the Basic panel shows the first-mode amplification from its own buckling, at the same
   * discretization, and the largest displacement amplification beside it.
   */
  for (const [fam, seed] of [['arch', 12], ['arch', 30], ['arch', 46], ['mixed', 50]] as const) {
    it(`${fam}#${seed}: the panel's B₂ is 1/(1 − 1/λ₁) of the panel's buckling, and the engine's raw field is not`, () => {
      historyStore.clear();
      generate(fam, seed);
      const input = modelStore.buildSolverInput(false)!;
      const pd = runPDelta2D(input, S());
      const bk = runBuckling2D(input, S());
      if (!pd.ok || !bk.ok) throw new Error('refused');
      const l1 = bk.result.modes[0].loadFactor;
      expect(pd.result.secondOrder.lambda1).toBeCloseTo(l1, 8);
      expect(pd.result.secondOrder.b2).toBeCloseTo(1 / (1 - 1 / l1), 8);
      expect(pd.result.b2Factor).toBeCloseTo(pd.result.secondOrder.b2, 8);
      const raw = wasm.solvePDelta(refineInput(input, 4).input).b2Factor;
      expect(Math.abs(raw - pd.result.secondOrder.b2)).toBeGreaterThan(0.05);
      if (!(pd.result.converged && pd.result.isStable)) return;
      const amp = pd.result.secondOrder.amplification!;
      expect(amp.ratio).toBeGreaterThan(0.99);
      expect(amp.ratio).toBeLessThan(pd.result.secondOrder.b2 * 1.25);
    });
  }
});

describe('Basic P-Δ', () => {
  it('with the engine method replays the engine\'s iterations and says they land on its answer', () => {
    const pd = runPDelta2D(portal(4, 6, 300, 10), S({ n: 2 }));
    if (!pd.ok) throw new Error('refused');
    const info = pd.result.secondOrder;
    expect(info.history!.length).toBe(pd.result.iterations);
    expect(info.historyMatchesEngine).toBe(true);
    expect(info.compare).toBeNull();
    expect(pd.result.results.displacements.map((d) => d.nodeId)).toEqual([1, 2, 3, 4]);
    expect(pd.result.results.elementForces.map((f) => f.elementId)).toEqual([1, 2, 3]);
  });

  it('with φ is drawn from the teaching solver and compared with the engine at the same n', () => {
    const pd = runPDelta2D(portal(4, 6, 300, 10), S({ method: 'phi', n: 4 }));
    if (!pd.ok) throw new Error('refused');
    const { compare } = pd.result.secondOrder;
    expect(compare).not.toBeNull();
    expect(compare!.method.u / compare!.engine.u).toBeCloseTo(1, 4);
    expect(compare!.method.lambda1! / compare!.engine.lambda1!).toBeCloseTo(1, 3);
  });

  it('reads the member ends from the end pieces when the members are cut', () => {
    const input = portal(4, 6, 300, 10);
    const one = runPDelta2D(input, S({ n: 1 })), eight = runPDelta2D(input, S({ n: 8 }));
    if (!one.ok || !eight.ok) throw new Error('refused');
    const f1 = one.result.results.elementForces[0], f8 = eight.result.results.elementForces[0];
    expect(f8.length).toBeCloseTo(4, 12);
    expect(f8.mStart).toBeCloseTo(f1.mStart, 0);
    expect(Math.abs(f8.mStart - f1.mStart)).toBeGreaterThan(0);
  });

  it('converges with n towards the stability functions\' answer', () => {
    const rows = pdeltaConvergence(portal(4, 6, 600, 10), S());
    const phi = rows.find((r) => r.label === 'phi')!;
    const err = rows.filter((r) => r.label === 'n').map((r) => Math.abs(r.u! - phi.u!) / phi.u!);
    expect(err[3]).toBeLessThan(err[0]);
    expect(err[3]).toBeLessThan(1e-4);
  });

  it('takes the axial force where it acts: a column loaded at mid-height is compressed below the load only', () => {
    const input = column('fixed', 'rollerZ', 6, 0);
    input.loads = [{ type: 'pointOnElement', data: { elementId: 1, a: 3, p: 0, px: -200 } }, { type: 'nodal', data: { nodeId: 2, fx: 0, fz: 0, my: 1 } }];
    const r = refineInput(input, 1);
    expect(r.identity).toBe(false);
    expect(r.pieces.get(1)!.map((p) => p.x1)).toEqual([3, 6]);
  });
});

describe('Basic buckling', () => {
  it('finds a member compressed over part of its length (the engine alone reads its mean N)', () => {
    const input = column('pinned', 'pinned', 6, 0);
    input.loads = [{ type: 'pointOnElement', data: { elementId: 1, a: 4, p: 0, px: -100 } }];
    const got = runBuckling2D(input, S({ n: 1 }));
    if (!got.ok) throw new Error(got.reason.key);
    expect(got.result.modes[0].loadFactor).toBeGreaterThan(0);
    expect(got.result.elementData[0].axialForce).toBeLessThan(0);
  });

  it('draws the modes on the cut model and gives K from the refined λ', () => {
    const P = 100, L = 5;
    const got = runBuckling2D(column('fixed', null, L, P), S({ n: 4, modes: 3 }));
    if (!got.ok) throw new Error(got.reason.key);
    expect(got.result.modes.length).toBe(3);
    expect(got.result.secondOrder.geometry!.nodes.length).toBe(5);
    expect(got.result.elementData[0].kEffective).toBeCloseTo(2, 3);
    expect(got.result.modes[0].loadFactor).toBeCloseTo((Math.PI ** 2 * EI) / (4 * L * L) / P, 1);
  });

  it('with φ keeps the engine\'s factors beside its own', () => {
    const got = runBuckling2D(portal(4, 6, 300, 10), S({ method: 'phi', n: 1 }));
    if (!got.ok) throw new Error(got.reason.key);
    expect(got.result.secondOrder.engineFactors!.length).toBeGreaterThan(0);
    expect(got.result.secondOrder.engineFactors![0]).toBeGreaterThan(got.result.modes[0].loadFactor);
  });

  it('converges from above with n to the φ value', () => {
    const rows = bucklingConvergence(column('pinned', 'rollerZ', 5, 100), S());
    const phi = rows.find((r) => r.label === 'phi')!.lambda1!;
    const ns = rows.filter((r) => r.label === 'n').map((r) => r.lambda1! / phi - 1);
    expect(ns[0]).toBeCloseTo(12 / Math.PI ** 2 - 1, 4);
    for (let k = 1; k < ns.length; k++) expect(ns[k]).toBeLessThan(ns[k - 1]);
  });
});

describe('the largest displacement amplification', () => {
  it('is read at the node that moves most in first order, and is ∞ when the second-order one reverses', () => {
    const lin = { displacements: [{ nodeId: 1, ux: 0, uz: 0, ry: 0 }, { nodeId: 2, ux: 1, uz: 0, ry: 0 }], reactions: [], elementForces: [] };
    const two = { ...lin, displacements: [{ nodeId: 1, ux: 0, uz: 0, ry: 0 }, { nodeId: 2, ux: 1.5, uz: 0, ry: 0 }] };
    const rev = { ...lin, displacements: [{ nodeId: 1, ux: 0, uz: 0, ry: 0 }, { nodeId: 2, ux: -1.5, uz: 0, ry: 0 }] };
    expect(displacementAmplification(lin, two)).toEqual({ nodeId: 2, ratio: 1.5 });
    expect(displacementAmplification(lin, rev)!.ratio).toBe(Infinity);
  });
});
