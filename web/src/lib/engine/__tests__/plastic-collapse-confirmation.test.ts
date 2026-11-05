import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SolverInput, SolverLoad } from '../types';
import type { PlasticLimitResult } from '../wasm-solver';

const verdict: { override: PlasticLimitResult['confirmation'] | null; lambda: number | null } = { override: null, lambda: null };
vi.mock('../wasm-solver', async (load) => {
  const real = await load<typeof import('../wasm-solver')>();
  return {
    ...real,
    plasticLimit2D: (...args: Parameters<typeof real.plasticLimit2D>) => {
      const lp = real.plasticLimit2D(...args);
      return { ...lp, ...(verdict.lambda !== null ? { lambda: verdict.lambda } : {}), ...(verdict.override ? { confirmation: verdict.override } : {}) };
    },
  };
});
const { plasticCollapse2D } = await import('../plastic-collapse');

const MP = 100;
function beam(supportJ: string): SolverInput {
  const loads: SolverLoad[] = [{ type: 'pointOnElement', data: { elementId: 1, a: 3, p: -10 } } as SolverLoad];
  return {
    nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 6, z: 0 }]]),
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
    elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'pinned' }], [2, { id: 2, nodeId: 2, type: supportJ }]]),
    loads,
  } as unknown as SolverInput;
}
const run = (m: SolverInput) => plasticCollapse2D(m, { mp: () => MP, np: () => Infinity });

describe('the limit analysis factor is a collapse load only once something independent of it confirms it', () => {
  beforeEach(() => { verdict.override = null; verdict.lambda = null; });

  it('the exact certificate encloses it: a mechanism at 4Mp/(PL)', () => {
    const r = run(beam('rollerX'));
    expect(r.isMechanism).toBe(true);
    expect(r.unresolved).toBeFalsy();
    expect(r.collapseFactor).toBeCloseTo((4 * MP) / 60, 6);
  });

  it('the exact certificate contradicts it: unresolved, even with the history agreeing', () => {
    verdict.override = { kind: 'contradicted', reason: 'the exact certificate brackets the collapse factor elsewhere' };
    const r = run(beam('rollerX'));
    expect(r.isMechanism).toBe(false);
    expect(r.unresolved).toBe(true);
    expect(r.collapseFactor).toBeCloseTo((4 * MP) / 60, 6);
  });

  it('outside the certificate, a history that ends at the same factor confirms it', () => {
    verdict.override = { kind: 'outOfScope', reason: 'inclined supports are not supported' };
    const r = run(beam('rollerX'));
    expect(r.isMechanism).toBe(true);
    expect(r.collapseFactor).toBeCloseTo((4 * MP) / 60, 6);
  });

  it('outside the certificate, a history that ends elsewhere leaves it unresolved, at the lower of the two', () => {
    verdict.override = { kind: 'outOfScope', reason: 'inclined supports are not supported' };
    verdict.lambda = 2 * (4 * MP) / 60;
    const r = run(beam('rollerX'));
    expect(r.isMechanism).toBe(false);
    expect(r.unresolved).toBe(true);
    expect(r.collapseFactor).toBeCloseTo((4 * MP) / 60, 6);
  });
});
