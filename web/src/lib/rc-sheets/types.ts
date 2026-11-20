import type { WallReinforcement } from '../design-contract/reinforcement';

export type SheetFamily = 'beam' | 'column' | 'slab' | 'wall' | 'punching';
export const SHEET_FAMILIES: readonly SheetFamily[] = ['beam', 'column', 'slab', 'wall', 'punching'];

export type SheetTab = 'beam' | 'vertical' | 'slab' | 'punching';
export const SHEET_TABS: readonly SheetTab[] = ['beam', 'vertical', 'slab', 'punching'];
export const TAB_FAMILIES: Record<SheetTab, readonly SheetFamily[]> = { beam: ['beam'], vertical: ['column', 'wall'], slab: ['slab'], punching: ['punching'] };
export const tabOf = (f: SheetFamily): SheetTab => (f === 'column' || f === 'wall' ? 'vertical' : f);

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

/** The slabs' meshes when the project states none, mm, and the ranges of the project's lists each family takes its bars from. */
export const SLAB_MESH_DIAMETERS: readonly number[] = [8, 10, 12, 16];
export const SLAB_BAR_RANGE = { min: 6, max: 16 } as const;
export const BEAM_BAR_RANGE = { min: 10, max: 25 } as const;
export const COLUMN_BAR_RANGE = { min: 12, max: 32 } as const;
/** The diameters a project may allow for stirrups, hoops and ties, mm. */
export const TIE_BAR_RANGE = { min: 6, max: 16 } as const;
export const FOOTING_BAR_RANGE = { min: 10, max: 25 } as const;
export const inRange = (dia: number, r: { min: number; max: number }): boolean => dia >= r.min && dia <= r.max;

/** The stirrups, hoops and ties a context may use when it states none, mm. */
export const DEFAULT_TIE_DIAMETERS: readonly number[] = [6, 8, 10, 12];
/** The closest stirrups, hoops and ties are proposed, m, when the project states none: room for the concrete to pass. */
export const DEFAULT_MIN_TIE_SPACING = 0.075;
/** The nominal size of the largest aggregate, mm, when the project states none: the usual 19 mm (3/4"). */
export const DEFAULT_AGGREGATE_MM = 19;
/** The largest aggregate a project may state, mm. */
export const AGGREGATE_RANGE = { min: 6, max: 50 } as const;

export interface TransverseList {
  /** The diameters the project allows for stirrups, hoops and ties, mm. */
  tieDiameters?: readonly number[];
  /** The closest spacing they are proposed at, m. */
  minTieSpacing?: number;
}

export const tieDiametersOf = (c: TransverseList): number[] =>
  [...(c.tieDiameters?.length ? c.tieDiameters : DEFAULT_TIE_DIAMETERS)].sort((p, q) => p - q);

export const tieFloorOf = (c: TransverseList): number => c.minTieSpacing ?? DEFAULT_MIN_TIE_SPACING;

/** The smallest allowed transverse diameter of at least `least` mm; null when the list holds none. */
export const allowedTie = (c: TransverseList, least: number): number | null => tieDiametersOf(c).find((x) => x >= least - 1e-9) ?? null;

/** The next allowed transverse diameter above `dia`, mm; null when there is none. */
export const nextTie = (c: TransverseList, dia: number): number | null => tieDiametersOf(c).find((x) => x > dia + 1e-9) ?? null;

/** The diameters of a list inside a family's range, ascending. */
export const listIn = (list: readonly number[], r: { min: number; max: number }): number[] => list.filter((x) => inRange(x, r)).sort((p, q) => p - q);

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
  /** Rows inside each face, each held off the one outside it by the clear spacing between layers: nx bars on each b face, ny on each h face, in `rows` rows (one when absent). */
  inner?: { nx: number; ny: number; dia: number; rows?: number };
  /** Crossties in the confinement zones of chapter 18 (lo and the joint), `x` holding bars along b and `y` along h, where more than §25.7.2.3's. */
  confined?: { x: number; y: number };
}

export interface SlabAdopted { bottomX: MeshBars; bottomY: MeshBars; topX: MeshBars; topY: MeshBars }

export type WallAdopted = WallReinforcement;

export type Adopted = BeamAdopted | ColumnAdopted | SlabAdopted | WallAdopted | import('./beam-line').LineAdopted | import('./footing-types').FootingAdopted;

export type TorsionMode = 'equilibrium' | 'compatibility';

export type MarkScope = 'element' | 'level' | 'project';
export const MARK_SCOPES: readonly MarkScope[] = ['element', 'level', 'project'];

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
  /** Lines laid out with bent bars or without them whatever `bentBars` says, by line key. */
  bentLines?: Record<string, boolean>;
  /** Slabs whose span bars, every other one, rise over both supports in the level plan. */
  slabBentBars?: boolean;
  /** How the footings are sized: from the loads, never under the modelled footing ('minimum' when absent), or as modelled with only their bars designed. */
  footingSizing?: import('./footing-types').FootingSizing;
  /** The bending schedule: waste on the order (a fraction, 0.1 when absent) and where equal bars share a mark ('element' when absent). */
  schedule?: { waste?: number; scope?: MarkScope };
  /** Adopted bars by row key. */
  adopted: Record<string, Adopted>;
  /** The rows whose bars the engineer set by hand: they stay when the code changes. */
  edited?: string[];
  /** The code the proposals were adopted under: under another, those not edited by hand are designed again. */
  adoptedCode?: SheetCode;
  /** The proposals were adopted with the seismic provisions applying: with them off, or on when this is absent, those not edited by hand are designed again. */
  adoptedSeismic?: true;
  /** The version of the proposals' logic they were adopted under (`RC_SHEETS_LOGIC`): under another, those not edited by hand are designed again. Absent: before any. */
  adoptedLogic?: number;
  /** The design data the proposals were adopted under, as `proposalBasis` writes it: under others, those not edited by hand are designed again. Absent: before any. */
  adoptedBasis?: string;
}

/** The sheets' data as the project stores it: the options the design takes before it starts live in the design data (`design-options.ts`). */
export type StoredRcSheets = Omit<RcSheetsData, 'torsion' | 'faces' | 'flange' | 'seismic' | 'bentBars' | 'slabBentBars'>;

/** Raised whenever what the proposals propose changes, so the proposals adopted before it are proposed again. */
export const RC_SHEETS_LOGIC = 24;

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

/** Below this governing demand-to-capacity ratio a member that verifies reads as generous. */
export const GENEROUS_BELOW = 0.5;

/** The highest demand-to-capacity ratio among the checks that give one. */
export const governingRatio = (checks: readonly CheckLine[]): number =>
  Math.max(0, ...checks.map((c) => c.ratio ?? 0).filter((r) => Number.isFinite(r)));

export const isGenerous = (checks: readonly CheckLine[]): boolean =>
  checks.some((c) => c.ratio !== undefined) && checks.every((c) => c.ok) && governingRatio(checks) < GENEROUS_BELOW;

/** A row whose demand lacks the forces of some combinations fails with them named: what was read from the rest is no verdict. */
export function withMissingForces<R extends { verifications: CheckLine[]; status: RowStatus }>(row: R, missing: readonly string[] | undefined): R {
  if (!missing?.length) return row;
  const checks = (row as { checks?: { ok: boolean } }).checks;
  return {
    ...row,
    verifications: [check('rcSheets.v.forcesMissing', false, { demand: [...new Set(missing)].join(', ') }), ...row.verifications],
    status: 'fail',
    ...(checks ? { checks: { ...checks, ok: false } } : {}),
  };
}
