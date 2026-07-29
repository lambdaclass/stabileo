/**
 * The authoritative floor-family design record — the persisted evidence of a real design.
 *
 * ── What was wrong, precisely ──────────────────────────────────────
 *
 * PR18 shipped complete slab, wall and footing ENGINES with a production adapter, and the
 * results lived in `$state` (`lastFloorRun`, `lastFootingRun`). They died on reload. A user
 * could design a floor, close the tab, reopen the project and find the bars still there —
 * persisted on the assembly — with no record of the demands, combinations, ground profile or
 * checks that sized them. The steel outlived its own justification.
 *
 * That is worse than losing both. Bars with no evidence behind them read as a design, and
 * nothing in the app could tell you they were not one.
 *
 * ── What this is, and what it is deliberately not ──────────────────
 *
 * It is ONE immutable, revision-bound record per designed family member, persisted on the
 * same `DetailingAssembly` as the steel it justifies. It carries enough to:
 *
 *   · reconstruct the design result after reload — no transient UI state required;
 *   · verify certificate-to-input agreement, by hash rather than by inspection;
 *   · build the current documents, by projection rather than by recalculation;
 *   · retain superseded documents, because the record they were built from is still here;
 *   · explain the governing demands and the assumptions behind them;
 *   · project physical reinforcement and quantities.
 *
 * It is NOT a second calculation engine. Nothing here computes a demand, a capacity or a
 * bar. Every number is copied from the engine that owns it, and the discriminated union
 * exists so a consumer cannot read a slab field off a footing.
 *
 * It is NOT a document DTO either. A document is a projection OF this; this is the thing
 * that survives, and the document can be rebuilt from it at a later revision.
 *
 * ── Prose is not data ──────────────────────────────────────────────
 *
 * Every human-facing string is an `EngineMessage`. The engines below `codes/` already obey
 * that rule; the records must too, because they reach certificates, reports, drawings and
 * spreadsheets, each with its own locale and its own space budget. A record that stored a
 * Spanish sentence would be a record that cannot be issued in English.
 *
 * Pure: no store, no runes, no i18n, no clock.
 */

import type { ClauseRef, RegulationEdition } from '../../codes/regulation';
import type { Maturity } from '../../codes/maturity';
import type { EngineMessage } from '../../codes/message';
import type { BarPath } from '../../codes/cirsoc201/bar-geometry';
import { stableHash } from '../design/canonical-hash';
import type { CheckStatus } from './foundation-check';
import type { ColumnPosition } from './punching-shear';

export const FAMILY_RECORD_SCHEMA_VERSION = 1;

/** The three families this record covers. Frame members have their own certificate path. */
export type FloorFamily = 'slab' | 'wall' | 'footing';

/**
 * The upstream revisions a record was produced against.
 *
 * All four, separately. A single "version" number cannot distinguish a load change from a
 * regulation change, and the two have different consequences: new loads need a re-solve and
 * a re-design, a new regulation edition needs a re-design against different clauses. An
 * engineer asked to re-issue a drawing is entitled to know which moved.
 */
export interface FamilyRevisionVector {
  /** The analysis/demand revision the design read its results from. */
  analysis: number;
  /** The load and combination revision. */
  loads: number;
  /** The regulation-stack revision. */
  regulation: number;
  /** The owning entity's own revision — per-footing, per-panel — for targeted staleness. */
  entity: number;
}

/**
 * How complete the design of this family member is.
 *
 * Separate from `maturity`, which is about whether a calculation has been validated against
 * an external benchmark. This is about whether it was performed at all. A footing can be
 * `provisional` with every check run (maturity IMPLEMENTED_PROVISIONAL), or `unsupported`
 * because its ground profile states no bearing capacity — and those are different failures
 * with different remedies.
 */
export type FamilyRecordStatus =
  /** Every applicable check ran and passed. */
  | 'supported'
  /** Every applicable check ran; at least one is provisional or failing. */
  | 'provisional'
  /** At least one applicable check could not be performed. `unsupported` says which. */
  | 'unsupported';

/** One check's outcome, in the form a certificate and a report both read. */
export interface FamilyCheckOutcome {
  /** Stable key, e.g. `bearing`, `punching`, `oneWayShear`, `flexure`, `webCrushing`. */
  key: string;
  status: CheckStatus;
  /** Demand/capacity, where the check produces one. Null when it does not. */
  utilization: number | null;
  /** The combination this outcome was governed by, when one governs it. */
  governingCombination: string | null;
  refs: ClauseRef[];
  /** Why the check is unsupported. Empty otherwise. */
  unsupported: EngineMessage[];
}

