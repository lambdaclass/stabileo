/**
 * Inter-story drift, measured on the columns.
 *
 * ── What was wrong ────────────────────────────────────────────────
 *
 * The verification tab and the report each grouped the nodes into "levels" by their Y coordinate
 * and read `ux` and `uz` as the two lateral displacements. PRO models are Z-up: Y is a position
 * in plan and `uz` is vertical. So on a building the "levels" were rows of the plan grid, one of
 * the "drifts" was the vertical shortening of the columns, and the other lateral direction was
 * never read at all. Each level's drift was also the difference of the level's LARGEST
 * displacements, which is not any column's drift once the floor twists.
 *
 * ── What it is now ────────────────────────────────────────────────
 *
 * Every vertical member is a piece of a story: its drift is the lateral displacement of its top
 * relative to its bottom, in each horizontal direction, over its own height. A story is the set
 * of columns whose tops sit at one elevation, and its drift is its worst column's. A flat model
 * solved embedded in the XZ plane is read in that frame: its model Y is the scene's vertical, and
 * its one lateral direction is X.
 */

type P = { x: number; y: number; z?: number };

export interface StoryDrift {
  /** Elevation of the story's column tops, m. */
  level: number;
  /** Height of the governing column, m. */
  height: number;
  /** Relative lateral displacement of the governing column in X and in Y, m. */
  driftX: number;
  driftY: number;
  /** Largest Δ/h in X and in Y over the story's columns. */
  ratioX: number;
  ratioY: number;
  /** The columns that govern each direction. */
  columnX: number;
  columnY: number;
  status: 'ok' | 'warn' | 'fail';
}

/** A member this close to vertical is a column (cos ≥ 0.985, about 10°). */
export const VERTICAL_COS = 0.985;
/** Column tops within this of each other are one story, m. */
export const STORY_TOL = 0.05;
/** A vertical piece shorter than this is not a story, m. */
export const MIN_STORY_HEIGHT = 0.1;

export function storyDrifts(
  nodes: ReadonlyMap<number, P>,
  elements: Iterable<{ id: number; nodeI: number; nodeJ: number }>,
  displacements: ReadonlyArray<{ nodeId: number; ux: number; uy: number; uz: number }>,
  opts: { limit: number; embedded2D?: boolean },
): StoryDrift[] {
  const up = (n: P) => (opts.embedded2D ? n.y : n.z ?? 0);
  const disp = new Map(displacements.map((d) => [d.nodeId, d]));
  const columns: Array<{ id: number; top: number; h: number; dx: number; dy: number }> = [];
  for (const e of elements) {
    const a = nodes.get(e.nodeI), b = nodes.get(e.nodeJ);
    if (!a || !b) continue;
    const L = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
    const dv = up(b) - up(a);
    if (L <= 0 || Math.abs(dv) / L < VERTICAL_COS || Math.abs(dv) < MIN_STORY_HEIGHT) continue;
    const [bot, top] = dv > 0 ? [e.nodeI, e.nodeJ] : [e.nodeJ, e.nodeI];
    const ub = disp.get(bot), ut = disp.get(top);
    if (!ub || !ut) continue;
    columns.push({
      id: e.id, top: Math.max(up(a), up(b)), h: Math.abs(dv),
      dx: Math.abs(ut.ux - ub.ux),
      // Embedded flat models have one lateral direction.
      dy: opts.embedded2D ? 0 : Math.abs(ut.uy - ub.uy),
    });
  }
  columns.sort((p, q) => p.top - q.top);
  const stories: Array<typeof columns> = [];
  for (const c of columns) {
    const last = stories[stories.length - 1];
    if (last && Math.abs(c.top - last[0]!.top) < STORY_TOL) last.push(c);
    else stories.push([c]);
  }
  return stories.map((cs) => {
    const gx = cs.reduce((m, c) => (c.dx / c.h > m.dx / m.h ? c : m));
    const gy = cs.reduce((m, c) => (c.dy / c.h > m.dy / m.h ? c : m));
    const ratioX = gx.dx / gx.h, ratioY = gy.dy / gy.h;
    const worst = Math.max(ratioX, ratioY);
    const governing = ratioX >= ratioY ? gx : gy;
    return {
      level: cs.reduce((s, c) => s + c.top, 0) / cs.length,
      height: governing.h,
      driftX: gx.dx, driftY: gy.dy, ratioX, ratioY, columnX: gx.id, columnY: gy.id,
      status: worst > opts.limit ? 'fail' : worst > opts.limit * 0.8 ? 'warn' : 'ok',
    };
  });
}
