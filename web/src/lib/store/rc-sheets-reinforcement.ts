/**
 * The bars the reinforcement sheets adopted, read per model element: for each span of a beam
 * line, the bars at its start, at midspan and at its end. A span's own adopted bars win; else
 * the line's, laid as the line lays them (the run top and bottom, each support's extra top bars,
 * each span's extra bottom bars and the bent bars). Only adopted bars count: a proposal nobody
 * adopted is not the beam's reinforcement.
 */
import { modelStore } from './model.svelte';
import { designData } from './design-data';
import { physicalGroups } from './physical';
import { liveAdopted, rcSheetsData, sheetCode } from './rc-sheets.svelte';
import { beamDemands, type DemandInput } from '../rc-sheets/demands';
import type { LineAdopted } from '../rc-sheets/beam-line';
import type { Adopted, BarGroup, BeamAdopted } from '../rc-sheets/types';

export interface SheetBeamFaces { top: BarGroup[]; bottom: BarGroup[] }

export interface SheetBeamBars {
  /** The sheets' row key of the span (`beam:<group>:<index>`). */
  key: string;
  /** Whether the bars are the span's own or its line's. */
  from: 'span' | 'line';
  stirrupDia: number;
  start: SheetBeamFaces; span: SheetBeamFaces; end: SheetBeamFaces;
}

export type SheetBeamBarsReader = (elementId: number) => SheetBeamBars | null;

const used = (gs: ReadonlyArray<BarGroup | undefined>): BarGroup[] => gs.filter((g): g is BarGroup => !!g && g.count > 0).map((g) => ({ ...g }));

const isBeamAdopted = (a: Adopted | undefined): a is BeamAdopted => !!a && Array.isArray((a as BeamAdopted).bottom) && !!(a as BeamAdopted).stirrups;
const isLineAdopted = (a: Adopted | undefined): a is LineAdopted => !!a && Array.isArray((a as LineAdopted).supportTop);

export function spanBars(a: BeamAdopted): Omit<SheetBeamBars, 'key' | 'from'> {
  const whole = { top: used(a.top), bottom: used(a.bottom) };
  const at = (s: 'start' | 'span' | 'end') => (a.at?.[s] ? { top: used(a.at[s]!.top), bottom: used(a.at[s]!.bottom) } : whole);
  return { stirrupDia: a.stirrups.dia, start: at('start'), span: at('span'), end: at('end') };
}

/** Span `k` of a line: the support top bars and the bent bars arriving at each end, the span's extra bottom bars and its bent bars at midspan. */
export function lineSpanBars(a: LineAdopted, k: number, stirrupDia: number): Omit<SheetBeamBars, 'key' | 'from'> {
  const bent = (i: number) => a.bent?.[i];
  return {
    stirrupDia: a.stirrups?.[k]?.dia ?? stirrupDia,
    start: { top: used([a.top, a.supportTop[k], bent(k - 1), bent(k)]), bottom: used([a.bottom]) },
    span: { top: used([a.top]), bottom: used([a.bottom, a.spanBottom[k], bent(k)]) },
    end: { top: used([a.top, a.supportTop[k + 1], bent(k), bent(k + 1)]), bottom: used([a.bottom]) },
  };
}

/** The group's elements on the way from one node to another along the chain they form. */
export function elementsBetween(ids: readonly number[], from: number, to: number): number[] {
  const els = ids.map((id) => modelStore.elements.get(id)).filter((e): e is NonNullable<typeof e> => !!e);
  for (const first of els.filter((e) => e.nodeI === from || e.nodeJ === from)) {
    const out = [first.id];
    let at = first.nodeI === from ? first.nodeJ : first.nodeI;
    while (at !== to) {
      const next = els.find((e) => !out.includes(e.id) && (e.nodeI === at || e.nodeJ === at));
      if (!next) break;
      out.push(next.id);
      at = next.nodeI === at ? next.nodeJ : next.nodeI;
    }
    if (at === to) return out;
  }
  return [];
}

/**
 * A reader of the adopted beam bars by element id. Build it once for a pass over many elements:
 * it splits every beam line into its spans when built.
 */
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
