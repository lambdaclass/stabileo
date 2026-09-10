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
