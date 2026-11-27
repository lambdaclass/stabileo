import { faceLayout, groupsArea } from '../rc-sheets/bars';
import type { SpanSteel } from './rc-sheet-readers';
import { modelStore } from './model.svelte';
import { i18n } from '../i18n';
import { resultsStore } from './results.svelte';
import { sheetsRun, sheetsStale } from './rc-sheets-view.svelte';
import { decimalFor, makeFmt } from '../rc-sheets/format';
import { designData } from './design-data';
import { physicalGroups } from './physical';
import { buildSheetRows, liveAdopted, rcSheetsData, sheetCode, type SheetRows } from './rc-sheets.svelte';
import { beamDemands, type DemandInput } from '../rc-sheets/demands';
import type { LineAdopted } from '../rc-sheets/beam-line';
import type { Adopted, BeamAdopted } from '../rc-sheets/types';

import { elementsBetween, lineSpanBars, spanBars, type SheetBeamBars, type SheetBeamBarsReader } from './sheet-layout-bars';

const isBeamAdopted = (a: Adopted | undefined): a is BeamAdopted => !!a && Array.isArray((a as BeamAdopted).bottom) && !!(a as BeamAdopted).stirrups;
const isLineAdopted = (a: Adopted | undefined): a is LineAdopted => !!a && Array.isArray((a as LineAdopted).supportTop);

export function sheetBeamBars(): SheetBeamBarsReader {
  const adopted = liveAdopted(rcSheetsData(), sheetCode());
  if (!Object.keys(adopted).some((k) => k.startsWith('beam:') || k.startsWith('line:'))) return () => null;
  const groups = physicalGroups().filter((g) => g.physical.kind === 'beam');
  const input: DemandInput = {
    nodes: modelStore.nodes, elements: modelStore.elements as never, sections: modelStore.sections as never,
    supportNodes: new Set([...modelStore.supports.values()].map((s) => s.nodeId)),
    shells: { nodes: modelStore.nodes, quads: modelStore.quads, plates: modelStore.plates } as never,
    groups: groups.map((g) => ({ id: g.id, name: g.name, kind: g.physical.kind, elements: g.members.elements ?? [], quads: [], plates: [] })),
    sets: [],
  };
  const stirrupDia = designData().stirrupDiaMm;
  const byElement = new Map<number, SheetBeamBars>();
  for (const d of beamDemands(input)) {
    if (!d.line) continue;
    const own = adopted[d.key], line = adopted[`line:${d.line.group}`];
    const bars = isBeamAdopted(own) ? { key: d.key, from: 'span' as const, ...spanBars(own) }
      : isLineAdopted(line) ? { key: d.key, from: 'line' as const, ...lineSpanBars(line, d.line.index, stirrupDia) } : null;
    if (!bars) continue;
    const ids = groups.find((g) => g.id === d.line!.group)?.members.elements ?? [];
    for (const id of elementsBetween(ids, d.line.startNode, d.line.endNode)) byElement.set(id, bars);
  }
  return (id) => byElement.get(id) ?? null;
}

export function sheetsForDocuments(): SheetRows | null {
  if (!resultsStore.results3D) return null;
  if (sheetsRun.rows && !sheetsRun.progress && !sheetsStale()) return sheetsRun.rows;
  if (!Object.keys(liveAdopted(rcSheetsData(), sheetCode())).length) return null;
  return buildSheetRows(makeFmt(decimalFor(i18n.locale)));
}

export function adoptedSpanSteel(span: number[], h: number, b: number, read: SheetBeamBarsReader = sheetBeamBars()): SpanSteel | null {
  const bars = span.map(read).find((x) => !!x);
  if (!bars || !bars.span.bottom.length) return null;
  const cover = designData().covers.beam;
  const As = groupsArea(bars.span.bottom) * 1e-4, AsPrime = groupsArea(bars.span.top) * 1e-4;
  const d = h - faceLayout(bars.span.bottom, b, cover, bars.stirrupDia).centroidFromFace;
  const dPrime = faceLayout(bars.span.top, b, cover, bars.stirrupDia).centroidFromFace;
  return { As, AsPrime, d, dPrime, bars: 'sheets' };
}
