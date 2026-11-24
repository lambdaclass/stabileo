import { expect, it } from 'vitest';
import { forceResidual } from '../solve';
import { buildModel, EXAMPLE } from '../calculators';
import { workerChannel } from '../worker-channel';
import { onPlane, splitTraction, ZERO_TENSOR } from '../../../lib/mohr/space';

it('known wrong result: #1950 T82 — counts point loads and detects missing reactions', () => {
  const model = buildModel('simply-supported-beam', { ...EXAMPLE, length: 4, load: 10, position: 2, uniform: false });
  model.loads = [{ type: 'pointOnElement', data: { elementId: [...model.elements.keys()][0], a: 0, p: -10 } }];
  expect(forceResidual(model, [{ nodeId: 1, rx: 0, rz: 10, my: 0 }])).toBe(0);
  expect(forceResidual(model, [])).toBe(10);
  expect(forceResidual(model, [{ nodeId: 1, rx: 0, rz: 9, my: 0 }])).toBe(1);
});
it('known wrong result: #1950 T174 — preserves small shear in both traction entry points', () => {
  for (const xy of [1e-7, -1e-7, 0, 50]) {
    const s = { ...ZERO_TENSOR, xx: 100, xy };
    expect(onPlane(s, [1, 0, 0]).tauN).toBe(Math.abs(xy));
    const split = splitTraction(s, [1, 0, 0]);
    expect(split.tauN).toBe(Math.hypot(...split.shear));
  }
});
it('known wrong result: #1950 T86 — closing answers every in-flight request', async () => {
  const port = { onmessage: null, onerror: null, postMessage() {}, terminate() {} };
  const channel = workerChannel<{ n: number }, string>(() => port, r => r);
  const replies: string[] = [];
  void channel.post({ n: 1 }).then(r => replies.push(r));
  void channel.post({ n: 2 }).then(r => replies.push(r));
  channel.close();
  await Promise.resolve();
  expect(replies).toEqual(['closed', 'closed']);
});

it('all force load types use the same member-to-global transformation', () => {
  for (const [x, z] of [[4, 0], [0, 4], [3, 4], [-3, -4]]) {
    const model = buildModel('simply-supported-beam', { ...EXAMPLE, length: 4 });
    const el = [...model.elements.values()][0];
    model.nodes.set(el.nodeI, { id: el.nodeI, x: 0, z: 0 });
    model.nodes.set(el.nodeJ, { id: el.nodeJ, x, z });
    const L = Math.hypot(x, z), c = x / L, s = z / L;
    const cases = [
      { load: { type: 'pointOnElement', data: { elementId: el.id, a: 0, p: -10, px: 3 } }, fx: c * 3 + s * 10, fz: s * 3 - c * 10 },
      { load: { type: 'distributed', data: { elementId: el.id, qI: -2, qJ: -6, a: 1, b: 2 } }, fx: s * 4, fz: -c * 4 },
      { load: { type: 'axialDistributed', data: { elementId: el.id, qI: 2, qJ: 6, a: 1, b: 2 } }, fx: c * 4, fz: s * 4 },
      { load: { type: 'nodal', data: { nodeId: el.nodeI, fx: 3, fz: -10, my: 0 } }, fx: 3, fz: -10 },
      { load: { type: 'thermal', data: { elementId: el.id, dtUniform: 1, dtGradient: 0 } }, fx: 0, fz: 0 },
    ] as const;
    for (const { load, fx, fz } of cases) {
      model.loads = [load];
      const reaction = { nodeId: el.nodeI, rx: -fx, rz: -fz, my: 0 };
      expect(forceResidual(model, [reaction])).toBeCloseTo(0, 12);
      expect(forceResidual(model, [{ ...reaction, rx: reaction.rx + 1 }])).toBeCloseTo(1, 12);
    }
  }
});
