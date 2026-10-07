/**
 * Fixed-decimal readouts in any unit system (the 2D canvas labels, the Basic report), and a
 * section property in a catalogue row: significant figures, so a small one keeps its digits in
 * inches as it does in centimetres.
 */
import { describe, it, expect } from 'vitest';
import { significantNumber, extraDecimals, fixedNumber, fixedQuantity, plainQuantity, smallDisplacement, displacementText } from '../unit-format';

describe('the same resolution in every system', () => {
  it('a larger unit takes more decimals', () => {
    expect(extraDecimals('force', 'SI')).toBe(0);
    expect(extraDecimals('force', 'MKS')).toBe(1);       // 1 tf ≈ 10 kN
    expect(extraDecimals('force', 'Imperial')).toBe(1);  // 1 kip ≈ 4.4 kN
    expect(extraDecimals('length', 'Imperial')).toBe(0);
  });
  it('fixed decimals, never «-0.0», a dash for no number', () => {
    expect(fixedNumber(12.5, 'force', 1, 'SI')).toBe('12.5');
    expect(fixedQuantity(12.5, 'force', 1, 'MKS')).toBe('1.27 tf');
    expect(fixedNumber(-0.001, 'force', 1, 'SI')).toBe('0.0');
    expect(fixedNumber(NaN, 'force', 1, 'SI')).toBe('—');
  });
  it('a typed value drops its trailing zeros', () => {
    expect(plainQuantity(10, 'force', 2, 'SI')).toBe('10 kN');
    expect(plainQuantity(10, 'force', 2, 'MKS')).toBe('1.02 tf');
  });
  it('displacements in mm, cm and in', () => {
    expect(smallDisplacement('SI')).toEqual({ factor: 1000, unit: 'mm', extra: 0 });
    expect(smallDisplacement('MKS')).toEqual({ factor: 100, unit: 'cm', extra: 1 });
    expect(displacementText(0.0125, 1, 'SI')).toBe('12.5 mm');
    expect(displacementText(0.0125, 1, 'MKS')).toBe('1.25 cm');
    expect(displacementText(-0.00001, 1, 'SI')).toBe('0.0 mm');
  });
});

describe('significantNumber', () => {
  it("an IPE 80's weak-axis inertia is not 0 in⁴", () => {
    // 8.49 cm⁴ is 0.204 in⁴: whole inches⁴ read it «0» (116 of the 777 catalogue profiles).
    expect(significantNumber(8.49e-8, 'sectionInertia', 'Imperial')).toBe('0.204');
    expect(significantNumber(8.49e-8, 'sectionInertia', 'SI')).toBe('8.49');
  });
  it('a large value reads whole, as the catalogue did', () => {
    expect(significantNumber(8356e-8, 'sectionInertia', 'SI')).toBe('8356');
    expect(significantNumber(8356e-8, 'sectionInertia', 'Imperial')).toBe('201');
    expect(significantNumber(116e-4, 'sectionArea', 'SI')).toBe('116');
  });
  it('three significant figures in between, without trailing zeros', () => {
    expect(significantNumber(80.1e-8, 'sectionInertia', 'SI')).toBe('80.1');
    expect(significantNumber(7.64e-4, 'sectionArea', 'Imperial')).toBe('1.18');
    expect(significantNumber(20e-6, 'sectionModulus', 'SI')).toBe('20');
    expect(significantNumber(20e-6, 'sectionModulus', 'Imperial')).toBe('1.22');
  });
  it('zero is 0, and not a number is a dash', () => {
    expect(significantNumber(0, 'sectionInertia', 'Imperial')).toBe('0');
    expect(significantNumber(NaN, 'sectionInertia', 'SI')).toBe('—');
  });
});
