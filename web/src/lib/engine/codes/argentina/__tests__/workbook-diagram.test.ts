/**
 * Our interaction diagram against the workbook's own, point by point.
 *
 * ── Why this and not another published number ──────────────────────
 *
 * The verification sheets PRINT six states, and `characteristic-points.test.ts`
 * pins those. But the sheet also PLOTS the whole curve, and the series behind
 * that chart is eighty-one (φMn, φPn) pairs sitting in columns DN and DM of
 * FCR-VERIF — computed by the workbook's own formulas, for the section the
 * sheet ships with. That is the densest statement of "what CIRSOC FLEX thinks
 * this section can carry" available anywhere, and it costs nothing to check
 * against: `fcr-verif-diagram.json` is those cells, extracted and not edited.
 *
 * Six points can be matched by a method that is wrong in between. Eighty-one
 * following the same path cannot.
 *
 * ── How they are compared ──────────────────────────────────────────
 *
 * Not as a function. The diagram doubles back — φPn is multivalued in φMn near
 * the nose and φMn is multivalued in φPn along the axial plateau — so "our
 * moment at their axial load" is ill-posed at both ends. The comparison is
 * geometric instead: the distance from each of their points to our polyline,
 * normalised by the diagram's own size. Two curves that coincide give zero
 * whatever their parametrisation.
 *
 * Signs are compared as magnitudes. The printed table gives one edge's moments
 * negative and the other's positive; the plotted series mixes the two
 * conventions within one column. Which face is called compressed is a drawing
 * decision, and the physics of a symmetric section is the same either way.
 */
import { describe, it, expect } from 'vitest';
import { interactionCurve, type Bar, type Outline, type Materials }
  from '../cirsoc201-section';
import { ring } from '../cirsoc201-layouts';
import workbook from './fcr-verif-diagram.json';
import circular from './fcr-cir-verif-diagram.json';

const OUTLINE: Outline = { kind: 'rect', b: workbook.section.b, h: workbook.section.h };
const MAT = { fc: workbook.section.fc, fy: workbook.section.fy } as Materials;
const BARS: Bar[] = workbook.section.bars.map((b) => ({
  x: b.x, y: b.y, area: b.areaCm2 * 1e-4,
}));

/** Ours, as (|φMn|, φPn), finely sampled. */
const ours = interactionCurve(OUTLINE, BARS, MAT, Math.PI / 2, 600)
  .map((p) => ({ m: Math.hypot(p.phiMnx, p.phiMny), n: p.phiPn }));

/** Theirs, same shape. */
const theirs = (workbook.points as Array<[number, number]>)
  .map(([m, n]) => ({ m: Math.abs(m), n }));

/** The diagram's own size, so a distance can be read as a percentage of it. */
const SCALE = Math.hypot(
  Math.max(...ours.map((p) => p.m)) - Math.min(...ours.map((p) => p.m)),
  Math.max(...ours.map((p) => p.n)) - Math.min(...ours.map((p) => p.n)),
);

/** Shortest distance from a point to our polyline. */
function distanceToOurs(q: { m: number; n: number }): number {
  let best = Infinity;
  for (let i = 1; i < ours.length; i++) {
    const a = ours[i - 1];
    const b = ours[i];
    const dm = b.m - a.m;
    const dn = b.n - a.n;
    const len2 = dm * dm + dn * dn;
    const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1,
      ((q.m - a.m) * dm + (q.n - a.n) * dn) / len2));
    const d = Math.hypot(q.m - (a.m + t * dm), q.n - (a.n + t * dn));
    if (d < best) best = d;
  }
  return best;
}

describe('the workbook fixture is what it claims to be', () => {
  it('carries the plotted series, not a summary of it', () => {
    expect(theirs.length).toBe(81);
    expect(workbook.sheet).toBe('FCR-VERIF');
  });

  it('spans the axial range the sheet publishes', () => {
    expect(Math.max(...theirs.map((p) => p.n))).toBeCloseTo(1436.902, 2);
    expect(Math.min(...theirs.map((p) => p.n))).toBeCloseTo(-806.5008, 2);
  });
});

