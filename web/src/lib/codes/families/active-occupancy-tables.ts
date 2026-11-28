import { OCCUPANCY_TABLE_2025, type OccupancyEntry } from '../cirsoc101/live-loads';
import { occupancyTable } from '../eurocode/imposed';
import { asce7Occupancies } from '../asce7/live-loads';
import { ts498Occupancies } from '../turkey/ts498-loads';

const tables = new Map<string, readonly OccupancyEntry[]>([['cirsoc101-2025-loads', OCCUPANCY_TABLE_2025]]);
tables.set('en1991-1-1', occupancyTable('eurocode'));
tables.set('en1991-1-1-uk', occupancyTable('uk'));
tables.set('asce7-22-loads', asce7Occupancies());
tables.set('ts498-1997-loads', ts498Occupancies());

export function occupancyTableFor(loadsAdapterId: string | null | undefined): readonly OccupancyEntry[] {
  return (loadsAdapterId && tables.get(loadsAdapterId)) || OCCUPANCY_TABLE_2025;
}

export function findAnyOccupancy(key: string | null | undefined): OccupancyEntry | undefined {
  if (!key) return undefined;
  for (const table of tables.values()) {
    const row = table.find(entry => entry.key === key);
    if (row) return row;
  }
  return undefined;
}
