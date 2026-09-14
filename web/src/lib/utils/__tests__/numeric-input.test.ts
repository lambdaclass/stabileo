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
