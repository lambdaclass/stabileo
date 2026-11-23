import type { SoilStratum } from '../model/geotechnical';
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
  /** Winkler subgrade modulus, kN/m³, when the soil states it. */
  subgrade?: number;
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
  /** A strip or a mat the sheets wrote under several columns: its kind, its model id and the row keys of the footings it holds; B, L, ex and ey are this column's. */
  group?: { kind: GroupKind; members: string[] };
}

/** A footing under several columns: a strip (combined footing of two or more in a line) or a mat under a group of them. */
export type GroupKind = 'strip' | 'mat';

export interface FootingColumn {
  /** Plan size along X and Y, m. */
  b: number; h: number;
  /** The bottom storey's column row, whose bars the dowels lap with. */
  rowKey?: string;
  /** From the node to the next floor the column reaches, m: where a tie balancing an eccentric footing runs. */
  storey?: number;
  /** A pier's section area, m², where `b` × `h` is only its box: what bears on the footing and what its dowels are read against. */
  area?: number;
  /** A pier's vertical bars as the dowels repeat them: how many, the thickest, whether any takes tension at the base, their area, cm², and each dowel where it stands in plan with the way in it is cranked to lap beside its bar, its diameter and its lap, m. */
  bars?: { count: number; dia: number; tension: boolean; area?: number; at?: Array<{ x: number; y: number; n: [number, number]; dia: number; lap: number }> };
  /** A pier's concrete, MPa. */
  fc?: number;
  /** The least steel across the joint where it is not 0,005·Ag (§16.3.4.1): a pier's, 0,005 of its columns' area and the walls' least vertical ratio over theirs (§16.3.4.2), cm². */
  dowelMin?: number;
}

/** Where a footing stands in plan: under its column, at a property line, or at a corner of two. */
export type FootingPosition = 'centred' | 'edge' | 'corner';
export const FOOTING_POSITIONS: readonly FootingPosition[] = ['centred', 'edge', 'corner'];

/**
 * What takes the offset of a footing held at a line: a strap beam to the nearest footing inward,
 * the footing alone by an uneven pressure, or a tie at the first floor with the column between
 * (FIUBA Cim. §6).
 */
export type FootingBalance = 'strap' | 'eccentric' | 'tie';
export const FOOTING_BALANCES: readonly FootingBalance[] = ['strap', 'eccentric', 'tie'];

/**
 * A layout for the whole building's foundation: by the selection rule (the recommendation), each
 * column on its own footing where it fits, strips along the column lines, or one mat.
 */
export type FoundationSystem = 'auto' | 'footings' | 'strips' | 'mat' | 'piles';
export const FOUNDATION_SYSTEMS: readonly FoundationSystem[] = ['auto', 'footings', 'strips', 'mat', 'piles'];

/** The piles a column is founded on: diameter and length, m, the allowable load of one, kN, from the soil profile's strata or presumed, and the group's efficiency. */
export interface PileSpec {
  diameter: number; length: number; capacity: number; source: 'strata' | 'layers' | 'presumed'; efficiency: number;
  /** The strata the capacity is read from, their top at the column's foot: a cap founded deeper reads its piles from its own underside down. */
  strata?: readonly SoilStratum[];
}

/** A pile cap's piles as adopted: where each stands from the cap's centroid, m, their diameter and length, and each pile's bars and hoops. */
export interface CapPiles { diameter: number; length: number; at: Array<[number, number]>; bars: { count: number; dia: number }; hoop: { dia: number; spacing: number } }