/**
 * The family certificate: an explicit claim, bound to the inputs that justify it.
 *
 * ── Why frame `membersVerified` is the wrong instrument ─────────────
 *
 * `ConstructibilityFacts.reverifiedMembers` counts FRAME members passed back through the
 * frame verifier at their final effective depth. A slab has no such verifier, no such
 * depth loss and no such certificate. `run-floor-design` therefore passes
 * `membersVerified: false` and means it — and the consequence was that no floor could
 * reach CONSTRUCTIBLE however complete its design.
 *
 * The temptation is to pass `true`. That would satisfy two conditions that nothing
 * measured, on a floor where the frame verifier never ran, which is precisely the
 * false-completeness this chain has spent six sessions removing.
 *
 * So the floor families get their OWN certificate, with their own evidence, and
 * constructibility asks for the certificate that is APPLICABLE rather than for the one
 * frame members happen to use.
 */
export interface FamilyCertificate {
  family: FloorFamily;
  /** The record this certifies. */
  recordId: string;
  ownerId: string;
  ownerElementIds: number[];
  /** Hash of the design INPUT. Different input, void certificate. */
  inputHash: string;
  /** Hash of the owner's geometry. Resizing the member voids the certificate. */
  geometryHash: string;
  revisions: FamilyRevisionVector;
  edition: RegulationEdition;
  /** Every check this certificate stands on, with its status. */
  governingChecks: FamilyCheckOutcome[];
  status: 'CERTIFIED' | 'FAILED' | 'UNSUPPORTED';
  maturity: Maturity;
  assumptions: EngineMessage[];
  /**
   * Hash of the PHYSICAL reinforcement the certificate was issued against.
   *
   * Adding a bar after certification must void it. Without this the certificate is a claim
   * about a cage, issued before the cage was finished, that keeps reading as current.
   */
  reinforcementHash: string;
  /**
   * Hash of the final as-assembled geometry: the bar paths as they exist after
   * coordination moved them.
   *
   * `reinforcementHash` is the DESIGN intent (how many bars, what diameter, what spacing);
   * this is where they ended up. Coordination legitimately moves steel, and a certificate
   * issued against the nominal layout is not a certificate for the moved one.
   */
  finalGeometryHash: string;
}

// ─── Common record fields ────────────────────────────────────────

/**
 * What every family record carries, whatever the family.
 *
 * Timestamps are deliberately ABSENT. The existing revision model is the ordering
 * authority: `FamilyRevisionVector` plus the assembly's `detailingRevision` answer every
 * "is this current?" question, and a wall-clock field would add a second answer that can
 * disagree with the first — plus a clock read inside a pure engine.
 */
export interface FamilyRecordCommon {
  schemaVersion: number;
  /** Stable within a project, derived from family and owner. Survives regeneration. */
  recordId: string;
  family: FloorFamily;
  /** The designed entity's own id, e.g. `F3` for footing 3, `P12` for panel 12. */
  ownerId: string;
  /** Model elements this record is attributed to, for routing conflicts and selection. */
  ownerElementIds: number[];
  /** Hash over the immutable geometry snapshot below. */
  geometryHash: string;
  revisions: FamilyRevisionVector;
  edition: RegulationEdition;
  /** Regulation ids in force, so a record states its stack and not just its edition. */
  regulationIds: string[];
  /** Hash over the resolved materials and configuration (f'c, f_y, cover, bar diameters). */
  materialHash: string;
  /** Hash over the complete design input: geometry, materials, demands, regulation. */
  inputHash: string;
  /** Hash over the design RESULT, so a reload can detect a projection that drifted. */
  resultHash: string;
  /** Hash over the physical reinforcement/assembly this record produced. */
  reinforcementHash: string;
  /** Combination names that governed at least one check, deduplicated, sorted. */
  governingCombinations: string[];
  checks: FamilyCheckOutcome[];
  assumptions: EngineMessage[];
  /** Conditions this record could not cover, each stating what and why. */
  unsupported: EngineMessage[];
  refs: ClauseRef[];
  maturity: Maturity;
  status: FamilyRecordStatus;
  /** Bar path ids this record is responsible for — the physical assembly it produced. */
  barIds: string[];
  /** Mark labels covering those bars, so a schedule row traces to its record. */
  markIds: string[];
  certificate: FamilyCertificate;
}

