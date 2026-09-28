/**
 * Story drift under seismic cases, INPRES-CIRSOC 103-2018 §6.4: [6.17] and [6.18] against a
 * hand calculation, and Tabla 6.4 as printed.
 */
import { describe, it, expect } from 'vitest';
import { driftLimit, seismicDrifts } from '../seismic-drift';

describe('Tabla 6.4', () => {
  it('reads the four printed limits and exempts group C', () => {
    expect(driftLimit('A', 'D')).toBe(0.01);
    expect(driftLimit('Ao', 'ND')).toBe(0.015);
    expect(driftLimit('B', 'D')).toBe(0.015);
    expect(driftLimit('B', 'ND')).toBe(0.025);
    expect(driftLimit('C', 'D')).toBeNull();
  });
});

describe('design drift', () => {
  // Two stacked columns, 3 m each; elastic top displacements 4 mm and 10 mm in X.
  const nodes = new Map([
    [1, { x: 0, y: 0, z: 0 }], [2, { x: 0, y: 0, z: 3 }], [3, { x: 0, y: 0, z: 6 }],
  ]);
  const elements = [{ id: 1, nodeI: 1, nodeJ: 2 }, { id: 2, nodeI: 2, nodeJ: 3 }];
  const displacements = [
    { nodeId: 1, ux: 0, uy: 0, uz: 0 }, { nodeId: 2, ux: 0.004, uy: 0, uz: 0 }, { nodeId: 3, ux: 0.010, uy: 0, uz: 0 },
  ];

  it('is Cd·Δe/(γr·h) per story, with group A (γr = 1,3)', () => {
    const r = seismicDrifts({ nodes, elements, displacements, cd: 5.5, group: 'A', condition: 'D' })!;
    expect(r.limit).toBe(0.01);
    expect(r.stories.map((s) => s.ratioX)).toEqual([
      expect.closeTo((5.5 * 0.004) / (1.3 * 3), 12),
      expect.closeTo((5.5 * 0.006) / (1.3 * 3), 12),
    ]);
    // 5,5·0,006/(1,3·3) = 0,0085: within 0,010, but past 80 % of it.
    expect(r.stories[1]!.status).toBe('warn');
  });

  it('is not computed for group C', () => {
    expect(seismicDrifts({ nodes, elements, displacements, cd: 5.5, group: 'C', condition: 'D' })).toBeNull();
  });
});
