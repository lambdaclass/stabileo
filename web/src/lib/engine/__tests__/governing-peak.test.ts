import { describe, it, expect } from 'vitest';
import { governingMagnitude2D, computeGoverning2D } from '../governing-case';
import type { AnalysisResults } from '../types';
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
    expect(governingMagnitude2D(ef, 'moment') / scan).toBeCloseTo(1, 9);
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
    expect(governingMagnitude2D(ef, 'moment') / scan).toBeCloseTo(1, 7);
  });

  it('a shear peak at an off-grid boundary between opposing partial loads', () => {
    const L = 10, q = 10, a = 3.13, b = 6.26;
    const RB = (q * (b - a) * (a + b) / 2 - q * a * (a / 2)) / L;
    const RA = -RB;
    const ef: ElementForces = {
      elementId: 1, nStart: 0, nEnd: 0, mStart: 0, mEnd: 0, length: L,
      vStart: RA, vEnd: RA + q * a - q * (b - a), qI: 0, qJ: 0, pointLoads: [],
      distributedLoads: [{ qI: q, qJ: q, a: 0, b: a }, { qI: -q, qJ: -q, a, b }], hingeStart: false, hingeEnd: false,
    };
    const scan = Math.max(...Array.from({ length: 200001 }, (_, k) => Math.abs(computeDiagramValueAt('shear', k / 200000, ef))));
    expect(Math.abs(computeDiagramValueAt('shear', a / L, ef)) / scan).toBeCloseTo(1, 9);
    const grid = Math.max(...Array.from({ length: 21 }, (_, k) => Math.abs(computeDiagramValueAt('shear', k / 20, ef))));
    expect(grid).toBeLessThan(scan * (1 - 1e-2));
    expect(governingMagnitude2D(ef, 'shear') / scan).toBeCloseTo(1, 9);
  });

  it('two stationary points of a cubic between one sample and a point load: the hidden peak governs', () => {
    const k = 1000, x1 = 0.584, x2 = 0.5933, tp = 0.596, m0 = 1000;
    const sum = x1 + x2, prod = x1 * x2;
    const M = (t: number) => m0 + k * (t ** 3 / 3 - (sum * t * t) / 2 + prod * t);
    const p = k * (tp - x1) * (tp - x2) + 1.3;
    const ef: ElementForces = {
      elementId: 1, nStart: 0, nEnd: 0, mStart: m0, mEnd: 0, length: 1,
      vStart: -k * prod, vEnd: 0, qI: 0, qJ: 0, pointLoads: [{ a: tp, p }],
      distributedLoads: [{ qI: k * sum, qJ: k * (sum - 2 * tp), a: 0, b: tp }], hingeStart: false, hingeEnd: false,
    };
    expect(computeDiagramValueAt('moment', x1, ef) / M(x1)).toBeCloseTo(1, 12);
    const scan = Math.max(...Array.from({ length: 400001 }, (_, i) => Math.abs(computeDiagramValueAt('moment', i / 400000, ef))));
    expect(scan / M(x1)).toBeCloseTo(1, 12);
    expect(Math.abs(computeDiagramValueAt('moment', tp, ef))).toBeLessThan(M(x1) * (1 - 5e-8));
    expect(governingMagnitude2D(ef, 'moment') / M(x1)).toBeCloseTo(1, 12);
    const flat: ElementForces = { ...ef, mStart: M(x1) - 1e-6, mEnd: M(x1) - 1e-6, vStart: 0, vEnd: 0, pointLoads: [], distributedLoads: [] };
    const res = (e: ElementForces) => ({ elementForces: [e] }) as unknown as AnalysisResults;
    const gov = computeGoverning2D(new Map([[1, res(flat)], [2, res(ef)]]), new Map([[1, 'flat'], [2, 'cubic']]));
    expect(gov.get(1)!.moment!.comboName).toBe('cubic');
  });
});
