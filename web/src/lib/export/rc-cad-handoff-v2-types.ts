/**
 * RcCadHandoffV2 — the coordinated footing reinforcement assembly.
 *
 * ── Why a second version rather than a wider V1 ─────────────────────
 *
 * V1 declares, in its own prose and in three separate message keys, that it carries the
 * column-transfer cage and NOT the footing mats. That was true and useful while a footing
 * produced only dowels and starter ties. PR18 made the bottom mat physical steel, and the
 * handoff's subject changed: what a CAD consumer needs is the coordinated assembly — the mats,
 * the starters, the ties that confine them, and the interactions BETWEEN mats and starters,
 * because that is where the constructibility findings live.
 *
 * Widening V1 in place was the alternative and it was rejected. A consumer that already parses
 * V1 has been told the mats are absent; feeding it a V1 document that suddenly contains twenty
 * more bars, in families its enum does not have, would break it in the worst way — silently, by
 * misclassifying steel rather than by failing to parse. So V1 is frozen with its committed
 * fixture as an immutable regression, and this is a new declared version.
 *
 * ── What V2 adds ────────────────────────────────────────────────────
 *
 *   * five reinforcement families instead of two, including the two mat directions and the
 *     crossties the certified column layout earns;
 *   * per-bar and per-family layer, direction and region metadata, so a consumer can tell the
 *     LOWER mat from the UPPER one and a central band from a uniform full-width distribution
 *     without measuring elevations and inferring;
 *   * the resolved physical layer order, once, as a value;
 *   * mat/starter interaction findings IN SCOPE — the four §25.2.3 clear-spacing failures are
 *     the reason the assembly is not constructible, and a document that carried the mats but
 *     dropped the findings about them would be worse than V1.
 *
 * ── What V2 still does not carry, explicitly ────────────────────────
 *
 * Top reinforcement. It is NOT_EVALUATED — nobody has decided whether this footing needs it —
 * and an absent field would read as "none required". It is a named condition instead.
 *
 * Punching with unbalanced moment transfer stays UNSUPPORTED where it applies. Neither
 * limitation is compressed into a single ambiguous status: `statuses` below carries them
 * separately from the constructibility verdict, because "not evaluated", "not implemented" and
 * "evaluated and failed" are three different statements and a consumer acts differently on each.
 *
 * ── Reused types ────────────────────────────────────────────────────
 *
 * Every shared shape — points, frames, notes, clause refs, bodies, interfaces, segments, marks,
 * requirements, checks, findings — is imported from V1's type module UNCHANGED. V2 is a wider
 * document, not a different geometry language, and two spellings of `CadBarSegment` would be two
 * things to keep in step.
 */

import type {
  CadBar, CadCheck, CadClauseRef, CadConcreteBody,
  CadConcreteInterface, CadCoverRequirement, CadClearSpacingRequirement, CadFrame, CadMark,
  CadNote,
} from './rc-cad-handoff-types';
import type { CadFamilyKindV2 } from './rc-cad-families';

export const RC_CAD_HANDOFF_V2_SCHEMA = 'RcCadHandoffV2' as const;
export const RC_CAD_HANDOFF_V2_SCHEMA_VERSION = 2 as const;

/**
 * What this document is an assembly OF.
 *
 * V1's only value is `footingTransferCage`, and it stays that. This is a different subject and
 * says so: a consumer switching on `assembly.kind` must not treat the two as interchangeable.
 */
export type CadAssemblyKindV2 = 'footingReinforcementAssembly';

/**
 * How complete the reinforcement in this document is.
 *
 * V1's `CadAssemblyCompleteness` has two members and neither describes V2: `partialConnectionOnly`
 * understates it — the mats are here — and `completeFootingReinforcement` overstates it, because
 * top reinforcement was never evaluated. So V2 states its own, and states it as the fact it is:
 * the bottom mat and the connection, with the top absent and NOT_EVALUATED beside it.
 */
export type CadAssemblyCompletenessV2 =
  | 'bottomMatAndConnection'
  | 'connectionOnly';

/** Which plan direction a family's bars run in. */
export type CadMatDirection = 'X' | 'Y';

/** Which physical layer of the two-layer bottom mat. */
export type CadMatLayer = 'LOWER' | 'UPPER';

/**
 * How a direction's steel is distributed across the perpendicular dimension.
 *
 * `UNIFORM_FULL_WIDTH` is §13.3.3.2 and §13.3.3.3(a). `CENTRAL_BAND` and `OUTSIDE_BAND` are the
 * two region kinds §13.3.3.3(b) prescribes for the short direction of a rectangular footing.
 * Carried as a value because a consumer cannot recover it from coordinates: a uniform mat and a
 * banded one at the same pitch look identical bar by bar.
 */
