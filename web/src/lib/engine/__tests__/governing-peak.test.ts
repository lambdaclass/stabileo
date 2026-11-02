import { describe, it, expect } from 'vitest';
import { peakAlong } from '../governing-case';
import { computeDiagramValueAt } from '../diagrams';
import type { ElementForces } from '../types';

describe('the governing case reads each diagram at its true peak', () => {
  it('a simply supported beam under a triangular load peaks between the samples, at L/√3', () => {
    const L = 6, q = -10;
    const ef: ElementForces = {
      elementId: 1, nStart: 0, nEnd: 0, mStart: 0, mEnd: 0, length: L,
      vStart: 0, vEnd: 0, qI: 0, qJ: q, pointLoads: [], distributedLoads: [{ qI: 0, qJ: q, a: 0, b: L }], hingeStart: false, hingeEnd: false,
    };
    const vA = -q * L / 6;
    ef.vStart = vA; ef.vEnd = vA + (q * L) / 2;
    const scan = Math.max(...Array.from({ length: 200001 }, (_, k) => Math.abs(computeDiagramValueAt('moment', k / 200000, ef))));
    const grid = Math.max(...Array.from({ length: 41 }, (_, k) => Math.abs(computeDiagramValueAt('moment', k / 40, ef))));
    expect(scan).toBeCloseTo((Math.abs(q) * L * L) / (9 * Math.sqrt(3)), 6);
    expect(grid).toBeLessThan(scan * (1 - 1e-5));
    expect(peakAlong('moment', ef) / scan).toBeCloseTo(1, 9);
  });

  it('a narrow partial load between two samples: its peak is found, though no sample sits near it', () => {
    const L = 8, q = -50, a = 3.02, b = 3.18;
    const W = q * (b - a), c = (a + b) / 2;
    const vA = -W * (L - c) / L;
    const ef: ElementForces = {
      elementId: 1, nStart: 0, nEnd: 0, mStart: 0, mEnd: 0, length: L,
      vStart: vA, vEnd: vA + W, qI: 0, qJ: 0, pointLoads: [], distributedLoads: [{ qI: q, qJ: q, a, b }], hingeStart: false, hingeEnd: false,
    };
    const scan = Math.max(...Array.from({ length: 400001 }, (_, k) => Math.abs(computeDiagramValueAt('moment', k / 400000, ef))));
    const grid = Math.max(...Array.from({ length: 41 }, (_, k) => Math.abs(computeDiagramValueAt('moment', k / 40, ef))));
    expect(grid).toBeLessThan(scan * (1 - 1e-4));
    expect(peakAlong('moment', ef) / scan).toBeCloseTo(1, 7);
  });
});

