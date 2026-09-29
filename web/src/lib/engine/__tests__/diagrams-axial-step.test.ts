/**
 * An axial point load steps the axial force: a cantilever pulled at midspan
 * carries the pull up to the load and nothing past it.
 */
import { describe, it, expect } from 'vitest';
import { computeDiagramValueAt } from '../diagrams';

const ef = (nStart: number, nEnd: number, px: number) => ({
  mStart: 0, mEnd: 0, vStart: 0, vEnd: 0, nStart, nEnd, qI: 0, qJ: 0, length: 4,
  pointLoads: [{ a: 2, p: 0, px }],
});

describe('axial diagram with an axial point load', () => {
  it('is the end value up to the load and drops by px past it', () => {
    const f = ef(5, 0, 5);
    expect(computeDiagramValueAt('axial', 0, f)).toBeCloseTo(5, 12);
    expect(computeDiagramValueAt('axial', 0.49, f)).toBeCloseTo(5, 12);
    expect(computeDiagramValueAt('axial', 0.51, f)).toBeCloseTo(0, 12);
    expect(computeDiagramValueAt('axial', 1, f)).toBeCloseTo(0, 12);
  });

  it('keeps a linear part the load does not explain, and reaches nEnd at J', () => {
    const f = ef(8, 1, 5); // 8 − 5 = 3 by the step; the other 2 vary linearly
    expect(computeDiagramValueAt('axial', 1, f)).toBeCloseTo(1, 12);
    expect(computeDiagramValueAt('axial', 0, f)).toBeCloseTo(8, 12);
  });
});
