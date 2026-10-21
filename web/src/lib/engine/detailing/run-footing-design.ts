/**
 * The production path from a modelled footing to a checked, detailed footing.
 *
 * To foundations what `run-floor-design.ts` is to slabs and walls: it reads what the model
 * and the solver already hold, and calls `checkFooting` — which has been complete and
 * unit-tested since PR18 opened with no caller outside its own tests.
 *
 * ── What the demand is made of ──────────────────────────────────
 *
 * Strength checks (one-way shear, punching, flexure) take the GOVERNING strength
 * combination's reaction: real per-combination solver output, chosen by the largest
 * vertical, with the combination named in the result so the certificate can state it.
 *
 * Bearing is a SERVICE-level comparison (§13.3.1), and the app has no service-combination
 * concept — every stored combination is a strength combination. So the service reaction is
 * summed from the PER-CASE reactions at unit factors, over gravity cases only, and that
 * choice is reported as an assumption rather than applied silently. Wind and seismic cases
 * are excluded, because a service wind combination has its own factors that this project
 * does not model; a footing whose bearing would be governed by them says so instead of
 * being checked against an incomplete sum. With no per-case results at all, bearing is
 * UNSUPPORTED — it is not approximated from the factored reaction by dividing by a guessed
 * 1,4.
 *
 * ── The gate ────────────────────────────────────────────────────
 *
 * A footing cannot be reported as verified without its inputs. Missing soil, missing
 * reaction, invalid geometry and an unsupported footing kind each produce an outcome with
 * `check: null` and a named reason. `checkFooting` itself already rolls any unsupported
 * constituent up to UNSUPPORTED, so a footing whose punching could not be checked never
 * reads as OK.
 *
 * Pure: no store, no runes. Forces kN, moments kN·m, lengths m, pressures kPa.
 */

import { strapAdjust } from '../foundation/strap-footing';
import { GRAVITY_CASES, LATERAL_CASES, serviceGravity } from './service-reaction';
import { msg, type EngineMessage } from '../../codes/message';
import type { ClauseRef, RegulationEdition } from '../../codes/regulation';
import type { Maturity } from '../../codes/maturity';
import { deriveDevelopment, deriveHookedDevelopment, type DevelopmentResult, type HookedDevelopmentResult } from '../../codes/cirsoc201/anchorage';
import {
  footingEffectiveDepth, validateFooting, type Footing, type FootingMatPreferences,
} from '../../model/footing';
import { designFootingMat, type FootingMatDesign } from './footing-flexure';
import {
  generateFootingMat, type FootingMatGeometry, type FootingMatPlacement,
} from './footing-mat-geometry';
import {
  verifyFootingMatAnchorage, type FootingMatAnchorage,
} from './footing-mat-anchorage';
import { nextDetailingRevision } from './assembly';
import { minClearSpacingInLayer } from '../../codes/cirsoc201/spacing';
import type { BarPath } from '../../codes/cirsoc201/bar-geometry';
import {
  findProfile, geotechnicalAssumptions, type ProjectGeotechnical,
} from '../../model/geotechnical';
import { checkFooting, type FootingCheck, type FootingInput } from './foundation-check';
import type { ColumnPosition } from './punching-shear';
import type { DowelInput } from './floor-design';
import {
  deepestStarterSeat, dowelMatSupportFrom, starterNeedsHook,
} from './footing-dowel-cage';
import {
  familyHash, familyRecordId,
  type FamilyCheckOutcome, type FamilyRecordDraft, type FamilyRevisionVector,
  type FootingDemandSnapshot, type FootingDesignRecord, type FootingGeometrySnapshot,
  type GroundSnapshot,
  FAMILY_RECORD_SCHEMA_VERSION, recordStatusFor,
} from './family-record';
import type { SoilProfile } from '../../model/geotechnical';
import { runGeneralFooting, type GeneralFootingDesign } from './run-general-footing';
import { pileCapacity } from '../../model/foundation/piles';

export interface FootingNode { x: number; y: number; z?: number }

/** The column a footing supports, when the model identifies one. */
export interface FootingColumn {
  elementId: number;
  /** Section plan dimensions, m. */
  b: number;
  h: number;
  /** Longitudinal bars, for dowel sizing. */
  bars?: { count: number; diameterMm: number };
  tieDiaMm?: number;
}

/** One combination's reaction at a node. */
export interface CombinationReaction {
  combinationId: number;
  combinationName: string;
  /** Vertical reaction, kN. Sign as the solver reports it. */
  fz: number;
  /** Reaction moments about the global X and Y axes, kN·m. */
  mx: number;
  my: number;
}

/** One load case's reaction at a node, for the service sum. */
export interface CaseReaction {
  caseId: number;
  /** 'D' | 'L' | 'W' | 'E' | … as the project's load cases declare. */
  caseType: string;
  fz: number;
  mx: number;
  my: number;
}

export interface NodeReactions {
  factored: readonly CombinationReaction[];
  /** Absent when the project was solved without per-case results. */
  cases?: readonly CaseReaction[];
}

export interface RunFootingDesignInput {
  footings: readonly Footing[];
  geotechnical: ProjectGeotechnical | undefined;
  nodes: ReadonlyMap<number, FootingNode>;
  /** Columns by element id, for the punching perimeter and the dowels. */
  columns: ReadonlyMap<number, FootingColumn>;
  /** The column on any supported node: a combined footing's other columns. */
  columnAt?: (nodeId: number) => FootingColumn | undefined;
  /** Wall thickness by wall group, for strip footings, m. */
  wallThickness?: ReadonlyMap<number, number>;
  reactions: ReadonlyMap<number, NodeReactions>;
  /** Project-resolved concrete strength, MPa. */
  fc: number;
  /** Reinforcement yield strength, MPa. */
  fy: number;
  edition: RegulationEdition;
  /**
   * The project's bottom-mat preferences — the diameters that set the effective depths.
   *
   * This replaces a `barDiameterMm: number` that the store filled from a private
   * `DEFAULT_FOOTING_BAR_DIA_MM = 16` constant. That number set the effective depth of every
   * footing check in the project and no user could see it, let alone change it, which made it
   * indistinguishable from a designed result. It is now a persisted, visible, editable project
   * preference, and it is stated as one.
   *
   * The two diameters are separate because the two mat directions are: each direction's bars
   * sit at their own depth and are designed at it.
   */
  matPreferences: FootingMatPreferences;
  /**
   * Maximum nominal coarse-aggregate size, mm — §25.2.1's `(4/3) d_agg` term.
   *
   * Required rather than defaulted. The store already resolves it from the materials in use,
   * and quietly assuming 20 mm here would put a second, invisible aggregate size in the
   * project next to the provenanced one the reports quote.
   */
  maxAggregateSizeMm: number;
  /**
   * The upstream revisions this run is reading.
   *
   * Required, not defaulted. A record whose revision vector was invented cannot detect its
   * own staleness, and a certificate that cannot go stale is the exact failure the revision
   * graph exists to prevent — PR18 already found one instance of it, where a certificate
   * stamped at analysis 6 compared as FRESH against an empty vector.
   *
   * The footing's OWN revision is not here: it is per-footing and read off each entity.
   */
  revisions: Omit<FamilyRevisionVector, 'entity'>;
  /** Regulation ids in force, so a record states its stack and not only its edition. */
  regulationIds: readonly string[];
  /**
   * The detailing revision this run supersedes, so a generated bar can state which revision
   * it belongs to.
   *
   * Optional, defaulting through `nextDetailingRevision` to revision 1 — the same value
   * `buildFloorAssembly` gives an assembly with no predecessor, and through the same function
   * so the bar and the assembly holding it cannot end up one apart.
   */
  previousDetailingRevision?: number;
}

