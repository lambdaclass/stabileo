/**
 * The starters draw the sections their names give, measured to the outer faces.
 *
 * Both thin-walled starters are polylines on the wall's centreline, and a polyline ends square at
 * its last point. Stopping each leg t/2 short of the nominal size left the angles 71 mm and the
 * lipped channel 76 mm wide.
 */
import { describe, it, expect } from 'vitest';
import { starterParts } from '../drawn-starters';
import { partOutline, bboxOf, areaOf } from '../drawn';
import { catalogueOutline } from '../canonical';

const outline = (id: Parameters<typeof starterParts>[0]) =>
  starterParts(id, catalogueOutline).map((p) => partOutline(p, catalogueOutline)!);

describe('starter dimensions', () => {
  it('each angle of the double angle is 75 × 75 × 8 with the gusset gap between the backs', () => {
    const [right, left] = outline('doubleAngle');
    const [y0, z0, y1, z1] = bboxOf(right);
    expect(y0).toBeCloseTo(0.005, 9);
    expect(y1 - y0).toBeCloseTo(0.075, 9);
    expect(z1 - z0).toBeCloseTo(0.075, 9);
    // Two legs of 75 × 8 sharing an 8 × 8 corner.
    expect(areaOf(right)).toBeCloseTo(2 * 0.075 * 0.008 - 0.008 ** 2, 9);
    expect(bboxOf(left)[2]).toBeCloseTo(-0.005, 9);
  });

  it('the lipped channel is 200 × 75 × 20 × 2 to its outer faces', () => {
    const [c] = outline('lippedC');
    const [y0, z0, y1, z1] = bboxOf(c);
    expect(y1 - y0).toBeCloseTo(0.075, 9);
    expect(z1 - z0).toBeCloseTo(0.2, 9);
    // Web, two flanges and two lips, each corner counted once.
    const t = 0.002;
    expect(areaOf(c)).toBeCloseTo(t * (0.2 + 2 * 0.075 + 2 * 0.02 - 4 * t), 9);
  });
});
