import { describe, it, expect } from 'vitest';
import { boundaryLoops, loopArea } from '../mesh-boundary';

/** A 3 × 3 grid of unit squares; node (i, j) is i + 4·j. */
function grid(skip: Array<[number, number]> = []) {
  const at = (n: number) => ({ x: n % 4, y: Math.floor(n / 4) });
  const faces: number[][] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    if (skip.some(([a, b]) => a === i && b === j)) continue;
    const n = i + 4 * j;
    faces.push(j % 2 ? [n, n + 4, n + 5, n + 1] : [n, n + 1, n + 5, n + 4]); // mixed winding on purpose
  }
  return { faces, at };
}

describe('the outline of a mesh', () => {
  it('is the square around a full grid, its straight runs reduced to the corners', () => {
    const { faces, at } = grid();
    const loops = boundaryLoops(faces, at);
    expect(loops).toHaveLength(1);
    expect(Math.abs(loopArea(loops[0]!))).toBeCloseTo(9, 9);
    expect(loops[0]).toHaveLength(4);
  });

  it('keeps an opening as a loop of its own, after the outline', () => {
    const { faces, at } = grid([[1, 1]]);
    const loops = boundaryLoops(faces, at);
    expect(loops.map((l) => Math.abs(loopArea(l)))).toEqual([9, 1]);
  });

  it('follows a notch rather than spanning it', () => {
    const { faces, at } = grid([[2, 2]]);
    const loops = boundaryLoops(faces, at);
    expect(loops).toHaveLength(1);
    expect(Math.abs(loopArea(loops[0]!))).toBeCloseTo(8, 9);
    expect(loops[0]).toHaveLength(6);
  });
});
