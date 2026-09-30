/**
 * A mode shape is fixed; only its amplitude animates. Each member's shape is interpolated once
 * per mode (each interpolation crosses into the engine), and a frame only rescales it — to the
 * same points as interpolating again at that amplitude.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

const calls = { n: 0 };
vi.mock('../../engine/diagrams', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../engine/diagrams')>();
  return { ...real, computeDeformedShape: (...a: Parameters<typeof real.computeDeformedShape>) => { calls.n++; return real.computeDeformedShape(...a); } };
});

import { drawModeShape, modeShapePoints } from '../draw-modes';
import { initSolver } from '../../engine/wasm-solver';

beforeAll(async () => { await initSolver(); });

function recorder() {
  const lines: Array<{ x: number; y: number }> = [];
  const ctx = {
    beginPath() {}, moveTo(x: number, y: number) { lines.push({ x, y }); }, lineTo(x: number, y: number) { lines.push({ x, y }); },
    stroke() {}, arc() {}, fill() {}, setLineDash() {}, strokeStyle: '', fillStyle: '', lineWidth: 0,
  } as unknown as CanvasRenderingContext2D;
  return { ctx, lines };
}

describe('animating a mode shape', () => {
  const nodes = new Map([[1, { x: 0, y: 0 }], [2, { x: 4, y: 0 }], [3, { x: 8, y: 0 }]]);
  const elements = new Map([[1, { nodeI: 1, nodeJ: 2, type: 'frame' as const }], [2, { nodeI: 2, nodeJ: 3, type: 'frame' as const }]]);
  const disp = [{ nodeId: 1, ux: 0, uz: 0, ry: 0.01 }, { nodeId: 2, ux: 0, uz: 0.02, ry: 0 }, { nodeId: 3, ux: 0, uz: 0, ry: -0.01 }];

  it('interpolates each member once for the mode, not once per frame', () => {
    const { ctx } = recorder();
    const dc = { ctx, worldToScreen: (x: number, y: number) => ({ x, y }), nodes, elements };
    drawModeShape(disp, dc, 1, 30);
    const first = calls.n;
    for (const s of [20, -10, 5, 0.5]) drawModeShape(disp, dc, 1, s);
    expect(calls.n).toBe(first);
  });

  it('a frame draws what interpolating at its amplitude draws', () => {
    const { ctx, lines } = recorder();
    const dc = { ctx, worldToScreen: (x: number, y: number) => ({ x, y }), nodes, elements };
    drawModeShape(disp, dc, 1, 17);
    const expected = [...elements.values()].flatMap((e) => modeShapePoints(nodes.get(e.nodeI)!, nodes.get(e.nodeJ)!,
      disp.find((d) => d.nodeId === e.nodeI)!, disp.find((d) => d.nodeId === e.nodeJ)!, e, 17));
    expect(lines).toHaveLength(expected.length);
    lines.forEach((p, k) => { expect(p.x).toBeCloseTo(expected[k]!.x, 9); expect(p.y).toBeCloseTo(expected[k]!.y, 9); });
  });
});
