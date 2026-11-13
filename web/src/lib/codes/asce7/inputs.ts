import type { Enclosure, Exposure } from '../cirsoc102/wind';
import type { WindCaseSet, WindDirection } from '../../engine/loads/wind-cases';
import type { LoadPlanInput } from '../../engine/loads/load-plan';

export type RiskCategory = 'I' | 'II' | 'III' | 'IV';
export const RISK_CATEGORIES: readonly RiskCategory[] = ['I', 'II', 'III', 'IV'];

export const ADAPTER = {
  basis: 'asce7-22-basis', loads: 'asce7-22-loads', wind: 'asce7-22-wind', snow: 'asce7-22-snow', seismic: 'asce7-22-seismic',
} as const;

export interface Asce7WindInput {
  /** m/s, not mph: the map value for the Risk Category. */
  V?: number;
  riskCategory?: RiskCategory;
  exposure?: Exposure;
  kzt?: number;
  ke?: number;
  groundElevationM?: number;
  enclosure?: Enclosure;
  roofSlopeDeg?: number;
  directions?: WindDirection[];
  caseSet?: WindCaseSet;
  rigid?: boolean;
}

export interface Asce7SnowInput {
  /** kN/m², not psf. */
  pg?: number;
  riskCategory?: RiskCategory;
  ce?: number;
  ct?: number;
  cs?: number;
  slippery?: boolean;
  roofSlopeDeg?: number;
}

export type SiteClass = 'A' | 'B' | 'BC' | 'C' | 'CD' | 'D' | 'DE' | 'E' | 'F';
export const SITE_CLASSES: readonly SiteClass[] = ['A', 'B', 'BC', 'C', 'CD', 'D', 'DE', 'E', 'F'];

export interface Asce7SeismicInput {
  spectrum?: 'design' | 'mce';
  /** In g. */
  sds?: number; sd1?: number; sms?: number; sm1?: number; s1?: number;
  siteClass?: SiteClass;
  riskCategory?: RiskCategory;
  systemKey?: string;
  r?: number; cd?: number; omega0?: number;
  periodKey?: string;
  tl?: number;
  computedT?: number;
  rho?: number;
  directions?: { x: boolean; y: boolean };
  torsion?: boolean;
  orthogonal?: boolean;
  /** kN/m² of floor, used only when above the 0,48 minimum. */
  partitionKNm2?: number;
}

export const WIND_DEFAULTS = {
  riskCategory: 'II', exposure: 'C', kzt: 1, enclosure: 'enclosed', roofSlopeDeg: 0,
  directions: ['+x', '-x', '+y', '-y'], caseSet: 'all', rigid: true,
} as const;
export const SNOW_DEFAULTS = { riskCategory: 'II', ce: 1, ct: 1, slippery: false } as const;
export const SEISMIC_DEFAULTS = {
  spectrum: 'design', siteClass: 'D', riskCategory: 'II', systemKey: 'steelSMF', periodKey: 'steelMRF', rho: 1,
  directions: { x: true, y: true }, torsion: true, orthogonal: false,
} as const;

export function codeInput<T>(input: LoadPlanInput, adapterId: string): T {
  return ((input.codeInputs?.[adapterId] as T | undefined) ?? {}) as T;
}
