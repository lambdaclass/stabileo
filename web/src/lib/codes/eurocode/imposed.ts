import type { ElementKind, OccupancyCategory, OccupancyEntry } from '../cirsoc101/live-loads';
import type { ClauseRef } from '../regulation';
import { msg, round, type EngineMessage } from '../message';
import { EN1991_1_1, UK_NA_1991_1_1, type EcFamily } from './refs';
import type { ImposedCategory } from './context';

interface Row { key: string; cat: ImposedCategory; sub: string; kind: OccupancyCategory; qk: number; Qk: number }

const EN_ROWS: readonly Row[] = [
  { key: 'ec-A-floor', cat: 'A', sub: 'A_floor', kind: 'residential', qk: 2.0, Qk: 2.0 },
  { key: 'ec-A-stairs', cat: 'A', sub: 'A_stairs', kind: 'circulation', qk: 2.0, Qk: 2.0 },
  { key: 'ec-A-balcony', cat: 'A', sub: 'A_balcony', kind: 'residential', qk: 2.5, Qk: 2.0 },
  { key: 'ec-B', cat: 'B', sub: 'B', kind: 'office', qk: 3.0, Qk: 4.5 },
  { key: 'ec-C1', cat: 'C', sub: 'C1', kind: 'assembly', qk: 3.0, Qk: 4.0 },
  { key: 'ec-C2', cat: 'C', sub: 'C2', kind: 'assembly', qk: 4.0, Qk: 4.0 },
  { key: 'ec-C3', cat: 'C', sub: 'C3', kind: 'assembly', qk: 5.0, Qk: 4.0 },
  { key: 'ec-C4', cat: 'C', sub: 'C4', kind: 'assembly', qk: 5.0, Qk: 7.0 },
  { key: 'ec-C5', cat: 'C', sub: 'C5', kind: 'assembly', qk: 5.0, Qk: 4.5 },
  { key: 'ec-D1', cat: 'D', sub: 'D1', kind: 'commercial', qk: 5.0, Qk: 4.0 },
  { key: 'ec-D2', cat: 'D', sub: 'D2', kind: 'commercial', qk: 5.0, Qk: 7.0 },
  { key: 'ec-E1', cat: 'E', sub: 'E1', kind: 'storage', qk: 7.5, Qk: 7.0 },
  { key: 'ec-H', cat: 'H', sub: 'H', kind: 'roof', qk: 0.4, Qk: 1.0 },
];

const UK_ROWS: readonly Row[] = [
  { key: 'uk-A1', cat: 'A', sub: 'uk_A1', kind: 'residential', qk: 1.5, Qk: 2.0 },
  { key: 'uk-A3', cat: 'A', sub: 'uk_A3', kind: 'residential', qk: 2.0, Qk: 2.0 },
  { key: 'uk-A5', cat: 'A', sub: 'uk_A5', kind: 'residential', qk: 2.5, Qk: 2.0 },
  { key: 'uk-B1', cat: 'B', sub: 'uk_B1', kind: 'office', qk: 2.5, Qk: 2.7 },
  { key: 'uk-B2', cat: 'B', sub: 'uk_B2', kind: 'office', qk: 3.0, Qk: 2.7 },
  { key: 'uk-C11', cat: 'C', sub: 'uk_C11', kind: 'assembly', qk: 2.0, Qk: 3.0 },
  { key: 'uk-C13', cat: 'C', sub: 'uk_C13', kind: 'education', qk: 3.0, Qk: 3.0 },
  { key: 'uk-C21', cat: 'C', sub: 'uk_C21', kind: 'assembly', qk: 4.0, Qk: 3.6 },
  { key: 'uk-C41', cat: 'C', sub: 'uk_C41', kind: 'assembly', qk: 5.0, Qk: 3.6 },
  { key: 'uk-C51', cat: 'C', sub: 'uk_C51', kind: 'assembly', qk: 5.0, Qk: 3.6 },
  { key: 'uk-D1', cat: 'D', sub: 'uk_D1', kind: 'commercial', qk: 4.0, Qk: 3.6 },
  { key: 'uk-D2', cat: 'D', sub: 'uk_D2', kind: 'commercial', qk: 4.0, Qk: 3.6 },
  { key: 'uk-H', cat: 'H', sub: 'uk_H', kind: 'roof', qk: 0.6, Qk: 0.9 },
];

const tableRef = (family: EcFamily, cat: ImposedCategory): ClauseRef => family === 'uk'
  ? UK_NA_1991_1_1(cat === 'H' ? 'Table NA.7' : 'Table NA.3', 'imposed loads')
  : EN1991_1_1(cat === 'H' ? 'Table 6.10' : cat === 'E' ? 'Table 6.4' : 'Table 6.2', 'imposed loads');

