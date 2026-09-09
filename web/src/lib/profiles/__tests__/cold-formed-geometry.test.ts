/**
 * The geometry of a cold-formed C and Z, checked against something other than itself.
 *
 * A module that derives its own numbers can only be trusted if the derivation is verified from
 * outside it. Three independent checks do that here, and they are the reason this file exists
 * rather than a set of frozen expected values:
 *
 *   1. **The C is checked against code this module did not write.** `computeSectionProperties`'
 *      `C-custom` case already decomposes a lipped channel, and feeding it one thickness in all
 *      three slots must reproduce this module's C exactly. If the decomposition here is wrong,
 *      it disagrees with the app's own.
 *   2. **The Z is checked against the C.** Flipping the bottom flange and lip horizontally
 *      changes nothing about their VERTICAL positions, so a Z and a C of the same four
 *      dimensions have the same second moment about the horizontal axis. That single identity
 *      pins the part of the Z derivation most likely to be got wrong, using a value the previous
 *      check already tied to external code.
 *   3. **The principal axes are checked by rotating the tensor**, not by re-deriving the
 *      formula. A sign error in `atan2` survives any amount of re-reading and dies immediately
 *      to "rotate by θ and see whether the product is actually zero".
 *
 * The invariants (trace, determinant) are asserted too: they hold for any correct tensor and no
 * incorrect one, and they do not depend on the sign convention.
 */

import { describe, it, expect } from 'vitest';
import {
  coldFormedGeometry, validateColdFormed,
  parseColdFormedDesignation, formatColdFormedDesignation,
  type ColdFormedSpec,
} from '../cold-formed';
import { computeSectionProperties } from '../../data/section-shapes';

/** A representative lipped channel: the size a purlin or a light truss chord is drawn at. */
const C_100: ColdFormedSpec = { shape: 'C', hMm: 100, bMm: 50, cMm: 15, tMm: 2 };
const Z_100: ColdFormedSpec = { ...C_100, shape: 'Z' };

/** The same four dimensions across a range, so nothing below rests on one lucky size. */
const GRID: ColdFormedSpec[] = [];
for (const h of [80, 100, 150, 200, 250]) {
  for (const b of [40, 50, 60, 75]) {
    for (const c of [12, 15, 20]) {
      for (const t of [1.5, 2, 2.5, 3]) {
        for (const shape of ['C', 'Z'] as const) {
          const spec = { shape, hMm: h, bMm: b, cMm: c, tMm: t };
          if (validateColdFormed(spec).ok) GRID.push(spec);
        }
      }
    }
  }
}

describe('the C, against the app’s own lipped-channel decomposition', () => {
  it('reproduces `computeSectionProperties` exactly, for every size on the grid', () => {
    /*
     * `C-custom` takes web, flange and lip thickness separately. A cold-formed section has one
     * thickness, so all three get `t` — and the two computations must then agree to the last
     * digit, because they are the same decomposition of the same shape.
     *
     * Units: this module works in mm, that one in whatever it is handed. Feeding it mm makes the
     * comparison direct and keeps a unit conversion out of the assertion.
     */
    for (const spec of GRID.filter((s) => s.shape === 'C')) {
      const { hMm: h, bMm: b, cMm: c, tMm: t } = spec;
      const mine = coldFormedGeometry(spec)!;
      const theirs = computeSectionProperties('C-custom', { h, b, tw: t, tf: t, c, tl: t });
      const label = formatColdFormedDesignation(spec);

      expect(theirs, `${label} is a valid C-custom too`).not.toBeNull();
      expect(mine.areaMm2, `${label} area`).toBeCloseTo(theirs!.a, 9);
      expect(mine.iyMm4, `${label} iy`).toBeCloseTo(theirs!.iy, 6);
      expect(mine.izMm4, `${label} iz`).toBeCloseTo(theirs!.iz, 6);
      expect(mine.jMm4, `${label} j`).toBeCloseTo(theirs!.j!, 6);
    }
  });

  it('has no product of inertia, because a C is symmetric about its horizontal axis', () => {
    // Exactly zero, not nearly: the transfer terms cancel in pairs, they do not merely add up
    // small. A nonzero value here would mean the two flanges are not mirror images.
    for (const spec of GRID.filter((s) => s.shape === 'C')) {
      expect(coldFormedGeometry(spec)!.ixyMm4).toBe(0);
    }
  });

  it('so its geometric axes ARE its principal axes', () => {
    for (const spec of GRID.filter((s) => s.shape === 'C')) {
      const g = coldFormedGeometry(spec)!;
      expect(g.principalAngleDeg).toBe(0);
      expect(g.iMaxMm4).toBeCloseTo(Math.max(g.iyMm4, g.izMm4), 6);
      expect(g.iMinMm4).toBeCloseTo(Math.min(g.iyMm4, g.izMm4), 6);
    }
  });
});

