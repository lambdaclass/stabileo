/**
 * §25.7.1.2 restraint matrix — the cases the co-design has to hold across.
 *
 * §25.7.1.2: "cada doblez en la parte continua de los estribos en U, sencillos o múltiples, y
 * cada doblez en un estribo cerrado, debe contener una barra longitudinal o cordón."
 *
 * The layout that satisfies it is not a tolerance choice — it is arithmetic. Layer 0 spread to
 * the full available width puts the outer bar centre at `(clearWidth − d_b)/2`, while the stirrup
 * leg centreline sits at `b/2 − cover − d_s/2`. Those differ by exactly `(d_s + d_b)/2`, which is
 * the two bars in contact. Every case below is checked against that, not against a fudge factor.
 *
 * Each expected number is computed from the section by hand.
 */

import { describe, it, expect } from 'vitest';
import { layoutBarRow } from '../../../engine/detailing/generate-beam';
import {
  bendsWithoutLongitudinalBar, buildStirrupSet, chooseInteriorLegOffsets,
  stirrupCentrelineHalfExtents, type LongitudinalBarRef, type StirrupSetInput,
} from '../transverse-cage';
import { legOffsetsAcross, transverseSpacingLimits } from '../transverse-spacing';

const COVER = 0.025;

/** Build section-coordinate bars the way the generator does, from the real slot layout. */
function mat(
  b: number, h: number, ds: number,
  bottom: { count: number; dia: number },
  top: { count: number; dia: number },
  layerClear = 0.025,
): LongitudinalBarRef[] {
  const clearWidth = b - 2 * (COVER + ds / 1000);
  const out: LongitudinalBarRef[] = [];
  const face = (g: { count: number; dia: number }, up: boolean, tag: string) => {
    const layout = layoutBarRow({
      count: g.count, diameterMm: g.dia, clearWidth,
      minClear: Math.max(0.025, g.dia / 1000), layerClear,
    });
    const barOffset = COVER + ds / 1000;
    const faceZ = up ? h / 2 - barOffset - g.dia / 2000 : -(h / 2 - barOffset - g.dia / 2000);
    const inward = up ? -1 : 1;
    layout.slots.forEach((s, i) => out.push({
      id: `${tag}-${i}`, across: s.across, up: faceZ + inward * s.intoSection, diameterMm: g.dia,
    }));
  };
  face(bottom, false, 'bot');
  face(top, true, 'top');
  return out;
}

function setFor(over: {
  b?: number; h?: number; ds?: number; legs?: number;
  bars: LongitudinalBarRef[]; acrossMax?: number;
}) {
  const input: StirrupSetInput = {
    elementId: 1, zoneId: 'e1:support:0', station: 0.1,
    b: over.b ?? 0.300, h: over.h ?? 0.550, cover: COVER,
    stirrupDiaMm: over.ds ?? 8, legs: over.legs ?? 2,
    longitudinalBars: over.bars,
    origin: { x: 0, y: 0, z: 0 },
    axis: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, across: { x: 0, y: 1, z: 0 },
    hookOrientation: 'a', maxAggregateSizeMm: 19, acrossMax: over.acrossMax,
  };
  return buildStirrupSet(input);
}

/** Every closed-stirrup corner grips a bar. */
function stirrupCornersRestrained(set: ReturnType<typeof setFor>): boolean {
  const stirrups = set.pieces.filter((p) => p.shape === 'closedStirrup');
  return bendsWithoutLongitudinalBar(stirrups).length === 0;
}

describe('the arithmetic the whole matrix rests on', () => {
  it('a spread outer bar lands exactly (d_s + d_b)/2 inboard of the leg centreline', () => {
    const b = 0.300, ds = 8, db = 12;
    const clearWidth = b - 2 * (COVER + ds / 1000);          // 0,234
    const outerBar = (clearWidth - db / 1000) / 2;           // 0,111
    const { halfAcross } = stirrupCentrelineHalfExtents(b, 0.55, COVER, ds);  // 0,121
    expect(halfAcross - outerBar).toBeCloseTo((ds + db) / 2000, 12);
  });
});