/** What `buildFloorAssembly` consumes for one footing. */
export interface FootingAssemblyEntry {
  id: string;
  check: FootingCheck;
  elementIds: number[];
  dowels?: DowelInput;
  /**
   * The PHYSICAL bottom mat, ready to join the assembly.
   *
   * Generated here rather than in `buildFloorAssembly`, unlike the dowels. The dowels are a
   * function of the column and the footing and nothing else, so the assembly can build them
   * from a `DowelInput`. The mat is a function of the DESIGN — its regions, counts, spacings
   * and resolved layer elevations — and the design lives here. Passing the design across so
   * the assembly could re-place it would put the one authority on one side of the boundary and
   * its consumer on the other, and the record would be sealed before its own geometry existed.
   *
   * Empty (not absent) when no mat could be modelled: the geometry object on the record says
   * which of the reasons it was.
   */
  matBars: BarPath[];
  /**
   * The design evidence, complete except for the bars it has not generated yet.
   *
   * Travels ON the assembly entry so that `buildFloorAssembly` — the one place that has both
   * the design and the physical cage — can finish it and certify it. Passing it separately
   * would allow an entry and a record to arrive out of step.
   */
  record: FamilyRecordDraft<FootingDesignRecord>;
}

export interface FootingDesignOutcome {
  footingId: number;
  name: string;
  /** Null when the footing could not be checked. `unsupported` says why. */
  check: FootingCheck | null;
  /**
   * The two-direction bottom-mat design, when the footing got far enough to have one.
   *
   * Null exactly when `check` is null: a footing with no soil or no reaction has no demand to
   * design a mat for, and emitting a mat with zeroes in it would be a design against no load.
   */
  mat: FootingMatDesign | null;
  /**
   * The physical mat, and its anchorage. Null exactly when `mat` is.
   *
   * Surfaced on the outcome as well as on the record because the Foundations panel reads
   * outcomes, and a panel that had to open a record to learn whether bars exist would be
   * reading the evidence to answer a question about the model.
   */
  matGeometry: FootingMatGeometry | null;
  matAnchorage: FootingMatAnchorage | null;
  entry: FootingAssemblyEntry | null;
  /** Elevation the footing is attributed to — the underside. */
  level: number;
  /** The strength combination the checks were run against. */
  governingCombination: string | null;
  unsupported: EngineMessage[];
  assumptions: EngineMessage[];
  /**
   * The design record, emitted for EVERY modelled footing — verified or not.
   *
   * A footing that could not be checked is exactly the one a reader most needs to find in
   * the document, and leaving it out of the record set would also leave it out of the
   * certificate tally, so a project with one unverifiable footing would read as fully
   * certified. Its record carries null results, its `unsupported` says why, and its
   * certificate is UNSUPPORTED — which blocks readiness rather than passing quietly.
   */
  record: FamilyRecordDraft<FootingDesignRecord>;
  /** The general path's design: combined, strip, turned, partly lifting or on piles. */
  general?: GeneralFootingDesign;
}

export interface RunFootingDesignResult {
  outcomes: FootingDesignOutcome[];
  /** Entries grouped by level, ready for `buildFloorAssembly`. */
  entriesByLevel: Map<number, FootingAssemblyEntry[]>;
  /**
   * Records for footings that produced NO assembly entry, grouped by founding level.
   *
   * A footing that could not be checked generates no steel, so it has no entry — and it was
   * therefore reaching no assembly, no document and no export. That made the one footing a
   * reader most needs to find the only one invisible: "Z3 has no soil data" appeared in the
   * panel and nowhere in the deliverable.
   *
   * These records carry the geometry and the reason and no results. They join their level's
   * assembly so the document can name every modelled footing, and their certificates are
   * UNSUPPORTED, so a project with one unverifiable footing cannot read as fully certified.
   */
  unverifiedByLevel: Map<number, Array<FamilyRecordDraft<FootingDesignRecord>>>;
  trace: string[];
}


/**
 * Where the critical punching perimeter sits relative to the footing edges.
 *
 * A footing normally extends past its column on all four sides, so the perimeter closes and
 * the case is `interior` — unlike a slab-column joint, where the position is a property of
 * the building. It stops being interior only when eccentricity or a large column brings a
 * face within d/2 of the edge, which truncates the perimeter. Two truncated sides is a
 * corner; more than two means the column does not fit on the footing at all.
 */
export function punchingPosition(
  f: Footing, column: { b: number; h: number }, d: number,
): {
  /** Null when the truncation pattern is not one of the three cases §22.6.5.3 tabulates. */
  position: ColumnPosition | null;
  truncatedSides: number;
  /** Set when `position` is null — which pattern was found. */
  pattern?: 'oppositeFaces' | 'doesNotFit';
} {
  const half = d / 2;
  // Cantilever from each column face to the corresponding footing edge, including the
  // deliberate plan eccentricity. Tracked per AXIS, not just counted: which faces are
  // truncated changes the answer.
  const alongB = [
    (f.B - column.b) / 2 - f.eccentricityB,
    (f.B - column.b) / 2 + f.eccentricityB,
  ].filter((c) => c < half).length;
  const alongL = [
    (f.L - column.h) / 2 - f.eccentricityL,
    (f.L - column.h) / 2 + f.eccentricityL,
  ].filter((c) => c < half).length;
  const truncatedSides = alongB + alongL;

  if (truncatedSides === 0) return { position: 'interior', truncatedSides };
  if (truncatedSides === 1) return { position: 'edge', truncatedSides };
  if (truncatedSides === 2) {
    // Adjacent pair — one face on each axis — is the corner case.
    if (alongB === 1 && alongL === 1) return { position: 'corner', truncatedSides };
    // Two OPPOSITE faces is a strip-like condition. §22.6.5.3's α_s tabulates exactly three
    // cases and this is none of them; treating it as a corner would apply the wrong α_s to a
    // perimeter of a different shape. It is reported as unsupported rather than approximated.
    return { position: null, truncatedSides, pattern: 'oppositeFaces' };
  }
  return { position: null, truncatedSides, pattern: 'doesNotFit' };
}

