import { describe, it, expect } from 'vitest';
import {
  designFilletWeld, minimumLegMm, maximumLegMm, effectiveThroatMm, effectiveLengthMm,
} from '../fillet-weld';

const full = (o = {}) => designFilletWeld({
  legMm: 6, lengthMm: 200, runs: 2, fexxMPa: 480,
  thickerPartMm: 12, thinnerPartMm: 10, demandKN: 100, ...o,
});
const check = (d: ReturnType<typeof designFilletWeld>, id: string) =>
  d.checks.find((c) => c.id === id)!;

describe('Tabla J.2.4 — minimum leg by the THICKER part', () => {
  it.each([[5, 3], [6, 3], [7, 5], [13, 5], [14, 6], [19, 6], [20, 8], [40, 8]])(
    '%i mm thick takes a %i mm leg', (t, expected) => {
      expect(minimumLegMm(t)).toBe(expected);
    });

  /*
   * Transcribed as ranges, because that is how the table is written. A fitted curve would answer
   * for thicknesses the table brackets differently — 13 and 14 mm are one millimetre apart and
   * two different rows.
   */
  it('brackets at the boundaries the table uses, not near them', () => {
    expect(minimumLegMm(13)).toBe(5);
    expect(minimumLegMm(13.01)).toBe(6);
  });
});

describe('§J.2.2(b) — maximum leg by the THINNER part', () => {
  it('is the thickness below 6 mm and thickness − 2 mm at or above', () => {
    expect(maximumLegMm(5)).toBe(5);
    expect(maximumLegMm(6)).toBe(4);
    expect(maximumLegMm(12)).toBe(10);
  });

  /*
   * Minimum takes the thicker part, maximum takes the thinner one. Using one thickness for both
   * is the mistake this pair of tests exists to catch: on a 20 mm plate welded to a 6 mm one the
   * minimum is 8 and the maximum is 4, which is a real and reportable conflict.
   */
  it('and the two rules read different parts, which can conflict', () => {
    const d = designFilletWeld({
      legMm: 6, lengthMm: 100, fexxMPa: 480, thickerPartMm: 20, thinnerPartMm: 6, demandKN: 10,
    });
    expect(check(d, 'minimumSize').limit).toBe(8);
    expect(check(d, 'maximumSize').limit).toBe(4);
    expect(check(d, 'minimumSize').state).toBe('exceeded');
    expect(check(d, 'maximumSize').state).toBe('exceeded');
  });
});

describe('§J.2.2(a) — the effective throat', () => {
  it('is 0,707 w for a manual fillet', () => {
    expect(effectiveThroatMm(8)).toBeCloseTo(0.707 * 8, 9);
  });

  /*
   * Submerged arc is not a footnote: the clause makes the throat the LEG itself up to 9 mm,
   * which is 41 % more than 0,707 w. Treating every fillet as manual would understate a
   * submerged-arc weld by that much.
   */
  it('is the leg itself for submerged arc up to 9 mm', () => {
    expect(effectiveThroatMm(8, 'submergedArc')).toBe(8);
    expect(effectiveThroatMm(8, 'submergedArc') / effectiveThroatMm(8)).toBeCloseTo(1 / 0.707, 3);
  });

  it('and the theoretical throat plus 3 mm above it', () => {
    expect(effectiveThroatMm(12, 'submergedArc')).toBeCloseTo(0.707 * 12 + 3, 9);
  });
});

describe('§J.2.1 — end-loaded fillets lose effectiveness', () => {
  it('are undiscounted up to 100 w', () => {
    expect(effectiveLengthMm(600, 6, 'endLoaded')).toBe(600);
  });

  it('are discounted between 100 w and 300 w', () => {
    // L/w = 200 → β = 1,2 − 0,4 = 0,8.
    expect(effectiveLengthMm(1200, 6, 'endLoaded')).toBeCloseTo(0.8 * 1200, 6);
  });

  it('are capped at 180 w above 300 w', () => {
    expect(effectiveLengthMm(3000, 6, 'endLoaded')).toBe(180 * 6);
  });

  /*
   * The discount applies ONLY to end-loaded welds. Applying it everywhere would understate a
   * weld the code does not discount, which is a different error from being unsafe but is still
   * a wrong number.
   */
  it('and do not apply anywhere else', () => {
    expect(effectiveLengthMm(3000, 6, 'other')).toBe(3000);
    expect(effectiveLengthMm(3000, 6)).toBe(3000);
  });
});

