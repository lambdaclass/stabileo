/**
 * Every family's table of occupancies, by the loads adapter that binds it, and a key looked up in
 * any of them. Light on purpose: the model's use zones and the panels that list a table read it
 * without the load generator behind the families' modules.
 *
 *   CIRSOC 101-2025 Tabla 4.1 · EN 1991-1-1 Table 6.2 · BS EN 1991-1-1 + UK NA Table NA.3 ·
 *   ASCE/SEI 7-22 Table 4.3-1 · TS 498 Çizelge 7
 */
import { OCCUPANCY_TABLE_2025, type OccupancyEntry } from '../cirsoc101/live-loads';
import { occupancyTable } from '../eurocode/imposed';
import { OCCUPANCY_TABLE_ASCE7_22 } from '../asce7/live-loads';
import { TS498_OCCUPANCIES } from '../turkey/ts498-loads';

const TABLES: Readonly<Record<string, readonly OccupancyEntry[]>> = {
  'cirsoc101-2025-loads': OCCUPANCY_TABLE_2025,
  'en1991-1-1': occupancyTable('eurocode'),
  'en1991-1-1-uk': occupancyTable('uk'),
  'asce7-22-loads': OCCUPANCY_TABLE_ASCE7_22,
  'ts498-1997-loads': TS498_OCCUPANCIES,
};

/** The table of the loads code bound; CIRSOC 101's with none or with one this does not know. */
export function occupancyTableFor(loadsAdapterId: string | null | undefined): readonly OccupancyEntry[] {
  return (loadsAdapterId && TABLES[loadsAdapterId]) || OCCUPANCY_TABLE_2025;
}

/** A row by its key, in whichever family's table holds it: the keys of the tables do not overlap. */
export function findAnyOccupancy(key: string | null | undefined): OccupancyEntry | undefined {
  if (!key) return undefined;
  for (const t of Object.values(TABLES)) { const r = t.find((o) => o.key === key); if (r) return r; }
  return undefined;
}
