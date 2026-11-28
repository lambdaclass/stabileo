import type { BeamAdopted, BarGroup } from '../rc-sheets/types';
import type { LineAdopted } from '../rc-sheets/beam-line';
import { modelStore } from './model.svelte';

export interface SheetBeamFaces { top: BarGroup[]; bottom: BarGroup[] }

export interface SheetBeamBars {
  key: string;
  from: 'span' | 'line';
  stirrupDia: number;
  start: SheetBeamFaces; span: SheetBeamFaces; end: SheetBeamFaces;
}

export type SheetBeamBarsReader = (elementId: number) => SheetBeamBars | null;

const used = (gs: ReadonlyArray<BarGroup | undefined>): BarGroup[] => gs.filter((g): g is BarGroup => !!g && g.count > 0).map((g) => ({ ...g }));

export function spanBars(a: BeamAdopted): Omit<SheetBeamBars, 'key' | 'from'> {
  const whole = { top: used(a.top), bottom: used(a.bottom) };
  const at = (s: 'start' | 'span' | 'end') => (a.at?.[s] ? { top: used(a.at[s]!.top), bottom: used(a.at[s]!.bottom) } : whole);
  return { stirrupDia: a.stirrups.dia, start: at('start'), span: at('span'), end: at('end') };
}

export function lineSpanBars(a: LineAdopted, k: number, stirrupDia: number): Omit<SheetBeamBars, 'key' | 'from'> {
  const bent = (i: number) => a.bent?.[i];
  return {
    stirrupDia: a.stirrups?.[k]?.dia ?? stirrupDia,
    start: { top: used([a.top, a.supportTop[k], bent(k - 1), bent(k)]), bottom: used([a.bottom]) },
    span: { top: used([a.top]), bottom: used([a.bottom, a.spanBottom[k], bent(k)]) },
    end: { top: used([a.top, a.supportTop[k + 1], bent(k), bent(k + 1)]), bottom: used([a.bottom]) },
  };
}

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
