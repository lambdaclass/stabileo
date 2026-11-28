/**
 * The hoop and the crossties of a column's section as they lie round its bars, from the section's
 * centre, m: each straight leg tangent to the bars it holds, (db + dt)/2 off their axes, each hook
 * wrapped round its bar and its tail running off tangent to it, so no tie crosses a bar. A
 * crosstie holding a row inside the faces lies beside the bars of the rows behind it on the same
 * line, tangent to them as well, on the side away from the crosstie of the row outside it. Of the
 * hoop's four corners for its hooks and of either side of the bars for each crosstie's leg, the
 * one that keeps clear of every bar.
 */
import { columnLayout, innerTies, type PlacedBar } from './column-layout';
import type { HookAngle } from './shape';
import type { ColumnAdopted } from './types';

export type Pt = [number, number];

export interface TiePath { pts: Pt[]; hooks: [HookAngle, HookAngle]; across: 'h' | 'b'; length: number; leg: [Pt, Pt]; inner?: true }
export interface HoopPath { pts: Pt[]; box: { x0: number; y0: number; x1: number; y1: number } }

/** What the ties are made of: the bars each face's crossties hold (1 … n between the corners), the tail past a hook, m, and the hooks of a crosstie, start and end. */
export interface TieRules { held: { b: number[]; h: number[] }; extension: (angle: HookAngle) => number; hooks: [HookAngle, HookAngle] }

const STEP = Math.PI / 12;

/** How far a tie may press into a bar's outline and still be taken as beside it, m: a drawing's precision, not a fit. */
export const TIE_TOLERANCE = 5e-4;

/** An arc of a tie's centreline round a bar's axis `c`, from `from` turning `sweep` (radians, + anticlockwise): a polygon whose sides are all tangent to the circle of radius `r`. */
function arc(c: Pt, r: number, from: number, sweep: number): Pt[] {
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / STEP - 1e-9)), d = sweep / n, rr = r / Math.cos(d / 2);
  const at = (t: number, rad: number): Pt => [c[0] + rad * Math.cos(t), c[1] + rad * Math.sin(t)];
  return [at(from, r), ...Array.from({ length: n }, (_, k) => at(from + (k + 0.5) * d, rr)), at(from + sweep, r)];
}

/** A hook from the tangent point at `from` round `c`, turning `angle` degrees in `sense` (+1 anticlockwise), then its tail straight on. */
function hook(c: Pt, r: number, from: number, sense: 1 | -1, angle: HookAngle, tail: number): Pt[] {
  const pts = arc(c, r, from, (sense * angle * Math.PI) / 180);
  const t = from + (sense * angle * Math.PI) / 180, end = pts[pts.length - 1]!;
  const dir: Pt = sense > 0 ? [-Math.sin(t), Math.cos(t)] : [Math.sin(t), -Math.cos(t)];
  return [...pts, [end[0] + tail * dir[0], end[1] + tail * dir[1]]];
}

/** A crosstie between two bars on a line along y (`across` h) or x (b), its leg on `side` of them, offset `r`. */
function crosstie(a: Pt, b: Pt, r: number, across: 'h' | 'b', side: 1 | -1, hooks: [HookAngle, HookAngle], ext: TieRules['extension'], length: number): TiePath {
  const [h0, h1] = hooks;
  let first: Pt[], last: Pt[], leg: [Pt, Pt];
  if (across === 'h') {
    const t0 = side > 0 ? 0 : Math.PI;
    first = hook(a, r, t0, side > 0 ? -1 : 1, h0, ext(h0));
    last = hook(b, r, t0, side > 0 ? 1 : -1, h1, ext(h1));
    leg = [[a[0] + side * r, a[1]], [b[0] + side * r, b[1]]];
  } else {
    const t0 = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    first = hook(a, r, t0, side > 0 ? 1 : -1, h0, ext(h0));
    last = hook(b, r, t0, side > 0 ? -1 : 1, h1, ext(h1));
    leg = [[a[0], a[1] + side * r], [b[0], b[1] + side * r]];
  }
  return { pts: [...first.reverse(), ...last], hooks, across, length, leg };
}

/** The hoop with its two 135° hooks round the corner bar at (sx·xc, sy·yc). */
function hoop(d: { b: number; h: number }, a: ColumnAdopted, cover: number, sx: 1 | -1, sy: 1 | -1, tail: number): HoopPath {
  const td = a.tieDia / 1000, r = (a.corner / 1000 + td) / 2;
  const X1 = d.b / 2 - cover - td / 2, Y1 = d.h / 2 - cover - td / 2;
  const c: Pt = [-X1 + r, Y1 - r];
  const along = hook(c, r, Math.PI / 2, 1, 135, tail).reverse();
  const up = hook(c, r, Math.PI, -1, 135, tail);
  const pts: Pt[] = [...along, [X1, Y1], [X1, -Y1], [-X1, -Y1], ...up];
  return { pts: pts.map(([x, y]) => [sx * x, sy * y]), box: { x0: -X1, y0: -Y1, x1: X1, y1: Y1 } };
}