export function runFootingDesign(given: RunFootingDesignInput): RunFootingDesignResult {
  // An eccentric footing tied by a strap beam is checked centred and its partner relieved
  // (`strap-footing.ts`): the reactions and offsets the rest of the run reads are the strap's.
  const strapped = strapAdjust(given.footings, given.nodes, given.reactions);
  const input: RunFootingDesignInput = { ...given, footings: strapped.footings, reactions: strapped.reactions };
  const nameOf = (id: number) => given.footings.find((x) => x.id === id)?.name ?? `F${id}`;
  const strapNotes = (f: Footing): { assumptions: EngineMessage[]; unsupported: EngineMessage[] } => {
    const a: EngineMessage[] = [], u: EngineMessage[] = [];
    const own = strapped.straps.filter((x) => x.footingId === f.id);
    if (own.length) a.push(msg(own[0]!.bothWays ? 'footing.assumption.strapCentred' : 'footing.assumption.strapOneWay', { footing: f.name, factor: +own[0]!.factor.toFixed(3) }));
    for (const x of own) {
      a.push(msg('footing.assumption.strap', { footing: f.name, partner: nameOf(x.partnerId), L: +x.L.toFixed(2), e: +x.e.toFixed(2), M: +x.M.toFixed(1), V: +x.V.toFixed(1) }));
      const sec = f.straps?.find((k) => k.toFootingId === x.partnerId && (k.nodeId === undefined || k.nodeId === x.partnerNodeId));
      if (sec?.b && sec.h) {
        const d = sec.h - 0.05;
        const as = (x.M / (0.9 * 0.9 * d * input.fy * 1000)) * 1e4;
        const phiVc = 0.75 * 0.17 * Math.sqrt(input.fc) * sec.b * d * 1000;
        a.push(msg('footing.assumption.strapSteel', { footing: f.name, partner: nameOf(x.partnerId), b: Math.round(sec.b * 100), h: Math.round(sec.h * 100), as: +as.toFixed(2), V: +x.V.toFixed(1), phiVc: +phiVc.toFixed(1) }));
      }
    }
    for (const x of strapped.straps.filter((k) => k.partnerId === f.id)) {
      a.push(msg(x.relief >= 0 ? 'footing.assumption.strapRelief' : 'footing.assumption.strapLoad', { footing: f.name, partner: nameOf(x.footingId), dR: +Math.abs(x.relief).toFixed(1) }));
    }
    const bal = strapped.balanced.find((x) => x.footingId === f.id);
    if (bal) a.push(msg(bal.h !== undefined ? 'footing.assumption.balancedProp' : 'footing.assumption.balanced', { footing: f.name, e: +bal.e.toFixed(2), m: +bal.m.toFixed(1), h: +(bal.h ?? 0).toFixed(1) }));
    const refused = strapped.refused.find((x) => x.footingId === f.id);
    if (refused) u.push(msg(refused.reason === 'noPartner' ? 'footing.run.strapNoPartner' : 'footing.run.strapNotToward', { footing: f.name }));
    return { assumptions: a, unsupported: u };
  };
  const outcomes: FootingDesignOutcome[] = [];
  const entriesByLevel = new Map<number, FootingAssemblyEntry[]>();
  const unverifiedByLevel = new Map<number, Array<FamilyRecordDraft<FootingDesignRecord>>>();
  const trace: string[] = [];
  const levelKey = (z: number) => Math.round(z * 1000) / 1000;

  // Deterministic under input reordering: the assembly ids, the marks and the schedule all
  // derive from this order, so it cannot depend on Map iteration.
  const ordered = [...input.footings].sort((a, b) => a.id - b.id);

  for (const f of ordered) {
    const notes = strapNotes(f);
    const unsupported: EngineMessage[] = [...notes.unsupported];
    const assumptions: EngineMessage[] = [...notes.assumptions];
    const level = levelKey(f.foundingElevation);

    // ── Everything the record needs is accumulated as the run proceeds ──────────
    //
    // Declared here rather than assembled at the end so that a footing which fails EARLY
    // still produces a record of exactly how far it got: geometry always, ground when the
    // stratum resolved, demand when a reaction was found. The alternative — build the record
    // only on the success path — is what left unverifiable footings out of the evidence set
    // and therefore out of the certificate tally.
    let ground: GroundSnapshot | null = null;
    let demand: FootingDemandSnapshot | null = null;
    let mat: FootingMatDesign | null = null;
    // The punching and one-way-shear depth, unchanged in convention: the AVERAGED two-layer
    // mat depth `h − cover − d_b`. With the two directions now carrying their own diameters,
    // the `d_b` that average is taken at is the mean of the two — which is exactly the previous
    // number whenever both are the same, so a project that keeps the 16/16 default gets
    // bit-identical shear and punching results. What the flexural design uses is a different,
    // per-direction depth, and the two are reported side by side rather than reconciled.
    const punchingBarDiameterMm =
      (input.matPreferences.bottomMatDiameterXmm + input.matPreferences.bottomMatDiameterYmm) / 2;
    let effectiveDepth = footingEffectiveDepth(f, punchingBarDiameterMm);
    if (!Number.isFinite(effectiveDepth)) effectiveDepth = 0;

    const geometry = (): FootingGeometrySnapshot => ({
      footingId: f.id, name: f.name, kind: f.kind,
      B: f.B, L: f.L, thickness: f.thickness,
      rotationDeg: f.rotationDeg,
      eccentricityB: f.eccentricityB, eccentricityL: f.eccentricityL,
      cover: f.cover, foundingElevation: f.foundingElevation,
      d: effectiveDepth,
      ...(f.pedestal
        ? { pedestal: { B: f.pedestal.B, L: f.pedestal.L, height: f.pedestal.height } }
        : {}),
    });

    const column0 = f.columnElementId === undefined
      ? undefined
      : input.columns.get(f.columnElementId);

    /**
     * Build the record for this footing at whatever stage it reached.
     *
     * `checks` is the certificate's whole basis, so an early failure passes a single
     * UNSUPPORTED outcome rather than an empty list: `certificateStatusFor([])` is also
     * UNSUPPORTED, but an empty list cannot say WHICH check was impossible.
     */
    const draftRecord = (
      checks: FamilyCheckOutcome[],
      results: Pick<FootingDesignRecord,
        'bearing' | 'flexure' | 'oneWayShear' | 'punching' | 'bottomMatGeometry'
        | 'bottomMatAnchorage' | 'dowels' | 'starterTies'>,
      refs: readonly ClauseRef[],
    ): FamilyRecordDraft<FootingDesignRecord> => {
      const geom = geometry();
      // The mat preferences are INSIDE the material hash, so editing either diameter changes
      // the hash and voids the certificate. They decide the effective depth, the required
      // steel, the bar count and the spacing; a certificate that survived a change to them
      // would be certifying a mat the project no longer specifies.
      const materialHash = familyHash({
        fc: input.fc, fy: input.fy, cover: f.cover,
        matPreferences: input.matPreferences,
        maxAggregateSizeMm: input.maxAggregateSizeMm,
        concreteMaterialId: f.concreteMaterialId, rebarMaterialId: f.rebarMaterialId,
      });
      const geometryHash = familyHash(geom);
      // The input hash covers everything the design read. Editing ANY of it must void the
      // certificate, which is why the ground and the demand are inside it and not merely
      // alongside it.
      const inputHash = familyHash({
        geometry: geom, materialHash, ground, demand,
        edition: input.edition, regulationIds: [...input.regulationIds].sort(),
      });
      const maturity: Maturity = checks.some((c) => c.status === 'UNSUPPORTED')
        ? 'UNSUPPORTED'
        : 'IMPLEMENTED_PROVISIONAL';
      return {
        schemaVersion: FAMILY_RECORD_SCHEMA_VERSION,
        recordId: familyRecordId('footing', `F${f.id}`),
        family: 'footing',
        ownerId: `F${f.id}`,
        ownerElementIds: column0 ? [column0.elementId] : [],
        geometryHash,
        revisions: { ...input.revisions, entity: f.revision },
        edition: input.edition,
        regulationIds: [...input.regulationIds],
        materialHash,
        inputHash,
        resultHash: familyHash(results),
        governingCombinations: [...new Set(
          checks.map((c) => c.governingCombination).filter((s): s is string => !!s),
        )].sort(),
        checks,
        assumptions: [...assumptions],
        unsupported: [...unsupported],
        refs: [...refs],
        maturity,
        status: recordStatusFor(checks, maturity),
        geometry: geom,
        support: {
          nodeId: f.nodeId,
          columnElementId: column0?.elementId ?? null,
          columnB: column0?.b ?? null,
          columnH: column0?.h ?? null,
        },
        ground, demand,
        ...results,
      };
    };

    /** No results at all: one named UNSUPPORTED check, so the reason survives to the report. */
    const failRecord = (key: string): FamilyRecordDraft<FootingDesignRecord> => draftRecord(
      [{
        key, status: 'UNSUPPORTED', utilization: null,
        governingCombination: demand?.governingCombination ?? null,
        refs: [], unsupported: [...unsupported],
      }],
      {
        bearing: null, flexure: null, oneWayShear: null, punching: null,
        bottomMatGeometry: null, bottomMatAnchorage: null,
        dowels: null, starterTies: null,
      },
      [],
    );

    const fail = (governing: string | null = null, key = 'footing.design'): void => {
      const record = failRecord(key);
      outcomes.push({
        footingId: f.id, name: f.name, check: null, mat: null,
        matGeometry: null, matAnchorage: null, entry: null, level,
        governingCombination: governing, unsupported, assumptions,
        record,
      });
      const list = unverifiedByLevel.get(level);
      if (list) list.push(record); else unverifiedByLevel.set(level, [record]);
    };

    // ── Geometry ────────────────────────────────────────────────
    const geometryIssues = validateFooting(f).filter((i) => i.severity === 'blocking');
    if (geometryIssues.length > 0) {
      unsupported.push(...geometryIssues.map((i) => i.message));
      fail(null, 'footing.geometry');
      continue;
    }
    if (f.kind === 'mat') {
      // A mat is a slab on the ground, not a rigid base: the general path does not take it,
      // and refusing here keeps the reason attached to the footing.
      unsupported.push(msg('footing.run.kindNotImplemented', { footing: f.name, kind: f.kind }));
      fail(null, 'footing.kind');
      continue;
    }
    if (!input.nodes.has(f.nodeId)) {
      unsupported.push(msg('footing.run.nodeMissing', { footing: f.name, node: f.nodeId }));
      fail(null, 'footing.support');
      continue;
    }

    // ── The ground ──────────────────────────────────────────────
    const profile = findProfile(input.geotechnical, f.soilProfileId);
    if (!profile) {
      unsupported.push(msg('footing.run.noSoilProfile', { footing: f.name }));
      fail(null, 'footing.ground');
      continue;
    }
    // Snapshotted BEFORE the bearing-kind test, so a profile that states no capacity still
    // reaches the record and the document with its name and its provenance. "Stratum E-2,
    // capacity not stated, assumed" is actionable; a footing with no ground at all is not.
    ground = groundSnapshot(profile);
    if (profile.bearing.kind !== 'allowablePressure' && f.kind !== 'pileCap') {
      unsupported.push(msg('footing.run.bearingUnstated', {
        footing: f.name, profile: profile.name,
      }));
      fail(null, 'footing.bearing');
      continue;
    }
    const allowableBearing = profile.bearing.kind === 'allowablePressure' ? profile.bearing.allowableBearingKPa : 0;
    /** The general path, and what it leaves on the run. */
    const general = (): void => {
      const cap = f.kind === 'pileCap' && f.piles && profile.strata?.length
        ? pileCapacity(profile.strata, f.piles.diameter, f.piles.length).total : undefined;
      if (f.kind === 'pileCap' && cap === undefined) unsupported.push(msg('footing.general.noStrata', { footing: f.name }));
      const g = runGeneralFooting({
        f, input, level, allowable: f.kind === 'pileCap' ? null : allowableBearing,
        ...(cap !== undefined ? { pileCapacity: cap } : {}), unsupported, assumptions, draft: draftRecord,
      });
      if (!g.outcome || !g.entry) { fail(demand?.governingCombination ?? null, 'footing.design'); return; }
      outcomes.push(g.outcome);
      const list = entriesByLevel.get(level);
      if (list) list.push(g.entry); else entriesByLevel.set(level, [g.entry]);
    };
    if (f.kind !== 'isolated') { general(); continue; }
    assumptions.push(...geotechnicalAssumptions(profile));

    // ── The reaction ────────────────────────────────────────────
    const r = input.reactions.get(f.nodeId);
    if (!r || r.factored.length === 0) {
      // No reaction means no load. Designing for zero would produce a footing reinforced
      // for nothing, which is worse than an unchecked one.
      unsupported.push(msg('footing.run.noReaction', { footing: f.name, node: f.nodeId }));
      fail(null, 'footing.demand');
      continue;
    }

    // Until the footing is checked, the combination named is the one with the largest
    // downward vertical (`Math.abs`: the sign of a support reaction depends on the support
    // type). Every strength combination is checked below, and the worst one replaces it.
    let governing = r.factored.reduce(
      (best, c) => (Math.abs(c.fz) > Math.abs(best.fz) ? c : best), r.factored[0]);
    let factoredAxial = Math.abs(governing.fz);

    // Service reaction for bearing: unit-factor sum over gravity cases.
    let serviceAxial: number | null = null;
    let serviceMomentB = 0;
    let serviceMomentL = 0;
    if (r.cases && r.cases.length > 0) {
      const service = serviceGravity(r.cases);
      const lateral = r.cases.filter((c) => LATERAL_CASES.has(c.caseType)
        && (c.fz !== 0 || c.mx !== 0 || c.my !== 0));
      if (!service) {
        unsupported.push(msg('footing.run.noGravityCase', { footing: f.name }));
      } else {
        serviceAxial = service.axial;
        // Reaction moments about global X and Y map onto the footing's L and B axes
        // respectively for an unrotated footing.
        serviceMomentL = service.mx;
        serviceMomentB = service.my;
        assumptions.push(msg('footing.assumption.serviceFromGravityCases', {
          footing: f.name,
          cases: service.caseTypes.join(' + '),
        }));
        if (lateral.length > 0) {
          // Refusing to state a bearing result would be wrong — the gravity check is real.
          // Claiming it covers the wind case would also be wrong. So the result stands and
          // its limit is named.
          unsupported.push(msg('footing.run.serviceLateralExcluded', {
            footing: f.name,
            cases: [...new Set(lateral.map((c) => c.caseType))].join(', '),
          }));
        }
      }
    } else {
      unsupported.push(msg('footing.run.noServiceCases', { footing: f.name }));
    }
    // The demand is snapshotted as soon as the governing combination is known, so a footing
    // that fails on rotation or on a missing column still records WHAT it was carrying.
    // `considered` keeps every strength combination that was offered, which is what makes
    // the choice of `governing` auditable instead of a claim: a reviewer can see that the
    // largest vertical really was the one used.
    demand = {
      nodeId: f.nodeId,
      governingCombination: governing.combinationName,
      factoredAxial,
      serviceAxial: serviceAxial ?? 0,
      serviceMomentB, serviceMomentL,
      serviceCaseTypes: r.cases
        ? [...new Set(r.cases.filter((c) => GRAVITY_CASES.has(c.caseType))
          .map((c) => c.caseType))].sort()
        : [],
      considered: r.factored.map((c) => ({
        combinationName: c.combinationName, fz: c.fz, mx: c.mx, my: c.my,
      })),
    };

    if (serviceAxial === null) {
      // Bearing is the check the footing exists to satisfy. Without a service demand there
      // is no footing verification, and dividing the factored load by an assumed 1,4 would
      // be inventing the load factor the project already states somewhere else.
      //
      // The demand snapshot above carries `serviceAxial: 0` in this branch and that is NOT a
      // claim that the service load is zero: the record's status is unsupported and
      // `footing.run.noServiceCases` names the reason. The factored reaction, which is real,
      // is preserved so the document can still state what the footing carries.
      demand = { ...demand, serviceAxial: 0 };
      fail(governing.combinationName, 'footing.bearing');
      continue;
    }

    if (f.rotationDeg !== 0 || f.mats) {
      // The reaction moments are global; the general path turns them into the footing's axes.
      // Bars fixed by hand are checked there too, as given.
      general();
      continue;
    }

    // ── The column ──────────────────────────────────────────────
    const column = column0;
    if (!column) {
      // Bearing and one-way shear need no column; punching and the dowels do. `checkFooting`
      // rolls its own unsupported punching up to UNSUPPORTED, so this cannot read as OK.
      unsupported.push(msg('footing.run.noColumn', { footing: f.name }));
      fail(governing.combinationName, 'footing.punching');
      continue;
    }

    const d = effectiveDepth;
    if (!(d > 0)) {
      unsupported.push(msg('footing.run.noEffectiveDepth', { footing: f.name }));
      fail(governing.combinationName, 'footing.geometry');
      continue;
    }
    assumptions.push(msg('footing.assumption.averageMatDepth', {
      footing: f.name, d: +d.toFixed(3), bar: punchingBarDiameterMm,
    }));

    const perimeter = punchingPosition(f, column, d);
    if (perimeter.position === null) {
      unsupported.push(msg(
        perimeter.pattern === 'doesNotFit'
          ? 'footing.run.columnDoesNotFit'
          : 'footing.run.perimeterOppositeFaces',
        { footing: f.name },
      ));
      fail(governing.combinationName, 'footing.punching');
      continue;
    }
    const position = perimeter.position;
    if (perimeter.truncatedSides > 0) {
      assumptions.push(msg('footing.assumption.truncatedPerimeter', {
        footing: f.name, position, sides: perimeter.truncatedSides,
      }));
    }

    // ── The check ───────────────────────────────────────────────
    const fiFor = (c: typeof governing): FootingInput => ({
      kind: 'isolated',
      B: f.B, L: f.L,
      thickness: f.thickness,
      d,
      columnB: column.b, columnH: column.h,
      fc: input.fc,
      allowableBearing,
      serviceAxial,
      factoredAxial: Math.abs(c.fz),
      serviceMomentB, serviceMomentL,
      // Factored moments of the GOVERNING combination, so the strength checks see
      // the trapezoid the soil actually imposes — same axis mapping as the service
      // values (reaction mx → footing L axis, my → B axis, unrotated footing).
      factoredMomentB: c.my,
      factoredMomentL: c.mx,
      // The plan offset of the centroid from the node. These moments and reactions are the
      // SUPPORT's, so they are expressed at the NODE — `reactions` is a nodal quantity and
      // nothing upstream reduces it to the footing centroid. The `N · e` term
      // `footing-actions.ts` forms is therefore additional, not a second copy of a moment
      // already counted: `no-double-counting` in `foundation-check.test.ts` pins that by
      // showing a footing with zero applied moment still develops exactly `N · e`.
      eccentricityB: f.eccentricityB,
      eccentricityL: f.eccentricityL,
      position,
    });
    /*
     * Every strength combination is checked, and the one that governs is the worst outcome:
     * one the check cannot resolve, then a failure, then the highest utilization. Taking only
     * the largest vertical missed a combination with less axial and more moment, which is the
     * one that loads a footing's edge and its punching perimeter hardest.
     */
    const rank = (k: FootingCheck): number =>
      k.status === 'UNSUPPORTED' ? 3e9 : k.status === 'FAIL' ? 2e9 + k.worstUtilization : k.worstUtilization;
    let check = checkFooting(fiFor(governing));
    for (const c of r.factored) {
      if (c === governing) continue;
      const k = checkFooting(fiFor(c));
      if (rank(k) > rank(check)) { check = k; governing = c; }
    }
    factoredAxial = Math.abs(governing.fz);
    demand = { ...demand, governingCombination: governing.combinationName, factoredAxial };
    if (check.status === 'UNSUPPORTED' && check.bearing.uplift) {
      // The base lifts in part: the linear trapezoid does not hold, the rigid base does.
      general();
      continue;
    }

    // ── The bottom mat ──────────────────────────────────────────
    //
    // Designed from the SAME inputs the check was run against, so the demand the design
    // answers is the demand the check reports and not a second reading of the model. Direction
    // X reproduces `check.Mu` exactly — same cantilever, same distribution width, same
    // trapezoid — which is what makes the pair auditable; direction Y is the one the check
    // never had.
    const matFor = (c: typeof governing) => designFootingMat({
      B: f.B, L: f.L,
      thickness: f.thickness, cover: f.cover,
      columnB: column.b, columnH: column.h,
      eccentricityB: f.eccentricityB, eccentricityL: f.eccentricityL,
      fc: input.fc, fy: input.fy,
      factoredAxial: Math.abs(c.fz),
      factoredMomentB: c.my,
      factoredMomentL: c.mx,
      maxAggregateSizeMm: input.maxAggregateSizeMm,
      edition: input.edition,
      preferences: input.matPreferences,
      // Anchorage lengths come from the authoritative clause implementation, never from a
      // second formula. Reported only: §13.2.8's critical sections are geometry, and PR18-A
      // models none.
      developmentLengthFor: (diameterMm) => starterDevelopment(diameterMm, input).ldM,
    });
    // The mat answers the combination that asks for the most steel, which need not be the one
    // that governs the check; the assumptions say so when they differ.
    mat = matFor(governing);
    const steelOf = (m: FootingMatDesign) => m.x.asGoverning + m.y.asGoverning;
    for (const c of r.factored) {
      if (c === governing) continue;
      const m = matFor(c);
      if (steelOf(m) > steelOf(mat) + 1e-12) {
        mat = m;
        assumptions.push(msg('footing.assumption.matCombination', { footing: f.name, combination: c.combinationName }));
      }
    }
    assumptions.push(...mat.assumptions);
    // A mat that could not be designed is a named condition on the footing, not a silent
    // absence — the whole point of the status split is that "designed" and "drawn" are
    // separately visible, and so is "not designed".
    unsupported.push(...mat.failures);

    const elementIds = [column.elementId];

    // ── The physical mat ────────────────────────────────────────
    //
    // The footing CENTROID in model coordinates. `eccentricityB`/`eccentricityL` are the plan
    // offset of the centroid FROM the node, so the centroid is `node + eccentricity` and the
    // column stands at `−eccentricity` in centroid coordinates — the one reading
    // `footing-actions.ts` establishes and every consumer here shares.
    const node = input.nodes.get(f.nodeId)!;
    const placement: FootingMatPlacement = {
      footingId: `F${f.id}`,
      centroid: { x: node.x + f.eccentricityB, y: node.y + f.eccentricityL },
      soffitZ: f.foundingElevation,
      B: f.B, L: f.L, thickness: f.thickness, cover: f.cover,
      elementIds,
      designRevision: f.revision,
      detailingRevision: nextDetailingRevision(input.previousDetailingRevision),
      sourceScheduleRef: familyRecordId('footing', `F${f.id}`),
    };
    // The §25.2.1 minimum the DESIGN laid each direction out to, per direction because it
    // depends on the bar diameter. Read from the same authority the design read rather than
    // from the design's own reported number, so the placement check and the layout decision
    // are answering to one clause implementation instead of to each other.
    const matGeometry = generateFootingMat(placement, mat, {
      x: minClearSpacingInLayer(input.edition, {
        barDiameterMm: input.matPreferences.bottomMatDiameterXmm,
        maxAggregateSizeMm: input.maxAggregateSizeMm,
      }).minClear,
      y: minClearSpacingInLayer(input.edition, {
        barDiameterMm: input.matPreferences.bottomMatDiameterYmm,
        maxAggregateSizeMm: input.maxAggregateSizeMm,
      }).minClear,
    });
    const matAnchorage = verifyFootingMatAnchorage({
      place: placement, design: mat, geometry: matGeometry,
      columnB: column.b, columnH: column.h,
      eccentricityB: f.eccentricityB, eccentricityL: f.eccentricityL,
      fc: input.fc, fy: input.fy, edition: input.edition,
    });
    // Every geometry finding and every anchorage shortfall is a named condition on the
    // footing. They are NOT folded into the mat design's failures: the design is compliant in
    // both of those cases and saying otherwise would send the engineer to change a schedule
    // that is correct.
    unsupported.push(...matGeometry.notModeled);
    unsupported.push(...matGeometry.findings.filter((x) => x.blocking).map((x) => x.message));
    unsupported.push(...matAnchorage.failures);
    // Top reinforcement, stated on every footing that reaches a mat.
    //
    // Reported as an unsupported CONDITION rather than as a failed check, and the distinction
    // is deliberate. No clause was violated and no capacity was over-claimed — nobody has
    // evaluated whether this footing needs top steel — so it must not turn the bottom mat's
    // verification into an UNSUPPORTED one. It must equally not be silent: an unsupported
    // condition caps the assembly's review state, so a footing whose top steel was never
    // considered cannot be issued.
    unsupported.push(msg('footing.record.topReinforcementNotEvaluated', { footing: f.name }));
    trace.push(...matGeometry.steps);
    const starter = column.bars
      ? starterDevelopment(column.bars.diameterMm, input)
      : null;
    const hooked = column.bars
      ? starterHookedDevelopment(column.bars.diameterMm, input)
      : null;
    const dowelsPresent = Boolean(column.bars && starter);
    /**
     * The steel the hooks bear on, so "apoyado sobre la parrilla inferior" is a measurement
     * instead of a claim.
     *
     * Built from the GENERATED mat and its resolved layer order — the bars, their diameters and
     * their real elevations — rather than from the footing's nominal cover. Null when either
     * direction is missing or no bars were produced; the cage module then seats the hooks on
     * the cover plane and reports that nothing physical was verified.
     */
    const dowelMat = dowelMatSupportFrom(matGeometry.bars, [
      {
        axis: 'X', diameterMm: mat.x.diameterMm,
        centreZ: placement.soffitZ + mat.x.centreElevation,
        layer: matGeometry.lowerLayerAxis === 'X' ? 'LOWER' : 'UPPER',
      },
      {
        axis: 'Y', diameterMm: mat.y.diameterMm,
        centreZ: placement.soffitZ + mat.y.centreElevation,
        layer: matGeometry.lowerLayerAxis === 'Y' ? 'LOWER' : 'UPPER',
      },
    ]);
    const entryDraft: FootingAssemblyEntry['record'] = footingRecord({
      check, mat, matGeometry, matAnchorage, perimeter, position, d,
      B: f.B, L: f.L,
      factoredAxial,
      allowableBearing, governing,
      dowels: dowelsPresent && column.bars && starter
        ? {
          count: column.bars.count,
          diameterMm: column.bars.diameterMm,
          ldFooting: starter.ldM,
          lapAbove: CLASS_B_LAP_FACTOR * starter.ldM,
          // The SAME authority the cage uses, not a second reading of it: the straight l_d has
          // to fit above the deepest seat a starter foot can reach. This used to be
          // `thickness − cover − 50 mm`, a proxy for "the mat is in the way" written before
          // there was a mat, and it could disagree with the geometry the generator produced.
          hooked: starterNeedsHook(
            starter.ldM, placement.soffitZ + f.thickness,
            deepestStarterSeat(dowelMat, placement.soffitZ, f.cover)),
        }
        : null,
      draft: draftRecord,
    });
    const entry: FootingAssemblyEntry = {
      id: `F${f.id}`,
      check,
      elementIds,
      matBars: matGeometry.bars,
      record: entryDraft,
      ...(column.bars && starter && hooked
        ? {
          dowels: {
            id: `F${f.id}-C${column.elementId}`,
            centre: {
              x: (input.nodes.get(f.nodeId)!.x) + f.eccentricityB,
              y: (input.nodes.get(f.nodeId)!.y) + f.eccentricityL,
            },
            footingTopZ: f.foundingElevation + f.thickness,
            footingThickness: f.thickness,
            footingCover: f.cover,
            columnB: column.b, columnH: column.h,
            cover: f.cover,
            tieDia: column.tieDiaMm ?? 8,
            bars: column.bars,
            // Development and lap come from the authoritative clause implementation
            // (`deriveDevelopment`, Table 25.4.2.3 with the §25.4.2.1(b) floor), not from a
            // second formula written here. `favourableSpacing: false` is the conservative
            // row, correct for starters bunched at a column perimeter rather than spread.
            ldFooting: starter.ldM,
            // §25.4.3.1 hooked development, from the same authoritative module — the
            // generator checks it against the available embedment before crediting
            // the 90° hook, instead of assuming the hook always develops.
            ldhFooting: hooked.ldhM,
            // §25.5.2.1 Class B: starters out of a footing lap all bars at one station, so
            // the Class A fraction is never satisfied and 1,3·ld is the honest lap.
            lapAbove: CLASS_B_LAP_FACTOR * starter.ldM,
            elementIds,
            edition: input.edition,
            bottomMat: dowelMat ?? undefined,
            // Containment and side cover are checked against the real plan, not assumed.
            footingPlan: { centroid: placement.centroid, B: f.B, L: f.L },
          },
        }
        : {}),
    };
    if (!column.bars) {
      unsupported.push(msg('footing.run.noColumnBars', { footing: f.name }));
    }

    outcomes.push({
      footingId: f.id, name: f.name, check, mat, matGeometry, matAnchorage, entry, level,
      governingCombination: governing.combinationName,
      unsupported, assumptions,
      record: entryDraft,
    });
    const list = entriesByLevel.get(level);
    if (list) list.push(entry); else entriesByLevel.set(level, [entry]);
  }

  const checked = outcomes.filter((o) => o.check !== null).length;
  trace.push(
    `Fundaciones: ${checked} de ${outcomes.length} zapata(s) verificada(s), ` +
    `${outcomes.reduce((n, o) => n + o.unsupported.length, 0)} condición(es) no soportada(s).`);

  return { outcomes, entriesByLevel, unverifiedByLevel, trace };
}

