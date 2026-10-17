/**
 * INPRES-CIRSOC 103 Parte I (2018): the boundaries of every branch, rule and table.
 *
 * Each `it` names the clause and the side of the boundary it sits on. Expected values are
 * worked from the printed expressions, never from the module.
 */
import { describe, it, expect } from 'vitest';
import { designSpectrum, isBlocked, spectralOrdinate, spectrumPoints, type DesignSpectrum, type SiteClass } from '../spectrum';
import { designPeriod, designSeismicCoefficient, distributeInHeight, staticMethodApplicable } from '../static-method';
import { loadCodeFor } from '../../families';
import type { SeismicCode } from '../../families/load-codes';
import type { LoadCombinationSpec } from '../../cirsoc101/combinations';

const spec = (zone: 1 | 2 | 3 | 4, site: SiteClass, na?: number, nv?: number): DesignSpectrum => {
  const s = designSpectrum({ zone, site, na, nv });
  if (isBlocked(s)) throw new Error('blocked');
  return s;
};
const ALL: Array<[1 | 2 | 3 | 4, SiteClass]> = ([1, 2, 3, 4] as const).flatMap((z) => (['SB', 'SD', 'SE'] as const).map((s) => [z, s] as [1 | 2 | 3 | 4, SiteClass]));
const EPS = 1e-9;

describe('§3.5.1 [3.1]–[3.4]: the spectrum is continuous at T1, T2 and T3, in every zone and site', () => {
  for (const [z, site] of ALL) {
    it(`zone ${z}, ${site}`, () => {
      const s = spec(z, site);
      expect(s.t2).toBeCloseTo(s.cv / (2.5 * s.ca), 12);      // [3.13]
      expect(s.t1).toBeCloseTo(0.2 * s.t2, 12);                // [3.14]
      expect(spectralOrdinate(0, s)).toBeCloseTo(s.ca, 12);    // [3.1] at T = 0
      for (const t of [s.t1, s.t2]) {
        expect(spectralOrdinate(t - EPS, s)).toBeCloseTo(2.5 * s.ca, 6);
        expect(spectralOrdinate(t + EPS, s)).toBeCloseTo(2.5 * s.ca, 6);
      }
      expect(spectralOrdinate(s.t3 - EPS, s)).toBeCloseTo(s.cv / s.t3, 6);
      expect(spectralOrdinate(s.t3 + EPS, s)).toBeCloseTo(s.cv / s.t3, 6);
      // [3.4] past T3: Cv·T3/T².
      expect(spectralOrdinate(2 * s.t3, s)).toBeCloseTo((s.cv * s.t3) / (4 * s.t3 * s.t3), 12);
      // [3.1] halfway up the first branch.
      expect(spectralOrdinate(s.t1 / 2, s)).toBeCloseTo(s.ca * 1.75, 12);
    });
  }

  it('the sampled spectrum carries every corner and the exact ordinate there', () => {
    const s = spec(4, 'SD');
    const pts = spectrumPoints(s);
    for (const t of [0, s.t1, s.t2, s.t3]) {
      const p = pts.find((x) => x.period === t)!;
      expect(p.sa).toBeCloseTo(spectralOrdinate(t, s), 12);
    }
  });
});

describe('Tabla 3.1: Na and Nv only where the table prints them', () => {
  it('zones 3 and 4 multiply by Na ≥ 1 and Nv ≥ 1,2; a smaller value is raised, a larger kept', () => {
    expect(spec(4, 'SD', 0.8, 1.0).cv).toBeCloseTo(0.59 * 1.2, 12);
    expect(spec(4, 'SD', 1.2, 1.5).ca).toBeCloseTo(0.40 * 1.2, 12);
    expect(spec(4, 'SD', 1.2, 1.5).cv).toBeCloseTo(0.59 * 1.5, 12);
  });
  it('zones 1 and 2 ignore them (plain numbers in the table)', () => {
    expect(spec(2, 'SD', 1.5, 2).ca).toBe(0.22);
    expect(spec(2, 'SD', 1.5, 2).cv).toBe(0.32);
  });
});

describe('§6.2.2 [6.3]/[6.4]: plateau to T2 inclusive, then Sa(T)', () => {
  const s = spec(4, 'SD');
  it('at T = T2 the plateau, just above it Cv/T: equal to rounding', () => {
    const at = designSeismicCoefficient({ spectrum: s, group: 'B', r: 7, t: s.t2 });
    const above = designSeismicCoefficient({ spectrum: s, group: 'B', r: 7, t: s.t2 + EPS });
    expect(at.basis).toBe('plateau');
    expect(above.basis).toBe('spectrum');
    expect(at.c).toBeCloseTo((2.5 * s.ca) / 7, 12);
    expect(above.c).toBeCloseTo(at.c, 6);
  });
  it('below T1, [6.3] still gives the plateau (no rising branch for C)', () => {
    expect(designSeismicCoefficient({ spectrum: s, group: 'B', r: 7, t: 0.01 }).c).toBeCloseTo((2.5 * s.ca) / 7, 12);
  });
  it('γr multiplies: group A is 1,3 × group B', () => {
    const b = designSeismicCoefficient({ spectrum: s, group: 'B', r: 4, t: 0.5 }).c;
    expect(designSeismicCoefficient({ spectrum: s, group: 'A', r: 4, t: 0.5 }).c).toBeCloseTo(1.3 * b, 12);
  });
});

