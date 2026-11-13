import type { RoofLiveInputs, RoofLiveResult } from '../cirsoc101/roof-live';
import { msg, round } from '../message';
import { EN1991_1_1, UK_NA_1991_1_1, type EcFamily } from './refs';

/**
 * Category H, a roof not accessible except for maintenance. EN 1991-1-1 Table 6.10 recommends
 * qk = 0.4 kN/m²; the UK NA Table NA.7 gives 0.6 kN/m² below 30°, falling linearly to nil at 60°.
 */
export const ecRoofLive = (f: EcFamily) => (i: RoofLiveInputs): RoofLiveResult => {
  if (f === 'eurocode') return { lr: 0.4, r1: 1, r2: 1, refs: [EN1991_1_1('Table 6.10', 'category H')], reason: msg('loads.ec.roofLive', { qk: 0.4 }) };
  const deg = (Math.atan(Math.max(0, i.slopePercent) / 100) * 180) / Math.PI;
  const lr = deg < 30 ? 0.6 : deg < 60 ? (0.6 * (60 - deg)) / 30 : 0;
  return { lr, r1: 1, r2: 1, refs: [UK_NA_1991_1_1('Table NA.7', 'category H')], reason: msg('loads.uk.roofLive', { deg: round(deg, 1), qk: round(lr, 3) }) };
};