/** A pile cap as read: each pile's service and factored load, kN, the group's capacity, the cap's method and each section, and the pile's own section. */
export interface CapResult {
  piles: Array<{ x: number; y: number; service: number; factored: number }>;
  diameter: number; length: number; capacity: number; source: PileSpec['source']; efficiency: number; spacing: number;
  /** How deep the pile heads stand under the column's foot, m: the strata are read from there down. */
  head: number;
  /** The cap's top cover, m: the footings' own; its bottom bars sit over the pile heads instead (`FootingRow.cover`). */
  topCover: number;
  group: { service: number; capacity: number };
  /** The cap is deep (every pile within twice the cap's depth over the pile heads of the column's axis, §13.2.6.5): read by struts and ties (ch. 23). */
  deep: boolean;
  stm: { z: number; theta: number; tx: number; ty: number; asx: number; asy: number; /** Whether the ties along each axis lie in bands over lines of piles. */ banded: { x: boolean; y: boolean }; /** The steel each tie is read with, cm²: its bands' bars, or the whole mesh where there are none. */ tie: { x: number; y: number }; /** The mesh's own steel over the whole cap, its bands left out, cm². */ mesh: { x: number; y: number }; node: { column: number; columnCap: number; pile: number; pileCap: number } } | null;
  shear: Array<{ dir: 'x' | 'y'; at: number; vu: number; phiVc: number }>;
  punching: Array<{ at: string; vu: number; phiVc: number; bo: number; combo: string }>;
  section: { pu: number; phiPn: number; as: number; asMin: number };
  /** The ties between caps where no strap balances the cap: their force, kN (a share of the largest column load), and steel, cm². */
  tie: { force: number; as: number } | null;
}

/** A column's own foundation over the selection rule: its own footing, one shared with its neighbours, or the mat. */
export type FootingSolution = 'isolated' | 'combined' | 'mat';
export const FOOTING_SOLUTIONS: readonly FootingSolution[] = ['isolated', 'combined', 'mat'];

/** A row's own choice of position and balance, over the property lines and the model's footing, and of its foundation. */
export interface FootingSetup { position?: FootingPosition; balance?: FootingBalance; solution?: FootingSolution }

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
      ...(FOOTING_SOLUTIONS.includes(o.solution as FootingSolution) ? { solution: o.solution as FootingSolution } : {}),
    };
    if (s.position || s.balance || s.solution) out[k] = s;
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
  /** The partner's permanent load, kN: what holds it down against the strap's pull. */
  permanent?: number;
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
  /** The axial force of the dead load cases alone, kN; absent where the solve kept no cases apart. */
  permanent?: number;
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
  /** The level the footing's underside is founded at, m: the project's common founding level. Absent: its top at the node. */
  founding?: number;
  /** A strip or mat: the footings it holds, each a demand of its own, the first the reference `at` and `key` are read from. */
  group?: FootingGroup;
  /** Founded on piles under a cap: the piles' diameter, length and capacity. */
  piles?: PileSpec;
  /** The footing of a pier or a wall: every supported node along its base (`nodeId` the one nearest its centre) and its walls by row key. */
  pier?: { key: string; nodes: number[]; walls: string[]; /** Its section in plan, global X and Y, m. */ outline?: Array<{ x: number; y: number }>; /** Where its base nodes stand in plan, m: the axes it holds a property line by. */ points?: Array<{ x: number; y: number }> };
}

/** What a strip or mat holds and why it was made: footings that overlap, footings that cover more than a mat's share of the plan, a row or the project set by hand, or a group nothing else solved. */
export interface FootingGroup {
  kind: GroupKind;
  members: FootingDemand[];
  /** A strip's line: the axis its columns lie along. */
  axis?: 'x' | 'y';
  reason: 'overlap' | 'cover' | 'row' | 'project' | 'fallback' | 'model';
}

export type FootingSizing = 'full' | 'minimum' | 'reinforce';
export const FOOTING_SIZINGS: readonly FootingSizing[] = ['full', 'minimum', 'reinforce'];

/** A bottom layer: bars `dia` at `spacing`, m; a short-direction layer of a rectangular footing at `outer` outside its central band (§13.3.3.3). */
export interface FootingMesh {
  dia: number; spacing: number; outer?: number;
  /** A pile cap's bands over its lines of piles: each centred `at` m across the layer, `width` wide, with `count` bars in place of the mesh's there. */
  bands?: { at: number[]; width: number; count: number };
}

