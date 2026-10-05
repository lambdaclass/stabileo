/**
 * Values as the panels show them: no «-0» for a residue that rounds to nothing, a dash for a
 * value that is not a number, and the decimals the reader set.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { formatValue, formatDiagramValue, plainNumber, setDisplayDecimals } from '../units';

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
