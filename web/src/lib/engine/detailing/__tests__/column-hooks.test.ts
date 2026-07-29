/**
 * Column roof hooks, and what the 214 "column cranks" actually were.
 *
 * The progress notes predicted offset bent bars under §10.7.4 — the paths were cranking at
 * a lift transition and adjacent cranks were crossing. They were not. `generateColumnStack`
 * builds every longitudinal bar STRAIGHT: same plan position at both ends, no inclined
 * portion anywhere. §10.7.4 never entered into it.
 *
 * The witnesses said so plainly. Two Ø20 bars on the flagship's y = −211 face, one running
 * its 12db extension from x = −141 to x = 99 and the next from x = −71 to x = 169, two
 * millimetres apart in elevation. Same face, same direction, same height: collinear steel.
 *
 * The cause was one expression. `hookNormal: { x: -Math.sign(p.x) || 1, y: 0, z: 0 }` sent
 * every hook along ±x regardless of which face its bar sat on.
 */

import { describe, expect, it } from 'vitest';
import { detectTransitions, generateColumnStack } from '../generate-column';
import type { BarPath } from '../../../codes/cirsoc201/bar-geometry';

function stack(over: Record<string, unknown> = {}) {
  return generateColumnStack({
    stackId: 'C1',
    lifts: [{
      elementId: 1, baseZ: 0, topZ: 3.0,
      centre: { x: 0, y: 0 },
      b: 0.40, h: 0.40, cover: 0.025, tieDia: 8,
      bars: { count: 8, diameterMm: 20 },
    }],
    roofTermination: true,
    lapSplice: () => 0.6,
    beamDepthAtTop: new Map<number, number>(),
    edition: '2025',
    ...over,
  } as never) as { bars: BarPath[]; unsupported: string[] };
}

/** The straight run of a bar, and the free end of its hook. */
function hookRun(bar: BarPath) {
  const last = bar.segments[bar.segments.length - 1];
  const body = bar.segments.reduce((m, s) =>
    s.kind === 'straight' && s.length > m.length ? s : m, bar.segments[0]);
  return { body, tip: last.end, tipStart: last.start };
}

/** Do two axis-aligned hook extensions overlap in space? */
function extensionsOverlap(a: BarPath, b: BarPath): boolean {
  const ea = hookRun(a); const eb = hookRun(b);
  // Only a concern when they share an elevation.
  if (Math.abs(ea.tip.z - eb.tip.z) > 0.010) return false;
  const segOverlap = (
    p1: { x: number; y: number }, q1: { x: number; y: number },
    p2: { x: number; y: number }, q2: { x: number; y: number },
  ) => {
    // Both extensions run along one axis; treat them as boxes with the bar's own width.
    const box = (p: typeof p1, q: typeof q1) => ({
      x0: Math.min(p.x, q.x) - 0.010, x1: Math.max(p.x, q.x) + 0.010,
      y0: Math.min(p.y, q.y) - 0.010, y1: Math.max(p.y, q.y) + 0.010,
    });
    const A = box(p1, q1); const B = box(p2, q2);
    return A.x0 < B.x1 && B.x0 < A.x1 && A.y0 < B.y1 && B.y0 < A.y1;
  };
  return segOverlap(ea.tipStart, ea.tip, eb.tipStart, eb.tip);
}

describe('the bars are straight — this was never a §10.7.4 crank', () => {
  it('a single-lift column produces no inclined portion', () => {
    const r = stack();
    for (const bar of r.bars) {
      if (bar.role !== 'longitudinal') continue;
      const body = bar.segments.reduce((m, s) =>
        s.kind === 'straight' && s.length > m.length ? s : m, bar.segments[0]);
      // The body runs purely vertical: no plan movement at all.
      expect(Math.hypot(body.end.x - body.start.x, body.end.y - body.start.y))
        .toBeLessThan(1e-9);
    }
  });
});

