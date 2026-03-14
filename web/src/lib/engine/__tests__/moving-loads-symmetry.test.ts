import { describe, it, expect } from 'vitest';
import { solveMovingLoads } from '../moving-loads';
import type { SolverInput } from '../types';
import type { MovingLoadEnvelope } from '../moving-loads';

/** Simply supported beam: L m span, single element */
function makeSimpleBeam(L = 10): SolverInput {
  return {
    nodes: new Map([
      [1, { id: 1, x: 0, y: 0 }],
      [2, { id: 2, x: L, y: 0 }],
    ]),
    elements: new Map([
      [1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    ]),
    materials: new Map([
      [1, { id: 1, e: 200000, nu: 0.3 }],
    ]),
    sections: new Map([
      [1, { id: 1, a: 0.005381, iz: 0.00008356 }],
    ]),
    supports: new Map([
      [1, { id: 1, nodeId: 1, type: 'pinned' as const }],
      [2, { id: 2, nodeId: 2, type: 'rollerX' as const }],
    ]),
    loads: [],
  };
}

describe('Moving loads symmetry', () => {
  it('single axle on symmetric beam produces symmetric envelope', () => {
    const input = makeSimpleBeam(10);
    const result = solveMovingLoads(input, {
      train: { name: 'Single', axles: [{ offset: 0, weight: 100 }] },
      step: 0.5,
    });

    expect(typeof result).not.toBe('string');
    const env = result as MovingLoadEnvelope;
    expect(env.fullEnvelope).toBeDefined();

    const mData = env.fullEnvelope!.moment.elements[0];
    const n = mData.negValues.length;
    const mid = Math.floor(n / 2);

    for (let i = 0; i <= mid; i++) {
      expect(mData.negValues[i]).toBeCloseTo(mData.negValues[n - 1 - i], 3);
    }
  });

  it('HL-93 truck (asymmetric) on symmetric beam produces symmetric envelope', () => {
    const input = makeSimpleBeam(6);
    const hl93 = {
      name: 'HL-93',
      axles: [
        { offset: 0, weight: 35 },
        { offset: 4.3, weight: 145 },
        { offset: 8.6, weight: 145 },
      ],
    };
    const result = solveMovingLoads(input, { train: hl93, step: 0.25 });

    expect(typeof result).not.toBe('string');
    const env = result as MovingLoadEnvelope;
    expect(env.fullEnvelope).toBeDefined();

    const mData = env.fullEnvelope!.moment.elements[0];
    const n = mData.negValues.length;
    const mid = Math.floor(n / 2);

    // With mirrored reverse pass, envelope must be perfectly symmetric
    for (let i = 0; i <= mid; i++) {
      expect(mData.negValues[i]).toBeCloseTo(mData.negValues[n - 1 - i], 1);
    }
  });

  it('tandem (symmetric train) skips reverse pass', () => {
    const input = makeSimpleBeam(10);
    const tandem = {
      name: 'Tandem',
      axles: [
        { offset: 0, weight: 110 },
        { offset: 1.2, weight: 110 },
      ],
    };
    const result = solveMovingLoads(input, { train: tandem, step: 0.5 });

    expect(typeof result).not.toBe('string');
    const env = result as MovingLoadEnvelope;

    // Tandem is symmetric → only forward pass
    const maxAxleOffset = 1.2;
    const expectedCount = Math.floor((10 + maxAxleOffset) / 0.5) + 1;
    expect(env.positions.length).toBe(expectedCount);
  });

  it('midspan moment for single axle matches analytical PL/4', () => {
    const L = 6;
    const P = 100;
    const input = makeSimpleBeam(L);
    const result = solveMovingLoads(input, {
      train: { name: 'P', axles: [{ offset: 0, weight: P }] },
      step: 1.0,
    });

    expect(typeof result).not.toBe('string');
    const env = result as MovingLoadEnvelope;

    // Envelope at midspan should capture M_max = PL/4
    const mData = env.fullEnvelope!.moment.elements[0];
    const midIdx = Math.floor(mData.negValues.length / 2);
    // Moment is negative in our convention (load pushes down)
    expect(Math.abs(mData.negValues[midIdx])).toBeCloseTo(P * L / 4, 0);
  });
});
