import type { WallReinforcement } from '../design-contract/reinforcement';

export type SheetFamily = 'beam' | 'column' | 'slab' | 'wall' | 'punching';
export const SHEET_FAMILIES: readonly SheetFamily[] = ['beam', 'column', 'slab', 'wall', 'punching'];

export type SheetCode = 'cirsoc201-2025' | 'aci318-19' | 'en1992-1-1' | 'bs-en1992-1-1' | 'ts500-2000';
/** The codes the sheets design to, in the order they are offered. */
export const SHEET_CODE_LIST: readonly SheetCode[] = ['cirsoc201-2025', 'aci318-19', 'en1992-1-1', 'bs-en1992-1-1', 'ts500-2000'];
export const SHEET_CODES: Record<SheetCode, { name: string; country: string }> = {
  'cirsoc201-2025': { name: 'CIRSOC 201-2025', country: 'AR' },
  'aci318-19': { name: 'ACI 318-19', country: 'US' },
  'en1992-1-1': { name: 'EN 1992-1-1:2004', country: 'EU' },
  'bs-en1992-1-1': { name: 'BS EN 1992-1-1 + UK NA', country: 'GB' },
  'ts500-2000': { name: 'TS 500:2000', country: 'TR' },
};

export type RowStatus = 'ok' | 'warn' | 'fail' | 'none';

/** Diameters in mm, spacings in m. */
export interface BarGroup { count: number; dia: number }

export interface Stirrups { dia: number; legs: number; spacing: number }

export interface MeshBars { dia: number; spacing: number }

/** The first group of each face is the outer layer; the second sits above it. */
export interface BeamAdopted {
  bottom: BarGroup[];
  top: BarGroup[];
  stirrups: Stirrups;
  torsionLong?: BarGroup;
  /** The bars present at each section when they change along the span (a continuous beam's cut bars). */
  at?: Partial<Record<'start' | 'span' | 'end', { top: BarGroup[]; bottom: BarGroup[] }>>;
}

/** Four corner bars, `nx` more on each face along b and `ny` on each face along h. */
export interface ColumnAdopted {
  corner: number;
  nx: number; dx: number;
  ny: number; dy: number;
  tieDia: number; tieSpacing: number;
}

export interface SlabAdopted { bottomX: MeshBars; bottomY: MeshBars; topX: MeshBars; topY: MeshBars }

export type WallAdopted = WallReinforcement;

export type Adopted = BeamAdopted | ColumnAdopted | SlabAdopted | WallAdopted | import('./beam-line').LineAdopted;

export type TorsionMode = 'equilibrium' | 'compatibility';

export interface RcSheetsData {
  version: 1;
  /** Absent: the project's concrete code. */
  code?: SheetCode;
  torsion: TorsionMode;
  /** Beam moments at the support faces, shear and torsion at d from them. */
  faces?: boolean;
  /** Beams with the slab as a compression flange. */
  flange?: boolean;
  /** Special moment frame provisions (chapter 18). */
  seismic?: boolean;
  /** Beams whose span bars rise over the supports to carry the hogging moment there. */
  bentBars?: boolean;
  /** Slabs whose span bars, every other one, rise over both supports in the level plan. */
  slabBentBars?: boolean;
  /** Adopted bars by row key. */
  adopted: Record<string, Adopted>;
}

export const defaultRcSheetsData = (): RcSheetsData => ({ version: 1, torsion: 'equilibrium', adopted: {} });

export interface Step {
  label: string;
  formula?: string;
  value?: string;
  ok?: boolean;
}

export interface StepGroup { title: string; steps: Step[] }

/** One verification of the adopted bars: `label` is an i18n key; demand and capacity are formatted. */
export interface CheckLine {
  label: string;
  clause?: string;
  demand?: string;
  capacity?: string;
  ratio?: number;
  ok: boolean;
}

/** The forces of one combination on a row and how the adopted bars carry them. `headers` are i18n keys or symbols. */
export interface ComboTable {
  headers: string[];
  rows: Array<{ combo: string; values: string[]; ratio: number; ok: boolean }>;
}

export interface DemandSource { combo: string; x?: number }

export interface Signed { value: number; source?: DemandSource }

export interface Materials { fc: number; fy: number }

export const check = (label: string, ok: boolean, o: Omit<CheckLine, 'label' | 'ok'> = {}): CheckLine => ({ label, ok, ...o });

export const ratioOf = (demand: number, capacity: number): number =>
  capacity > 1e-9 ? Math.abs(demand) / capacity : Math.abs(demand) > 1e-9 ? Number.POSITIVE_INFINITY : 0;
