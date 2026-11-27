import { describe, expect, it } from 'vitest';
import { gridExtent } from '../structural-grid-3d';
import { laidExtent, type Underlay } from '../../model/underlay';

const levels = [{ id: 'a', name: 'N0', z: 0 }, { id: 'b', name: 'N1', z: 3 }];
const plan = { id: 'u', name: 'plan', z: 0, visible: true, segments: [0, 0, 18, 0, 18, 0, 18, 10], dx: 1, dy: 1, rotationDeg: 0 } as unknown as Underlay;

describe('what the levels drawn in 3D cover', () => {
  it('is the template, where it was laid, when there are no axes', () => {
    expect(laidExtent([plan])).toEqual({ x0: 1, x1: 19, y0: 1, y1: 11 });
    expect(gridExtent({ axes: [], levels }, laidExtent([plan]))).toEqual({ x0: 1, x1: 19, y0: 1, y1: 11 });
  });

  it('turns with the template', () => {
    const b = laidExtent([{ ...plan, dx: 0, dy: 0, rotationDeg: 90 } as Underlay])!;
    expect([b.x0, b.x1, b.y0, b.y1].map((v) => +v.toFixed(9))).toEqual([-10, 0, 0, 18]);
  });

  it('reaches the axes that go past the template', () => {
    const grid = { axes: [{ id: 'x1', name: '1', axis: 'x' as const, at: -5 }, { id: 'x2', name: '2', axis: 'x' as const, at: 10 }], levels };
    expect(gridExtent(grid, laidExtent([plan]))).toEqual({ x0: -5, x1: 19, y0: 1, y1: 11 });
  });

  it('leaves out a hidden template, and stays on the axes without one', () => {
    expect(laidExtent([{ ...plan, visible: false } as Underlay])).toBeNull();
    expect(gridExtent({ axes: [], levels }, null)).toEqual({ x0: 0, x1: 0, y0: 0, y1: 0 });
  });
});
