/**
 * Physical transverse reinforcement — geometry, containment and station sequence.
 *
 * Every expected number here is read off the regulation or computed by hand from the section,
 * never taken from the implementation.
 *
 * Reference section throughout: 300 × 550 beam, 25 mm cover to the stirrup outside, Ø8
 * stirrups. So the stirrup centreline rectangle is
 *   half-across = 300/2 − 25 − 4 = 121 mm
 *   half-up     = 550/2 − 25 − 4 = 246 mm
 * and the full across-width leg span is 242 mm, which must equal `acrossWidthSpan()` — if the
 * two disagree, the cage's outer legs are not where the spacing rule believes they are.
 */

import { describe, it, expect } from 'vitest';
import {
  buildClosedStirrup, buildCrosstie, buildStirrupSet, stirrupStations,
  stirrupCentrelineHalfExtents, hookAnchorageIsSupported, unbracedBarReport,
  bendsWithoutLongitudinalBar, legsProvided, setSatisfiesLimits,
  STIRRUP_HOOK_ANGLE, CROSSTIE_HOOK_ANGLE_135, CROSSTIE_HOOK_ANGLE_90,
  HOOK_ANCHORAGE_MAX_DIA_MM,
  type LongitudinalBarRef, type StirrupSetInput,
} from '../transverse-cage';
import {
  acrossWidthSpan, legOffsetsAcross, transverseSpacingLimits,
} from '../transverse-spacing';
import { minMandrelDiameter, standardHook } from '../bar-geometry';

const B = 0.300, H = 0.550, COVER = 0.025, DS = 8;

/** Bottom 3Ø16 and top 2Ø16, at the positions the longitudinal generator would use. */
function bars(): LongitudinalBarRef[] {
  // Positions computed from the section, not guessed. The stirrup centreline is
  // cover + d_s/2 from the face; a corner bar sits against the leg's INNER face, so its
  // centre is a further (d_s + d_b)/2 inboard.
  const inset = COVER + DS / 1000;                     // 33 mm, to the bar's outer edge
  const zBot = -(H / 2 - inset - 16 / 2000);           // -0,234
  const zTop = H / 2 - inset - 16 / 2000;              //  0,234
  const xCorner = B / 2 - COVER - DS / 2000 - (DS + 16) / 2000;   // 0,109
  return [
    { id: 'b0', across: -xCorner, up: zBot, diameterMm: 16 },
    { id: 'b1', across: 0, up: zBot, diameterMm: 16 },
    { id: 'b2', across: xCorner, up: zBot, diameterMm: 16 },
    { id: 't0', across: -xCorner, up: zTop, diameterMm: 16 },
    { id: 't1', across: xCorner, up: zTop, diameterMm: 16 },
  ];
}

function input(over: Partial<StirrupSetInput> = {}): StirrupSetInput {
  return {
    elementId: 162, zoneId: 'e162:support:0', station: 0.05,
    b: B, h: H, cover: COVER, stirrupDiaMm: DS, legs: 2,
    longitudinalBars: bars(),
    origin: { x: 0, y: 0, z: 3 },
    axis: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: 0, z: 1 },
    across: { x: 0, y: 1, z: 0 },
    hookOrientation: 'a',
    maxAggregateSizeMm: 19,
    ...over,
  };
}

// ─── The cage agrees with the spacing rule ───────────────────────

