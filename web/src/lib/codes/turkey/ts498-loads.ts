import type { ElementKind, OccupancyEntry } from '../cirsoc101/live-loads';
import { msg, round, type EngineMessage } from '../message';
import type { ClauseRef } from '../regulation';
import type { MassUse } from './inputs';
import { TS498 } from './refs';
import { loadsProfile } from '../../code-profiles/registry';
import { occupancyRows } from '../../code-profiles/adapters/occupancies';

export interface TrOccupancy extends OccupancyEntry {
  use: MassUse;
}

export const TS498_OCCUPANCIES: readonly TrOccupancy[] = Object.freeze(
  occupancyRows(loadsProfile('ts498-1997')).map(({ row, entry }) => ({ ...entry, use: row.tags!.use as MassUse })),
);

export const findTrOccupancy = (key: string) => TS498_OCCUPANCIES.find((o) => o.key === key);

export const occupancyUse = (key: string): MassUse | undefined => findTrOccupancy(key)?.use;

/**
 * Çizelge 8, β by the number of floors carried: (a) dwellings, offices and office blocks, a
 * reduction of at most 40 %; (b) light workplaces, workshops, manufacturing and shops, at most 20 %.
 */
const BETA_A = [1, 1, 1, 0.95, 0.88, 0.8, 0.71, 0.65, 0.6, 0.6, 0.6, 0.6] as const;
const BETA_B = [1, 1, 1, 0.98, 0.94, 0.9, 0.86, 0.83, 0.8, 0.8, 0.8, 0.8] as const;
/** Row (a) of Çizelge 8 for dwellings and offices; row (b) for the other occupancies Madde 13 lets reduce. */
const rowOf = (key: string | undefined): 'a' | 'b' => {
  const c = key ? findTrOccupancy(key)?.category : undefined;
  return c === 'residential' || c === 'office' ? 'a' : 'b';
};

const COLUMNS: ReadonlySet<ElementKind> = new Set(['interiorColumn', 'exteriorColumnNoCantilever', 'edgeColumnWithCantilever', 'cornerColumnWithCantilever']);

export function ts498Reduce(o: { loKNm2: number; elementKind: ElementKind; floorsSupported: number; noReduction: boolean; occupancyKey?: string }): { lKNm2: number; refs: ClauseRef[]; reason: EngineMessage } {
  const refs = [TS498('13', 'hareketli yük azaltması'), TS498('Çizelge 8')];
  if (o.noReduction) return { lKNm2: o.loKNm2, refs, reason: msg('loads.tr.live.reduction.notAllowed') };
  if (!COLUMNS.has(o.elementKind)) return { lKNm2: o.loKNm2, refs, reason: msg('loads.tr.live.reduction.notColumn') };
  const floors = Math.max(1, Math.floor(o.floorsSupported));
  if (floors <= 3) return { lKNm2: o.loKNm2, refs, reason: msg('loads.tr.live.reduction.fewFloors', { floors }) };
  const row = rowOf(o.occupancyKey);
  const table = row === 'a' ? BETA_A : BETA_B;
  const beta = table[Math.min(floors, table.length) - 1]!;
  return { lKNm2: o.loKNm2 * beta, refs, reason: msg('loads.tr.live.reduction.applied', { floors, beta, lo: o.loKNm2, l: round(o.loKNm2 * beta, 3), row }) };
}
