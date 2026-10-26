/**
 * Member checks under codes other than CIRSOC, through the engine's own checkers.
 *
 * The engine carries AISC 360, EN 1993-1-1, ACI 318, EN 1992-1-1, AISI S100 and TMS 402 member
 * checks; the first five are read here. TMS 402 is not: the model has no way to state that a
 * material is masonry (the grade catalogue carries concrete and timber, and a strength under
 * 80 MPa reads as concrete), so there is no member it could honestly be asked about. The app used to call them with one payload for all of them — `{ members: [{ elementId,
 * length, section, material, forces }] }` — which none of them reads, so every call failed to
 * parse and the checks never ran from the app. Each code here builds the input its checker
 * actually declares, in the checker's units (Pa, N, N·m), from data the model holds; a member
 * the model cannot describe for that code is left out with the reason, never filled with a
 * guess.
 */
import type { GoverningDemand } from '../../station-design-forces';
import type { Section, Material, Element } from '../../../store/model.svelte';

export type OtherCodeId = 'aisc360' | 'ec3' | 'aci318' | 'ec2' | 'aisiS100';

export type OtherCodeFamily = 'steel' | 'concrete' | 'coldFormed';

/** One member, as every code reads it. SI: m, kN, kN·m, MPa, as the model stores them. */
export interface MemberContext {
  elementId: number;
  element: Element;
  section: Section;
  material: Material;
  /** How the member sits: a vertical member is a column (or a wall, when the section is slender). */
  kind: 'beam' | 'column' | 'wall';
  /** Buckling length basis and the lateral-torsional unbraced length, m. */
  L: number;
  Lb: number;
  /** Effective-length factors about the strong and weak axes, when the member states them. */
  kStrong?: number;
  kWeak?: number;
  /** The governing demands: each is a full force tuple at one station of one combination. */
  demands: GoverningDemand[];
  /**
   * Every combination at every station, each a full force tuple, with the axial force the
   * member's behaviour excludes left out as `demands` leaves it out. The governing demands are
   * the peak of each force taken one at a time, each with what acts with it; a tuple that is no
   * force's peak (a column's smaller compression with nearly its largest moment) is only here.
   */
  tuples?: StationTuple[];
  /** The clear cover of the member's kind (m), from the project's design data; else the default. */
  cover?: number;
  /** The bar steel's fy (MPa), from the project's design data; else the default. */
  rebarFy?: number;
}

/** One combination at one station: the forces that act together there. */
export type StationTuple = Pick<GoverningDemand, 'comboId' | 'comboName' | 'stationT' | 'stationX' | 'forces'>;

/** What a code's checker returned for one member, read into one shape. */
export interface CheckReading {
  ratio: number;
  /** i18n key of the kind of check that governs (`otherCodes.gov.*`). */
  governing: string;
  /** The clause it comes from, as the code numbers it. */
  clause?: string;
  pass: boolean;
  /** Checks the engine could not evaluate for want of a capacity. */
  unevaluated: string[];
  /** Each check the reading is made of, with its clause and ratio (the code reports them apart). */
  parts?: Array<{ kind: CheckKind; clause: string; ratio: number }>;
  /**
   * The worst of the checks that were evaluated as their clauses write them, over every demand
   * read: the parts a demand's `unevaluated` keys do not disable (`OtherCode.disables`). Only
   * these can settle a member that has something left unevaluated: past 1 it fails by them;
   * otherwise it is not verified.
   */
  accredited?: { ratio: number; governing: string; clause?: string; comboName?: string; stationX?: number };
}

