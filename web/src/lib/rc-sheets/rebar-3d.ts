import { columnBars3d } from './rebar-3d-columns';
import { lineBars3d } from './rebar-3d-lines';
import { slabBars3d, wallBars3d } from './rebar-3d-plates';
import { rulesFor } from './codes';
import type { PieceOptions } from './schedule/pieces';
import { type Rebar3d, type Rebar3dFrames, type Rebar3dRows } from './rebar-3d-geometry';

export * from './rebar-3d-geometry';

export function rebar3d(rows: Rebar3dRows, frames: Rebar3dFrames, o: PieceOptions): Rebar3d[] {
  const R = rulesFor(o.code).bends;
  const out: Rebar3d[] = [];
  for (const l of rows.line) {
    const f = frames.line(l);
    if (!f) continue;
    out.push(...lineBars3d(l, f, R, { element: l.key, rows: [l.key], family: 'beam', ...(l.level !== undefined ? { level: l.level } : {}) }));
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
  return out;
}
