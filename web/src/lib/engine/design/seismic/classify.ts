/**
 * Primary and secondary members against the earthquake. A column is primary. A beam is primary
 * when its line reaches a column or a wall at both ends: from each end of the member the line is
 * followed through the collinear beams it continues into, across nodes with no column, until it
 * meets a column or a wall (held) or stops on another beam or in the air (not held). A beam
 * carried by another beam, or a cantilever, rests on the frame without being part of it, so it is
 * secondary. Roles fixed by hand win.
 *
 * A GUESS from the geometry, offered as a suggestion (`store/seismic-design.svelte.ts`
 * `suggestedSeismicRoles`): a beam framing column to column may still be outside the lateral
 * system (a frame braced by walls), so nothing designs from it. What the design reads is the
 * project's declaration (`model/lateral-system.ts`), and a member that has none is designed as
 * part of the system.
 */
import type { SeismicRole } from '../../../model/seismic-design';

type P = { x: number; y: number; z?: number };

export interface ClassifyInput {
  nodes: ReadonlyMap<number, P>;
  elements: ReadonlyMap<number, { id: number; nodeI: number; nodeJ: number }>;
  /** Kind of each frame member, as the design classifies them. */
  kind: (id: number) => 'beam' | 'column' | 'other';
  /** Nodes where a wall stands. */
  wallNodes?: ReadonlySet<number>;
  overrides?: Record<string, SeismicRole>;
}

export function seismicRoles(i: ClassifyInput): Map<number, SeismicRole> {
  const columnNodes = new Set<number>();
  const beamsAt = new Map<number, number[]>();
  for (const e of i.elements.values()) {
    const k = i.kind(e.id);
    if (k === 'column') { columnNodes.add(e.nodeI); columnNodes.add(e.nodeJ); }
    if (k === 'beam') for (const n of [e.nodeI, e.nodeJ]) beamsAt.set(n, [...(beamsAt.get(n) ?? []), e.id]);
  }
  const held = (n: number) => columnNodes.has(n) || !!i.wallNodes?.has(n);
  const dir = (id: number) => {
    const e = i.elements.get(id)!, a = i.nodes.get(e.nodeI)!, b = i.nodes.get(e.nodeJ)!;
    const v = [b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)], l = Math.hypot(...v) || 1;
    return v.map((c) => c / l);
  };
  /** From member `id` through node `n`: does the line reach a column or a wall? */
  const reaches = (id: number, n: number): boolean => {
    for (let guard = 0; guard < 500; guard++) {
      if (held(n)) return true;
      const d = dir(id);
      const next = (beamsAt.get(n) ?? []).find((o) => o !== id && Math.abs(dir(o).reduce((s, c, k) => s + c * d[k]!, 0)) > 0.999);
      if (next === undefined) return false;
      const e = i.elements.get(next)!;
      id = next; n = e.nodeI === n ? e.nodeJ : e.nodeI;
    }
    return false;
  };
  const out = new Map<number, SeismicRole>();
  for (const e of i.elements.values()) {
    const k = i.kind(e.id);
    if (k === 'other' || !i.nodes.has(e.nodeI) || !i.nodes.has(e.nodeJ)) continue;
    const auto: SeismicRole = k === 'column' || (reaches(e.id, e.nodeI) && reaches(e.id, e.nodeJ)) ? 'primary' : 'secondary';
    out.set(e.id, i.overrides?.[String(e.id)] ?? auto);
  }
  return out;
}
