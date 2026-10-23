import { expect, it } from 'vitest';
import { buildColumnTieSet, setSpread, type StirrupSetInput } from '../../../codes/cirsoc201/transverse-cage';
import { samplePath } from '../../../codes/cirsoc201/bar-geometry';
import { generateColumnCandidates } from '../column-candidates';
import { minSurfaceClearance, COLLISION_CHORD_TOLERANCE } from '../collision';

it.each([6, 8, 10])('reserves the closing tails before placing crossties, Ø%s', diameter => {
  const layout = generateColumnCandidates({ count: 28, diameterMm: 12, b: 0.5, h: 0.5,
    cover: 0.025, tieDiaMm: diameter, edition: '2025', maxAggregateSizeMm: 19, placementTolerance: 0 });
  expect(layout.length).toBeGreaterThan(0);
  for (const hookOrientation of ['a', 'b'] as const) for (const rotated of [false, true]) {
    const input: StirrupSetInput = { elementId: 1, zoneId: 'column', station: 0, b: 0.5, h: 0.5,
      cover: 0.025, stirrupDiaMm: diameter, legs: 2, maxAggregateSizeMm: 19, hookOrientation,
      longitudinalBars: layout[0].slots.map((p, i) => ({ id: `b${i}`, across: p.dx, up: p.dy, diameterMm: 12 })),
      origin: { x: 10, y: 20, z: 30 }, axis: rotated ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 },
      across: { x: 0, y: 1, z: 0 }, up: rotated ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 },
    };
    const result = buildColumnTieSet(input);
    expect(result.unsupported).toEqual([]);
    expect(result.pieces.length).toBeGreaterThan(5);
    for (let i = 0; i < result.pieces.length; i++) {
      const a = result.pieces[i];
      expect(a.cornerContainment.every(c => c.longitudinalBarId !== null)).toBe(true);
      for (let j = i + 1; j < result.pieces.length; j++) expect(
        minSurfaceClearance(a.path, result.pieces[j].path).clearance,
        `${a.path.id}/${result.pieces[j].path.id}`,
      ).toBeGreaterThanOrEqual(-COLLISION_CHORD_TOLERANCE - 1e-9);
      // Read the full fabricated geometry, including both closing tails.
      for (const p of samplePath(a.path)) {
        const axial = (p.x - input.origin.x) * input.axis.x + (p.y - input.origin.y) * input.axis.y
          + (p.z - input.origin.z) * input.axis.z;
        expect(Math.abs(axial)).toBeLessThanOrEqual(setSpread(result.pieces.length, diameter) / 2 + 1e-9);
      }
    }
    const next = buildColumnTieSet({ ...input, station: 0.15 });
    result.pieces.forEach((piece, i) => {
      const a = piece.path.segments[0].start, b = next.pieces[i].path.segments[0].start;
      expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)).toBeCloseTo(0.15, 10);
    });
  }
});