describe('§6.2.2 [6.5]/[6.6]: the floors and the zone boundary between them', () => {
  it('[6.5] zone 4, R = 7, T = 3 s: Cv/T·γr/R = 0,0291 < 0,8·0,35·1,2/7 = 0,048, the floor governs', () => {
    const s = spec(4, 'SB');
    const c = designSeismicCoefficient({ spectrum: s, group: 'B', r: 7, t: 3 });
    expect((0.51 * 1.2) / 3 / 7).toBeLessThan((0.8 * 0.35 * 1.2) / 7);
    expect(c.c).toBeCloseTo((0.8 * 0.35 * 1.2) / 7, 12);
    expect(c.floorApplied).toBe('nearFault');
  });
  it('[6.5] carries no γr: the floor is the same for group Ao', () => {
    const s = spec(4, 'SB');
    const c = designSeismicCoefficient({ spectrum: s, group: 'Ao', r: 7, t: 12 });
    expect(c.c).toBeCloseTo(Math.max((0.51 * 1.2) / 12 * 1.5 / 7, (0.8 * 0.35 * 1.2) / 7), 12);
  });
  it('[6.5] zone 3 uses as = 0,25', () => {
    const c = designSeismicCoefficient({ spectrum: spec(3, 'SB'), group: 'B', r: 7, t: 7 });
    expect(c.c).toBeCloseTo((0.8 * 0.25 * 1.2) / 7, 12);
  });
  it('[6.6] zone 2, R = 7, T = 4,5 s: 0,11·Ca·γr governs, with no R and with γr', () => {
    const s = spec(2, 'SB');
    expect(designSeismicCoefficient({ spectrum: s, group: 'B', r: 7, t: 4.5 }).c).toBeCloseTo(0.11 * 0.18, 12);
    const a = designSeismicCoefficient({ spectrum: s, group: 'A', r: 7, t: 4.5 });
    expect(a.c).toBeCloseTo(0.11 * 0.18 * 1.3, 12);
    expect(a.floorApplied).toBe('lowZone');
  });
  it('[6.6] zone 1 uses its own Ca', () => {
    expect(designSeismicCoefficient({ spectrum: spec(1, 'SE'), group: 'B', r: 7, t: 2.9 }).c).toBeCloseTo(0.11 * 0.19, 12);
  });
});

describe('§6.2.3 [6.7]: T ≤ Cu·Ta', () => {
  // RC frame, H = 30 m, zone 4 (as = 0,35, Cu = 1,40): Ta = 0,0466·30^0,9.
  const ta = 0.0466 * Math.pow(30, 0.9);
  it('a computed period exactly at Cu·Ta is kept, one just above is cut to it', () => {
    const at = designPeriod({ heightM: 30, system: 'concreteMomentFrame', computedT: 1.4 * ta }, 0.35);
    expect(at.capped).toBe(false);
    const over = designPeriod({ heightM: 30, system: 'concreteMomentFrame', computedT: 1.4 * ta * 1.001 }, 0.35);
    expect(over.capped).toBe(true);
    expect(over.t).toBeCloseTo(1.4 * ta, 12);
  });
  it('a shorter computed period is used as it is (it raises C)', () => {
    expect(designPeriod({ heightM: 30, system: 'concreteMomentFrame', computedT: 0.5 * ta }, 0.35).t).toBeCloseTo(0.5 * ta, 12);
  });
  it('without a computed period, Ta [6.8]', () => {
    expect(designPeriod({ heightM: 30, system: 'concreteMomentFrame' }, 0.35).t).toBeCloseTo(ta, 12);
  });
});

describe('§6.2.4.1 [6.11]–[6.13]: the switch at T = 2·T2 (uncapped)', () => {
  const levels = [{ h: 3, w: 100 }, { h: 6, w: 100 }, { h: 9, w: 80 }];
  const sumWh = 300 + 600 + 720;
  it('at T = 2·T2 exactly, [6.11]', () => {
    const d = distributeInHeight(levels, 100, 1.0, 0.5);
    expect(d.topHeavy).toBe(false);
    expect(d.forces[2]!.f).toBeCloseTo((720 * 100) / sumWh, 12);
  });
  it('just above, [6.12] for the others and [6.13] for the last mass; the sum is still Vo', () => {
    const d = distributeInHeight(levels, 100, 1.0 + EPS, 0.5);
    expect(d.topHeavy).toBe(true);
    expect(d.forces[0]!.f).toBeCloseTo((0.9 * 300 * 100) / sumWh, 12);
    expect(d.forces[2]!.f).toBeCloseTo((0.9 * 720 * 100) / sumWh + 10, 12);
    expect(d.forces.reduce((s, f) => s + f.f, 0)).toBeCloseTo(100, 12);
  });
});