/** §25.5.2.1 Class B lap multiplier. */
const CLASS_B_LAP_FACTOR = 1.3;

/**
 * Snapshot a soil profile, with its provenance and its own hash.
 *
 * The hash is over the VALUES, not the object, so editing the allowable pressure changes it
 * and renaming the reference does too — a footing verified against "assumed 200 kPa" is not
 * verified against "study SR-14, 200 kPa", even though the number is the same. The second is
 * a design; the first is a placeholder, and the certificate has to be able to tell them
 * apart.
 */
function groundSnapshot(p: SoilProfile): GroundSnapshot {
  const values = {
    profileId: p.id,
    name: p.name,
    allowableBearingKPa: p.bearing.kind === 'allowablePressure'
      ? p.bearing.allowableBearingKPa
      : null,
    unitWeightKNm3: p.unitWeightKNm3,
    subgradeModulusKNm3: p.subgradeModulusKNm3,
    groundwaterDepthM: p.groundwaterDepthM,
    source: p.provenance.source,
    reference: p.provenance.reference,
  };
  return { ...values, hash: familyHash(values) };
}

/**
 * Project a completed `FootingCheck` into the record's structured results.
 *
 * Every number is COPIED from the check. Nothing is recomputed, and in particular no
 * capacity, utilisation or demand is derived here — this module would then be a second
 * foundation engine, and two engines are how one project comes to hold two answers about the
 * same footing.
 *
 * The one value that is computed is the punching equilibrium RESIDUAL, and it is a
 * measurement of the check rather than part of it: the free body says the transferred force
 * is the reaction less the soil pressure inside the critical perimeter, so
 * `N_u − (V_u + q_u · A_enclosed)` must be zero. A non-zero residual means the free body the
 * check solved is not the one the record describes, which is exactly the disagreement a
 * reviewer cannot otherwise see.
 */
