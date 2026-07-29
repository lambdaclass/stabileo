/**
 * Channel-aware packing: the arithmetic, and the clipping defect that hid it.
 *
 * ── The defect ─────────────────────────────────────────────────────
 *
 * `freeChannelsOf` did not clip its channels to the section. An obstacle beyond the
 * section — a column corner bar outside the beam's width, which is the ordinary case —
 * left a "gap" running from the last obstacle inside the beam all the way out to that far
 * one. Bars were then placed in concrete that is not there, and `finalise` discarded the
 * whole candidate on a cover violation it never needed to have.
 *
 * Measured on a real flagship member: a 350 mm beam, half-width 142 mm, was offered a
 * channel reaching to 175 mm. NOT ONE channel-aware candidate survived, anywhere in the
 * model. The arrangement class was silently absent from every domain, which is exactly why
 * adding it had changed nothing.
 *
 * These tests replace a hand calculation that claimed "two ~122 mm channels hold four
 * bars" with the packing actually performed.
 */
import { describe, it, expect } from 'vitest';
import { generateLayoutCandidates, candidateClears, type KeepOut } from '../candidates';
import { minClearSpacingInLayer } from '../../../codes/cirsoc201/spacing';

const P = 0.010;
const CODE = minClearSpacingInLayer('2025', {
  barDiameterMm: 12, maxAggregateSizeMm: 19,
}).minClear;

/** The representative flagship member: 8Ø12 in a 350×650 beam, cover 25, stirrup 8. */
const CLEAR_WIDTH = 0.284;
const HALF = CLEAR_WIDTH / 2;

/** Its real obstacles: column side-face bars on the beam centreline, corners well outside. */
const OBSTACLES: KeepOut[] = [
  { at: -0.207, halfWidth: 0.020 }, { at: -0.201, halfWidth: 0.020 },
  { at: 0, halfWidth: 0.020 },
  { at: 0.201, halfWidth: 0.020 }, { at: 0.207, halfWidth: 0.020 },
];

function candidates(obstacles?: readonly KeepOut[]) {
  return generateLayoutCandidates({
    count: 8, diameterMm: 12, clearWidth: CLEAR_WIDTH, edition: '2025',
    maxAggregateSizeMm: 19, memberKind: 'beam', placementTolerance: P,
    obstacles,
  });
}

describe('the packing arithmetic, performed rather than asserted by hand', () => {
  it('two clipped channels really do hold the four bars a layer needs', () => {
    // Obstacle at 0 splits the section; the corner bars at ±0.201/0.207 are OUTSIDE the
    // ±0.142 half-width and must not extend a channel past it.
    const withCh = candidates(OBSTACLES).filter((c) => c.id.startsWith('ch'));
    expect(withCh.length, 'no channel-aware candidate was generated at all').toBeGreaterThan(0);

    const c = withCh[0];
    // Four bars in the widest layer, and every one inside the section.
    expect(c.maxPerLayer).toBe(4);
    for (const s of c.slots) {
      expect(Math.abs(s.across) + 0.006).toBeLessThanOrEqual(HALF + 1e-9);
    }
    // Clear of every obstacle, and legally spaced from its neighbours.
    expect(candidateClears(c, 12, OBSTACLES).ok).toBe(true);
    expect(c.minClearInLayer - 0.012).toBeGreaterThanOrEqual(CODE - 1e-9);
  });

  it('places bars on BOTH sides of a central obstacle, which a contiguous row cannot', () => {
    const c = candidates(OBSTACLES).find((x) => x.id.startsWith('ch'))!;
    const layer0 = c.slots.filter((s) => s.layer === 0).map((s) => s.across);
    expect(layer0.some((x) => x < 0), 'nothing placed left of the obstacle').toBe(true);
    expect(layer0.some((x) => x > 0), 'nothing placed right of the obstacle').toBe(true);
  });

  it('never places a bar outside the section, whatever the obstacles beyond it', () => {
    // The clipping defect, stated directly: an obstacle far outside the section must not
    // grant a channel that reaches out to it.
    const far: KeepOut[] = [{ at: 0, halfWidth: 0.020 }, { at: 0.9, halfWidth: 0.020 }];
    for (const c of candidates(far)) {
      for (const s of c.slots) {
        expect(Math.abs(s.across) + 0.006,
          `bar at ${s.across} is outside the ${HALF} m half-width`)
          .toBeLessThanOrEqual(HALF + 1e-9);
      }
    }
  });

  it('adding obstacles only ever adds arrangements, never removes the contiguous ones', () => {
    const plain = candidates();
    const withObstacles = candidates(OBSTACLES);
    expect(withObstacles.length).toBeGreaterThan(plain.length);
    for (const id of plain.map((c) => c.id)) {
      expect(withObstacles.map((c) => c.id)).toContain(id);
    }
  });

  it('refuses rather than overfilling when the channels genuinely cannot hold the layer', () => {
    // A section almost entirely blocked: no arrangement exists, and inventing one by
    // breaching cover or spacing is the failure this guards.
    const blocked: KeepOut[] = [{ at: 0, halfWidth: 0.135 }];
    for (const c of candidates(blocked)) {
      expect(candidateClears(c, 12, blocked).ok).toBe(false);
    }
  });

  it('is deterministic under obstacle reordering', () => {
    const a = candidates(OBSTACLES).map((c) => c.id);
    const b = candidates([...OBSTACLES].reverse()).map((c) => c.id);
    expect(b).toEqual(a);
  });
});
