import type { Unit } from './units';

export type { Unit } from './units';

export const PROFILE_SCHEMA_VERSION = 1;

/** transcribed: one person read it from the code; checked: a second person re-read it from the text; toConfirm: not yet compared with the text. A value without a status is transcribed. */
export type Status = 'transcribed' | 'checked' | 'toConfirm';
export const STATUSES: readonly Status[] = ['transcribed', 'checked', 'toConfirm'];

/** `source` is the id of one of `meta.sources`; without it, the first one. `label` names the clause for a reader of the profile and is never rendered. */
export interface Cite { clause: string; page?: string; source?: string; label?: string }
export interface Val<T = number> { v: T; unit?: Unit; cite: Cite; status?: Status }
export interface Table {
  unit: Unit; cite: Cite; status?: Status; interp?: 'none' | 'linear' | 'step';
  axes: Array<{ name: string; values: Array<number | string> }>;
  values: number[] | number[][];
}
/** A table whose rows are named, so that a profile that extends another replaces single rows. */
export interface KeyedTable { unit: Unit; cite: Cite; status?: Status; columns: string[]; rows: Record<string, number[]> }
/** A formula of the closed catalog (`formulas.ts`), with its coefficients. */
export interface Formula { f: string; k: Record<string, number>; cite: Cite; status?: Status }
/** A procedure a programmer implements, registered by id. */
export interface Hook { hook: string; params?: Record<string, unknown> }
export interface Input {
  key: string; label: Record<string, string>; unit: Unit; cite: Cite; kind: 'number' | 'choice' | 'bool';
  options?: string[]; min?: number; max?: number; default?: number | string | boolean;
}
/** `id` is the regulation id the app cites the source by. */
export interface Source { id: string; title: string; edition: string }
export type Role = 'loads' | 'rc' | 'steel' | 'timber';
export type Maturity = 'draft' | 'provisional' | 'validated';
export interface Meta {
  schema: number; id: string; extends?: string;
  role: Role;
  title: string; edition: string; revision: number; country: string;
  sources: Source[];
  maintainers: string[]; maturity: Maturity;
  notes?: string[];
}

export type ActionKind = 'permanent' | 'imposed' | 'roofImposed' | 'snow' | 'rain' | 'wind' | 'seismic' | 'thermal' | 'earthPressure' | 'fluid';

export type Combinations =
  | { form: 'generated'; gamma: { gSup: Val; gInf: Val; q: Val }; xi?: Val; psi: KeyedTable;
      equations?: string[]; exclusive: string[][]; notActing: boolean }
  | { form: 'enumerated'; notActing: boolean;
      rules: Array<{ id: string; purpose: 'strength' | 'service'; terms: string; cite: Cite }>;
      exceptions?: Array<{ id: string; when: string; set: Record<string, number>; cite: Cite }> }
  | Hook;

export type OccupancyKind =
  | 'residential' | 'office' | 'commercial' | 'education' | 'health' | 'assembly'
  | 'industrial' | 'storage' | 'parking' | 'roof' | 'circulation' | 'other';
export type AssemblyKind = 'passengerGarage' | 'truckGarage' | 'publicAssembly';

/** One row of an occupancy table. `q` is null where the code sends the reader to another clause (`see`). */
export interface Occupancy {
  key: string; label?: string; kind: OccupancyKind; group?: string;
  q: number | null; Q?: number | null;
  assembly?: AssemblyKind; noReduction?: boolean; see?: string;
  cite?: Cite; status?: Status; note?: string;
  tags?: Record<string, string | boolean>;
}
/** Every row cites `cite` first, then its own. A row's label key is `labelPrefix` + (`label` or `key`). */
export interface OccupancyTable {
  units: { q: Unit; Q: Unit }; cite: Cite[]; status?: Status; labelPrefix: string;
  rows: Occupancy[];
}

