/**
 * The section figure, checked against the arithmetic it sits beside.
 *
 * The point of the drawing is that it agrees with `composeBuiltUp`. Both read the same
 * placement table, so the test that matters is the one that would catch them diverging: the
 * outline's overall width and depth must equal the assembly's, to the millimetre, for every
 * arrangement — because if the picture shows the parts further apart than the properties
 * assumed, one of them is wrong and a user cannot tell which.
 */

import { describe, it, expect } from 'vitest';
import {
  buildSectionOutline, outlineExtentMm, outlineUnavailableKey, _clearOutlineCache,
  OUTLINE_UNAVAILABLE_REASONS,
} from '../section-outline';
import { BUILT_UP_ARRANGEMENTS, ARRANGEMENTS, composeBuiltUp } from '../built-up-section';
import { resolveProfile, availableArrangements } from '../profile-resolve';

const CHANNEL = 'UPN 100';
const ANGLE = 'L 50x50x5';
const IBEAM = 'IPE 200';
const TUBE = 'RHS 100x50x2';

describe('the figure exists for a catalogued profile', () => {
  it.each([CHANNEL, ANGLE, IBEAM])('draws %s', (name) => {
    const o = buildSectionOutline({ profileName: name, arrangement: 'single', gapMm: 0, rotationDeg: 'auto' });
    expect(o.unavailable).toBeUndefined();
    expect(o.polygons.length).toBeGreaterThan(0);
    expect(o.count).toBe(1);
    for (const p of o.polygons) expect(p.vertices.length).toBeGreaterThan(2);
  });

  it('fits its own polygons inside the viewBox, with margin', () => {
    const o = buildSectionOutline({ profileName: CHANNEL, arrangement: 'single', gapMm: 0, rotationDeg: 'auto' });
    for (const p of o.polygons) {
      for (const [y, z] of p.vertices) {
        expect(y).toBeGreaterThan(o.viewBox.x);
        expect(y).toBeLessThan(o.viewBox.x + o.viewBox.w);
        expect(z).toBeGreaterThan(o.viewBox.y);
        expect(z).toBeLessThan(o.viewBox.y + o.viewBox.h);
      }
    }
  });

  it('reports the real outside dimensions of the profile', () => {
    // IPE 200: 200 mm deep, 100 mm wide, published.
    const mm = outlineExtentMm(
      buildSectionOutline({ profileName: IBEAM, arrangement: 'single', gapMm: 0, rotationDeg: 'auto' }),
    );
    expect(mm.heightMm).toBe(200);
    expect(mm.widthMm).toBe(100);
  });
});

describe('the drawing and the properties come from one description', () => {
  /**
   * The invariant that makes the figure trustworthy.
   *
   * `composeBuiltUp` reports `b` and `h` from the placed extents; the outline is the placed
   * polygons. Equal to the millimetre for every arrangement, or the picture and the numbers
   * disagree about where the parts are.
   */
  it.each(BUILT_UP_ARRANGEMENTS)('%s: outline extent equals the assembly extent', (arrangement) => {
    const resolved = resolveProfile(ANGLE)!;
    if (!availableArrangements(resolved).includes(arrangement)) return;
    const gapMm = 8;
    const built = composeBuiltUp(resolved.profile, arrangement, gapMm / 1000);
    const mm = outlineExtentMm(buildSectionOutline({
      profileName: ANGLE, arrangement, gapMm, rotationDeg: 'auto',
    }));
    expect(mm.widthMm).toBe(Math.round(built.b * 1000));
    expect(mm.heightMm).toBe(Math.round(built.h * 1000));
  });

  it.each(BUILT_UP_ARRANGEMENTS)('%s: draws one copy per profile in the assembly', (arrangement) => {
    const resolved = resolveProfile(CHANNEL)!;
    if (!availableArrangements(resolved).includes(arrangement)) return;
    const o = buildSectionOutline({ profileName: CHANNEL, arrangement, gapMm: 6, rotationDeg: 'auto' });
    expect(o.count).toBe(ARRANGEMENTS[arrangement].count);
    expect(o.polygons.length).toBe(resolved.polygons.length * ARRANGEMENTS[arrangement].count);
  });
});

