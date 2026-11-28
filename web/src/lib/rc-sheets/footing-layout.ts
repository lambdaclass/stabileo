import { footingOverlaps } from './footing-overlaps';
import type { PlanCap } from './footing-design';
import type { FootingDemand, FootingRow } from './footing-types';

/** Clear between two footings given room by each other, m. */
export const FOOTING_GAP = 0.1;
/** The longest a footing given room is let grow against its short side before two columns share one. */
const MAX_RATIO = 2.5;

export interface LayoutHooks {
  /** The footing proposed again with one side held short. */
  capped(d: FootingDemand, cap: PlanCap): FootingRow;
  /** One combined footing for both columns. */
  combine(a: FootingDemand, b: FootingDemand): FootingRow;
}

/** A footing held at a line along this axis: its side across the line cannot be cut short there. */
const heldAlong = (r: FootingRow, axis: 'x' | 'y') => !!r.demand.edge?.anchor[axis === 'x' ? 0 : 1];
const free = (r: FootingRow) => !r.isAdopted && !r.demand.footing && !r.demand.carried && !r.demand.group && r.B > 0;
const down5 = (v: number) => Math.round(Math.floor(v / 0.05 + 1e-9) * 50) / 1000;

/**
 * Footings proposed where they overlap their neighbours, as it is done: first each is given the
 * room between them along the line that joins them and grows the other way, its long side toward
 * the free side, while that stays a reasonable rectangle and clears every neighbour; a footing at
 * a line is only cut short along it. The pairs still overlapping then share a combined footing,
 * the nearest pairs first, unless one stands at a line: a combined footing there would have to be
 * held at the line and balanced as a whole, and the overlap is left for the engineer. Footings the engineer
 * adopted or the model holds stay as they are; what still overlaps is said by `withOverlaps`.
 */
export function layFootings(rows: readonly FootingRow[], h: LayoutHooks): FootingRow[] {
  const { pairs } = footingOverlaps(rows);
  if (!pairs.length) return [...rows];
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const caps = new Map<string, PlanCap[]>();
  for (const [ka, kb] of pairs) {
    const a = byKey.get(ka)!, b = byKey.get(kb)!;
    if (!free(a) || !free(b)) continue;
    const dx = b.demand.at.x - a.demand.at.x, dy = b.demand.at.y - a.demand.at.y;
    const axis = Math.abs(dx) >= Math.abs(dy) ? 'x' as const : 'y' as const;
    const max = down5(Math.abs(axis === 'x' ? dx : dy) - FOOTING_GAP);
    for (const r of [a, b]) if (!heldAlong(r, axis)) caps.set(r.key, [...(caps.get(r.key) ?? []), { axis, max }]);
  }
  let out = [...rows];
  for (const [key, list] of caps) {
    if (new Set(list.map((c) => c.axis)).size > 1) continue;
    const cap = { axis: list[0]!.axis, max: Math.min(...list.map((c) => c.max)) };
    if (cap.max < 0.6) continue;
    const r = h.capped(byKey.get(key)!.demand, cap);
    const long = Math.max(r.B, r.L) / Math.max(1e-9, Math.min(r.B, r.L));
    if (r.status !== 'fail' && r.sizing.reached && long <= MAX_RATIO + 1e-9) out = out.map((x) => (x.key === key ? r : x));
  }
  const left = footingOverlaps(out).pairs.map(([ka, kb]) => [out.find((r) => r.key === ka)!, out.find((r) => r.key === kb)!] as const)
    .filter(([a, b]) => free(byKey.get(a.key)!) && free(byKey.get(b.key)!) && !a.demand.edge && !b.demand.edge)
    .sort((p, q) => Math.hypot(p[1].demand.at.x - p[0].demand.at.x, p[1].demand.at.y - p[0].demand.at.y) - Math.hypot(q[1].demand.at.x - q[0].demand.at.x, q[1].demand.at.y - q[0].demand.at.y));
  const used = new Set<string>();
  for (const [a, b] of left) {
    if (used.has(a.key) || used.has(b.key)) continue;
    used.add(a.key); used.add(b.key);
    const first = a.demand.nodeId <= b.demand.nodeId ? a : b, second = first === a ? b : a;
    const c = h.combine(byKey.get(first.key)!.demand, byKey.get(second.key)!.demand);
    out = out.filter((x) => x.key !== second.key).map((x) => (x.key === first.key ? c : x));
  }
  return out;
}
