import { ownStrapResults } from './schedule/pieces';
import { dropRect } from './footing-punching';
import type { LineLayout } from './beam-line';
import type { Frame, Rebar3d, Rebar3dFrames, Rebar3dRows, V3 } from './rebar-3d-geometry';

export interface Ghost3d extends Pick<Rebar3d, 'element' | 'rows' | 'family' | 'level'> {
  frame: Frame;
  from: V3;
  to: V3;
}

type Base = Pick<Ghost3d, 'element' | 'rows' | 'family' | 'level'>;

const WORLD: Frame = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const levelOf = (level: string | undefined) => (level !== undefined ? { level } : {});
const solid = (from: V3, to: V3) => from.every((v, i) => to[i]! - v > 1e-9);

function push(out: Ghost3d[], base: Base, frame: Frame, from: V3, to: V3): void {
  if (solid(from, to)) out.push({ ...base, frame, from, to });
}

function lineGhosts(out: Ghost3d[], l: LineLayout, f: Frame, base: Base): void {
  if (!l.spans.length) return;
  const hMax = Math.max(...l.spans.map((s) => s.h));
  for (const s of l.spans) push(out, base, f, [s.x0, -s.b / 2, hMax / 2 - s.h], [s.x1, s.b / 2, hMax / 2]);
}

export function ghost3d(rows: Rebar3dRows, frames: Rebar3dFrames): Ghost3d[] {
  const out: Ghost3d[] = [];
  for (const l of rows.line) {
    const f = frames.line(l);
    if (f) lineGhosts(out, l, f, { element: l.key, rows: [l.key], family: 'beam', ...levelOf(l.level) });
  }
  for (const r of rows.column) {
    const f = frames.column(r);
    if (f) push(out, { element: r.key, rows: [r.key], family: 'column', ...levelOf(r.level) }, f, [-r.b / 2, -r.h / 2, 0], [r.b / 2, r.h / 2, r.length]);
  }
  for (const r of rows.slab) {
    const b = r.demand.bounds, soffit = frames.slabSoffit(r);
    if (b && soffit !== null) push(out, { element: r.key, rows: [r.key], family: 'slab', ...levelOf(r.level) }, WORLD, [b.x0, b.y0, soffit], [b.x1, b.y1, soffit + r.h]);
  }
  for (const r of rows.wall) {
    const f = frames.wall(r);
    if (f) push(out, { element: r.key, rows: [r.key], family: 'wall', ...levelOf(r.level) }, f, [0, -r.thickness / 2, 0], [r.length, r.thickness / 2, r.height]);
  }
  for (const r of rows.footing ?? []) {
    if (!(r.B > 0)) continue;
    const base: Base = { element: r.key, rows: [r.key], family: 'footing', ...levelOf(r.level) }, a = r.adopted, f = frames.footing(r);
    if (f) push(out, base, f, [-a.B / 2, -a.L / 2, 0], [a.B / 2, a.L / 2, a.h]);
    if (f) for (const k of r.group?.columns ?? []) {
      const dr = a.punching?.[k.key]?.drop;
      if (!dr) continue;
      const q = dropRect({ B: a.B, L: a.L, xc: k.x, yc: k.y, b: k.b, h: k.h }, dr);
      push(out, base, f, [q.x0, q.y0, -dr.hd], [q.x1, q.y1, 0]);
    }
    for (const s of ownStrapResults(r, rows.footing ?? [])) {
      const sf = frames.strap(r, s);
      if (sf && s.line) lineGhosts(out, s.line, sf, base);
    }
  }
  return out;
}

export function ghostCorners(g: Pick<Ghost3d, 'frame' | 'from' | 'to'>): V3[] {
  const { frame: f, from: a, to: b } = g;
  const out: V3[] = [];
  for (const z of [a[2], b[2]]) for (const y of [a[1], b[1]]) for (const x of [a[0], b[0]]) {
    out.push([0, 1, 2].map((i) => f.o[i]! + f.x[i]! * x + f.y[i]! * y + f.z[i]! * z) as V3);
  }
  return out;
}
