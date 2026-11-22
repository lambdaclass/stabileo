import { anchorsOf, inwardPartner, nearestSides, type PropertyLines } from '../model/foundation/edges';
import type { FootingBalance, FootingDemand, FootingEdge, FootingSetup, StrapPartner } from './footing-types';

export interface EdgeInput {
  lines: PropertyLines;
  setup: Readonly<Record<string, FootingSetup>>;
  /** The model's strap beams: their physical member, row key, end nodes and section, m. */
  straps: ReadonlyArray<{ group: number; key: string; a: number; b: number; width: number; depth: number }>;
}

const LEVEL_TOL = 0.05;

/** Each footing's anchor from every axis point it stands on: a pier holds a line where any of its base nodes does. */
function anchorsHeld(pts: ReadonlyArray<{ id: number; x: number; y: number }>, lines: PropertyLines): Map<number, [number, number]> {
  const out = new Map<number, [number, number]>();
  anchorsOf(pts.map((p, i) => ({ id: i, x: p.x, y: p.y })), lines).forEach((a, i) => {
    const id = pts[i]!.id, was = out.get(id) ?? [0, 0];
    out.set(id, [was[0] || a[0], was[1] || a[1]]);
  });
  return out;
}

/**
 * Each footing's position and balance: the row's own setup first, then the model's footing (its
 * anchor and straps), then the property lines. A footing set at a line or a corner by hand where
 * no line is declared is held at the building's nearest side. A strap runs to the footing the
 * model ties it to, else to the nearest one inward at the same level.
 */
export function withEdges(demands: readonly FootingDemand[], o: EdgeInput): FootingDemand[] {
  const live = demands.filter((d) => d.column && !d.footing?.outOfScope);
  const pts = live.map((d) => ({ id: d.nodeId, x: d.at.x, y: d.at.y }));
  const axes = live.flatMap((d) => (d.pier?.points?.length ? d.pier.points : [d.at]).map((q) => ({ id: d.nodeId, x: q.x, y: q.y })));
  const fromLines = anchorsHeld(axes, o.lines);
  return demands.map((d) => {
    if (!d.column || d.footing?.outOfScope) return d;
    const s = o.setup[d.key];
    const lined = fromLines.get(d.nodeId) ?? [0, 0];
    const model = d.footing?.anchor ?? [0, 0];
    const held = (a: readonly number[]) => a[0] !== 0 || a[1] !== 0;
    let anchor: [number, number] = [0, 0];
    let source: FootingEdge['source'] = 'lines';
    if (s?.position) {
      source = 'row';
      if (s.position !== 'centred') {
        const known: [number, number] = held(model) ? [model[0]!, model[1]!] : [lined[0]!, lined[1]!];
        const near = nearestSides(d.at, pts);
        if (s.position === 'corner') anchor = [known[0] || near[0], known[1] || near[1]];
        else if (known[0] && !known[1]) anchor = [known[0], 0];
        else if (known[1] && !known[0]) anchor = [0, known[1]];
        else {
          const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
          const gapX = Math.min(d.at.x - Math.min(...xs), Math.max(...xs) - d.at.x), gapY = Math.min(d.at.y - Math.min(...ys), Math.max(...ys) - d.at.y);
          anchor = gapX <= gapY ? [known[0] || near[0], 0] : [0, known[1] || near[1]];
        }
      }
    } else if (held(model)) { anchor = [model[0]!, model[1]!]; source = 'model'; }
    else anchor = [lined[0]!, lined[1]!];
    if (!held(anchor)) return d;
    const balance: FootingBalance = s?.balance ?? 'strap';
    const partners: StrapPartner[] = [];
    {
      const level = live.filter((q) => q.key !== d.key && Math.abs(q.at.z - d.at.z) < LEVEL_TOL);
      for (const axis of ['x', 'y'] as const) {
        const a = axis === 'x' ? anchor[0] : anchor[1];
        if (!a) continue;
        const dir: [number, number] = axis === 'x' ? [a, 0] : [0, a];
        const tied = d.footing?.straps?.map((n) => level.find((q) => q.nodeId === n)).find((q) => q && Math.sign(axis === 'x' ? d.at.x - q.at.x : d.at.y - q.at.y) === a);
        const q = tied ?? inwardPartner({ id: d.nodeId, x: d.at.x, y: d.at.y }, dir, level.map((x) => ({ id: x.nodeId, x: x.at.x, y: x.at.y, dem: x })))?.dem;
        if (!q) continue;
        const beam = o.straps.find((m) => (m.a === d.nodeId && m.b === q.nodeId) || (m.b === d.nodeId && m.a === q.nodeId));
        partners.push({
          axis, key: q.key, nodeId: q.nodeId, name: q.name, L: Math.hypot(q.at.x - d.at.x, q.at.y - d.at.y), column: q.column ? { b: q.column.b, h: q.column.h } : null,
          ...(beam ? { beam: { group: beam.group, key: beam.key, b: beam.width, h: beam.depth } } : {}),
        });
      }
    }
    return { ...d, edge: { anchor, source, balance, partners } };
  });
}