describe('the cage and the spacing rule agree on where legs are', () => {
  it('half-extents put the centreline cover + d_s/2 from each face', () => {
    const { halfAcross, halfUp } = stirrupCentrelineHalfExtents(B, H, COVER, DS);
    expect(halfAcross).toBeCloseTo(0.121, 9);
    expect(halfUp).toBeCloseTo(0.246, 9);
  });

  it('the outer leg span equals acrossWidthSpan, exactly', () => {
    // This is the load-bearing consistency check between the two modules. If it drifts, the
    // across-width limit is being judged on positions the cage does not build.
    const { halfAcross } = stirrupCentrelineHalfExtents(B, H, COVER, DS);
    expect(2 * halfAcross).toBeCloseTo(acrossWidthSpan(B, COVER, DS), 12);
  });

  it('a two-leg set puts its legs exactly on the evaluator offsets', () => {
    const set = buildStirrupSet(input({ legs: 2 }));
    const want2 = legOffsetsAcross(2, B, COVER, DS);
    set.legOffsets.forEach((o, i) => expect(o).toBeCloseTo(want2[i], 9));
    expect(legsProvided(set.pieces)).toBe(2);
  });

  it('a three-leg set is a stirrup plus ONE fabricated crosstie', () => {
    const set = buildStirrupSet(input({ legs: 3 }));
    expect(set.pieces.map((p) => p.shape)).toEqual(['closedStirrup', 'crosstie']);
    expect(legsProvided(set.pieces)).toBe(3);
    // The crosstie is a real piece with its own path and cutting length, not a counter.
    const tie = set.pieces[1];
    expect(tie.path.segments.length).toBeGreaterThan(0);
    expect(tie.path.cuttingLength).toBeGreaterThan(0);
    expect(tie.legOffsets).toEqual([0]);
  });

  it('a four-leg set fabricates TWO crossties at the evaluator offsets', () => {
    const set = buildStirrupSet(input({ legs: 4, b: 0.9 }));
    expect(set.pieces.filter((p) => p.shape === 'crosstie')).toHaveLength(2);
    expect(legsProvided(set.pieces)).toBe(4);
    const want = legOffsetsAcross(4, 0.9, COVER, DS);
    expect(set.legOffsets).toHaveLength(want.length);
    set.legOffsets.forEach((o, i) => expect(o).toBeCloseTo(want[i], 9));
  });
});

// ─── §25.7.1.2 every bend contains a longitudinal bar ────────────

describe('§25.7.1.2 — every bend must contain a longitudinal bar', () => {
  it('all four stirrup corners grip a bar on this cage', () => {
    const p = buildClosedStirrup(input());
    expect(p.cornerContainment).toHaveLength(4);
    expect(p.cornerContainment.every((c) => c.longitudinalBarId !== null)).toBe(true);
    expect(bendsWithoutLongitudinalBar([p])).toEqual([]);
  });

  it('reports a bend that grips NOTHING rather than passing it', () => {
    // A section with only bottom steel: the two top corners enclose nothing, which is the
    // clause being violated. It must be reported, not tolerated.
    const bottomOnly = bars().filter((b) => b.id.startsWith('b'));
    const p = buildClosedStirrup(input({ longitudinalBars: bottomOnly }));
    const bad = bendsWithoutLongitudinalBar([p]);
    expect(bad).toHaveLength(2);
    expect(bad[0].pieceId).toBe(p.path.id);
  });

  it('a crosstie grips a bar at both of its hooked ends', () => {
    const tie = buildCrosstie(input({ legs: 3 }), 0, 1);
    expect(tie.cornerContainment).toHaveLength(2);
    // The centre bottom bar b1 and — with no centre top bar — nothing at the top.
    expect(tie.cornerContainment[0].longitudinalBarId).toBe('b1');
    expect(tie.cornerContainment[1].longitudinalBarId).toBeNull();
  });

  it('a crosstie with a centre top bar grips both ends', () => {
    const zTop = H / 2 - (COVER + DS / 1000) - 16 / 2000;   // 0,234
    const withCentreTop = [...bars(), { id: 't-mid', across: 0, up: zTop, diameterMm: 16 }];
    const tie = buildCrosstie(input({ legs: 3, longitudinalBars: withCentreTop }), 0, 1);
    expect(tie.cornerContainment.every((c) => c.longitudinalBarId !== null)).toBe(true);
  });

  it('cites the clause on every piece', () => {
    for (const p of buildStirrupSet(input({ legs: 3 })).pieces) {
      const ids = p.refs.map((r) => r.clause);
      expect(ids.some((c) => c === '25.7.1.2' || c === '25.3.5')).toBe(true);
      for (const r of p.refs) expect(r.edition).toBe('2025');
      // SOURCE GATE: no column-only clause may appear on a beam transverse piece.
      expect(ids.some((c) => c.startsWith('25.7.2')), `${p.shape}: ${ids.join(',')}`).toBe(false);
    }
  });
});