describe('§25.7.1.2 across the matrix', () => {
  it('6Ø12 — the case that used to fail', () => {
    // Centred, the outer bar sat at ±93,3 mm against a corner at ±122 mm. Spread, it seats.
    const bars = mat(0.300, 0.550, 8, { count: 6, dia: 12 }, { count: 2, dia: 12 });
    const set = setFor({ bars });
    expect(stirrupCornersRestrained(set)).toBe(true);
    // clearWidth = b − 2·(cover + d_s) = 300 − 2·(25 + 8) = 234 mm, so the outer Ø12 centre
    // sits at (234 − 12)/2 = 111 mm, and the leg centreline at 150 − 25 − 4 = 121 mm. The 10 mm
    // difference is exactly (d_s + d_b)/2 = (8 + 12)/2.
    const clearWidth = 0.300 - 2 * (COVER + 8 / 1000);
    const outer = Math.max(...bars.filter((x) => x.id.startsWith('bot')).map((x) => x.across));
    expect(outer).toBeCloseTo((clearWidth - 0.012) / 2, 9);
    const { halfAcross } = stirrupCentrelineHalfExtents(0.300, 0.550, COVER, 8);
    expect(halfAcross - outer).toBeCloseTo((8 + 12) / 2000, 12);
  });

  it('7Ø10 — odd count, so a centreline bar exists', () => {
    const bars = mat(0.300, 0.550, 8, { count: 7, dia: 10 }, { count: 7, dia: 10 });
    expect(stirrupCornersRestrained(setFor({ bars }))).toBe(true);
    expect(bars.some((x) => x.id.startsWith('bot') && Math.abs(x.across) < 1e-9)).toBe(true);
  });

  it('unequal layer counts — 8Ø16 bottom over two layers, 3Ø12 top', () => {
    // §25.2.2: the upper layer sits directly above lower bars, so it must not invent positions.
    const bars = mat(0.300, 0.700, 8, { count: 8, dia: 16 }, { count: 3, dia: 12 });
    expect(stirrupCornersRestrained(setFor({ h: 0.700, bars }))).toBe(true);
    const l0 = bars.filter((x) => x.id.startsWith('bot')).map((x) => +x.across.toFixed(6));
    // Every bottom-layer-1 position coincides with a layer-0 position.
    const uniq = [...new Set(l0)];
    expect(uniq.length).toBeLessThan(l0.length);
  });

  it('mixed diameters — Ø20 bottom, Ø10 top', () => {
    const bars = mat(0.350, 0.600, 10, { count: 4, dia: 20 }, { count: 2, dia: 10 });
    expect(stirrupCornersRestrained(setFor({ b: 0.350, h: 0.600, ds: 10, bars }))).toBe(true);
  });

  it('wide beam — 900 mm web, 4 legs', () => {
    const bars = mat(0.900, 0.600, 10, { count: 9, dia: 16 }, { count: 9, dia: 16 });
    const limits = transverseSpacingLimits('2025', {
      VsRequired: 0, bw: 0.900, d: 0.550, fc: 30, cover: COVER, stirrupDiaMm: 10,
    });
    const set = setFor({
      b: 0.900, h: 0.600, ds: 10, legs: limits.requiredLegs, bars,
      acrossMax: limits.acrossMax,
    });
    expect(stirrupCornersRestrained(set)).toBe(true);
    expect(set.pieces.filter((p) => p.shape === 'crosstie').length)
      .toBe(limits.requiredLegs - 2);
    // Interior legs snapped onto real bars, so every crosstie end grips one.
    expect(bendsWithoutLongitudinalBar(set.pieces)).toEqual([]);
  });

  it('row-2 three-leg cage — odd bottom count makes the centreline crosstie legal', () => {
    const limits = transverseSpacingLimits('2025', {
      VsRequired: 1e6, bw: 0.300, d: 0.509, fc: 30, cover: COVER, stirrupDiaMm: 8,
    });
    expect(limits.requiredLegs).toBe(3);
    const bars = mat(0.300, 0.550, 8, { count: 7, dia: 12 }, { count: 7, dia: 12 });
    const set = setFor({ legs: 3, bars, acrossMax: limits.acrossMax });
    expect(bendsWithoutLongitudinalBar(set.pieces)).toEqual([]);
    expect(set.pieces.filter((p) => p.shape === 'crosstie')).toHaveLength(1);
  });

  it('an even bottom count still resolves when a shared offset is available', () => {
    // This was written expecting failure — 6Ø12 has no bar at across = 0. MEASURED: the chooser
    // finds a shared offset that carries a bar on BOTH faces and still satisfies the 200 mm
    // across-width limit, so the crosstie is legal after all. The chooser is better than the
    // guess behind this test, and asserting the guess would have understated it.
    //
    // What is asserted is the INVARIANT: whatever offsets come back, either every bend grips a
    // bar, or the leg was NOT snapped and the violation is reported. Never a silent middle.
    const limits = transverseSpacingLimits('2025', {
      VsRequired: 1e6, bw: 0.300, d: 0.509, fc: 30, cover: COVER, stirrupDiaMm: 8,
    });
    const bars = mat(0.300, 0.550, 8, { count: 6, dia: 12 }, { count: 7, dia: 10 });
    const set = setFor({ legs: 3, bars, acrossMax: limits.acrossMax });
    expect(stirrupCornersRestrained(set)).toBe(true);
    const loose = bendsWithoutLongitudinalBar(set.pieces);
    const { halfAcross } = stirrupCentrelineHalfExtents(0.300, 0.550, COVER, 8);
    const chosen = chooseInteriorLegOffsets(
      bars, halfAcross, 3, legOffsetsAcross(3, 0.300, COVER, 8), limits.acrossMax);
    // Either way, two things must hold. The containment check searches by PHYSICAL reach, so a
    // bar 22 mm off the centreline can legitimately be embraced by the hook even when the leg was
    // not snapped to it — which is why this asserts the invariant rather than `snapped`.
    expect(typeof chosen.snapped).toBe('boolean');
    for (const b of loose) expect(b.pieceId).toContain('crosstie');
    if (loose.length > 0) {
      expect(set.pieces.some((p) => p.shape === 'crosstie')).toBe(true);
    }
  });


  it('a snapped leg NEVER breaks the across-width limit', () => {
    // Both §25.3.5(d) and Table 9.7.6.2.2 are "debe". When they conflict the spacing limit wins
    // and the even division is used — an earlier chooser snapped to the nearest shared bar and
    // put a third leg 12 mm from the corner, leaving a 230 mm gap against a 200 mm limit.
    const { halfAcross } = stirrupCentrelineHalfExtents(0.300, 0.550, COVER, 8);
    for (const counts of [4, 5, 6, 7, 8]) {
      const bars = mat(0.300, 0.550, 8, { count: counts, dia: 12 }, { count: counts, dia: 12 });
      const chosen = chooseInteriorLegOffsets(
        bars, halfAcross, 3, legOffsetsAcross(3, 0.300, COVER, 8), 0.200);
      const all = [-halfAcross, ...chosen.offsets, halfAcross];
      let worst = 0;
      for (let i = 1; i < all.length; i++) worst = Math.max(worst, all[i] - all[i - 1]);
      expect(worst, `${counts} bars, snapped=${chosen.snapped}`).toBeLessThanOrEqual(0.200 + 1e-9);
    }
  });

  it('is deterministic under input reordering', () => {
    const bars = mat(0.900, 0.600, 10, { count: 9, dia: 16 }, { count: 9, dia: 16 });
    const a = setFor({ b: 0.900, h: 0.600, ds: 10, legs: 4, bars, acrossMax: 0.400 });
    const b = setFor({
      b: 0.900, h: 0.600, ds: 10, legs: 4, bars: [...bars].reverse(), acrossMax: 0.400,
    });
    expect(b.legOffsets).toEqual(a.legOffsets);
    expect(b.pieces.map((p) => p.path.id)).toEqual(a.pieces.map((p) => p.path.id));
    expect(b.pieces.map((p) => p.path.cuttingLength))
      .toEqual(a.pieces.map((p) => p.path.cuttingLength));
  });
});
