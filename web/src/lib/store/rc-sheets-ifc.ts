/**
 * The reinforcement sheets in the IFC: the bars of every beam line and column storey as swept
 * centrelines, and which model elements each sheet row covers. A beam line's bars are the
 * sheets' own bent shapes (`rc-sheets/shape.ts`) laid along the line's axis from its first
 * node, each group spread across the width inside the stirrups, with its stirrups as closed
 * hoops zone by zone; a column's are straight bars over the storey with its ties. Slabs and walls
 * are meshes of bars: the file carries their bars as text and their weight, not their geometry.
 */
import { modelStore } from './model.svelte';
import { physicalGroups } from './physical';
import { elementsBetween } from './rc-sheets-reinforcement';
import { computeLocalAxes3D } from '../engine/local-axes-3d';
import { memberOffsetAt } from '../engine/member-offsets';
import { stirrupsOver } from '../rc-sheets/schedule/pieces';
import { columnBars, type ColumnContext } from '../rc-sheets/column-row';
import type { SheetRows } from './rc-sheets.svelte';
import type { IfcExportInput, V3 } from '../ifc/ifc-writer';

type Bar = IfcExportInput['bars'][number];

const add = (p: V3, ...vs: Array<[V3, number]>): V3 => vs.reduce<V3>((a, [v, k]) => [a[0] + v[0] * k, a[1] + v[1] * k, a[2] + v[2] * k], p);
const UP: V3 = [0, 0, 1];
const nodeAt = (id: number): V3 | null => { const n = modelStore.nodes.get(id); return n ? [n.x, n.y, n.z ?? 0] : null; };
const spreadAcross = (n: number, width: number) => Array.from({ length: n }, (_, i) => (n > 1 ? -width / 2 + (i * width) / (n - 1) : 0));
const groupElements = (g: number) => physicalGroups().find((x) => x.id === g)?.members.elements ?? [];

/** A closed hoop in the plane of `u` and `w` around `centre`, its legs `a` and `b` apart. */
function hoop(centre: V3, u: V3, w: V3, a: number, b: number): V3[] {
  const c = (su: number, sw: number) => add(centre, [u, (su * a) / 2], [w, (sw * b) / 2]);
  return [c(-1, -1), c(1, -1), c(1, 1), c(-1, 1), c(-1, -1)];
}

function lineBars(rows: SheetRows): Bar[] {
  const out: Bar[] = [];
  for (const l of rows.line) {
    const spans = rows.beam.filter((r) => r.demand.line?.group === l.group).sort((p, q) => p.demand.line!.index - q.demand.line!.index);
    const first = spans[0]?.demand.line, last = spans[spans.length - 1]?.demand.line;
    if (!first || !last) continue;
    const A = nodeAt(first.startNode), B = nodeAt(last.endNode);
    if (!A || !B) continue;
    const plan = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (plan < 1e-6) continue;
    const u: V3 = [(B[0] - A[0]) / plan, (B[1] - A[1]) / plan, 0], v: V3 = [-u[1], u[0], 0];
    const e0 = modelStore.elements.get(elementsBetween(groupElements(l.group), first.startNode, first.endNode)[0] ?? -1);
    const off = e0 ? memberOffsetAt(e0, first.startNode, modelStore.nodes, modelStore.sections) : { x: 0, y: 0, z: 0 };
    const hMax = Math.max(...l.spans.map((s) => s.h)), bMin = Math.min(...l.spans.map((s) => s.b));
    const soffit = add(A, [[off.x, off.y, off.z], 1], [UP, -hMax / 2]);
    const st = (l.zones[0]?.stirrups.dia ?? 8) / 1000;
    for (const b of l.bars) {
      const lateral = spreadAcross(b.bars.count, bMin - 2 * (l.cover + st) - b.bars.dia / 1000);
      lateral.forEach((t, i) => out.push({
        id: `${l.key}:${b.mark}:${i}`, mark: b.mark, diameter: b.bars.dia / 1000, role: 'main', assembly: l.name, length: b.length,
        points: b.shape.pts.map(([x, y]) => add(soffit, [u, x], [v, t], [UP, y])),
      }));
    }
    l.zones.forEach((z, zi) => {
      const s = l.spans[z.span]!, d = z.stirrups.dia / 1000;
      const n = stirrupsOver(z.from, z.to, z.stirrups.spacing);
      const first = Math.min(0.05, z.stirrups.spacing / 2);
      const w = s.b - 2 * l.cover - d, h = s.h - 2 * l.cover - d;
      for (let j = 0; j < n; j++) {
        const x = z.from + first + j * z.stirrups.spacing;
        const centre = add(soffit, [u, x], [UP, hMax - s.h / 2]);
        out.push({ id: `${l.key}:st${zi}:${j}`, mark: `Ø${z.stirrups.dia}`, diameter: d, role: 'ligature', assembly: l.name, length: 2 * (w + h), points: hoop(centre, v, UP, w, h) });
      }
    });
  }
  return out;
}

