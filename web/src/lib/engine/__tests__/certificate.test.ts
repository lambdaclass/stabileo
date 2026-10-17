/**
 * The certificate wrappers (docs/verification/CERTIFY.md), the background certificate store,
 * and the directed rounding that keeps a printed bound a bound.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { initSolver, hasCertifyExport, certifyLinear2D, certifyLinear3D, solveBuckling, certifyBuckling2D } from '../wasm-solver';
import { roundDirected, formatBound, formatLambda } from '../../utils/certificate-format';

beforeAll(async () => { await initSolver(); });

const E = 200_000, I = 9.8e-5, A = 0.0069;

function column(L: number, P: number, H = 0) {
  return {
    nodes: new Map([[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 0, y: L }]]),
    materials: new Map([[1, { id: 1, e: E, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: A, iz: I }]]),
    elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, type: 'frame' }]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
    loads: [{ type: 'nodal', data: { id: 1, nodeId: 2, fx: H, fy: -P, mz: 0 } }],
  } as never;
}

function cantilever3D() {
  return {
    nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 5, y: 0, z: 0 }]]),
    materials: new Map([[1, { id: 1, e: 200e3, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 2e-4 }]]),
    elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]]),
    supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0 } }],
  } as never;
}

describe('certified linear static results', () => {
  it('the WASM build carries the certificate exports', () => {
    expect(hasCertifyExport()).toBe(true);
  });

  it('a 2D cantilever is certified, with a bound per member', () => {
    const out = certifyLinear2D(column(5, 100, 10));
    expect(out.certificate.status).toBe('certified');
    if (out.certificate.status !== 'certified') return;
    expect(out.certificate.absBound).toBeGreaterThanOrEqual(0);
    expect(out.certificate.absBound).toBeLessThan(1e-6);
    expect(out.forceBounds.map((b) => b.elementId)).toEqual([1]);
    expect(out.results.displacements.length).toBe(2);
  });

  it('a 3D cantilever is certified, with a bound per member', () => {
    const out = certifyLinear3D(cantilever3D());
    expect(out.certificate.status).toBe('certified');
    expect(out.forceBounds).toHaveLength(1);
    expect(Object.keys(out.forceBounds[0]).sort()).toEqual(['bimoment', 'elementId', 'mz', 'my', 'n', 't', 'vy', 'vz'].sort());
    expect(out.forceBounds[0].bimoment).toBe(0); // not a warping member
  });
});

describe('certified buckling', () => {
  it('the critical factor of a cantilever column is enclosed by its certificate', () => {
    const r = solveBuckling(column(5, 100), 1);
    const c = r.certificate;
    expect(c?.status).toBe('certified');
    if (c?.status !== 'certified') return;
    const computed = r.modes[0].loadFactor;
    expect(c.lambdaLower).toBeLessThanOrEqual(computed);
    expect(c.lambdaUpper ?? Infinity).toBeGreaterThanOrEqual(c.lambdaLower);
    expect(certifyBuckling2D(column(5, 100), 1).certificate?.status).toBe('certified');
  });
});

describe('the certificate store', () => {
  it('certifies a published linear solve after it, and forgets it on clear', async () => {
    vi.useFakeTimers();
    try {
      const { resultsStore } = await import('../../store');
      const { certificateStore } = await import('../../store/certificate.svelte');
      const { validateAndSolve2D } = await import('../solver-service');
      const model = column(5, 100, 10) as any;
      const results = validateAndSolve2D({ ...model, analysis: undefined } as never);
      expect(typeof results).toBe('object');
      resultsStore.setResults(results as never);
      expect(certificateStore.state.status).toBe('pending');
      await vi.runAllTimersAsync();
      const s = certificateStore.shown(false);
      expect(s.status).toBe('done');
      if (s.status === 'done') expect(s.certificate.status).toBe('certified');
      expect(certificateStore.forceBound(false, 1)).not.toBeNull();
      resultsStore.clear();
      expect(certificateStore.state.status).toBe('idle');
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves a result it cannot certify alone', async () => {
    const { resultsStore } = await import('../../store');
    const { certificateStore } = await import('../../store/certificate.svelte');
    resultsStore.setResults({ displacements: [], reactions: [], elementForces: [] } as never);
    expect(certificateStore.state.status).toBe('idle');
  });
});

describe('a printed bound is still a bound', () => {
  it('rounds an upper bound up and a lower bound down', () => {
    expect(roundDirected(1.231, 'up', 3)).toBe(1.24);
    expect(roundDirected(1.239, 'down', 3)).toBe(1.23);
    expect(roundDirected(3, 'down', 4)).toBe(3);
    expect(roundDirected(3, 'up', 4)).toBe(3);
  });

  it('formats', () => {
    expect(formatBound(1.231e-12)).toBe('1.24e-12');
    expect(formatBound(null)).toBe('∞');
    expect(formatBound(0)).toBe('0');
    expect(formatLambda(12.34567, 'down')).toBe('12.34');
    expect(formatLambda(12.34567, 'up')).toBe('12.35');
    expect(formatLambda(null, 'up')).toBe('∞');
  });
});