// ─── Hooks and mandrels come from the table, not from here ───────

describe('hooks and mandrels are read from Table 25.3.2', () => {
  it('closes a stirrup with a tabulated standard hook (§25.7.1.3(a) + Table 25.3.2)', () => {
    expect(STIRRUP_HOOK_ANGLE).toBe(135);
  });

  it('gives a crosstie 135° at one end and 90° at the other — §25.3.5(b),(c)', () => {
    // NOT 135° at both ends, which is what this module produced first. (c) requires a standard
    // hook with a minimum 90° bend at the other end, and (e)'s alternation is about that end.
    expect(CROSSTIE_HOOK_ANGLE_135).toBe(135);
    expect(CROSSTIE_HOOK_ANGLE_90).toBe(90);
    const a = buildCrosstie(input({ legs: 3, hookOrientation: 'a' }), 0, 1);
    const b = buildCrosstie(input({ legs: 3, hookOrientation: 'b' }), 0, 1);
    const angles = (t: typeof a) => [t.path.startTreatment, t.path.endTreatment]
      .map((x) => (x.kind === 'hook' ? x.hook.angle : 0));
    expect(angles(a).slice().sort((x, y) => x - y)).toEqual([90, 135]);
    expect(angles(b).slice().sort((x, y) => x - y)).toEqual([90, 135]);
    // §25.3.5(e): the 90° end ALTERNATES between successive ties.
    expect(angles(a)).not.toEqual(angles(b));
  });

  it('cites §25.3.5 for a crosstie, and never the column clause §25.7.2.3', () => {
    const tie = buildCrosstie(input({ legs: 3 }), 0, 1);
    const ids = tie.refs.map((r) => r.clause);
    expect(ids).toContain('25.3.5');
    expect(ids).toContain('25.3.5(e)');
    expect(ids).toContain('22.5.8.5.5');
    expect(ids.some((c) => c.startsWith('25.7.2'))).toBe(false);
  });

  it('the stirrup hook geometry is exactly what standardHook returns — nothing local', () => {
    const expected = standardHook(DS, 135, 'transverse');
    const p = buildClosedStirrup(input());
    expect(p.path.startTreatment).toEqual({ kind: 'hook', hook: expected });
    expect(p.path.endTreatment).toEqual({ kind: 'hook', hook: expected });
    // Ø8 → mandrel 4·d_be = 32 mm, extension max(6·d_be, 75 mm) = 75 mm.
    expect(expected.mandrelDiameter).toBeCloseTo(0.032, 9);
    expect(expected.extension).toBeCloseTo(0.075, 9);
  });

  it('every bend uses the table mandrel, converted to a centreline radius', () => {
    const mandrel = minMandrelDiameter(DS, 'transverse').value;   // 0,032
    const r = (mandrel + DS / 1000) / 2;                          // 0,020
    const arcs = buildClosedStirrup(input()).path.segments.filter((s) => s.kind === 'arc');
    // FIVE bends, not four. A closed stirrup is one bar with two ends: three 90° corners
    // plus a 135° hook at each end, both at the closing corner. The count was four while
    // only one hook was drawn as geometry and the other was declared and missing.
    expect(arcs).toHaveLength(5);
    expect(arcs.filter((a) => a.sweepDeg === 90)).toHaveLength(3);
    expect(arcs.filter((a) => a.sweepDeg === 135)).toHaveLength(2);
    for (const a of arcs) expect(a.radius).toBeCloseTo(r, 9);
    // Every bend records the centre it turns about, or the collision detector measures it
    // as a chord cutting its own corner.
    for (const a of arcs) expect(a.centre).toBeDefined();
  });

  it('§25.7.1.3(a) covers every stirrup diameter this app generates', () => {
    expect(HOOK_ANCHORAGE_MAX_DIA_MM).toBe(16);
    for (const d of [6, 8, 10, 12]) expect(hookAnchorageIsSupported(d)).toBe(true);
  });

  it('REFUSES Ø20 and Ø25, because §25.7.1.3(b) needs an embedment length', () => {
    // Applying (a) beyond its stated diameter range would be a check never performed.
    expect(hookAnchorageIsSupported(20)).toBe(false);
    const set = buildStirrupSet(input({ stirrupDiaMm: 20 }));
    expect(set.pieces).toEqual([]);
    expect(set.unsupported.map((r) => r.clause)).toContain('25.7.1.3(b)');
  });
});

