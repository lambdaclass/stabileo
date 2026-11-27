import type { RoofConfig } from './auto-loads-sections';
import { roofLiveLoad, roofWeightClass as weightOf } from '../../lib/codes/cirsoc101/roof-live';
import type { ImposedLoadCode } from '../../lib/codes/families/load-codes';

export function roofLrRange(c: RoofConfig, floorDead: number, modelSlopeDeg: number, autoWeight?: 'heavy' | 'light', code?: ImposedLoadCode): { lo: number; hi: number } {
  const lrOf = (__PUBLIC_FEATURES__.proPlatesUnified ? code?.roofLive : undefined) ?? roofLiveLoad;
  const weight = c.weight ?? autoWeight ?? weightOf(c.dead ?? floorDead);
  const pct = Math.tan(((c.slopeDeg ?? modelSlopeDeg) * Math.PI) / 180) * 100;
  return { lo: lrOf({ weight, atM2: 80, slopePercent: pct }).lr, hi: lrOf({ weight, atM2: 10, slopePercent: pct }).lr };
}