// ─── Footing ─────────────────────────────────────────────────────

/**
 * The footing's geometry, snapshotted.
 *
 * A snapshot rather than a reference to the live `Footing`, because the record must remain
 * a true statement about what was designed after the entity is edited. The `entityRevision`
 * is what lets staleness be DETECTED; copying the geometry is what lets the superseded
 * document still be rendered.
 */
export interface FootingGeometrySnapshot {
  footingId: number;
  name: string;
  kind: string;
  /** Plan dimensions along the local axes, m. */
  B: number;
  L: number;
  thickness: number;
  rotationDeg: number;
  eccentricityB: number;
  eccentricityL: number;
  cover: number;
  /** Elevation of the underside, m. */
  foundingElevation: number;
  /** Effective depth used by the checks, m. */
  d: number;
  pedestal?: { B: number; L: number; height: number };
}

/** The ground the footing bears on, snapshotted with its provenance. */
export interface GroundSnapshot {
  profileId: number;
  name: string;
  /** Service allowable bearing pressure, kPa. Null when the profile states none. */
  allowableBearingKPa: number | null;
  unitWeightKNm3: number | null;
  subgradeModulusKNm3: number | null;
  groundwaterDepthM: number | null;
  /**
   * Where the bearing value came from.
   *
   * Carried into every document, because bearing pressure has NO regulatory source: it
   * comes from a geotechnical study, and an assumed value must stay visibly assumed on
   * every drawing that relies on it.
   */
  source: string;
  reference: string;
  /** Hash of the above, so editing the stratum is detectable. */
  hash: string;
}

/** The reaction the footing was designed for. */
export interface FootingDemandSnapshot {
  nodeId: number;
  /** The governing strength combination's name, and its reaction. */
  governingCombination: string;
  factoredAxial: number;
  /** Service reaction used for bearing, and how it was assembled. */
  serviceAxial: number;
  serviceMomentB: number;
  serviceMomentL: number;
  /** Load-case types summed at unit factors for the service reaction. */
  serviceCaseTypes: string[];
  /** Every strength combination considered, so the choice of governing is auditable. */
  considered: Array<{ combinationName: string; fz: number; mx: number; my: number }>;
}

export interface FootingDesignRecord extends FamilyRecordCommon {
  family: 'footing';
  geometry: FootingGeometrySnapshot;
  /** The support and the column above it. */
  support: {
    nodeId: number;
    columnElementId: number | null;
    columnB: number | null;
    columnH: number | null;
  };
  /**
   * The ground, and the demand.
   *
   * Null throughout means NOT RESOLVED, never zero. A footing whose stratum states no
   * allowable pressure, or whose node carries no reaction, still gets a record — the
   * document has to be able to name every modelled footing and say why this one is not
   * verified — and that record must not carry a fabricated 0 kPa or 0 kN, which would read
   * as a design against no soil and no load. `unsupported` says which field is missing and
   * the certificate's status is UNSUPPORTED, so readiness is blocked rather than skipped.
   */
  ground: GroundSnapshot | null;
  demand: FootingDemandSnapshot | null;
  /** Contact pressure and eccentricity. Null when bearing could not be evaluated. */
  bearing: {
    status: CheckStatus;
    qMax: number;
    qMin: number;
    eB: number;
    eL: number;
    /** True when the resultant leaves the kern and the base partially lifts. */
    uplift: boolean;
    allowable: number;
    utilization: number;
  } | null;
  /** Factored moment at the column face, §13.2.7. */
  flexure: { status: CheckStatus; Mu: number; criticalSection: number } | null;
  oneWayShear: { status: CheckStatus; Vu: number; phiVc: number; utilization: number } | null;
  punching: {
    status: CheckStatus;
    position: ColumnPosition | null;
    /** How many critical-perimeter faces reach the footing edge. */
    truncatedSides: number;
    Vu: number;
    phiVc: number;
    utilization: number;
    /** Per-combination equilibrium residual of the free body, kN. */
    equilibriumResidual: number | null;
  } | null;
  /** Column starters into the footing. */
  dowels: {
    count: number;
    diameterMm: number;
    /** Development required in the footing, m, and the lap above it. */
    ldFooting: number;
    lapAbove: number;
    /** True when the straight length does not fit and the bar turns 90°. */
    hooked: boolean;
    barIds: string[];
  } | null;
  /** Ties restraining the starter cage over the lap, §10.7.6.1.1. */
  starterTies: { pieces: number; diameterMm: number; barIds: string[] } | null;
}

