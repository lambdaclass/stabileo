/**
 * The verifier, the candidate generator and the drawing must describe the SAME column.
 *
 * ── What went wrong ────────────────────────────────────────────────
 *
 * Three subsystems each placed column bars their own way:
 *
 *   computeColumnLayout        four faces, apportioned per face — CORRECT, and the layout
 *                              the PR15 certificate is issued against
 *   generateColumnStack        every non-corner bar on the two ±y faces — ILLEGAL, 8 mm
 *                              clear where §25.2.3 asks 40
 *   generateColumnCandidates   per AXIS then alternating faces, so the corner-to-first-bar
 *                              gap carried the pitch for twice as many bars as the face
 *                              actually holds
 *
 * The third rejected arrangements the first had certified. A 28Ø12 column that the verifier
 * places at 46.9 mm clear — comfortably above the 40 mm required — was offered no cage at
 * all, and the frame was reported as impossible to detail on the strength of it.
 *
 * There is now one primitive. These tests exist to keep it that way.
 */
import { describe, it, expect } from 'vitest';
import { computeColumnLayout } from '../../station-design-forces';
import { generateColumnCandidates } from '../column-candidates';
import { minClearSpacingColumn } from '../../../codes/cirsoc201/spacing';

const RULE = { edition: '2025', maxAggregateSizeMm: 19 } as never;

function authoritative(count: number, dia: number, size: number) {
  return computeColumnLayout(count, dia, size, size, 0.03, 8, undefined, RULE);
}

function candidates(count: number, dia: number, size: number) {
  return generateColumnCandidates({
    count, diameterMm: dia, b: size, h: size, cover: 0.03, tieDiaMm: 8,
    edition: '2025', maxAggregateSizeMm: 19, placementTolerance: 0.010,
  });
}

const CASES: Array<[number, number, number]> = [
  [8, 20, 0.5], [12, 20, 0.5], [20, 16, 0.5], [24, 12, 0.5], [28, 12, 0.5], [4, 32, 0.5],
];

describe('one column layout, shared by every subsystem', () => {
  it.each(CASES)('%iØ%i in %fm: the verifier and the generator agree exactly',
    (count, dia, size) => {
      const auth = authoritative(count, dia, size);
      const even = candidates(count, dia, size).find((c) => c.arrangement === 'even');
      expect(even, `${count}Ø${dia} is certified but no cage was offered`).toBeDefined();

      // Identical coordinates, not merely a similar arrangement.
      const authSlots = auth.bars
        .map((b) => [Math.round((b.x - size / 2) * 1e6), Math.round((b.y - size / 2) * 1e6)])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const candSlots = even!.slots
        .map((s) => [Math.round(s.dx * 1e6), Math.round(s.dy * 1e6)])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      expect(candSlots).toEqual(authSlots);
    });

  it.each(CASES)('%iØ%i in %fm: anything the verifier certifies gets a cage',
    (count, dia, size) => {
      const auth = authoritative(count, dia, size);
      if (!auth.constructible) return;   // legitimately refused by both
      expect(candidates(count, dia, size).length,
        'the verifier certified this arrangement; refusing to draw it is a contradiction')
        .toBeGreaterThan(0);
    });
});

describe('placement tolerance widens the drawing, it never vetoes the code', () => {
  it('accepts a cage at the code minimum even though it is below minimum + tolerance', () => {
    // 28Ø12 in a 500 mm column sits at 46.9 mm clear: legal against the 40 mm required,
    // and below the 50 mm a "minimum plus tolerance" threshold would demand. Using the
    // target as a rejection threshold is how a certified column came to have no cage.
    const required = minClearSpacingColumn('2025', {
      barDiameterMm: 12, maxAggregateSizeMm: 19,
    }).minClear;
    const even = candidates(28, 12, 0.5).find((c) => c.arrangement === 'even');
    expect(even).toBeDefined();
    expect(even!.minClear).toBeGreaterThanOrEqual(required - 1e-9);
    expect(even!.minClear).toBeLessThan(required + 0.010);
  });

  it('still refuses anything genuinely below the code minimum', () => {
    // The tolerance was relaxed as a VETO, not as the floor. The floor still holds.
    const required = minClearSpacingColumn('2025', {
      barDiameterMm: 25, maxAggregateSizeMm: 19,
    }).minClear;
    for (const c of candidates(20, 25, 0.4)) {
      expect(c.minClear).toBeGreaterThanOrEqual(required - 1e-9);
    }
  });
});