describe('the Z, against the C', () => {
  it('has the same second moment about the horizontal axis', () => {
    /*
     * The identity that pins the Z decomposition. Turning the bottom flange and its lip around
     * moves material horizontally and not vertically, and `iy` only counts vertical distance.
     *
     * Checked over the whole grid, because a mistake in one part's height would show up at some
     * aspect ratios and hide at others.
     */
    for (const c of GRID.filter((s) => s.shape === 'C')) {
      const z = coldFormedGeometry({ ...c, shape: 'Z' })!;
      const ch = coldFormedGeometry(c)!;
      expect(z.iyMm4, `${formatColdFormedDesignation(c)} iy`).toBeCloseTo(ch.iyMm4, 6);
      // Same material, so the same area and the same open-section torsion constant too.
      expect(z.areaMm2).toBeCloseTo(ch.areaMm2, 9);
      expect(z.jMm4).toBeCloseTo(ch.jMm4, 9);
    }
  });

  it('but a different second moment about the vertical axis', () => {
    // Because the centroid is somewhere else: a C's flanges both pull it toward the tips, a Z's
    // pull opposite ways and leave it in the web. Not an incidental difference — it is what
    // makes a Z a Z, so it is asserted rather than left implied.
    for (const c of GRID.filter((s) => s.shape === 'C')) {
      const z = coldFormedGeometry({ ...c, shape: 'Z' })!;
      const ch = coldFormedGeometry(c)!;
      expect(z.izMm4).not.toBeCloseTo(ch.izMm4, 3);
    }
  });

  it('has a NONZERO product of inertia — the fact the rest of the app cannot store', () => {
    for (const spec of GRID.filter((s) => s.shape === 'Z')) {
      const g = coldFormedGeometry(spec)!;
      expect(g.ixyMm4, formatColdFormedDesignation(spec)).not.toBe(0);
      // Positive for a Z oriented as `partsZ` builds it (top flange to +u, bottom to −u): both
      // symmetric pairs contribute with the same sign instead of cancelling.
      expect(g.ixyMm4).toBeGreaterThan(0);
    }
  });

  it('and it is large enough to matter, not a rounding artefact', () => {
    /*
     * Worth quantifying, because "nonzero" invites the reply "but negligibly". For the reference
     * Z it is not negligible: the product of inertia is a substantial fraction of the weak-axis
     * moment, which is exactly why analysing a Z about its geometric axes is wrong rather than
     * slightly conservative.
     */
    const g = coldFormedGeometry(Z_100)!;
    expect(g.ixyMm4 / g.izMm4).toBeGreaterThan(0.5);
    expect(Math.abs(g.principalAngleDeg)).toBeGreaterThan(10);
  });
});

