/**
 * The RcCadHandoffV2 producer — the coordinated footing reinforcement assembly.
 *
 * ── What this is not ────────────────────────────────────────────────
 *
 * Not a wider V1. V1's builder still exists, still produces V1 documents, and now REFUSES live
 * input whose families it cannot name — see `footing.cad.refusal.incompatibleWithV1`. The two
 * share every pure mapper (segments, treatments, findings, extents, rounding) by import, because
 * a second spelling of `outSegment` would be a second geometry language to keep in step. What
 * they do not share is the family vocabulary or the scope, and that is the whole difference.
 *
 * ── Where each fact comes from ──────────────────────────────────────
 *
 * Nothing here re-derives an engineering result. Bars, marks, cutting lengths and the conflicts
 * between them come from the production assembly. The mat's direction, physical layer, axis
 * elevation, cover to the soffit and distribution regions come from the footing RECORD —
 * `bottomMatGeometry` for what was placed, `flexure.bottomMat` for the region geometry the design
 * allocated — so a consumer reading `layer: 'LOWER'` reads the RESOLVED order rather than an
 * elevation someone clustered.
 *
 * Families come from `rc-cad-families`, which names each bar from what the generators recorded. A
 * bar it cannot name is refused, never absorbed.
 *
 * ── The findings are the point ───────────────────────────────────────
 *
 * On the canonical fixture four corner starters run parallel to the mat bars they pass above at
 * 27,97 mm clear against the 40,00 mm §25.2.3 requires of a pair containing a column bar. Those
 * pairs are mat-to-starter, so V1 could not carry them: one of the two bars was outside its scope.
 * They are in scope here, with both stable ids, Stabileo's own class, the measured clear distance
 * and the required one — and they make `statuses.constructible` false.
 *
 * A constructibility failure blocks ISSUANCE, not visualisation. The geometry is still exported,
 * because a detailer needs to see the clash in order to resolve it.
 */

import { minClearSpacingFor } from '../codes/cirsoc201/spacing';
import { COLLISION_CHORD_TOLERANCE } from '../engine/detailing/collision';
import type { BarPath } from '../codes/cirsoc201/bar-geometry';
import type { BarConflict } from '../engine/detailing/collision';
import {
  bodyIdForColumn, bodyIdForFooting, checkIdFor, clauseOut, conflictOrder,
  coverRequirementIdFor, crossesElevation, familyIdFor, interfaceIdFor, outFinding, outSegment,
  outTreatment, reachesBelow, round, surfaceExtent,
  type CadTranslate, type RcCadHandoffRefusal, type RcCadHandoffSource,
} from './rc-cad-handoff';
import {
  CODE_AGGREGATE_ASSUMED, CODE_COLUMN_BASE_ABOVE_FOOTING, CODE_COLUMN_COVER_OUT_OF_SCOPE,
  CODE_COLUMN_STUB_TRUNCATED, CODE_EXTENTS_FROM_SAMPLER, CODE_NO_CONTAINMENT_CHECKER,
  type CadBar, type CadCheck, type CadClearSpacingRequirement, type CadConcreteBody,
  type CadConcreteInterface, type CadCoverRequirement, type CadMark, type CadNote,
} from './rc-cad-handoff-types';
import {
  CODE_V2_BOTTOM_MAT_MODELED, CODE_V2_MAT_STARTER_SPACING,
  CODE_V2_PUNCHING_MOMENT_UNSUPPORTED, CODE_V2_TOP_NOT_EVALUATED,
  RC_CAD_HANDOFF_V2_SCHEMA, RC_CAD_HANDOFF_V2_SCHEMA_VERSION,
  type CadMatDirection, type CadMatFamilyDetail, type CadMatRegion, type CadMatRegionKind,
  type CadReinforcementFamilyV2, type CadStatusesV2, type RcCadHandoffV2,
} from './rc-cad-handoff-v2-types';
import {
  CAD_FAMILY_ORDER, partitionCadFamilies, type CadFamilyKindV2,
} from './rc-cad-families';

export type RcCadHandoffV2Result =
  | { ok: true; handoff: RcCadHandoffV2 }
  | { ok: false; refusals: RcCadHandoffRefusal[] };

