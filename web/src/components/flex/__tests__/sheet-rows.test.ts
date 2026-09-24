/**
 * The rows the calculator prints and the sheet's own section numbers, now a
 * pure module: pinned here so the panel only lays them out.
 */
import { describe, it, expect } from 'vitest';
import { sheetRows, sectionNumber } from '../sheet-rows';
import { solveFlex, type FlexInput } from '../../../lib/engine/codes/argentina/cirsoc-flex';

const COL: FlexInput = {
  kase: 'FCR', mode: 'design',
  fc: 25, fy: 420, confinement: 'ties', deductDisplacedConcrete: true,
  b: 0.30, h: 0.30, dPrime: 0.05, dPrimeS: 0.05, dPrimeH: 0.05, dPrimeV: 0.05,
  holeB: 0, holeH: 0, bf: 1.37, hf: 0.10, bw: 0.12,
  D: 0.40, Dint: 0, barCount: 12, barAtExtremeFibre: true, ratioAsPrime: 1,
  pctA1: 50, pctA2: 50, pctA3: 0, nA1: 4, nA2: 4, nA3: 4,
  AstGiven: 20, levels: [], Pu: 500, Mu: 100, Muy: 0,
};

describe('sheet rows', () => {
  it('numbers each block as its own sheet does', () => {
    expect(sectionNumber('FCR', 'verify', 'safety')).toBe('5 · ');
    expect(sectionNumber('FCR-CIR', 'verify', 'safety')).toBe('4 · ');
    expect(sectionNumber('FCO', 'verify', 'positioning')).toBe('9 · ');
    expect(sectionNumber('FSR', 'design', 'minmax')).toBe('');
  });

  it('a column design prints 4.1 and 4.2, and Ast in the headline', () => {
    const r = solveFlex(COL);
    const rows = sheetRows({ kase: 'FCR', mode: 'design', r, fc: 25, fy: 420, spiral: false, barCount: 12, Pu: 500, Mu: 100 });
    expect(rows.needed.length).toBe(4);
    expect(rows.printsMinMax).toBe(true);
    expect(rows.headline).toMatch(/^Ast = \d+\.\d{3} cm²$/);
    expect(rows.beam).toEqual([]);
  });

  it('a beam always prints A′s, even when it is zero', () => {
    const r = solveFlex({ ...COL, kase: 'FSR', b: 0.2, h: 0.5, Pu: 0, Mu: 60 });
    const rows = sheetRows({ kase: 'FSR', mode: 'design', r, fc: 25, fy: 420, spiral: false, barCount: 0, Pu: 0, Mu: 60 });
    expect(rows.beam[0][1]).toMatch(/cm²$/);
    expect(rows.needed).toEqual([]);
  });

  it('with no result it asks to check the inputs', () => {
    const rows = sheetRows({ kase: 'FCR', mode: 'design', r: null, fc: 25, fy: 420, spiral: false, barCount: 12, Pu: 0, Mu: 0 });
    expect(rows.extra).toEqual([]);
    expect(rows.general.length).toBeGreaterThan(3);
  });
});
