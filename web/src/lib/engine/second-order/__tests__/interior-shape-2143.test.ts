import { it, expect } from 'vitest';
import { buildSystem } from '../system';
import { shapeSketch } from '../../steps/second-order-common';
import type { SolverInput } from '../../types';

for (const a of [1, 2, 4]) {
  it(`teaching displacement sketch keeps the fixed-fixed couple at ${a}`, () => {
    const L = 5, C = 6, EI = 20_000;
    const m: SolverInput = {
      nodes: new Map([[0, { id: 0, x: 0, z: 0 }], [1, { id: 1, x: L, z: 0 }]]),
      materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: 0.01, iz: 0.0001 }]]),
      elements: new Map([[1, { id: 1, type: 'frame', nodeI: 0, nodeJ: 1, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
      supports: new Map([[0, { id: 0, nodeId: 0, type: 'fixed' }], [1, { id: 1, nodeId: 1, type: 'fixed' }]]),
      loads: [{ type: 'pointOnElement', data: { elementId: 1, a, p: 0, my: C } }],
    };
    const built = buildSystem(m, { method: 'none', axialRigid: false }, true);
    expect(built.ok).toBe(true);
    if (!built.ok) throw new Error('fixture must build');
    const expected = Array.from({ length: 21 }, (_, k) => {
      const x = L * k / 20, b = L - a;
      return (C * b * (L - 3 * a) * x * x / (2 * L * L) + C * a * b * x * x * x / (L ** 3) - C * Math.max(x - a, 0) ** 2 / 2) / EI;
    });
    const scale = 0.12 * L / Math.max(...expected.map(Math.abs));
    const shape = shapeSketch(built.sys, new Array(built.sys.nTotal).fill(0)).deformed![0]!.points;
    expect(shape).toHaveLength(21);
    shape.forEach((p, k) => expect(Math.abs(p.z - expected[k]! * scale)).toBeLessThanOrEqual(2e-13));
    const mode = shapeSketch(built.sys, new Array(built.sys.nTotal).fill(0), 'deformed', false).deformed![0]!.points;
    expect(mode).toHaveLength(21);
    mode.forEach(p => expect(p.z).toBe(0));
  });
}
