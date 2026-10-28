import { describe, expect, it } from 'vitest';
import { MINUS, THIN, num, qty, sci } from '../format';

describe('research number formatting', () => {
  it('uses the page language and a true minus sign', () => {
    expect(num(-0.143, { dp: 3, locale: 'en' })).toBe(`${MINUS}0.143`);
    expect(num(0.725795, { dp: 6, locale: 'es' })).toBe('0,725795');
    expect(num(1234.5, { dp: 1, locale: 'en' })).toBe('1234.5');
  });

  it('splits scientific values into mantissa and exponent', () => {
    expect(sci(1.6e-12, 2, 'en')).toEqual({ mantissa: '1.6', exp: `${MINUS}12` });
    expect(sci(2.2e-7, 2, 'es')).toEqual({ mantissa: '2,2', exp: `${MINUS}7` });
  });

  it('joins a quantity and its unit with a narrow no-break space', () => {
    expect(qty(0.0058, 'mm', { dp: 4, locale: 'en' })).toBe(`0.0058${THIN}mm`);
  });
});
