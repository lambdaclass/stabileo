/**
 * Every Case, sized and then checked, over a grid rather than at one point.
 *
 * ── What this adds over the sheet-by-sheet comparisons ─────────────
 *
 * `cirsoc-flex-worked-examples`, `-all-sheets` and `-verification-sheets`
 * pin the workbook's published numbers: its five design examples, its three
 * verification examples, and the six characteristic points each of those
 * prints. That is depth at a handful of points, and it is the right way to
 * establish that the clauses are the workbook's.
 *
 * It says nothing about the space between those points. A calculator can
 * reproduce eight published answers exactly and still be wrong at the ninth
 * — the dead band that shipped did precisely that, sitting between two
 * moments the examples never asked for.
 *
 * So this sweeps. The invariant it sweeps is the strongest one available
 * without a second published answer for every point: SIZING and CHECKING are
 * two different code paths through the same clauses, and they have to agree.
 * Size a section for a demand, hand the resulting steel back as a check
 * against that same demand, and the ratio must be 1. A bisection that
 * converges to the wrong place, a φ read at the wrong strain, a depth taken
 * from the field instead of the bars — each of those moves one path and not
 * the other.
 *
 * ── Why the two paths really are different ─────────────────────────
 *
 * Sizing bisects on the interaction curve looking for the steel that makes
 * the capacity meet the demand. Checking builds the section AT a given steel
 * and evaluates it once. They share the curve and nothing else: no shared
 * bisection, no shared cache, no shared branch on the mode. Agreement is
 * therefore evidence, not a tautology.
 */

import { describe, it, expect } from 'vitest';
import { solveFlex, type FlexInput, type FlexCase } from '../cirsoc-flex';

/** Section geometry per Case, taken from the workbook's own examples. */
const GEOM: Record<FlexCase, Record<string, unknown>> = {
  'FSR': { b: 0.12, h: 0.40, dPrimeS: 0.034, dPrime: 0.034 },
  'FST': { b: 1.37, bf: 1.37, hf: 0.10, bw: 0.12, h: 0.40, dPrimeS: 0.032, dPrime: 0.032 },
  'FCR': { b: 0.30, h: 0.30, dPrimeS: 0.05, dPrime: 0.05, ratioAsPrime: 1 },
  'FCR-CIR': { D: 0.40, Dint: 0, dPrimeS: 0.03, barCount: 12, barAtExtremeFibre: true },
  'FCO': {
    b: 0.30, h: 0.30, dPrimeH: 0.05, dPrimeV: 0.05, dPrimeS: 0.05, dPrime: 0.05,
    pctA1: 50, pctA2: 50, pctA3: 0, nA1: 4, nA2: 4, nA3: 0,
  },
};

/** Demands worth sweeping, per Case: light, working, and near the limit. */
const DEMANDS: Record<FlexCase, Array<{ Pu: number; Mu: number; Muy?: number }>> = {
  'FSR': [30, 45, 52, 70, 90, 110].map((Mu) => ({ Pu: 0, Mu })),
  'FST': [30, 52, 80, 120, 180].map((Mu) => ({ Pu: 0, Mu })),
  'FCR': [
    { Pu: 200, Mu: 40 }, { Pu: 500, Mu: 100 }, { Pu: 800, Mu: 60 },
    { Pu: 1200, Mu: 40 }, { Pu: 300, Mu: 120 }, { Pu: 0, Mu: 80 },
  ],
  'FCR-CIR': [
    { Pu: 400, Mu: 60 }, { Pu: 1000, Mu: 100 }, { Pu: 1500, Mu: 80 },
    { Pu: 200, Mu: 120 }, { Pu: 0, Mu: 90 },
  ],
  'FCO': [
    { Pu: 300, Mu: 40, Muy: 20 }, { Pu: 500, Mu: 100, Muy: 0 },
    { Pu: 700, Mu: 60, Muy: 60 }, { Pu: 200, Mu: 80, Muy: 40 },
  ],
};

const BASE = { fc: 25, fy: 420, confinement: 'ties', deductDisplacedConcrete: true };

