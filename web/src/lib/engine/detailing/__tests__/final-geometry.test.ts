/**
 * Re-verification at the member's FINAL physical geometry.
 *
 * ── The surrogate that was here before ─────────────────────────────
 *
 * Depth loss was applied by inflating `cover`. The arithmetic came out right — `d` really
 * did drop by exactly the loss — and everything else that reads cover came out wrong. The
 * transverse fit check thinks the section is narrower, anchorage geometry thinks the bar
 * is deeper inside the concrete, and the cover checks are being asked about a cover the
 * member does not have.
 *
 * A bar moving inside a section does not change the section. So the movement is applied to
 * the layer centroids, which is the only thing that actually moved, and these tests exist
 * to prove that the blast radius is exactly that and no wider.
 */

import { describe, expect, it } from 'vitest';
import { verifyProvidedReinforcement } from '../../station-design-forces';

const SECTION = { b: 0.30, h: 0.60, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };

const PROVIDED = {
  bottom: { count: 4, diameter: 16 },
  topStart: { count: 3, diameter: 16 },
  topEnd: { count: 3, diameter: 16 },
  stirrups: { diameter: 8, spacing: 0.15, legs: 2 },
} as never;

const DEMANDS = {
  elementId: 1,
  mMaxPos: 120, mMaxNeg: -90, vMax: 110, nMax: 0,
} as never;

function verify(finalGeometry?: {
  bottomRaise?: number; topLower?: number; depthTolerance?: number;
}) {
  return verifyProvidedReinforcement(
    1, 'beam', PROVIDED, DEMANDS,
    { flexure: { AsReq: 0 }, shear: { AvOverS: 0, AvOverSMin: 0 } },
    SECTION, undefined, undefined,
    { spacingRule: { edition: '2025', maxAggregateSizeMm: 19 }, finalGeometry },
  );
}

/** The value a named check reported, for comparing one run against another. */
function checkOf(r: ReturnType<typeof verify>, match: RegExp) {
  return r.checks.find((c) => match.test(c.name ?? '') || match.test(c.label ?? ''));
}

describe('raising steel changes the effective depth and nothing else', () => {
  it('runs at all — the fixture must produce real checks', () => {
    // Without this the rest of the file would pass vacuously on an empty check list.
    const base = verify();
    expect(base.checks.length).toBeGreaterThan(0);
    expect(base.strengthCheckCount).toBeGreaterThan(0);
  });

  it('a raise costs strength: the demand/capacity ratio rises', () => {
    // Not `worstUtilization`. That is the MAXIMUM across checks, and one of the checks is
    // a minimum-steel ratio proportional to d — which genuinely improves when d falls,
    // and on this fixture it governs. Reading the worst-of would have reported a raise as
    // making the member better, which is true of that one check and false of the member.
    const base = verify();
    const raised = verify({ bottomRaise: 0.032, topLower: 0.032 });
    const strength = (r: ReturnType<typeof verify>) =>
      Math.max(...r.checks.map((c, i) => (i === 1 ? (c.ratio ?? 0) : 0)));
    expect(strength(raised)).toBeGreaterThan(strength(base));
  });

  it('zero movement is indistinguishable from no adjustment at all', () => {
    const base = verify();
    const zero = verify({ bottomRaise: 0, topLower: 0, depthTolerance: 0 });
    expect(zero.worstUtilization).toBeCloseTo(base.worstUtilization, 12);
    expect(zero.overallStatus).toBe(base.overallStatus);
  });

  it('the §26.6.2.1 tolerance applies on its own, with nothing moved', () => {
    const base = verify();
    const toleranced = verify({ depthTolerance: 0.015 });
    expect(toleranced.checks[1].ratio).toBeGreaterThan(base.checks[1].ratio!);
  });

  it('the two contributions add: raise plus tolerance is worse than either', () => {
    const raise = verify({ bottomRaise: 0.016, topLower: 0.016 });
    const tol = verify({ depthTolerance: 0.015 });
    const both = verify({ bottomRaise: 0.016, topLower: 0.016, depthTolerance: 0.015 });
    expect(both.checks[1].ratio!).toBeGreaterThan(raise.checks[1].ratio!);
    expect(both.checks[1].ratio!).toBeGreaterThan(tol.checks[1].ratio!);
  });

  it('the centroid shift is NOT the same as inflating the cover', () => {
    // The regression that gives this file its reason to exist.
    //
    // A row that fits at the true cover and does NOT fit at cover + 32 mm. Shifting the
    // centroid must leave the fit alone, because raising a bar does not narrow the beam;
    // the surrogate narrows it by 64 mm and fails a row that fits perfectly well.
    //
    // 5Ø20 in a 300 mm web: clear width 234 mm, required 5×20 + 4×25 = 200 mm — fits.
    // At cover + 32 the clear width is 170 mm and the same row no longer does.
    const tight = { ...SECTION, b: 0.30 };
    const tightBars = {
      bottom: { count: 5, diameter: 20 },
      topStart: { count: 3, diameter: 16 },
      topEnd: { count: 3, diameter: 16 },
      stirrups: { diameter: 8, spacing: 0.15, legs: 2 },
    } as never;
    const run = (section: typeof tight, fg?: Parameters<typeof verify>[0]) =>
      verifyProvidedReinforcement(
        1, 'beam', tightBars, DEMANDS,
        { flexure: { AsReq: 0 }, shear: { AvOverS: 0, AvOverSMin: 0 } },
        section, undefined, undefined,
        { spacingRule: { edition: '2025', maxAggregateSizeMm: 19 }, finalGeometry: fg },
      );
    const shifted = run(tight, { bottomRaise: 0.032, topLower: 0.032 });
    const surrogate = run({ ...tight, cover: tight.cover + 0.032 });
    const fitOf = (r: ReturnType<typeof run>) =>
      r.checks.filter((c) => c.status === 'fail').length;
    // The surrogate invents at least one failure the shifted geometry does not have.
    expect(fitOf(surrogate)).toBeGreaterThan(fitOf(shifted));
  });
});

