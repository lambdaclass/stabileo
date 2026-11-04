/**
 * Differential test: the concrete modules that moved into the engine, against the TypeScript
 * they replaced (`oracle/`), on thousands of random valid sections. Each disagreement is
 * resolved against the clause and pinned here (docs/verification/TS_ENGINE_LOGIC.md).
 *
 *  - capacity (`rectCapacity`, `flangedCapacity`): agree to 1e-8 — the TypeScript fixed point
 *    on fs had already been fixed to strain compatibility;
 *  - the legacy designer (`checkFlexure`): agrees on the requirement where both are singly
 *    reinforced and tension-controlled; elsewhere the TypeScript's own designs FAILED the
 *    engine's check of the bars it chose (strength: d taken for Ø16 whatever bar it chose, and
 *    compression steel assumed to yield; ductility: εt of the bars provided never checked). The
 *    engine-sized designer passes its own bars by construction;
 *  - the legacy column check (`checkColumn`): additive "As for M + ½ As for N" with a
 *    straight-line interaction, and the axial force taken as compression whatever its sign;
 *  - the interaction diagram: the compression bars were not net of the concrete they displace,
 *    and φ was read from |εs| of the tension layer even when it was in compression;
 *  - circular columns: the closed-form segment agrees; the TypeScript read the capacity off a
 *    straight line between two samples, and a pure moment at the nose of the curve instead of
 *    where it crosses φPn = 0;
 *  - slabs: a slab too thin for its moment was given ρmax and designed anyway; the capacity of
 *    the bars chosen used fy and the φ of the required steel.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import * as eng from '../../codes/argentina/cirsoc201';
import * as old from './oracle/cirsoc201';
import * as engCap from '../../codes/argentina/cirsoc201-capacity';
import * as oldCap from './oracle/cirsoc201-capacity';
import * as engCir from '../../codes/argentina/cirsoc201-circular';
import * as oldCir from './oracle/cirsoc201-circular';
import * as engID from '../../codes/argentina/interaction-diagram';
import * as oldID from './oracle/interaction-diagram';
import * as engSl from '../../codes/argentina/losas';
import * as oldSl from './oracle/losas';
import { evaluateBeamSection } from '../../codes/argentina/cirsoc201-beam-kernel';
import { computeColumnLayout, computeColumnCapacity } from '../../station-design-forces';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-9);

const beamArb = fc.record({
  fc: fc.constantFrom(20, 25, 30, 40), fy: fc.constantFrom(420, 500),
  b: fc.double({ min: 0.15, max: 0.5, noNaN: true }), h: fc.double({ min: 0.3, max: 0.9, noNaN: true }),
  As: fc.double({ min: 1, max: 60, noNaN: true }), Mu: fc.double({ min: 5, max: 600, noNaN: true }),
});
const params = (s: { fc: number; fy: number; b: number; h: number }) =>
  ({ fc: s.fc, fy: s.fy, cover: 0.03, b: s.b, h: s.h, stirrupDia: 8 });

/** The engine's verdict on a design's bars, where those bars sit. */
function engineJudges(edition: '2005' | '2025', s: { fc: number; fy: number; b: number; h: number; Mu: number },
  r: { AsProv: number; barDia: number; AsComp?: number; barDiaComp?: number }) {
  const d = s.h - 0.03 - 0.008 - r.barDia / 2000;
  const dp = r.barDiaComp ? 0.03 + 0.008 + r.barDiaComp / 2000 : 0;
  const q = evaluateBeamSection({ edition, fc: s.fc * 1e6, fy: s.fy * 1e6, b: s.b, h: s.h, d,
    As: r.AsProv * 1e-4, AsComp: (r.AsComp ?? 0) * 1e-4, dPrime: dp })!;
  if (!q.flexureValid || q.phiMn / 1e3 < s.Mu) return 'strength';
  if (q.epsilonT < q.epsilonTMin) return 'ductility';
  return 'pass';
}

describe('capacity of a given section', () => {
  it('rectangular and flanged: the engine and the TypeScript fixed point agree (2 000 sections)', () => {
    for (const s of fc.sample(beamArb, { numRuns: 2000, seed: 1 })) {
      for (const edition of ['2005'] as const) {
        const a = engCap.rectCapacity(params(s), s.As, edition), o = oldCap.rectCapacity(params(s), s.As);
        expect(rel(a.phiMn, o.phiMn), JSON.stringify(s)).toBeLessThan(1e-8);
        expect(rel(a.c, o.c)).toBeLessThan(1e-8);
        const T = { bf: s.b * 3, hf: 0.1, bw: s.b };
        const fa = engCap.flangedCapacity(params(s), T, s.As, edition), fo = oldCap.flangedCapacity(params(s), T, s.As);
        expect(rel(fa.phiMn, fo.phiMn), JSON.stringify(s)).toBeLessThan(1e-8);
        expect(fa.withinFlange).toBe(fo.withinFlange);
      }
    }
  });
});

