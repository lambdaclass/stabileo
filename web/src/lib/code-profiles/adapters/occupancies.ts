import type { OccupancyEntry } from '../../codes/cirsoc101/live-loads';
import { clauseOf } from '../cite';
import type { LoadsProfile, Occupancy } from '../types';

/** Each row of the profile's occupancy table as the load generator reads it, in SI, with the row in the profile beside it. */
export function occupancyRows(p: LoadsProfile): Array<{ row: Occupancy; entry: OccupancyEntry }> {
  const t = p.imposed.occupancies;
  const shared = t.cite.map((c) => clauseOf(p.meta, c));
  return t.rows.map((row) => ({
    row,
    entry: {
      key: row.key, labelKey: `${t.labelPrefix}${row.label ?? row.key}`, category: row.kind,
      uniformKNm2: row.q, concentratedKN: row.Q ?? null,
      ...(row.assembly ? { assemblyKind: row.assembly, garageOrPublicAssembly: true } : {}),
      ...(row.noReduction ? { noReduction: true } : {}),
      ...(row.see ? { seeArticle: row.see } : {}),
      refs: [...shared, ...(row.cite ? [clauseOf(p.meta, row.cite)] : [])],
    },
  }));
}

export const occupancyEntries = (p: LoadsProfile): OccupancyEntry[] => occupancyRows(p).map((r) => r.entry);
