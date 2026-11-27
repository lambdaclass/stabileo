import { COLUMN_TIE_DIAMETERS, columnTieBarFactor, columnTieSpacing } from '../../../codes/cirsoc201/transverse-spacing';

const edition = '2025';

export const columnTies2025 = {
  edition,
  barFactor: columnTieBarFactor(edition),
  tieFactor: COLUMN_TIE_DIAMETERS,
  spacing(longDiameterMm: number, tieDiameterMm: number, leastDimension: number) {
    return columnTieSpacing(edition, longDiameterMm, tieDiameterMm, leastDimension);
  },
} as const;
