/**
 * The quantities a section and a temperature change are shown in: cm², cm⁴, cm³ and cm in both
 * metric systems (the model keeps m², m⁴, m³ and m), in², in⁴, in³ and in in imperial; and a
 * temperature change in °F without the 32° offset a temperature has.
 */
import { describe, it, expect } from 'vitest';
import { toDisplay, fromDisplay, unitLabel, formatValue, UNIT_SYSTEMS, type Quantity } from '../units';

const SECTION: Quantity[] = ['sectionArea', 'sectionInertia', 'sectionModulus', 'sectionDim'];

describe('section quantities', () => {
  it('in centimetres in SI and MKS, as the catalogue lists them', () => {
    for (const us of ['SI', 'MKS'] as const) {
      expect(toDisplay(53.8e-4, 'sectionArea', us)).toBeCloseTo(53.8, 10);
      expect(toDisplay(8356e-8, 'sectionInertia', us)).toBeCloseTo(8356, 8);
      expect(toDisplay(557e-6, 'sectionModulus', us)).toBeCloseTo(557, 9);
      expect(toDisplay(0.3, 'sectionDim', us)).toBeCloseTo(30, 12);
      expect([unitLabel('sectionArea', us), unitLabel('sectionInertia', us), unitLabel('sectionModulus', us), unitLabel('sectionDim', us)])
        .toEqual(['cm²', 'cm⁴', 'cm³', 'cm']);
    }
  });
  it('in inches in imperial', () => {
    // An IPE 300: A 53.8 cm² = 8.34 in², Iy 8356 cm⁴ = 200.8 in⁴, Wy 557 cm³ = 34.0 in³, h 300 mm = 11.81 in.
    expect(toDisplay(53.8e-4, 'sectionArea', 'Imperial')).toBeCloseTo(8.339, 3);
    expect(toDisplay(8356e-8, 'sectionInertia', 'Imperial')).toBeCloseTo(200.75, 2);
    expect(toDisplay(557e-6, 'sectionModulus', 'Imperial')).toBeCloseTo(33.99, 2);
    expect(toDisplay(0.3, 'sectionDim', 'Imperial')).toBeCloseTo(11.811, 3);
    expect([unitLabel('sectionArea', 'Imperial'), unitLabel('sectionInertia', 'Imperial'), unitLabel('sectionModulus', 'Imperial'), unitLabel('sectionDim', 'Imperial')])
      .toEqual(['in²', 'in⁴', 'in³', 'in']);
  });
  it('a typed value goes back to the model unchanged, in every system', () => {
    for (const us of UNIT_SYSTEMS) for (const q of SECTION) {
      expect(fromDisplay(toDisplay(1.234e-5, q, us), q, us)).toBeCloseTo(1.234e-5, 18);
    }
  });
  it('the other quantities are still shown in SI as stored', () => {
    expect(toDisplay(0.01, 'area', 'SI')).toBe(0.01);
    expect(toDisplay(2, 'length', 'SI')).toBe(2);
  });
});

describe('a temperature change is not a temperature', () => {
  it('20 °C of change is 36 °F; 20 °C is 68 °F', () => {
    expect(toDisplay(20, 'temperatureDelta', 'Imperial')).toBeCloseTo(36, 12);
    expect(toDisplay(20, 'temperature', 'Imperial')).toBeCloseTo(68, 12);
    expect(toDisplay(-10, 'temperatureDelta', 'Imperial')).toBeCloseTo(-18, 12);
  });
  it('back from °F without the offset, and as typed in the metric systems', () => {
    expect(fromDisplay(36, 'temperatureDelta', 'Imperial')).toBeCloseTo(20, 12);
    expect(toDisplay(20, 'temperatureDelta', 'SI')).toBe(20);
    expect(toDisplay(20, 'temperatureDelta', 'MKS')).toBe(20);
  });
  it('labelled as a temperature is', () => {
    expect(Object.fromEntries(UNIT_SYSTEMS.map((us) => [us, unitLabel('temperatureDelta', us)]))).toEqual({ SI: '°C', SImm: '°C', MKS: '°C', Imperial: '°F' });
    expect(formatValue(20, 'temperatureDelta', 'Imperial')).toBe('36.00');
  });
});