function design(kase: FlexCase, d: { Pu: number; Mu: number; Muy?: number }) {
  return solveFlex({
    mode: 'design', kase, ...BASE, ...GEOM[kase],
    Pu: d.Pu, Mu: d.Mu, Muy: d.Muy ?? 0,
  } as unknown as FlexInput);
}

function verify(
  kase: FlexCase, d: { Pu: number; Mu: number; Muy?: number }, AstGiven: number,
) {
  return solveFlex({
    mode: 'verify', kase, ...BASE, ...GEOM[kase],
    Pu: d.Pu, Mu: d.Mu, Muy: d.Muy ?? 0, AstGiven, levels: [],
  } as unknown as FlexInput);
}

const CASES = Object.keys(GEOM) as FlexCase[];

describe('what sizing produces, checking confirms', () => {
  for (const kase of CASES) {
    for (const d of DEMANDS[kase]) {
      const label = d.Muy
        ? `Pu ${d.Pu}, Mx ${d.Mu}, My ${d.Muy}`
        : `Pu ${d.Pu}, Mu ${d.Mu}`;

      it(`${kase} at ${label}`, () => {
        const sized = design(kase, d);
        if (!sized.ok) return; // a section that cannot be designed has nothing to check

        /*
         * Beams report tension and compression steel apart, and the check
         * takes one area — so the pairing only holds where the section is
         * singly reinforced. Above that, design has a second layer of steel
         * the check is not being told about, and the two would be describing
         * different sections.
         */
        const isBeam = kase === 'FSR' || kase === 'FST';
        if (isBeam && (sized.AsPrimeCm2 ?? 0) > 0) return;
        const steel = isBeam ? sized.AsCm2! : sized.AstCm2;

        /*
         * Where a code MINIMUM governs, the section is stronger than the
         * demand by construction and the ratio is legitimately below 1 —
         * §10.9.1's 1 % for a column, §9.6.1.2 for a beam. The two paths
         * still have to agree on the steel; they just have nothing to say
         * about the boundary, because the boundary is not what set it.
         */
        const floors = [sized.AstMinCm2, sized.AsMinCm2].filter(
          (v): v is number => Number.isFinite(v),
        );
        const floor = floors.length ? Math.max(...floors) : 0;
        if (steel <= floor * 1.001) {
          const atFloor = verify(kase, d, steel);
          expect(atFloor.ok, `${kase}: the minimum must at least verify`).toBe(true);
          return;
        }

        const checked = verify(kase, d, steel);
        expect(checked.ratio, `${kase}: sized ${steel.toFixed(3)} cm²`)
          .toBeCloseTo(1, 1);
        expect(checked.ok, `${kase}: its own answer must verify`).toBe(true);
      });
    }
  }
});

describe('a little less steel does not pass', () => {
  /*
   * The other side of the boundary. Agreement at the design point is only
   * meaningful if the point is actually a boundary — a check that passes
   * everything would agree just as well.
   */
  for (const kase of CASES) {
    it(`${kase}: 90 % of the sized steel fails`, () => {
      const d = DEMANDS[kase][1];
      const sized = design(kase, d);
      if (!sized.ok) return;
      const isBeam = kase === 'FSR' || kase === 'FST';
      if (isBeam && (sized.AsPrimeCm2 ?? 0) > 0) return;
      const steel = isBeam ? sized.AsCm2! : sized.AstCm2;
      /* Only meaningful where the demand set the steel — see above. */
      const floors = [sized.AstMinCm2, sized.AsMinCm2].filter(
        (v): v is number => Number.isFinite(v),
      );
      if (steel <= (floors.length ? Math.max(...floors) : 0) * 1.001) return;

      const short = verify(kase, d, steel * 0.9);
      expect(short.ratio, `${kase}`).toBeGreaterThan(1);
      expect(short.ok).toBe(false);
    });
  }
});

