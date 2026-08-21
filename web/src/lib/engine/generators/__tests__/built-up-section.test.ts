/**
 * Built-up sections, checked against arithmetic that admits no argument.
 *
 * The composition is the parallel-axis theorem, so the tests are the theorem's own
 * identities rather than numbers copied out of the implementation:
 *
 *   · composing ONE profile must return that profile, exactly;
 *   · every arrangement must land its centroid on the origin;
 *   · a back-to-back pair's weak-axis inertia must equal 2(I + A·d²) for the d the
 *     arrangement claims — computed here from the extents, not read from the code;
 *   · reflections must flip the product of inertia, and rotations must not;
 *   · a closed arrangement must report no torsional constant, whatever the parts have.
 */

import { describe, it, expect } from 'vitest';
import {
  ARRANGEMENTS, BUILT_UP_ARRANGEMENTS, composeBuiltUp, isClosedArrangement,
  type BuiltUpArrangement, type SingleProfile,
} from '../built-up-section';

/**
 * A channel-like profile: asymmetric in y, symmetric in z.
 *
 * Deliberately NOT symmetric about the vertical axis — the centroid sits 20 mm from one
 * face and 60 mm from the other — because every placement bug in this module is invisible
 * on a doubly-symmetric section and shows up immediately on this one.
 */
const CHANNEL: SingleProfile = {
  name: 'U 100x40x2',
  a: 3.6e-4,
  iy: 5.4e-7,
  iz: 6.8e-8,
  iyz: 0,
  extent: { yMin: -0.02, yMax: 0.06, zMin: -0.05, zMax: 0.05 },
  j: 4.8e-9,
};

/** An angle: asymmetric in BOTH axes and with a non-zero product of inertia. */
const ANGLE: SingleProfile = {
  name: 'L 75x75x6',
  a: 8.66e-4,
  iy: 4.5e-7,
  iz: 4.5e-7,
  iyz: -2.66e-7,
  extent: { yMin: -0.0209, yMax: 0.0541, zMin: -0.0209, zMax: 0.0541 },
  j: 1.04e-8,
};

const NO_J: SingleProfile = { ...CHANNEL, j: null };

describe('composeBuiltUp — the single-profile identity', () => {
  it('returns the profile unchanged when there is only one of it', () => {
    for (const p of [CHANNEL, ANGLE]) {
      const s = composeBuiltUp(p, 'single', 0);
      expect(s.a).toBeCloseTo(p.a, 15);
      expect(s.iy).toBeCloseTo(p.iy, 15);
      expect(s.iz).toBeCloseTo(p.iz, 15);
      expect(s.iyz).toBeCloseTo(p.iyz, 15);
      expect(s.j).toBe(p.j);
      expect(s.jBasis).toBe('singleProfile');
      expect(s.name).toBe(p.name);
      expect(s.count).toBe(1);
    }
  });

  it('keeps the extents, so the bounding box of one profile is its own', () => {
    const s = composeBuiltUp(CHANNEL, 'single', 0);
    expect(s.b).toBeCloseTo(CHANNEL.extent.yMax - CHANNEL.extent.yMin, 12);
    expect(s.h).toBeCloseTo(CHANNEL.extent.zMax - CHANNEL.extent.zMin, 12);
  });
});

describe('composeBuiltUp — every arrangement is centred', () => {
  /**
   * The centroid has to land on the origin for every entry in the table.
   *
   * Recomputed here from the placements rather than trusted, because `composeBuiltUp`
   * divides by that same centroid: an arrangement that is off-centre would produce
   * parallel-axis distances measured from the wrong place and still look plausible.
   */
  it.each(BUILT_UP_ARRANGEMENTS)('%s puts the assembly centroid at the origin', (id) => {
    for (const profile of [CHANNEL, ANGLE]) {
      const places = ARRANGEMENTS[id].place(profile.extent, 0.008);
      const sy = places.reduce((t, p) => t + p.dy, 0) / places.length;
      const sz = places.reduce((t, p) => t + p.dz, 0) / places.length;
      expect(sy).toBeCloseTo(0, 12);
      expect(sz).toBeCloseTo(0, 12);
    }
  });

  it.each(BUILT_UP_ARRANGEMENTS)('%s produces the declared number of profiles', (id) => {
    const s = composeBuiltUp(CHANNEL, id, 0.008);
    expect(s.count).toBe(ARRANGEMENTS[id].count);
    expect(s.a).toBeCloseTo(CHANNEL.a * ARRANGEMENTS[id].count, 15);
  });
});

