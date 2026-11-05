import { describe, it, expect } from 'vitest';
import { solveLimit } from '../solve-limit';
import { model, uniformMp, MP, pOn, q } from './helpers';

describe('a distributed-load hinge whose first position falls on a point load', () => {
  it('propped cantilever, uniform load and a small central point load: the span hinge leaves the point load and the collapse is found', () => {
    const L = 6, w = 10, P0 = 1;
    const m = model([[1, 0, 0], [2, L, 0]], [[1, 1, 2]], [[1, 'fixed'], [2, 'rollerX']], [q(1, -w), pOn(1, L / 2, -P0)]);
    const lambdaAt = (x: number) => {
      const phi = x / (L - x);
      const work = (w * L * x) / 2 + P0 * (x >= L / 2 ? L / 2 : (phi * L) / 2);
      return (MP * (2 + phi)) / work;
    };
    let lo = 1e-6, hi = L - 1e-6;
    for (let i = 0; i < 200; i++) {
      const a = lo + (hi - lo) * 0.382, b = lo + (hi - lo) * 0.618;
      if (lambdaAt(a) < lambdaAt(b)) hi = b; else lo = a;
    }
    const xHinge = (lo + hi) / 2;
    expect(xHinge).toBeGreaterThan(L / 2 + 0.1);
    const s = solveLimit(m, uniformMp);
    expect(s).not.toBeNull();
    expect(s!.best.lambda).toBeCloseTo(lambdaAt(xHinge), 6);
    expect(s!.positions.get(1)! * L).toBeCloseTo(xHinge, 3);
    expect(s!.moments.ratio).toBeLessThanOrEqual(1 + 1e-6);
  });
});
