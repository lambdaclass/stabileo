import type { AssemblyKind, ElementKind, OccupancyCategory, OccupancyEntry } from '../cirsoc101/live-loads';
import { K_LL } from '../cirsoc101/live-loads';
import { msg, round, type EngineMessage } from '../message';
import type { ClauseRef } from '../regulation';
import { A7, LBF_KN, PSF } from './refs';

const T43 = A7('Table 4.3-1', 'minimum live loads');
const T47 = A7('Table 4.7-1', 'live load element factor KLL');

interface Row { key: string; category: OccupancyCategory; psf: number | null; lb?: number; kind?: AssemblyKind; noReduction?: boolean; see?: string; storage?: boolean }

const ASSEMBLY: AssemblyKind = 'publicAssembly';

const ROWS: readonly Row[] = [
  { key: 'accessOffice', category: 'office', psf: 50, lb: 2000 },
  { key: 'accessComputer', category: 'office', psf: 100, lb: 2000 },
  { key: 'armories', category: 'assembly', psf: 150, kind: ASSEMBLY },
  { key: 'assemblyFixedSeats', category: 'assembly', psf: 60, kind: ASSEMBLY },
  { key: 'assemblyLobbies', category: 'assembly', psf: 100, kind: ASSEMBLY },
  { key: 'assemblyMovableSeats', category: 'assembly', psf: 100, kind: ASSEMBLY },
  { key: 'assemblyPlatforms', category: 'assembly', psf: 100, kind: ASSEMBLY },
  { key: 'assemblyStage', category: 'assembly', psf: 150, kind: ASSEMBLY },
  { key: 'assemblyOther', category: 'assembly', psf: 100, kind: ASSEMBLY },
  { key: 'catwalks', category: 'other', psf: 40, lb: 300 },
  { key: 'corridorsFirstFloor', category: 'circulation', psf: 100 },
  { key: 'diningRooms', category: 'assembly', psf: 100, kind: ASSEMBLY },
  { key: 'fireEscapes', category: 'circulation', psf: 100 },
  { key: 'fireEscapesDwellings', category: 'circulation', psf: 40 },
  { key: 'garagePassenger', category: 'parking', psf: 40, kind: 'passengerGarage', see: '4.10.1' },
  { key: 'garageTrucks', category: 'parking', psf: null, kind: 'truckGarage', see: '4.10.2' },
  { key: 'hospitalOperating', category: 'health', psf: 60, lb: 1000 },
  { key: 'hospitalPatient', category: 'health', psf: 40, lb: 1000 },
  { key: 'hospitalCorridors', category: 'circulation', psf: 80, lb: 1000 },
  { key: 'libraryReading', category: 'education', psf: 60, lb: 1000 },
  { key: 'libraryStacks', category: 'storage', psf: 150, lb: 1000, storage: true },
  { key: 'libraryCorridors', category: 'circulation', psf: 80, lb: 1000 },
  { key: 'manufacturingLight', category: 'industrial', psf: 125, lb: 2000 },
  { key: 'manufacturingHeavy', category: 'industrial', psf: 250, lb: 3000 },
  { key: 'officeLobbies', category: 'circulation', psf: 100, lb: 2000 },
  { key: 'offices', category: 'office', psf: 50, lb: 2000 },
  { key: 'officeCorridors', category: 'circulation', psf: 80, lb: 2000 },
  { key: 'penalCells', category: 'residential', psf: 40 },
  { key: 'penalCorridors', category: 'circulation', psf: 100 },
  { key: 'bowling', category: 'assembly', psf: 75, kind: ASSEMBLY },
  { key: 'danceHalls', category: 'assembly', psf: 100, kind: ASSEMBLY },
  { key: 'gymnasiums', category: 'assembly', psf: 100, kind: ASSEMBLY },
  { key: 'grandstands', category: 'assembly', psf: 100, kind: ASSEMBLY },
  { key: 'stadiumsFixedSeats', category: 'assembly', psf: 60, kind: ASSEMBLY },
  { key: 'atticNoStorage', category: 'residential', psf: 10 },
  { key: 'atticStorage', category: 'storage', psf: 20, storage: true },
  { key: 'habitableAttics', category: 'residential', psf: 30 },
  { key: 'dwellingOther', category: 'residential', psf: 40 },
  { key: 'residentialPrivate', category: 'residential', psf: 40 },
  { key: 'residentialPublic', category: 'assembly', psf: 100, kind: ASSEMBLY },
  { key: 'roofOrdinary', category: 'roof', psf: 20, see: '4.8', noReduction: true },
  { key: 'roofAssembly', category: 'roof', psf: 100, kind: ASSEMBLY },
  { key: 'awningsFabric', category: 'roof', psf: 5, noReduction: true },
  { key: 'schoolClassrooms', category: 'education', psf: 40, lb: 1000 },
  { key: 'schoolCorridorsUpper', category: 'circulation', psf: 80, lb: 1000 },
  { key: 'schoolCorridorsFirst', category: 'circulation', psf: 100, lb: 1000 },
  { key: 'sidewalksTrucking', category: 'parking', psf: 250, lb: 8000 },
  { key: 'stairs', category: 'circulation', psf: 100, lb: 300 },
  { key: 'stairsDwellings', category: 'circulation', psf: 40, lb: 300 },
  { key: 'storageAboveCeilings', category: 'storage', psf: 20, storage: true },
  { key: 'warehouseLight', category: 'storage', psf: 125, storage: true },
  { key: 'warehouseHeavy', category: 'storage', psf: 250, storage: true },
  { key: 'retailFirst', category: 'commercial', psf: 100, lb: 1000 },
  { key: 'retailUpper', category: 'commercial', psf: 75, lb: 1000 },
  { key: 'wholesale', category: 'commercial', psf: 125, lb: 1000 },
  { key: 'walkways', category: 'circulation', psf: 60 },
  { key: 'yardsTerraces', category: 'assembly', psf: 100, kind: ASSEMBLY },
];

export const STORAGE_OCCUPANCIES: ReadonlySet<string> = new Set(ROWS.filter((r) => r.storage).map((r) => r.key));

export const OCCUPANCY_TABLE_ASCE7_22: readonly OccupancyEntry[] = Object.freeze(ROWS.map((r): OccupancyEntry => ({
  key: r.key, labelKey: `loads.asce7.occ.${r.key}`, category: r.category,
  uniformKNm2: r.psf === null ? null : r.psf * PSF,
  concentratedKN: r.lb === undefined ? null : r.lb * LBF_KN,
  ...(r.kind ? { assemblyKind: r.kind, garageOrPublicAssembly: true } : {}),
  ...(r.noReduction ? { noReduction: true } : {}),
  ...(r.see ? { seeArticle: r.see } : {}),
  refs: [T43],
})));

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