// ─── Slab ────────────────────────────────────────────────────────

export interface SlabGeometrySnapshot {
  panelId: string;
  /** Plan origin of the panel's lower-left corner. */
  origin: { x: number; y: number; z: number };
  lx: number;
  ly: number;
  thickness: number;
  cover: number;
  /** How many edges are held by another shell or a support. */
  supportedSides: number;
  /** `oneWay` or `twoWay`, as the design engine decided it. */
  behaviour: string;
}

/**
 * The raw plate moments the design read, and what Wood-Armer made of them.
 *
 * `mxy` is the field that gets discarded by naive slab design, and discarding it
 * under-reinforces a panel with any twist in it. Both the raw triple and the transformed
 * demands are recorded, because a reviewer has to be able to check the transformation
 * rather than take it on trust.
 */
export interface SlabDemandSnapshot {
  /** Where in the panel the demand was read: the shell element that produced it. */
  region: string;
  elementId: number;
  /** Raw plate moments, kN·m/m, as the solver reported them. */
  mx: number;
  my: number;
  mxy: number;
  /** Wood-Armer design moments, kN·m/m. Top faces carry the negative pair. */
  woodArmer: {
    mxBottom: number;
    myBottom: number;
    mxTop: number;
    myTop: number;
  };
  governingCombination: string | null;
  /** Factored area load on this region, kPa, integrated from its own surface loads. */
  qu: number;
}

export interface SlabReinforcementRegion {
  face: 'top' | 'bottom';
  direction: 'x' | 'y';
  diameterMm: number;
  /** Bar spacing, m. */
  spacing: number;
  /** Steel area provided, mm²/m, and the area required. */
  asProvided: number;
  asRequired: number;
  /** Which rule set the amount: `flexure`, `minimum`, `shrinkage`, `spacing`. */
  governedBy: string;
  barIds: string[];
}

export interface SlabDesignRecord extends FamilyRecordCommon {
  family: 'slab';
  geometry: SlabGeometrySnapshot;
  demands: SlabDemandSnapshot[];
  reinforcement: SlabReinforcementRegion[];
  oneWayShear: {
    status: CheckStatus;
    Vu: number;
    phiVc: number;
    utilization: number;
  } | null;
  /**
   * Punching at each column supported by this panel.
   *
   * A list because one panel can carry several columns, and one unverifiable column must
   * not make the panel's whole family unsupported. Empty when the panel supports none.
   */
  punching: Array<{
    /** The column whose joint this is. */
    columnElementId: number;
    nodeId: number;
    status: CheckStatus;
    position: ColumnPosition | null;
    truncatedSides: number;
    Vu: number;
    phiVc: number;
    utilization: number;
    /** Change in column axial force across the slab joint, kN — the demand's derivation. */
    axialAbove: number;
    axialBelow: number;
    equilibriumResidual: number | null;
    governingCombination: string | null;
    unsupported: EngineMessage[];
    /**
     * ── Everything below is OPTIONAL, and that is a statement about history ──────
     *
     * A record persisted before the slab–column collector existed carries the fields above
     * and nothing more, because that is all anybody measured: its punching entries were
     * UNSUPPORTED with a named reason. Making these fields required would either invalidate
     * those records or force the migration to synthesise evidence for a check that was never
     * run — and a fabricated free body is exactly what this record type exists to make
     * impossible. So they are absent on an old record and present on a new one, and a
     * consumer that finds them absent prints an em dash rather than a zero.
     */
    /** Source column elements below and above the joint. Null where the free body is open. */
    elementBelow?: number | null;
    elementAbove?: number | null;
    /**
     * Plan position of the joint, m — where the control perimeter is drawn.
     *
     * A perimeter length with no location cannot be drawn, and a drawing that placed the
     * perimeter by guessing would put the right length in the wrong place.
     */
    at?: { x: number; y: number };
    /** Total interior angle of slab meeting the joint, degrees — how the position was measured. */
    coverageDeg?: number;
    /** Bearing of the free edge the perimeter is truncated at, degrees CCW from +x. */
    openBearingDeg?: number | null;
    /** The critical perimeter the check was run on. */
    perimeter?: {
      bo: number;
      beta: number;
      d: number;
      enclosedArea: number;
      halfX: number;
      halfY: number;
    } | null;
    /** Every combination CONSIDERED, so the governing choice is auditable. */
    contributions?: Array<{
      combinationId: number;
      combinationName: string;
      axialBelow: number | null;
      axialAbove: number | null;
      axialStep: number;
      directlyDelivered: number;
      loadInsidePerimeter: number;
      unbalancedMoment: number;
      Vu: number;
      utilization: number;
      status: CheckStatus;
      equilibriumResidual: number;
      residualDenominator: number;
    }>;
    /** What the residual was measured against, kN, and the relative threshold it had to meet. */
    residualDenominator?: number;
    residualThreshold?: number;
    maturity?: Maturity;
    assumptions?: EngineMessage[];
    refs?: ClauseRef[];
  }>;
}

