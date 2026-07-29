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

import { msg, type EngineMessage } from '../../codes/message';
import type { ClauseRef, RegulationEdition } from '../../codes/regulation';
import type { Maturity } from '../../codes/maturity';
import { deriveDevelopment, type DevelopmentResult } from '../../codes/cirsoc201/anchorage';
import {
  footingEffectiveDepth, validateFooting, type Footing,
} from '../../model/footing';
import {
  findProfile, geotechnicalAssumptions, type ProjectGeotechnical,
} from '../../model/geotechnical';
import { checkFooting, type FootingCheck, type FootingInput } from './foundation-check';
import type { ColumnPosition } from './punching-shear';
import type { DowelInput } from './floor-design';
import {
  familyHash, familyRecordId,
  type FamilyCheckOutcome, type FamilyRecordDraft, type FamilyRevisionVector,
  type FootingDemandSnapshot, type FootingDesignRecord, type FootingGeometrySnapshot,
  type GroundSnapshot,
  FAMILY_RECORD_SCHEMA_VERSION, recordStatusFor,
} from './family-record';
import type { SoilProfile } from '../../model/geotechnical';

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
  reactions: ReadonlyMap<number, NodeReactions>;
  /** Project-resolved concrete strength, MPa. */
  fc: number;
  /** Reinforcement yield strength, MPa. */
  fy: number;
  edition: RegulationEdition;
  /** Bottom-mat bar diameter, mm — sets the effective depth. */
  barDiameterMm: number;
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
}