describe('more demand always costs more steel', () => {
  for (const kase of CASES) {
    it(`${kase}: rising moment never gets cheaper`, () => {
      /*
       * Swept finely, because the failures worth catching here live between
       * the points an example would choose: the dead band that shipped was
       * five kN·m wide.
       */
      const d0 = DEMANDS[kase][1];
      let previous = 0;
      for (let k = 0; k <= 40; k++) {
        const Mu = d0.Mu * (0.3 + (k * 1.4) / 40);
        const r = design(kase, { ...d0, Mu });
        if (!r.ok) break;
        expect(r.AstCm2, `${kase} at Mu = ${Mu.toFixed(1)}`)
          .toBeGreaterThanOrEqual(previous - 1e-6);
        previous = r.AstCm2;
      }
      expect(previous, `${kase} designed something`).toBeGreaterThan(0);
    });
  }

  for (const kase of ['FCR', 'FCR-CIR', 'FCO'] as FlexCase[]) {
    it(`${kase}: rising axial load, past the balance point, costs more too`, () => {
      /*
       * A column is the interesting case: up to the balance point more
       * compression HELPS, and past it the steel has to come back. So this
       * asserts the shape rather than plain monotonicity — one minimum, and
       * no oscillation around it.
       */
      const d0 = DEMANDS[kase][1];
      const series: number[] = [];
      for (let Pu = 0; Pu <= 1600; Pu += 100) {
        const r = design(kase, { ...d0, Pu });
        series.push(r.ok ? r.AstCm2 : NaN);
      }
      const real = series.filter((v) => Number.isFinite(v));
      expect(real.length, `${kase} designed across the range`).toBeGreaterThan(6);

      /*
       * Count direction changes. A well-formed design curve turns at most
       * twice: once at the balance point, where more compression stops
       * helping, and once more where φ leaves its 0.90 plateau and the
       * ramp costs steel faster than the capacity gains it. A third turn is
       * not physics — it is the bisection landing on different parts of the
       * curve for neighbouring inputs, which is exactly how the Pu = 0
       * discontinuity looked before it was found.
       */
      let turns = 0;
      for (let k = 2; k < real.length; k++) {
        const a = Math.sign(real[k - 1] - real[k - 2]);
        const b = Math.sign(real[k] - real[k - 1]);
        if (a !== 0 && b !== 0 && a !== b) turns += 1;
      }
      expect(turns, `${kase}: ${real.map((v) => v.toFixed(1)).join(' ')}`)
        .toBeLessThanOrEqual(2);

      /*
       * And no isolated spike: every interior point within the span of its
       * neighbours, give or take. A single input answering very differently
       * from both sides is the shape of a special-cased branch.
       */
      for (let k = 1; k < real.length - 1; k++) {
        const lo = Math.min(real[k - 1], real[k + 1]);
        const hi = Math.max(real[k - 1], real[k + 1]);
        const slack = 0.15 * Math.max(hi, 1);
        expect(real[k], `${kase}: spike at index ${k} — ${real.map((v) => v.toFixed(1)).join(' ')}`)
          .toBeGreaterThanOrEqual(lo - slack);
        expect(real[k]).toBeLessThanOrEqual(hi + slack);
      }
    });
  }
});

describe('checking is monotone in the steel it is given', () => {
  for (const kase of CASES) {
    it(`${kase}: more steel never reads as less capacity, below the ductile limit`, () => {
      const d = DEMANDS[kase][1];
      let previous = 0;
      let seen = 0;
      for (const mult of [0.5, 0.7, 0.9, 1.0, 1.1, 1.3]) {
        const sized = design(kase, d);
        if (!sized.ok) return;
        const isBeam = kase === 'FSR' || kase === 'FST';
        const steel = (isBeam ? sized.AsCm2! : sized.AstCm2) * mult;
        const r = verify(kase, d, steel);
        if (!Number.isFinite(r.phiMn ?? NaN)) continue;
        /*
         * Up to the sized amount only. Past it a section can become
         * over-reinforced, where the next bar lowers εt, lowers φ with it,
         * and genuinely buys less — real behaviour, and not what is under
         * test here.
         */
        if (mult > 1.0) break;
        expect(r.phiMn!, `${kase} at ${mult}×`).toBeGreaterThanOrEqual(previous - 1e-6);
        previous = r.phiMn!;
        seen += 1;
      }
      expect(seen, `${kase} had points to compare`).toBeGreaterThan(2);
    });
  }
});