describe('the arrangement is visible, which is the whole point', () => {
  it('back to back and toe to toe are different pictures at the same overall width', () => {
    const opts = { profileName: CHANNEL, gapMm: 8, rotationDeg: 'auto' as const };
    const back = buildSectionOutline({ ...opts, arrangement: 'doubleBack' });
    const facing = buildSectionOutline({ ...opts, arrangement: 'doubleFacing' });

    /*
     * The overall width comes out the SAME for both — 108 mm for a UPN 100 at an 8 mm gap.
     * That is not a coincidence and not a defect: back to back puts the two webs `gap`
     * apart and the toes outward, toe to toe does the reverse, and either way the outer
     * faces end up separated by the same `2·b + gap`.
     *
     * Which is exactly why the figure has to be a drawing. The distinction between `][` and
     * `[]` is WHICH faces meet, and no overall dimension can express it — while the weak-axis
     * inertia, which is what the choice is actually for, differs a great deal
     * (`built-up-section.test.ts` pins that).
     */
    expect(outlineExtentMm(facing)).toEqual(outlineExtentMm(back));

    const flat = (o: typeof back) => o.polygons
      .flatMap((p) => p.vertices.map(([y, z]) => `${y.toFixed(6)},${z.toFixed(6)}`)).sort();
    expect(flat(facing)).not.toEqual(flat(back));
  });

  it('the gap changes the figure, and only in the direction it separates', () => {
    const tight = outlineExtentMm(buildSectionOutline({
      profileName: CHANNEL, arrangement: 'doubleBack', gapMm: 0, rotationDeg: 'auto',
    }));
    const loose = outlineExtentMm(buildSectionOutline({
      profileName: CHANNEL, arrangement: 'doubleBack', gapMm: 30, rotationDeg: 'auto',
    }));
    expect(loose.widthMm).toBe(tight.widthMm + 30);
    expect(loose.heightMm).toBe(tight.heightMm);
  });

  it('a four-profile box grows in both directions', () => {
    const one = outlineExtentMm(buildSectionOutline({
      profileName: ANGLE, arrangement: 'single', gapMm: 0, rotationDeg: 'auto',
    }));
    const four = outlineExtentMm(buildSectionOutline({
      profileName: ANGLE, arrangement: 'quadBox', gapMm: 10, rotationDeg: 'auto',
    }));
    expect(four.widthMm).toBeGreaterThan(one.widthMm);
    expect(four.heightMm).toBeGreaterThan(one.heightMm);
  });
});

describe('rotation turns the figure', () => {
  it('90° swaps the outside dimensions', () => {
    const upright = outlineExtentMm(buildSectionOutline({
      profileName: IBEAM, arrangement: 'single', gapMm: 0, rotationDeg: 0,
    }));
    const turned = outlineExtentMm(buildSectionOutline({
      profileName: IBEAM, arrangement: 'single', gapMm: 0, rotationDeg: 90,
    }));
    expect(turned.widthMm).toBe(upright.heightMm);
    expect(turned.heightMm).toBe(upright.widthMm);
  });

  it('180° keeps the dimensions but moves the material', () => {
    const a = buildSectionOutline({ profileName: CHANNEL, arrangement: 'single', gapMm: 0, rotationDeg: 0 });
    const b = buildSectionOutline({ profileName: CHANNEL, arrangement: 'single', gapMm: 0, rotationDeg: 180 });
    expect(outlineExtentMm(b)).toEqual(outlineExtentMm(a));
    // A channel is asymmetric about its vertical axis, so turning it round has to move
    // vertices — otherwise the rotation control would be doing nothing visible.
    const flat = (o: typeof a) => o.polygons.flatMap((p) => p.vertices.map(([y, z]) => `${y.toFixed(6)},${z.toFixed(6)}`)).sort();
    expect(flat(b)).not.toEqual(flat(a));
  });

  it("'auto' draws unrotated, since only the generator knows the real angle", () => {
    const auto = buildSectionOutline({ profileName: CHANNEL, arrangement: 'single', gapMm: 0, rotationDeg: 'auto' });
    const zero = buildSectionOutline({ profileName: CHANNEL, arrangement: 'single', gapMm: 0, rotationDeg: 0 });
    expect(auto.polygons).toEqual(zero.polygons);
  });
});

describe('holes are drawn as holes', () => {
  it('a hollow section carries a void polygon', () => {
    const o = buildSectionOutline({ profileName: TUBE, arrangement: 'single', gapMm: 0, rotationDeg: 'auto' });
    if (o.unavailable) return; // family may be properties-only in this catalogue
    expect(o.polygons.some((p) => p.isVoid)).toBe(true);
    expect(o.polygons.some((p) => !p.isVoid)).toBe(true);
  });
});

