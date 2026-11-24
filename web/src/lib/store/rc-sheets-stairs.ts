/**
 * The stairs of the reinforcement sheets: the desk's stairs and the flights the model holds that no
 * stair of the desk is (`rc-sheets/stair-demands.ts`), each designed, proposed or as adopted.
 */
import { modelStore } from './model.svelte';
import { stairEntries } from './stairs-pt';
import { physicalPlates } from './physical-plates';
import { findOccupancy } from '../codes/cirsoc101/live-loads';
import { stairDemands } from '../rc-sheets/stair-demands';
import { stairRow, type StairAdopted, type StairContext, type StairRow } from '../rc-sheets/stair-row';
import type { Fmt } from '../rc-sheets/format';
import type { Adopted, SheetCode } from '../rc-sheets/types';

const isStairAdopted = (a: Adopted | undefined): a is StairAdopted => !!a && typeof a === 'object' && 'main' in a && 'dist' in a;

export interface StairInputs { code: SheetCode; fmt: Fmt; adopted: Readonly<Record<string, Adopted>>; diameters: readonly number[]; cover: number; fy: number; fcOf: (quads: number[]) => number; levelAt: (z: number) => string }

/** Every stair the project has, designed. */
export function sheetStairs(o: StairInputs): StairRow[] {
  const declaredSteps = new Map<number, number>();
  for (const pl of physicalPlates()) if (pl.physical.stair?.steps) for (const q of pl.group.members.quads ?? []) declaredSteps.set(q, pl.physical.stair.steps);
  const at = (id: number) => { const n = modelStore.nodes.get(id); return n ? { x: n.x, y: n.y, z: n.z ?? 0 } : null; };
  const bars = [...modelStore.elements.values()].flatMap((e) => { const a = at(e.nodeI), b = at(e.nodeJ); return a && b && Math.abs(a.z - b.z) < 1e-6 ? [[a, b] as const] : []; });
  const demands = stairDemands({ nodes: modelStore.nodes, quads: modelStore.quads, entries: stairEntries(), levelAt: o.levelAt, live: findOccupancy('escalera_otros')?.uniformKNm2 ?? 5, declaredSteps, bars });
  return demands.map((d) => {
    const c: StairContext = { fc: o.fcOf(d.quads), fy: o.fy, cover: o.cover, diameters: o.diameters };
    const a = o.adopted[d.key];
    return stairRow(d, c, isStairAdopted(a) ? a : undefined, o.fmt, o.code);
  });
}
