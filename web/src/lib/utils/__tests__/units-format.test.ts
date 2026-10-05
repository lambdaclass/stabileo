/**
 * Values as the panels show them: no «-0» for a residue that rounds to nothing, a dash for a
 * value that is not a number, and the decimals the reader set.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { formatValue, formatDiagramValue, formatCoordinate, plainNumber, setDisplayDecimals, dofQuantity, unitLabel } from '../units';

afterEach(() => setDisplayDecimals({}));

describe('formatValue', () => {
  it('a residue that rounds to zero is 0, not -0', () => {
    expect(formatValue(-1e-12, 'force', 'SI')).toBe('0');
    expect(formatValue(-0.001, 'force', 'SI', 2)).toBe('0');
  });
  it('NaN is a dash, and rounding up carries into the next digit', () => {
    expect(formatValue(NaN, 'force', 'SI')).toBe('—');
    expect(formatValue(99.996, 'force', 'SI')).toBe('100.0');
    expect(formatValue(999.6, 'force', 'SI')).toBe('1000');
  });
});

describe('formatCoordinate', () => {
  it('a coordinate keeps its millimetre, however large it is', () => {
    expect(formatCoordinate(150.25, 'SI')).toBe('150.250');
    expect(formatCoordinate(1234.567, 'SI')).toBe('1234.567');
    expect(formatCoordinate(0.0015, 'MKS')).toBe('0.002');
  });
  it('in feet, three decimals too: a thousandth of a foot is a third of a millimetre', () => {
    expect(formatCoordinate(10, 'Imperial')).toBe('32.808');
  });
  it('the decimals the reader set for lengths win, and zero is 0', () => {
    expect(formatCoordinate(150.25, 'SI', 1)).toBe('150.3');
    expect(formatCoordinate(-1e-6, 'SI')).toBe('0');
  });
});

describe('dofQuantity: what a reaction on a degree of freedom is', () => {
  it('a force on a translation, a moment on a rotation', () => {
    expect(dofQuantity('ux')).toBe('force');
    expect(dofQuantity('uz')).toBe('force');
    expect(dofQuantity('ry')).toBe('moment');
  });
  it('a bimoment on the warping DOF, in force × length², not kN', () => {
    expect(dofQuantity('warping')).toBe('bimoment');
    expect(unitLabel('bimoment', 'SI')).toBe('kN·m²');
    expect(unitLabel('bimoment', 'MKS')).toBe('tf·m²');
    expect(unitLabel('bimoment', 'Imperial')).toBe('kip·ft²');
    // 1 kN·m² = 0.224809 kip × 3.28084² ft²
    expect(formatValue(1, 'bimoment', 'Imperial')).toBe('2.42');
  });
});

describe('formatDiagramValue', () => {
  it('a small value keeps its decimals, and NaN is a dash', () => {
    expect(formatDiagramValue(0.001, 'moment', 'SI')).toBe('0.00 kN·m');
    expect(formatDiagramValue(NaN, 'moment', 'SI')).toBe('—');
  });
  it('shows the magnitude with the decimals the reader set', () => {
    setDisplayDecimals({ moment: 3 });
    expect(formatDiagramValue(-1.23456, 'moment', 'SI')).toBe('1.235 kN·m');
  });
});

describe('plainNumber', () => {
  it('no -0, no grouping, a dash for NaN', () => {
    expect(plainNumber(-0.0001, 2)).toBe('0');
    expect(plainNumber(1234.5, 2)).toBe('1234.5');
    expect(plainNumber(NaN)).toBe('—');
  });
});