// ─── Wall ────────────────────────────────────────────────────────

export interface WallGeometrySnapshot {
  wallId: string;
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
  /** Plan length and storey height, m. */
  length: number;
  height: number;
  thickness: number;
  cover: number;
  /** True once the thickness passes the two-curtain threshold, §11.7.2.3. */
  twoCurtains: boolean;
}

export interface WallDemandSnapshot {
  elementId: number;
  /** Membrane stresses the design read, kPa. */
  sigmaXx: number;
  sigmaYy: number;
  tauXy: number;
  /** Resolved in-plane demands, kN and kN·m. */
  pu: number;
  muInPlane: number;
  vuInPlane: number;
  governingCombination: string | null;
  /**
   * True when `muInPlane` came from the membrane field rather than from element forces.
   *
   * A membrane-only resolution gives zero in-plane moment, which is not a wall's real
   * demand. Recorded rather than hidden, because a wall designed for no moment is a wall
   * whose flexural steel means nothing.
   */
  fromMembraneOnly: boolean;
}

export interface WallDesignRecord extends FamilyRecordCommon {
  family: 'wall';
  geometry: WallGeometrySnapshot;
  demands: WallDemandSnapshot[];
  axialFlexure: {
    status: CheckStatus;
    pu: number;
    /** Approximate moment capacity at the applied axial load, kN·m. */
    phiMn: number;
    utilization: number;
  };
  inPlaneShear: {
    status: CheckStatus;
    Vu: number;
    phiVn: number;
    utilization: number;
    /** §11.5.4.6 web-crushing ceiling, kN, and whether it governs. */
    webCrushingLimit: number;
    webCrushingGoverns: boolean;
  };
  /** Distributed reinforcement in both directions, §11.6.1. */
  reinforcement: {
    verticalDiameterMm: number;
    verticalSpacing: number;
    horizontalDiameterMm: number;
    horizontalSpacing: number;
    rhoVertical: number;
    rhoHorizontal: number;
    /** Which rule set each ratio. */
    verticalGovernedBy: string;
    horizontalGovernedBy: string;
    curtains: number;
    barIds: string[];
  };
  /**
   * Boundary-element outcome.
   *
   * `required: false` with a stated reason is a result; `null` means the question was not
   * asked, which is a different thing and must read differently.
   */
  boundaryElement: {
    required: boolean;
    /** Why — the trigger that fired, or the one that did not. */
    reason: EngineMessage;
    /** Detailing, when required and implemented. Null when required and NOT implemented. */
    detailing: { lengthM: number; barIds: string[] } | null;
  } | null;
}

// ─── The union ───────────────────────────────────────────────────

export type FloorFamilyDesignRecord =
  | SlabDesignRecord
  | WallDesignRecord
  | FootingDesignRecord;

/** Narrowing helpers, so a consumer never reads a slab field off a footing. */
export function isFootingRecord(r: FloorFamilyDesignRecord): r is FootingDesignRecord {
  return r.family === 'footing';
}
export function isSlabRecord(r: FloorFamilyDesignRecord): r is SlabDesignRecord {
  return r.family === 'slab';
}
export function isWallRecord(r: FloorFamilyDesignRecord): r is WallDesignRecord {
  return r.family === 'wall';
}

// ─── Hashing and identity ────────────────────────────────────────

/** The record id. Stable across regeneration so a document series can follow it. */
export function familyRecordId(family: FloorFamily, ownerId: string): string {
  return `${family}:${ownerId}`;
}

/**
 * Hash the physical reinforcement a record produced.
 *
 * Over the FABRICATION identity of each bar — diameter, cutting length, role, shape — not
 * over its object graph. Two runs that produce the same cage must agree, and a run that
 * adds one bar must not.
 */