function columnBarsIfc(rows: SheetRows): Bar[] {
  const out: Bar[] = [];
  for (const r of rows.column) {
    const ends = r.demand.nodes;
    const P0 = ends && nodeAt(ends.bottom), P1 = ends && nodeAt(ends.top);
    if (!ends || !P0 || !P1) continue;
    const e = modelStore.elements.get(elementsBetween(groupElements(Number(r.key.split(':')[1])), ends.bottom, ends.top)[0] ?? -1);
    const nI = e && modelStore.nodes.get(e.nodeI), nJ = e && modelStore.nodes.get(e.nodeJ);
    if (!e || !nI || !nJ) continue;
    const ax = computeLocalAxes3D({ ...nI, z: nI.z ?? 0 } as never, { ...nJ, z: nJ.z ?? 0 } as never, undefined, (e as { rollAngle?: number }).rollAngle);
    const H = P1[2] - P0[2];
    const a = r.adopted;
    for (const [i, bar] of columnBars(r, a, { cover: r.cover, tieDia: a.tieDia } as ColumnContext).entries()) {
      const dia = Math.round(Math.sqrt((4 * bar.area) / Math.PI) * 1000);
      const at = add(P0, [ax.ey, bar.x], [ax.ez, bar.y]);
      out.push({ id: `${r.key}:${i}`, mark: `Ø${dia}`, diameter: dia / 1000, role: 'main', assembly: r.name, length: H, points: [at, add(at, [UP, H])] });
    }
    const d = a.tieDia / 1000, w = r.b - 2 * r.cover - d, h = r.h - 2 * r.cover - d;
    const n = stirrupsOver(0, H, a.tieSpacing), first = Math.min(0.05, a.tieSpacing / 2);
    for (let j = 0; j < n; j++) {
      out.push({ id: `${r.key}:t${j}`, mark: `Ø${a.tieDia}`, diameter: d, role: 'ligature', assembly: r.name, length: 2 * (w + h), points: hoop(add(P0, [UP, first + j * a.tieSpacing]), ax.ey, ax.ez, w, h) });
    }
  }
  return out;
}

/** Every bar of the beam lines and column storeys the sheets designed. */
export function sheetsIfcBars(rows: SheetRows): Bar[] {
  return [...lineBars(rows), ...columnBarsIfc(rows)];
}

/** The model elements each beam span and column storey of the sheets covers, by row key. */
export function sheetRowElements(rows: SheetRows): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const r of rows.beam) if (r.demand.line) out.set(r.key, elementsBetween(groupElements(r.demand.line.group), r.demand.line.startNode, r.demand.line.endNode));
  for (const r of rows.column) if (r.demand.nodes) out.set(r.key, elementsBetween(groupElements(Number(r.key.split(':')[1])), r.demand.nodes.bottom, r.demand.nodes.top));
  return out;
}
