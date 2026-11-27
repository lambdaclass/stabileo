import type { RegulationEdition } from '../../../codes/regulation';
import { columnTieBarFactor, columnTieSpacing, COLUMN_TIE_DIAMETERS } from '../../../codes/cirsoc201/transverse-spacing';

export function cirsoc201ColumnTies(edition: RegulationEdition) {
  return {
    longitudinalBarDiameters: columnTieBarFactor(edition),
    tieDiameters: COLUMN_TIE_DIAMETERS,
    maxSpacing(longDiameterMm: number, tieDiameterMm: number, leastDimensionM: number) {
      return columnTieSpacing(edition, longDiameterMm, tieDiameterMm, leastDimensionM).spacing;
    },
  };
}
