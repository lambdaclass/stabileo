import { check } from './types';
import type { FootingDemand, FootingRow } from './footing-types';

type P = { x: number; y: number };

/** Two convex quadrilaterals meet unless one of their edge directions separates them; a gap under `clearance` counts as meeting. */
export function rectanglesOverlap(a: readonly P[], b: readonly P[], clearance = 0): boolean {
  for (const poly of [a, b]) for (let k = 0; k < 2; k++) {
    const p = poly[k]!, q = poly[k + 1]!, len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const ax = { x: -(q.y - p.y) / len, y: (q.x - p.x) / len };
    const proj = (r: readonly P[]) => r.map((v) => v.x * ax.x + v.y * ax.y);
    const pa = proj(a), pb = proj(b);
    if (Math.max(...pa) + clearance <= Math.min(...pb) + 1e-9 || Math.max(...pb) + clearance <= Math.min(...pa) + 1e-9) return false;
  }
  return true;
}

export const footingCorners = (r: Pick<FootingRow, 'B' | 'L' | 'ex' | 'ey'> & { demand: { at: P } }): P[] => {
  const cx = r.demand.at.x + r.ex, cy = r.demand.at.y + r.ey;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => ({ x: cx + (u! * r.B) / 2, y: cy + (v! * r.L) / 2 }));
};

const underside = (r: FootingRow) => r.founding;

/** The pairs of footings whose plans overlap at about the same level, and the groups they join into. */
export function footingOverlaps(rows: readonly FootingRow[], clearance = 0): { pairs: Array<[string, string]>; groups: string[][] } {
  const live = rows.filter((r) => r.B > 0 && r.L > 0);
  const corners = new Map(live.map((r) => [r.key, footingCorners(r)]));
  const parent = new Map(live.map((r) => [r.key, r.key]));
  const root = (k: string): string => (parent.get(k) === k ? k : root(parent.get(k)!));
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i]!, b = live[j]!;
    if (Math.abs(underside(a) - underside(b)) > Math.max(a.h, b.h)) continue;
    if (!rectanglesOverlap(corners.get(a.key)!, corners.get(b.key)!, clearance)) continue;
    pairs.push([a.key, b.key]);
    parent.set(root(b.key), root(a.key));
  }
  const by = new Map<string, string[]>();
  for (const r of live) { const k = root(r.key); by.set(k, [...(by.get(k) ?? []), r.key]); }
  return { pairs, groups: [...by.values()].filter((g) => g.length > 1) };
}

/** The rows with a failing line for each footing they overlap: such footings are to be combined into one. */
export function withOverlaps(rows: readonly FootingRow[]): FootingRow[] {
  const { pairs } = footingOverlaps(rows);
  if (!pairs.length) return [...rows];
  const name = new Map(rows.map((r) => [r.key, r.name]));
  const others = new Map<string, string[]>();
  for (const [a, b] of pairs) { others.set(a, [...(others.get(a) ?? []), name.get(b)!]); others.set(b, [...(others.get(b) ?? []), name.get(a)!]); }
  return rows.map((r) => {
    const o = others.get(r.key);
    if (!o) return r;
    return { ...r, status: 'fail', verifications: [...r.verifications, check('rcSheets.v.footOverlap', false, { demand: o.join(', ') })] };
  });
}

/** A footing whose only failing check is that it overlaps another: no reinforcement is missing, the plan is. */
export const onlyOverlaps = (r: Pick<FootingRow, 'verifications'>): boolean => {
  const bad = r.verifications.filter((v) => !v.ok);
  return bad.length > 0 && bad.every((v) => v.label === 'rcSheets.v.footOverlap');
};

/** The building's plan at its base: the rectangle its columns' and cores' outlines reach, m². */
export function buildingPlan(demands: readonly Pick<FootingDemand, 'at' | 'column' | 'pier'>[]): { x0: number; x1: number; y0: number; y1: number; area: number } | null {
  const pts = demands.flatMap((d) => (d.pier?.outline?.length ? d.pier.outline : d.column
    ? [{ x: d.at.x - d.column.b / 2, y: d.at.y - d.column.h / 2 }, { x: d.at.x + d.column.b / 2, y: d.at.y + d.column.h / 2 }]
    : [d.at]));
  if (pts.length < 2) return null;
  const x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x)), y0 = Math.min(...pts.map((p) => p.y)), y1 = Math.max(...pts.map((p) => p.y));
  const area = (x1 - x0) * (y1 - y0);
  return area > 1e-9 ? { x0, x1, y0, y1, area } : null;
}

/** How much of the building's plan its footings cover: their areas summed over the plan its columns reach (GA §7.1), m². */
export function footingCover(rows: readonly FootingRow[]): { footings: number; plan: number; share: number } | null {
  const live = rows.filter((r) => r.B > 0 && r.L > 0);
  if (live.length < 2) return null;
  const plan = buildingPlan(live.flatMap((r) => r.demand.group?.members ?? (r.demand.carried ? [r.demand, r.demand.carried] : [r.demand])));
  const footings = live.reduce((t, r) => t + r.B * r.L, 0);
  return plan ? { footings, plan: plan.area, share: footings / plan.area } : null;
}
