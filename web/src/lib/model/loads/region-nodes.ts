/**
 * The part of the model an action is applied to: every node, the nodes inside a load zone's
 * outline in plan (`floor-definitions.ts`), or inside a box of coordinates; and the members whose
 * two ends are in it.
 *
 * Pure.
 */
import { zoneOutline, type DefinitionModel } from './floor-definitions';

export type ActionRegion =
  | { kind: 'all' }
  | { kind: 'zone'; zoneId: number }
  | { kind: 'box'; x?: [number, number]; y?: [number, number]; z?: [number, number] }
  | { kind: 'group'; groupId: number };

const TOL = 1e-3;

function inPlan(p: { x: number; y: number }, poly: ReadonlyArray<readonly [number, number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    const cross = (b[0] - a[0]) * (p.y - a[1]) - (b[1] - a[1]) * (p.x - a[0]);
    const within = Math.min(a[0], b[0]) - TOL <= p.x && p.x <= Math.max(a[0], b[0]) + TOL && Math.min(a[1], b[1]) - TOL <= p.y && p.y <= Math.max(a[1], b[1]) + TOL;
    if (within && Math.abs(cross) <= TOL * Math.hypot(b[0] - a[0], b[1] - a[1])) return true;
    if ((a[1] > p.y) !== (b[1] > p.y) && p.x < (b[0] - a[0]) * (p.y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** The node ids of a region; null for the whole model. */
export function regionNodes(m: DefinitionModel, r: ActionRegion): number[] | null {
  if (r.kind === 'all') return null;
  if (r.kind === 'group') {
    const g = m.groups.get(r.groupId)?.members;
    const ids = new Set(g?.nodes ?? []);
    for (const id of g?.elements ?? []) { const e = m.elements.get(id); if (e) { ids.add(e.nodeI); ids.add(e.nodeJ); } }
    return [...ids];
  }
  if (r.kind === 'zone') {
    const z = zoneOutline(m, r.zoneId);
    if (!z) return [];
    return [...m.nodes.entries()].filter(([, n]) => inPlan(n, z.outer) && !z.holes.some((h) => inPlan(n, h) && !h.some((v) => Math.hypot(v[0] - n.x, v[1] - n.y) < TOL))).map(([id]) => id);
  }
  const inR = (v: number, b?: [number, number]) => !b || (v >= Math.min(...b) - TOL && v <= Math.max(...b) + TOL);
  return [...m.nodes.entries()].filter(([, n]) => inR(n.x, r.x) && inR(n.y, r.y) && inR(n.z ?? 0, r.z)).map(([id]) => id);
}

/** The members with both ends in a region; null for the whole model. */
export function regionMembers(m: DefinitionModel, r: ActionRegion): number[] | null {
  const nodes = regionNodes(m, r);
  if (!nodes) return null;
  const set = new Set(nodes);
  return [...m.elements.values()].filter((e) => set.has(e.nodeI) && set.has(e.nodeJ)).map((e) => e.id);
}