export interface LoadsProfile {
  meta: Meta & { role: 'loads' };
  symbols?: Record<string, ActionKind>;
  combinations?: Combinations;
  imposed: {
    occupancies: OccupancyTable;
    reduction?: { form: 'kllArea'; kll: Record<string, number>; threshold: Val; floors: [number, number] }
      | { form: 'alphaAalphaN'; a0: Val; psi0: number; floorCD?: number }
      | { form: 'steps'; area?: Formula; floors: Table; columnsOnly?: boolean } | Hook;
    partition?: { kind: 'minimum'; min: Val; exemptAbove?: Val } | { kind: 'choices'; values: number[]; walls: number[]; cite: Cite } | { kind: 'typed' };
  };
  wind?: {
    inputs: Input[]; basicSpeed: Formula; density: Val; factors?: Record<string, Val>;
    profile: { form: 'powerLaw'; exposures: Table; zMin: Val } | { form: 'logLaw'; terrains: Table; zMax: Val; kr: Formula; peak: number }
      | { form: 'heightBands'; bands: Table } | Hook;
    pressures: { walls: Table | Hook; roof?: Table | Hook; distribution: Hook };
  } | null;
  snow?: {
    inputs: Input[];
    ground: { form: 'typed' } | { form: 'zoneAltitude'; formula: Formula } | { form: 'zoneAltitudeTable'; table: Table } | Hook;
    roof: { exposure: Table; thermal?: Val; importance?: Table; shape: Table | Formula; arrangements: Hook };
  } | null;
  seismic?: {
    inputs: Input[];
    spectrum: { form: 'agSoilType'; soil: Table; plateau: number; floor: Val; importance: Table }
      | { form: 'twoParameter'; fs: Table; f1: Table; tl: Val; importance: Table }
      | { form: 'zoneTable'; zones: Table; ca: Table; cv: Table; risk: Table } | Hook;
    reduction: { form: 'typedQ' } | { form: 'systemTable'; systems: Table } | Hook;
    period: { ct: Table; exponent: number | Table; cap?: Table };
    massShare: Table; staticMethod: Hook; vertical?: Hook;
  } | null;
}

export type Resistance =
  | { kind: 'phi'; tension: Val; compressionTied: Val; compressionSpiral: Val; shear: Val; strainTension: Val }
  | { kind: 'gamma'; gammaC: Val; gammaS: Val; alphaCC: Val; alphaCCShear: Val; alphaCT: Val };

/** The sections marked optional are the ones no part of the app reads from a profile yet. */
export interface RcProfile {
  meta: Meta & { role: 'rc' };
  materials: {
    concrete?: { grades: Array<{ name: string; fck: number; cube?: number }>; epsCu: Val; block: Formula; fct: Formula; ec: Formula };
    steel: { grades?: Array<{ name: string; fyk: number }>; es: Val };
    bars?: { diameters: number[]; stirrups: number[]; mesh: number[]; naming: 'mm' | 'usNumber' };
  };
  resistance: Resistance;
  beams: { minSteel: Formula; maxRatio: Val; xuLimit?: Table; linkMin: Formula; linkMaxSpacing: Val };
  shear: Formula | Hook; torsion?: Hook;
  punching: { perimeterAt?: Val; beta?: Table; vmax?: Formula; method?: Hook };
  detailing?: { cover: Table; anchorage: Formula; lap: { factors: Table; min: Val }; hook: Formula | Hook; mandrel: Table; minClear: Formula };
  columns: { rhoMin: Formula; rhoMax: Val; minDim?: Val; minBarDia: Val; tieSpacing?: Formula; slenderness: Formula | Hook };
  walls?: { rhoMinV: Val; rhoMinH: Val; boundary?: Hook };
  crack?: { form: 'barTables'; maxDia: Table; maxSpacing: Table } | Formula | Hook;
  seismicDetailing?: Hook;
  rows?: Record<'beam' | 'line' | 'column' | 'slab' | 'wall' | 'punching', Hook>;
}

export type CodeProfile = LoadsProfile | RcProfile;

export interface ProfileIssue { path: string; message: string }
