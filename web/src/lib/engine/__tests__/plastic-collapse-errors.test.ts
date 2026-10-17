/**
 * An engine failure in the middle of a plastic collapse analysis is an error, not a mechanism
 * (docs/verification/TS_ENGINE_LOGIC.md, finding 12). It used to be recorded as collapse, so the
 * failure came out as a collapse factor.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../wasm-solver', async (orig) => {
  const real = await orig<typeof import('../wasm-solver')>();
  let calls = 0;
  return { ...real, solve: (input: never) => { if (++calls > 1) throw new Error('engine failure'); return real.solve(input); } };
});

import { plasticCollapse2D } from '../plastic-collapse';
import type { SolverInput } from '../types';

describe('plastic collapse with a failing engine', () => {
  it('throws instead of reporting a mechanism', () => {
    // A propped cantilever needs two hinges; the solve after the first one fails.
    const m = {
      nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 6, z: 0 }]]),
      materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
      elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }], [2, { id: 2, nodeId: 2, type: 'rollerX' }]]),
      loads: [{ type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } }],
    } as unknown as SolverInput;
    expect(() => plasticCollapse2D(m, { mp: () => 100, np: () => Infinity })).toThrow(/engine failure/);
  });
});