export interface FootingDowels { count: number; dia: number }

/** Stirrup legs for punching round a column (§22.6.7): `legs` of `dia` on the first of `lines` lines parallel to its faces, the first `first` from them and the rest `spacing` apart, m. */
export interface PunchingCage { dia: number; spacing: number; first: number; lines: number; legs: number }

/** A drop under a column (a capital below the base): `w` past its faces and `hd` under the underside, m, with a mesh of its own at its underside. */
export interface PunchingDrop { w: number; hd: number }

export interface PunchingFix { cage?: PunchingCage; drop?: PunchingDrop }

/** A critical section for punching as read: at d/2 from the column (`column`), past the outermost stirrups (`outer`) or past a drop's edge (`drop`); stresses, MPa, perimeter and depth, m. */
export interface PunchingSection { at: 'column' | 'outer' | 'drop'; vu: number; phiV: number; bo: number; d: number; combo: string }

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
  /** A strip's or mat's top bars along X and along Y. */
  tops?: { x?: FootingMesh; y?: FootingMesh };
  /** A strip's or mat's bars added over a band, along `dir` on one face, from `lo` to `hi` across, m from the centroid. */
  extra?: GroupExtra[];
  /** A strip's or mat's dowels, by the row key of each footing it holds. */
  columns?: Record<string, FootingDowels>;
  /** A strip's or mat's stirrups or drops for punching, by the row key of each footing it holds. */
  punching?: Record<string, PunchingFix>;
  /** A pile cap's piles. */
  piles?: CapPiles;
}

/** The bars a footing's dowels repeat: how many, the thickest, whether any takes tension at the base, and the column's own lap with them, m, starting `lapFrom` over its foot. */
export interface ColumnBarsAtBase { count: number; dia: number; tension: boolean; lap?: number; lapFrom?: number; area?: number; at?: NonNullable<FootingColumn['bars']>['at'] }

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
  columnBars?: ColumnBarsAtBase;
  columnFc?: number;
  /** A combined footing's second column: its bars and concrete. */
  second?: { columnBars?: ColumnBarsAtBase; columnFc?: number };
  /** A strip's or mat's columns, by row key: their bars and concrete. */
  members?: Record<string, { columnBars?: ColumnBarsAtBase; columnFc?: number }>;
}

/**
 * A footing's dowels as its row reads them: how many and how thick, ldc against the room in the
 * footing, and their lap with the column's bars, m, which starts `above` the footing's top (its
 * pedestal and where the column's lap starts) and is reached by a crank in of `offset`, m.
 */
export interface FootingRowDowels { count: number; dia: number; ldc: number; available: number; lap: number; tension: boolean; above?: number; offset?: number }

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
  sizing: { mode: FootingSizing; reached: boolean; from: 'model' | 'loads' | 'none'; /** The allowable pressure, kPa, the proposal verifies at where the soil's does not hold it at the plan the lines allow. */ needs?: number };
  bearing: FootingBearing | null;
  layers: FootingLayers;
  x: FootingDirection | null; y: FootingDirection | null;
  punching: { vu: number; phiVc: number; utilization: number; bo: number; position: 'interior' | 'edge' | 'corner' } | null;
  dowels: FootingRowDowels | null;
  /** A combined footing's dowels into its second column, read against that column's bars. */
  secondDowels?: FootingRowDowels | null;
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
  /** Elevation of the underside, m. */
  founding: number;
  /** The column's stretch below its foot down to the footing's top, m: the pedestal the common founding level asks for. */
  pedestal: number;
  /** That pedestal's section, m, wider than the column it carries; absent with none. */
  pedestalSection?: { b: number; h: number } | null;
  /** A strip or a mat: its columns, strips and bands. */
  group?: GroupResult;
  /** A pile cap: its piles and how it reads. */
  cap?: CapResult;
}