// ─── Hook staggering is PRACTICE, not a requirement ──────────────

describe('§25.3.5(e) alternation — NORMATIVE, not practice', () => {
  it('alternating orientation produces mirrored geometry', () => {
    const a = buildClosedStirrup(input({ hookOrientation: 'a' }));
    const b = buildClosedStirrup(input({ hookOrientation: 'b' }));
    expect(a.hookOrientation).toBe('a');
    expect(b.hookOrientation).toBe('b');
    // Same fabricated length — it is the same bent shape, mirrored.
    expect(a.path.cuttingLength).toBeCloseTo(b.path.cuttingLength, 9);
    expect(a.path.segments[0].start).not.toEqual(b.path.segments[0].start);
  });

  it('crosstie hooks differ at its two ends, and swap with the orientation', () => {
    // §25.3.5(b)/(c): 135° at one end, a standard hook of at least 90° at the other. (e) makes
    // WHICH end carries the 90° alternate between successive ties.
    //
    // This used to be asserted as the two tips differing along the member AXIS, which was a
    // consequence of the old geometry rather than the clause — the hooks extended along the
    // axis, out of the section plane, and a tail parallel to a bar embraces nothing. They now
    // curl about the bar in the section plane, so both tips share a station and the clause has
    // to be asserted directly.
    const a = buildCrosstie(input({ legs: 3, hookOrientation: 'a' }), 0, 1);
    const b = buildCrosstie(input({ legs: 3, hookOrientation: 'b' }), 0, 1);
    const angles = (t: typeof a) => [
      t.path.startTreatment.kind === 'hook' ? t.path.startTreatment.hook.angle : null,
      t.path.endTreatment.kind === 'hook' ? t.path.endTreatment.hook.angle : null,
    ];
    expect(angles(a)).toEqual([90, 135]);
    expect(angles(b)).toEqual([135, 90]);
  });
});

// ─── §25.7.2.3(b) unbraced bars ──────────────────────────────────

describe('§25.7.2.3(b) — no unbraced bar beyond 15·d_be or 150 mm clear', () => {
  it('applies the LESSER of the two terms', () => {
    // Ø8 → 15·8 = 120 mm, which is less than 150 mm, so 120 mm governs.
    expect(unbracedBarReport(bars(), [-0.121, 0.121], 8).limit).toBeCloseTo(0.120, 9);
    // Ø12 → 15·12 = 180 mm, so the 150 mm term governs.
    expect(unbracedBarReport(bars(), [-0.121, 0.121], 12).limit).toBeCloseTo(0.150, 9);
  });

  it('passes the reference cage: the centre bottom bar is close to a braced corner bar', () => {
    const r = unbracedBarReport(bars(), legOffsetsAcross(2, B, COVER, DS), 8);
    expect(r.ok).toBe(true);
    expect(r.offenders).toEqual([]);
  });

  it('flags a bar too far from any braced bar', () => {
    const wide: LongitudinalBarRef[] = [
      { id: 'L', across: -0.40, up: -0.20, diameterMm: 16 },
      { id: 'M', across: 0, up: -0.20, diameterMm: 16 },
      { id: 'R', across: 0.40, up: -0.20, diameterMm: 16 },
    ];
    const r = unbracedBarReport(wide, [-0.40, 0.40], 8);
    expect(r.ok).toBe(false);
    expect(r.offenders.map((o) => o.id)).toEqual(['M']);
    expect(r.offenders[0].clearToNearestBraced).toBeGreaterThan(r.limit);
  });

  it('a crosstie at the offending bar braces it', () => {
    const wide: LongitudinalBarRef[] = [
      { id: 'L', across: -0.40, up: -0.20, diameterMm: 16 },
      { id: 'M', across: 0, up: -0.20, diameterMm: 16 },
      { id: 'R', across: 0.40, up: -0.20, diameterMm: 16 },
    ];
    expect(unbracedBarReport(wide, [-0.40, 0, 0.40], 8).ok).toBe(true);
  });
});

