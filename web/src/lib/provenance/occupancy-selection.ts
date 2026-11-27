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
