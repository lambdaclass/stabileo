/**
 * Column stacks: the columns of a building that stand on one plan position, one over another,
 * ordered bottom to top, each a lift of the stack. Two stacks repeat when their lifts have the same
 * sections, heights and plan rotation in the same order; equalizing a group gives each lift the
 * heaviest reinforcement any stack of the group has at that lift.
 */
import type { ProvidedReinforcement } from '../../design-contract/reinforcement';

export interface StackLift { id: number; zLo: number; zHi: number; sectionId: number }
export interface ColumnStack { key: string; x: number; y: number; lifts: StackLift[]; signature: string[] }

export function columnStacks(input: {
  nodes: ReadonlyMap<number, { x: number; y: number; z?: number }>;
  elements: ReadonlyMap<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; rollAngle?: number }>;
  columns: Iterable<number>;
}): ColumnStack[] {
  const by = new Map<string, { x: number; y: number; lifts: Array<StackLift & { roll: number }> }>();
  for (const id of input.columns) {
    const e = input.elements.get(id);
    const a = e && input.nodes.get(e.nodeI), b = e && input.nodes.get(e.nodeJ);
    if (!e || !a || !b) continue;
    const [lo, hi] = (a.z ?? 0) <= (b.z ?? 0) ? [a, b] : [b, a];
    const key = `${Math.round(lo.x * 1000)}:${Math.round(lo.y * 1000)}`;
    const s = by.get(key) ?? { x: lo.x, y: lo.y, lifts: [] };
    s.lifts.push({ id, zLo: lo.z ?? 0, zHi: hi.z ?? 0, sectionId: e.sectionId, roll: Math.round(((e.rollAngle ?? 0) % 180 + 180) % 180) });
    by.set(key, s);
  }
  return [...by].map(([key, s]) => {
    const lifts = s.lifts.sort((p, q) => p.zLo - q.zLo);
    return {
      key, x: s.x, y: s.y,
      lifts: lifts.map(({ roll: _r, ...l }) => l),
      signature: lifts.map((l) => `${l.sectionId}:${Math.round((l.zHi - l.zLo) * 1000)}:${l.roll}:${Math.round(l.zLo * 1000)}`),
    };
  }).sort((p, q) => p.x - q.x || p.y - q.y);
}

/** Stacks with the same lifts, two or more to a group. */
export function repeatedStacks(stacks: readonly ColumnStack[]): ColumnStack[][] {
  const by = new Map<string, ColumnStack[]>();
  for (const s of stacks) by.set(s.signature.join('|'), [...(by.get(s.signature.join('|')) ?? []), s]);
  return [...by.values()].filter((g) => g.length > 1);
}

/** The longitudinal steel of a column's bars, cm². */
export function columnSteel(r: ProvidedReinforcement | undefined): number {
  if (!r) return 0;
  const a = (n: number, d: number) => n * Math.PI * d * d / 400;
  if (r.shaped) return a(r.shaped.count, r.shaped.diameter);
  if (r.column) {
    const c = r.column;
    return a(4, c.cornerDia) + a(c.nBottom + c.nTop + c.nLeft + c.nRight, c.faceDia);
  }
  return r.longitudinal ? a(r.longitudinal.count, r.longitudinal.diameter) : 0;
}

/** Per lift index, the stack lift with the most steel and the others to write it to. */
export function equalizeStackGroup(group: readonly ColumnStack[], bars: (id: number) => ProvidedReinforcement | undefined): Array<{ target: number; source: number }> {
  const out: Array<{ target: number; source: number }> = [];
  const n = group[0]?.lifts.length ?? 0;
  for (let i = 0; i < n; i++) {
    const at = group.map((s) => s.lifts[i]!.id);
    const best = at.reduce((p, q) => (columnSteel(bars(q)) > columnSteel(bars(p)) ? q : p), at[0]!);
    if (!bars(best)) continue;
    for (const id of at) if (id !== best) out.push({ target: id, source: best });
  }
  return out;
}

/** A lift's bar breakdown: the longitudinal bars at their length with the lap above, and the ties. */
export function liftBreakdown(lift: { zLo: number; zHi: number }, r: ProvidedReinforcement | undefined, lap: (dMm: number) => number, perimeter: number): Array<{ what: 'long' | 'tie'; count: number; diameter: number; length: number }> {
  if (!r) return [];
  const H = lift.zHi - lift.zLo;
  const out: Array<{ what: 'long' | 'tie'; count: number; diameter: number; length: number }> = [];
  const long = r.shaped ? { n: r.shaped.count, d: r.shaped.diameter } : r.column
    ? { n: 4 + r.column.nBottom + r.column.nTop + r.column.nLeft + r.column.nRight, d: r.column.cornerDia }
    : r.longitudinal ? { n: r.longitudinal.count, d: r.longitudinal.diameter } : null;
  if (long) out.push({ what: 'long', count: long.n, diameter: long.d, length: +(H + lap(long.d)).toFixed(2) });
  const s = r.stirrups;
  if (s) {
    const z = r.tieZones;
    const n = z && H > 2 * z.endLength ? Math.ceil((2 * z.endLength) / z.endSpacing) + Math.ceil((H - 2 * z.endLength) / s.spacing) + 1 : Math.ceil(H / s.spacing) + 1;
    out.push({ what: 'tie', count: n, diameter: s.diameter, length: +(perimeter + 0.15).toFixed(2) });
  }
  return out;
}
