/**
 * From a solved member to the calculator's fields, sign and all.
 *
 * The sign is the reason this is tested at unit level rather than through
 * the viewport. The solver reports axial NEGATIVE in compression; the
 * workbook's Pu is POSITIVE in compression. One flip, in one place — and a
 * flip that is missing or doubled gives a perfectly plausible number that
 * turns a column in compression into one in tension, which moves it to the
 * opposite end of the interaction diagram.
 *
 * The measurement behind that claim: a 3 m cantilever column under 100 kN
 * applied downward returns `nStart = -100` from the solver. Everything here
 * follows from that one observation.
 */

import { describe, it, expect } from 'vitest';
import {
  demandForCase, CASE_TAKES, type StationForces,
} from '../flex-demand-from-model';
import type { FlexCase } from '../cirsoc-flex';

/** A column carrying 250 kN of compression and 40 kN·m of moment. */
const COMPRESSED: StationForces = { n: -250, my: 40, mz: 12 };
/** A tie: the same member in tension. */
const STRETCHED: StationForces = { n: 180, my: -40, mz: -12 };

describe('the axial sign', () => {
  it('turns the solver’s compression into the sheet’s positive Pu', () => {
    expect(demandForCase(COMPRESSED, 'FCR').Pu).toBe(250);
  });

  it('and keeps tension negative, rather than taking a magnitude', () => {
    /*
     * A tie is a real case and the calculator accepts it — the interaction
     * curve runs into the tension quadrant. Taking |n| here would silently
     * check the wrong half of the diagram.
     */
    expect(demandForCase(STRETCHED, 'FCR').Pu).toBe(-180);
  });

  it('flips once, not twice', () => {
    /* Belt and braces on the defect that would look most reasonable. */
    const pu = demandForCase(COMPRESSED, 'FCR').Pu!;
    expect(Math.sign(pu)).toBe(-Math.sign(COMPRESSED.n));
    expect(Math.abs(pu)).toBe(Math.abs(COMPRESSED.n));
  });
});

describe('moments arrive as magnitudes', () => {
  it('because the Case has no side', () => {
    /*
     * The sheet asks for Mu "siempre positivo"; which face is in tension is
     * settled by where d′ and d′s are placed, not by the sign of the input.
     */
    expect(demandForCase(COMPRESSED, 'FSR').Mu).toBe(40);
    expect(demandForCase(STRETCHED, 'FSR').Mu).toBe(40);
  });

  it('including the second axis', () => {
    expect(demandForCase(COMPRESSED, 'FCO').Muy).toBe(12);
    expect(demandForCase(STRETCHED, 'FCO').Muy).toBe(12);
  });
});

describe('each Case takes what it uses, and no more', () => {
  const CASES: FlexCase[] = ['FSR', 'FST', 'FCR', 'FCR-CIR', 'FCO'];

  it('simple bending gets a moment and nothing else', () => {
    for (const kase of ['FSR', 'FST'] as FlexCase[]) {
      const d = demandForCase(COMPRESSED, kase);
      expect(d.Mu, kase).toBe(40);
      expect(d.Pu, `${kase} must not be handed an axial force`).toBeUndefined();
      expect(d.Muy, `${kase} is not biaxial`).toBeUndefined();
    }
  });

  it('composite flexure gets the axial force, but not a second moment', () => {
    for (const kase of ['FCR', 'FCR-CIR'] as FlexCase[]) {
      const d = demandForCase(COMPRESSED, kase);
      expect(d.Pu, kase).toBe(250);
      expect(d.Muy, `${kase} bends about one axis`).toBeUndefined();
    }
  });

  it('skew flexure gets all three', () => {
    const d = demandForCase(COMPRESSED, 'FCO');
    expect(d.Pu).toBe(250);
    expect(d.Mu).toBe(40);
    expect(d.Muy).toBe(12);
  });

  it('every Case is accounted for, so a new one cannot be forgotten', () => {
    /*
     * The failure this guards is silence: add a sixth Case and, without
     * this, it would quietly take the `FSR` shape — a moment only — with
     * nothing to say it had never been considered.
     */
    for (const kase of CASES) {
      expect(CASE_TAKES[kase], kase).toBeDefined();
      expect(demandForCase(COMPRESSED, kase).Mu).toBe(40);
    }
    expect(Object.keys(CASE_TAKES).sort()).toEqual([...CASES].sort());
  });
});

describe('a plane frame', () => {
  it('has no weak-axis moment, so a biaxial Case gets a true zero', () => {
    /*
     * `stationForces2D` returns `mz: 0` by construction. Reporting 0 rather
     * than leaving the field alone is the right call: it says the model has
     * nothing to offer there, instead of leaving a stale number from a
     * previous pick beside two fresh ones.
     */
    const plane: StationForces = { n: -250, my: 40, mz: 0 };
    expect(demandForCase(plane, 'FCO').Muy).toBe(0);
  });
});

describe('rounding', () => {
  it('keeps two decimals, because these are kN off a diagram', () => {
    const f: StationForces = { n: -249.876543, my: 39.994321, mz: 0 };
    const d = demandForCase(f, 'FCO');
    expect(d.Pu).toBe(249.88);
    expect(d.Mu).toBe(39.99);
  });

  it('does not turn a small force into zero', () => {
    const f: StationForces = { n: -0.4, my: 0.126, mz: 0 };
    const d = demandForCase(f, 'FCR');
    expect(d.Pu).toBe(0.4);
    expect(d.Mu).toBe(0.13);
  });
});
