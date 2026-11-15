import { describe, expect, it } from 'vitest';
import { samplePath, type BarPath, type BarSegment, type Point3 } from '../../../codes/cirsoc201/bar-geometry';

const straight: BarSegment = {
  kind: 'straight', start: { x: 1, y: 2, z: 3 }, end: { x: 4, y: 6, z: 8 }, length: 0,
};
const arc: BarSegment = {
  kind: 'arc', start: { x: 1, y: 0, z: 2 }, end: { x: 0, y: 1, z: 2 },
  centre: { x: 0, y: 0, z: 2 }, radius: 1, sweepDeg: 90, length: 0,
};

function observed(segments: BarSegment[]) {
  let reads = 0;
  const point = (p: Point3) => new Proxy(p, {
    get(target, key, receiver) {
      if (key === 'x' || key === 'y' || key === 'z') reads += 1;
      return Reflect.get(target, key, receiver);
    },
  });
  const input = segments.map(s => ({
    ...s, start: point(s.start), end: point(s.end), ...(s.centre ? { centre: point(s.centre) } : {}),
  }));
  return { path: { segments: input } as BarPath, reads: () => reads };
}

describe('bar sampling detaches reactive coordinates (#2163)', () => {
  it.each([
    ['straight', [straight]],
    ['arc', [arc]],
    ['reflex arc', [{ ...arc, sweepDeg: 270 }]],
    ['arc without centre', [{ ...arc, centre: undefined }]],
    ['collinear arc', [{ ...arc, end: { x: -1, y: 0, z: 2 }, sweepDeg: 180 }]],
    ['mixed path', [straight, arc, straight]],
    ['empty path', []],
  ] as Array<[string, BarSegment[]]>)('%s leaves no reactive coordinates for later projection passes', (_, segments) => {
    const input = observed(segments);
    const expected = samplePath({ segments } as BarPath);
    const sampled = samplePath(input.path);
    const reads = input.reads();
    expect(sampled).toEqual(expected);
    for (const p of sampled) expect(Object.values(p).every(Number.isFinite)).toBe(true);
    expect(input.reads()).toBe(reads);
  });

  it.each([0.005, 0.0005])('reads each source coordinate once at chord tolerance %s', tolerance => {
    const input = observed([arc]);
    const sampled = samplePath(input.path, tolerance);
    expect(sampled.length).toBeGreaterThan(2);
    expect(input.reads()).toBeLessThanOrEqual(9);
    expect(sampled[0]).toEqual(arc.start);
  });
});
