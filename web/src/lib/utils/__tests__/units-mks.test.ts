/**
 * The technical metric system and fixed decimals: tonne-force, kgf/cm² and centimetres, both
 * ways, and a quantity shown with the decimals the reader set.
 */
import { describe, it, expect } from 'vitest';
import { toDisplay, fromDisplay, unitLabel, formatValue, UNIT_SYSTEMS } from '../units';

describe('technical metric', () => {
  it('converts force, moment, stress and displacement, and back', () => {
    expect(toDisplay(9.80665, 'force', 'MKS')).toBeCloseTo(1, 12);
    expect(toDisplay(9.80665, 'moment', 'MKS')).toBeCloseTo(1, 12);
    expect(toDisplay(1, 'stress', 'MKS')).toBeCloseTo(10.1972, 4);
    expect(toDisplay(0.012, 'displacement', 'MKS')).toBeCloseTo(1.2, 12);
    expect(toDisplay(2e-4, 'inertia', 'MKS')).toBeCloseTo(20000, 9);
    expect(fromDisplay(toDisplay(123.4, 'stress', 'MKS'), 'stress', 'MKS')).toBeCloseTo(123.4, 9);
    expect(unitLabel('stress', 'MKS')).toBe('kgf/cm²');
    expect(unitLabel('force', 'MKS')).toBe('tf');
    expect(UNIT_SYSTEMS).toEqual(['SI', 'MKS', 'Imperial']);
  });

  it('prints the decimals asked for, and automatic ones otherwise', () => {
    expect(formatValue(12.3456, 'force', 'SI', 1)).toBe('12.3');
    expect(formatValue(12.3456, 'force', 'SI')).toBe('12.35');
    expect(formatValue(0, 'force', 'SI', 3)).toBe('0');
  });
});
