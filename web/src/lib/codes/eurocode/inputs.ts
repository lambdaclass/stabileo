import type { EcFamily } from './refs';

export type TerrainCategory = '0' | 'I' | 'II' | 'III' | 'IV';
export const TERRAIN_CATEGORIES: readonly TerrainCategory[] = ['0', 'I', 'II', 'III', 'IV'];

export interface Directions { x: boolean; y: boolean }

export interface EcWindInput {
  vb0?: number;
  cdir?: number;
  cseason?: number;
  terrain?: TerrainCategory;
  c0?: number;
  cscd?: number;
  directions?: Directions;
}

export interface UkWindInput extends Omit<EcWindInput, 'vb0'> {
  vbMap?: number;
  altitude?: number;
}

export type SnowRoof = 'monopitch' | 'duopitch';
export type SnowExposure = 'windswept' | 'normal' | 'sheltered';

export interface EcSnowInput {
  sk?: number;
  exposure?: SnowExposure;
  ct?: number;
  roof?: SnowRoof;
  slidingPrevented?: boolean;
  altitude?: number;
}

export interface UkSnowInput extends Omit<EcSnowInput, 'sk'> {
  zone?: number;
}

export type GroundType = 'A' | 'B' | 'C' | 'D' | 'E';
export type ImportanceClass = 'I' | 'II' | 'III' | 'IV';
export type PeriodSystem = 'steelMrf' | 'concreteMrf' | 'other';
export type Occupancy = 'correlated' | 'independent';

export interface EcSeismicInput {
  agR?: number;
  groundType?: GroundType;
  spectrumType?: 1 | 2;
  importance?: ImportanceClass;
  gammaI?: number;
  q?: number;
  periodSystem?: PeriodSystem;
  t1?: number;
  occupancy?: Occupancy;
  combine30?: boolean;
  directions?: Directions;
}

export const WIND_ADAPTER: Readonly<Record<EcFamily, string>> = { eurocode: 'en1991-1-4', uk: 'en1991-1-4-uk' };
export const SNOW_ADAPTER: Readonly<Record<EcFamily, string>> = { eurocode: 'en1991-1-3', uk: 'en1991-1-3-uk' };
export const SEISMIC_ADAPTER = 'en1998-1';

export const WIND_DEFAULTS: Required<Pick<EcWindInput, 'cdir' | 'cseason' | 'c0' | 'cscd' | 'directions'>> = {
  cdir: 1, cseason: 1, c0: 1, cscd: 1, directions: { x: true, y: true },
};
export const SNOW_DEFAULTS: Required<Pick<EcSnowInput, 'exposure' | 'ct' | 'roof' | 'slidingPrevented'>> = {
  exposure: 'normal', ct: 1, roof: 'duopitch', slidingPrevented: false,
};
export const SEISMIC_DEFAULTS: Required<Pick<EcSeismicInput, 'spectrumType' | 'importance' | 'periodSystem' | 'occupancy' | 'combine30' | 'directions'>> = {
  spectrumType: 1, importance: 'II', periodSystem: 'other', occupancy: 'correlated', combine30: true, directions: { x: true, y: true },
};