describe('the legacy beam designer', () => {
  const samples = fc.sample(beamArb, { numRuns: 2000, seed: 1 });

  it('agrees on the requirement where both are singly reinforced and tension-controlled', () => {
    let compared = 0;
    for (const s of samples) {
      const o = old.checkFlexure(params(s), s.Mu);
      if (o.isDoublyReinforced || !(o.epsilonT >= 0.005)) continue;
      const a = eng.checkFlexure(params(s), s.Mu, 0, { edition: '2005' });
      expect(rel(a.AsFlexural, o.AsFlexural), JSON.stringify(s)).toBeLessThan(1e-6);
      compared++;
    }
    expect(compared).toBeGreaterThan(1000);
  });

  it('the TypeScript designs the engine rejects — and none of the engine-sized ones', () => {
    for (const edition of ['2005', '2025'] as const) {
      const oldDefects = { strength: 0, ductility: 0 };
      for (const s of samples) {
        const o = old.checkFlexure(params(s), s.Mu);
        if (o.status !== 'fail') {
          const v = engineJudges(edition, s, o);
          if (v !== 'pass') oldDefects[v]++;
        }
        const a = eng.checkFlexure(params(s), s.Mu, 0, { edition });
        if (a.status !== 'fail') {
          expect(engineJudges(edition, s, a), `${edition} ${JSON.stringify(s)}`).toBe('pass');
        }
      }
      // Pinned: the old designer passed sections the engine fails, in both editions, on both counts.
      expect(oldDefects.strength, edition).toBeGreaterThan(50);
      expect(oldDefects.ductility, edition).toBeGreaterThan(50);
    }
  }, 300_000);
});

describe('the legacy column check', () => {
  it('took a tension as compression; the engine-sized column carries both', () => {
    const P = { fc: 25, fy: 420, cover: 0.03, b: 0.3, h: 0.3, stirrupDia: 8 };
    const o = old.checkColumn(P, -300, 60);
    expect(o.Nu).toBe(300); // the sign was dropped: the check ran as if compressed
    const a = eng.checkColumn(P, -300, 60);
    expect(a.Nu).toBe(-300);
    expect(a.status).not.toBe('fail');
    const la = computeColumnLayout(a.barCount, a.barDia, 0.3, 0.3, 0.03, 8);
    expect(computeColumnCapacity(la.totalArea, 0.3, 0.3, 25, 420, 0.03, 8, -300, 60, la.bars).ratio).toBeGreaterThanOrEqual(1);
  });

  it('every engine-sized column passes the engine; the additive rule was light somewhere (300 demands)', () => {
    const g = fc.record({ Pu: fc.double({ min: -300, max: 1500, noNaN: true }), Mu: fc.double({ min: 5, max: 150, noNaN: true }) });
    const P = { fc: 25, fy: 420, cover: 0.03, b: 0.3, h: 0.3, stirrupDia: 8 };
    let oldLight = 0;
    for (const { Pu, Mu } of fc.sample(g, { numRuns: 300, seed: 5 })) {
      const a = eng.checkColumn(P, Pu, Mu);
      if (a.status !== 'fail') expect(a.ratio).toBeLessThanOrEqual(1);
      const o = old.checkColumn(P, Pu, Mu);
      if (o.status !== 'fail') {
        const l = computeColumnLayout(o.barCount, o.barDia, 0.3, 0.3, 0.03, 8);
        if (computeColumnCapacity(l.totalArea, 0.3, 0.3, 25, 420, 0.03, 8, Pu, Mu, l.bars).ratio < 1) oldLight++;
      }
    }
    expect(oldLight).toBeGreaterThan(0);
  });
});

