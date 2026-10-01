// A non-finite subdivision count must not be able to hang the tab.
//
// `structuredBreakpoints` sanitized its `target` (with a comment explaining
// exactly this hazard) but not its `fixed`, and `buildBilinearQuadGrid` checked
// neither. `Math.round(Infinity)` is Infinity and `Math.max(1, Infinity)` is
// Infinity, so `i < nn` never went false. The loop did not even end in an
// out-of-memory crash: `(i * (hi - lo)) / Infinity` is 0 for every i, so the Set
// held a single value, memory stayed flat, and the tab froze with no error —
// measured at 20 million iterations still running.
//
// The guard lives in one place, `sanitizeDivisions`, and is pinned there
// first: those assertions touch no loop, so a broken guard fails them in
// milliseconds. The tests after it drive the real loops with non-finite input.
// A timeout cannot rescue those: Vitest enforces it with a timer, and a timer
// never runs while a synchronous loop holds the thread — a guard bypassed in a
// loop would hang the suite, not fail it, and only the CI job's own timeout
// would stop it. That is why the helper is tested on its own.
import { describe, it, expect } from 'vitest';
import { structuredBreakpoints } from '../geometry';
import {
  buildBilinearQuadGrid, sanitizeDivisions, MAX_DIVISIONS_PER_AXIS, type MeshVec3,
} from '../../engine/shell-mesh-gen';
import { exceedsDivisionCap } from '../../model/edit/mesh-region';
import { meshSettingsValid } from '../draft';

describe('sanitizeDivisions — the one guard every mesher uses', () => {
  it('gives the caller\u2019s fallback for a count that is not a number', () => {
    expect(sanitizeDivisions(Infinity, 2)).toBe(2);
    expect(sanitizeDivisions(-Infinity, 4)).toBe(4);
    expect(sanitizeDivisions(NaN, 1)).toBe(1);
    expect(sanitizeDivisions(undefined, 4)).toBe(4);
  });

  it('rounds, and keeps the count between 1 and the cap', () => {
    expect(sanitizeDivisions(3.6, 1)).toBe(4);
    expect(sanitizeDivisions(0, 1)).toBe(1);
    expect(sanitizeDivisions(-7, 1)).toBe(1);
    expect(sanitizeDivisions(1e9, 1)).toBe(MAX_DIVISIONS_PER_AXIS);
  });
});

/** Marks a guard that fails slowly — a huge but finite count — as failed once it
 *  returns. It cannot interrupt an infinite loop; see the header. */
const GUARD_TIMEOUT = 5_000;

const FLAT: [MeshVec3, MeshVec3, MeshVec3, MeshVec3] = [
  { x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 2, z: 0 }, { x: 0, y: 2, z: 0 },
];

function makeHooks() {
  let nextId = 1;
  const quads: Array<[number, number, number, number]> = [];
  return {
    quads,
    hooks: {
      findNode: () => null,
      addNode: () => nextId++,
      addQuad: (ns: [number, number, number, number]) => { quads.push(ns); },
    },
  };
}

describe('structuredBreakpoints — fixedDivisions cannot run away', () => {
  it('returns for a non-finite division count instead of looping forever', () => {
    const r = structuredBreakpoints(0, 10, { mode: 'fixedDivisions', fixed: Infinity });
    expect(r.lines.length).toBeGreaterThan(1);
    expect(r.lines.every((v) => Number.isFinite(v))).toBe(true);
    expect(r.lines[0]).toBe(0);
    expect(r.lines[r.lines.length - 1]).toBe(10);
  }, GUARD_TIMEOUT);

  it('treats NaN as the documented default rather than skipping subdivision', () => {
    // Before: nn was NaN, `i < NaN` is false, the span came back undivided as
    // [0, 10] — a silently coarser mesh than the caller asked for.
    const nan = structuredBreakpoints(0, 10, { mode: 'fixedDivisions', fixed: NaN });
    const dflt = structuredBreakpoints(0, 10, { mode: 'fixedDivisions', fixed: undefined });
    expect(nan.lines).toEqual(dflt.lines);
    expect(nan.lines.length).toBe(3); // default of 2 divisions
  }, GUARD_TIMEOUT);

  it('still honors an ordinary division count exactly', () => {
    const r = structuredBreakpoints(0, 10, { mode: 'fixedDivisions', fixed: 4 });
    expect(r.lines).toEqual([0, 2.5, 5, 7.5, 10]);
  }, GUARD_TIMEOUT);

  it('caps an absurd but finite count instead of generating millions of cells', () => {
    const r = structuredBreakpoints(0, 10, { mode: 'fixedDivisions', fixed: 5_000_000 });
    expect(r.lines.length).toBeLessThanOrEqual(257);
  }, GUARD_TIMEOUT);
});