/** The clause each family exists to satisfy. Stated per family, never as one blanket ref. */
const FAMILY_CLAUSE: Record<CadFamilyKindV2, { clause: string; label: string }> = {
  columnDowel: { clause: '16.3.4', label: 'transmisión de fuerzas por armadura' },
  starterTie: {
    clause: '10.7.6.1.1', label: 'estribos en toda la altura del elemento comprimido',
  },
  starterCrosstie: {
    clause: '10.7.6.3', label: 'restricción lateral de barras longitudinales',
  },
  footingBottomMatX: {
    clause: '13.3.3.2', label: 'distribución de la armadura de flexión de la base',
  },
  footingBottomMatY: {
    clause: '13.3.3.2', label: 'distribución de la armadura de flexión de la base',
  },
};

const FAMILY_PURPOSE_KEY: Record<CadFamilyKindV2, string> = {
  columnDowel: 'footing.cad.family.columnDowel',
  starterTie: 'footing.cad.family.starterTie',
  starterCrosstie: 'footing.cadv2.family.starterCrosstie',
  footingBottomMatX: 'footing.cadv2.family.footingBottomMatX',
  footingBottomMatY: 'footing.cadv2.family.footingBottomMatY',
};

/** §13.3.3 region kinds, as the design records them, mapped to the document's vocabulary. */
function regionKindOut(kind: string): CadMatRegionKind {
  if (kind === 'CENTRAL_BAND') return 'CENTRAL_BAND';
  if (kind === 'OUTSIDE_BAND') return 'OUTSIDE_BAND';
  return 'UNIFORM_FULL_WIDTH';
}

/** The footing record on this assembly, or null. */
function footingRecordOf(source: RcCadHandoffSource): Record<string, unknown> | null {
  const rec = (source.assembly.families ?? [])
    .find((r) => r.family === 'footing' && r.ownerId === `F${source.footing.id}`);
  return (rec as unknown as Record<string, unknown>) ?? null;
}

