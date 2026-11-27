import { describe, expect, it } from 'vitest';
import { EC2_RECOMMENDED, EC2_UK } from '../../engine/design/eurocode/ec2-params';
import { EC2_SET, UK_SET } from '../../rc-sheets/ec2/basis';
import { actionCategories, gammaFactors, psiFactors, xiFactor } from '../../codes/eurocode/basis';
import { categoryOfOccupancy, occupancyTable } from '../../codes/eurocode/imposed';
import { OCCUPANCY_TABLE_2025 } from '../../codes/cirsoc101/live-loads';
import { asce7Occupancies, storageOccupancies } from '../../codes/asce7/live-loads';
import { ts498Occupancies } from '../../codes/turkey/ts498-loads';
import { FT, LBF_KN, MPH, PSF } from '../../codes/asce7/refs';
import {
  EC2_SET_EXTRAS, EC_CATEGORY_OF, EC_TABLES, OLD_ASCE, OLD_CIRSOC, OLD_EC2_RECOMMENDED, OLD_EC2_UK, OLD_EC_CATEGORY,
  OLD_GAMMA, OLD_PSI, OLD_STORAGE, OLD_TS498, OLD_XI, UK_SET_EXTRAS,
} from './legacy-values';

describe('every value moved to a code profile is the one the code carried', () => {
  it('EN 1992-1-1 and its UK annex: the parameters the reinforcement sheets and the EC2 design read', () => {
    expect(EC2_RECOMMENDED).toStrictEqual(OLD_EC2_RECOMMENDED);
    expect(EC2_UK).toStrictEqual(OLD_EC2_UK);
    expect(EC2_SET).toStrictEqual({ p: OLD_EC2_RECOMMENDED, uk: false, ...EC2_SET_EXTRAS });
    expect(UK_SET).toStrictEqual({ p: OLD_EC2_UK, uk: true, ...UK_SET_EXTRAS });
  });

  it('EN 1990 and its UK annex: ψ by action, γ, ξ and the action of each symbol', () => {
    expect(psiFactors()).toStrictEqual(OLD_PSI);
    expect(gammaFactors('eurocode')).toStrictEqual({ ...OLD_GAMMA });
    expect(gammaFactors('uk')).toStrictEqual({ ...OLD_GAMMA });
    expect({ eurocode: xiFactor('eurocode'), uk: xiFactor('uk') }).toStrictEqual(OLD_XI);
    expect(actionCategories()).toStrictEqual(OLD_EC_CATEGORY);
    expect(Object.isFrozen(actionCategories())).toBe(true);
  });

  it('the occupancy tables of the five families, row by row and reference by reference', () => {
    expect(occupancyTable('eurocode')).toStrictEqual(EC_TABLES.eurocode);
    expect(occupancyTable('uk')).toStrictEqual(EC_TABLES.uk);
    for (const [key, cat] of EC_CATEGORY_OF) expect(categoryOfOccupancy(key)).toBe(cat);
    expect(OCCUPANCY_TABLE_2025).toStrictEqual(OLD_CIRSOC);
    expect(asce7Occupancies()).toStrictEqual(OLD_ASCE);
    expect([...storageOccupancies()]).toStrictEqual([...OLD_STORAGE]);
    expect(ts498Occupancies()).toStrictEqual(OLD_TS498);
    for (const t of [occupancyTable('eurocode'), occupancyTable('uk'), OCCUPANCY_TABLE_2025, asce7Occupancies(), ts498Occupancies()]) {
      expect(Object.isFrozen(t)).toBe(true);
    }
  });

  it('the imperial conversions the ASCE 7 family reads', () => {
    expect([FT, LBF_KN, PSF, MPH]).toStrictEqual([0.3048, 4.4482216152605e-3, 4.4482216152605e-3 / (0.3048 * 0.3048), 0.44704]);
  });
});