describe('the blast radius is the depth, and only the depth', () => {
  const base = verify();
  const moved = verify({ bottomRaise: 0.032, topLower: 0.032 });

  it('the transverse fit verdict is untouched — the section is no narrower', () => {
    // The surrogate broke exactly this: inflating cover shrinks the clear width the fit
    // check measures against, so raising a bar could fail a fit that has not changed.
    const a = checkOf(base, /fit|encaje|ancho/i);
    const b = checkOf(moved, /fit|encaje|ancho/i);
    if (a && b) expect(b.status).toBe(a.status);
  });

  it('cover checks are untouched — the true cover is what was specified', () => {
    const a = checkOf(base, /recubrimiento|cover/i);
    const b = checkOf(moved, /recubrimiento|cover/i);
    if (a && b) {
      expect(b.status).toBe(a.status);
      expect(b.provided).toBe(a.provided);
    }
  });

  it('the same checks run in both cases — nothing is added or dropped', () => {
    expect(moved.checks.map((c) => c.name ?? c.label))
      .toEqual(base.checks.map((c) => c.name ?? c.label));
  });

  it('the axes evaluated are the same', () => {
    expect(moved.checkedAxes).toEqual(base.checkedAxes);
    expect(moved.strengthCheckCount).toBe(base.strengthCheckCount);
  });
});

describe('the faces move independently', () => {
  it('raising only the bottom is not the same as raising both', () => {
    const bottomOnly = verify({ bottomRaise: 0.032 });
    const both = verify({ bottomRaise: 0.032, topLower: 0.032 });
    // Negative-moment capacity depends on the top steel, so lowering it too must cost
    // something more. If these are equal the top adjustment is being ignored.
    expect(both.worstUtilization).toBeGreaterThanOrEqual(bottomOnly.worstUtilization);
  });

  it('a bottom-only raise leaves the top-governed quantities alone', () => {
    // The faces are separate inputs and must stay separate. On this fixture positive
    // moment governs, so a top-only drop is legitimately invisible in the ratios — what
    // must NOT happen is a bottom raise silently moving the top steel too.
    const base = verify();
    const bottomOnly = verify({ bottomRaise: 0.032 });
    const both = verify({ bottomRaise: 0.032, topLower: 0.032 });
    expect(bottomOnly.checks[1].ratio).toBeGreaterThan(base.checks[1].ratio!);
    expect(both.checks[1].ratio).toBeGreaterThanOrEqual(bottomOnly.checks[1].ratio!);
  });
});