describe('buildBilinearQuadGrid — non-finite divisions cannot run away', () => {
  it('returns for Infinity divisions instead of growing the grid forever', () => {
    const t = makeHooks();
    const r = buildBilinearQuadGrid(FLAT, Infinity, Infinity, t.hooks);
    expect(r.quadCount).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(r.quadCount)).toBe(true);
    expect(r.nodeGrid.length).toBeLessThanOrEqual(257);
  }, GUARD_TIMEOUT);

  it('produces a real cell for NaN divisions rather than an empty grid', () => {
    // Before: `j <= NaN` is false, so no node row and no quad was ever built
    // and the caller got a silently empty mesh back.
    const t = makeHooks();
    const r = buildBilinearQuadGrid(FLAT, NaN, NaN, t.hooks);
    expect(r.quadCount).toBe(1);
    expect(t.quads.length).toBe(1);
  }, GUARD_TIMEOUT);

  it('leaves ordinary counts exactly as they were', () => {
    const t = makeHooks();
    const r = buildBilinearQuadGrid(FLAT, 2, 2, t.hooks);
    expect(r.quadCount).toBe(4);
    expect(r.nodeGrid.length).toBe(3);
    expect(r.nodeGrid[0].length).toBe(3);
  }, GUARD_TIMEOUT);
});

describe('a request beyond the cap is said, not silently coarsened', () => {
  const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

  it('fixed divisions past the cap are flagged, at the cap are not', () => {
    expect(exceedsDivisionCap(square, { mode: 'fixedDivisions', nx: 300, ny: 4 })).toBe(true);
    expect(exceedsDivisionCap(square, { mode: 'fixedDivisions', nx: MAX_DIVISIONS_PER_AXIS, ny: 4 })).toBe(false);
  });

  it('a target size that would need more cells than the cap is flagged', () => {
    expect(exceedsDivisionCap(square, { mode: 'targetSize', size: 0.001 })).toBe(true); // 1000 per side
    expect(exceedsDivisionCap(square, { mode: 'targetSize', size: 0.01 })).toBe(false); // 100 per side
  });
});

describe('target-size meshing past the cap is said too', () => {
  it.each([1e-308, Number.MIN_VALUE])('caps an overflowing quotient for a finite target %s', (target) => {
    const r = structuredBreakpoints(0, 10, { mode: 'targetSize', target });
    expect(r.lines).toHaveLength(MAX_DIVISIONS_PER_AXIS + 1);
    expect(r.lines[0]).toBe(0);
    expect(r.lines.at(-1)).toBe(10);
    expect(r.lines.every(Number.isFinite)).toBe(true);
    expect(r.capped).toBe(1);
  });

  it('structuredBreakpoints counts the gaps it had to coarsen', () => {
    const r = structuredBreakpoints(0, 10, { mode: 'targetSize', target: 0.001 });
    expect(r.lines.length).toBe(MAX_DIVISIONS_PER_AXIS + 1);
    expect(r.capped).toBe(1);
    expect(structuredBreakpoints(0, 10, { mode: 'targetSize', target: 0.5 }).capped).toBe(0);
  });
});

describe('the wizard judges only the mesh setting it uses', () => {
  it('ignores the division count when slabs are meshed by size, or not meshed', () => {
    expect(meshSettingsValid({ meshSlabs: true, meshMode: 'targetSize', meshDivisions: 300, meshTargetSize: 0.5 })).toBe(true);
    expect(meshSettingsValid({ meshSlabs: false, meshMode: 'fixedDivisions', meshDivisions: Infinity, meshTargetSize: 0 })).toBe(true);
    expect(meshSettingsValid({ meshSlabs: true, meshMode: 'fixedDivisions', meshDivisions: 300, meshTargetSize: 0.5 })).toBe(false);
    expect(meshSettingsValid({ meshSlabs: true, meshMode: 'fixedDivisions', meshDivisions: 4, meshTargetSize: NaN })).toBe(true);
    expect(meshSettingsValid({ meshSlabs: true, meshMode: 'targetSize', meshDivisions: 4, meshTargetSize: 0 })).toBe(false);
  });
});