describe('composeBuiltUp — parallel axis, checked against the theorem', () => {
  it('a back-to-back pair gains exactly 2·A·d² about the vertical axis', () => {
    const gap = 0.008;
    const s = composeBuiltUp(CHANNEL, 'doubleBack', gap);
    // The arrangement puts the two yMin faces `gap` apart, so each centroid sits
    // (gap/2 − yMin) from the assembly axis. Derived from the stated geometry, not read
    // out of the implementation.
    const d = gap / 2 - CHANNEL.extent.yMin;
    expect(s.iz).toBeCloseTo(2 * (CHANNEL.iz + CHANNEL.a * d * d), 15);
    // Nothing moved in z, so the strong axis is simply doubled.
    expect(s.iy).toBeCloseTo(2 * CHANNEL.iy, 15);
  });

  it('a wider gap always increases the weak axis and never the strong one', () => {
    const tight = composeBuiltUp(CHANNEL, 'doubleBack', 0);
    const loose = composeBuiltUp(CHANNEL, 'doubleBack', 0.05);
    expect(loose.iz).toBeGreaterThan(tight.iz);
    expect(loose.iy).toBeCloseTo(tight.iy, 15);
    expect(loose.a).toBeCloseTo(tight.a, 15);
  });

  it('the box arrangement separates further than the back-to-back one', () => {
    // Toe to toe puts the far faces together, so for a channel whose centroid is near the
    // web the two parts end up further apart than back to back — and therefore stiffer.
    const back = composeBuiltUp(CHANNEL, 'doubleBack', 0.008);
    const box = composeBuiltUp(CHANNEL, 'doubleFacing', 0.008);
    expect(box.iz).toBeGreaterThan(back.iz);
  });

  it('the four-profile arrangements are stiffer than the two-profile ones', () => {
    const two = composeBuiltUp(ANGLE, 'doubleBack', 0.008);
    const four = composeBuiltUp(ANGLE, 'quadBack', 0.008);
    expect(four.a).toBeCloseTo(2 * two.a, 15);
    expect(four.iy).toBeGreaterThan(two.iy);
  });
});

describe('composeBuiltUp — the product of inertia and its sign', () => {
  it('a mirrored pair cancels Iyz, because a reflection reverses it', () => {
    // Back-to-back mirrors one copy about the vertical axis. The two products of inertia
    // are then equal and opposite, and the placement contributes nothing because both
    // copies sit on z = 0. So the pair is symmetric and Iyz must vanish exactly.
    const s = composeBuiltUp(ANGLE, 'doubleBack', 0.008);
    expect(s.iyz).toBeCloseTo(0, 15);
  });

  it('an unmirrored pair keeps Iyz, doubled', () => {
    const s = composeBuiltUp(ANGLE, 'doubleParallel', 0.008);
    expect(s.iyz).toBeCloseTo(2 * ANGLE.iyz, 15);
  });

  it('the crossed pair is a rotation, so Iyz survives rather than cancelling', () => {
    // Mirrored about BOTH axes is a 180° rotation: (−1)·(−1) = +1. Getting this wrong
    // would report a section whose principal axes are level when they are not.
    const s = composeBuiltUp(ANGLE, 'doubleX', 0.008);
    const dy = (0.008 + (ANGLE.extent.yMax - ANGLE.extent.yMin)) / 2;
    const dz = (0.008 + (ANGLE.extent.zMax - ANGLE.extent.zMin)) / 2;
    expect(s.iyz).toBeCloseTo(2 * ANGLE.iyz + 2 * ANGLE.a * dy * dz, 15);
  });
});

