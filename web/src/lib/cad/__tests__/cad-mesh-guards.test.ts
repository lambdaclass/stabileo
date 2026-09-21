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
// Every test here carries an explicit short timeout on purpose: if a guard is
// ever removed these assertions would not fail, they would hang, and a hung
// suite is a far worse signal than a red one.
import { describe, it, expect } from 'vitest';
import { structuredBreakpoints } from '../geometry';
import { buildBilinearQuadGrid, type MeshVec3 } from '../../engine/shell-mesh-gen';

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
