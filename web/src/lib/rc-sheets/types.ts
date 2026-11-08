export type SheetFamily = 'beam' | 'column' | 'slab';
export const SHEET_FAMILIES: readonly SheetFamily[] = ['beam', 'column', 'slab'];

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
}

/** Four corner bars, `nx` more on each face along b and `ny` on each face along h. */
export interface ColumnAdopted {
  corner: number;
  nx: number; dx: number;
  ny: number; dy: number;
  tieDia: number; tieSpacing: number;
}

export interface SlabAdopted { bottomX: MeshBars; bottomY: MeshBars; topX: MeshBars; topY: MeshBars }

export type Adopted = BeamAdopted | ColumnAdopted | SlabAdopted;

export type TorsionMode = 'equilibrium' | 'compatibility';

export interface RcSheetsData {
  version: 1;
  torsion: TorsionMode;
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

export interface DemandSource { combo: string; x?: number }

export interface Signed { value: number; source?: DemandSource }

export interface Materials { fc: number; fy: number }
