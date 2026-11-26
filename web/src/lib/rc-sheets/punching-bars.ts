/**
 * A punching joint's stirrups as the bars they are: on each line of the figure's reinforcement,
 * s/2 + i·s from the column faces, its legs spread evenly along the sides the slab continues past,
 * each a single-leg stirrup through the slab's depth hooked over its top and bottom bars
 * (§22.6.7.3). The plan, the bending schedule and the 3D view read the same legs.
 */
import type { PunchingFigure } from './punching-row';
import type { PlanSide } from './view-helpers';

const DIRS: Array<[PlanSide, number]> = [['px', 0], ['py', 90], ['nx', 180], ['ny', 270]];
const gap = (a: number, b: number) => { const d = Math.abs((((a - b) % 360) + 360) % 360); return Math.min(d, 360 - d); };

/** The sides the slab stops at the column face: the one the free edge faces, or the two of a corner. */
export function freeSides(fig: Pick<PunchingFigure, 'position' | 'openBearingDeg'>): Set<PlanSide> {
  if (fig.position === 'interior' || fig.openBearingDeg === null) return new Set();
  const by = [...DIRS].sort((p, q) => gap(p[1], fig.openBearingDeg!) - gap(q[1], fig.openBearingDeg!));
  return new Set(by.slice(0, fig.position === 'corner' ? 2 : 1).map((x) => x[0]));
}

/** Where every leg stands in plan, m from the column's centre, x along b and y along h; none without stirrups. */
export function punchingLegs(fig: PunchingFigure): Array<[number, number]> {
  const r = fig.reinforcement;
  if (!r || r.lines < 1 || r.legs < 1) return [];
  const free = freeSides(fig), bx = fig.b / 2, by = fig.h / 2, out: Array<[number, number]> = [];
  for (let i = 0; i < r.lines; i++) {
    const off = r.spacing / 2 + i * r.spacing, ex = bx + off, ey = by + off;
    const ys: [number, number] = [free.has('ny') ? -by : -ey, free.has('py') ? by : ey];
    const xs: [number, number] = [free.has('nx') ? -bx : -ex, free.has('px') ? bx : ex];
    const sides: Array<[[number, number], [number, number]]> = [];
    if (!free.has('px')) sides.push([[ex, ys[0]], [ex, ys[1]]]);
    if (!free.has('py')) sides.push([[xs[1], ey], [xs[0], ey]]);
    if (!free.has('nx')) sides.push([[-ex, ys[1]], [-ex, ys[0]]]);
    if (!free.has('ny')) sides.push([[xs[0], -ey], [xs[1], -ey]]);
    const lengths = sides.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]));
    const total = lengths.reduce((s, l) => s + l, 0);
    if (!(total > 0)) continue;
    for (let j = 0; j < r.legs; j++) {
      let t = ((j + 0.5) / r.legs) * total, k = 0;
      while (k < sides.length - 1 && t > lengths[k]!) { t -= lengths[k]!; k++; }
      const [a, b] = sides[k]!, f = lengths[k]! > 0 ? Math.min(1, t / lengths[k]!) : 0;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
  }
  return out;
}