function entry(family: EcFamily, r: Row): OccupancyEntry {
  // C and D carry `publicAssembly` only so that reduce() can tell them apart: the αA ≥ 0,6 floor.
  const cd = r.cat === 'C' || r.cat === 'D';
  return {
    key: r.key, labelKey: `loads.ec.occ.${r.sub}`, category: r.kind,
    uniformKNm2: r.qk, concentratedKN: r.Qk,
    ...(cd ? { assemblyKind: 'publicAssembly' as const } : {}),
    ...(r.cat === 'E' || r.cat === 'H' ? { noReduction: true } : {}),
    refs: [EN1991_1_1('Table 6.1', 'categories of use'), tableRef(family, r.cat)],
  };
}

const TABLES: Record<EcFamily, readonly OccupancyEntry[]> = {
  eurocode: Object.freeze(EN_ROWS.map((r) => entry('eurocode', r))),
  uk: Object.freeze(UK_ROWS.map((r) => entry('uk', r))),
};
const CATEGORY = new Map<string, ImposedCategory>([...EN_ROWS, ...UK_ROWS].map((r) => [r.key, r.cat]));

export const occupancyTable = (family: EcFamily): readonly OccupancyEntry[] => TABLES[family];
export const findEcOccupancy = (family: EcFamily, key: string) => TABLES[family].find((o) => o.key === key);
export const categoryOfOccupancy = (key: string | undefined): ImposedCategory | undefined => (key ? CATEGORY.get(key) : undefined);

const COLUMN: ReadonlySet<ElementKind> = new Set(['interiorColumn', 'exteriorColumnNoCantilever', 'edgeColumnWithCantilever', 'cornerColumnWithCantilever']);
const PSI0_REDUCIBLE = 0.7;
export const A0_M2 = 10;

export interface ReductionAsk {
  loKNm2: number; tributaryAreaM2: number; elementKind: ElementKind; floorsSupported: number;
  passengerGarage: boolean; publicAssembly: boolean; noReduction: boolean;
}

export function alphaA(areaM2: number, psi0: number, cOrD: boolean): number {
  const a = areaM2 > 0 ? Math.min(1, (5 / 7) * psi0 + A0_M2 / areaM2) : 1;
  return cOrD ? Math.max(a, 0.6) : a;
}

export function alphaN(n: number, psi0: number): number {
  return n > 2 ? (2 + (n - 2) * psi0) / n : 1;
}

export function ukAlphaA(areaM2: number): number { return Math.max(0.75, 1 - Math.max(areaM2, 0) / 1000); }
export function ukAlphaN(n: number): number {
  if (n <= 1) return 1;
  if (n <= 5) return 1.1 - n / 10;
  return n <= 10 ? 0.6 : 0.5;
}

export function reduceImposed(family: EcFamily, o: ReductionAsk): { lKNm2: number; refs: ClauseRef[]; reason: EngineMessage } {
  const uk = family === 'uk';
  const refA = uk ? UK_NA_1991_1_1('NA.2.5', 'alpha_A') : EN1991_1_1('6.3.1.2(10)', 'alpha_A');
  const refN = uk ? UK_NA_1991_1_1('NA.2.6', 'alpha_n') : EN1991_1_1('6.3.1.2(11)', 'alpha_n');
  if (o.noReduction) return { lKNm2: o.loKNm2, refs: [refA], reason: msg('loads.ec.reduction.notAllowed') };
  if (COLUMN.has(o.elementKind)) {
    const n = o.floorsSupported;
    const a = uk ? ukAlphaN(n) : alphaN(n, PSI0_REDUCIBLE);
    return { lKNm2: o.loKNm2 * a, refs: [refN], reason: msg(uk ? 'loads.ec.reduction.ukAlphaN' : 'loads.ec.reduction.alphaN', { n, alpha: round(a, 3), l: round(o.loKNm2 * a, 3) }) };
  }
  const area = o.tributaryAreaM2;
  const a = uk ? ukAlphaA(area) : alphaA(area, PSI0_REDUCIBLE, o.publicAssembly);
  return { lKNm2: o.loKNm2 * a, refs: [refA], reason: msg(uk ? 'loads.ec.reduction.ukAlphaA' : 'loads.ec.reduction.alphaA', { area: round(area, 1), alpha: round(a, 3), l: round(o.loKNm2 * a, 3) }) };
}