export interface OtherCode {
  id: OtherCodeId;
  family: OtherCodeFamily;
  /** i18n keys. */
  labelKey: string;
  /** What the code covers here, said once when the code is chosen. */
  coverageKey: string;
  /**
   * The member's data for the checker, or why it cannot be described (i18n key). `unevaluated`
   * names checks the code requires of this member and the checker does not make, and marks
   * every reading of it incomplete.
   */
  member(ctx: MemberContext): { data: Record<string, unknown>; unevaluated?: string[] } | { skip: string };
  /**
   * The member's data at one demand, when it depends on where and which way the member bends —
   * reinforced concrete reads the bars in tension at that station. Absent: `member` holds for
   * every demand. A `reading` settles the demand without the engine (no steel on the face in
   * tension); `unevaluated` adds checks this adapter knows the checker leaves out for it.
   */
  at?(ctx: MemberContext, d: StationTuple, data: Record<string, unknown>):
    | { data: Record<string, unknown>; unevaluated?: string[] }
    | { reading: CheckReading };
  /** One demand as the checker's force row. `data` is what `member` returned. */
  forces(ctx: MemberContext, d: StationTuple, data: Record<string, unknown>): Record<string, unknown>;
  /**
   * The engine call. Throws `EngineUnavailableError` when the checker is not loaded and
   * `EngineCheckError` (with the engine's message) when it refused the input.
   */
  run(input: { members: unknown[]; forces: unknown[] }): unknown[];
  read(result: Record<string, unknown>): CheckReading;
  /**
   * The certified version of the check (docs/verification/CERTIFY.md, "Certified design checks"),
   * when the engine has one: its export, and the bound on each force `forces` sends, in the
   * checker's units, from the combination's certified station bound (kN, kN·m) of the member.
   */
  certify?: {
    name: 'certify_steel_members' | 'certify_ec3_members' | 'certify_ec2_members' | 'certify_rc_members';
    bound(ctx: MemberContext, d: GoverningDemand, data: Record<string, unknown>, sb: StationBound3D): DemandBound;
  };
  /** Parts the adapter computes itself, for a demand, besides the checker's (`read`). */
  extraParts?(ctx: MemberContext, d: StationTuple, data: Record<string, unknown>): Array<{ kind: CheckKind; clause: string; ratio: number }>;
  /** Which parts of the reading an `unevaluated` key leaves without a clause behind them. */
  disables?: Readonly<Record<string, readonly CheckKind[]>>;
}

/** A station bound of a certified combination, as `certify_multi_case_3d` returns it. */
export interface StationBound3D { elementId: number; axial: number; shearY: number; shearZ: number; torsion: number; momentY: number; momentZ: number }

/** Bounds on |exact − computed| of the forces sent to a certified checker, its units. */
export interface DemandBound { n: number; my: number; mz: number; vy: number }

/**
 * A member's certified utilization: the exact one lies in [lower, upper] for every governing
 * demand. `ok` when upper < 1, `fail` when lower > 1, `inconclusive` between; `uncertified`
 * with why when no enclosure could be had: an i18n key (`otherCodes.cert.*`, `combo` naming the
 * combination it is about) or the engine's own words.
 */
export type MemberCertificate =
  | { status: 'ok' | 'fail' | 'inconclusive'; lower: number; upper: number }
  | { status: 'uncertified'; reason: string; combo?: string };

/** One member's outcome under a code. */
export type OtherCodeRow =
  | { elementId: number; status: 'checked'; reading: CheckReading; comboName: string; stationX: number; comboId: number; stationT: number }
  | { elementId: number; status: 'skipped'; reasonKey: string };

export interface OtherCodeRun {
  code: OtherCodeId;
  rows: OtherCodeRow[];
  /** Set when the checker itself could not run: no row of this run is verified. */
  errorKey?: string;
  /** The engine's own message for that failure, shown with it. */
  errorMessage?: string;
}

/** The governing check as the panel names it: a kind (i18n) and the code's clause. */
export type CheckKind =
  | 'tension' | 'compression' | 'flexureStrong' | 'flexureWeak' | 'flexure'
  | 'shear' | 'interaction' | 'noTensionSteel';

export const gov = (kind: CheckKind, clause?: string) =>
  ({ governing: `otherCodes.gov.${kind}`, ...(clause ? { clause } : {}) });

/** kN → N, kN·m → N·m, MPa → Pa. */
export const N = 1e3;

/** `bound · k` rounded up past the product's f64 rounding, so a scaled bound stays a bound. */
export const upScaled = (bound: number, k: number) => bound * k * (1 + 4 * Number.EPSILON);
export const PA = 1e6;