describe('§J.2.4 — the electrode capacity', () => {
  it('is φ (0,60 FEXX) Awe (10⁻¹), over every run', () => {
    const d = full();
    const throat = 0.707 * 6;
    const area = (throat * 200 * 2) / 100;
    expect(d.effectiveAreaCm2).toBeCloseTo(area, 9);
    expect(check(d, 'strength').limit).toBeCloseTo(0.6 * 0.6 * 480 * area * 0.1, 6);
    expect(check(d, 'strength').clause).toBe('J.2.4');
  });

  it('two runs carry twice one', () => {
    const one = full({ runs: 1 });
    const two = full({ runs: 2 });
    expect(check(two, 'strength').limit!).toBeCloseTo(check(one, 'strength').limit! * 2, 6);
  });

  it('reports exceeded rather than failing silently', () => {
    const d = full({ demandKN: 1e5 });
    expect(check(d, 'strength').state).toBe('exceeded');
    expect(d.state).toBe('exceeded');
  });
});

describe('the short-weld rule reports rather than applies', () => {
  /*
   * Below `4 w` the clause does not refuse the weld — «se considerará que el lado de la
   * soldadura no excede de 1/4 de la longitud efectiva». Applying that silently would change the
   * size the strength check just ran against, so it is reported instead.
   */
  it('flags a run shorter than four legs, and says what the clause does', () => {
    const d = full({ legMm: 8, lengthMm: 20 });
    expect(check(d, 'minimumLength').state).toBe('exceeded');
    expect(check(d, 'minimumLength').noteKeys).toContain('weld.note.shortWeldReducesSize');
  });

  it('and says nothing when the run is long enough', () => {
    expect(check(full(), 'minimumLength').state).toBe('adequate');
    expect(check(full(), 'minimumLength').noteKeys).toEqual([]);
  });
});

describe('the states, and the two it can never reach', () => {
  it('no size or no length is notDesigned', () => {
    expect(designFilletWeld({}).state).toBe('notDesigned');
    expect(designFilletWeld({ legMm: 6 }).state).toBe('notDesigned');
    expect(designFilletWeld({ legMm: 6 }).missingKeys).toContain('weld.missing.length');
  });

  it('a missing user input is incomplete', () => {
    const d = designFilletWeld({ legMm: 6, lengthMm: 200 });
    expect(d.state).toBe('incomplete');
    expect(d.missingKeys).toContain('weld.missing.fexx');
    expect(d.missingKeys).toContain('weld.missing.demand');
  });

  /*
   * A complete, adequate fillet tops out at `notVerifiable`, and this is the honest ceiling:
   * Tabla J.2.5 makes the base metal «Gobernado por la Sección J.4», which needs the member's
   * areas at the connection. Calling it `designed` while a governing limit state was never
   * evaluated would be the claim this module refuses.
   */
  it('a complete adequate weld is notVerifiable, because the base metal was never checked', () => {
    const d = full({ demandKN: 10 });
    expect(d.checks.filter((c) => c.state === 'exceeded')).toHaveLength(0);
    expect(d.state).toBe('notVerifiable');
    expect(check(d, 'baseMetal').clause).toBe('J.4');
    expect(check(d, 'baseMetal').state).toBe('unavailable');
  });

  it('never returns verified, for any input', () => {
    for (const d of [designFilletWeld({}), designFilletWeld({ legMm: 6, lengthMm: 100 }), full(),
      full({ demandKN: 1 }), full({ process: 'submergedArc' })]) {
      expect(d.state).not.toBe('verified');
    }
  });
});

describe('nothing is invented', () => {
  it('the size and the length are inputs, never derived from the demand', () => {
    const small = full({ demandKN: 1 });
    const large = full({ demandKN: 500 });
    // The same weld either way: only the verdict changes.
    expect(small.throatMm).toBe(large.throatMm);
    expect(small.effectiveLengthMm).toBe(large.effectiveLengthMm);
  });

  it('every check names a clause', () => {
    for (const c of full().checks) expect(c.clause, c.id).toMatch(/^J\./);
  });
});
