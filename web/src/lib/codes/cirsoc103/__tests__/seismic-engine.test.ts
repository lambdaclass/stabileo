/**
 * Differential test: INPRES-CIRSOC 103, engine against the verified TypeScript oracle.
 *
 * `spectrum.ts` and `static-method.ts` are adapters over `engine/src/loads/cirsoc103_seismic.rs`.
 * The TypeScript verified clause by clause in #292 is kept as `spectrum-oracle.ts` and
 * `static-method-oracle.ts`. Every zone × site × fault factor, and random periods, heights,
 * groups, systems, weights and level sets, must give the same numbers, messages and references.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import * as S from '../spectrum';
import * as M from '../static-method';
import * as SO from './spectrum-oracle';
import * as MO from './static-method-oracle';

const ZONES = [0, 1, 2, 3, 4] as const;
const SITES = ['SA', 'SB', 'SC', 'SD', 'SE', 'SF'] as const;
const GROUPS = ['Ao', 'A', 'B', 'C'] as const;
const SYSTEMS = ['steelMomentFrame', 'concreteMomentFrame', 'steelEccentricOrBRB', 'other'] as const;
const OCC = ['exceptional', 'reduced', 'intermediate', 'high', 'full', 'other'] as const;

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(b)));

/**
 * Equal structure, numbers to 1e-12 relative. JavaScript's Math.pow and Rust's powf are different
 * libms and may differ in the last bit (Ta = Cr·h^x); nothing else is allowed to differ.
 */
function same(a: unknown, b: unknown, path = ''): void {
  if (typeof b === 'number' && typeof a === 'number') {
    if (!Number.isFinite(b)) { expect(a, path).toBe(b); return; }
    expect(Math.abs(a - b), `${path}: ${a} vs ${b}`).toBeLessThanOrEqual(1e-12 * Math.max(Math.abs(b), Number.MIN_VALUE));
    return;
  }
  if (b && typeof b === 'object') {
    expect(a && typeof a === 'object', path).toBe(true);
    const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined).sort();
    const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined).sort();
    expect(ka, path).toEqual(kb);
    for (const k of kb) same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
    return;
  }
  expect(a, path).toBe(b);
}