export function reinforcementHashOf(bars: readonly BarPath[]): string {
  return stableHash(
    [...bars]
      .map((b) => ({
        id: b.id,
        d: b.diameterMm,
        len: b.cuttingLength,
        role: b.role,
        segments: b.segments.length,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
}

/**
 * Hash the final AS-ASSEMBLED geometry: where each bar actually ended up.
 *
 * Distinct from `reinforcementHashOf`, which is about what was specified. Coordination
 * moves steel — that is its job — and a certificate issued against the nominal layout is
 * not a certificate for the moved one.
 */
export function finalGeometryHashOf(bars: readonly BarPath[]): string {
  return stableHash(
    [...bars]
      .map((b) => ({
        id: b.id,
        d: b.diameterMm,
        pts: b.segments.flatMap((s) => [s.start.x, s.start.y, s.start.z,
          s.end.x, s.end.y, s.end.z]),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
}

/** Hash any input/geometry/result payload. One implementation, shared with rebar hashing. */
export function familyHash(payload: unknown): string {
  return stableHash(payload);
}

// ─── Freshness ───────────────────────────────────────────────────

/**
 * Why a certificate does not apply to the current state.
 *
 * Enumerated rather than boolean, because the remedies differ: a stale analysis needs a
 * re-solve, a geometry mismatch needs a re-design, and reinforcement added after
 * certification needs the certificate reissued. `fresh` is the only value that permits a
 * readiness claim.
 */
export type CertificateFreshness =
  | 'fresh'
  /** The certificate does not exist for an applicable family member. */
  | 'missing'
  /** An upstream revision has moved on. */
  | 'staleRevision'
  /** The input or geometry hash no longer matches. */
  | 'geometryMismatch'
  /** The steel in the model is not the steel the certificate was issued against. */
  | 'reinforcementMismatch'
  /**
   * The certificate records a design that FAILED a check it performed.
   *
   * Kept distinct from `designUnsupported` because the two mean opposite things about the
   * member. A failed check is a verdict — this footing is too small — and the member is not
   * verified. An unsupported check is the ABSENCE of a verdict, and the member may well be
   * fine. Collapsing them would make a wall whose boundary element is unimplemented read as
   * a wall that failed, which sends an engineer to resize something that never got checked.
   */
  | 'designFailed'
  /** The certificate records a check that could not be performed. */
  | 'designUnsupported';

export interface FreshnessInput {
  certificate: FamilyCertificate;
  /** The revision vector as it stands NOW. */
  current: FamilyRevisionVector;
  /** Hashes recomputed from what is in the model now. */
  currentGeometryHash: string;
  currentInputHash: string;
  currentReinforcementHash: string;
  currentFinalGeometryHash: string;
}

/**
 * Does this certificate still describe what is in the model?
 *
 * Deliberately pessimistic and ordered: the FIRST failing test is reported, because that is
 * the one the engineer must act on, and a list of five consequences of one edit is noise.
 * An empty hash on either side is NOT a match — silence is not agreement, which is the same
 * rule the frame certificates follow.
 */
export function certificateFreshness(input: FreshnessInput): CertificateFreshness {
  const c = input.certificate;
  if (c.status === 'FAILED') return 'designFailed';
  if (c.status === 'UNSUPPORTED') return 'designUnsupported';

  if (c.revisions.analysis !== input.current.analysis
    || c.revisions.loads !== input.current.loads
    || c.revisions.regulation !== input.current.regulation
    || c.revisions.entity !== input.current.entity) {
    return 'staleRevision';
  }

  const agree = (a: string, b: string) => a !== '' && b !== '' && a === b;
  if (!agree(c.geometryHash, input.currentGeometryHash)
    || !agree(c.inputHash, input.currentInputHash)) {
    return 'geometryMismatch';
  }
  if (!agree(c.reinforcementHash, input.currentReinforcementHash)
    || !agree(c.finalGeometryHash, input.currentFinalGeometryHash)) {
    return 'reinforcementMismatch';
  }
  return 'fresh';
}

/**
 * Roll a record's checks up into a certificate status.
 *
 * UNSUPPORTED beats FAILED beats CERTIFIED. A design with one uncheckable condition is not
 * a failed design — it is an incomplete one, and telling an engineer their footing failed
 * when it was never checked sends them to resize something that may be fine.
 */
export function certificateStatusFor(
  checks: readonly FamilyCheckOutcome[],
): FamilyCertificate['status'] {
  if (checks.length === 0) return 'UNSUPPORTED';
  if (checks.some((c) => c.status === 'UNSUPPORTED')) return 'UNSUPPORTED';
  if (checks.some((c) => c.status === 'FAIL')) return 'FAILED';
  return 'CERTIFIED';
}

/** The record status implied by its checks, in the same spirit. */
export function recordStatusFor(
  checks: readonly FamilyCheckOutcome[], maturity: Maturity,
): FamilyRecordStatus {
  const s = certificateStatusFor(checks);
  if (s === 'UNSUPPORTED') return 'unsupported';
  if (s === 'FAILED') return 'provisional';
  return maturity === 'VALIDATED' ? 'supported' : 'provisional';
}

/**
 * Issue a certificate for a record.
 *
 * Takes the record's own hashes rather than recomputing them, so the certificate cannot
 * disagree with the record it certifies — the failure mode a second derivation always
 * eventually produces.
 */
export function issueFamilyCertificate(input: {
  family: FloorFamily;
  recordId: string;
  ownerId: string;
  ownerElementIds: readonly number[];
  inputHash: string;
  geometryHash: string;
  revisions: FamilyRevisionVector;
  edition: RegulationEdition;
  checks: readonly FamilyCheckOutcome[];
  maturity: Maturity;
  assumptions: readonly EngineMessage[];
  bars: readonly BarPath[];
}): FamilyCertificate {
  return {
    family: input.family,
    recordId: input.recordId,
    ownerId: input.ownerId,
    ownerElementIds: [...input.ownerElementIds],
    inputHash: input.inputHash,
    geometryHash: input.geometryHash,
    revisions: { ...input.revisions },
    edition: input.edition,
    governingChecks: input.checks.map((c) => ({ ...c })),
    status: certificateStatusFor(input.checks),
    maturity: input.maturity,
    assumptions: [...input.assumptions],
    reinforcementHash: reinforcementHashOf(input.bars),
    finalGeometryHash: finalGeometryHashOf(input.bars),
  };
}

/**
 * A record before its steel exists.
 *
 * The design engines run BEFORE the bars are generated — they are what decide how many bars
 * there are — so the four bar-dependent fields cannot be filled by the producer. A draft is
 * the honest intermediate: everything the design established, and nothing about a cage that
 * has not been built yet.
 *
 * This is why there is no path that issues a certificate without a cage. The certificate is
 * created by `completeFamilyRecord` alone, at the one point where both the design and the
 * physical bars are in hand, from the record's own hashes.
 */
export type FamilyRecordDraft<T extends FloorFamilyDesignRecord> =
  Omit<T, 'barIds' | 'markIds' | 'reinforcementHash' | 'certificate'>;

/**
 * Complete a draft against the physical reinforcement it produced, and certify it.
 *
 * `bars` must be exactly the paths this record is responsible for — not the whole
 * assembly's. The certificate binds to their fabrication identity and their final
 * positions, so passing the floor's entire cage would produce a certificate that is voided
 * by an edit to an unrelated panel.
 */
export function completeFamilyRecord<T extends FloorFamilyDesignRecord>(
  draft: FamilyRecordDraft<T>,
  bars: readonly BarPath[],
  markIds: readonly string[],
): T {
  const barIds = [...bars.map((b) => b.id)].sort();
  const certificate = issueFamilyCertificate({
    family: draft.family,
    recordId: draft.recordId,
    ownerId: draft.ownerId,
    ownerElementIds: draft.ownerElementIds,
    inputHash: draft.inputHash,
    geometryHash: draft.geometryHash,
    revisions: draft.revisions,
    edition: draft.edition,
    checks: draft.checks,
    maturity: draft.maturity,
    assumptions: draft.assumptions,
    bars,
  });
  return {
    ...draft,
    barIds,
    markIds: [...markIds].sort(),
    reinforcementHash: certificate.reinforcementHash,
    certificate,
  } as T;
}

// ─── Applicability, for the constructibility gate ─────────────────

/**
 * What one family requires of an assembly, measured.
 *
 * `applicable: 0` is a MEASUREMENT, not a pass by omission. A beam floor has no slabs, and
 * "no applicable slab" must be distinguishable from "slabs present, none certified" — the
 * old gate could not tell those apart because it compared undefined counts.
 */
export interface FamilyRequirement {
  family: FloorFamily;
  /** Owners of this family present in the assembly. */
  applicable: number;
  /** Owners with a certificate that is `fresh`. */
  certified: number;
  /** Owners with no certificate at all. */
  missing: number;
  /** Owners whose certificate exists but does not apply, by reason. */
  stale: number;
  mismatched: number;
  /** Owners whose design FAILED a check it performed. Not verified. */
  failed: number;
  /** Owners whose design has a check that could not be performed. Verdict absent. */
  unsupported: number;
}

export function emptyRequirement(family: FloorFamily): FamilyRequirement {
  return {
    family, applicable: 0, certified: 0, missing: 0, stale: 0, mismatched: 0,
    failed: 0, unsupported: 0,
  };
}

/**
 * The measured statement "this assembly contains no floor families".
 *
 * What a beam line and a column stack pass. It is a MEASUREMENT — three requirements, each
 * with `applicable: 0` — and not an omission, which is the whole reason
 * `ConstructibilityFacts.familyRequirements` is a required field: an absent count reads as
 * satisfied to one gate and as failing to another, and this one has been broken in both
 * directions by exactly that ambiguity.
 */
export function noFloorFamilies(): FamilyRequirement[] {
  return [emptyRequirement('slab'), emptyRequirement('wall'), emptyRequirement('footing')];
}

/**
 * Tally the certificate evidence for one family.
 *
 * The freshness verdict per owner is supplied by the caller, because deciding it needs the
 * CURRENT model state and this module is pure. What happens here is only the counting, and
 * it is here so that every caller counts the same way.
 */
export function tallyRequirement(
  family: FloorFamily,
  verdicts: readonly (CertificateFreshness | 'absent')[],
): FamilyRequirement {
  const r = emptyRequirement(family);
  r.applicable = verdicts.length;
  for (const v of verdicts) {
    switch (v) {
      case 'fresh': r.certified++; break;
      case 'absent':
      case 'missing': r.missing++; break;
      case 'staleRevision': r.stale++; break;
      case 'geometryMismatch':
      case 'reinforcementMismatch': r.mismatched++; break;
      case 'designFailed': r.failed++; break;
      case 'designUnsupported': r.unsupported++; break;
    }
  }
  return r;
}

/**
 * True when every applicable owner of every family carries a certificate that APPLIES.
 *
 * The conjunction of both gate conditions below, for a caller that needs the single answer.
 * The gate itself asks the two questions separately, because they have different remedies.
 */
export function allFamiliesCertified(rs: readonly FamilyRequirement[]): boolean {
  return familyCertificateMissing(rs) === 0 && familyCertificateStale(rs) === 0;
}

/**
 * True when every applicable family member passed the checks that were PERFORMED.
 *
 * ── Why this is not `allFamiliesCertified` ──────────────────────────
 *
 * This answers the question the assembly state ladder asks first: "did every member pass its
 * own code checks?" A member with an unimplemented check has not FAILED it — a wall whose
 * boundary element is 103-II work is not a wall that is too thin — so it counts as verified
 * here and is capped at COORDINATED by its unsupported conditions instead. Treating the two
 * alike would drop such a floor to DRAFT and report an absent verdict as a negative one.
 *
 * A MISSING record is different again: steel with no design evidence behind it has not been
 * verified in any sense, and it is counted here.
 */
export function familyDesignsPass(rs: readonly FamilyRequirement[]): boolean {
  return rs.every((r) => r.missing === 0 && r.failed === 0);
}

/**
 * How many applicable owners have NO certificate at all.
 *
 * ── Why this is not "applicable minus certified" ────────────────────
 *
 * Because that number also counts the owners whose certificate exists and does not apply,
 * and those are a different failure with a different remedy: issue versus reissue. Counting
 * them once here and once in `familyCertificateStale` would make the two gate conditions
 * overlap, so a single stale certificate would report two blocking conditions and an
 * engineer would have to work out that they are one problem.
 *
 * The two counts partition the shortfall exactly:
 * `applicable = certified + missing + stale + mismatched + notCertified`.
 */
export function familyCertificateMissing(rs: readonly FamilyRequirement[]): number {
  return rs.reduce((n, r) => n + r.missing, 0);
}

/** How many carry a certificate that exists but does not apply to the current state. */
export function familyCertificateStale(rs: readonly FamilyRequirement[]): number {
  return rs.reduce((n, r) => n + r.stale + r.mismatched + r.failed + r.unsupported, 0);
}
