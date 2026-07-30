/**
 * Column cage arrangements.
 *
 * The module exists because holding the cage fixed made the global search report that no
 * beam arrangement fits — true, but for a reason that was the column's to fix. These tests
 * pin the legality of every arrangement and the property that motivates the alternative:
 * clustering the face bars widens the channel a beam bar has to pass through.
 */
import { describe, it, expect } from 'vitest';
import {
  generateColumnCandidates, cageKeepOuts, RESTRAINT_REACH_M,
} from '../column-candidates';
import { candidateClears, generateLayoutCandidates } from '../candidates';
import { minClearSpacingColumn } from '../../../codes/cirsoc201/spacing';

const BASE = {
  edition: '2025' as const, maxAggregateSizeMm: 19, placementTolerance: 0.010,
  cover: 0.03, tieDiaMm: 8,
};

function cages(count: number, dia: number, b: number, h = b) {
  return generateColumnCandidates({ ...BASE, count, diameterMm: dia, b, h });
}

describe('every arrangement is legal before anything else looks at it', () => {
  it('never breaches §25.2.3 clear spacing plus the placement allowance', () => {
    for (const [n, d, b] of [[8, 20, 0.5], [12, 25, 0.6], [8, 20, 0.4]] as const) {
      const required = minClearSpacingColumn('2025', {
        barDiameterMm: d, maxAggregateSizeMm: 19,
      }).minClear + 0.010;
      for (const c of cages(n, d, b)) {
        expect(c.minClear, `${n}Ø${d} in ${b}: ${c.arrangement}`)
          .toBeGreaterThanOrEqual(required - 1e-9);
      }
    }
  });

  it('keeps every bar inside the cover on all four faces', () => {
    for (const c of cages(12, 25, 0.6)) {
      const inset = 0.03 + 0.008 + 0.0125;
      for (const s of c.slots) {
        expect(Math.abs(s.dx)).toBeLessThanOrEqual(0.3 - inset + 1e-9);
        expect(Math.abs(s.dy)).toBeLessThanOrEqual(0.3 - inset + 1e-9);
      }
    }
  });

  it('always places the four corner bars, and marks them as corners', () => {
    for (const c of cages(8, 20, 0.5)) {
      expect(c.slots.filter((s) => s.corner)).toHaveLength(4);
    }
  });

  it('never changes the certified bar count', () => {
    for (const n of [4, 8, 12]) {
      for (const c of cages(n, 20, 0.6)) expect(c.slots).toHaveLength(n);
    }
  });

  it('is deterministic', () => {
    expect(cages(12, 25, 0.6).map((c) => c.id)).toEqual(cages(12, 25, 0.6).map((c) => c.id));
  });
});

describe('the clustered arrangement is the point of the module', () => {
  it('opens a materially wider channel than the even one', () => {
    const c = cages(8, 20, 0.5);
    const even = c.find((x) => x.arrangement === 'even')!;
    const clustered = c.find((x) => x.arrangement === 'clustered')!;
    expect(clustered.widestChannelX).toBeGreaterThan(even.widestChannelX * 1.5);
  });

  it('lets a large beam bar thread where the even cage will not', () => {
    // A dense cage: many face bars evenly spread leave narrow channels, while clustering
    // them at the corners merges those into one wide one.
    const c = cages(16, 16, 0.50);
    const even = c.find((x) => x.arrangement === 'even')!;
    const clustered = c.find((x) => x.arrangement === 'clustered')!;
    const t = { x: 1, y: 0 };
    const beam = generateLayoutCandidates({
      count: 3, diameterMm: 32, clearWidth: 0.30, edition: '2025',
      maxAggregateSizeMm: 19, memberKind: 'beam', placementTolerance: 0.010,
    });
    expect(beam.length).toBeGreaterThan(0);

    const fits = (cage: typeof even) =>
      beam.some((bc) => candidateClears(bc, 32, cageKeepOuts(cage, 32, t, 0.010)).ok);

    // The property that motivates the whole module. If the even cage ever starts passing
    // this on its own, the clustered alternative has stopped earning its place.
    expect(fits(clustered)).toBe(true);
    expect(fits(even)).toBe(false);
  });

  it('reports the crossties its arrangement makes necessary', () => {
    // Restraint is a CONSEQUENCE of where the bars went, so an arrangement that needs more
    // ties has to carry them rather than leaving a bar unrestrained on the drawing.
    for (const c of cages(16, 20, 0.9)) {
      // Restraint propagates: a bar within reach of a restrained bar is itself restrained,
      // which is how a run of face bars is held by the two tie corners at its ends.
      const restrained = c.slots.map((s) => s.corner);
      let changed = true;
      while (changed) {
        changed = false;
        for (const [i, slot] of c.slots.entries()) {
          if (restrained[i]) continue;
          for (const [j, other] of c.slots.entries()) {
            if (i === j || !restrained[j]) continue;
            if (Math.hypot(slot.dx - other.dx, slot.dy - other.dy) <= RESTRAINT_REACH_M) {
              restrained[i] = true; changed = true; break;
            }
          }
        }
      }
      for (const [i] of c.slots.entries()) {
        const tied = c.crossties.some((x) => x.fromIndex === i || x.toIndex === i);
        expect(restrained[i] || tied, `bar ${i} of ${c.arrangement} is unrestrained`)
          .toBe(true);
      }
    }
  });
});

describe('keep-outs match what the checker will apply', () => {
  it('charges only the bar radius and the placement tolerance for a crossing', () => {
    // A search stricter than the check it feeds declares infeasible what the checker would
    // pass. Crossing bars are tied in contact; §25.2.3 governs a column's own longitudinals.
    const cage = cages(8, 20, 0.5)[0];
    for (const k of cageKeepOuts(cage, 20, { x: 1, y: 0 }, 0.010)) {
      expect(k.halfWidth).toBeCloseTo(0.020 / 2 + 0.010, 9);
    }
  });

  it('projects the cage onto the beam axis the beam actually uses', () => {
    // A RECTANGULAR section: on a square one the two projections are the same set by
    // symmetry, and the test would pass without proving the projection happens at all.
    const cage = cages(8, 20, 0.4, 0.7)[0];
    const alongX = cageKeepOuts(cage, 20, { x: 1, y: 0 }, 0.010).map((k) => k.at).sort();
    const alongY = cageKeepOuts(cage, 20, { x: 0, y: 1 }, 0.010).map((k) => k.at).sort();
    expect(alongX).not.toEqual(alongY);
  });
});

describe('a locked cage fixes the domain', () => {
  it('offers exactly the pinned arrangement and nothing else', () => {
    const pinned = cages(8, 20, 0.5)[0].slots;
    const locked = generateColumnCandidates({
      ...BASE, count: 8, diameterMm: 20, b: 0.5, h: 0.5, locked: pinned,
    });
    expect(locked).toHaveLength(1);
    expect(locked[0].slots).toEqual(pinned);
  });
});
