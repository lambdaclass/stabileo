/**
 * The stairs of the reinforcement sheets: the desk's stairs and the flights the model holds that no
 * stair of the desk is (`rc-sheets/stair-demands.ts`), each designed, proposed or as adopted.
 */
import { modelStore } from './model.svelte';
import { stairEntries } from './stairs-pt';
import { findOccupancy } from '../codes/cirsoc101/live-loads';
import { stairDemands } from '../rc-sheets/stair-demands';
import { stairRow, type StairAdopted, type StairContext, type StairRow } from '../rc-sheets/stair-row';
import type { Fmt } from '../rc-sheets/format';
import type { Adopted, SheetCode } from '../rc-sheets/types';

const isStairAdopted = (a: Adopted | undefined): a is StairAdopted => !!a && typeof a === 'object' && 'main' in a && 'dist' in a;

export interface StairInputs { code: SheetCode; fmt: Fmt; adopted: Readonly<Record<string, Adopted>>; diameters: readonly number[]; cover: number; fy: number; fcOf: (quads: number[]) => number; levelAt: (z: number) => string }

/** Every stair the project has, designed. */
export function sheetStairs(o: StairInputs): StairRow[] {
  const demands = stairDemands({ nodes: modelStore.nodes, quads: modelStore.quads, entries: stairEntries(), levelAt: o.levelAt, live: findOccupancy('escalera_otros')?.uniformKNm2 ?? 5 });
  return demands.map((d) => {
    const c: StairContext = { fc: o.fcOf(d.quads), fy: o.fy, cover: o.cover, diameters: o.diameters };
    const a = o.adopted[d.key];
    return stairRow(d, c, isStairAdopted(a) ? a : undefined, o.fmt, o.code);
  });
}
