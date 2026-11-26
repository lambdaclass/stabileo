/**
 * A stair's bars in the building: each position of its section laid along the flight's run, from
 * the foot support, at its spacing across the width; the distribution bars across at their rows.
 * A stair with no flight in the model has nowhere to stand and gives none.
 */
import type { Rebar3d, RebarTone, V3 } from './rebar-3d-geometry';
import type { PieceKind } from './schedule/pieces';
import type { StairBarRole, StairRow } from './stair-row';

const TONE: Record<StairBarRole, RebarTone> = { main: 'bottomX', landing: 'bottomX', topFoot: 'topX', topFootFlight: 'topX', topHead: 'topX', dist: 'bottomY', distTop: 'topY' };
const KIND: Record<StairBarRole, PieceKind> = { main: 'stairMain', landing: 'stairLanding', topFoot: 'stairTop', topFootFlight: 'stairTop', topHead: 'stairTop', dist: 'stairDist', distTop: 'stairDist' };

export function stairBars3d(r: StairRow, cover: number): Rebar3d[] {
  const p = r.demand.place;
  if (!p || r.unsupported) return [];
  const dir = p.dir, across = { x: -dir.y, y: dir.x }, w = r.demand.spec.width;
  const o = { x: p.x - dir.x * r.section.landingBottom, y: p.y - dir.y * r.section.landingBottom, z: p.z };
  const at = (s: number, u: number, z: number): V3 => [o.x + dir.x * s + across.x * u, o.y + dir.y * s + across.y * u, o.z + z];
  const out: Rebar3d[] = [];
  for (const b of r.bars) {
    const base = { element: r.key, rows: [r.key], family: 'stair' as const, ...(r.level !== undefined ? { level: r.level } : {}), kind: KIND[b.role], tone: TONE[b.role], mark: b.mark, set: `${r.key}:${b.mark}`, dia: b.dia, mandrel: b.shape.mandrel };
    if (b.rows) {
      for (const [s, z] of b.rows) out.push({ ...base, segments: [b.shape.pts.map(([u, v]) => at(s, -w / 2 + cover + u, z + v))] });
      continue;
    }
    for (let k = 0; k < b.count; k++) {
      const u = -w / 2 + cover + b.dia / 2000 + k * b.spacing;
      if (u > w / 2 - cover + 1e-9) break;
      out.push({ ...base, segments: [b.shape.pts.map(([s, z]) => at(s, u, z))] });
    }
  }
  return out;
}
