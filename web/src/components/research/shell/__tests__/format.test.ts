import { describe, expect, it } from 'vitest';
import { MINUS, THIN, num, qty, sci, tickDecimals } from '../format';

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

for (const locale of ['en', 'es', 'pt']) {
  it(`preserves fractional 2.5 tick intervals in ${locale}`, () => {
    const separator = locale === 'en' ? '.' : ',';
    for (const step of [2.5, 0.25, 0.0025]) {
      for (const multiple of [1, 3]) {
        const value = step * multiple;
        expect(num(value, { dp: tickDecimals(step), locale })).toBe(String(value).replace('.', separator));
      }
    }
  });
}
