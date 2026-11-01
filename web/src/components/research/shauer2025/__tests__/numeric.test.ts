import { describe, expect, it } from 'vitest';
import { formatDecimal, parseDecimal } from '../numeric';

describe('research decimal input', () => {
  it('reads a point or a comma as the decimal separator', () => {
    expect(parseDecimal('0.0027')).toBe(0.0027);
    expect(parseDecimal('0,0027')).toBe(0.0027);
    expect(parseDecimal(',5')).toBe(0.5);
    expect(parseDecimal('2.7e-3')).toBe(0.0027);
    expect(parseDecimal(' 210 ')).toBe(210);
  });

  it('refuses anything ambiguous instead of guessing', () => {
    for (const t of ['1.000,5', '1,000.5', '1,0,0', '0.0.1', '', 'abc', '1 000', '--1', '1e']) {
      expect(parseDecimal(t), t).toBeNull();
    }
  });

  it('writes the separator of the page language and reads it back exactly', () => {
    expect(formatDecimal(0.0075, 'en')).toBe('0.0075');
    expect(formatDecimal(0.0075, 'es')).toBe('0,0075');
    expect(formatDecimal(0.0075, 'pt')).toBe('0,0075');
    for (const v of [0.0027, 0.3, 210, 1 / 600, 1e-4]) {
      for (const l of ['en', 'es', 'pt']) expect(parseDecimal(formatDecimal(v, l))).toBe(v);
    }
  });
});
