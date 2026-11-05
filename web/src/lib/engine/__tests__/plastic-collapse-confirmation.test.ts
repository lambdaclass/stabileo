import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SolverInput, SolverLoad } from '../types';
import type { PlasticLimitResult } from '../wasm-solver';

const verdict: { override: PlasticLimitResult['confirmation'] | null; lambda: number | null; upper: number | null } = { override: null, lambda: null, upper: null };
vi.mock('../wasm-solver', async (load) => {
  const real = await load<typeof import('../wasm-solver')>();
  return {
    ...real,
    plasticLimit2D: (...args: Parameters<typeof real.plasticLimit2D>) => {
      const lp = real.plasticLimit2D(...args);
      return { ...lp, ...(verdict.lambda !== null ? { lambda: verdict.lambda } : {}), ...(verdict.upper !== null ? { lambdaUpper: verdict.upper } : {}), ...(verdict.override ? { confirmation: verdict.override } : {}) };
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
  beforeEach(() => { verdict.override = null; verdict.lambda = null; verdict.upper = null; });

  it('the exact certificate encloses it: a mechanism at 4Mp/(PL)', () => {
    const r = run(beam('rollerX'));
    expect(r.isMechanism).toBe(true);
    expect(r.unresolved).toBeFalsy();
    expect(r.collapseFactor).toBeCloseTo((4 * MP) / 60, 6);
  });

  it('the exact certificate contradicts it: unresolved, even with the history agreeing, at the certified lower bound', () => {
    verdict.override = { kind: 'contradicted', reason: 'the exact certificate brackets the collapse factor elsewhere', lower: 1.5 };
    const r = run(beam('rollerX'));
    expect(r.isMechanism).toBe(false);
    expect(r.unresolved).toBe(true);
    expect(r.collapseFactor).toBe(1.5);
  });

  it('outside the certificate, a history that ends at the same factor confirms it', () => {
    verdict.override = { kind: 'outOfScope', reason: 'inclined supports are not supported' };
    const r = run(beam('rollerX'));
    expect(r.isMechanism).toBe(true);
    expect(r.collapseFactor).toBeCloseTo((4 * MP) / 60, 6);
  });

  it('the exact certificate confirms it even where the history stops elsewhere, which the result notes', () => {
    verdict.override = { kind: 'exact' };
    verdict.lambda = 1.2 * (4 * MP) / 60;
    const r = run(beam('rollerX'));
    expect(r.isMechanism).toBe(true);
    expect(r.unresolved).toBeFalsy();
    expect(r.collapseFactor).toBeCloseTo(1.2 * (4 * MP) / 60, 9);
    expect(r.limit?.historyLambda).toBeCloseTo((4 * MP) / 60, 6);
  });

  it('a history that confirms it within the station spacing reports the lower of the two', () => {
    verdict.override = { kind: 'outOfScope', reason: 'inclined supports are not supported' };
    verdict.lambda = 1.0005 * (4 * MP) / 60;
    const r = run(beam('rollerX'));
    expect(r.isMechanism).toBe(true);
    expect(r.collapseFactor).toBeCloseTo((4 * MP) / 60, 6);
  });

  it('bounds that do not meet leave it unresolved, at the certified lower bound', () => {
    verdict.override = { kind: 'bracketed', reason: 'axial capacities govern', lower: 2, upper: 9 };
    verdict.lambda = 3;
    const r = run(beam('rollerX'));
    expect(r.unresolved).toBe(true);
    expect(r.isMechanism).toBe(false);
    expect(r.collapseFactor).toBe(2);
  });

  it('outside the certificate, a history that ends elsewhere leaves it unresolved, at the lower of the two', () => {
    verdict.override = { kind: 'outOfScope', reason: 'inclined supports are not supported' };
    verdict.lambda = 2 * (4 * MP) / 60;
    const r = run(beam('rollerX'));
    expect(r.isMechanism).toBe(false);
    expect(r.unresolved).toBe(true);
    expect(r.unconfirmed).toBe(true);
    expect(r.collapseFactor).toBeCloseTo((4 * MP) / 60, 6);
  });

  it('an axial history a few millionths above the limit analysis still confirms it, at the limit analysis value', () => {
    const tie: SolverInput = { ...beam('rollerX'), loads: [{ type: 'nodal', data: { nodeId: 2, fx: 10, fz: 0, my: 0 } } as SolverLoad] };
    verdict.override = { kind: 'outOfScope', reason: 'inclined supports are not supported' };
    verdict.lambda = 5 * (1 - 4e-6);
    verdict.upper = verdict.lambda;
    const r = plasticCollapse2D(tie, { mp: () => MP, np: () => 50 });
    expect(r.hinges.map((h) => h.kind)).toEqual(['axial']);
    expect(r.isMechanism).toBe(true);
    expect(r.unresolved).toBeFalsy();
    expect(r.limit).toBeUndefined();
    expect(r.collapseFactor).toBe(5 * (1 - 4e-6));
  });

  it('an unconfirmed result never reports more than the limit analysis value', () => {
    verdict.override = { kind: 'outOfScope', reason: 'inclined supports are not supported' };
    verdict.lambda = 0.5 * (4 * MP) / 60;
    const r = run(beam('rollerX'));
    expect(r.unresolved).toBe(true);
    expect(r.collapseFactor).toBeCloseTo(0.5 * (4 * MP) / 60, 9);
    expect(r.limit?.lambda).toBeCloseTo(0.5 * (4 * MP) / 60, 9);
  });
});