describe('§2.7.2 / §2.7.3 / Tabla 2.5: when the static method applies', () => {
  const base = { zone: 4 as const, group: 'Ao' as const, regularity: 'regular' as const };
  it('3 levels at any height, or under 9 m with any number of levels, is admitted', () => {
    expect(staticMethodApplicable({ ...base, heightM: 13, levels: 3 }).allowed).toBe(true);
    expect(staticMethodApplicable({ ...base, heightM: 8.99, levels: 6 }).allowed).toBe(true);
  });
  it('4 levels and 13 m in zone 4 for group Ao goes to Tabla 2.5 (12 m) and is refused', () => {
    expect(staticMethodApplicable({ ...base, heightM: 13, levels: 4 }).allowed).toBe(false);
  });
  it('§2.7.3: T = 3·T2 is still static, just above is dynamic, whatever the height', () => {
    expect(staticMethodApplicable({ ...base, heightM: 6, levels: 2, t: 1.5, t2: 0.5 }).allowed).toBe(true);
    const r = staticMethodApplicable({ ...base, heightM: 6, levels: 2, t: 1.5 + EPS, t2: 0.5 });
    expect(r.allowed).toBe(false);
    expect(r.dynamicRequired).toBe(true);
  });
  // Regression: Tabla 2.5 gives group Ao line 1a of Tabla 2.4 in every zone, and line 1a of
  // Tabla 2.3 in zones 3 and 4. A medium irregularity was let through for Ao.
  it('Tabla 2.5: group Ao with a medium irregularity is refused; groups A and B admit it (line 1b)', () => {
    for (const zone of [1, 2, 3, 4] as const) {
      const ao = staticMethodApplicable({ zone, group: 'Ao', heightM: 10, levels: 4, regularity: 'medium' });
      expect(ao.allowed).toBe(false);
      expect(ao.dynamicRequired).toBe(true);
      for (const group of ['A', 'B'] as const) {
        expect(staticMethodApplicable({ zone, group, heightM: 10, levels: 4, regularity: 'medium' }).allowed).toBe(true);
      }
    }
    // Under the small-building exemption the table is not read at all.
    expect(staticMethodApplicable({ zone: 4, group: 'Ao', heightM: 8, levels: 3, regularity: 'medium' }).allowed).toBe(true);
  });
});

describe('§3.5.2 [3.10] and [3.18]: E = EH ± EV, EV = (Ca/2)·γr·D', () => {
  const INPRES103_SEISMIC = loadCodeFor('inpres103-2018') as SeismicCode;
  const combos: LoadCombinationSpec[] = [
    { id: '1', basic: 1, terms: [{ symbol: 'D', factor: 1.4 }], label: '1.4 D', refs: [], notes: [] },
    { id: '5', basic: 5, terms: [{ symbol: 'D', factor: 1.2 }, { symbol: 'E', factor: 1 }, { symbol: 'L', factor: 0.5 }], label: '', refs: [], notes: [] },
    { id: '7', basic: 7, terms: [{ symbol: 'D', factor: 0.9 }, { symbol: 'E', factor: 1 }], label: '', refs: [], notes: [] },
  ];
  const sink = () => ({ refs: [], derivation: [] }) as unknown as Parameters<NonNullable<typeof INPRES103_SEISMIC.vertical>>[2];

  it('zone 4, SD (Ca = 0,40), group A (γr = 1,3): D ± 0,26 in each seismic combination, both senses', () => {
    const out = INPRES103_SEISMIC.vertical!(combos, { source: 'cirsoc103', ca: 0.40, gammaR: 1.3 } as never, sink());
    const d = (id: string) => out.find((c) => c.id === id)!.terms.find((t) => t.symbol === 'D')!.factor;
    expect(d('5+Ev')).toBeCloseTo(1.2 + 0.26, 10);
    expect(d('5-Ev')).toBeCloseTo(1.2 - 0.26, 10);
    expect(d('7+Ev')).toBeCloseTo(0.9 + 0.26, 10);
    expect(d('7-Ev')).toBeCloseTo(0.9 - 0.26, 10);
    // Combinations without E are untouched and appear once.
    expect(out.filter((c) => c.id.startsWith('1'))).toEqual([combos[0]]);
    expect(out).toHaveLength(5);
    // Only D carries EV: E and L keep their factors.
    expect(out.find((c) => c.id === '5-Ev')!.terms.find((t) => t.symbol === 'L')!.factor).toBe(0.5);
  });
});
