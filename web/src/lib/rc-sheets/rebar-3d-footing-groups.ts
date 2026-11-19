import { groupDetail, groupDowelRows } from './footing-group-detail';
import { dowelGroupOf, dowelGroups, dowelPlaces, type ColumnAxes } from './footing-dowels';
import { barOf, laid, type Rebar3d, type Rebar3dFrames } from './rebar-3d-geometry';
import type { ColumnRow } from './column-row';
import type { FootingRow } from './footing-types';
import type { BendRules } from './shape';

/** A strip's or mat's bars in 3D, each piece of `groupPieces` laid in the footing's frame (the drops' meshes under it, the stirrup legs for punching standing with their hooks toward the column), and each column's or core's dowels one under each of its bars (`footing-dowels.ts`). */
export function groupFootingBars3d(r: FootingRow, columns: readonly ColumnRow[], frames: Rebar3dFrames, R: BendRules): Rebar3d[] {
  const f = frames.footing(r);
  if (!f || r.uncovered || !(r.B > 0)) return [];
  const base = { element: r.key, rows: [r.key], family: 'footing' as const, ...(r.level !== undefined ? { level: r.level } : {}) };
  const det = groupDetail(r, R);
  const out: Rebar3d[] = [];
  for (const l of [...det.layers, ...det.drops.flatMap((d) => d.layers)]) {
    const kind = l.face === 'top' ? 'footingTop' as const : l.dir === 'x' ? 'footingX' as const : 'footingY' as const;
    for (const p of l.positions) {
      const place = (u: number, v: number): [number, number, number] => (l.dir === 'x' ? [l.from + u, p, l.z + v] : [p, l.from + u, l.z + v]);
      out.push(barOf(l.shape, laid(l.shape, f, place), { ...base, kind, tone: kind, set: `${r.key}:${l.set}` }));
    }
  }
  for (const k of det.cages) for (const leg of k.legs) {
    out.push(barOf(k.shape, laid(k.shape, f, (u, v) => [leg.x - v * leg.toward[0], leg.y - v * leg.toward[1], k.z0 + u]), { ...base, kind: 'footingPunch', tone: 'footingPunch', set: `${r.key}:punch:${k.key}` }));
  }
  const axesOf = (row: ColumnRow): ColumnAxes | undefined => { const cf = frames.column(row); return cf ? { x: [cf.x[0], cf.x[1]], y: [cf.y[0], cf.y[1]] } : undefined; };
  for (const m of groupDowelRows(r)) {
    const places = dowelPlaces(m.row, R, { first: columns.find((c) => c.key === m.rowKey), axes: axesOf });
    const groups = new Map(dowelGroups(m.row, places, R).map((g) => [g.key, g]));
    for (const p of places) {
      const g = groups.get(dowelGroupOf(p))!;
      out.push(barOf(g.shape, laid(g.shape, f, (u, v) => [p.x + u * p.out[0], p.y + u * p.out[1], g.z + v]), { ...base, kind: 'dowel', tone: 'dowel', set: `${r.key}:dowel:${m.key}` }));
    }
  }
  return out;
}
