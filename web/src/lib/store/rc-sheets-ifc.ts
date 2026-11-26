/**
 * The reinforcement sheets in the IFC: the bars of every beam line and column storey as swept
 * centrelines, the same the 3D view draws (`rc-sheets/rebar-3d.ts`), and which model elements
 * each sheet row covers. Slabs and walls are meshes of bars: the file carries their bars as text
 * and their weight, not their geometry.
 */
import { physicalGroups } from './physical';
import { elementsBetween } from './rc-sheets-reinforcement';
import { sheetBars3d } from './rc-rebar-3d.svelte';
import { developedLength3d } from '../rc-sheets/rebar-3d';
import type { SheetRows } from './rc-sheets.svelte';
import type { IfcExportInput } from '../ifc/ifc-writer';

type Bar = IfcExportInput['bars'][number];

const groupElements = (g: number) => physicalGroups().find((x) => x.id === g)?.members.elements ?? [];
const LIGATURES = new Set(['stirrup', 'stirrupTie', 'hanger', 'hoop', 'crossTie']);

/** Every bar of the beam lines and column storeys the sheets designed, each stock piece as the 3D view lays it. */
export function sheetsIfcBars(rows: SheetRows): Bar[] {
  const names = new Map<string, string>([...rows.line, ...rows.column].map((r) => [r.key, r.name]));
  const count = new Map<string, number>();
  return sheetBars3d(rows).filter((b) => b.family === 'beam' || b.family === 'column').flatMap((b) => b.segments.map((points) => {
    const n = count.get(b.element) ?? 0;
    count.set(b.element, n + 1);
    return { id: `${b.element}:${n}`, mark: b.mark ?? `Ø${b.dia}`, diameter: b.dia / 1000, role: LIGATURES.has(b.kind) ? 'ligature' as const : 'main' as const, assembly: names.get(b.element) ?? b.element, length: developedLength3d(points, b.mandrel, b.dia), points };
  }));
}

/** The model elements each beam span and column storey of the sheets covers, by row key. */
export function sheetRowElements(rows: SheetRows): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const r of rows.beam) if (r.demand.line) out.set(r.key, elementsBetween(groupElements(r.demand.line.group), r.demand.line.startNode, r.demand.line.endNode));
  for (const r of rows.column) if (r.demand.nodes) out.set(r.key, elementsBetween(groupElements(Number(r.key.split(':')[1])), r.demand.nodes.bottom, r.demand.nodes.top));
  return out;
}
