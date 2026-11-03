import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import FmSketch from '../FmSketch.svelte';
import type { Geometry } from '../../../lib/engine/force-method/result-types';

const geometry = (angle?: number): Geometry => ({
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 4, z: 0 }],
  elements: [{ id: 1, nodeI: 1, nodeJ: 2, type: 'frame', hingeStart: false, hingeEnd: false }],
  supports: [
    { nodeId: 1, restrained: [true, true, false], spring: false },
    { nodeId: 2, restrained: [false, true, false], spring: false, angle },
  ],
});

const lineIn = (html: string, after: string, cls: string) => {
  const from = html.indexOf(after);
  expect(from).toBeGreaterThanOrEqual(0);
  const m = html.slice(from).match(new RegExp(`<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)" class="${cls}[^"]*"`));
  expect(m).not.toBeNull();
  const [x1, y1, x2, y2] = m!.slice(1).map(Number);
  return { dx: x2 - x1, dy: y2 - y1 };
};

const direction = (v: { dx: number; dy: number }) => { const l = Math.hypot(v.dx, v.dy); return [v.dx / l, -v.dy / l]; };

describe('the reaction of an inclined roller is drawn along its normal', () => {
  for (const deg of [0, 30, -50]) {
    it(`at ${deg}°: the release offered and the redundant both point along (sin α, cos α)`, () => {
      const a = (deg * Math.PI) / 180;
      const html = render(FmSketch, {
        props: {
          geometry: geometry(deg === 0 ? undefined : a),
          redundants: [{ index: 1, kind: 'reaction', nodeId: 2, component: 1 }] as never,
          pick: { options: [{ key: 'r:2:1', group: 'support', kind: 'reaction', nodeId: 2, component: 1, count: 1 }] as never, picked: [], onPick: () => {}, title: () => '' },
        },
      }).body;
      for (const d of [direction(lineIn(html, 'data-testid="fm-spot-r:2:1"', 'fm-spot-line')), direction(lineIn(html, '<g', 'fm-xline'))]) {
        expect(d[0]).toBeCloseTo(Math.sin(a), 6);
        expect(d[1]).toBeCloseTo(Math.cos(a), 6);
      }
    });
  }
});