function footingRecord(args: {
  check: FootingCheck;
  /** The designed bottom mat. Copied onto the record; nothing about it is recomputed. */
  mat: FootingMatDesign | null;
  /** The physical mat and its anchorage. Copied, never recomputed, for the same reason. */
  matGeometry: FootingMatGeometry | null;
  matAnchorage: FootingMatAnchorage | null;
  perimeter: { truncatedSides: number };
  position: ColumnPosition;
  d: number;
  /** Plan dimensions, m — for the factored-pressure restatement the residual needs. */
  B: number;
  L: number;
  factoredAxial: number;
  allowableBearing: number;
  governing: CombinationReaction;
  dowels: {
    count: number; diameterMm: number; ldFooting: number; lapAbove: number; hooked: boolean;
  } | null;
  draft: (
    checks: FamilyCheckOutcome[],
    results: Pick<FootingDesignRecord,
      'bearing' | 'flexure' | 'oneWayShear' | 'punching' | 'bottomMatGeometry'
      | 'bottomMatAnchorage' | 'dowels' | 'starterTies'>,
    refs: readonly ClauseRef[],
  ) => FamilyRecordDraft<FootingDesignRecord>;
}): FamilyRecordDraft<FootingDesignRecord> {
  const { check, governing } = args;
  const combo = governing.combinationName;
  const b = check.bearing;
  const punch = check.punching;

  // The pressure the punching free body actually deducted inside the critical perimeter. READ
  // OFF THE CHECK, not restated as `N_u/(B·L)`: on a footing whose centroid is offset from its
  // node the perimeter is centred on the COLUMN, and the mean of the linear field over it is
  // its value there rather than `N_u/A`. Restating the uniform value would make the residual
  // report a broken free body for a check that closes exactly — the residual would BECOME the
  // disagreement it exists to detect. Used for ONE purpose, and never fed back into a capacity.
  const area = args.B * args.L;
  const qFactored = area > 0 ? args.factoredAxial / area : 0;
  const qDeducted = check.punchingLoadInsidePerimeter;
  const enclosed = punch?.critical.enclosedArea ?? 0;
  const residual = punch && punch.demand.outcome === 'DERIVED' && qFactored > 0
    ? args.factoredAxial - (punch.demand.Vu + qDeducted * enclosed)
    : null;

  const bearing: FootingDesignRecord['bearing'] = {
    status: b.status, qMax: b.qMax, qMin: b.qMin, eB: b.eB, eL: b.eL,
    uplift: b.uplift, allowable: args.allowableBearing, utilization: b.utilization,
  };
  /**
   * The flexural verdict, now that steel can exist.
   *
   * ── The three states, and why each is the one it is ──────────
   *
   * FAIL         the design itself failed — no admissible layout at the selected diameter, a
   *              section needing compression steel, a §13.3.3.3 band that does not fit. That
   *              is a verdict about the footing and the remedy is to change the footing.
   * UNSUPPORTED  the design is sound and there is nothing to verify it against: no mat was
   *              designed, or one was and its geometry could not be produced or does not
   *              reconcile with the schedule. Not a failure — an absence.
   * OK           the mat is DESIGNED, its bars exist, and every bar reconciles with the
   *              schedule that asked for it. Only then does the demand have reinforcement to
   *              be verified against.
   *
   * Anchorage is deliberately NOT part of this. A mat that provides every square centimetre
   * §7.6.1 and §13.3.3 require and fails to develop it has passed one requirement and failed
   * another, and it carries its own check row below so both are readable.
   */
  const geometryModeled = args.matGeometry?.status === 'MODELED';
  const flexureStatus: FootingCheck['status'] =
    args.mat === null || args.mat.status === 'NOT_EVALUATED'
      ? 'UNSUPPORTED'
      : args.mat.status === 'DESIGN_FAILED'
        ? 'FAIL'
        : geometryModeled ? 'OK' : 'UNSUPPORTED';
  const flexure: FootingDesignRecord['flexure'] = {
    status: flexureStatus, Mu: check.Mu, criticalSection: 0,
    bottomMat: args.mat,
  };
  const anchorage = args.matAnchorage;
  const oneWayShear: FootingDesignRecord['oneWayShear'] = check.oneWayShear
    ? {
      status: check.oneWayShear.status,
      Vu: check.oneWayShear.Vu,
      phiVc: check.oneWayShear.phiVc,
      utilization: check.oneWayShear.utilization,
    }
    : null;
  const punching: FootingDesignRecord['punching'] = punch
    ? {
      status: punch.status === 'OK' ? 'OK' : punch.status === 'FAIL' ? 'FAIL' : 'UNSUPPORTED',
      position: args.position,
      truncatedSides: args.perimeter.truncatedSides,
      Vu: punch.demand.Vu,
      // The punching engine works in stress; the record states the FORCE capacity the
      // stress implies over the same critical section, so it is comparable with V_u on the
      // same row of the report. Same two numbers the engine already produced.
      phiVc: punch.phiVc * punch.critical.bo * punch.critical.d * 1000,
      utilization: punch.utilization,
      equilibriumResidual: residual,
    }
    : null;

  const checks: FamilyCheckOutcome[] = [
    {
      key: 'bearing', status: b.status, utilization: b.utilization,
      // Bearing is a SERVICE check summed over gravity cases, so no strength combination
      // governs it. Naming one here would be the commonest kind of certificate lie.
      governingCombination: null,
      refs: b.refs,
      unsupported: b.status === 'UNSUPPORTED'
        ? [msg('footing.record.bearingUnsupported')] : [],
    },
    {
      key: 'flexure', status: flexureStatus, utilization: null,
      governingCombination: combo,
      // The clauses the design was actually resolved against, so the certificate cites the
      // chain (§13.3.3, §7.6.1, §7.7.2.x, §24.3.2, §25.2.1) rather than an empty list.
      refs: [...(args.mat?.refs ?? []), ...(args.matGeometry?.refs ?? [])],
      /**
       * FOUR different reasons, because they call for four different actions.
       *
       * "No mat was designed" is a missing input. "The design failed" is a footing the
       * engineer has to change. "Designed, not modelled" was the PR18-A backlog and now means
       * something narrower and rarer: the design is complete and no order could be resolved,
       * so there is no elevation to draw at. "Does not reconcile" is new and is the one a
       * reader must not confuse with the others — the bars were placed and they disagree with
       * the schedule, which is a geometry defect and not a missing feature.
       *
       * The list is EMPTY when the mat is modelled and reconciled. That is what removes the
       * blanket designed-not-modelled limitation, and it is removed by the geometry existing
       * rather than by a decision to stop saying it.
       */
      unsupported: flexureStatus === 'OK' ? [] : [
        args.mat === null || args.mat.status === 'NOT_EVALUATED'
          ? msg('footing.record.flexureNoSteel')
          : args.mat.status === 'DESIGN_FAILED'
            ? msg('footing.record.flexureDesignFailed')
            : args.matGeometry?.status === 'RECONCILIATION_FAILED'
              ? msg('footing.record.flexureGeometryNotReconciled', {
                findings: args.matGeometry.findings.filter((x) => x.blocking).length,
              })
              : msg('footing.record.flexureDesignedNotModeled'),
      ],
    },
    /**
     * Anchorage, as its own row.
     *
     * Emitted only when a mat design exists at all, because a footing with no mat has no mat
     * anchorage to report and an UNSUPPORTED row would be a second way of saying the same
     * thing the flexure row already says.
     */
    ...(args.mat !== null && anchorage
      ? [{
        key: 'anchorage',
        status: (anchorage.outcome === 'VERIFIED' ? 'OK'
          : anchorage.outcome === 'FAILED' ? 'FAIL' : 'UNSUPPORTED') as FootingCheck['status'],
        // A development length is not a demand/capacity ratio, and the app's utilisation
        // convention is demand over capacity. `required/available` is exactly that, so it is
        // reported as one — and a value above 1 is the shortfall.
        utilization: anchorage.x && anchorage.y
          ? Math.max(
            anchorage.x.available > 0 ? anchorage.x.requiredLd / anchorage.x.available : Infinity,
            anchorage.y.available > 0 ? anchorage.y.requiredLd / anchorage.y.available : Infinity,
          )
          : null,
        governingCombination: combo,
        refs: anchorage.refs,
        unsupported: anchorage.outcome === 'NOT_EVALUATED'
          ? [msg('footing.record.anchorageNotEvaluated')] : [],
      } satisfies FamilyCheckOutcome]
      : []),
    ...(oneWayShear
      ? [{
        key: 'oneWayShear', status: oneWayShear.status, utilization: oneWayShear.utilization,
        governingCombination: combo, refs: check.oneWayShear!.refs, unsupported: [],
      } satisfies FamilyCheckOutcome]
      : []),
    ...(punching
      ? [{
        key: 'punching', status: punching.status, utilization: punching.utilization,
        governingCombination: combo, refs: punch!.refs,
        unsupported: punching.status === 'UNSUPPORTED'
          ? [msg('footing.record.punchingUnsupported')] : [],
      } satisfies FamilyCheckOutcome]
      : []),
  ];

  return args.draft(
    checks,
    {
      bearing, flexure, oneWayShear, punching,
      // The physical mat and its anchorage, copied. The MARKS inside the schedule are filled
      // by the assembly pass, for the same reason the dowel bar ids are: marks group identical
      // fabricated items across every family and only the assembly sees all of them.
      bottomMatGeometry: args.matGeometry,
      bottomMatAnchorage: args.matAnchorage,
      // Bar ids are filled by `completeFamilyRecord`, which is the only place that has the
      // generated cage. The counts and lengths are the DESIGN, and they belong here.
      dowels: args.dowels ? { ...args.dowels, barIds: [] } : null,
      starterTies: null,
    },
    check.refs,
  );
}

