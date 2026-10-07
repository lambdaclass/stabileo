/**
 * The words on the 3D load tags: values in the project's units, and temperature changes as
 * changes (no 32 °F offset).
 */
import { describe, it, expect } from 'vitest';
import { quantityText, slabTemperatureTag } from '../load-tag-text';

describe('a slab temperature tag', () => {
  it('a 20 °C rise reads 36 °F, not 68 °F', () => {
    expect(slabTemperatureTag(20, undefined, 'Imperial')).toBe('ΔT 36.00 °F');
    expect(slabTemperatureTag(20, 10, 'Imperial')).toBe('ΔT 36.00 °F · ΔTg 18.00 °F');
  });
  it('a fall stays a fall, and Celsius is as typed', () => {
    expect(slabTemperatureTag(-10, undefined, 'Imperial')).toBe('ΔT -18.00 °F');
    expect(slabTemperatureTag(20, 5, 'SI')).toBe('ΔT 20.00 °C · ΔTg 5.00 °C');
  });
  it('the reader set decimals for temperature changes', () => {
    expect(slabTemperatureTag(20, undefined, 'Imperial', { temperatureDelta: 0 })).toBe('ΔT 36 °F');
  });
  it('nothing to say, an empty tag', () => {
    expect(slabTemperatureTag(0, undefined, 'SI')).toBe('');
  });
});

describe('quantityText', () => {
  it('a value with its unit in the chosen system', () => {
    expect(quantityText(10, 'force', 'SI')).toBe('10.00 kN');
    expect(quantityText(10, 'force', 'MKS', { force: 1 })).toBe('1.0 tf');
  });
});