/** The smallest clearance of a tie's centreline from the bars, less each bar's radius and the tie's, m: negative where it crosses one. */
export function tieSlack(pts: readonly Pt[], bars: readonly PlacedBar[], tieDia: number): number {
  let worst = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i]!, [bx, by] = pts[i + 1]!, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    for (const p of bars) {
      const rad = p.dia / 2000 + tieDia / 2000;
      if (Math.min(ax, bx) > p.x + rad + 1e-3 || Math.max(ax, bx) < p.x - rad - 1e-3 || Math.min(ay, by) > p.y + rad + 1e-3 || Math.max(ay, by) < p.y - rad - 1e-3) continue;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / l2)) : 0;
      worst = Math.min(worst, Math.hypot(ax + t * dx - p.x, ay + t * dy - p.y) - rad);
    }
  }
  return worst;
}

/**
 * The hoop and crossties drawn and scheduled for a column: the crossties of `rules.held` on each
 * face, the hooks alternating 135° and 90° from one to the next where the code's crosstie has both
 * (§18.7.5.2(c)), and one crosstie for each facing pair of each row inside (`innerTies`). `slack`
 * the least clearance of any tie from any bar (`tieSlack`), m.
 */
export function tiePaths(d: { b: number; h: number }, a: ColumnAdopted, cover: number, rules: TieRules, aggregate = 0): { hoop: HoopPath; crossties: TiePath[]; slack: number } {
  const { bars, rows } = columnLayout(d, a, cover, aggregate);
  const td = a.tieDia / 1000;
  const ext = rules.extension, mixed = rules.hooks[0] !== rules.hooks[1];
  const hookOf = (n: number): [HookAngle, HookAngle] => (mixed && n % 2 ? [rules.hooks[1], rules.hooks[0]] : rules.hooks);
  const toBar = (dia: number) => cover + td + dia / 2000;
  const xc = d.b / 2 - toBar(a.corner), yc = d.h / 2 - toBar(a.corner);
  const H = d.h - 2 * cover - td, W = d.b - 2 * cover - td;
  const corners = ([[-1, 1], [1, 1], [1, -1], [-1, -1]] as Array<[1 | -1, 1 | -1]>).map(([sx, sy]) => hoop(d, a, cover, sx, sy, ext(135)));
  const best = <T extends { pts: Pt[] }>(options: T[], prefer = 0): { pick: T; slack: number } => {
    const scored = options.map((o, i) => ({ o, s: tieSlack(o.pts, bars, a.tieDia), i }));
    const ok = scored.filter((x) => x.s >= -TIE_TOLERANCE);
    const pick = ok.find((x) => x.i === prefer) ?? ok[0] ?? scored.reduce((p, q) => (q.s > p.s ? q : p));
    return { pick: pick.o, slack: pick.s };
  };
  const h = best(corners);
  let slack = h.slack;
  const out: TiePath[] = [];
  const sideAt = new Map<string, 1 | -1>();
  const place = (a0: Pt, b0: Pt, r: number, across: 'h' | 'b', n: number, length: number, inner: boolean) => {
    const key = `${across}:${(across === 'h' ? a0[0] : a0[1]).toFixed(5)}`;
    const outside = sideAt.get(key);
    const sides: Array<1 | -1> = [1, -1];
    const pick = best(sides.map((s) => crosstie(a0, b0, r, across, s, hookOf(n), ext, length)), outside === 1 ? 1 : 0);
    sideAt.set(key, pick.pick.leg[0][across === 'h' ? 0 : 1] > (across === 'h' ? a0[0] : a0[1]) ? 1 : -1);
    slack = Math.min(slack, pick.slack);
    out.push(inner ? { ...pick.pick, inner: true } : pick.pick);
  };
  const wrap = (dia: number) => dia / 2000 + td / 2;
  rules.held.b.forEach((i, n) => {
    const x = -xc + (2 * xc * i) / (a.nx + 1), y = d.h / 2 - toBar(a.dx);
    place([x, -y], [x, y], wrap(a.dx), 'h', n, H, false);
  });
  rules.held.h.forEach((j, n) => {
    const y = -yc + (2 * yc * j) / (a.ny + 1), x = d.b / 2 - toBar(a.dy);
    place([-x, y], [x, y], wrap(a.dy), 'b', n, W, false);
  });
  const inn = innerTies(d, a, cover, aggregate).ties;
  let k = 0;
  for (const r of rows) {
    for (const x of r.xs) { const t = inn[k++]!; place([x, -r.yIn], [x, r.yIn], wrap(a.inner!.dia), 'h', k, t.length, true); }
    for (const y of r.ys) { const t = inn[k++]!; place([-r.xIn, y], [r.xIn, y], wrap(a.inner!.dia), 'b', k, t.length, true); }
  }
  return { hoop: h.pick, crossties: out, slack };
}