export type CadMatRegionKind = 'UNIFORM_FULL_WIDTH' | 'CENTRAL_BAND' | 'OUTSIDE_BAND';

/** One distribution region of one mat direction. */
export interface CadMatRegion {
  kind: CadMatRegionKind;
  /** Bars in this region, by stable id. */
  barIds: string[];
  /** Centre-to-centre pitch, m. */
  spacingCentre: number;
  /** Clear distance between adjacent bars, m. */
  spacingClear: number;
  /** Region width across the distribution, m. */
  width: number;
  /** Region centre offset from the footing centroid, m, along the distribution axis. */
  centreOffset: number;
}

/**
 * The mat metadata a family carries, present only on the two mat families.
 *
 * Elevations are the bar AXIS elevation in model coordinates and the clear cover to the soffit,
 * both measured off the generated geometry rather than recomputed from a nominal cover.
 */
export interface CadMatFamilyDetail {
  direction: CadMatDirection;
  layer: CadMatLayer;
  /** Bar-axis elevation, m, model coordinates. Every bar of one direction shares it. */
  axisElevation: number;
  /** Clear cover from the bar SURFACE to the footing soffit, m. */
  clearCoverToSoffit: number;
  regions: CadMatRegion[];
}

/**
 * The transverse metadata a starter tie or crosstie carries.
 *
 * `legsContributed` is what a schedule needs and what distinguishes the two families
 * numerically: a closed perimeter contributes two legs across the width, a crosstie one.
 */
export interface CadTieFamilyDetail {
  legsContributed: number;
  /** Stations along the lap above the footing, m, ascending. */
  stations: number[];
}

export interface CadReinforcementFamilyV2 {
  familyId: string;
  kind: CadFamilyKindV2;
  /** i18n key naming what the family is FOR. Prose lives in the locale, not here. */
  purposeKey: string;
  barIds: string[];
  clauseRefs?: CadClauseRef[];
  /** Present on `footingBottomMatX` and `footingBottomMatY`, absent otherwise. */
  mat?: CadMatFamilyDetail;
  /** Present on `starterTie` and `starterCrosstie`, absent otherwise. */
  tie?: CadTieFamilyDetail;
}

export interface CadAssemblyV2 {
  kind: CadAssemblyKindV2;
  completeness: CadAssemblyCompletenessV2;
  /** i18n key for the scope sentence. The most load-bearing prose in the document. */
  descriptionKey: string;
  families: CadReinforcementFamilyV2[];
  /**
   * Which mat direction sits in the LOWER physical layer.
   *
   * One value, not two booleans and not a per-family repetition that could disagree with
   * itself. Null when no mat was modelled.
   */
  bottomMatLayerOrder: { lowerDirection: CadMatDirection; resolution: string } | null;
}

/**
 * The statuses a consumer must not collapse.
 *
 * Four independent facts. `constructible: false` because four §25.2.3 clear distances fail;
 * `bottomFlexure` evaluated and modelled; `topReinforcement` never evaluated; punching moment
 * transfer not implemented. Compressing these into one enum is how "not checked" comes to be
 * read as "checked and fine".
 */
export interface CadStatusesV2 {
  /** False when any in-scope constructibility condition fails. Blocks ISSUANCE, not viewing. */
  constructible: boolean;
  /** Condition codes that made it false, for a consumer that wants to branch. */
  constructibilityBlockers: string[];
  /**
   * The production statuses, VERBATIM.
   *
   * Not re-encoded into a local three-value union, which is what a first attempt did and it lost
   * information immediately: the footing record distinguishes an anchorage that was VERIFIED from
   * one that was evaluated and FAILED, and a union of `EVALUATED | NOT_EVALUATED | UNSUPPORTED`
   * cannot say the second. It also silently mapped a missing field to NOT_EVALUATED, which
   * reported "nobody checked" for a mat whose anchorage the record had verified.
   *
   * So these carry the producer's own vocabulary and a consumer switches on it. Adding a state
   * upstream cannot quietly become the wrong state here — at worst it becomes an unrecognised
   * one, which is a condition a consumer can detect.
   */
  bottomFlexure: 'OK' | 'FAILED' | 'UNSUPPORTED' | 'NOT_EVALUATED';
  /** `FootingMatGeometry.status`: whether physical mat bars exist. */
  bottomMatGeometry: 'MODELED' | 'NOT_MODELED' | 'RECONCILIATION_FAILED' | 'NOT_EVALUATED';
  /** `FootingMatAnchorage.outcome`. */
  bottomAnchorage: 'VERIFIED' | 'FAILED' | 'NOT_EVALUATED';
  topReinforcement: 'NOT_EVALUATED';
  punchingMomentTransfer: 'EVALUATED' | 'UNSUPPORTED';
}