describe('roof hooks turn perpendicular to their own face', () => {
  it('no two hook extensions overlap', () => {
    const r = stack();
    const longs = r.bars.filter((b) => b.role === 'longitudinal');
    expect(longs.length).toBeGreaterThan(4);
    const clashes: string[] = [];
    for (let i = 0; i < longs.length; i++) {
      for (let j = i + 1; j < longs.length; j++) {
        if (extensionsOverlap(longs[i], longs[j])) {
          clashes.push(`${longs[i].id}/${longs[j].id}`);
        }
      }
    }
    expect(clashes).toEqual([]);
  });

  it('a bar on the −y face turns toward +y, not along x', () => {
    const r = stack();
    const longs = r.bars.filter((b) => b.role === 'longitudinal');
    // Pick the bar nearest the middle of the −y face.
    const onMinusY = longs
      .map((b) => ({ b, p: b.segments[0].start }))
      .filter((e) => e.p.y < -0.10)
      .sort((a, c) => Math.abs(a.p.x) - Math.abs(c.p.x))[0];
    expect(onMinusY).toBeDefined();
    const { tipStart, tip } = hookRun(onMinusY.b);
    expect(Math.abs(tip.y - tipStart.y)).toBeGreaterThan(Math.abs(tip.x - tipStart.x));
    expect(tip.y).toBeGreaterThan(tipStart.y);
  });

  it('each face gets its own hook elevation', () => {
    const r = stack();
    const zs = new Set(r.bars
      .filter((b) => b.role === 'longitudinal')
      .map((b) => Math.round(hookRun(b).tip.z * 1000)));
    // Four faces, so more than one distinct hook height. One height is the old bug.
    expect(zs.size).toBeGreaterThan(1);
  });

  it('hook tiers lower the bar tops rather than raising them', () => {
    const r = stack();
    const tips = r.bars.filter((x) => x.role === 'longitudinal')
      .map((b) => hookRun(b).tip.z);
    // A 90° hook turns at the bar end and its arc rises by one bend radius, so the tip
    // sits a radius above the straight run. What the tiering must not do is push any bar
    // HIGHER than the untiered case — tier 0 is the highest and every other tier is below
    // it.
    const top = 3.0 + 0.070 + 1e-6;   // lift top plus one Ø20 bend radius
    for (const z of tips) expect(z).toBeLessThanOrEqual(top);
    // And the tiers really do separate: more than one distinct height.
    expect(new Set(tips.map((z) => Math.round(z * 1000))).size).toBeGreaterThan(1);
  });

  it('every hook turns INWARD — no extension leaves the section', () => {
    const r = stack();
    for (const b of r.bars.filter((x) => x.role === 'longitudinal')) {
      const { tip } = hookRun(b);
      expect(Math.abs(tip.x)).toBeLessThanOrEqual(0.20 + 1e-9);
      expect(Math.abs(tip.y)).toBeLessThanOrEqual(0.20 + 1e-9);
    }
  });
});

describe('corner bars belong to exactly one face', () => {
  it('a corner bar is assigned, not skipped and not counted twice', () => {
    const r = stack();
    const longs = r.bars.filter((b) => b.role === 'longitudinal');
    expect(longs).toHaveLength(8);
    // Every bar has a hook: none was left without a face.
    for (const b of longs) expect(b.endTreatment.kind).toBe('hook');
  });

  it('the four corners do not all share one hook direction', () => {
    const r = stack();
    const corners = r.bars
      .filter((b) => b.role === 'longitudinal')
      .map((b) => ({ b, p: b.segments[0].start }))
      .filter((e) => Math.abs(e.p.x) > 0.15 && Math.abs(e.p.y) > 0.15);
    expect(corners.length).toBe(4);
    const dirs = new Set(corners.map((e) => {
      const { tipStart, tip } = hookRun(e.b);
      return `${Math.sign(Math.round((tip.x - tipStart.x) * 1000))}:` +
        `${Math.sign(Math.round((tip.y - tipStart.y) * 1000))}`;
    }));
    expect(dirs.size).toBeGreaterThan(1);
  });
});