describe('the principal axes, verified by rotating the tensor', () => {
  /** The product of inertia about axes rotated by θ (degrees) from the geometric ones. */
  function productAt(iy: number, iz: number, ixy: number, deg: number): number {
    const r = (deg * Math.PI) / 180;
    return ((iy - iz) / 2) * Math.sin(2 * r) + ixy * Math.cos(2 * r);
  }
  /** The second moment about the rotated horizontal axis. */
  function iyAt(iy: number, iz: number, ixy: number, deg: number): number {
    const r = (deg * Math.PI) / 180;
    return (iy + iz) / 2 + ((iy - iz) / 2) * Math.cos(2 * r) - ixy * Math.sin(2 * r);
  }

  it('rotating by `principalAngleDeg` actually zeroes the product', () => {
    // The check that kills a sign error. Nothing here re-derives the angle; it uses the angle
    // the module reports and asks whether it does what the name says.
    for (const spec of GRID) {
      const g = coldFormedGeometry(spec)!;
      const residual = productAt(g.iyMm4, g.izMm4, g.ixyMm4, g.principalAngleDeg);
      // Scale-relative: these are mm⁴ on sections of very different sizes, so an absolute
      // tolerance would be meaningless across the grid.
      expect(Math.abs(residual) / Math.max(g.iMaxMm4, 1), formatColdFormedDesignation(spec))
        .toBeLessThan(1e-12);
    }
  });

  it('and lands on one of the two principal values', () => {
    for (const spec of GRID) {
      const g = coldFormedGeometry(spec)!;
      const rotated = iyAt(g.iyMm4, g.izMm4, g.ixyMm4, g.principalAngleDeg);
      const hitsMax = Math.abs(rotated - g.iMaxMm4) / g.iMaxMm4 < 1e-12;
      const hitsMin = Math.abs(rotated - g.iMinMm4) / g.iMaxMm4 < 1e-12;
      expect(hitsMax || hitsMin, formatColdFormedDesignation(spec)).toBe(true);
    }
  });

  it('satisfies both tensor invariants', () => {
    // True of any correct second-moment tensor and no incorrect one, and independent of every
    // sign convention above: the trace and the determinant survive rotation.
    for (const spec of GRID) {
      const g = coldFormedGeometry(spec)!;
      expect(g.iMaxMm4 + g.iMinMm4).toBeCloseTo(g.iyMm4 + g.izMm4, 6);
      const det = g.iyMm4 * g.izMm4 - g.ixyMm4 ** 2;
      expect(g.iMaxMm4 * g.iMinMm4 / det).toBeCloseTo(1, 9);
    }
  });

  it('keeps the angle inside a quarter turn', () => {
    for (const spec of GRID) {
      expect(Math.abs(coldFormedGeometry(spec)!.principalAngleDeg)).toBeLessThanOrEqual(45);
    }
  });
});

describe('the square-corner model, measured rather than asserted', () => {
  it('overestimates the area by under 1 % on the reference section', () => {
    /*
     * The module header claims the square corners cost «under 1 %» on a `C 100x50x15x2.0`. This
     * is that claim, computed: a square corner counts `t²`, the sharpest possible real bend
     * (inside radius 0) counts `(π/4)t²`, and a C has four corners.
     *
     * Also asserted: the error has a SIGN. This model never reports less material than a real
     * bend has, so it is not unconservative about area — which is the only honest thing to say
     * about an approximation whose exact value depends on a radius rule this app cannot source.
     */
    const g = coldFormedGeometry(C_100)!;
    const perCorner = C_100.tMm ** 2 * (1 - Math.PI / 4);
    const overestimate = (4 * perCorner) / g.areaMm2;
    expect(overestimate).toBeGreaterThan(0);
    expect(overestimate).toBeLessThan(0.01);
  });

  it('and stays under 3 % across the grid, growing with thickness', () => {
    // The bound is not universal — it scales as t²/A — so the grid gets its own, looser one, and
    // the thickest/smallest section is checked to be the worst case rather than assumed to be.
    // Four corners either way: a C and a Z both have two web-to-flange bends and two
    // flange-to-lip ones.
    let worst = 0, worstLabel = '';
    for (const spec of GRID) {
      const g = coldFormedGeometry(spec)!;
      const e = (4 * spec.tMm ** 2 * (1 - Math.PI / 4)) / g.areaMm2;
      if (e > worst) { worst = e; worstLabel = formatColdFormedDesignation(spec); }
    }
    expect(worst, `worst case ${worstLabel}`).toBeLessThan(0.03);
  });
});