/**
 * Development length for a column starter out of a footing.
 *
 * Delegates to `deriveDevelopment` — Table 25.4.2.3 with the §25.4.2.1(b) 300 mm floor —
 * rather than restating the formula. A second implementation of ld is exactly how two parts
 * of the same project come to disagree about the same bar.
 *
 * `favourableSpacing: false` selects the conservative table row. Starters are bunched at the
 * column perimeter, not spread at the clear spacing the favourable row assumes, so the
 * longer length is the correct one — and being wrong in this direction shortens real steel.
 */
function starterDevelopment(
  barDiameterMm: number, input: Pick<RunFootingDesignInput, 'fc' | 'fy' | 'edition'>,
): DevelopmentResult {
  return deriveDevelopment({
    diameterMm: barDiameterMm,
    fy: input.fy,
    fc: input.fc,
    favourableSpacing: false,
    edition: input.edition,
  });
}

/**
 * Hooked development for a column starter whose straight ld does not fit in the
 * footing, per §25.4.3.1 — same authoritative module as the straight bar, not a
 * restated formula.
 */
function starterHookedDevelopment(
  barDiameterMm: number, input: Pick<RunFootingDesignInput, 'fc' | 'fy' | 'edition'>,
): HookedDevelopmentResult {
  return deriveHookedDevelopment({
    diameterMm: barDiameterMm,
    fy: input.fy,
    fc: input.fc,
    edition: input.edition,
  });
}
