import { findOccupancy, OCCUPANCY_TABLE_2025, type OccupancyEntry } from '../cirsoc101/live-loads';

export function occupancyTableFor(_loadsAdapterId: string | null | undefined): readonly OccupancyEntry[] {
  return OCCUPANCY_TABLE_2025;
}

export function findAnyOccupancy(key: string | null | undefined): OccupancyEntry | undefined {
  return key ? findOccupancy(key) : undefined;
}
