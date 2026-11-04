/**
 * Differential test: the isolated-footing check, engine against the TypeScript oracle.
 *
 * `detailing/foundation-check.ts` is now an adapter over the engine's `check_isolated_footings`
 * (`engine/src/postprocess/isolated_footing.rs`), with every OK verdict gated by the certified
 * check. The TypeScript it replaced is `foundation-check-oracle.ts`. On thousands of random
 * footings — centred and offset columns, service and factored moments about both axes, interior,
 * edge and corner columns, through uplift — every number and verdict must agree, and the gate
 * may only lower an OK whose utilization is not provably below 1.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { checkFooting, type FootingInput } from '../../detailing/foundation-check';
import { checkFooting as oracle } from './foundation-check-oracle';

const close = (a: number, b: number, what: string) => {
  if (!Number.isFinite(b)) { expect(a, what).toBe(b); return; }
  expect(Math.abs(a - b), `${what}: ${a} vs ${b}`).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(b)));
};

const footing = fc.record({
  B: fc.double({ min: 0.8, max: 5, noNaN: true }),
  Lr: fc.double({ min: 0.5, max: 2, noNaN: true }),
  t: fc.double({ min: 0.3, max: 1.2, noNaN: true }),
  cB: fc.double({ min: 0.2, max: 0.8, noNaN: true }),
  cH: fc.double({ min: 0.2, max: 0.8, noNaN: true }),
  fc: fc.constantFrom(20, 25, 30, 35, 40, 80),
  qa: fc.double({ min: 80, max: 600, noNaN: true }),
  N: fc.double({ min: 50, max: 5000, noNaN: true }),
  k: fc.double({ min: 1.2, max: 1.6, noNaN: true }),
  // Zero or physical: a subnormal eccentricity (5e-324 m) underflows differently in the two
  // orders of multiplication and only tells "no moment" from "a 1e-320 kN·m moment".
  ms: fc.array(fc.oneof(fc.constant(0), fc.double({ min: -400, max: 400, noNaN: true }).filter((x) => Math.abs(x) > 1e-6)), { minLength: 4, maxLength: 4 }),
  ecc: fc.array(fc.oneof(fc.constant(0), fc.double({ min: -0.6, max: 0.6, noNaN: true }).filter((x) => Math.abs(x) > 1e-6)), { minLength: 2, maxLength: 2 }),
  position: fc.constantFrom('interior', 'interior', 'interior', 'edge', 'corner') as fc.Arbitrary<'interior' | 'edge' | 'corner'>,
}).map((p): FootingInput => ({
  kind: 'isolated',
  B: p.B, L: p.B * p.Lr, thickness: p.t, d: p.t - 0.075,
  columnB: p.cB, columnH: p.cH, fc: p.fc, allowableBearing: p.qa,
  serviceAxial: p.N, factoredAxial: p.N * p.k,
  serviceMomentB: p.ms[0]!, serviceMomentL: p.ms[1]!,
  factoredMomentB: p.ms[2]!, factoredMomentL: p.ms[3]!,
  eccentricityB: p.ecc[0]!, eccentricityL: p.ecc[1]!,
  position: p.position,
}));

describe('isolated footings: engine against the TypeScript oracle', () => {
  it('agree on every number and verdict, on 4 000 random footings', () => {
    const seen = new Set<string>();
    let gated = 0;
    fc.assert(fc.property(footing, (f) => {
      const e = checkFooting(f);
      const o = oracle(f);
      close(e.bearing.qMax, o.bearing.qMax, 'qMax');
      close(e.bearing.qMin, o.bearing.qMin, 'qMin');
      close(e.bearing.utilization, o.bearing.utilization, 'bearing utilization');
      expect(e.bearing.status).toBe(o.bearing.status);
      expect(e.bearing.uplift).toBe(o.bearing.uplift);
      close(e.bearing.eB, o.bearing.eB, 'eB');
      close(e.bearing.eL, o.bearing.eL, 'eL');
      expect(e.oneWayShear === null).toBe(o.oneWayShear === null);
      if (e.oneWayShear && o.oneWayShear) {
        close(e.oneWayShear.Vu, o.oneWayShear.Vu, 'one-way Vu');
        close(e.oneWayShear.phiVc, o.oneWayShear.phiVc, 'one-way φVc');
        close(e.oneWayShear.utilization, o.oneWayShear.utilization, 'one-way utilization');
        if (Math.abs(o.oneWayShear.utilization - 1) > 1e-9) expect(e.oneWayShear.status).toBe(o.oneWayShear.status);
        close(e.oneWayShear.cantilever, o.oneWayShear.cantilever, 'one-way cantilever');
      }
      expect(e.punching === null).toBe(o.punching === null);
      if (e.punching && o.punching) {
        close(e.punching.vu, o.punching.vu, 'punching vu');
        close(e.punching.phiVc, o.punching.phiVc, 'punching φvc');
        close(e.punching.demand.Vu, o.punching.demand.Vu, 'punching Vu');
        close(e.punching.momentTransfer.Msc, o.punching.momentTransfer.Msc, 'Msc');
        expect(e.punching.momentTransfer.status).toBe(o.punching.momentTransfer.status);
        if (Math.abs(o.punching.utilization - 1) > 1e-9) expect(e.punching.status).toBe(o.punching.status);
        seen.add(`punching:${o.punching.momentTransfer.status}`);
      }
      close(e.Mu, o.Mu, 'Mu');
      expect(e.MuSide).toBe(o.MuSide);
      close(e.punchingLoadInsidePerimeter, o.punchingLoadInsidePerimeter, 'q inside perimeter');
      close(e.worstUtilization, o.worstUtilization, 'worst utilization');
      expect(e.unsupported).toEqual(o.unsupported);
      // The overall verdict: the engine's, unless the certified gate lowered an OK that is not
      // provably below 1.
      if (e.engineRecheck?.disagrees) {
        gated++;
        expect(o.status).toBe('OK');
        expect(e.status).toBe('FAIL');
        expect(o.worstUtilization).toBeGreaterThan(1 - 1e-6);
      } else if (Math.abs(o.worstUtilization - 1) > 1e-9) {
        expect(e.status).toBe(o.status);
        expect(e.memo).toEqual(o.memo);
      }
      seen.add(o.status);
    }), { numRuns: 4000, seed: 2026 });
    // Every outcome was exercised.
    for (const s of ['OK', 'FAIL', 'UNSUPPORTED', 'punching:NONE', 'punching:NEGLIGIBLE',
      'punching:UNSUPPORTED_MOMENT_TRANSFER_NOT_EVALUATED', 'punching:UNSUPPORTED_MOMENT_NOT_FORMED']) {
      expect(seen.has(s), s).toBe(true);
    }
    expect(gated).toBeLessThan(5);
  }, 120_000);

  it('every OK carries a certified re-check proving it below 1', () => {
    fc.assert(fc.property(footing, (f) => {
      const e = checkFooting(f);
      if (e.status !== 'OK') return;
      expect(e.engineRecheck?.certifiedOk).toBe(true);
      expect(e.engineRecheck!.utilizationUpper!).toBeLessThan(1);
      expect(e.engineRecheck!.utilizationUpper!).toBeGreaterThanOrEqual(e.worstUtilization);
    }), { numRuns: 1000, seed: 2027 });
  }, 120_000);
});
