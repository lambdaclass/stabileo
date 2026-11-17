/**
 * Footings whose plans overlap, turned or not: two rectangles meet unless one of their four edge
 * directions separates them (separating axes). A gap under `clearance` counts as an overlap, so
 * two bases poured against each other are found as well. Overlapping footings are gathered into
 * groups, each to become one combined footing.
 */
import { footingFrame } from './general-footing';
import type { Footing } from '../../model/footing';

type P = { x: number; y: number };

export function footingCorners(f: Footing, n0: P): P[] {
  const fr = footingFrame(f, n0);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => fr.toGlobal((a! * f.B) / 2, (b! * f.L) / 2));
}

export function rectanglesOverlap(a: P[], b: P[], clearance = 0): boolean {
  for (const poly of [a, b]) for (let k = 0; k < 2; k++) {
    const p = poly[k]!, q = poly[k + 1]!, len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const ax = { x: -(q.y - p.y) / len, y: (q.x - p.x) / len };
    const proj = (r: P[]) => r.map((v) => v.x * ax.x + v.y * ax.y);
    const pa = proj(a), pb = proj(b);
    if (Math.max(...pa) + clearance <= Math.min(...pb) + 1e-9 || Math.max(...pb) + clearance <= Math.min(...pa) + 1e-9) return false;
  }
  return true;
}

export interface Overlap { a: number; b: number }

export function footingOverlaps(footings: readonly Footing[], nodes: ReadonlyMap<number, P>, clearance = 0): { pairs: Overlap[]; groups: number[][] } {
  const live = footings.filter((f) => f.B > 0 && f.L > 0 && nodes.has(f.nodeId));
  const corners = new Map(live.map((f) => [f.id, footingCorners(f, nodes.get(f.nodeId)!)]));
  const pairs: Overlap[] = [];
  const parent = new Map(live.map((f) => [f.id, f.id]));
  const root = (x: number): number => (parent.get(x) === x ? x : root(parent.get(x)!));
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i]!, b = live[j]!;
    if (Math.abs(a.foundingElevation - b.foundingElevation) > Math.max(a.thickness, b.thickness)) continue;
    if (!rectanglesOverlap(corners.get(a.id)!, corners.get(b.id)!, clearance)) continue;
    pairs.push({ a: a.id, b: b.id });
    parent.set(root(b.id), root(a.id));
  }
  const by = new Map<number, number[]>();
  for (const f of live) { const r = root(f.id); by.set(r, [...(by.get(r) ?? []), f.id]); }
  return { pairs, groups: [...by.values()].filter((g) => g.length > 1) };
}
