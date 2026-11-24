/**
 * A column's fixed point: the point of its section that stays put up the building while the
 * section changes, by which it is set out on site. It is the centre, the middle of a face or a
 * corner, read in the section's own axes (b along its first, h along its second) of the column's
 * lowest storey; the sections above stand so that their same point falls on it, each moved off
 * its analysis axis by what the change of size takes. A circle marks the centre, a half circle a
 * face, a quarter circle a corner.
 */
import type { PlanColumnItem, Pt, StructurePlan } from './structure-plan';

export type FixedPointKind = 'c' | 'px' | 'nx' | 'py' | 'ny' | 'pxpy' | 'pxny' | 'nxpy' | 'nxny';
export const FIXED_POINT_KINDS: readonly FixedPointKind[] = ['c', 'px', 'nx', 'py', 'ny', 'pxpy', 'pxny', 'nxpy', 'nxny'];

/** The fixed points a project states, those that name a kind it knows. */
export function fixedPointsOf(v: unknown): { fixedPoints?: Record<string, FixedPointKind> } {
  if (!v || typeof v !== 'object') return {};
  const out = Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, FixedPointKind] => FIXED_POINT_KINDS.includes(e[1] as FixedPointKind)));
  return Object.keys(out).length ? { fixedPoints: out } : {};
}

/** Which side of the section's centre the point stands on, along b and along h. */
export function fixedSigns(k: FixedPointKind): [number, number] {
  const sx = k.includes('px') ? 1 : k.includes('nx') ? -1 : 0, sy = k.includes('py') ? 1 : k.includes('ny') ? -1 : 0;
  return [sx, sy];
}

export const fixedShape = (k: FixedPointKind): 'centre' | 'face' | 'corner' => { const [a, b] = fixedSigns(k); return a && b ? 'corner' : a || b ? 'face' : 'centre'; };

/** A column stack's key: where it stands in plan, to the centimetre. */
export const stackKey = (at: Pt): string => `${Math.round(at[0] * 100)},${Math.round(at[1] * 100)}`;

const turn = (v: Pt, deg: number): Pt => { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; };

/** The point in plan of a section `b` × `h` centred at `at` and turned `rotDeg`, m. */
export const fixedPointOf = (at: Pt, rotDeg: number, b: number, h: number, k: FixedPointKind): Pt => {
  const [sx, sy] = fixedSigns(k), o = turn([(sx * b) / 2, (sy * h) / 2], rotDeg);
  return [at[0] + o[0], at[1] + o[1]];
};

/** A column as placed by its fixed point: the point, the section's centre and how far it moved off its analysis axis, m. */
export interface ColumnFixed { kind: FixedPointKind; stack: string; at: Pt; rotDeg: number; centre: Pt; shift: number }

/**
 * The plans with each column placed by its stack's fixed point: grouped by where they stand,
 * the lowest of `levels` the reference, the outline and bars of the sections above moved so that
 * their same point falls on the reference's. The analysis keeps every section on its axis: the
 * move is what the drawings and the setting out show, and each column says how far.
 */
export function withFixedPoints(plans: readonly StructurePlan[], levels: readonly string[], kindOf: (stack: string) => FixedPointKind): StructurePlan[] {
  const rank = (l: string) => { const i = levels.indexOf(l); return i < 0 ? levels.length : i; };
  const ref = new Map<string, { item: PlanColumnItem; rank: number }>();
  for (const p of plans) for (const it of p.items) {
    if (it.kind !== 'column') continue;
    const k = stackKey(it.at), r = rank(p.level), cur = ref.get(k);
    if (!cur || r < cur.rank) ref.set(k, { item: it, rank: r });
  }
  return plans.map((p) => ({
    ...p,
    items: p.items.map((it) => {
      if (it.kind !== 'column') return it;
      const stack = stackKey(it.at), kind = kindOf(stack), base = ref.get(stack)!.item;
      const at = fixedPointOf(base.at, base.rotDeg, base.b, base.h, kind);
      const [sx, sy] = fixedSigns(kind), o = turn([(sx * it.b) / 2, (sy * it.h) / 2], it.rotDeg);
      const centre: Pt = [at[0] - o[0], at[1] - o[1]], d: Pt = [centre[0] - it.at[0], centre[1] - it.at[1]];
      const move = (q: Pt): Pt => [q[0] + d[0], q[1] + d[1]];
      return { ...it, outline: it.outline.map(move), rebars: it.rebars.map((b) => ({ ...b, at: move(b.at) })), fixed: { kind, stack, at, rotDeg: it.rotDeg, centre, shift: Math.hypot(d[0], d[1]) } };
    }),
  }));
}

/** The symbol of a fixed point in plan, m: a circle, or the arc of a half or a quarter circle opening into the section. */
export function fixedSymbol(f: ColumnFixed, r: number): { kind: 'circle'; c: Pt; r: number } | { kind: 'arc'; c: Pt; r: number; start: number; end: number } {
  const [sx, sy] = fixedSigns(f.kind);
  if (!sx && !sy) return { kind: 'circle', c: f.at, r };
  const inward = (Math.atan2(0 - sy, 0 - sx) * 180) / Math.PI + f.rotDeg;
  const half = sx && sy ? 45 : 90;
  return { kind: 'arc', c: f.at, r, start: inward - half, end: inward + half };
}

/** One column's setting out: its fixed point from the model's origin, and from the nearest axis each way, m; how far its stack's sections move off their axes. */
export interface SettingOut { stack: string; name: string; kind: FixedPointKind; x: number; y: number; axisX: { name: string; d: number } | null; axisY: { name: string; d: number } | null; shift: number }

/** Every column stack's setting out, from the lowest level it stands on, by name. */
export function settingOut(plans: readonly StructurePlan[], levels: readonly string[], axes: ReadonlyArray<{ name: string; axis: 'x' | 'y'; at: number }>): SettingOut[] {
  const rank = (l: string) => { const i = levels.indexOf(l); return i < 0 ? levels.length : i; };
  const byStack = new Map<string, { item: PlanColumnItem; rank: number; shift: number }>();
  for (const p of plans) for (const it of p.items) {
    if (it.kind !== 'column' || !it.fixed) continue;
    const r = rank(p.level), cur = byStack.get(it.fixed.stack);
    const shift = Math.max(cur?.shift ?? 0, it.fixed.shift);
    if (!cur || r < cur.rank) byStack.set(it.fixed.stack, { item: it, rank: r, shift }); else cur.shift = shift;
  }
  const near = (axis: 'x' | 'y', v: number) => {
    const list = axes.filter((a) => a.axis === axis);
    if (!list.length) return null;
    const a = list.reduce((b, x) => (Math.abs(x.at - v) < Math.abs(b.at - v) ? x : b));
    return { name: a.name, d: v - a.at };
  };
  return [...byStack.values()].map(({ item, shift }) => {
    const f = item.fixed!;
    return { stack: f.stack, name: item.name, kind: f.kind, x: f.at[0], y: f.at[1], axisX: near('x', f.at[0]), axisY: near('y', f.at[1]), shift };
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
