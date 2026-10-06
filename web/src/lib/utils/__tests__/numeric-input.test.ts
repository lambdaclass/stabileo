import { describe, it, expect } from 'vitest';
import { parseNumericInput, numericOrUndefined, numericOrKeep } from '../numeric-input';

describe('zero is a value, never an empty field', () => {
  /*
   * The defect this exists to prevent. `Number('0') || 10` is `10`, so a deliberate zero became
   * a default — and for the batten gap that meant a user could not express chords in continuous
   * contact, §E.6.1's Group I, which carries no battens at all.
   */
  it('parses zero as a value', () => {
    expect(parseNumericInput('0')).toEqual({ kind: 'value', value: 0 });
    expect(numericOrUndefined('0')).toBe(0);
    expect(numericOrKeep('0', 10)).toBe(0);
  });

  it('and an empty field as empty, which is a different thing', () => {
    expect(parseNumericInput('')).toEqual({ kind: 'empty' });
    expect(parseNumericInput('   ')).toEqual({ kind: 'empty' });
    expect(numericOrUndefined('')).toBeUndefined();
    // A field that must hold something keeps the last good value rather than inventing one.
    expect(numericOrKeep('', 10)).toBe(10);
  });

  it('the two are never confused, in either direction', () => {
    expect(parseNumericInput('0').kind).not.toBe(parseNumericInput('').kind);
  });
});

describe('what is invalid is said, never reinterpreted', () => {
  /*
   * A negative plate thickness clamped to zero is a wrong answer wearing a right one's clothes.
   * The parser refuses it and names why.
   */
  it('rejects a negative where negatives are meaningless', () => {
    const r = parseNumericInput('-5');
    expect(r.kind).toBe('invalid');
    expect(r.kind === 'invalid' && r.reasonKey).toBe('input.invalid.negative');
  });

  it('rejects text', () => {
    for (const raw of ['abc', '12abc', '--3']) {
      const r = parseNumericInput(raw);
      expect(r.kind, raw).toBe('invalid');
    }
  });

  it('honours a minimum other than zero, and says which rule was broken', () => {
    const r = parseNumericInput('2', { min: 3 });
    expect(r.kind === 'invalid' && r.reasonKey).toBe('input.invalid.belowMinimum');
    expect(parseNumericInput('3', { min: 3 })).toEqual({ kind: 'value', value: 3 });
  });

  it('and a maximum', () => {
    const r = parseNumericInput('50', { max: 30 });
    expect(r.kind === 'invalid' && r.reasonKey).toBe('input.invalid.aboveMaximum');
  });

  it('a negative below a positive minimum is still reported against the minimum', () => {
    // The more specific rule wins: «below the minimum» is what the user has to fix.
    const r = parseNumericInput('-1', { min: 3 });
    expect(r.kind === 'invalid' && r.reasonKey).toBe('input.invalid.belowMinimum');
  });
});

describe('it takes the string, not a number', () => {
  /*
   * By the time a caller has written `Number(el.value)` the difference between `''` and `'0'` is
   * already gone — both are falsy. Taking the raw string is what keeps the distinction alive,
   * and is the reason this signature looks the way it does.
   */
  it('distinguishes inputs that collapse once converted', () => {
    const asNumbers = [Number(''), Number('0')];
    expect(asNumbers[0]).toBe(asNumbers[1]);
    expect(parseNumericInput('')).not.toEqual(parseNumericInput('0'));
  });

  it('accepts decimals and leading zeros', () => {
    expect(parseNumericInput('0.5')).toEqual({ kind: 'value', value: 0.5 });
    expect(parseNumericInput('007')).toEqual({ kind: 'value', value: 7 });
  });
});

describe('the convenience forms', () => {
  it('numericOrUndefined maps both non-values to undefined', () => {
    expect(numericOrUndefined('')).toBeUndefined();
    expect(numericOrUndefined('-1')).toBeUndefined();
    expect(numericOrUndefined('7')).toBe(7);
  });

  it('numericOrKeep never substitutes a number the user did not choose', () => {
    expect(numericOrKeep('abc', 4)).toBe(4);
    expect(numericOrKeep('-2', 4)).toBe(4);
    expect(numericOrKeep('6', 4)).toBe(6);
    // And zero is chosen, so zero is kept.
    expect(numericOrKeep('0', 4)).toBe(0);
  });
});

describe('a field says what zero means for it', () => {
  /*
   * There is no safe default across fields, which is why every call site declares this. A batten
   * gap of 0 is continuous contact — a real arrangement. A fillet leg of 0 is not a thin weld,
   * it is no weld, and letting it through produces a capacity of zero that reads as an ordinary
   * overstress rather than as a missing input.
   */
  it('accepts zero where zero is a configuration', () => {
    expect(parseNumericInput('0', { zero: 'valid' })).toEqual({ kind: 'value', value: 0 });
    expect(parseNumericInput('0')).toEqual({ kind: 'value', value: 0 });
  });

  it('refuses zero where zero means the datum is absent', () => {
    const r = parseNumericInput('0', { zero: 'invalid' });
    expect(r.kind).toBe('invalid');
    expect(r.kind === 'invalid' && r.reasonKey).toBe('input.invalid.zeroNotMeaningful');
  });

  it('still tells an absent field apart from a refused zero', () => {
    expect(parseNumericInput('', { zero: 'invalid' })).toEqual({ kind: 'empty' });
  });

  it('does not disturb non-zero values either way', () => {
    expect(parseNumericInput('6', { zero: 'invalid' })).toEqual({ kind: 'value', value: 6 });
    expect(parseNumericInput('-6', { zero: 'invalid' }).kind).toBe('invalid');
  });
});

