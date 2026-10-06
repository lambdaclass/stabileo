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
    expect(UNIT_SYSTEMS).toEqual(['SI', 'SImm', 'MKS', 'Imperial']);
  });

  it('prints the decimals asked for, and automatic ones otherwise', () => {
    expect(formatValue(12.3456, 'force', 'SI', 1)).toBe('12.3');
    expect(formatValue(12.3456, 'force', 'SI')).toBe('12.35');
    expect(formatValue(0, 'force', 'SI', 3)).toBe('0');
  });
});

describe('formatValue: what a reader must never see', () => {
  it('no negative zero, no NaN, one zero', () => {
    expect(formatValue(-0.0001, 'force', 'SI', 2)).toBe('0');
    expect(formatValue(-0.4, 'force', 'SI', 0)).toBe('0');
    expect(formatValue(1e-11, 'force', 'SI', 3)).toBe('0');
    expect(formatValue(NaN, 'force', 'SI')).toBe('—');
    expect(formatValue(Infinity, 'moment', 'MKS', 2)).toBe('—');
  });
  it('the precision follows the rounded value', () => {
    expect(formatValue(99.996, 'force', 'SI')).toBe('100.0');
    expect(formatValue(999.7, 'force', 'SI')).toBe('1000');
    expect(formatValue(0.99996, 'force', 'SI')).toBe('1.00');
  });
  it('every quantity goes there and back in every system', () => {
    const qs = ['length', 'force', 'moment', 'distributedLoad', 'stress', 'area', 'inertia', 'density', 'displacement', 'rotation', 'springK', 'springKr', 'temperature', 'areaLoad', 'speed'] as const;
    for (const sys of ['SI', 'MKS', 'Imperial'] as const) for (const q of qs) {
      expect(fromDisplay(toDisplay(12.345, q, sys), q, sys)).toBeCloseTo(12.345, 9);
    }
  });
});

describe('area loads and speeds', () => {
  it('reads a load per area and a speed in each system', () => {
    expect(toDisplay(1, 'areaLoad', 'MKS')).toBeCloseTo(101.97, 2);
    expect(toDisplay(1, 'areaLoad', 'Imperial')).toBeCloseTo(20.885, 3);
    expect(unitLabel('areaLoad', 'MKS')).toBe('kgf/m²');
    expect(toDisplay(45, 'speed', 'Imperial')).toBeCloseTo(100.66, 2);
    expect(unitLabel('speed', 'SI')).toBe('m/s');
  });
});

describe('SI with millimetres', () => {
  it('lengths, displacements and section properties in mm; everything else as in SI; files stay SI', () => {
    expect(toDisplay(2.5, 'length', 'SImm')).toBeCloseTo(2500, 9);
    expect(toDisplay(0.012, 'displacement', 'SImm')).toBeCloseTo(12, 9);
    expect(toDisplay(3e-3, 'sectionArea', 'SImm')).toBeCloseTo(3000, 6);
    expect(toDisplay(1e-4, 'sectionInertia', 'SImm')).toBeCloseTo(1e8, 1);
    expect(toDisplay(10, 'force', 'SImm')).toBe(10);
    expect(toDisplay(5, 'distributedLoad', 'SImm')).toBe(5);
    expect(fromDisplay(2500, 'length', 'SImm')).toBeCloseTo(2.5, 12);
    expect(unitLabel('length', 'SImm')).toBe('mm');
    expect(unitLabel('force', 'SImm')).toBe('kN');
  });

  it('section properties read in cm in SI, and a temperature difference takes no offset', () => {
    expect(toDisplay(3e-3, 'sectionArea', 'SI')).toBeCloseTo(30, 9);
    expect(toDisplay(1e-4, 'sectionInertia', 'SI')).toBeCloseTo(10000, 6);
    expect(toDisplay(1e-4, 'sectionModulus', 'SI')).toBeCloseTo(100, 9);
    expect(unitLabel('sectionModulus', 'SI')).toBe('cm³');
    expect(toDisplay(10, 'temperatureDiff', 'Imperial')).toBeCloseTo(18, 12);
    expect(toDisplay(10, 'temperature', 'Imperial')).toBeCloseTo(50, 12);
    expect(fromDisplay(18, 'temperatureDiff', 'Imperial')).toBeCloseTo(10, 12);
  });
});
