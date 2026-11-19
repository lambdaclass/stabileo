import { groupDetail } from './footing-group-detail';
import { dowelPlaces } from './rebar-3d-plates';
import { barOf, laid, type Rebar3d, type Rebar3dFrames } from './rebar-3d-geometry';
import type { ColumnRow } from './column-row';
import type { FootingRow } from './footing-types';
import type { BendRules } from './shape';

/** A strip's or mat's bars in 3D, each piece of `groupPieces` laid in the footing's frame, and each column's dowels as its own bars stand. */
export function groupFootingBars3d(r: FootingRow, columns: readonly ColumnRow[], frames: Rebar3dFrames, R: BendRules): Rebar3d[] {
  const f = frames.footing(r);
  if (!f || r.uncovered || !(r.B > 0)) return [];
  const base = { element: r.key, rows: [r.key], family: 'footing' as const, ...(r.level !== undefined ? { level: r.level } : {}) };
  const det = groupDetail(r, R);
  const out: Rebar3d[] = [];
  for (const l of det.layers) {
    const kind = l.face === 'top' ? 'footingTop' as const : l.dir === 'x' ? 'footingX' as const : 'footingY' as const;
    for (const p of l.positions) {
      const place = (u: number, v: number): [number, number, number] => (l.dir === 'x' ? [l.from + u, p, l.z + v] : [p, l.from + u, l.z + v]);
      out.push(barOf(l.shape, laid(l.shape, f, place), { ...base, kind, tone: kind, set: `${r.key}:${l.set}` }));
    }
  }
  for (const d of det.dowels) {
    const row = columns.find((c) => c.key === d.rowKey);
    const cx = (d.rect.x0 + d.rect.x1) / 2, cy = (d.rect.y0 + d.rect.y1) / 2, dw = d.dowels;
    for (const p of dowelPlaces([cx, cy], { b: d.rect.x1 - d.rect.x0, h: d.rect.y1 - d.rect.y0 }, dw.count, row, row ? frames.column(row) : null)) {
      out.push(barOf(dw.shape, laid(dw.shape, f, (u, v) => [p.x + u * p.out[0], p.y + u * p.out[1], dw.z + v]), { ...base, kind: 'dowel', tone: 'dowel' }));
    }
  }
  return out;
}