describe('parseDecimal: what people type and paste', () => {
  it('reads a comma or a point for decimals, and grouped thousands by the other', async () => {
    const { parseDecimal } = await import('../numeric-input');
    expect(parseDecimal('1,5')).toBe(1.5);
    expect(parseDecimal('1.5')).toBe(1.5);
    expect(parseDecimal('-0,25')).toBe(-0.25);
    expect(parseDecimal('1,234.5')).toBe(1234.5);
    expect(parseDecimal('1.234,5')).toBe(1234.5);
    expect(parseDecimal('6,123,456.78')).toBe(6123456.78);
    expect(parseDecimal('1.234.567')).toBe(1234567);
    expect(parseDecimal('2e-3')).toBe(0.002);
  });
  it('refuses what it would have to guess, instead of truncating it', async () => {
    const { parseDecimal } = await import('../numeric-input');
    for (const s of ['', '1,23,4', '1.2.3', '1,2.3', 'abc', '1,234.5.6', '12,3456.7']) expect(parseDecimal(s)).toBeNull();
  });
});

describe('parseDecimal: one separator, written once, is the decimal one', () => {
  /*
   * "1,234" could be an English thousand. It is read as 1.234 on purpose: three decimals (a
   * millimetre in metres) is how the app's Spanish and Portuguese users write a length, and the
   * old `parseFloat(s.replace(',', '.'))` read it the same way. A thousand is read as one only
   * when the text says so — a second group, or the other separator after it.
   */
  it('a single group of three after a comma or a point is decimals', async () => {
    const { parseDecimal } = await import('../numeric-input');
    expect(parseDecimal('1,234')).toBe(1.234);
    expect(parseDecimal('1.234')).toBe(1.234);
    expect(parseDecimal('12.345')).toBe(12.345);
  });
  it('a second group, or the other separator after it, makes it a thousand', async () => {
    const { parseDecimal } = await import('../numeric-input');
    expect(parseDecimal('1,234,567')).toBe(1234567);
    expect(parseDecimal('1.234.567')).toBe(1234567);
    expect(parseDecimal('1,234.0')).toBe(1234);
    expect(parseDecimal('1.234,0')).toBe(1234);
  });
  it('spaces, signs and exponents', async () => {
    const { parseDecimal } = await import('../numeric-input');
    expect(parseDecimal('1 234,5')).toBe(1234.5);
    expect(parseDecimal('-0,5')).toBe(-0.5);
    expect(parseDecimal('+3')).toBe(3);
    expect(parseDecimal('1e3')).toBe(1000);
    expect(parseDecimal('   ')).toBeNull();
  });
  it('a number with a unit after it is refused, where parseFloat read the number', async () => {
    const { parseDecimal } = await import('../numeric-input');
    expect(parseDecimal('5 kN')).toBeNull();
    expect(parseDecimal('5kN')).toBeNull();
  });
});

describe('decimalOrKeep: unreadable text changes nothing', () => {
  /*
   * A PRO load cell read `parseDecimal(s) ?? 0`: a typo or a unit («12 kN», «1.2.3») wrote a
   * zero into the load, and the cell then showed a 0 the user never typed.
   */
  it('keeps the previous value for text it cannot read', async () => {
    const { decimalOrKeep } = await import('../numeric-input');
    expect(decimalOrKeep('12 kN', 12)).toBe(12);
    expect(decimalOrKeep('1,23,4', -7.5)).toBe(-7.5);
    expect(decimalOrKeep('1.2.3', 4)).toBe(4);
  });
  it('reads what it can, zero included', async () => {
    const { decimalOrKeep } = await import('../numeric-input');
    expect(decimalOrKeep('2,5', 12)).toBe(2.5);
    expect(decimalOrKeep('0', 12)).toBe(0);
  });
  it('an empty cell is a cleared component: zero, or what the caller says', async () => {
    const { decimalOrKeep } = await import('../numeric-input');
    expect(decimalOrKeep('', 12)).toBe(0);
    expect(decimalOrKeep('  ', 12, 12)).toBe(12);
  });
});

describe('an add-load form: a blank J end is uniform, a typed zero is a zero', () => {
  /*
   * The PRO add-load form read `parseFloat(j) || i`: a triangular 10 → 0 was added as a uniform
   * 10, «1,5» as 1 and «1.234,5» as 1.234.
   */
  it('a typed 0 at J is a triangle, not a uniform load', async () => {
    const { lineLoadEnds } = await import('../numeric-input');
    expect(lineLoadEnds('10', '0')).toEqual([10, 0]);
  });
  it('a blank J end, and only a blank one, is the same as I', async () => {
    const { lineLoadEnds } = await import('../numeric-input');
    expect(lineLoadEnds('10', '')).toEqual([10, 10]);
    expect(lineLoadEnds('10', '  ')).toEqual([10, 10]);
    expect(lineLoadEnds('', '')).toEqual([0, 0]);
    expect(lineLoadEnds('', '5')).toEqual([0, 5]);
  });
  it('decimals with a comma, and grouped thousands', async () => {
    const { lineLoadEnds, loadComponents } = await import('../numeric-input');
    expect(lineLoadEnds('1,5', '1.234,5')).toEqual([1.5, 1234.5]);
    expect(loadComponents(['1,5', '', '-2'])).toEqual([1.5, 0, -2]);
  });
  it('text that does not read refuses the load, instead of adding a zero or a uniform one', async () => {
    const { lineLoadEnds, loadComponents } = await import('../numeric-input');
    expect(lineLoadEnds('10', '5 kN')).toBeNull();
    expect(lineLoadEnds('abc', '')).toBeNull();
    expect(loadComponents(['10', '1.2.3'])).toBeNull();
  });
});