describe('what cannot be bent is refused', () => {
  it('names which dimension is impossible', () => {
    // A picker has to be able to say what to change, so the rejection is a reason and not a
    // null. Each case is a section no mill can make, not merely an unusual one.
    const base = { shape: 'C' as const, hMm: 100, bMm: 50, cMm: 15, tMm: 2 };
    expect(validateColdFormed({ ...base, tMm: 0 })).toEqual({ ok: false, reason: 'nonPositive' });
    expect(validateColdFormed({ ...base, hMm: -100 })).toEqual({ ok: false, reason: 'nonPositive' });
    expect(validateColdFormed({ ...base, tMm: 50 })).toEqual({ ok: false, reason: 'flangesMeet' });
    expect(validateColdFormed({ ...base, bMm: 2 })).toEqual({ ok: false, reason: 'noFlange' });
    // Lips collide past mid-depth, and the bound is `c > h/2` — NOT `c + t > h/2`. Loosened by
    // exactly `t` when the outer-face convention landed, so `c = 49` on a 100 section is now legal
    // and `c = 51` is not. Both ends asserted, because the boundary is where an off-by-one lives.
    expect(validateColdFormed({ ...base, cMm: 49 })).toEqual({ ok: true });
    expect(validateColdFormed({ ...base, cMm: 50 })).toEqual({ ok: true });
    expect(validateColdFormed({ ...base, cMm: 51 })).toEqual({ ok: false, reason: 'lipsCollide' });
  });

  it('and geometry returns null rather than a section of negative area', () => {
    expect(coldFormedGeometry({ shape: 'Z', hMm: 100, bMm: 50, cMm: 60, tMm: 2 })).toBeNull();
    expect(coldFormedGeometry({ shape: 'C', hMm: 10, bMm: 50, cMm: 15, tMm: 2 })).toBeNull();
  });

  it('accepts `c <= t` as a plain channel rather than refusing it', () => {
    /*
     * Under the outer-face convention a lip shorter than the sheet is thick adds nothing beyond
     * the flange, so the section IS an unlipped channel — which is what both drawing
     * implementations have always rendered for that case. Computing it instead of rejecting it is
     * what stopped the app from calculating a section with a lip and drawing one without.
     */
    const base = { shape: 'C' as const, hMm: 100, bMm: 50, cMm: 15, tMm: 2 };
    for (const cMm of [2, 1, 0.5]) {
      expect(validateColdFormed({ ...base, cMm }), `c=${cMm}`).toEqual({ ok: true });
      const g = coldFormedGeometry({ ...base, cMm });
      expect(g, `c=${cMm}`).not.toBeNull();
      // Identical to the section with no lip at all, which is the strongest way to say it.
      expect(g!.areaMm2).toBeCloseTo(coldFormedGeometry({ ...base, cMm: 2 })!.areaMm2, 9);
    }
  });

  it('refuses a thickness that is not finite', () => {
    // NaN slips through `> 0` comparisons, so it is checked explicitly: a NaN thickness would
    // otherwise produce a section whose every property is NaN and whose id parses.
    expect(coldFormedGeometry({ shape: 'C', hMm: 100, bMm: 50, cMm: 15, tMm: NaN })).toBeNull();
    expect(coldFormedGeometry({ shape: 'C', hMm: Infinity, bMm: 50, cMm: 15, tMm: 2 })).toBeNull();
  });
});

describe('the designation is the specification', () => {
  it('round-trips every size on the grid', () => {
    // A parametric family has no table to fall back on, so a stored id that does not parse is a
    // section that no longer exists. This is the assertion that keeps a saved project openable.
    for (const spec of GRID) {
      const id = formatColdFormedDesignation(spec);
      const back = parseColdFormedDesignation(id);
      expect(back, id).not.toBeNull();
      expect(back).toEqual(spec);
      expect(formatColdFormedDesignation(back!)).toBe(id);
    }
  });

  it('accepts what a person types and normalises it', () => {
    const canonical = 'C 100x50x15x2.0';
    for (const typed of [
      'C 100x50x15x2',        // thickness without a decimal
      'C 100×50×15×2.0',      // the multiplication sign
      'c 100x50x15x2.0',      // lower case
      ' C 100 x 50 x 15 x 2 ',// spaces everywhere
      'C 100x50x15x2,0',      // decimal comma
    ]) {
      const spec = parseColdFormedDesignation(typed);
      expect(spec, typed).not.toBeNull();
      expect(formatColdFormedDesignation(spec!), typed).toBe(canonical);
    }
  });

  it('rejects anything that is not a designation', () => {
    for (const bad of [
      'IPE 200',              // another family
      'C 100x50x15',          // a dimension short
      'C 100x50x15x2x3',      // one too many
      'U 100x50x15x2',        // not a shape this module covers
      'C',
      '',
      'C 100x50x15x0',        // parses, then fails validation
      'C 10x50x15x2',         // parses, then fails validation
    ]) {
      expect(parseColdFormedDesignation(bad), bad).toBeNull();
    }
  });
});
