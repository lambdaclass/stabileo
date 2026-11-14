import { expect, it } from 'vitest';
import { forceResidual } from '../solve';
import { buildModel, EXAMPLE } from '../calculators';
import { workerChannel } from '../worker-channel';
import { onPlane, splitTraction, ZERO_TENSOR } from '../../../lib/mohr/space';

it.skip('known wrong result: #1950 T82 — counts point loads and detects missing reactions', () => {
  const model = buildModel('simply-supported-beam', { ...EXAMPLE, length: 4, load: 10, position: 2, uniform: false });
  model.loads = [{ type: 'pointOnElement', data: { elementId: [...model.elements.keys()][0], a: 0, p: -10 } }];
  expect(forceResidual(model, [{ nodeId: 1, rx: 0, rz: 10, my: 0 }])).toBe(0);
  expect(forceResidual(model, [])).toBe(10);
  expect(forceResidual(model, [{ nodeId: 1, rx: 0, rz: 9, my: 0 }])).toBe(1);
});
it.skip('known wrong result: #1950 T174 — preserves small shear in both traction entry points', () => {
  for (const xy of [1e-7, -1e-7, 0, 50]) {
    const s = { ...ZERO_TENSOR, xx: 100, xy };
    expect(onPlane(s, [1, 0, 0]).tauN).toBe(Math.abs(xy));
    const split = splitTraction(s, [1, 0, 0]);
    expect(split.tauN).toBe(Math.hypot(...split.shear));
  }
});
it.skip('known wrong result: #1950 T86 — closing answers every in-flight request', async () => {
  const port = { onmessage: null, onerror: null, postMessage() {}, terminate() {} };
  const channel = workerChannel<{ n: number }, string>(() => port, r => r);
  const replies: string[] = [];
  void channel.post({ n: 1 }).then(r => replies.push(r));
  void channel.post({ n: 2 }).then(r => replies.push(r));
  channel.close();
  await Promise.resolve();
  expect(replies).toEqual(['closed', 'closed']);
});