/** What `buildFloorAssembly` consumes for one footing. */
export interface FootingAssemblyEntry {
  id: string;
  check: FootingCheck;
  elementIds: number[];
  dowels?: DowelInput;
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

/** Load-case types that contribute to the service gravity sum. */
const GRAVITY_CASES: ReadonlySet<string> = new Set(['D', 'L', 'Lr', 'S', 'R']);
/** Load-case types whose SERVICE combination factors this project does not model. */
const LATERAL_CASES: ReadonlySet<string> = new Set(['W', 'E']);

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

export function runFootingDesign(input: RunFootingDesignInput): RunFootingDesignResult {
  const outcomes: FootingDesignOutcome[] = [];
  const entriesByLevel = new Map<number, FootingAssemblyEntry[]>();
  const unverifiedByLevel = new Map<number, Array<FamilyRecordDraft<FootingDesignRecord>>>();
  const trace: string[] = [];
  const levelKey = (z: number) => Math.round(z * 1000) / 1000;

  // Deterministic under input reordering: the assembly ids, the marks and the schedule all
  // derive from this order, so it cannot depend on Map iteration.
  const ordered = [...input.footings].sort((a, b) => a.id - b.id);

  for (const f of ordered) {
    const unsupported: EngineMessage[] = [];
    const assumptions: EngineMessage[] = [];
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
    let effectiveDepth = footingEffectiveDepth(f, input.barDiameterMm);
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
        'bearing' | 'flexure' | 'oneWayShear' | 'punching' | 'dowels' | 'starterTies'>,
      refs: readonly ClauseRef[],
    ): FamilyRecordDraft<FootingDesignRecord> => {
      const geom = geometry();
      const materialHash = familyHash({
        fc: input.fc, fy: input.fy, cover: f.cover,
        barDiameterMm: input.barDiameterMm,
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
        dowels: null, starterTies: null,
      },
      [],
    );

    const fail = (governing: string | null = null, key = 'footing.design'): void => {
      const record = failRecord(key);
      outcomes.push({
        footingId: f.id, name: f.name, check: null, entry: null, level,
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
    if (f.kind !== 'isolated') {
      // `checkFooting` would return UNSUPPORTED for this anyway; refusing here keeps the
      // reason attached to the footing rather than buried in a check result.
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
    if (profile.bearing.kind !== 'allowablePressure') {
      unsupported.push(msg('footing.run.bearingUnstated', {
        footing: f.name, profile: profile.name,
      }));
      fail(null, 'footing.bearing');
      continue;
    }
    const allowableBearing = profile.bearing.allowableBearingKPa;
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

    // The governing strength combination is the one with the largest downward vertical.
    // `Math.abs` because the solver's sign convention for a support reaction depends on the
    // support type, and the magnitude is what the footing carries either way.
    const governing = r.factored.reduce(
      (best, c) => (Math.abs(c.fz) > Math.abs(best.fz) ? c : best), r.factored[0]);
    const factoredAxial = Math.abs(governing.fz);

    // Service reaction for bearing: unit-factor sum over gravity cases.
    let serviceAxial: number | null = null;
    let serviceMomentB = 0;
    let serviceMomentL = 0;
    if (r.cases && r.cases.length > 0) {
      const gravity = r.cases.filter((c) => GRAVITY_CASES.has(c.caseType));
      const lateral = r.cases.filter((c) => LATERAL_CASES.has(c.caseType)
        && (c.fz !== 0 || c.mx !== 0 || c.my !== 0));
      if (gravity.length === 0) {
        unsupported.push(msg('footing.run.noGravityCase', { footing: f.name }));
      } else {
        serviceAxial = Math.abs(gravity.reduce((s, c) => s + c.fz, 0));
        // Reaction moments about global X and Y map onto the footing's L and B axes
        // respectively for an unrotated footing.
        serviceMomentL = gravity.reduce((s, c) => s + c.mx, 0);
        serviceMomentB = gravity.reduce((s, c) => s + c.my, 0);
        assumptions.push(msg('footing.assumption.serviceFromGravityCases', {
          footing: f.name,
          cases: gravity.map((c) => c.caseType).join(' + '),
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

    if (f.rotationDeg !== 0) {
      // The reaction moments are global. Resolving them onto rotated footing axes is
      // defensible arithmetic, but it is not implemented, and silently treating a rotated
      // footing's global moments as local ones would mis-assign the eccentricity.
      unsupported.push(msg('footing.run.rotationNotResolved', {
        footing: f.name, rotation: f.rotationDeg,
      }));
      fail(governing.combinationName, 'footing.geometry');
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
      footing: f.name, d: +d.toFixed(3), bar: input.barDiameterMm,
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
    const fi: FootingInput = {
      kind: 'isolated',
      B: f.B, L: f.L,
      thickness: f.thickness,
      d,
      columnB: column.b, columnH: column.h,
      fc: input.fc,
      allowableBearing,
      serviceAxial,
      factoredAxial,
      serviceMomentB, serviceMomentL,
      position,
    };
    const check = checkFooting(fi);

    const elementIds = [column.elementId];
    const starter = column.bars
      ? starterDevelopment(column.bars.diameterMm, input)
      : null;
    const dowelsPresent = Boolean(column.bars && starter);
    const entryDraft: FootingAssemblyEntry['record'] = footingRecord({
      check, perimeter, position, d,
      B: f.B, L: f.L,
      factoredAxial,
      allowableBearing, governing,
      dowels: dowelsPresent && column.bars && starter
        ? {
          count: column.bars.count,
          diameterMm: column.bars.diameterMm,
          ldFooting: starter.ldM,
          lapAbove: CLASS_B_LAP_FACTOR * starter.ldM,
          // The same test `generateDowels` applies: a straight l_d that does not fit inside
          // the footing's useful height turns 90° over the bottom mat. Recorded here so the
          // document states it without asking the bar generator a second time.
          hooked: starter.ldM > f.thickness - f.cover - 0.05,
        }
        : null,
      draft: draftRecord,
    });
    const entry: FootingAssemblyEntry = {
      id: `F${f.id}`,
      check,
      elementIds,
      record: entryDraft,
      ...(column.bars && starter
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
            // §25.5.2.1 Class B: starters out of a footing lap all bars at one station, so
            // the Class A fraction is never satisfied and 1,3·ld is the honest lap.
            lapAbove: CLASS_B_LAP_FACTOR * starter.ldM,
            elementIds,
            edition: input.edition,
          },
        }
        : {}),
    };
    if (!column.bars) {
      unsupported.push(msg('footing.run.noColumnBars', { footing: f.name }));
    }

    outcomes.push({
      footingId: f.id, name: f.name, check, entry, level,
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
      'bearing' | 'flexure' | 'oneWayShear' | 'punching' | 'dowels' | 'starterTies'>,
    refs: readonly ClauseRef[],
  ) => FamilyRecordDraft<FootingDesignRecord>;
}): FamilyRecordDraft<FootingDesignRecord> {
  const { check, governing } = args;
  const combo = governing.combinationName;
  const b = check.bearing;
  const punch = check.punching;

  // The factored net upward pressure the strength checks were run against: N_u / (B·L), the
  // same expression `checkFooting` uses. Restated here for ONE purpose — measuring the
  // punching free-body residual against it — and never fed back into a capacity.
  const area = args.B * args.L;
  const qFactored = area > 0 ? args.factoredAxial / area : 0;
  const enclosed = punch?.critical.enclosedArea ?? 0;
  const residual = punch && punch.demand.outcome === 'DERIVED' && qFactored > 0
    ? args.factoredAxial - (punch.demand.Vu + qFactored * enclosed)
    : null;

  const bearing: FootingDesignRecord['bearing'] = {
    status: b.status, qMax: b.qMax, qMin: b.qMin, eB: b.eB, eL: b.eL,
    uplift: b.uplift, allowable: args.allowableBearing, utilization: b.utilization,
  };
  const flexure: FootingDesignRecord['flexure'] = {
    status: 'OK', Mu: check.Mu, criticalSection: 0,
  };
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
      key: 'flexure', status: 'OK', utilization: null,
      governingCombination: combo, refs: [], unsupported: [],
    },
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
