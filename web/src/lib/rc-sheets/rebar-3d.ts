import { columnBars3d } from './rebar-3d-columns';
import { lineBars3d } from './rebar-3d-lines';
import { footingBars3d, slabBars3d, wallBars3d } from './rebar-3d-plates';
import { groupFootingBars3d } from './rebar-3d-footing-groups';
import { punchingBars3d } from './rebar-3d-punching';
import { rulesFor } from './codes';
import type { PieceOptions } from './schedule/pieces';
import { asFoundation, type Rebar3d, type Rebar3dFrames, type Rebar3dRows } from './rebar-3d-geometry';

export * from './rebar-3d-geometry';

export function rebar3d(rows: Rebar3dRows, frames: Rebar3dFrames, o: PieceOptions): Rebar3d[] {
  const R = rulesFor(o.code).bends;
  const out: Rebar3d[] = [];
  const tops = (rows.footing ?? []).flatMap((r) => { const f = frames.footing(r); return f ? [f.o[2] + r.adopted.h] : []; });
  const footingsTop = tops.length ? Math.max(...tops) : -Infinity;
  for (const l of rows.line) {
    const f = frames.line(l);
    if (!f) continue;
    const bars = lineBars3d(l, f, R, { element: l.key, rows: [l.key], family: 'beam', ...(l.level !== undefined ? { level: l.level } : {}) });
    out.push(...(f.o[2] <= footingsTop + 1e-3 ? bars.map(asFoundation) : bars));
  }
  for (const r of rows.column) {
    const f = frames.column(r);
    if (f) out.push(...columnBars3d(rows.column, r, f, o, R));
  }
  out.push(...slabBars3d(rows, frames, o, R));
  for (const r of rows.wall) {
    const f = frames.wall(r);
    if (f) out.push(...wallBars3d(rows.wall, r, f, o, R));
  }
  for (const r of rows.footing ?? []) out.push(...(r.group ? groupFootingBars3d(r, rows.footing ?? [], rows.column, frames, R) : footingBars3d(r, rows.footing ?? [], rows.column, frames, R)));
  for (const r of rows.punching ?? []) {
    const f = r.figure?.reinforcement ? frames.punching?.(r) : null;
    if (f) out.push(...punchingBars3d(r, r.figure!, f, o, R));
  }
  return out;
}