describe('the rectangular interaction diagram', () => {
  it('φ is not read from a tension layer that is in compression', () => {
    // fy = 220: εy = 1,1 ‰. At c = 2h = 0,60 m the far layer (d = 0,25) is COMPRESSED at
    // 0,003·(0,60 − 0,25)/0,60 = 1,75 ‰ > εy; the oracle took |εs| and credited the transition φ.
    // Every bar is in compression there: φ = 0,65 (Tabla 21.2.2 / 9.3.2.2).
    const p = { b: 0.3, h: 0.3, fc: 25, fy: 220, cover: 0.05, AsProv: 20, barCount: 8, barDia: 20, nPoints: 40 };
    const o = oldID.generateInteractionDiagram(p);
    const a = engID.generateInteractionDiagram({ ...p, edition: '2005' });
    const at = (pts: typeof o.points, c: number) => pts.reduce((b, q) => (Math.abs(q.c - c) < Math.abs(b.c - c) ? q : b));
    const po = at(o.points, 0.6), pa = at(a.points, 0.6);
    expect(po.c).toBeCloseTo(0.6, 12);
    expect(pa.c).toBeCloseTo(0.6, 12);
    // Both bars sit inside the block, so the deduction is symmetric and Mn is the same: the
    // moment ratio is the φ ratio, 0,65 against the oracle's inflated φ.
    expect(pa.phiMn / po.phiMn).toBeLessThan(0.99); // the oracle over-credited it
  });

  it('agrees with the oracle where neither defect reaches: bars in the tension zone only', () => {
    // Below the balanced point with the compression bars outside the block, the two coincide.
    const p = { b: 0.3, h: 0.5, fc: 25, fy: 420, cover: 0.05, AsProv: 10, barCount: 4, barDia: 16, nPoints: 40 };
    const o = oldID.generateInteractionDiagram(p);
    const a = engID.generateInteractionDiagram({ ...p, edition: '2005' });
    let compared = 0;
    o.points.forEach((q, i) => {
      const r = a.points[i];
      expect(r.c).toBeCloseTo(q.c, 12);
      if (0.85 * q.c < p.cover && q.c > 0.0011) {
        expect(rel(r.phiMn, q.phiMn)).toBeLessThan(1e-9);
        compared++;
      }
    });
    expect(compared).toBeGreaterThan(0);
  });
});

describe('circular columns', () => {
  it('agree with the closed-form oracle along the eccentricity ray (500 columns)', () => {
    const g = fc.record({
      D: fc.double({ min: 0.3, max: 1.0, noNaN: true }), fc: fc.constantFrom(20, 25, 30, 40), fy: fc.constantFrom(420, 500),
      rho: fc.double({ min: 0.01, max: 0.06, noNaN: true }), n: fc.integer({ min: 6, max: 16 }), spiral: fc.boolean(),
      pu: fc.double({ min: 0.05, max: 0.6, noNaN: true }), e: fc.double({ min: 0.02, max: 0.8, noNaN: true }),
    });
    let worst = 0;
    let chordOutside = 0;
    for (const k of fc.sample(g, { numRuns: 500, seed: 9 })) {
      const Ag = Math.PI * (k.D / 2) ** 2;
      const col = { D: k.D, fc: k.fc, fy: k.fy, cover: 0.05, AstCm2: k.rho * Ag * 1e4, barCount: k.n,
        confinement: (k.spiral ? 'spiral' : 'ties') as 'spiral' | 'ties' };
      const Pu = k.pu * 0.85 * k.fc * 1000 * Ag;
      const Mu = Pu * k.e * k.D;
      const a = engCir.checkColumnCircular({ ...col, edition: '2005' }, Pu, Mu);
      const o = oldCir.checkColumnCircular(col, Pu, Mu);
      worst = Math.max(worst, rel(a.ratio, o.ratio));
      /*
       * The oracle interpolated a chord between samples. Where the curve is convex the chord is
       * inside it (conservative); where φ changes along the curve it is not, and the chord lies
       * OUTSIDE — the oracle then reported less demand than the section has.
       */
      if (a.ratio > o.ratio * (1 + 1e-3)) chordOutside++;
    }
    expect(worst).toBeLessThan(0.06);
    expect(chordOutside).toBeGreaterThan(0);
  });

  it('a pure moment is read where the curve crosses φPn = 0, not at its nose', () => {
    const col = { D: 0.5, fc: 25, fy: 420, cover: 0.05, AstCm2: 40, barCount: 8, edition: '2005' as const };
    const a = engCir.checkColumnCircular(col, 0, 100);
    const o = oldCir.checkColumnCircular(col, 0, 100);
    expect(a.phiPn).toBeCloseTo(0, 6);
    expect(o.phiMn).toBeGreaterThan(a.phiMn); // the nose overstated a beam-column's moment capacity
  });
});

describe('slabs', () => {
  it('agree on a slab the clause handles the same way, and refuse one that is too thin', () => {
    const base = { type: 'unidirectional' as const, h: 0.15, fc: 25, fy: 420, cover: 0.02 };
    const a = engSl.designSlab({ ...base, Mu_x: 20, edition: '2005' });
    const o = oldSl.designSlab({ ...base, Mu_x: 20 });
    expect(rel(a.primary.As_req, o.primary.As_req)).toBeLessThan(1e-6);
    expect(a.overallStatus).not.toBe('fail');
    // 200 kN·m/m on 12 cm: the oracle took ρmax and designed it; the engine finds no ductile steel.
    const thin = { ...base, h: 0.12, Mu_x: 200 };
    expect(oldSl.designSlab(thin).primary.As_req).toBeGreaterThan(0);
    expect(engSl.designSlab({ ...thin, edition: '2005' }).overallStatus).toBe('fail');
  });
});
