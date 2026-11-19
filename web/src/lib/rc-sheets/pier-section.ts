import type { P } from './piers';
import type { WallRow } from './wall-row';
import type { SheetCode } from './types';
import { columnSize, wallDetail } from './wall-detail';

export interface PierSectionWall { key: string; name: string; outline: P[]; mid: P; bars: Array<P & { dia: number; boundary: boolean }> }
export interface PierSectionColumn { key: string; name: string; b: number; h: number; outline: P[]; bars: Array<P & { dia: number }>; label: string }
export interface PierSection { walls: PierSectionWall[]; columns: PierSectionColumn[]; bounds: { x0: number; y0: number; x1: number; y1: number } }

function wallFrame(row: WallRow): ((q: P) => P) | null {
  const pl = row.demand.plan;
  if (!pl) return null;
  const dx = pl.x2 - pl.x1, dy = pl.y2 - pl.y1, L = Math.hypot(dx, dy) || 1;
  const u = { x: dx / L, y: dy / L }, n = { x: -dy / L, y: dx / L }, t = row.thickness / 2;
  return (q) => ({ x: pl.x1 + q.x * u.x + (q.y - t) * n.x, y: pl.y1 + q.x * u.y + (q.y - t) * n.y });
}

export function pierSection(walls: readonly WallRow[], code: SheetCode): PierSection {
  const out: PierSection = { walls: [], columns: [], bounds: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity } };
  const seen = new Set<string>();
  for (const row of walls) {
    const g = wallFrame(row);
    if (!g) continue;
    const d = wallDetail(row, code), L = row.length, t = row.thickness;
    out.walls.push({
      key: row.key, name: row.name, outline: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: t }, { x: 0, y: t }].map(g), mid: g({ x: L / 2, y: t / 2 }),
      bars: d.verticals.map((v) => ({ ...g(v), dia: v.dia, boundary: v.boundary })),
    });
    for (const c of d.columns) {
      if (seen.has(c.key)) continue;
      seen.add(c.key);
      out.columns.push({ key: c.key, name: c.name, ...columnSize(c.outline), outline: c.outline.map(g), bars: c.bars.map((b) => ({ ...g(b), dia: b.dia })), label: c.label });
    }
  }
  for (const p of [...out.walls.flatMap((w) => w.outline), ...out.columns.flatMap((c) => c.outline)]) {
    out.bounds = { x0: Math.min(out.bounds.x0, p.x), y0: Math.min(out.bounds.y0, p.y), x1: Math.max(out.bounds.x1, p.x), y1: Math.max(out.bounds.y1, p.y) };
  }
  return out;
}