/* eslint-disable-next-line complexity */
export function buildRcCadHandoffV2(
  source: RcCadHandoffSource, translate: CadTranslate,
): RcCadHandoffV2Result {
  const { footing: f, assembly, edition } = source;
  const refusals: RcCadHandoffRefusal[] = [];
  const refuse = (code: string, messageKey: string, params?: Record<string, unknown>) =>
    refusals.push({ code, messageKey, params });

  // ── The same input preconditions V1 states ───────────────────
  //
  // Identical, deliberately: a rotated or eccentric footing is no more resolvable in V2 than in
  // V1, and a V2 document that quietly accepted one would place the interface somewhere nobody
  // decided.
  if (!source.column) {
    refuse('NO_COLUMN_REFERENCE', 'footing.cad.refusal.noColumn', { footing: f.name });
  }
  if (!(f.B > 0) || !(f.L > 0) || !(f.thickness > 0)) {
    refuse('FOOTING_NOT_DIMENSIONED', 'footing.cad.refusal.notDimensioned', { footing: f.name });
  }
  if (f.rotationDeg !== 0) {
    refuse('FOOTING_ROTATION_NOT_RESOLVED', 'footing.cad.refusal.rotated',
      { footing: f.name, rotation: f.rotationDeg });
  }
  if (f.eccentricityB !== 0 || f.eccentricityL !== 0) {
    refuse('FOOTING_ECCENTRICITY_NOT_RESOLVED', 'footing.cad.refusal.eccentric', {
      footing: f.name, b: f.eccentricityB, l: f.eccentricityL,
    });
  }
  if (f.pedestal) {
    refuse('PEDESTAL_NOT_SUPPORTED', 'footing.cad.refusal.pedestal', { footing: f.name });
  }
  const column = source.column;
  if (!column || refusals.length > 0) return { ok: false, refusals };

  // ── Scope, then family ──────────────────────────────────────
  //
  // Ownership scopes WHICH steel belongs to this document; the taxonomy names WHAT each piece is.
  // Keeping the two apart is the correction V2 exists for: conflating them let a mat bar be a
  // column dowel.
  const owned = assembly.bars.filter((b) => b.ownerElementIds.includes(column.elementId));
  const partition = partitionCadFamilies(owned);

  if (owned.length === 0) {
    refuse('NO_TRANSFER_CAGE', 'footing.cad.refusal.noCage', { footing: f.name });
  }
  if ((partition.byKind.get('columnDowel') ?? []).length === 0) {
    refuse('NO_COLUMN_DOWELS', 'footing.cad.refusal.noDowels', { footing: f.name });
  }
  if (partition.refused.length > 0) {
    // Strict, and it stays strict: a bar whose identity this cannot name is either new steel or
    // self-contradictory, and both are conditions to refuse rather than describe.
    refuse('UNCLASSIFIED_CAGE_BAR', 'footing.cad.refusal.unclassifiedBar', {
      footing: f.name,
      bars: partition.refused.map((r) => r.bar.id).sort().join(', '),
    });
  }
  if (refusals.length > 0) return { ok: false, refusals };

  const sortById = (xs: readonly BarPath[]) =>
    [...xs].sort((a, b) => a.id.localeCompare(b.id));
  /** Bars in family order, then by id: deterministic and grouped as a reader expects. */
  const barsSorted: BarPath[] = CAD_FAMILY_ORDER
    .flatMap((kind) => sortById(partition.byKind.get(kind) ?? []));
  const barIdSet = new Set(barsSorted.map((b) => b.id));
  const familyIdOfBar = new Map<string, string>();

  // ── Geometry: the two bodies and their interface ─────────────
  const centre = { x: source.node.x + f.eccentricityB, y: source.node.y + f.eccentricityL };
  const footingBottomZ = f.foundingElevation;
  const footingTopZ = f.foundingElevation + f.thickness;

  /**
   * The stub reaches the top of the STARTER cage, not of every bar in the document.
   *
   * V1 took the maximum extent of everything it carried, which was the starter cage and nothing
   * else. In V2 the document also carries the mats, and a mat bar lies near the soffit — so the
   * same expression would still work, but only by accident. Taking it from the starter families
   * states the intent: the stub exists to show the connection, and the connection is the
   * starters.
   */
  const starterBars = (['columnDowel', 'starterTie', 'starterCrosstie'] as const)
    .flatMap((kind) => partition.byKind.get(kind) ?? []);
  const cageTopZ = Math.max(...starterBars.map((b) => surfaceExtent(b).maxZ));
  const stubTopZ = Math.min(cageTopZ, column.topZ);
  if (!(stubTopZ > footingTopZ)) {
    refuse('COLUMN_STUB_HAS_NO_EXTENT', 'footing.cad.refusal.noStubExtent', {
      footing: f.name, top: stubTopZ, base: footingTopZ,
    });
    return { ok: false, refusals };
  }

  const footingBodyId = bodyIdForFooting(f.id);
  const columnBodyId = bodyIdForColumn(column.elementId);
  const ifaceId = interfaceIdFor(f.id, column.elementId);

  const note = (
    code: string, messageKey: string, params?: Record<string, unknown>,
    extra?: Partial<CadNote>,
  ): CadNote => ({
    code, messageKey, text: translate(messageKey, params),
    ...(params ? { params } : {}), ...extra,
  });

  const footingBody: CadConcreteBody = {
    bodyId: footingBodyId,
    role: 'footing',
    source: { kind: 'footing', id: f.id, name: f.name, revision: f.revision },
    materialRef: source.concreteMaterialRef ?? null,
    truncatedFaces: [],
    shape: {
      kind: 'box',
      B: f.B, L: f.L, height: f.thickness,
      centre: { x: centre.x, y: centre.y, z: footingBottomZ + f.thickness / 2 },
      rotationDeg: f.rotationDeg,
    },
  };

  const columnBody: CadConcreteBody = {
    bodyId: columnBodyId,
    role: 'supportedColumn',
    source: {
      kind: 'element', id: column.elementId,
      ...(column.sectionName ? { sectionName: column.sectionName } : {}),
    },
    elementId: column.elementId,
    materialRef: source.concreteMaterialRef ?? null,
    truncatedFaces: ['top'],
    derivation: note(CODE_COLUMN_STUB_TRUNCATED, 'footing.cad.derivation.columnStub', {
      element: column.elementId,
      base: round(footingTopZ), top: round(stubTopZ),
      B: round(column.b), L: round(column.h),
      cageTop: round(cageTopZ), columnTop: round(column.topZ),
    }, { bodyIds: [columnBodyId], elementIds: [column.elementId] }),
    shape: {
      kind: 'box',
      B: column.b, L: column.h, height: stubTopZ - footingTopZ,
      centre: { x: centre.x, y: centre.y, z: (footingTopZ + stubTopZ) / 2 },
      rotationDeg: f.rotationDeg,
    },
  };

  const crossing = barsSorted.filter((b) => crossesElevation(b, footingTopZ));
  const iface: CadConcreteInterface = {
    interfaceId: ifaceId,
    kind: 'concreteToConcrete',
    participants: { belowBodyId: footingBodyId, aboveBodyId: columnBodyId },
    geometry: {
      kind: 'planarRectZ',
      elevation: footingTopZ,
      B: column.b, L: column.h,
      centre: { x: centre.x, y: centre.y, z: footingTopZ },
      rotationDeg: f.rotationDeg,
    },
    exposure: 'internal',
    ...(crossing.length > 0
      ? {
        intentionalBarPassage: {
          barIds: crossing.map((b) => b.id),
          reasonKey: 'footing.cad.interface.intentionalPassage',
          clauseRefs: [{
            code: 'cirsoc-201', edition, clause: '16.3.4',
            label: 'transmisión de fuerzas por armadura en la interfaz',
          }],
        },
      }
      : {}),
  };

  // ── Mat metadata, read from the record ──────────────────────
  const record = footingRecordOf(source);
  const matGeom = record?.bottomMatGeometry as {
    lowerLayerAxis?: 'X' | 'Y';
    layerOrder?: string;
    provenance?: Array<{
      id: string; axis: 'X' | 'Y'; region: string; regionIndex: number;
      layer: 'LOWER' | 'UPPER'; centreElevation: number; clearCoverToSoffit: number;
    }>;
    schedule?: Array<{
      axis: 'X' | 'Y'; region: string; regionIndex: number; layer: 'LOWER' | 'UPPER';
      spacingCentre: number; spacingClear: number; barIds: string[];
    }>;
  } | null | undefined;
  const flexureMat = (record?.flexure as {
    bottomMat?: {
      x?: { regions?: Array<{ kind: string; width: number; centreOffset: number }> };
      y?: { regions?: Array<{ kind: string; width: number; centreOffset: number }> };
    };
  } | undefined)?.bottomMat;

  const matDetailFor = (direction: CadMatDirection): CadMatFamilyDetail | undefined => {
    const prov = (matGeom?.provenance ?? []).filter((p) => p.axis === direction);
    const rows = (matGeom?.schedule ?? []).filter((r) => r.axis === direction);
    if (prov.length === 0 || rows.length === 0) return undefined;
    const designRegions = (direction === 'X' ? flexureMat?.x : flexureMat?.y)?.regions ?? [];
    const regions: CadMatRegion[] = rows
      .map((r, i) => {
        const design = designRegions[i];
        return {
          kind: regionKindOut(r.region),
          barIds: [...r.barIds].sort(),
          spacingCentre: r.spacingCentre,
          spacingClear: r.spacingClear,
          width: design?.width ?? 0,
          centreOffset: design?.centreOffset ?? 0,
        };
      });
    return {
      direction,
      layer: prov[0].layer,
      // The bar AXIS elevation in model coordinates: the record carries it above the soffit.
      axisElevation: footingBottomZ + prov[0].centreElevation,
      clearCoverToSoffit: prov[0].clearCoverToSoffit,
      regions,
    };
  };

  // ── Families ────────────────────────────────────────────────
  const families: CadReinforcementFamilyV2[] = [];
  for (const kind of CAD_FAMILY_ORDER) {
    const bars = sortById(partition.byKind.get(kind) ?? []);
    if (bars.length === 0) continue;
    const familyId = familyIdFor(kind, f.id, column.elementId);
    for (const b of bars) familyIdOfBar.set(b.id, familyId);
    const clause = FAMILY_CLAUSE[kind];
    families.push({
      familyId,
      kind,
      purposeKey: FAMILY_PURPOSE_KEY[kind],
      barIds: bars.map((b) => b.id),
      clauseRefs: [{ code: 'cirsoc-201', edition, clause: clause.clause, label: clause.label }],
      ...(kind === 'footingBottomMatX' || kind === 'footingBottomMatY'
        ? (() => {
          const detail = matDetailFor(kind === 'footingBottomMatX' ? 'X' : 'Y');
          return detail ? { mat: detail } : {};
        })()
        : {}),
      ...(kind === 'starterTie' || kind === 'starterCrosstie'
        ? {
          tie: {
            legsContributed: kind === 'starterTie' ? 2 : 1,
            stations: [...new Set(bars
              .map((b) => b.station)
              .filter((s): s is number => typeof s === 'number')
              .map((s) => round(s)))].sort((a, b) => a - b),
          },
        }
        : {}),
    });
  }

  // ── Bars and marks ──────────────────────────────────────────
  const markOfBar = new Map<string, string>();
  for (const m of assembly.marks) {
    for (const id of m.barIds) markOfBar.set(id, m.mark);
  }

  const bars: CadBar[] = barsSorted.map((b) => ({
    id: b.id,
    ...(markOfBar.has(b.id) ? { mark: markOfBar.get(b.id)! } : {}),
    diameterMm: b.diameterMm,
    role: b.role,
    familyId: familyIdOfBar.get(b.id)!,
    ...(b.layerId ? { layerId: b.layerId } : {}),
    segments: b.segments.map(outSegment),
    startTreatment: outTreatment(b.startTreatment),
    endTreatment: outTreatment(b.endTreatment),
    cuttingLength: b.cuttingLength,
    ownerElementIds: [...b.ownerElementIds].sort((x, y) => x - y),
  }));

  const marks: CadMark[] = assembly.marks
    .filter((m) => m.barIds.some((id) => barIdSet.has(id)))
    .map((m) => ({
      mark: m.mark,
      diameterMm: m.diameterMm,
      cuttingLength: m.cuttingLength,
      quantity: m.quantity,
      ...(m.shape ? { shape: m.shape } : {}),
      ...(typeof m.massKg === 'number' ? { massKg: m.massKg } : {}),
      role: m.role,
      barIds: m.barIds.filter((id) => barIdSet.has(id)).sort(),
      ...(m.ownerElementIds
        ? { ownerElementIds: [...m.ownerElementIds].sort((x, y) => x - y) }
        : {}),
    }))
    .sort((a, b) => a.mark.localeCompare(b.mark));

  // ── Requirements ────────────────────────────────────────────
  const inFooting = barsSorted.filter((b) => reachesBelow(b, footingTopZ));
  const coverReq: CadCoverRequirement = {
    requirementId: coverRequirementIdFor(f.id),
    elementId: f.id,
    elementType: 'footing',
    appliesToBodyIds: [footingBodyId],
    appliesToBarIds: inFooting.map((b) => b.id),
    measurementScope: {
      withinBodyId: footingBodyId,
      excludeInterfaceIds: [ifaceId],
      excludeTruncatedFaces: true,
    },
    distance: f.cover,
    unit: 'm',
    category: 'placementInput',
    provenance: {
      source: 'web/src/lib/model/footing.ts#Footing.cover',
      messageKey: 'footing.cad.cover.placementIntent',
    },
  };

  const clearSpacing: CadClearSpacingRequirement[] = [];
  const rolePairs: Array<[string, string]> = [
    ['longitudinal', 'longitudinal'], ['longitudinal', 'transverse'],
    ['transverse', 'transverse'],
  ];
  const diaOfRole = new Map<string, number>();
  for (const b of barsSorted) {
    diaOfRole.set(b.role, Math.max(diaOfRole.get(b.role) ?? 0, b.diameterMm));
  }
  for (const [roleA, roleB] of rolePairs) {
    const dA = diaOfRole.get(roleA);
    const dB = diaOfRole.get(roleB);
    if (dA === undefined || dB === undefined) continue;
    const memberKind = roleA === 'transverse' || roleB === 'transverse' ? 'beam' : 'column';
    const governing = Math.max(dA, dB);
    const rule = minClearSpacingFor(edition, memberKind, {
      barDiameterMm: governing, maxAggregateSizeMm: source.maxAggregateSizeMm,
    });
    clearSpacing.push({
      requirementId: `req:clear:rule:${memberKind}:${roleA}-${roleB}:d${governing}`,
      appliesToRolePair: {
        roleA, roleB, memberKind, governingBarDiameterMm: governing,
        governedBy: rule.governedBy,
      },
      distance: rule.minClear,
      unit: 'm',
      category: 'codeDerived',
      provenance: {
        source: 'web/src/lib/codes/cirsoc201/spacing.ts#minClearSpacingFor',
        clauseRefs: rule.refs.map(clauseOut),
      },
    });
  }

  // ── Checks ──────────────────────────────────────────────────
  //
  // Both bars of a pair must be in this document, and now they ARE: the four mat-to-starter
  // pairs V1 had to drop are in scope here. That is the whole reason V2 exists, so nothing
  // filters them.
  const conflicts: BarConflict[] = assembly.conflicts
    .filter((c) => barIdSet.has(c.barA) && barIdSet.has(c.barB))
    .sort(conflictOrder);
  const overlaps = conflicts.filter((c) => c.pairClass === 'prohibitedOverlap');
  const spacingConflicts = conflicts.filter((c) => c.pairClass !== 'prohibitedOverlap');

  for (const c of conflicts) {
    clearSpacing.push({
      requirementId: `req:clear:pair:${c.barA}|${c.barB}`,
      barIdA: c.barA, barIdB: c.barB,
      ...(c.pairClass ? { pairClass: c.pairClass } : {}),
      reportable: true,
      elementIds: [...c.elementIds].sort((x, y) => x - y),
      distance: c.required,
      unit: 'm',
      category: 'codeDerived',
      provenance: {
        source: 'web/src/lib/engine/detailing/classify.ts#classifyPair',
        ...(c.classLabelKey ? { messageKey: c.classLabelKey } : {}),
      },
    });
  }
  clearSpacing.sort((a, b) => a.requirementId.localeCompare(b.requirementId));

  const allBarIds = barsSorted.map((b) => b.id);
  const bothBodies = [footingBodyId, columnBodyId];

  const checks: CadCheck[] = [
    {
      checkId: checkIdFor('barCollision', `footing:${f.id}`),
      checkKind: 'barCollision',
      authority: 'stabileo',
      evaluationStatus: 'EVALUATED',
      consumerObservationPolicy: 'MAY_CROSS_CHECK',
      requirementIds: overlaps.map((c) => `req:clear:pair:${c.barA}|${c.barB}`),
      scope: { elementIds: [column.elementId], barIds: allBarIds, bodyIds: bothBodies },
      findings: overlaps.map(outFinding),
      provenance: {
        source: 'web/src/lib/engine/detailing/collision.ts#detectCollisions',
        messageKey: 'footing.cad.check.collision',
      },
    },
    {
      checkId: checkIdFor('barClearSpacing', `footing:${f.id}`),
      checkKind: 'barClearSpacing',
      authority: 'stabileo',
      evaluationStatus: 'EVALUATED',
      consumerObservationPolicy: 'MAY_CROSS_CHECK',
      requirementIds: clearSpacing
        .filter((r) => r.appliesToRolePair !== undefined || r.pairClass !== 'prohibitedOverlap')
        .map((r) => r.requirementId),
      scope: { elementIds: [column.elementId], barIds: allBarIds, bodyIds: bothBodies },
      findings: spacingConflicts.map(outFinding),
      provenance: {
        source: 'web/src/lib/engine/detailing/collision.ts#detectCollisions',
        messageKey: 'footing.cad.check.clearSpacing',
      },
    },
    {
      checkId: checkIdFor('concreteCover', `footing:${f.id}`),
      checkKind: 'concreteCover',
      authority: 'none',
      evaluationStatus: 'NOT_EVALUATED',
      consumerObservationPolicy: 'MAY_OBSERVE_NOT_COMPARABLE',
      requirementIds: [coverReq.requirementId],
      scope: { elementIds: [f.id], barIds: inFooting.map((b) => b.id), bodyIds: [footingBodyId] },
      // A NOT_EVALUATED check must say WHY, or it reads as an omission rather than a decision.
      notEvaluatedCode: CODE_NO_CONTAINMENT_CHECKER,
      notEvaluatedReason: translate('footing.cad.notEvaluated.footingCover', { footing: f.name }),
      provenance: { messageKey: 'footing.cad.check.footingCover' },
    },
    {
      checkId: checkIdFor('concreteCover', `column:${column.elementId}`),
      checkKind: 'concreteCover',
      authority: 'none',
      evaluationStatus: 'NOT_EVALUATED',
      consumerObservationPolicy: 'OUT_OF_SCOPE',
      scope: { elementIds: [column.elementId], bodyIds: [columnBodyId] },
      notEvaluatedCode: CODE_COLUMN_COVER_OUT_OF_SCOPE,
      notEvaluatedReason: translate('footing.cad.notEvaluated.columnCover',
        { element: column.elementId }),
      provenance: { messageKey: 'footing.cad.check.columnCover' },
    },
    {
      checkId: checkIdFor('reinforcementContainment', `footing:${f.id}`),
      checkKind: 'reinforcementContainment',
      authority: 'none',
      evaluationStatus: 'NOT_EVALUATED',
      consumerObservationPolicy: 'MAY_OBSERVE_NOT_COMPARABLE',
      scope: { elementIds: [f.id], barIds: allBarIds, bodyIds: [footingBodyId] },
      notEvaluatedCode: CODE_NO_CONTAINMENT_CHECKER,
      notEvaluatedReason: translate('footing.cad.notEvaluated.containment', { footing: f.name }),
      provenance: { messageKey: 'footing.cad.check.containment' },
    },
  ];

  // ── Statuses, kept apart from one another ───────────────────
  const matModeled = (matGeom?.provenance ?? []).length > 0;
  /**
   * Every status read from the record's OWN field, by that field's own name.
   *
   * `bottomMatAnchorage` carries `outcome`, not `status` — a first version of this read `.status`,
   * found `undefined`, and reported NOT_EVALUATED for an anchorage the record had VERIFIED. The
   * field names are asserted by the V2 status test rather than trusted.
   */
  const anchorage = record?.bottomMatAnchorage as { outcome?: string } | null | undefined;
  const flexure = record?.flexure as { status?: string } | null | undefined;
  const matStatus = (matGeom as { status?: string } | null | undefined)?.status;
  const punchingUnsupported = ((record?.punching as { status?: string } | null)?.status
    ?? '').toUpperCase() === 'UNSUPPORTED';
  const blockers: string[] = [];
  if (overlaps.length > 0) blockers.push('PROHIBITED_BAR_OVERLAP');
  if (spacingConflicts.length > 0) blockers.push(CODE_V2_MAT_STARTER_SPACING);
  const statuses: CadStatusesV2 = {
    constructible: blockers.length === 0,
    constructibilityBlockers: blockers,
    bottomFlexure: (flexure?.status as CadStatusesV2['bottomFlexure']) ?? 'NOT_EVALUATED',
    bottomMatGeometry:
      (matStatus as CadStatusesV2['bottomMatGeometry']) ?? 'NOT_EVALUATED',
    bottomAnchorage:
      (anchorage?.outcome as CadStatusesV2['bottomAnchorage']) ?? 'NOT_EVALUATED',
    topReinforcement: 'NOT_EVALUATED',
    punchingMomentTransfer: punchingUnsupported ? 'UNSUPPORTED' : 'EVALUATED',
  };

  // ── Conditions ──────────────────────────────────────────────
  const assumptions: CadNote[] = [
    // The stub's top face is a CUT, not a concrete surface, and that belongs in the assumptions a
    // consumer reads — not only in the body's own `derivation`, where a reader scanning the
    // assumption list would never find it.
    note(CODE_COLUMN_STUB_TRUNCATED, 'footing.cad.assumption.stubTruncated', {
      element: column.elementId, top: round(stubTopZ),
    }, { bodyIds: [columnBodyId] }),
    note(CODE_EXTENTS_FROM_SAMPLER, 'footing.cad.assumption.sampler',
      { tolerance: COLLISION_CHORD_TOLERANCE * 1000 }),
    ...(column.baseZ > footingTopZ + 1e-9
      ? [note(CODE_COLUMN_BASE_ABOVE_FOOTING, 'footing.cad.assumption.columnBaseAbove', {
        element: column.elementId, base: round(column.baseZ), top: round(footingTopZ),
        gap: round(column.baseZ - footingTopZ),
      }, { elementIds: [column.elementId] })]
      : []),
    ...(source.aggregateAssumed
      ? [note(CODE_AGGREGATE_ASSUMED, 'footing.cad.assumption.aggregate',
        { mm: source.maxAggregateSizeMm })]
      : []),
    ...(source.productionAssumptions ?? []),
  ];

  const unsupported: CadNote[] = [
    // The bottom mat is CARRIED, and saying so is not a limitation — it is the scope statement
    // that keeps a reader from applying V1's "mats absent" expectation to this document.
    ...(matModeled
      ? [note(CODE_V2_BOTTOM_MAT_MODELED, 'footing.cadv2.scope.bottomMatModeled', {
        footing: f.name,
        x: (partition.byKind.get('footingBottomMatX') ?? []).length,
        y: (partition.byKind.get('footingBottomMatY') ?? []).length,
      }, { bodyIds: [footingBodyId] })]
      : []),
    note(CODE_V2_TOP_NOT_EVALUATED, 'footing.cadv2.unsupported.topNotEvaluated',
      { footing: f.name }, { bodyIds: [footingBodyId] }),
    ...(punchingUnsupported
      ? [note(CODE_V2_PUNCHING_MOMENT_UNSUPPORTED,
        'footing.cadv2.unsupported.punchingMoment', { footing: f.name },
        { bodyIds: [footingBodyId] })]
      : []),
    ...(spacingConflicts.length > 0
      ? [note(CODE_V2_MAT_STARTER_SPACING, 'footing.cadv2.unsupported.matStarterSpacing', {
        footing: f.name, n: spacingConflicts.length,
        measured: round(Math.min(...spacingConflicts.map((c) => c.clearance)) * 1000),
        required: round(Math.max(...spacingConflicts.map((c) => c.required)) * 1000),
      }, { bodyIds: [footingBodyId] })]
      : []),
    note(CODE_NO_CONTAINMENT_CHECKER, 'footing.cad.unsupported.containment',
      { footing: f.name }, { bodyIds: [footingBodyId] }),
    note(CODE_COLUMN_COVER_OUT_OF_SCOPE, 'footing.cad.unsupported.columnCover',
      { element: column.elementId }, { bodyIds: [columnBodyId] }),
    ...(source.productionUnsupported ?? []),
  ];

  const handoff: RcCadHandoffV2 = {
    schema: RC_CAD_HANDOFF_V2_SCHEMA,
    schemaVersion: RC_CAD_HANDOFF_V2_SCHEMA_VERSION,
    // The same producer name V1 uses, at version 2. A different NAME would suggest a different
    // producer; the version is what changed.
    generator: { name: 'stabileo-rc-cad-handoff', version: '2.0.0' },
    ...(source.project ? { project: source.project } : {}),
    subject: {
      kind: 'footing', entityId: f.id, name: f.name,
      nodeId: f.nodeId, elementIds: [column.elementId],
    },
    assembly: {
      kind: 'footingReinforcementAssembly',
      completeness: 'bottomMatAndConnection',
      descriptionKey: 'footing.cadv2.assembly.description',
      families,
      bottomMatLayerOrder: matGeom?.lowerLayerAxis
        ? {
          lowerDirection: matGeom.lowerLayerAxis,
          resolution: matGeom.layerOrder ?? '',
        }
        : null,
    },
    units: { length: 'm', angle: 'deg', barDiameter: 'mm', mass: 'kg' },
    coordinateSystem: { up: 'Z', handedness: 'right' },
    revisions: {
      ...source.revisions,
      entity: f.revision,
    },
    certificate: source.certificate,
    statuses,
    concrete: { bodies: [footingBody, columnBody], interfaces: [iface] },
    reinforcement: { bars, marks },
    requirements: { cover: [coverReq], clearSpacing },
    checks,
    assumptions,
    unsupported,
  };

  return { ok: true, handoff };
}

