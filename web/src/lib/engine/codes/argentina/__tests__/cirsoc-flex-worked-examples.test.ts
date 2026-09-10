/**
 * Our answers against the worked examples the CIRSOC_FLEX workbook ships with.
 *
 * ── Why these numbers are worth more than any test we could invent ─
 *
 * Everything else in this directory checks the implementation against itself:
 * equilibrium, monotonicity, one case agreeing with another. Those catch a
 * factor of two and they cannot catch a misread clause, because a misreading
 * is self-consistent.
 *
 * INTI-CIRSOC's workbook is the reference practically every Argentine
 * engineer checks against, and it ships with its input cells populated and
 * its result cells computed. That is an independent answer to a fully
 * specified question — the only kind of oracle available here.
 *
 * NOTHING of the workbook is reproduced. What is used is the pair (inputs,
 * published results), read out of the file and written down below as
 * constants, the way one would quote a textbook example.
 *
 * ── Reading the inputs across ──────────────────────────────────────
 *
 * The workbook takes `d's`, the distance from the compressed face to the bar
 * CENTRE. This module takes clear cover and adds the stirrup and half a bar
 * itself. So `cover` here is `d's` minus what `effectiveDepth` will add back
 * — with no stirrup and the assumed Ø16, that is `d's − 8 mm`. Getting this
 * wrong was the first run's whole discrepancy, and it is the kind of mismatch
 * that looks like a code error and is a units error.
 */

import { describe, it, expect } from 'vitest';
import { checkFlexure } from '../cirsoc201';
import { checkFlexureFlanged } from '../cirsoc201-flanged';
import { checkColumn } from '../cirsoc201';
import { designCircular, checkColumnCircular } from '../cirsoc201-circular';
import { COLUMN_STEEL_RATIO } from '../cirsoc201-basis';

/** `d's` minus the 8 mm `effectiveDepth` adds for the assumed Ø16 bar. */
const coverFor = (dPrimeS: number) => dPrimeS - 0.008;

describe('FSR — rectangular section in simple bending', () => {
  /*
   * The sheet as it ships: f'c 25, fy 420, b 0.12, h 0.40, d's 0.034,
   * Mu 52 kN·m.
   */
  const r = checkFlexure(
    { fc: 25, fy: 420, cover: coverFor(0.034), b: 0.12, h: 0.40, stirrupDia: 0 },
    52,
  );

  it('reaches the same effective depth', () => {
    expect(r.d).toBeCloseTo(0.366, 6);
  });

  it('asks for the same steel', () => {
    // Published: As = 4.145275990221534 cm²
    expect(r.AsFlexural).toBeCloseTo(4.1453, 4);
  });

  it('applies the same minimum', () => {
    // Published: As,mín = 1.4639999999999997 cm²
    expect(r.AsMin).toBeCloseTo(1.4640, 4);
  });

  it('puts the neutral axis and the block in the same place', () => {
    // Published: a = 0.06827513395658998, c = 0.08032368700775291
    expect(r.aReq).toBeCloseTo(0.068275, 6);
    expect(r.c).toBeCloseTo(0.080324, 6);
  });

  it('agrees on the tension-controlled limit and the strain', () => {
    // Published: cmax = 0.13724999999999998, εt = 0.010669691231853188
    expect(r.cMax).toBeCloseTo(0.137250, 6);
    expect(r.epsilonT).toBeCloseTo(0.0106697, 7);
  });

  it('and calls it tension-controlled, as the sheet does with φ = 0.90', () => {
    expect(r.epsilonT).toBeGreaterThan(0.005);
    expect(r.isDoublyReinforced, "the sheet leaves A's empty").toBe(false);
  });
});

describe('FST — flanged section in simple bending', () => {
  /*
   * f'c 25, fy 420, bf 1.37, hf 0.10, bw 0.12, h 0.40, d's 0.032, Mu 52 kN·m.
   *
   * The interesting part is that this is the shallow case: with a 1.37 m
   * flange the block is 5 mm deep, so the section is a rectangle of width bf
   * and the answer must come out of the same engine the FSR case used.
   */
  const r = checkFlexureFlanged(
    { fc: 25, fy: 420, cover: coverFor(0.032), b: 0.12, h: 0.40, stirrupDia: 0 },
    { bf: 1.37, hf: 0.10, bw: 0.12 },
    52,
  );

  it('asks for the same steel', () => {
    // Published: As = 3.766010921123097 cm²
    expect(r.AsFlexural).toBeCloseTo(3.7660, 4);
  });

  it('takes its minimum off the web, and gets the sheet number', () => {
    // Published: As,mín = 1.4719999999999998 cm² — on bw = 0.12, not bf = 1.37
    expect(r.AsMin).toBeCloseTo(1.4720, 4);
  });

  it('keeps the block inside the flange', () => {
    // Published: a = 0.005433145854432626 m, well under hf = 0.10
    expect(r.withinFlange).toBe(true);
    expect(r.aReq).toBeCloseTo(0.0054331, 7);
    expect(r.AsFlange).toBe(0);
  });

  it('and the strain is enormous, as a 1.37 m flange implies', () => {
    // Published: εt = 0.16971761611818456
    expect(r.epsilonT).toBeCloseTo(0.1697176, 6);
  });
});


