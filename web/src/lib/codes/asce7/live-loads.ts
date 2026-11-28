import { deferred } from '../../code-profiles/deferred';
import type { ElementKind, OccupancyEntry } from '../cirsoc101/live-loads';
import { K_LL } from '../cirsoc101/live-loads';
import { msg, round, type EngineMessage } from '../message';
import type { ClauseRef } from '../regulation';
import { A7, PSF } from './refs';
import { loadsProfile } from '../../code-profiles/registry';
import { occupancyRows } from '../../code-profiles/adapters/occupancies';

const T43 = A7('Table 4.3-1', 'minimum live loads');
const T47 = A7('Table 4.7-1', 'live load element factor KLL');

const table = deferred(() => {
  const rows = occupancyRows(loadsProfile('asce7-22'));
  return {
    entries: Object.freeze(rows.map(r => r.entry)),
    storage: new Set(rows.filter(r => r.row.tags?.storage === true).map(r => r.row.key)),
  };
});

export const asce7Occupancies = (): readonly OccupancyEntry[] => table().entries;
export const storageOccupancies = (): ReadonlySet<string> => table().storage;

export const findAsce7Occupancy = (key: string) => asce7Occupancies().find((o) => o.key === key);

export const HEAVY_LIMIT_KNM2 = 100 * PSF;
const THRESHOLD_M2 = 400 * 0.3048 * 0.3048;

export interface Asce7ReductionInputs {
  loKNm2: number; tributaryAreaM2: number; elementKind: ElementKind; floorsSupported: number;
  passengerGarage: boolean; publicAssembly: boolean; noReduction: boolean;
}

export function reduceAsce7(i: Asce7ReductionInputs): { lKNm2: number; refs: ClauseRef[]; reason: EngineMessage } {
  const lo = i.loKNm2, multi = i.floorsSupported >= 2;
  const none = (key: string, refs: ClauseRef[], params?: Record<string, number>) => ({ lKNm2: lo, refs, reason: msg(key, params) });
  const kll = K_LL[i.elementKind], kllAt = kll * i.tributaryAreaM2;
  /** §4.7.2: L, and whether the area reaches its threshold. */
  const general = () => {
    if (!(kllAt >= THRESHOLD_M2)) return { l: lo, reaches: false, raw: lo, floor: lo };
    const raw = lo * (0.25 + 4.57 / Math.sqrt(kllAt)), floor = (multi ? 0.4 : 0.5) * lo;
    return { l: Math.min(lo, Math.max(raw, floor)), reaches: true, raw, floor };
  };
  /** §4.7.3 and §4.7.4, exception 1: by 20 % at most, and never below L of §4.7.2. */
  const byTwenty = (ref: ClauseRef, key: string, params: Record<string, number> = {}) => {
    const l = Math.max(0.8 * lo, general().l);
    return { lKNm2: l, refs: [ref, A7('4.7.2', 'reduction in uniform live loads')], reason: msg(key, { ...params, l: round(l, 3) }) };
  };
  if (i.noReduction) return none('loads.asce7.reduction.notPermitted', [T43]);
  if (i.publicAssembly) return none('loads.asce7.reduction.assembly', [A7('4.7.5', 'assembly uses')]);
  if (i.passengerGarage) {
    const ref = A7('4.7.4', 'passenger vehicle garages');
    return multi ? byTwenty(ref, 'loads.asce7.reduction.garageMulti') : none('loads.asce7.reduction.garage', [ref]);
  }
  if (lo > HEAVY_LIMIT_KNM2 + 1e-9) {
    const ref = A7('4.7.3', 'heavy live loads');
    const params = { lo: round(lo, 2), limit: round(HEAVY_LIMIT_KNM2, 2) };
    return multi ? byTwenty(ref, 'loads.asce7.reduction.heavyMulti', params) : none('loads.asce7.reduction.heavy', [ref], params);
  }
  const refs = [A7('4.7.2', 'reduction in uniform live loads'), T47];
  const g = general();
  if (!g.reaches) return none('loads.asce7.reduction.below', refs, { kll, at: round(i.tributaryAreaM2, 1), kllAt: round(kllAt, 1), threshold: round(THRESHOLD_M2, 2) });
  return {
    lKNm2: g.l, refs,
    reason: msg(g.raw < g.floor ? 'loads.asce7.reduction.appliedFloor' : 'loads.asce7.reduction.applied', {
      kll, at: round(i.tributaryAreaM2, 1), kllAt: round(kllAt, 1), lo: round(lo, 3), l: round(g.l, 3), floorFactor: multi ? 0.4 : 0.5,
    }),
  };
}
