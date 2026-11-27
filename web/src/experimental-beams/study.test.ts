import { describe, expect, it } from 'vitest';
import { point, requestFor, segmentVerdict, type State } from './study';

describe('experimental beam viewer', () => {
  it('uses the loaded node and work-conjugate physical displacement for each example', () => {
    for (const example of ['column', 'arch'] as const) {
      const request = requestFor(example, 0);
      const n = request.model.positions.length - 1;
      const displacements: [number, number, number][] = request.model.positions.map(() => [0, 0, 0]);
      displacements[Math.floor(n / 2)][0] = .01;
      displacements[n][1] = -.02;
      expect(point(example, request.model, { displacements, loadFactor: .5, energy: 0, relativeResidual: 0 }))
        .toEqual([example === 'column' ? .01 : .02, -.5 * request.model.loads[n][1]]);
    }
  });
  it('never colors an unresolved transition as stable', () => {
    const state = (verdict: string) => ({ stability: { verdict } }) as State;
    expect(segmentVerdict(state('stable'), state('unstable'))).toBe('undetermined');
    expect(segmentVerdict(state('stable'), state('undetermined'))).toBe('undetermined');
    expect(segmentVerdict(state('unstable'), state('unstable'))).toBe('unstable');
  });
  it('applies signed imperfections only to unrestrained translations and rejects nonfinite amplitude', () => {
    for (const example of ['column', 'arch'] as const) {
      const request = requestFor(example, -.001);
      expect(request.imperfection?.amplitude).toBe(-.001);
      request.model.fixed.forEach((support, i) => support.slice(0, 2).forEach((fixed, j) => {
        if (fixed) expect(request.imperfection!.shape[i][j]).toBe(0);
      }));
      expect(requestFor(example, 0).imperfection).toBeNull();
    }
    expect(() => requestFor('column', NaN)).toThrow();
    expect(() => requestFor('column', .01)).toThrow();
  });
});
