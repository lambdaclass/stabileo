import { beforeAll, describe, expect, it } from 'vitest';
import { initSolver } from '../wasm-solver';
import { plasticCollapse2D } from '../plastic-collapse';
import type { SolverInput } from '../types';

beforeAll(async () => { await initSolver(); });

const E = 200_000;
const A = 0.0069;
const I = 9.8e-5;
const L = 8, N = 4, W = 10, MP = 147.58;

function fixedFixedUdl(): SolverInput {
  const nodes = new Map<number, unknown>(), elements = new Map<number, unknown>();
  for (let i = 0; i <= N; i++) nodes.set(i + 1, { id: i + 1, x: (L * i) / N, z: 0 });
  for (let i = 0; i < N; i++) elements.set(i + 1, { id: i + 1, nodeI: i + 1, nodeJ: i + 2, materialId: 1, sectionId: 1, type: 'frame' });
  return {
    nodes, elements,
    materials: new Map([[1, { id: 1, e: E, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: A, iz: I }]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }], [2, { id: 2, nodeId: N + 1, type: 'fixed' }]]),
    loads: Array.from({ length: N }, (_, i) => ({ type: 'distributed', data: { id: i + 1, elementId: i + 1, qI: -W, qJ: -W } })),
  } as unknown as SolverInput;
}

const panel = () => plasticCollapse2D(fixedFixedUdl(), { mp: () => MP, np: () => Infinity });

describe('the Basic panel on a fixed-fixed beam under a uniform load', () => {
  it('collapses at 16 Mp/L²', () => {
    const r = panel();
    expect(r.isMechanism && !r.withheld).toBe(true);
    expect(r.collapseFactor / ((16 * MP) / L ** 2 / W)).toBeCloseTo(1, 9);
  });

  it('forms the hinges at the fixed ends first, then in the span', () => {
    const r = panel();
    const first = r.steps[0].hingesFormed as Array<{ elementId: number; end: string }>;
    const ids = first.map((h) => `${h.elementId}${h.end}`);
    expect(ids.sort()).toEqual(['1start', '4end']);
    expect(r.steps.slice(1).flatMap(s => s.hingesFormed).some(h => Math.abs((h.elementId - 1) * L / N + h.x - L / 2) < 1e-9)).toBe(true);
    expect(r.isMechanism).toBe(true);
  });
});
