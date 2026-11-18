import type { CheckLine, ComboTable, RowStatus, StepGroup } from './types';
import type { BeamRow } from './beam-row';
import type { LineLayout } from './beam-line';

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
  /** Not the model's soil: the design data's presumed pressure, where the model states none. */
  presumed?: true;
}

/** The footing the model holds at the node, m: plan B along X and L along Y, its thickness and its centroid's offset from the column axis. */
export interface ModelledFooting {
  id: number; name: string;
  B: number; L: number; h: number; ex: number; ey: number;
  cover: number;
  /** Elevation of the underside, m. */
  founding: number;
  anchor?: [number, number];
  /** The nodes of the footings the model ties it to with strap beams. */
  straps?: number[];
  /** Combined, strip, mat, pile cap or turned in plan: what this family does not design. */
  outOfScope?: 'kind' | 'rotated';
}

export interface FootingColumn {
  /** Plan size along X and Y, m. */
  b: number; h: number;
  /** The bottom storey's column row, whose bars the dowels lap with. */
  rowKey?: string;
  /** From the node to the next floor the column reaches, m: where a tie balancing an eccentric footing runs. */
  storey?: number;
}

/** Where a footing stands in plan: under its column, at a property line, or at a corner of two. */
export type FootingPosition = 'centred' | 'edge' | 'corner';
export const FOOTING_POSITIONS: readonly FootingPosition[] = ['centred', 'edge', 'corner'];

/**
 * What takes the offset of a footing held at a line: a strap beam to the nearest footing inward,
 * the footing alone by an uneven pressure, or a tie at the first floor with the column between
 * (FIUBA §14.1).
 */
export type FootingBalance = 'strap' | 'eccentric' | 'tie';
export const FOOTING_BALANCES: readonly FootingBalance[] = ['strap', 'eccentric', 'tie'];

/** A row's own choice of position and balance, over the property lines and the model's footing. */
export interface FootingSetup { position?: FootingPosition; balance?: FootingBalance }

/** The rows' setups as stored, keeping only known values. */
export function footingSetupOf(raw: unknown): { footingSetup?: Record<string, FootingSetup> } {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, FootingSetup> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    const s: FootingSetup = {
      ...(FOOTING_POSITIONS.includes(o.position as FootingPosition) ? { position: o.position as FootingPosition } : {}),
      ...(FOOTING_BALANCES.includes(o.balance as FootingBalance) ? { balance: o.balance as FootingBalance } : {}),
    };
    if (s.position || s.balance) out[k] = s;
  }
  return Object.keys(out).length ? { footingSetup: out } : {};
}

/** The footing a strap beam runs to, along X or Y. */
export interface StrapPartner {
  axis: 'x' | 'y';
  key: string; nodeId: number; name: string;
  /** Between the two columns' axes, m. */
  L: number;
  column: { b: number; h: number } | null;
  /** A strap beam the model has between the two: its physical member and section, m. */
  beam?: { group: number; key: string; b: number; h: number };
}

export interface FootingEdge {
  /** Toward the line, along X and Y: −1, 0 or 1. */
  anchor: [number, number];
  source: 'model' | 'lines' | 'row';
  balance: FootingBalance;
  partners: StrapPartner[];
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
  /** Held at a property line or a corner, and what balances it. */
  edge?: FootingEdge;
  /** The other column of a combined footing, as its own demand; its node is this footing's too. */
  carried?: FootingDemand;
  /** Ties from footings at a line that end at this one (FIUBA Cim. §6.5). */
  pulls?: TiePull[];
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
  /** A combined footing's dowels into its second column. */
  dowels2?: FootingDowels;
  /** A combined footing's top bars, along the line of its columns. */
  top?: FootingMesh;
  /** A combined footing: the row key of the footing whose column it carries too. */
  with?: string;
  /** The strap beams' sections, m, by axis, where the model has none. */
  straps?: Partial<Record<'x' | 'y', { b: number; h: number }>>;
}

