/**
 * One set of grid lines for the plates meshed together: the forced coordinates and as many evenly
 * between each pair as the mesh size asks, read along each plate's frame; a grid given them takes
 * them and no others, so two plates side by side meet on the same nodes.
 */
import { describe, it, expect } from 'vitest';
import { axisStations, axisOf, linesAlong } from '../tartan';
import { rectGrid } from '../rect-grid';
import type { Vec3 } from '../affine';

describe('the lines of the plates meshed together', () => {
  it('keep every forced coordinate once and fill each gap evenly at or under the size', () => {
    expect(axisStations([0, 1.9, 1.90001, 4.2, 0], 1.2)).toEqual([0, 0.95, 1.9, expect.closeTo(3.05, 12), 4.2]);
    expect(axisStations([0, 3], Infinity)).toEqual([0, 3]);
  });

  it('are read along a frame direction that runs along an axis, either way, and not along one at a slant', () => {
    const lines = [[0, 1, 2], [5, 6], [10, 12]] as const;
    expect(axisOf([0, -1, 0])).toEqual({ k: 1, sign: -1 });
    expect(linesAlong(lines, [1, 6, 0], [1, 0, 0])).toEqual([-1, 0, 1]);
    expect(linesAlong(lines, [1, 6, 0], [0, -1, 0])).toEqual([1, 0]);
    expect(linesAlong(lines, [0, 0, 0], [Math.SQRT1_2, Math.SQRT1_2, 0])).toBeNull();
  });

  it('make two neighbouring plates meet node for node where each dividing its own sides would not', () => {
    const plate = (x0: number, x1: number): Vec3[] => [[x0, 0, 0], [x1, 0, 0], [x1, 2.5, 0], [x0, 2.5, 0]];
    const frame = { o: [0, 0, 0] as Vec3, u: [1, 0, 0] as Vec3, v: [0, 1, 0] as Vec3, n: [0, 0, 1] as Vec3 };
    const lines = { u: axisStations([0, 1.24, 5], 1.2), v: axisStations([0, 2.5], 1.2) };
    const left = rectGrid({ frame, outer: plate(0, 1.24), holes: [], a: 1.2, b: 1.2, element: 'quad', maxCells: 1000, lines })!;
    const right = rectGrid({ frame, outer: plate(1.24, 5), holes: [], a: 1.2, b: 1.2, element: 'quad', maxCells: 1000, lines })!;
    const on = (g: NonNullable<typeof left>, x: number) => g.points.filter((p) => Math.abs(p[0] - x) < 1e-9).map((p) => p[1]).sort((a, b) => a - b);
    expect(on(left, 1.24)).toEqual(on(right, 1.24));
    const own = rectGrid({ frame, outer: plate(0, 1.24), holes: [], a: 1.2, b: 0.6, element: 'quad', maxCells: 1000 })!;
    expect(on(own, 1.24)).not.toEqual(on(right, 1.24));
  });
});
