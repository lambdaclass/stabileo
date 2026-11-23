import type { CheckLine, ComboTable, RowStatus, StepGroup } from './types';

/**
 * What one combination puts on a footing at its support node, global axes: N downward
 * (compression positive), Mx and My right-handed about X and Y, Vx and Vy horizontal; kN, kN·m.
 */
export interface FootingAction { combo: string; N: number; Mx: number; My: number; Vx: number; Vy: number }

export interface FootingSoil {
  name: string;
  /** Allowable bearing pressure, kPa. */
  allowable: number;
  /** The edge pressure may reach this many times the allowable while the mean stays under it. */
  edgeFactor?: number;
  /** kN/m³, when the soil states it. */
  unitWeight?: number;
}

/** The footing the model holds at the node, m: plan B along X and L along Y, its thickness and its centroid's offset from the column axis. */
export interface ModelledFooting {
  id: number; name: string;
  B: number; L: number; h: number; ex: number; ey: number;
  cover: number;
  /** Elevation of the underside, m. */
  founding: number;
  anchor?: [number, number];
  /** Combined, strip, mat, pile cap or turned in plan: what this family does not design. */
  outOfScope?: 'kind' | 'rotated';
}

export interface FootingColumn {
  /** Plan size along X and Y, m. */
  b: number; h: number;
  /** The bottom storey's column row, whose bars the dowels lap with. */
  rowKey?: string;
}

export interface FootingDemand {
  key: string; name: string; level?: string;
  nodeId: number;
  at: { x: number; y: number; z: number };
  column: FootingColumn | null;
  footing?: ModelledFooting;
  /** The gravity cases at unit factors; null when the solve kept no cases apart. */
  service: FootingAction | null;
  /** Wind and earthquake cases that load the support and the service sum leaves out. */
  lateralLeftOut: number;
  combos: FootingAction[];
  soil: FootingSoil | null;
}

export type FootingSizing = 'full' | 'minimum' | 'reinforce';
export const FOOTING_SIZINGS: readonly FootingSizing[] = ['full', 'minimum', 'reinforce'];

/** A bottom layer: bars `dia` at `spacing`, m; a short-direction layer of a rectangular footing at `outer` outside its central band (§13.3.3.3). */
export interface FootingMesh { dia: number; spacing: number; outer?: number }

export interface FootingDowels { count: number; dia: number }

export interface FootingAdopted {
  B: number; L: number; h: number;
  ex: number; ey: number;
  /** Bars along X and along Y. */
  x: FootingMesh; y: FootingMesh;
  dowels?: FootingDowels;
}

export interface FootingContext {
  fc: number; fy: number;
  /** Clear cover to the bottom mesh, m. */
  cover: number;
  sizing: FootingSizing;
  /** Diameters the mesh is chosen from, mm, the preferred one first for each direction. */
  diameters: readonly number[];
  preferred?: { x: number; y: number };
  /** The column's bars, as the dowels repeat them, and whether they take tension at the base. */
  columnBars?: { count: number; dia: number; tension: boolean };
  columnFc?: number;
}

/** Which mesh lies lowest, the d of each, and where the short direction's band is. */
export interface FootingLayers { lower: 'x' | 'y'; dx: number; dy: number; d: number }

export interface FootingDirection {
  dir: 'x' | 'y';
  /** Moment and shear at the critical sections, factored, kN·m and kN; the width they act over, m. */
  mu: number; vu: number; width: number; d: number;
  asReq: number; asMin: number; asProvided: number;
  phiMn: number; phiVc: number;
  /** Fraction of the steel in the central band, when the layer is the short direction of a rectangle. */
  band?: { share: number; width: number; asReq: number; asProvided: number };
  anchorage: { ld: number; available: number; hooked: boolean; ok: boolean };
}

export interface FootingBearing {
  /** Service pressures under the base, kPa, and the share in contact. */
  qMax: number; qMin: number; qMean: number; contact: number;
  allowable: number | null; edgeFactor: number;
  weight: number;
  ex: number; ey: number;
  overturns: boolean; ok: boolean; utilization: number;
}

export interface FootingRow {
  family: 'footing';
  key: string; name: string; level?: string;
  demand: FootingDemand;
  B: number; L: number; h: number; ex: number; ey: number;
  cover: number;
  proposed: FootingAdopted;
  adopted: FootingAdopted;
  isAdopted: boolean;
  /** How the proposal reached its size. */
  sizing: { mode: FootingSizing; reached: boolean; from: 'model' | 'loads' | 'none' };
  bearing: FootingBearing | null;
  layers: FootingLayers;
  x: FootingDirection | null; y: FootingDirection | null;
  punching: { vu: number; phiVc: number; utilization: number; bo: number; position: 'interior' | 'edge' | 'corner' } | null;
  dowels: { count: number; dia: number; ldc: number; available: number; lap: number; tension: boolean } | null;
  utilization: number;
  verifications: CheckLine[];
  combos: ComboTable;
  status: RowStatus;
  generous: boolean;
  steps: StepGroup[];
  /** The code designs no footings: only the soil pressure is read. */
  uncovered?: boolean;
}