describe('our curve follows theirs', () => {
  const distances = theirs.map(distanceToOurs);

  it('puts every one of their points on our curve', () => {
    const worst = Math.max(...distances);
    const at = theirs[distances.indexOf(worst)];
    expect(
      worst / SCALE,
      `worst gap ${worst.toFixed(2)} at (M ${at.m.toFixed(1)}, P ${at.n.toFixed(1)}), `
      + `${((worst / SCALE) * 100).toFixed(2)} % of a ${SCALE.toFixed(0)} diagram`,
    ).toBeLessThan(0.01);
  });

  it('is close on average, not merely close at worst', () => {
    /* A single outlier can hide inside a maximum; the mean says the two curves
       share a path rather than touching at a few places. */
    const mean = distances.reduce((s, d) => s + d, 0) / distances.length;
    expect(mean / SCALE, `mean gap ${((mean / SCALE) * 100).toFixed(3)} %`)
      .toBeLessThan(0.002);
  });

  it('agrees at the three states a reader checks by hand', () => {
    /* Pure flexure, the balance region and the axial cap — one from each part
       of the curve, compared as the workbook prints them. */
    const near = (n: number) => theirs.reduce((m, p) =>
      Math.abs(p.n - n) < Math.abs(m.n - n) ? p : m, theirs[0]);
    expect(distanceToOurs(near(0)) / SCALE).toBeLessThan(0.01);
    expect(distanceToOurs(near(486.59)) / SCALE).toBeLessThan(0.01);
    expect(distanceToOurs(near(1436.90)) / SCALE).toBeLessThan(0.01);
  });
});

/*
 * The same check on the circular sheet, which is a different engine path and a
 * different set of code rules: a ring of bars instead of two levels, and
 * SPIRAL confinement, where φ for a compression-controlled section is 0,70 and
 * the axial cap is 0,85 Po rather than 0,80. FCR-CIR-VERIF plots 448 points;
 * they are `fcr-cir-verif-diagram.json`, extracted from columns IF and IG.
 */
describe('the circular sheet, with spirals', () => {
  const S = circular.section;
  const OUT: Outline = { kind: 'circle', D: S.D };
  const M = { fc: S.fc, fy: S.fy, confinement: 'spiral' } as Materials;
  const BAR = ring(S.D, S.dPrimeS, S.barCount, S.astCm2, S.barAtExtremeFibre);

  const mine = interactionCurve(OUT, BAR, M, Math.PI / 2, 600)
    .map((p) => ({ m: Math.hypot(p.phiMnx, p.phiMny), n: p.phiPn }));
  const theirsC = (circular.points as Array<[number, number]>)
    .map(([m, n]) => ({ m: Math.abs(m), n }));
  const scaleC = Math.hypot(
    Math.max(...mine.map((p) => p.m)) - Math.min(...mine.map((p) => p.m)),
    Math.max(...mine.map((p) => p.n)) - Math.min(...mine.map((p) => p.n)),
  );

  function distTo(q: { m: number; n: number }): number {
    let best = Infinity;
    for (let i = 1; i < mine.length; i++) {
      const a = mine[i - 1];
      const b = mine[i];
      const dm = b.m - a.m;
      const dn = b.n - a.n;
      const len2 = dm * dm + dn * dn;
      const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1,
        ((q.m - a.m) * dm + (q.n - a.n) * dn) / len2));
      best = Math.min(best, Math.hypot(q.m - (a.m + t * dm), q.n - (a.n + t * dn)));
    }
    return best;
  }

  it('builds the ring the sheet describes', () => {
    /* 12 bars of 7.21 cm² is Ast = 86.52, and ρ over the gross circle is what
       the sheet prints. Getting this wrong would make every later comparison
       meaningless in a way the distances would not reveal. */
    expect(BAR.length).toBe(12);
    const ast = BAR.reduce((s, b) => s + b.area, 0) * 1e4;
    expect(ast).toBeCloseTo(S.astCm2, 6);
    expect(ast / (Math.PI * (S.D / 2) ** 2 * 1e4)).toBeCloseTo(S.rho, 6);
  });

  it('reaches the axial cap the sheet reaches — 0,85 Po, not 0,80', () => {
    /* The spiral cap is the one number that would move if confinement were
       being read wrong, and it moves by 6 %. */
    expect(Math.max(...mine.map((p) => p.n))).toBeCloseTo(3641.60, 0);
    expect(Math.min(...mine.map((p) => p.n))).toBeCloseTo(-3270.46, 0);
  });

  it('follows the workbook curve at all 448 points', () => {
    const ds = theirsC.map(distTo);
    const worst = Math.max(...ds);
    const mean = ds.reduce((s, d) => s + d, 0) / ds.length;
    const at = theirsC[ds.indexOf(worst)];
    expect(
      worst / scaleC,
      `worst ${worst.toFixed(2)} at (M ${at.m.toFixed(1)}, P ${at.n.toFixed(1)})`,
    ).toBeLessThan(0.002);
    expect(mean / scaleC).toBeLessThan(0.0005);
  });
});
