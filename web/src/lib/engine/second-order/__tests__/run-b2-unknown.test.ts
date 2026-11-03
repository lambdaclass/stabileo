import { describe, it, expect, vi } from 'vitest';
import { sameDisplacements, runPDelta2D } from '../run-pdelta';
import { DEFAULT_SETTINGS } from '../settings';
import { portal } from './fixtures';
import type { AnalysisResults } from '../../types';

vi.mock('../buckling', async (orig) => {
  const real = await orig<typeof import('../buckling')>();
  return { ...real, teachingBuckling: () => ({ ok: false, reason: { key: 'course.second-order.refuse.noPositive' } }) };
});

const res = (d: Array<[number, number, number, number]>): AnalysisResults =>
  ({ displacements: d.map(([nodeId, ux, uz, ry]) => ({ nodeId, ux, uz, ry })), reactions: [], elementForces: [] }) as unknown as AnalysisResults;

describe('the B₂ of a stable P-Δ whose λ₁ is unknown', () => {
  it('is unknown, not ∞', () => {
    const pd = runPDelta2D(portal(4, 6, 300, 10), { ...DEFAULT_SETTINGS, method: 'string', n: 2 });
    if (!pd.ok) throw new Error(pd.reason.key);
    expect(pd.result.secondOrder.lambda1).toBeNull();
    expect(pd.result.converged && pd.result.isStable).toBe(true);
    expect(pd.result.b2Factor).toBeNaN();
  });
});

describe('the teaching iterations against the engine answer', () => {
  const engine = res([[1, 0, 0, 0], [2, 0.01, -0.002, 0.003], [3, 0.011, 0.001, -0.002]]);
  it('pairs nodes by id, not by position', () => {
    expect(sameDisplacements(res([[3, 0.011, 0.001, -0.002], [1, 0, 0, 0], [2, 0.01, -0.002, 0.003]]), engine)).toBe(true);
    expect(sameDisplacements(res([[1, 0, 0, 0], [3, 0.01, -0.002, 0.003], [2, 0.011, 0.001, -0.002]]), engine)).toBe(false);
  });
  it('compares rotations too', () => {
    expect(sameDisplacements(res([[1, 0, 0, 0], [2, 0.01, -0.002, 0.003], [3, 0.011, 0.001, 0.002]]), engine)).toBe(false);
  });
  it('refuses a missing node', () => {
    expect(sameDisplacements(res([[1, 0, 0, 0], [2, 0.01, -0.002, 0.003]]), engine)).toBe(false);
  });
});
