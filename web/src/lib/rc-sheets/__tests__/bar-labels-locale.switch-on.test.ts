/**
 * A bar's label writes its spacing with the language's decimal, as every other figure of the
 * sheets: «c/12,5» in Spanish, «c/12.5» in English.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { meshLabel, stirrupsLabel } from '../bars';

afterEach(() => setLocale('en'));

describe('a bar\'s label', () => {
  it('writes its spacing with the language\'s decimal', () => {
    setLocale('es');
    expect(meshLabel({ dia: 8, spacing: 0.125 })).toBe('Ø8 c/12,5');
    expect(stirrupsLabel({ dia: 6, legs: 4, spacing: 0.075 })).toBe('4r Ø6 c/7,5');
    expect(meshLabel({ dia: 10, spacing: 0.2 })).toBe('Ø10 c/20');
    setLocale('en');
    expect(meshLabel({ dia: 8, spacing: 0.125 })).toBe('Ø8 c/12.5');
  });
});