describe('determinism', () => {
  it('two identical runs give byte-identical bars', () => {
    const a = stack();
    const b = stack();
    expect(JSON.stringify(b.bars)).toBe(JSON.stringify(a.bars));
  });
});

describe('what §10.7.4 does require, when a transition really is offset', () => {
  /**
   * The clauses, read from the supplied 2025 text:
   *
   *   §10.7.4.1  the inclined portion's slope shall not exceed 1 in 6 relative to the
   *              column axis, and the portions above and below the bend shall be parallel
   *              to it.
   *   §10.7.4.2  where the column face is offset 75 mm OR MORE the longitudinal bars shall
   *              NOT be bent; separate dowels lap-spliced with the adjacent longitudinals
   *              shall be placed at the offset faces.
   *   §10.7.6.4.1 offset bars shall have horizontal support from ties, hoops or spirals
   *              designed for 1,5 times the horizontal component of the force in the
   *              inclined portion.
   */
  const twoLift = (dx: number) => ({
    stackId: 'C2',
    lifts: [
      { elementId: 1, baseZ: 0, topZ: 3, centre: { x: 0, y: 0 },
        b: 0.40, h: 0.40, cover: 0.025, tieDia: 8, bars: { count: 4, diameterMm: 20 } },
      { elementId: 2, baseZ: 3, topZ: 6, centre: { x: dx, y: 0 },
        b: 0.40, h: 0.40, cover: 0.025, tieDia: 8, bars: { count: 4, diameterMm: 20 } },
    ],
    roofTermination: false, lapSplice: () => 0.6, edition: '2025',
    // Rise available for the inclined portion at each transition: the beam depth the bars
    // must bend within.
    beamDepthAtTop: new Map([[0, 3.0]]),
  });

  it('an offset below 75 mm is reported as an offset transition', () => {
    const t = detectTransitions(twoLift(0.05) as never);
    expect(t[0].kinds).toContain('offset');
  });

  it('a 1-in-60 slope is comfortably inside the §10.7.4.1 limit', () => {
    // 3 m rise, 50 mm shift. The limit is 1 in 6.
    const t = detectTransitions(twoLift(0.05) as never);
    expect(t[0].offsetExceedsLimit).toBe(false);
    expect(t[0].offsetSlope!).toBeLessThan(1 / 6);
  });

  it('§10.7.4.2 — a 75 mm face offset must NOT be bent, and gets dowels', () => {
    // The rule is about the FACE offset, and it is a hard prohibition, not a slope check:
    // at 75 mm or more the bars are not bent at all and separate lap-spliced dowels are
    // placed instead. A gentle slope does not buy an exemption from it.
    const t = detectTransitions(twoLift(0.075) as never);
    expect(t[0].kinds).toContain('offset');
    // A 1-in-40 slope — comfortably legal under §10.7.4.1 — and still forbidden. That is the
    // whole point of the clause being separate from the slope limit.
    expect(t[0].offsetSlope!).toBeLessThan(1 / 6);
    expect(t[0].requiresSeparateDowels).toBe(true);

    // The gap this test used to record is closed: the dowels are emitted.
    const g = generateColumnStack(twoLift(0.075) as never);
    const dowels = g.bars.filter((b) => b.id.includes('-D'));
    expect(dowels.length).toBeGreaterThan(0);
    for (const d of dowels) {
      // Straight — the clause forbids the inclined portion, so there must not be one.
      expect(d.segments).toHaveLength(1);
      expect(d.segments[0].start.x).toBeCloseTo(d.segments[0].end.x, 9);
      expect(d.segments[0].start.y).toBeCloseTo(d.segments[0].end.y, 9);
    }
  });
});