export interface GroupExtra { dir: 'x' | 'y'; face: 'bottom' | 'top'; lo: number; hi: number; mesh: FootingMesh }

/** A column a strip or mat holds, from its centroid, m: its service load, punching, bearing and dowels. */
export interface GroupColumn {
  key: string; name: string;
  x: number; y: number; b: number; h: number;
  N: number;
  punching: {
    vu: number; phiVc: number; utilization: number; bo: number; position: string; combo: string;
    /** What carries what the concrete alone does not, every section it is read at, and with stirrups vs and the ceiling on vu, MPa, and the legs on the line that has fewest. */
    fix?: PunchingFix; sections?: PunchingSection[]; vs?: number; ceiling?: number; legs?: number;
  } | null;
  bearing: { pu: number; phiBn: number };
  dowels: { count: number; dia: number; area: number; required: number; ldc: number; ldh: number; available: number; lap: number; tension: boolean; above: number; offset: number } | null;
  /** Its footing would hold it at a line: −1, 0 or 1 along X and Y. */
  anchor: [number, number];
}

/** One strip of a mat, or a strip footing along its line, read as a beam: the moments, the shear at d from the faces and the steel both faces ask over its width. */
export interface GroupStrip {
  dir: 'x' | 'y';
  /** Its centre across and its width, m from the footing's centroid. */
  at: number; width: number;
  columns: string[];
  mBottom: number; mTop: number; vu: number; phiVc: number; d: number;
  asBottom: number; asTop: number; asBottomProvided: number; asTopProvided: number;
  phiMnBottom: number; phiMnTop: number;
  /** The largest span between columns along it, m, and against the rigid length π/2·Lo when the soil states its subgrade modulus. */
  span: number; overhang: number;
  Lo: number | null; rigid: boolean | null;
  /** On springs (GA §14.3), where it is not rigid: the largest settlement, m, and soil pressure, kPa, in service, and the moments, kN·m, factored. */
  winkler?: { y: number; q: number; mBottom: number; mTop: number; vu: number };
}

/** The tie at the first floor that holds a strip along a property line across it, one per column (FIUBA Cim. §6). */
export type GroupTie = TieResult & { column: string };

export interface GroupResult {
  kind: GroupKind; axis?: 'x' | 'y'; reason: FootingGroup['reason'];
  members: string[];
  columns: GroupColumn[];
  strips: GroupStrip[];
  /** A strip footing's bands across under each column. */
  bands: Array<{ column: string; width: number; mu: number; vu: number; asReq: number; asProvided: number; phiMn: number; phiVc: number }>;
  /** The sides held at a property line: −1, 0 or 1 along X and Y. */
  anchor: [number, number];
  /** A strip held along a line: the column ties that take its offset across. */
  ties: GroupTie[];
  /** A strip held along a line: the strap beams that take its offset across instead, one from each column. */
  straps: GroupStrap[];
  ks: number | null;
  /** The minimum steel each direction asks over both faces, and what both give, cm². */
  minSteel: { x: number; y: number; xProvided: number; yProvided: number };
  /** Anchorage of the bars past the outer columns' faces, hooked at the ends. */
  anchorage: { ld: number; available: number; ok: boolean };
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
  /** Service: the strap's pull on the partner, kN, and the partner's permanent load that holds it down. */
  pull?: number; partnerPermanent?: number;
  /** The model's strap member it is, when there is one. */
  group?: number;
  beam?: BeamRow; line?: LineLayout;
  /** On a strip, the row key of the footing (column) it starts from, and where that column stands in plan, m. */
  holder?: string; from?: { x: number; y: number };
}

/** A strap from one column of a strip held along a line to the footing inward. */
export type GroupStrap = StrapResult & { column: string };

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