describe('INPRES-CIRSOC 103: engine against the verified oracle', () => {
  it('the spectrum for every zone, site and fault factor', () => {
    for (const zone of ZONES) for (const site of SITES) {
      for (const f of [{}, { na: 1.3 }, { na: 1.1, nv: 1.5 }, { na: 0.5, nv: 0.5 }]) {
        const i = { zone, site, ...f };
        const e = S.designSpectrum(i), o = SO.designSpectrum(i);
        expect(e).toEqual(o);
        if (!S.isBlocked(e)) {
          expect(S.spectrumPoints(e)).toEqual(SO.spectrumPoints(o as SO.DesignSpectrum));
          for (const t of [0, e.t1 / 2, e.t1, (e.t1 + e.t2) / 2, e.t2, 1, e.t3, e.t3 * 1.7]) near(S.spectralOrdinate(t, e), SO.spectralOrdinate(t, o as SO.DesignSpectrum));
        }
      }
    }
  });

  it('the seismic weight, period, coefficient, distribution and applicability on random inputs', () => {
    fc.assert(fc.property(
      fc.constantFrom<1 | 2 | 3 | 4>(1, 2, 3, 4), fc.constantFrom(...SITES.slice(0, 5)), fc.constantFrom(...GROUPS), fc.constantFrom(...SYSTEMS),
      fc.double({ min: 0, max: 120, noNaN: true }), fc.option(fc.double({ min: 0, max: 6, noNaN: true }), { nil: undefined }),
      fc.double({ min: 1, max: 8, noNaN: true }),
      fc.array(fc.record({ h: fc.double({ min: -1, max: 90, noNaN: true }), w: fc.double({ min: -10, max: 5000, noNaN: true }) }), { maxLength: 12 }),
      fc.constantFrom(...OCC), fc.boolean(), fc.integer({ min: 1, max: 30 }), fc.constantFrom('regular', 'medium', 'irregular') as fc.Arbitrary<M.PlanRegularity>,
      (zone, site, group, system, height, computedT, r, levels, occupancy, retaining, nLevels, regularity) => {
        const spec = S.designSpectrum({ zone, site }) as S.DesignSpectrum;
        const per = M.designPeriod({ heightM: height, system, ...(computedT !== undefined ? { computedT } : {}) }, spec.as);
        same(per, MO.designPeriod({ heightM: height, system, ...(computedT !== undefined ? { computedT } : {}) }, spec.as));
        expect(M.periodCapFactor(spec.as)).toBe(MO.periodCapFactor(spec.as));
        const coef = M.designSeismicCoefficient({ spectrum: spec, group, r, t: per.t });
        same(coef, MO.designSeismicCoefficient({ spectrum: spec as never, group, r, t: per.t }));
        const v0 = coef.c * 1000;
        same(M.distributeInHeight(levels, v0, per.ta * 3, spec.t2), MO.distributeInHeight(levels, v0, per.ta * 3, spec.t2));
        // No spectrum plateau (the plan's T2 = ∞ before a spectrum exists).
        same(M.distributeInHeight(levels, v0, per.ta * 3, Infinity), MO.distributeInHeight(levels, v0, per.ta * 3, Infinity));
        same(M.staticMethodApplicable({ zone, group, heightM: height, levels: nLevels, regularity, t: per.t, t2: Infinity }), MO.staticMethodApplicable({ zone, group, heightM: height, levels: nLevels, regularity, t: per.t, t2: Infinity }));
        const app = { zone, group, heightM: height, levels: nLevels, regularity, t: per.t, t2: spec.t2 };
        same(M.staticMethodApplicable(app), MO.staticMethodApplicable(app));
        const { t: _t, ...noT } = app;
        same(M.staticMethodApplicable(noT), MO.staticMethodApplicable(noT));
        const w = { deadKN: v0, liveKN: height * 10, snowKN: r * 7, occupancy, snowRetaining: retaining };
        same(S.seismicWeight(w), SO.seismicWeight(w));
      },
    ), { numRuns: 3000, seed: 103 });
  }, 120_000);

  it('the tables the app still reads directly equal the engine\'s', () => {
    for (const system of SYSTEMS) {
      // Ta = Cr·h^x: at h = 1 it is Cr, at h = 2 it is Cr·2^x.
      const { cr, x } = M.PERIOD_COEFFICIENTS[system];
      near(M.approximatePeriod(1, system), cr);
      near(M.approximatePeriod(2, system), cr * 2 ** x);
    }
    for (const zone of [1, 2, 3, 4] as const) {
      const s = S.designSpectrum({ zone, site: 'SB' }) as S.DesignSpectrum;
      expect(s.as).toBe(S.ZONE_AS[zone]);
      expect(s.t3).toBe(S.ZONE_T3[zone]);
    }
    for (const group of GROUPS) {
      const spec = S.designSpectrum({ zone: 2, site: 'SB' }) as S.DesignSpectrum;
      expect(M.designSeismicCoefficient({ spectrum: spec, group, r: 1, t: 0.1 }).gammaR).toBe(S.RISK_FACTOR[group]);
    }
    for (const occupancy of OCC) {
      expect(S.seismicWeight({ deadKN: 0, liveKN: 1, occupancy }).f1).toBe(S.SIMULTANEITY_F1[occupancy]);
    }
    expect(S.seismicWeight({ deadKN: 0, liveKN: 0, snowKN: 1, occupancy: 'full', snowRetaining: true }).f2).toBe(S.SIMULTANEITY_F2.retaining);
    expect(S.seismicWeight({ deadKN: 0, liveKN: 0, snowKN: 1, occupancy: 'full' }).f2).toBe(S.SIMULTANEITY_F2.other);
  });
});