/**
 * Deterministic JSON: keys sorted at every level, two-space indent, trailing newline.
 *
 * The SAME canonical form V1 uses, and for the same reason: the manifest's SHA-256 is what tells
 * a reviewer whether two runs described the same assembly, so insertion order must not be part of
 * the contract. A first version of this called `JSON.stringify` directly and would have made the
 * checksum depend on the order this builder happens to assign fields.
 */
export function serializeRcCadHandoffV2(handoff: RcCadHandoffV2): string {
  const sorted = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sorted);
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(value as Record<string, unknown>).sort()) {
        const v = (value as Record<string, unknown>)[k];
        if (v !== undefined) out[k] = sorted(v);
      }
      return out;
    }
    return value;
  };
  return `${JSON.stringify(sorted(handoff), null, 2)}\n`;
}

/**
 * The download name, mirroring V1's convention with the version in it.
 *
 * Both revisions stay in the name, exactly as V1 does: a file on someone's disk has to be
 * attributable to the state it was exported from, and the demand revision is what makes a stale
 * export identifiable without opening it. A first version of this dropped `dem` and would have
 * made two exports of the same footing at different demands indistinguishable by name.
 */
export function rcCadHandoffV2Filename(handoff: RcCadHandoffV2): string {
  const slug = handoff.subject.name.trim().replace(/[^A-Za-z0-9._-]+/g, '-') || 'footing';
  const { detailing, demand } = handoff.revisions;
  return `rc-cad-handoff-v2-${slug}-det${detailing}-dem${demand}.json`;
}
