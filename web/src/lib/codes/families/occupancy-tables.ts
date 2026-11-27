/**
 * Every family's table of occupancies, by the loads adapter that binds it, and a key looked up in
 * any of them. Light on purpose: the model's use zones and the panels that list a table read it
 * without the load generator behind the families' modules.
 *
 *   CIRSOC 101-2025 Tabla 4.1 · EN 1991-1-1 Table 6.2 · BS EN 1991-1-1 + UK NA Table NA.3 ·
 *   ASCE/SEI 7-22 Table 4.3-1 · TS 498 Çizelge 7
 */
import { unifiedPlates } from '../../features';
import { OCCUPANCY_TABLE_2025, type OccupancyEntry } from '../cirsoc101/live-loads';
import { occupancyTable } from '../eurocode/imposed';
import { asce7Occupancies } from '../asce7/live-loads';
import { ts498Occupancies } from '../turkey/ts498-loads';

const tables = new Map<string, readonly OccupancyEntry[]>([['cirsoc101-2025-loads', OCCUPANCY_TABLE_2025]]);
if (unifiedPlates()) {
  tables.set('en1991-1-1', occupancyTable('eurocode'));
  tables.set('en1991-1-1-uk', occupancyTable('uk'));
  tables.set('asce7-22-loads', asce7Occupancies());
  tables.set('ts498-1997-loads', ts498Occupancies());
}

/** The table of the loads code bound; CIRSOC 101's with none or with one this does not know. */
export function occupancyTableFor(loadsAdapterId: string | null | undefined): readonly OccupancyEntry[] {
  return (loadsAdapterId && tables.get(loadsAdapterId)) || OCCUPANCY_TABLE_2025;
}

/** A row by its key, in whichever family's table holds it: the keys of the tables do not overlap. */
export function findAnyOccupancy(key: string | null | undefined): OccupancyEntry | undefined {
  if (!key) return undefined;
  for (const table of tables.values()) {
    const row = table.find(entry => entry.key === key);
    if (row) return row;
  }
  return undefined;
}
