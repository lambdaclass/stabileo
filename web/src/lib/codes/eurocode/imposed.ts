import type { ElementKind, OccupancyEntry } from '../cirsoc101/live-loads';
import type { ClauseRef } from '../regulation';
import { msg, round, type EngineMessage } from '../message';
import { EN1991_1_1, UK_NA_1991_1_1, type EcFamily } from './refs';
import type { ImposedCategory } from './context';
import { loadsProfile } from '../../code-profiles/registry';
import { occupancyRows } from '../../code-profiles/adapters/occupancies';

const PROFILE: Readonly<Record<EcFamily, string>> = { eurocode: 'en-1990-1991', uk: 'en-1990-1991-uk' };

function table(family: EcFamily): { entries: readonly OccupancyEntry[]; categories: Array<[string, ImposedCategory]> } {
  const rows = occupancyRows(loadsProfile(PROFILE[family]));
  // C and D carry `publicAssembly` only so that reduce() can tell them apart: the αA ≥ 0,6 floor.
  const entries = rows.map(({ row, entry }) => (row.group === 'C' || row.group === 'D' ? { ...entry, assemblyKind: 'publicAssembly' as const } : entry));
  return { entries: Object.freeze(entries), categories: rows.map(({ row }) => [row.key, row.group as ImposedCategory]) };
}

const BUILT = { eurocode: table('eurocode'), uk: table('uk') };
const TABLES: Record<EcFamily, readonly OccupancyEntry[]> = { eurocode: BUILT.eurocode.entries, uk: BUILT.uk.entries };
const CATEGORY = new Map<string, ImposedCategory>([...BUILT.eurocode.categories, ...BUILT.uk.categories]);

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