// ─── Station sequence ────────────────────────────────────────────

describe('station sequence', () => {
  it('runs from the zone boundary, at the allowed spacing when it divides the span', () => {
    // No invented "s/2 from the face" offset: §25.7.1.1 prescribes none.
    expect(stirrupStations({ from: 0, to: 0.6, spacing: 0.15, nextZoneStartsAtEnd: false }))
      .toEqual([0, 0.15, 0.3, 0.45, 0.6]);
  });

  it('distributes evenly, at or under the maximum, when the spacing does not divide', () => {
    // Table 9.7.6.2.2 states a MAXIMUM. `ceil(0,5/0,2) = 3` intervals of 166,7 mm respects it
    // and lands on both zone ends.
    //
    // The previous rule ran at exactly 200 mm and then tacked a station on AT the end, which
    // left the last two stirrups a REMAINDER apart — whatever the zone length happened to
    // leave over. On the qa-8 fixture that was two Ø8 stirrups 31 mm apart, four times: two
    // bars where the design asked for one, at a spacing nothing chose.
    const s = stirrupStations({ from: 0, to: 0.5, spacing: 0.2, nextZoneStartsAtEnd: false });
    expect(s).toEqual([0, 0.166667, 0.333333, 0.5]);
    expect(s[s.length - 1]).toBeCloseTo(0.5, 9);
    for (let i = 1; i < s.length; i++) expect(s[i] - s[i - 1]).toBeLessThanOrEqual(0.2 + 1e-9);
  });

  it('does NOT duplicate the bar at a shared zone boundary', () => {
    // The first zone yields the boundary to the second, so one point gets one bar.
    const a = stirrupStations({ from: 0, to: 0.6, spacing: 0.15, nextZoneStartsAtEnd: true });
    const b = stirrupStations({ from: 0.6, to: 1.2, spacing: 0.3, nextZoneStartsAtEnd: false });
    expect(a).toEqual([0, 0.15, 0.3, 0.45]);
    expect(b[0]).toBe(0.6);
    expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
  });

  it('refuses degenerate input rather than looping', () => {
    expect(stirrupStations({ from: 0, to: 0, spacing: 0.1, nextZoneStartsAtEnd: false })).toEqual([]);
    expect(stirrupStations({ from: 0, to: 1, spacing: 0, nextZoneStartsAtEnd: false })).toEqual([]);
    expect(stirrupStations({ from: 1, to: 0, spacing: 0.1, nextZoneStartsAtEnd: false })).toEqual([]);
  });

  it('the count a schedule reports is derivable from the sequence', () => {
    const s = stirrupStations({ from: 0, to: 1.2, spacing: 0.1, nextZoneStartsAtEnd: false });
    expect(s).toHaveLength(13);   // 0 … 1,2 inclusive
  });
});

// ─── The fabricated set satisfies the table it was built from ────

describe('the fabricated set satisfies both columns of its row', () => {
  it('row 1, 2 legs, 250 mm along — passes', () => {
    const limits = transverseSpacingLimits('2025', {
      VsRequired: 0, bw: B, d: 0.509, fc: 30, cover: COVER, stirrupDiaMm: DS,
    });
    expect(limits.row).toBe('row1');
    const set = buildStirrupSet(input({ legs: limits.requiredLegs }));
    const v = setSatisfiesLimits(set.pieces, limits, 0.25);
    expect(v.ok).toBe(true);
    expect(v.worstAcrossGap).toBeCloseTo(0.242, 9);
  });

  it('row 2, 2 legs — FAILS across the width, and 3 legs fixes it', () => {
    const limits = transverseSpacingLimits('2025', {
      VsRequired: 1e6, bw: B, d: 0.509, fc: 30, cover: COVER, stirrupDiaMm: DS,
    });
    expect(limits.row).toBe('row2');
    expect(limits.requiredLegs).toBe(3);

    const two = buildStirrupSet(input({ legs: 2 }));
    const bad = setSatisfiesLimits(two.pieces, limits, 0.10);
    expect(bad.acrossOk).toBe(false);
    expect(bad.worstAcrossGap).toBeCloseTo(0.242, 9);   // vs a 200 mm limit

    const three = buildStirrupSet(input({ legs: 3 }));
    const good = setSatisfiesLimits(three.pieces, limits, 0.10);
    expect(good.ok).toBe(true);
    expect(good.worstAcrossGap).toBeCloseTo(0.121, 9);
  });

  it('catches an over-wide along-member spacing too', () => {
    const limits = transverseSpacingLimits('2025', {
      VsRequired: 1e6, bw: B, d: 0.509, fc: 30, cover: COVER, stirrupDiaMm: DS,
    });
    const set = buildStirrupSet(input({ legs: 3 }));
    expect(setSatisfiesLimits(set.pieces, limits, 0.30).alongOk).toBe(false);
  });
});