describe('nothing is invented when there is nothing to draw', () => {
  it('refuses an unknown profile with a reason', () => {
    const o = buildSectionOutline({ profileName: 'IPE 999', arrangement: 'single', gapMm: 0, rotationDeg: 'auto' });
    expect(o.unavailable).toBe('unknownProfile');
    expect(o.polygons).toEqual([]);
    expect(outlineUnavailableKey(o.unavailable!)).toBe('generator.outline.unknownProfile');
  });

  it('draws no plausible box for a properties-only family', () => {
    // MC has no fittable outline. A rectangle here would be inventing geometry the app has
    // just finished declining to claim.
    const resolved = resolveProfile('MC18x58');
    if (!resolved) return;
    const o = buildSectionOutline({ profileName: 'MC18x58', arrangement: 'single', gapMm: 0, rotationDeg: 'auto' });
    expect(o.unavailable).toBe('noGeometry');
    expect(o.polygons).toEqual([]);
  });

  it('refuses an arrangement the profile cannot be built into', () => {
    const resolved = resolveProfile('MC18x58');
    if (!resolved) return;
    const o = buildSectionOutline({ profileName: 'MC18x58', arrangement: 'doubleBack', gapMm: 8, rotationDeg: 'auto' });
    // `noGeometry` is checked first and is the stronger reason: there is nothing to draw
    // either way.
    expect(o.unavailable).toBeTruthy();
    expect(o.polygons).toEqual([]);
  });

  it('never returns a zero-sized viewBox, even with nothing in it', () => {
    const o = buildSectionOutline({ profileName: 'nope', arrangement: 'single', gapMm: 0, rotationDeg: 'auto' });
    expect(o.viewBox.w).toBeGreaterThan(0);
    expect(o.viewBox.h).toBeGreaterThan(0);
  });

  it('treats a negative gap as none rather than overlapping the parts', () => {
    const neg = outlineExtentMm(buildSectionOutline({
      profileName: CHANNEL, arrangement: 'doubleBack', gapMm: -20, rotationDeg: 'auto',
    }));
    const zero = outlineExtentMm(buildSectionOutline({
      profileName: CHANNEL, arrangement: 'doubleBack', gapMm: 0, rotationDeg: 'auto',
    }));
    expect(neg).toEqual(zero);
  });
});

describe('the outline is memoised, because the 3-D viewport asks per element', () => {
  /**
   * The property that makes switching a 625-member shed into extruded-section mode cheap.
   *
   * Every miss reaches the WASM geometry engine through `resolveProfile`. Identity of the
   * returned object is the observable: a memo hands back the same object, a recompute cannot.
   */
  it('returns the identical object for identical inputs', () => {
    _clearOutlineCache();
    const opts = { profileName: 'UPN 100', arrangement: 'doubleBack' as const, gapMm: 8, rotationDeg: 'auto' as const };
    const first = buildSectionOutline(opts);
    const second = buildSectionOutline({ ...opts });
    expect(second).toBe(first);
  });

  it('does not confuse two different requests', () => {
    _clearOutlineCache();
    const base = { profileName: 'UPN 100', arrangement: 'doubleBack' as const, rotationDeg: 'auto' as const };
    const a = buildSectionOutline({ ...base, gapMm: 0 });
    const b = buildSectionOutline({ ...base, gapMm: 20 });
    expect(b).not.toBe(a);
    expect(outlineExtentMm(b).widthMm).toBe(outlineExtentMm(a).widthMm + 20);

    // Rotation and arrangement are part of the key too.
    expect(buildSectionOutline({ ...base, gapMm: 0, rotationDeg: 90 })).not.toBe(a);
    expect(buildSectionOutline({ ...base, arrangement: 'doubleFacing', gapMm: 0 })).not.toBe(a);
  });

  it('treats a negative gap as the same request as none, since it is clamped', () => {
    _clearOutlineCache();
    const base = { profileName: 'UPN 100', arrangement: 'doubleBack' as const, rotationDeg: 'auto' as const };
    expect(buildSectionOutline({ ...base, gapMm: -5 })).toBe(buildSectionOutline({ ...base, gapMm: 0 }));
  });
});

describe('every refusal reason has a key, and the list is exhaustive', () => {
  it('maps each reason to its own key', () => {
    const keys = OUTLINE_UNAVAILABLE_REASONS.map(outlineUnavailableKey);
    expect(new Set(keys).size).toBe(OUTLINE_UNAVAILABLE_REASONS.length);
    for (const k of keys) expect(k).toMatch(/^generator\.outline\./);
  });
});
