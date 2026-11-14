import type { ElementKind, OccupancyEntry } from '../cirsoc101/live-loads';
import { K_LL } from '../cirsoc101/live-loads';
import { msg, round, type EngineMessage } from '../message';
import type { ClauseRef } from '../regulation';
import { A7, PSF } from './refs';
import { loadsProfile } from '../../code-profiles/registry';
import { occupancyRows } from '../../code-profiles/adapters/occupancies';

const T43 = A7('Table 4.3-1', 'minimum live loads');
const T47 = A7('Table 4.7-1', 'live load element factor KLL');

const ROWS = occupancyRows(loadsProfile('asce7-22'));

export const STORAGE_OCCUPANCIES: ReadonlySet<string> = new Set(ROWS.filter((r) => r.row.tags?.storage === true).map((r) => r.row.key));

export const OCCUPANCY_TABLE_ASCE7_22: readonly OccupancyEntry[] = Object.freeze(ROWS.map((r) => r.entry));

export const findAsce7Occupancy = (key: string) => OCCUPANCY_TABLE_ASCE7_22.find((o) => o.key === key);

export const HEAVY_LIMIT_KNM2 = 100 * PSF;
const THRESHOLD_M2 = 400 * 0.3048 * 0.3048;

export interface Asce7ReductionInputs {
  loKNm2: number; tributaryAreaM2: number; elementKind: ElementKind; floorsSupported: number;
  passengerGarage: boolean; publicAssembly: boolean; noReduction: boolean;
}

export function reduceAsce7(i: Asce7ReductionInputs): { lKNm2: number; refs: ClauseRef[]; reason: EngineMessage } {
  const lo = i.loKNm2, multi = i.floorsSupported >= 2;
  const none = (key: string, refs: ClauseRef[], params?: Record<string, number>) => ({ lKNm2: lo, refs, reason: msg(key, params) });
  if (i.noReduction) return none('loads.asce7.reduction.notPermitted', [T43]);
  if (i.publicAssembly && lo <= HEAVY_LIMIT_KNM2 + 1e-9) return none('loads.asce7.reduction.assembly', [A7('4.7.5', 'assembly uses')]);
  if (i.passengerGarage) {
    const ref = A7('4.7.4', 'passenger vehicle garages');
    return multi ? { lKNm2: 0.8 * lo, refs: [ref], reason: msg('loads.asce7.reduction.garageMulti') } : none('loads.asce7.reduction.garage', [ref]);
  }
  if (lo > HEAVY_LIMIT_KNM2 + 1e-9) {
    const ref = A7('4.7.3', 'heavy live loads');
    const params = { lo: round(lo, 2), limit: round(HEAVY_LIMIT_KNM2, 2) };
    return multi ? { lKNm2: 0.8 * lo, refs: [ref], reason: msg('loads.asce7.reduction.heavyMulti', params) } : none('loads.asce7.reduction.heavy', [ref], params);
  }
  const kll = K_LL[i.elementKind], kllAt = kll * i.tributaryAreaM2;
  const refs = [A7('4.7.2', 'reduction in uniform live loads'), T47];
  if (!(kllAt >= THRESHOLD_M2)) return none('loads.asce7.reduction.below', refs, { kll, at: round(i.tributaryAreaM2, 1), kllAt: round(kllAt, 1), threshold: round(THRESHOLD_M2, 2) });
  const raw = lo * (0.25 + 4.57 / Math.sqrt(kllAt));
  const floor = (multi ? 0.4 : 0.5) * lo;
  const l = Math.min(lo, Math.max(raw, floor));
  return {
    lKNm2: l, refs,
    reason: msg(raw < floor ? 'loads.asce7.reduction.appliedFloor' : 'loads.asce7.reduction.applied', {
      kll, at: round(i.tributaryAreaM2, 1), kllAt: round(kllAt, 1), lo: round(lo, 3), l: round(l, 3), floorFactor: multi ? 0.4 : 0.5,
    }),
  };
}
