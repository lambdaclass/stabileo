/**
 * A stair's bars in the building: each position of its section laid along the flight's run, from
 * the foot support, at its spacing across the width, the section's level the foot landing's top (the
 * model's shells are mid-surfaces); the distribution bars across at their rows.
 * A stair with no flight in the model has nowhere to stand and gives none.
 */
import type { Frame, Rebar3d, RebarTone, V3 } from './rebar-3d-geometry';
import type { PieceKind } from './schedule/pieces';
import type { StairBarRole, StairRow } from './stair-row';

const TONE: Record<StairBarRole, RebarTone> = { main: 'bottomX', landing: 'bottomX', topFoot: 'topX', topFootFlight: 'topX', topHead: 'topX', dist: 'bottomY', distTop: 'topY' };
const KIND: Record<StairBarRole, PieceKind> = { main: 'stairMain', landing: 'stairLanding', topFoot: 'stairTop', topFootFlight: 'stairTop', topHead: 'stairTop', dist: 'stairDist', distTop: 'stairDist' };

export function stairBars3d(r: StairRow, cover: number): Rebar3d[] {
  const p = r.demand.place;
  if (!p || r.unsupported) return [];
  const dir = p.dir, across = { x: -dir.y, y: dir.x }, w = r.demand.spec.width;
  const o = { x: p.x - dir.x * r.section.landingBottom, y: p.y - dir.y * r.section.landingBottom, z: p.z + r.section.tl / 2 };
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

/** A stair's concrete as boxes in the frames its bars are laid in: each landing level, the last step under the head landing's riser, and the waist along the steps' slope from its soffit to the head landing's; the other steps hold no bar. */
export function stairGhostBoxes(r: StairRow): Array<{ frame: Frame; from: V3; to: V3 }> {
  const p = r.demand.place;
  if (!p || r.unsupported) return [];
  const { run, rise, landingBottom: Lb, landingTop: Lt, tl, tv, angle } = r.section, w = r.demand.spec.width, h = w / 2;
  const dir = p.dir, cos = Math.cos(angle), sin = Math.sin(angle), sB = Math.min(Lb + run + Lt, Lb + (rise - tl + tv) / Math.tan(angle));
  const o: V3 = [p.x - dir.x * Lb, p.y - dir.y * Lb, p.z + tl / 2], across: V3 = [-dir.y, dir.x, 0];
  const level: Frame = { o, x: [dir.x, dir.y, 0], y: across, z: [0, 0, 1] };
  const soffit: V3 = [o[0] + dir.x * Lb, o[1] + dir.y * Lb, o[2] - tv];
  const waist: Frame = { o: soffit, x: [dir.x * cos, dir.y * cos, sin], y: across, z: [-dir.x * sin, -dir.y * sin, cos] };
  return [
    { frame: level, from: [0, -h, -tl], to: [Lb, h, 0] },
    { frame: waist, from: [0, -h, 0], to: [(sB - Lb) / cos, h, tv * cos] },
    { frame: level, from: [Lb + run - r.demand.spec.tread, -h, rise - r.demand.spec.riser - tl], to: [Lb + run, h, rise - r.demand.spec.riser] },
    { frame: level, from: [Lb + run, -h, rise - tl], to: [Lb + run + Lt, h, rise] },
  ];
}