describe('composeBuiltUp — torsion is never invented', () => {
  const CLOSED: BuiltUpArrangement[] = BUILT_UP_ARRANGEMENTS.filter(isClosedArrangement);
  const OPEN: BuiltUpArrangement[] = BUILT_UP_ARRANGEMENTS
    .filter((a) => !isClosedArrangement(a) && ARRANGEMENTS[a].count > 1);

  it('the table declares at least one closed and one open multi-profile arrangement', () => {
    // Otherwise the two suites below would pass vacuously.
    expect(CLOSED.length).toBeGreaterThan(0);
    expect(OPEN.length).toBeGreaterThan(0);
  });

  it.each(CLOSED)('%s reports no J, because Bredt governs and Am is not known', (id) => {
    const s = composeBuiltUp(CHANNEL, id, 0.008);
    expect(s.j).toBeNull();
    expect(s.jBasis).toBe('closedCellNotComputed');
  });

  it.each(OPEN)('%s sums the open parts, and says that is what it did', (id) => {
    const s = composeBuiltUp(CHANNEL, id, 0.008);
    expect(s.j).toBeCloseTo(CHANNEL.j! * ARRANGEMENTS[id].count, 18);
    expect(s.jBasis).toBe('sumOfOpenParts');
  });

  it('a profile with no published J cannot yield an assembly with one', () => {
    for (const id of BUILT_UP_ARRANGEMENTS) {
      const s = composeBuiltUp(NO_J, id, 0.008);
      expect(s.j).toBeNull();
      // A closed cell is the stronger reason and wins the label: even a part WITH a J
      // could not have been summed there.
      expect(s.jBasis).toBe(isClosedArrangement(id) && ARRANGEMENTS[id].count > 1
        ? 'closedCellNotComputed'
        : 'partHasNoJ');
    }
  });
});

describe('composeBuiltUp — the name carries the composition', () => {
  it('names a pair by count, profile, glyph and gap', () => {
    expect(composeBuiltUp(ANGLE, 'doubleBack', 0.008).name).toBe('2x L 75x75x6 ][ (h=8mm)');
  });

  it('omits a zero gap rather than writing "(h=0mm)"', () => {
    expect(composeBuiltUp(ANGLE, 'doubleBack', 0).name).toBe('2x L 75x75x6 ][');
  });

  it('leaves a single profile named as itself', () => {
    expect(composeBuiltUp(ANGLE, 'single', 0.008).name).toBe('L 75x75x6');
  });
});

describe('composeBuiltUp — the bounding box grows with the gap', () => {
  it('a back-to-back pair is wider than one profile and no taller', () => {
    const one = composeBuiltUp(CHANNEL, 'single', 0);
    const two = composeBuiltUp(CHANNEL, 'doubleBack', 0.01);
    expect(two.b).toBeGreaterThan(one.b);
    expect(two.h).toBeCloseTo(one.h, 12);
  });

  it('a boxed quadruple is wider AND taller than one profile', () => {
    const one = composeBuiltUp(ANGLE, 'single', 0);
    const four = composeBuiltUp(ANGLE, 'quadBox', 0.01);
    expect(four.b).toBeGreaterThan(one.b);
    expect(four.h).toBeGreaterThan(one.h);
  });

  it('a negative gap is treated as no gap rather than overlapping the parts', () => {
    const s = composeBuiltUp(CHANNEL, 'doubleBack', -0.05);
    expect(s.gap).toBe(0);
    expect(s.iz).toBeCloseTo(composeBuiltUp(CHANNEL, 'doubleBack', 0).iz, 15);
  });
});