export interface RcCadHandoffV2 {
  schema: typeof RC_CAD_HANDOFF_V2_SCHEMA;
  schemaVersion: typeof RC_CAD_HANDOFF_V2_SCHEMA_VERSION;
  generator: { name: string; version: string };
  source?: { gitRevision?: string; branch?: string };
  project?: { id?: string; name?: string };
  subject: {
    kind: 'footing';
    entityId: number;
    name: string;
    nodeId?: number;
    elementIds?: number[];
  };
  assembly: CadAssemblyV2;
  units: { length: 'm'; angle: 'deg'; barDiameter: 'mm'; mass: 'kg' };
  coordinateSystem: { up: 'Z'; handedness: 'right'; origin?: CadFrame };
  revisions: {
    detailing: number;
    demand: number;
    analysis?: number;
    loads?: number;
    regulation?: number;
    design?: number;
    document?: number;
    entity?: number;
  };
  certificate: {
    maturity: string;
    reviewState?: string;
    provisional?: string[];
    verifierId?: string;
    codeId?: string;
    codeEdition?: string;
  };
  statuses: CadStatusesV2;
  concrete: { bodies: CadConcreteBody[]; interfaces: CadConcreteInterface[] };
  reinforcement: { bars: CadBar[]; marks: CadMark[] };
  requirements: {
    cover: CadCoverRequirement[];
    clearSpacing: CadClearSpacingRequirement[];
  };
  checks: CadCheck[];
  assumptions: CadNote[];
  unsupported: CadNote[];
}

// ─── V2 condition codes ──────────────────────────────────────────
//
// New codes, in V2's own module. V1's list is frozen and none of these is added to it.

/** The bottom mat IS modelled as bar geometry and carried in this document. */
export const CODE_V2_BOTTOM_MAT_MODELED = 'FOOTING_BOTTOM_MAT_MODELED';
/** Top reinforcement was never evaluated. Nothing here shows it is unnecessary. */
export const CODE_V2_TOP_NOT_EVALUATED = 'FOOTING_TOP_REINFORCEMENT_NOT_EVALUATED';
/** Punching with unbalanced moment transfer is not implemented. */
export const CODE_V2_PUNCHING_MOMENT_UNSUPPORTED = 'PUNCHING_UNBALANCED_MOMENT_UNSUPPORTED';
/** In-scope §25.2.3 clear-spacing failures between mat and starter steel. */
export const CODE_V2_MAT_STARTER_SPACING = 'MAT_STARTER_CLEAR_SPACING_FAILURE';

// ─── Version dispatch ────────────────────────────────────────────

/** Every schema version a reader in this repository accepts. */
export const SUPPORTED_HANDOFF_VERSIONS = [1, 2] as const;

export type HandoffDispatch =
  | { ok: true; version: 1 }
  | { ok: true; version: 2 }
  | { ok: false; reason: 'MISSING_VERSION' | 'UNSUPPORTED_VERSION' | 'SCHEMA_NAME_MISMATCH'; found?: unknown };

/**
 * Decide which reader a document belongs to, structurally.
 *
 * Rejects rather than guesses, and rejects an unknown FUTURE version explicitly: a V3 document
 * fed to a V2 reader would parse partially and be wrong about the parts it dropped, which is the
 * failure mode versioning exists to prevent. The schema NAME is checked against the version too,
 * so a document claiming `RcCadHandoffV1` with `schemaVersion: 2` is refused instead of being
 * resolved by whichever field the reader happened to trust.
 */
export function dispatchHandoffVersion(doc: unknown): HandoffDispatch {
  if (typeof doc !== 'object' || doc === null) {
    return { ok: false, reason: 'MISSING_VERSION' };
  }
  const d = doc as { schema?: unknown; schemaVersion?: unknown };
  if (typeof d.schemaVersion !== 'number') {
    return { ok: false, reason: 'MISSING_VERSION', found: d.schemaVersion };
  }
  if (d.schemaVersion === 1) {
    if (d.schema !== 'RcCadHandoffV1') {
      return { ok: false, reason: 'SCHEMA_NAME_MISMATCH', found: d.schema };
    }
    return { ok: true, version: 1 };
  }
  if (d.schemaVersion === 2) {
    if (d.schema !== RC_CAD_HANDOFF_V2_SCHEMA) {
      return { ok: false, reason: 'SCHEMA_NAME_MISMATCH', found: d.schema };
    }
    return { ok: true, version: 2 };
  }
  return { ok: false, reason: 'UNSUPPORTED_VERSION', found: d.schemaVersion };
}
