import { expect, it } from 'vitest';
import { driftAndSlidingLoads } from '../snow-drift-loads';
import { gravityLayout } from '../plan-gravity';
import { mesh } from './snow-surface-round2-fixture';

const regression = process.env.RUN_KNOWN_WRONG === '2218' ? it : it.skip;

regression('known wrong result: #2218 the step triangle retains force and both physical first moments', () => {
  const model = mesh([[[0, 0, 3], [7.5, 0, 3], [7.5, 4, 3], [0, 4, 3]], [[-7.5, 0, 5], [0, 0, 5], [0, 4, 5], [-7.5, 4, 5]]]);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  const out = driftAndSlidingLoads(model, layout, { pg: 1, balanced: 0.7, pf: 0.7, slippery: false, tributaryWidth: 1 });
  const actual = out.distributed.reduce((v, d) => {
    const e = model.elements.get(d.elementId)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const L = Math.hypot(b.x - a.x, b.y - a.y), lo = d.a ?? 0, hi = d.b ?? L;
    const q0 = -d.q, q1 = -(d.qJ ?? d.q), F = (hi - lo) * (q0 + q1) / 2;
    const first = (hi - lo) ** 2 * (q0 + 2 * q1) / 6;
    return [v[0]! + F, v[1]! + (a.x + (b.x - a.x) * lo / L) * F + (b.x - a.x) / L * first,
      v[2]! + (a.y + (b.y - a.y) * lo / L) * F + (b.y - a.y) / L * first];
  }, [0, 0, 0]);
  expect(actual[0]).toBeCloseTo(3.049542288, 10);
  expect(actual[1]).toBeCloseTo(1.549167482304, 10);
  expect(actual[2]).toBeCloseTo(6.099084576, 10);
});
