// `chainSegmentsIntoLoops` welded endpoints by scanning every vertex found so
// far, which is quadratic in the number of segments. This file is the contract
// for replacing that scan with a spatial index: the output must not change.
//
// It does not assert a speed — a wall-clock assertion in CI is a flaky test,
// and the measurement belongs in the commit message. What it asserts is
// equivalence against the original implementation, reproduced verbatim below,
// on inputs chosen to exercise the part that is easy to get wrong: the linear
// scan returned the FIRST vertex within `tol`, which is the one with the
// SMALLEST index. A bucketed index visits candidates in a different order, so
// it has to pick the minimum index among all candidates rather than the first
// one it happens to touch — otherwise two vertices that are both within
// tolerance of a third weld differently and the loops come out different.
import { describe, it, expect } from 'vitest';
import { chainSegmentsIntoLoops, dist, type Segment } from '../geometry';
import type { CadPt } from '../types';

/** The implementation as it stood before the spatial index, verbatim. */
function chainSegmentsIntoLoopsReference(
  segments: Segment[],
  tol: number,
): { loops: CadPt[][]; loopSegIndex: number[]; unchained: number[] } {
  const verts: CadPt[] = [];
  const vertOf = (p: CadPt): number => {
    for (let i = 0; i < verts.length; i++) {
      if (dist(verts[i], p) <= tol) return i;
    }
    verts.push({ x: p.x, y: p.y });
    return verts.length - 1;
  };
  const edges = segments.map((s, i) => ({ i, a: vertOf(s.a), b: vertOf(s.b) }))
    .filter((e) => e.a !== e.b);

  const adj = new Map<number, Array<{ to: number; edge: number }>>();
  for (const e of edges) {
    (adj.get(e.a) ?? adj.set(e.a, []).get(e.a)!).push({ to: e.b, edge: e.i });
    (adj.get(e.b) ?? adj.set(e.b, []).get(e.b)!).push({ to: e.a, edge: e.i });
  }

  const usedEdge = new Set<number>();
  const loops: CadPt[][] = [];
  const loopSegIndex: number[] = [];
  const inLoop = new Set<number>();

  for (const start of adj.keys()) {
    if ((adj.get(start)?.length ?? 0) !== 2) continue;
    const path: number[] = [start];
    const pathEdges: number[] = [];
    let cur = start;
    let prevEdge = -1;
    let closed = false;
    for (let guard = 0; guard <= edges.length; guard++) {
      const nexts = (adj.get(cur) ?? []).filter(
        (n) => n.edge !== prevEdge && !usedEdge.has(n.edge) && !pathEdges.includes(n.edge),
      );
      if (nexts.length === 0) break;
      const n = nexts[0];
      pathEdges.push(n.edge);
      if (n.to === start) { closed = true; break; }
      if ((adj.get(n.to)?.length ?? 0) !== 2 || path.includes(n.to)) break;
      path.push(n.to);
      cur = n.to;
      prevEdge = n.edge;
    }
    if (closed && path.length >= 3) {
      for (const e of pathEdges) { usedEdge.add(e); inLoop.add(e); }
      loops.push(path.map((v) => ({ x: verts[v].x, y: verts[v].y })));
      loopSegIndex.push(pathEdges[0]);
    }
  }

  const unchained = segments.map((_, i) => i).filter((i) => !inLoop.has(i));
  return { loops, loopSegIndex, unchained };
}

const TOL = 0.005;

/** A column outline drawn as four separate LINEs — what the caller feeds this. */
function square(cx: number, cy: number, s = 0.15, jitter = 0): Segment[] {
  const j = () => (jitter === 0 ? 0 : (Math.random() - 0.5) * 2 * jitter);
  const c: CadPt[] = [
    { x: cx - s + j(), y: cy - s + j() },
    { x: cx + s + j(), y: cy - s + j() },
    { x: cx + s + j(), y: cy + s + j() },
    { x: cx - s + j(), y: cy + s + j() },
  ];
  return [
    { a: c[0], b: c[1] }, { a: c[1], b: c[2] },
    { a: c[2], b: c[3] }, { a: c[3], b: c[0] },
  ];
}