export interface FootingContext {
  fc: number; fy: number;
  /** The Stabileo criteria in force; absent, their defaults. */
  criteria?: import('./criteria').Criteria;
  /** Clear cover to the bottom mesh, m. */
  cover: number;
  sizing: FootingSizing;
  /** Diameters the mesh is chosen from, mm, the preferred one first for each direction. */
  diameters: readonly number[];
  preferred?: { x: number; y: number };
  /** The column's bars, as the dowels repeat them, and whether they take tension at the base. */
  columnBars?: { count: number; dia: number; tension: boolean };
  columnFc?: number;
  /** A combined footing's second column: its bars and concrete. */
  second?: { columnBars?: { count: number; dia: number; tension: boolean }; columnFc?: number };
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
  /** The end at a property line, −1 or 1: no overhang there, the bars hooked up. */
  lineEnd?: -1 | 1;
  /** A strap beam carries the footing across this direction: the bars here distribute. */
  carried?: true;
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
  /** Held at a line or a corner: how, and what balances it. */
  edge?: FootingEdgeResult;
  /** A combined footing: the line of its columns and its top bars. */
  combined?: CombinedResult;
}

/** A strap beam as designed: its statics in the governing combination and the beam itself. */
export interface StrapResult {
  axis: 'x' | 'y';
  partner: string; partnerKey: string;
  /** Between the columns, the footing's offset along the strap, m; its section, m. */
  L: number; e: number; b: number; h: number;
  /** M = P1·e + |w| at the column, V = M/(L − e), kN·m and kN; R1/P1; the partner's relief, kN, not taken. */
  M: number; V: number; factor: number; relief: number; combo: string | null;
  /** Service: the reaction under the footing, kN. */
  R1: number; P1: number;
  /** The model's strap member it is, when there is one. */
  group?: number;
  beam?: BeamRow; line?: LineLayout;
}

export interface TieResult {
  axis: 'x' | 'y';
  /** From the underside to the tie, m; Tu, kN; steel needed and given, cm². */
  H: number; Tu: number; asReq: number; count: number; dia: number; asProvided: number;
  /** The footing's offset along the tie, m; the service load and the tie's service pull, kN. */
  e: number; Ns: number; Ts: number;
  /** The footing the tie runs to and its length, m; none found inward when absent. */
  partner?: { key: string; name: string; L: number };
  /** The tie's pull in each combination, kN, as the footing it runs to takes it. */
  byCombo: Record<string, number>;
  /** Its section, m, and its stretch under Ts against H/1000, m (FIUBA Cim. §6.5). */
  b: number; h: number; stretch: number | null;
  /** Friction under the footing against the pull: μ and whether μ·Ns ≥ 1,5·Ts (FIUBA Cim. §6.2). */
  mu: number;
}

/** A tie from a footing at a line that ends at this one: its pull, kN by combination, and where it acts, m above the column's foot. */
export interface TiePull { from: string; name: string; axis: 'x' | 'y'; toward: 1 | -1; height: number; byCombo: Record<string, number>; service: number }

export interface FootingEdgeResult {
  position: FootingPosition; balance: FootingBalance; anchor: [number, number]; source: FootingEdge['source'];
  straps: StrapResult[];
  ties: TieResult[];
  /** What the column takes at its foot, kN·m, factored: the offset's moment where nothing else takes it. */
  columnMoment: number;
  /** The anchored axes the strap asked for found no footing inward. */
  unpartnered: Array<'x' | 'y'>;
}

export interface CombinedResult {
  axis: 'x' | 'y';
  second: string; secondKey: string;
  /** Between the columns, m. */
  spacing: number;
  /** Largest sagging (bottom) and hogging (top) moment along the line, kN·m, and the steel each asks, cm². */
  mBottom: number; mTop: number; asTop: number; asTopProvided: number; phiMnTop: number;
  /** The bands under the columns across the line: width, m, moment, kN·m, steel needed and given, cm². */
  bands: Array<{ width: number; mu: number; asReq: number; asProvided: number }>;
  punching: Array<{ vu: number; phiVc: number; utilization: number; position: string }>;
}
