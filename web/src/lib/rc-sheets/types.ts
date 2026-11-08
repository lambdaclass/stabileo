import type { WallReinforcement } from '../design-contract/reinforcement';

export type SheetFamily = 'beam' | 'column' | 'slab' | 'wall' | 'punching';
export const SHEET_FAMILIES: readonly SheetFamily[] = ['beam', 'column', 'slab', 'wall', 'punching'];

export type SheetCode = 'cirsoc201-2025';
export const SHEET_CODES: Record<SheetCode, { name: string; edition: '2025' }> = {
  'cirsoc201-2025': { name: 'CIRSOC 201-2025', edition: '2025' },
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
  code: SheetCode;
  torsion: TorsionMode;
  /** Beam moments at the support faces, shear and torsion at d from them. */
  faces?: boolean;
  /** Beams with the slab as a compression flange. */
  flange?: boolean;
  /** Special moment frame provisions (chapter 18). */
  seismic?: boolean;
  /** Adopted bars by row key. */
  adopted: Record<string, Adopted>;
}

export const defaultRcSheetsData = (): RcSheetsData => ({ version: 1, code: 'cirsoc201-2025', torsion: 'equilibrium', adopted: {} });

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
