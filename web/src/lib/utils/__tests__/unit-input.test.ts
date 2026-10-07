/**
 * A number typed in the reader's units and kept in SI (`UnitInput.svelte`): what the field
 * shows, and what a typed text hands back.
 */
import { describe, it, expect } from 'vitest';
import { unitInputText, unitInputCommit, keepTypedNumber } from '../unit-input';
import { toDisplay, fromDisplay } from '../units';

describe('a coordinate keeps its millimetre in the field', () => {
  it('however far the node is from the origin', () => {
    // Six significant figures read 12345.678 m as «12345.7» and 123456.4 m as «123456».
    expect(unitInputText(12345.678, 'length', 'SI')).toBe('12345.678');
    expect(unitInputText(123456.4, 'length', 'SI')).toBe('123456.4');
    expect(unitInputText(123456.4, 'length', 'MKS')).toBe('123456.4');
  });
  it('in feet too: a thousandth of a foot', () => {
    expect(unitInputText(12345.678, 'length', 'Imperial')).toBe(toDisplay(12345.678, 'length', 'Imperial').toFixed(3));
    expect(unitInputText(12345.678, 'length', 'Imperial')).toBe('40504.194');
  });
  it('a small length keeps six significant figures, and a round one no trailing zeros', () => {
    expect(unitInputText(0.0001234, 'length', 'SI')).toBe('0.0001234');
    expect(unitInputText(2, 'length', 'SI')).toBe('2');
    expect(unitInputText(0.1 + 0.2, 'length', 'SI')).toBe('0.3');
  });
  it('a settlement and a section dimension keep their millimetre as well', () => {
    expect(unitInputText(1234.5678, 'displacement', 'SI')).toBe('1234.568');
    expect(unitInputText(12.3456, 'sectionDim', 'SI')).toBe('1234.56');
  });
  it('other quantities as before: six significant figures', () => {
    expect(unitInputText(10, 'force', 'MKS')).toBe('1.01972');
    expect(unitInputText(NaN, 'force', 'SI')).toBe('');
  });
});

describe('what a typed text commits', () => {
  it('the field left as shown keeps the exact value behind it', () => {
    expect(unitInputCommit('1.01972', 10, 'force', 'MKS')).toBeNull();
    // The same number written another way is the same number.
    expect(unitInputCommit('1.019720', 10, 'force', 'MKS')).toBeNull();
  });
  it('typing the rounded figure moves the node there', () => {
    // 123456.4 m to 123456 m: the field showed «123456», so the typed text was ignored.
    expect(unitInputCommit('123456', 123456.4, 'length', 'SI')).toBe(123456);
  });
  it('any other number commits, converted back to SI', () => {
    expect(unitInputCommit('2', 10, 'force', 'MKS')).toBeCloseTo(2 * 9.80665, 10);
    expect(unitInputCommit('abc', 10, 'force', 'SI')).toBeNull();
  });
  it('in feet, the shown figure round-trips to the millimetre', () => {
    const shown = unitInputText(123456.4, 'length', 'Imperial');
    expect(Math.abs(toDisplay(123456.4, 'length', 'Imperial') - Number(shown))).toBeLessThan(5e-4);
    expect(unitInputCommit(shown, 123456.4, 'length', 'Imperial')).toBeNull();
  });
});

describe('the load toolbar keeps the number typed when the load changes kind', () => {
  /*
   * One SI value serves the force, the moment and the distributed load fields. In kip, kip·ft
   * and kip/ft the same SI number is three different figures: 2 kip typed, then Distributed,
   * read 0.6096 kip/ft (and My 6.56 kip·ft).
   */
  const twoKip = fromDisplay(2, 'force', 'Imperial');
  it('2 kip stays 2, as kip/ft or kip·ft', () => {
    const q = keepTypedNumber(twoKip, 'force', 'distributedLoad', 'Imperial');
    expect(toDisplay(q, 'distributedLoad', 'Imperial')).toBeCloseTo(2, 12);
    const m = keepTypedNumber(twoKip, 'force', 'moment', 'Imperial');
    expect(toDisplay(m, 'moment', 'Imperial')).toBeCloseTo(2, 12);
  });
  it('and back: the force is the one typed', () => {
    const q = keepTypedNumber(twoKip, 'force', 'distributedLoad', 'Imperial');
    expect(keepTypedNumber(q, 'distributedLoad', 'force', 'Imperial')).toBeCloseTo(twoKip, 12);
  });
  it('the same kind, or nothing known about it, leaves the value as it is', () => {
    expect(keepTypedNumber(-10, 'force', 'force', 'Imperial')).toBe(-10);
    expect(keepTypedNumber(-10, null, 'force', 'Imperial')).toBe(-10);
    // kN, kN/m and kN·m are the same figure: nothing to convert in SI.
    expect(keepTypedNumber(-10, 'force', 'distributedLoad', 'SI')).toBe(-10);
  });
});