// ─── Fabrication data ────────────────────────────────────────────

describe('fabrication data', () => {
  it('a closed stirrup cutting length is the developed centreline, hooks included', () => {
    // Hand check: perimeter of the 242 × 492 centreline rectangle is 1,468 m. Rounding the
    // four corners at r = 20 mm shortens it (each corner trades 2r of straight for a quarter
    // arc of length πr/2), and the closing 135° hook adds its 75 mm extension. So the
    // fabricated length must be near, but not equal to, the raw perimeter.
    const p = buildClosedStirrup(input());
    const rawPerimeter = 2 * (0.242 + 0.492);
    expect(p.path.cuttingLength).toBeGreaterThan(rawPerimeter * 0.9);
    expect(p.path.cuttingLength).toBeLessThan(rawPerimeter * 1.2);
    expect(p.path.cuttingLength).toBeCloseTo(
      p.path.segments.reduce((s, g) => s + g.length, 0), 9);
  });

  it('a crosstie is shorter than a stirrup of the same section', () => {
    const set = buildStirrupSet(input({ legs: 3 }));
    const [stirrup, tie] = set.pieces;
    expect(tie.path.cuttingLength).toBeLessThan(stirrup.path.cuttingLength);
    // It spans the depth plus two hooks.
    expect(tie.path.cuttingLength).toBeGreaterThan(0.492);
  });

  it('every piece carries owner, zone, station and a stable id', () => {
    for (const p of buildStirrupSet(input({ legs: 3 })).pieces) {
      expect(p.elementId).toBe(162);
      expect(p.zoneId).toBe('e162:support:0');
      expect(p.station).toBeCloseTo(0.05, 9);
      expect(p.path.ownerElementIds).toEqual([162]);
      expect(p.path.id).toContain('e162:support:0');
      expect(p.path.role).toBe('transverse');
      expect(p.path.source).toBe('generated');
      expect(p.path.diameterMm).toBe(DS);
    }
  });

  it('ids are stable across runs and unique within a set', () => {
    const a = buildStirrupSet(input({ legs: 4, b: 0.9 })).pieces.map((p) => p.path.id);
    const b = buildStirrupSet(input({ legs: 4, b: 0.9 })).pieces.map((p) => p.path.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });

  it('identical shapes at different stations differ only by station in the id', () => {
    const s1 = buildClosedStirrup(input({ station: 0.05 }));
    const s2 = buildClosedStirrup(input({ station: 0.20 }));
    expect(s1.path.id).not.toBe(s2.path.id);
    // Same fabricated shape → a schedule may share one mark between them.
    expect(s1.path.cuttingLength).toBeCloseTo(s2.path.cuttingLength, 9);
    expect(s1.path.diameterMm).toBe(s2.path.diameterMm);
  });

  it('geometry moves with the station along the member axis', () => {
    const s1 = buildClosedStirrup(input({ station: 0.05 }));
    const s2 = buildClosedStirrup(input({ station: 0.20 }));
    expect(s2.path.segments[0].start.x - s1.path.segments[0].start.x).toBeCloseTo(0.15, 9);
    // and not across or up
    expect(s2.path.segments[0].start.y).toBeCloseTo(s1.path.segments[0].start.y, 9);
    expect(s2.path.segments[0].start.z).toBeCloseTo(s1.path.segments[0].start.z, 9);
  });
});
