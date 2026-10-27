import { expect, it } from 'vitest';
import { arcSegment, straightSegment, type BarPath } from '../../../codes/cirsoc201/bar-geometry';
import { columnStirrupClearanceInset } from '../column-stirrup-clearance';

type Steel = Pick<BarPath, 'role' | 'diameterMm' | 'segments'>;
const bar = (y: number, low = 0, high = 3.2): Steel => ({ role: 'longitudinal', diameterMm: 20,
  segments: [straightSegment({ x: 0, y, z: low }, { x: 0, y, z: high })] });
const input = { bars: [bar(0.257)], origin: { x: 0, y: 0, z: 3 }, axis: { x: 0, y: 1, z: 0 },
  beamHeight: 0.55, supportFace: 0.275, clear: 0.04, stirrupDiaMm: 6 };

it('reserves the larger column face, including both the closing tail and bar surfaces', () => {
  const inset = columnStirrupClearanceInset(input);
  expect(inset).toBeCloseTo(0.038, 12);
  // The nearest tie surface, independently measured along the beam, is 40 mm clear.
  const tieSurface = input.supportFace + inset - 0.003 - 0.003;
  expect(tieSurface - (0.257 + 0.010)).toBeCloseTo(0.04, 12);
});

it('uses the directed beam end and the actual inserted cage, not global coordinates or a centred assumption', () => {
  expect(columnStirrupClearanceInset({ ...input, origin: { x: 0, y: 5, z: 3 },
    axis: { x: 0, y: -1, z: 0 }, bars: [bar(5 - 0.257)] })).toBeCloseTo(0.038, 12);
  expect(columnStirrupClearanceInset({ ...input, bars: [bar(0.307)] })).toBeCloseTo(0.088, 12);
});

it('ignores steel outside the beam height and transverse steel', () => {
  expect(columnStirrupClearanceInset({ ...input, bars: [bar(2, 0, 2)] })).toBe(0);
  expect(columnStirrupClearanceInset({ ...input, bars: [{ ...bar(2), role: 'transverse' }] })).toBe(0);
  expect(columnStirrupClearanceInset({ ...input, bars: [] })).toBe(0);
});

it('clips a crank at the beam height instead of using an unrelated remote end', () => {
  const crank: Steel = { role: 'longitudinal', diameterMm: 20,
    segments: [straightSegment({ x: 0, y: 0, z: 2 }, { x: 0, y: 1, z: 4 })] };
  const inset = columnStirrupClearanceInset({ ...input, bars: [crank], beamHeight: 0.4 });
  expect(inset).toBeGreaterThan(0.38);
  expect(inset).toBeLessThan(0.40);
});

it('bounds curved steel between its endpoints without consuming the specified clearance', () => {
  const angle = 67.5 * Math.PI / 180, r = 0.1;
  const arc = arcSegment({ x: r * Math.cos(angle), y: -r * Math.sin(angle), z: 3 },
    { x: r * Math.cos(angle), y: r * Math.sin(angle), z: 3 }, r, 135, { x: 0, y: 0, z: 3 });
  const inset = columnStirrupClearanceInset({ ...input, supportFace: 0, axis: { x: 1, y: 0, z: 0 },
    bars: [{ role: 'longitudinal', diameterMm: 20, segments: [arc] }] });
  expect(inset).toBeGreaterThanOrEqual(0.156 - 1e-12);
  expect(inset).toBeLessThanOrEqual(0.1565 + 1e-12);
});
