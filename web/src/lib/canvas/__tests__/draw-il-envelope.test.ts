import { describe, it, expect } from 'vitest';
import { drawIlEnvelope } from '../draw-il-envelope';
import type { AlongEnvelope } from '../../engine/influence/envelope-along';

function drawnPoints(env: AlongEnvelope, nodeI: number, nodeJ: number, nodes: Record<number, { x: number; y: number }>): string[] {
  const pts: string[] = [];
  const rec = (x: number, y: number) => pts.push(`${x.toFixed(6)},${y.toFixed(6)}`);
  const ctx = new Proxy({}, {
    get: (_, k) => (k === 'moveTo' || k === 'lineTo' ? rec : () => {}),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  drawIlEnvelope(env, {
    ctx,
    worldToScreen: (x, y) => ({ x: 100 + 10 * x, y: 100 - 10 * y }),
    getNode: (id) => nodes[id],
    getElement: () => ({ nodeI, nodeJ }),
  });
  return pts.sort();
}

const env = (quantity: 'M' | 'V', max: number[], min: number[]): AlongEnvelope =>
  ({ quantity, globalMax: 80, members: [{ elementId: 1, t: [0, 0.25, 0.5, 0.75, 1], max, min }] }) as unknown as AlongEnvelope;

describe('the influence-line envelope band', () => {
  for (const [name, a, b] of [['beam', { x: 0, y: 0 }, { x: 8, y: 0 }], ['column', { x: 0, y: 0 }, { x: 0, y: 8 }]] as const) {
    for (const q of ['M', 'V'] as const) {
      it(`${q} on a ${name}: the same band whichever end the member was drawn from`, () => {
        const nodes = { 1: a, 2: b };
        const max = [0, 60, 80, 40, 0], min = [0, -10, -20, -5, 0];
        const forward = drawnPoints(env(q, max, min), 1, 2, nodes);
        const backward = drawnPoints(env(q, [...max].reverse(), [...min].reverse()), 2, 1, nodes);
        expect(backward).toEqual(forward);
      });
    }
  }

  it('positive M of a beam drawn left to right sits below it', () => {
    const pts = drawnPoints(env('M', [0, 0, 80, 0, 0], [0, 0, 0, 0, 0]), 1, 2, { 1: { x: 0, y: 0 }, 2: { x: 8, y: 0 } });
    const ys = pts.map((p) => Number(p.split(',')[1]));
    expect(Math.max(...ys)).toBeCloseTo(160, 6);
    expect(Math.min(...ys)).toBeCloseTo(100, 6);
  });
});