function grid(n: number, jitter = 0): Segment[] {
  const out: Segment[] = [];
  const perRow = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) {
    out.push(...square((i % perRow) * 6, Math.floor(i / perRow) * 5, 0.15, jitter));
  }
  return out;
}

/** Deterministic pseudo-random, so a failure is reproducible. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function expectSameAsReference(segments: Segment[], tol = TOL) {
  const got = chainSegmentsIntoLoops(segments, tol);
  const want = chainSegmentsIntoLoopsReference(segments, tol);
  expect(got.loops).toEqual(want.loops);
  expect(got.loopSegIndex).toEqual(want.loopSegIndex);
  expect(got.unchained).toEqual(want.unchained);
}

describe('chainSegmentsIntoLoops — output is unchanged by the spatial index', () => {
  it('a single square', () => {
    expectSameAsReference(square(0, 0));
  });

  it('a grid of separated squares', () => {
    expectSameAsReference(grid(40));
  });

  it('squares whose corners are within tolerance but not identical', () => {
    // The weld has to fire here, and it has to pick the same vertex the linear
    // scan picked — the earliest-inserted one within tol.
    expectSameAsReference(grid(30, TOL * 0.4));
  });

  it('two squares sharing a corner exactly', () => {
    expectSameAsReference([...square(0, 0), ...square(0.3, 0)]);
  });

  it('an open chain that never closes', () => {
    const pts: CadPt[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    expectSameAsReference([{ a: pts[0], b: pts[1] }, { a: pts[1], b: pts[2] }]);
  });

  it('a junction where three segments meet (degree 3 — not a loop)', () => {
    const c: CadPt = { x: 0, y: 0 };
    expectSameAsReference([
      { a: c, b: { x: 1, y: 0 } },
      { a: c, b: { x: 0, y: 1 } },
      { a: c, b: { x: -1, y: 0 } },
    ]);
  });

  it('a zero-length segment (both endpoints weld to one vertex)', () => {
    const p: CadPt = { x: 2, y: 2 };
    expectSameAsReference([...square(0, 0), { a: p, b: { ...p } }]);
  });

  it('a closed square plus a stray unchained line', () => {
    expectSameAsReference([
      ...square(0, 0),
      { a: { x: 9, y: 9 }, b: { x: 10, y: 10 } },
    ]);
  });

  it('a tolerance of zero (exact coincidence only)', () => {
    expectSameAsReference(grid(12), 0);
  });

  it('a non-finite tolerance welds nothing, as the scan did', () => {
    expectSameAsReference(grid(12), NaN);
    expectSameAsReference(grid(12), Infinity);
  });

  it('non-finite coordinates take a fresh vertex instead of hanging the index', () => {
    // `Math.floor(Infinity / cell)` is Infinity, and a neighbourhood loop
    // written around it never advances. These never matched under the linear
    // scan either, so each one must take its own vertex — the same answer.
    expectSameAsReference([
      ...square(0, 0),
      { a: { x: NaN, y: 0 }, b: { x: 1, y: 1 } },
      { a: { x: Infinity, y: 0 }, b: { x: 2, y: 2 } },
      { a: { x: 3, y: -Infinity }, b: { x: 3, y: 3 } },
      { a: { x: NaN, y: NaN }, b: { x: 4, y: 4 } },
    ]);
  }, 5_000);

  it('scattered segments with seeded jitter, many welds and many misses', () => {
    const rnd = seeded(20260921);
    const segs: Segment[] = [];
    for (let i = 0; i < 300; i++) {
      const x = Math.round(rnd() * 20) * 0.5;
      const y = Math.round(rnd() * 20) * 0.5;
      const dx = (rnd() - 0.5) * TOL * 1.6;
      const dy = (rnd() - 0.5) * TOL * 1.6;
      segs.push({ a: { x, y }, b: { x: x + 0.5 + dx, y: y + dy } });
    }
    expectSameAsReference(segs);
  });

  it('a plan far larger than the linear scan could handle, still identical', () => {
    // 1600 squares = 6400 segments. Under the old weld this alone took ~16 s;
    // it is here to prove the answer is the same at a size the importer
    // actually meets, not to assert a duration.
    expectSameAsReference(grid(1600));
  }, 60_000);
});
