import { afterEach, describe, expect, it } from 'vitest';
import { drawInfluenceLine } from '../draw-influence';
import { influenceTool } from '../../store/influence-tool.svelte';
import type { InfluenceLineResult } from '../../store/model.svelte';

function recordingCtx(points: { x: number; y: number }[]): CanvasRenderingContext2D {
  return new Proxy({}, {
    get: (_, key) => (key === 'lineTo' || key === 'moveTo' ? (x: number, y: number) => points.push({ x, y }) : () => {}),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
}

function drawnOffsets(values: number[]): number[] {
  const points: { x: number; y: number }[] = [];
  const il = {
    quantity: 'M',
    direction: 'vertical',
    targetElementId: 1,
    targetPosition: 0.5,
    points: values.map((value, k) => ({ elementId: 1, t: k / (values.length - 1), x: (4 * k) / (values.length - 1), y: 0, value })),
  } as unknown as InfluenceLineResult;
  const dc = {
    ctx: recordingCtx(points),
    worldToScreen: (x: number, y: number) => ({ x: 10 * x, y: -10 * y }),
    getNode: (id: number) => (id === 1 ? { x: 0, y: 0 } : { x: 4, y: 0 }),
    getElement: () => ({ nodeI: 1, nodeJ: 2 }),
  } as unknown as Parameters<typeof drawInfluenceLine>[1];
  drawInfluenceLine(il, dc, 1);
  return points.map((p) => p.y).filter((y) => Math.abs(y) > 1e-9);
}

describe('the side positive influence ordinates are drawn on', () => {
  afterEach(() => { influenceTool.positiveDown = false; });

  it('draws a positive ordinate above a horizontal member by default', () => {
    influenceTool.positiveDown = false;
    const off = drawnOffsets([0, 0.5, 1, 0.5, 0]);
    expect(off.length).toBeGreaterThan(0);
    expect(Math.min(...off)).toBeLessThan(0);
    expect(Math.max(...off)).toBeLessThanOrEqual(0);
  });

  it('draws it below once positive values are set to go down', () => {
    influenceTool.positiveDown = true;
    const off = drawnOffsets([0, 0.5, 1, 0.5, 0]);
    expect(off.length).toBeGreaterThan(0);
    expect(Math.max(...off)).toBeGreaterThan(0);
    expect(Math.min(...off)).toBeGreaterThanOrEqual(0);
  });

  it('flips a negative ordinate the other way too', () => {
    influenceTool.positiveDown = true;
    const off = drawnOffsets([0, -0.5, -1, -0.5, 0]);
    expect(Math.min(...off)).toBeLessThan(0);
    expect(Math.max(...off)).toBeLessThanOrEqual(0);
  });
});
