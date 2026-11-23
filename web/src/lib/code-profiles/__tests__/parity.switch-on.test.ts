import { describe, expect, it } from 'vitest';
import { EC2_RECOMMENDED, EC2_UK } from '../../engine/design/eurocode/ec2-params';
import { EC2_SET, UK_SET } from '../../rc-sheets/ec2/basis';
import { EC_CATEGORY, GAMMA, PSI, XI } from '../../codes/eurocode/basis';
import { categoryOfOccupancy, occupancyTable } from '../../codes/eurocode/imposed';
import { OCCUPANCY_TABLE_2025 } from '../../codes/cirsoc101/live-loads';
import { OCCUPANCY_TABLE_ASCE7_22, STORAGE_OCCUPANCIES } from '../../codes/asce7/live-loads';
import { TS498_OCCUPANCIES } from '../../codes/turkey/ts498-loads';
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
    expect(PSI).toStrictEqual(OLD_PSI);
    expect(GAMMA.eurocode).toStrictEqual({ ...OLD_GAMMA });
    expect(GAMMA.uk).toStrictEqual({ ...OLD_GAMMA });
    expect(XI).toStrictEqual(OLD_XI);
    expect(EC_CATEGORY).toStrictEqual(OLD_EC_CATEGORY);
    expect(Object.isFrozen(EC_CATEGORY)).toBe(true);
  });

  it('the occupancy tables of the five families, row by row and reference by reference', () => {
    expect(occupancyTable('eurocode')).toStrictEqual(EC_TABLES.eurocode);
    expect(occupancyTable('uk')).toStrictEqual(EC_TABLES.uk);
    for (const [key, cat] of EC_CATEGORY_OF) expect(categoryOfOccupancy(key)).toBe(cat);
    expect(OCCUPANCY_TABLE_2025).toStrictEqual(OLD_CIRSOC);
    expect(OCCUPANCY_TABLE_ASCE7_22).toStrictEqual(OLD_ASCE);
    expect([...STORAGE_OCCUPANCIES]).toStrictEqual([...OLD_STORAGE]);
    expect(TS498_OCCUPANCIES).toStrictEqual(OLD_TS498);
    for (const t of [occupancyTable('eurocode'), occupancyTable('uk'), OCCUPANCY_TABLE_2025, OCCUPANCY_TABLE_ASCE7_22, TS498_OCCUPANCIES]) {
      expect(Object.isFrozen(t)).toBe(true);
    }
  });

  it('the imperial conversions the ASCE 7 family reads', () => {
    expect([FT, LBF_KN, PSF, MPH]).toStrictEqual([0.3048, 4.4482216152605e-3, 4.4482216152605e-3 / (0.3048 * 0.3048), 0.44704]);
  });
});
