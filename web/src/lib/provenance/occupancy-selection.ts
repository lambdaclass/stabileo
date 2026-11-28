const floorRows = new Set(['loads.occupancy.archivos', 'loads.asce7.occ.accessOffice', 'loads.tr.occ.tr_attic_rooms', 'loads.ec.occ.A_floor', 'loads.ec.occ.uk_A1']);
const roofRows = new Set(['loads.occupancy.azotea_publica', 'loads.asce7.occ.roofAssembly', 'loads.tr.occ.tr_roof_occasional', 'loads.ec.occ.A_floor', 'loads.ec.occ.uk_A1']);

export interface OccupancyBasis {
  occupancySelection?: 'preserved' | 'review';
  derivation?: Array<{ key?: string; params?: Readonly<Record<string, unknown>> }>;
}

export function needsOccupancyReview(basis?: OccupancyBasis): boolean {
  if (basis?.occupancySelection === 'preserved') return false;
  if (basis?.occupancySelection === 'review') return true;
  return Array.isArray(basis?.derivation) && basis.derivation.some(note => {
    const occupancy = note?.params?.occupancy;
    if (!occupancy || typeof occupancy !== 'object' || !('key' in occupancy) || typeof occupancy.key !== 'string') return false;
    switch (note.key) {
      case 'loadPlan.derivation.occupancy':
      case 'loadPlan.derivation.occupancyCode': return floorRows.has(occupancy.key);
      case 'loadPlan.derivation.roofOccupancy':
      case 'loadPlan.derivation.roofOccupancyCode': return roofRows.has(occupancy.key);
      default: return false;
    }
  });
}

const firstManualRow: Readonly<Record<string, string>> = {
  'cirsoc101-2025-loads': 'archivos', 'en1991-1-1': 'ec-A-floor', 'en1991-1-1-uk': 'uk-A1',
  'asce7-22-loads': 'accessOffice', 'ts498-1997-loads': 'tr_attic_rooms',
};

export interface ArchivedReduction {
  ratio: number;
  occupancyKey?: string;
  occupancyReviewed?: boolean;
  floorsSupported?: number;
  elementKind?: string;
}

export function needsManualOccupancyReview(adapter: string | null, type: string | undefined, reduction?: ArchivedReduction): boolean {
  if (type?.toUpperCase() !== 'L' || !reduction?.occupancyKey || reduction.occupancyReviewed) return false;
  if (reduction.occupancyKey === firstManualRow[adapter ?? 'cirsoc101-2025-loads']) return true;
  return adapter === 'ts498-1997-loads' && ['tr_office', 'tr_residential'].includes(reduction.occupancyKey)
    && (reduction.floorsSupported ?? 0) > 3 && reduction.ratio > 0 && reduction.ratio < 1
    && ['interiorColumn', 'exteriorColumnNoCantilever', 'edgeColumnWithCantilever', 'cornerColumnWithCantilever'].includes(reduction.elementKind ?? '');
}
