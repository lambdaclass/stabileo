import type { ElementKind, OccupancyCategory, OccupancyEntry } from '../cirsoc101/live-loads';
import { msg, round, type EngineMessage } from '../message';
import type { ClauseRef } from '../regulation';
import type { MassUse } from './inputs';
import { TS498 } from './refs';

const T7 = TS498('Çizelge 7', 'düzgün yayılı düşey hareketli yük hesap değerleri');

export interface TrOccupancy extends OccupancyEntry {
  use: MassUse;
}

const e = (key: string, category: OccupancyCategory, q: number, use: MassUse, reducible = false): TrOccupancy => ({
  key, labelKey: `loads.tr.occ.${key}`, category, uniformKNm2: q, concentratedKN: null, refs: [T7], use,
  ...(reducible ? {} : { noReduction: true }),
});

export const TS498_OCCUPANCIES: readonly TrOccupancy[] = Object.freeze([
  e('tr_attic_rooms', 'residential', 1.5, 'residential', true),
  e('tr_roof_occasional', 'roof', 2.0, 'residential'),
  e('tr_residential', 'residential', 2.0, 'residential', true),
  e('tr_office', 'office', 2.0, 'residential', true),
  e('tr_shop_small', 'commercial', 2.0, 'residential', true),
  e('tr_hospital_rooms', 'health', 2.0, 'residential'),
  e('tr_roof_terrace_garden', 'roof', 3.5, 'residential'),
  e('tr_hospital_kitchen_exam', 'health', 3.5, 'residential'),
  e('tr_classroom', 'education', 3.5, 'assembly'),
  e('tr_dormitory', 'residential', 3.5, 'assembly'),
  e('tr_amphitheatre', 'education', 3.5, 'assembly'),
  e('tr_stairs_residential', 'circulation', 3.5, 'residential'),
  e('tr_mosque', 'assembly', 5.0, 'assembly'),
  e('tr_theatre_cinema', 'assembly', 5.0, 'assembly'),
  e('tr_sport_dance_exhibition', 'assembly', 5.0, 'assembly'),
  e('tr_stand_fixed', 'assembly', 5.0, 'assembly'),
  e('tr_meeting_waiting', 'assembly', 5.0, 'assembly'),
  e('tr_store', 'commercial', 5.0, 'assembly', true),
  e('tr_restaurant', 'commercial', 5.0, 'assembly'),
  e('tr_library', 'education', 5.0, 'assembly'),
  e('tr_archive', 'storage', 5.0, 'storage'),
  e('tr_workshop_light', 'industrial', 5.0, 'residential', true),
  e('tr_kitchen_canteen', 'commercial', 5.0, 'assembly'),
  e('tr_slaughterhouse', 'industrial', 5.0, 'residential'),
  e('tr_bakery', 'industrial', 5.0, 'residential'),
  e('tr_barn', 'other', 5.0, 'residential'),
  e('tr_balcony_10', 'residential', 5.0, 'residential'),
  e('tr_corridor_public', 'circulation', 5.0, 'assembly'),
  e('tr_stairs_public', 'circulation', 5.0, 'assembly'),
  e('tr_stand_unfixed', 'assembly', 7.5, 'assembly'),
  e('tr_garage_2_5t', 'parking', 5.0, 'residential'),
]);

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