describe('FCR — rectangular section under axial load and bending', () => {
  /*
   * f'c 25, fy 420, ties, b 0.30, h 0.30, d's 0.05, Pu 500 kN, Mu 100 kN·m,
   * with A's/As = 1. Published: A's = As = 10.6677 cm², Ast = 21.3354 cm².
   */
  const r = checkColumn(
    { fc: 25, fy: 420, cover: 0.042, b: 0.30, h: 0.30, stirrupDia: 0 },
    500, 100,
  );

  it('reaches the same effective depths', () => {
    expect(r.steps.join(' ')).toContain("d = 25.0 cm, d' = 5.0 cm");
  });

  it('agrees exactly on §10.9.1 bounds', () => {
    // Published: Ast,mín 9.00 cm², Ast,máx 72.00 cm² on Ag = 0.09 m²
    const Ag = 0.30 * 0.30;
    expect(COLUMN_STEEL_RATIO.min * Ag * 1e4).toBeCloseTo(9.0, 6);
    expect(COLUMN_STEEL_RATIO.max * Ag * 1e4).toBeCloseTo(72.0, 6);
  });

  /**
   * ── A KNOWN DEVIATION, pinned rather than hidden ─────────────────
   *
   * The workbook solves the section by strain compatibility and gets
   * 21.34 cm². `checkColumn` splits the demand into a flexural part and an
   * axial part and adds the steel — its own steps say so — which is a
   * straight-line reading of the interaction diagram and lands at 25.69 cm²,
   * about 20 % MORE steel.
   *
   * Conservative, so nothing unsafe ships, and worth knowing before these
   * numbers are used to cross-check PRO's concrete design: they will not
   * match a hand calculation, and the difference is method, not error.
   *
   * The bound is asserted both ways. If someone replaces the straight line
   * with the real curve — `generateInteractionDiagram` already exists — this
   * test fails, which is the notification that the deviation is gone.
   */
  it('is about 20 % conservative against the workbook, and that is the method', () => {
    const published = 21.3354;
    expect(r.AsTotal / published).toBeGreaterThan(1.10);
    expect(r.AsTotal / published).toBeLessThan(1.30);
  });
});

describe('FCR-CIR — circular column', () => {
  /*
   * D 0.40, 12 bars, SPIRAL, d's 0.03, Pu 1000 kN, Mu 300 kN·m.
   * Published: Ast = 86.5608 cm², Asi = 7.2134 cm².
   */
  const geom = {
    D: 0.40, fc: 25, fy: 420, cover: 0.03, barCount: 12,
    confinement: 'spiral' as const,
  };

  it('agrees exactly on §10.9.1 bounds', () => {
    // Published: Ast,mín 12.5664 cm², Ast,máx 100.5310 cm²
    const Ag = Math.PI * 0.2 ** 2;
    expect(COLUMN_STEEL_RATIO.min * Ag * 1e4).toBeCloseTo(12.5664, 4);
    expect(COLUMN_STEEL_RATIO.max * Ag * 1e4).toBeCloseTo(100.5310, 4);
  });

  it('applies the regulation φ for a spiral, not the ACI one', () => {
    /*
     * THE test this comparison produced. The module used 0.75, which is ACI
     * 318-08's value and what most post-2008 tables print; CIRSOC 201-05
     * says 0.70. At 0.75 this column came out with 15 % LESS steel than the
     * regulation asks — unconservative, and invisible without the workbook
     * to compare against.
     */
    const chk = checkColumnCircular({ ...geom, AstCm2: 86.5608 }, 1000, 300);
    expect(chk.epsT).toBeCloseTo(0.0021, 4); // compression-controlled here
    expect(chk.phi).toBeCloseTo(0.70, 10);
  });

  it('lands within 5 % of the published steel', () => {
    /*
     * Not exact, and the residual is a stated difference rather than an
     * unknown: the workbook offers a favourable/unfavourable bar placement
     * and its example uses the favourable one, while `barRing` always puts a
     * bar at the top. Five per cent on the conservative side of nothing —
     * tightening it would mean adopting an option we do not offer.
     */
    const sized = designCircular(geom, 1000, 300);
    expect(sized).not.toBeNull();
    const ratio = sized!.AstCm2 / 86.5608;
    expect(ratio, `ours ${sized!.AstCm2.toFixed(2)} vs published 86.56`).toBeGreaterThan(0.94);
    expect(ratio).toBeLessThan(1.06);
  });
});
