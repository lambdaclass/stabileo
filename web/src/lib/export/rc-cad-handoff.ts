/**
 * Producer for `RcCadHandoffV1` — the footing column-transfer cage.
 *
 * ── What this document is, and is not ───────────────────────────
 *
 * It is the **column dowels and starter ties connecting the footing to the supporting
 * column**, together with the two concrete components those bars pass between and the
 * interface between them. It is NOT complete footing reinforcement: PR18's documented scope
 * gives footings real dowels and starter ties, while the bottom and top mats remain drawing
 * requirements rather than physical bar geometry. `assembly.completeness` says so as a value,
 * `unsupported[]` says so as a condition with a stable code, and semantic validation refuses
 * any manifest that claims otherwise.
 *
 * ── Nothing here is invented ────────────────────────────────────
 *
 * Every number is read from the restored production model or from the production detailing
 * assembly. In particular:
 *
 *   * the column FOOTPRINT is the section `b`/`h` of the element the footing references,
 *     read the same way `collectFootingColumns` reads it — not a generic column size;
 *   * the stub's BASE is the footing top, `foundingElevation + thickness`, which is the same
 *     `footingTopZ` the production dowel generator placed the bars against;
 *   * the stub's TOP is the highest point of the production cage plus that bar's radius —
 *     the minimum plane that fully contains the steel. It is a truncation, declared as one;
 *   * bar EXTENTS and interface crossings come from the production arc-aware sampler
 *     `samplePath` at `COLLISION_CHORD_TOLERANCE`, the same path the collision detector
 *     follows, so an arc is never chorded here after being exact there.
 *
 * ── The interface is not an exposed face ────────────────────────
 *
 * The footing top beneath the column is an intentional concrete-to-concrete contact. A dowel
 * crossing it is the detail working. The interface is emitted explicitly, marked
 * `exposure: 'internal'`, listed in the footing cover requirement's
 * `measurementScope.excludeInterfaceIds`, and carries the crossing bars as
 * `intentionalBarPassage` — so a consumer has three independent reasons not to read a
 * penetration as a breach.
 *
 * ── Cover ───────────────────────────────────────────────────────
 *
 * Stabileo exports the footing cover PLACEMENT INTENT it already owns (`Footing.cover`,
 * never a hard-coded 50 mm) and reports containment as `NOT_EVALUATED`, because `checkCover`
 * has zero production callers. Column cover is `OUT_OF_SCOPE`: the footing value is not
 * applied to the stub, and no column cover requirement is emitted at all.
 *
 * Pure: no store, no runes, no clock. User-facing text arrives through the `translate`
 * callback, the same way `renderReportHtml` receives it.
 */

import type { BarPath, BarSegment, Point3 } from '../codes/cirsoc201/bar-geometry';
import { samplePath } from '../codes/cirsoc201/bar-geometry';
import { COLLISION_CHORD_TOLERANCE, type BarConflict } from '../engine/detailing/collision';
import { minClearSpacingFor } from '../codes/cirsoc201/spacing';
import type { RegulationEdition, ClauseRef } from '../codes/regulation';
import type { Footing } from '../model/footing';
import { partitionCadFamilies } from './rc-cad-families';
import type { DetailingAssembly } from '../engine/detailing/assembly';
import {
  RC_CAD_HANDOFF_SCHEMA, RC_CAD_HANDOFF_SCHEMA_VERSION,
  CODE_AGGREGATE_ASSUMED, CODE_COLUMN_BASE_ABOVE_FOOTING, CODE_COLUMN_COVER_OUT_OF_SCOPE,
  CODE_COLUMN_STUB_TRUNCATED, CODE_EXTENTS_FROM_SAMPLER, CODE_FOOTING_MAT_NOT_MODELED,
  CODE_NO_CONTAINMENT_CHECKER,
  type CadBar, type CadBarSegment, type CadCheck, type CadClauseRef,
  type CadClearSpacingRequirement, type CadConcreteBody, type CadConcreteInterface,
  type CadCoverRequirement, type CadFinding, type CadMark, type CadNote, type CadPoint3,
  type CadReinforcementFamily, type RcCadHandoffV1,
} from './rc-cad-handoff-types';

export const RC_CAD_GENERATOR_NAME = 'stabileo-rc-cad-handoff';
/**
 * Producer version, independent of `schemaVersion`.
 *
 * The schema says what the document may contain; this says which build wrote it. A fix to
 * the derivation that changes no field shapes bumps this and not the schema.
 */
export const RC_CAD_GENERATOR_VERSION = '1.0.0';

// ─── Input ───────────────────────────────────────────────────────

/** The column a footing supports, as the production model states it. */
export interface CadSourceColumn {
  elementId: number;
  /** Section plan dimensions, m — `b` spans the model X axis, `h` spans Y, for a vertical member. */
  b: number;
  h: number;
  sectionName?: string;
  /** Global Z of the element's lower node, m. */
  baseZ: number;
  /** Global Z of the element's upper node, m. The stub is never extended past it. */
  topZ: number;
}

export interface RcCadHandoffSource {
  footing: Footing;
  /** The supported node, in model coordinates. */
  node: { x: number; y: number; z?: number };
  column: CadSourceColumn | null;
  /** The production detailing assembly the cage came from. */
  assembly: DetailingAssembly;
  edition: RegulationEdition;
  /** Resolved coarse-aggregate size, mm, and whether it was assumed rather than stated. */
  maxAggregateSizeMm: number;
  aggregateAssumed: boolean;
  revisions: {
    detailing: number;
    demand: number;
    analysis?: number;
    loads?: number;
    regulation?: number;
  };
  certificate: {
    maturity: string;
    reviewState?: string;
    provisional?: string[];
    verifierId?: string;
    codeId?: string;
    codeEdition?: string;
  };
  concreteMaterialRef?: string | null;
  project?: { id?: string; name?: string };
  /** Extra assumptions the production run recorded, already rendered. */
  productionAssumptions?: CadNote[];
  /** Unsupported conditions the production run recorded, already rendered. */
  productionUnsupported?: CadNote[];
}

/** Renders a message key with parameters. Supplied by the caller, exactly as the document renderer receives it. */
export type CadTranslate = (key: string, params?: Record<string, unknown>) => string;

/**
 * A refusal to produce a manifest.
 *
 * Structured rather than a thrown string: the UI shows the reason and the test asserts on the
 * code. A manifest that could only be produced by guessing is not produced.
 */
export interface RcCadHandoffRefusal {
  code: string;
  messageKey: string;
  params?: Record<string, unknown>;
}

export type RcCadHandoffResult =
  | { ok: true; handoff: RcCadHandoffV1 }
  | { ok: false; refusals: RcCadHandoffRefusal[] };

// ─── Stable identifiers ──────────────────────────────────────────
//
// Derived from production entity identity, never from array position: an id that moves when
// a list is reordered cannot key a review across two revisions.

export const bodyIdForFooting = (footingId: number) => `body:footing:${footingId}`;
export const bodyIdForColumn = (elementId: number) => `body:column:${elementId}`;
export const interfaceIdFor = (footingId: number, elementId: number) =>
  `iface:footing:${footingId}:column:${elementId}`;
export const familyIdFor = (kind: string, footingId: number, elementId: number) =>
  `family:${kind}:footing:${footingId}:column:${elementId}`;
export const coverRequirementIdFor = (footingId: number) => `req:cover:footing:${footingId}`;
export const checkIdFor = (kind: string, scope: string) => `check:${kind}:${scope}`;

// ─── Geometry helpers ────────────────────────────────────────────

/**
 * The sampled centreline of a bar, following arcs.
 *
 * `samplePath` is the production sampler and `COLLISION_CHORD_TOLERANCE` the production
 * tolerance. Using anything else here would measure this cage against geometry the collision
 * detector never saw — the same class of error the stored arc `centre` exists to prevent.
 */
function centreline(bar: BarPath): Point3[] {
  return samplePath(bar, COLLISION_CHORD_TOLERANCE);
}

interface Extent { minZ: number; maxZ: number }

/** Vertical extent of a bar's SURFACE, m: the sampled centreline grown by the bar radius. */
export function surfaceExtent(bar: BarPath): Extent {
  const r = bar.diameterMm / 2000;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of centreline(bar)) {
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minZ: minZ - r, maxZ: maxZ + r };
}

/**
 * Does this bar's centreline cross an elevation?
 *
 * Measured on the CENTRELINE rather than the surface: a bar whose surface merely touches the
 * plane has not passed through the interface, and calling that a passage would list bars that
 * do not cross.
 */
export function crossesElevation(bar: BarPath, elevation: number): boolean {
  let below = false;
  let above = false;
  for (const p of centreline(bar)) {
    if (p.z < elevation) below = true;
    if (p.z > elevation) above = true;
    if (below && above) return true;
  }
  return false;
}

/** Is any part of this bar's centreline below an elevation? */
export function reachesBelow(bar: BarPath, elevation: number): boolean {
  return centreline(bar).some((p) => p.z < elevation);
}

export const pt = (p: Point3): CadPoint3 => ({ x: p.x, y: p.y, z: p.z });

export const clauseOut = (r: ClauseRef): CadClauseRef => ({
  code: r.regulation, edition: r.edition, clause: r.clause, label: r.label,
});

// ─── Serialisation ───────────────────────────────────────────────

/**
 * Deterministic JSON: keys sorted at every level, two-space indent, trailing newline.
 *
 * Identical input must produce identical bytes, because the manifest's SHA-256 is what tells
 * a reviewer whether two runs described the same cage. Insertion order is not a contract, so
 * sorting removes it as a source of difference.
 */
export function serializeRcCadHandoff(handoff: RcCadHandoffV1): string {
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
 * Stable filename.
 *
 * Footing name and the two revisions that decide whether the file is current — no timestamp,
 * because a timestamp makes two identical exports look different and makes a stale one look
 * fresh.
 */
export function rcCadHandoffFilename(handoff: RcCadHandoffV1): string {
  const slug = handoff.subject.name.trim().replace(/[^A-Za-z0-9._-]+/g, '-') || 'footing';
  const { detailing, demand } = handoff.revisions;
  return `rc-cad-handoff-${slug}-det${detailing}-dem${demand}.json`;
}

// ─── The producer ────────────────────────────────────────────────

/* eslint-disable-next-line complexity */
export function buildRcCadHandoff(
  source: RcCadHandoffSource, translate: CadTranslate,
): RcCadHandoffResult {
  const { footing: f, assembly, edition } = source;
  const refusals: RcCadHandoffRefusal[] = [];
  const refuse = (code: string, messageKey: string, params?: Record<string, unknown>) =>
    refusals.push({ code, messageKey, params });

  if (!source.column) {
    refuse('NO_COLUMN_REFERENCE', 'footing.cad.refusal.noColumn', { footing: f.name });
  }
  if (!(f.B > 0) || !(f.L > 0) || !(f.thickness > 0)) {
    refuse('FOOTING_NOT_DIMENSIONED', 'footing.cad.refusal.notDimensioned', { footing: f.name });
  }
  // A rotated footing already stops the production footing run, so a rotated one cannot
  // reach here with a cage. Refusing explicitly keeps the reason readable if it ever does.
  if (f.rotationDeg !== 0) {
    refuse('FOOTING_ROTATION_NOT_RESOLVED', 'footing.cad.refusal.rotated',
      { footing: f.name, rotation: f.rotationDeg });
  }
  // `Footing.eccentricityB/L` is documented as the offset of the footing CENTROID from the
  // node, while `run-footing-design` uses node + eccentricity as the COLUMN centre. With a
  // zero eccentricity the two readings coincide and nothing is ambiguous. With a non-zero one
  // they do not, and choosing between them would be inventing where the column stands.
  if (f.eccentricityB !== 0 || f.eccentricityL !== 0) {
    refuse('FOOTING_ECCENTRICITY_NOT_RESOLVED', 'footing.cad.refusal.eccentric', {
      footing: f.name, b: f.eccentricityB, l: f.eccentricityL,
    });
  }
  if (f.pedestal) {
    // A pedestal is a third concrete component with its own interfaces. Representing it
    // would be a real extension, not a rename of the stub.
    refuse('PEDESTAL_NOT_SUPPORTED', 'footing.cad.refusal.pedestal', { footing: f.name });
  }

  const column = source.column;
  if (!column || refusals.length > 0) return { ok: false, refusals };

  // ── The cage ────────────────────────────────────────────────
  //
  // Scoped by OWNERSHIP, not by id pattern: the transfer cage is the steel owned by the
  // column element the footing references. A slab bar in the same floor assembly is owned by
  // its panel and is therefore not in this document.
  //
  // Ownership answers "which member is this steel part of". It does NOT answer "what kind of
  // steel is this", and once the bottom mat became physical the two stopped coinciding: a
  // footing's bars are attributed to the COLUMN element — its dowels ARE column bars — so twenty
  // mat bars arrive owned by the same element as the cage, with `role: 'longitudinal'`, and the
  // classification below calls them column dowels.
  //
  // That is a real misdescription and it is NOT fixed by filtering the mats out: the mats are the
  // reinforcement this handoff should be carrying. It is fixed by naming every bar from what the
  // generators recorded — see `rc-cad-families.ts` — which needs a family vocabulary wider than
  // this frozen V1 union, and therefore a V2 document. `buildRcCadHandoffV2` is that document.
  //
  // This builder is retained for HISTORICAL input only. V1's declared families are
  // `columnDowel` and `starterTie`, so an assembly carrying mat bars or crossties is not a V1
  // subject, and the refusal below says so rather than silently describing it wrong or silently
  // dropping it. Both silences were considered and both are worse: one lies about what the steel
  // is, the other lies about what steel exists.
  const cage = assembly.bars.filter((b) => b.ownerElementIds.includes(column.elementId));
  const dowels = cage.filter((b) => b.role === 'longitudinal');
  const ties = cage.filter((b) => b.role === 'transverse');
  const unclassified = cage.filter((b) => b.role !== 'longitudinal' && b.role !== 'transverse');

  if (cage.length === 0) {
    refuse('NO_TRANSFER_CAGE', 'footing.cad.refusal.noCage', { footing: f.name });
  }
  if (dowels.length === 0) {
    refuse('NO_COLUMN_DOWELS', 'footing.cad.refusal.noDowels', { footing: f.name });
  }
  if (unclassified.length > 0) {
    // Every bar must have a stated family. A role this exporter does not map is a new kind of
    // steel in the assembly, and assigning it to an existing family would misdescribe it.
    refuse('UNCLASSIFIED_CAGE_BAR', 'footing.cad.refusal.unclassifiedBar', {
      footing: f.name, bars: unclassified.map((b) => b.id).sort().join(', '),
    });
  }
  /**
   * Families V1 cannot name, refused BY NAME so the remedy is obvious.
   *
   * Not "unclassified": `rc-cad-families` classifies these perfectly well. They are families V1
   * does not declare, which is a different fact and a different remedy — export V2.
   */
  const beyondV1 = partitionCadFamilies(cage);
  const foreignKinds = [...beyondV1.byKind.keys()]
    .filter((k) => k !== 'columnDowel' && k !== 'starterTie')
    .sort();
  if (foreignKinds.length > 0) {
    refuse('INPUT_NOT_V1_COMPATIBLE', 'footing.cad.refusal.incompatibleWithV1', {
      footing: f.name,
      families: foreignKinds.join(', '),
      bars: foreignKinds.reduce((n, k) => n + (beyondV1.byKind.get(k)?.length ?? 0), 0),
    });
  }
  if (beyondV1.refused.length > 0) {
    refuse('UNCLASSIFIED_CAGE_BAR', 'footing.cad.refusal.unclassifiedBar', {
      footing: f.name,
      bars: beyondV1.refused.map((r) => r.bar.id).sort().join(', '),
    });
  }
  if (refusals.length > 0) return { ok: false, refusals };

  const sortById = <T extends { id: string }>(xs: T[]) =>
    [...xs].sort((a, b) => a.id.localeCompare(b.id));
  const dowelsSorted = sortById(dowels);
  const tiesSorted = sortById(ties);
  const cageSorted = [...dowelsSorted, ...tiesSorted];
  const cageIds = new Set(cageSorted.map((b) => b.id));

  // ── Geometry: the two concrete components and their interface ──
  const centre = { x: source.node.x + f.eccentricityB, y: source.node.y + f.eccentricityL };
  const footingBottomZ = f.foundingElevation;
  /** The same expression `run-footing-design` hands the dowel generator as `footingTopZ`. */
  const footingTopZ = f.foundingElevation + f.thickness;

  // The minimum plane that fully contains the cage's steel, then never past the real column.
  const cageTopZ = Math.max(...cageSorted.map((b) => surfaceExtent(b).maxZ));
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
    // Only the TOP is a cut. The four sides are the real column faces and the bottom is the
    // interface, which is a contact rather than a truncation.
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

  const crossing = cageSorted.filter((b) => crossesElevation(b, footingTopZ));
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

  // ── Families ────────────────────────────────────────────────
  const dowelFamilyId = familyIdFor('columnDowel', f.id, column.elementId);
  const tieFamilyId = familyIdFor('starterTie', f.id, column.elementId);
  const families: CadReinforcementFamily[] = [{
    familyId: dowelFamilyId,
    kind: 'columnDowel',
    purposeKey: 'footing.cad.family.columnDowel',
    barIds: dowelsSorted.map((b) => b.id),
    clauseRefs: [{
      code: 'cirsoc-201', edition, clause: '16.3.4',
      label: 'transmisión de fuerzas por armadura',
    }],
  }];
  if (tiesSorted.length > 0) {
    families.push({
      familyId: tieFamilyId,
      kind: 'starterTie',
      purposeKey: 'footing.cad.family.starterTie',
      barIds: tiesSorted.map((b) => b.id),
      clauseRefs: [{
        code: 'cirsoc-201', edition, clause: '10.7.6.1.1',
        label: 'estribos en toda la altura del elemento comprimido',
      }],
    });
  }
  const familyOf = (bar: BarPath) => (bar.role === 'longitudinal' ? dowelFamilyId : tieFamilyId);

  // ── Bars and marks ──────────────────────────────────────────
  const markOfBar = new Map<string, string>();
  for (const m of assembly.marks) {
    for (const id of m.barIds) markOfBar.set(id, m.mark);
  }

  const bars: CadBar[] = cageSorted.map((b) => ({
    id: b.id,
    ...(markOfBar.has(b.id) ? { mark: markOfBar.get(b.id)! } : {}),
    diameterMm: b.diameterMm,
    role: b.role,
    familyId: familyOf(b),
    ...(b.layerId ? { layerId: b.layerId } : {}),
    segments: b.segments.map(outSegment),
    startTreatment: outTreatment(b.startTreatment),
    endTreatment: outTreatment(b.endTreatment),
    cuttingLength: b.cuttingLength,
    ownerElementIds: [...b.ownerElementIds].sort((x, y) => x - y),
  }));

  const marks: CadMark[] = assembly.marks
    .filter((m) => m.barIds.some((id) => cageIds.has(id)))
    .map((m) => ({
      mark: m.mark,
      diameterMm: m.diameterMm,
      cuttingLength: m.cuttingLength,
      quantity: m.quantity,
      ...(m.shape ? { shape: m.shape } : {}),
      ...(typeof m.massKg === 'number' ? { massKg: m.massKg } : {}),
      role: m.role,
      barIds: m.barIds.filter((id) => cageIds.has(id)).sort(),
      ...(m.ownerElementIds ? { ownerElementIds: [...m.ownerElementIds].sort((x, y) => x - y) } : {}),
    }))
    .sort((a, b) => a.mark.localeCompare(b.mark));

  // ── Requirements ────────────────────────────────────────────
  //
  // Cover: the footing's OWN persisted value, scoped to the footing body and to the bars that
  // actually have material inside the footing. The stub is deliberately absent from
  // `appliesToBodyIds`, and the interface from the measurable surfaces.
  const inFooting = cageSorted.filter((b) => reachesBelow(b, footingTopZ));
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
    // A placement input, not a verified output: `floor-design.ts` places bars at this cover
    // arithmetically and nothing afterwards measures the realised geometry.
    category: 'placementInput',
    provenance: {
      source: 'web/src/lib/model/footing.ts#Footing.cover',
      messageKey: 'footing.cad.cover.placementIntent',
    },
  };

  // Clear spacing has two honest shapes and they are NOT interchangeable:
  //
  //   * the code-derived RULE, which is a pure function of the edition, the governing member
  //     kind and the larger diameter, and can therefore be stated per role pair; and
  //   * a per-pair VERDICT, which `classifyPair` derives from the sampled closest approach.
  //
  // The second is never reconstructed here. Re-running the classifier without the collision
  // detector's closest-approach data would produce a different class from production, which is
  // precisely the divergence that makes a second implementation worse than none.
  const clearSpacing: CadClearSpacingRequirement[] = [];
  const rolePairs: Array<[string, string]> = [
    ['longitudinal', 'longitudinal'], ['longitudinal', 'transverse'], ['transverse', 'transverse'],
  ];
  const diaOfRole = new Map<string, number>();
  for (const b of cageSorted) {
    diaOfRole.set(b.role, Math.max(diaOfRole.get(b.role) ?? 0, b.diameterMm));
  }
  for (const [roleA, roleB] of rolePairs) {
    const dA = diaOfRole.get(roleA);
    const dB = diaOfRole.get(roleB);
    if (dA === undefined || dB === undefined) continue;
    // The one-line closure `coordinate-floor.ts` builds, reproduced exactly rather than
    // reinterpreted: a transverse participant makes the beam rule govern.
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
  const conflicts = assembly.conflicts
    .filter((c) => cageIds.has(c.barA) && cageIds.has(c.barB))
    .sort(conflictOrder);
  const overlaps = conflicts.filter((c) => c.pairClass === 'prohibitedOverlap');
  const spacing = conflicts.filter((c) => c.pairClass !== 'prohibitedOverlap');

  // A reported pair carries Stabileo's own classification and the number it was judged
  // against. Emitted as per-pair requirements so a consumer can key its cross-check to them.
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

  const allBarIds = cageSorted.map((b) => b.id);
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
      // The code-derived rules, plus only those pair requirements that ARE spacing verdicts. A
      // prohibited overlap is judged against zero by rule 1 of the classifier, before any
      // spacing clause is consulted, so listing it here would attribute it to a clause that
      // did not decide it.
      requirementIds: clearSpacing
        .filter((r) => r.appliesToRolePair !== undefined || r.pairClass !== 'prohibitedOverlap')
        .map((r) => r.requirementId),
      scope: { elementIds: [column.elementId], barIds: allBarIds, bodyIds: bothBodies },
      findings: spacing.map(outFinding),
      provenance: {
        source: 'web/src/lib/engine/detailing/collision.ts#detectCollisions',
        messageKey: 'footing.cad.check.clearSpacing',
      },
    },
    {
      // Cover on the FOOTING. A requirement exists and is real; the verdict does not.
      checkId: checkIdFor('concreteCover', `footing:${f.id}`),
      checkKind: 'concreteCover',
      authority: 'none',
      evaluationStatus: 'NOT_EVALUATED',
      notEvaluatedReason: translate('footing.cad.notEvaluated.footingCover', { footing: f.name }),
      notEvaluatedCode: CODE_NO_CONTAINMENT_CHECKER,
      consumerObservationPolicy: 'MAY_OBSERVE_NOT_COMPARABLE',
      requirementIds: [coverReq.requirementId],
      scope: {
        elementIds: [column.elementId],
        barIds: inFooting.map((b) => b.id),
        bodyIds: [footingBodyId],
        interfaceIds: [ifaceId],
      },
      provenance: { messageKey: 'footing.cad.check.footingCover' },
    },
    {
      // Cover on the COLUMN STUB. Deliberately a separate check with no requirement attached,
      // so the footing's number cannot be read as governing it.
      checkId: checkIdFor('concreteCover', `column:${column.elementId}`),
      checkKind: 'concreteCover',
      authority: 'none',
      evaluationStatus: 'NOT_EVALUATED',
      notEvaluatedReason: translate('footing.cad.notEvaluated.columnCover',
        { element: column.elementId }),
      notEvaluatedCode: CODE_COLUMN_COVER_OUT_OF_SCOPE,
      consumerObservationPolicy: 'OUT_OF_SCOPE',
      requirementIds: [],
      scope: { elementIds: [column.elementId], bodyIds: [columnBodyId] },
      provenance: { messageKey: 'footing.cad.check.columnCover' },
    },
    {
      checkId: checkIdFor('reinforcementContainment', `footing:${f.id}`),
      checkKind: 'reinforcementContainment',
      authority: 'none',
      evaluationStatus: 'NOT_EVALUATED',
      notEvaluatedReason: translate('footing.cad.notEvaluated.containment', { footing: f.name }),
      notEvaluatedCode: CODE_NO_CONTAINMENT_CHECKER,
      consumerObservationPolicy: 'MAY_OBSERVE_NOT_COMPARABLE',
      requirementIds: [coverReq.requirementId],
      scope: {
        barIds: inFooting.map((b) => b.id),
        bodyIds: [footingBodyId],
        interfaceIds: [ifaceId],
      },
      provenance: { messageKey: 'footing.cad.check.containment' },
    },
  ];

  // ── Conditions ──────────────────────────────────────────────
  const unsupported: CadNote[] = [
    note(CODE_FOOTING_MAT_NOT_MODELED, 'footing.cad.unsupported.matGeometry',
      { footing: f.name }, { bodyIds: [footingBodyId] }),
    note(CODE_NO_CONTAINMENT_CHECKER, 'footing.cad.unsupported.containment',
      { footing: f.name }, { bodyIds: [footingBodyId] }),
    note(CODE_COLUMN_COVER_OUT_OF_SCOPE, 'footing.cad.unsupported.columnCover',
      { element: column.elementId }, { bodyIds: [columnBodyId] }),
    ...(source.productionUnsupported ?? []),
  ];

  const assumptions: CadNote[] = [
    note(CODE_COLUMN_STUB_TRUNCATED, 'footing.cad.assumption.stubTruncated', {
      element: column.elementId, top: round(stubTopZ),
    }, { bodyIds: [columnBodyId] }),
    note(CODE_EXTENTS_FROM_SAMPLER, 'footing.cad.assumption.sampler', {
      tolerance: COLLISION_CHORD_TOLERANCE * 1000,
    }),
    ...(column.baseZ > footingTopZ
      ? [note(CODE_COLUMN_BASE_ABOVE_FOOTING, 'footing.cad.assumption.columnBaseAbove', {
        element: column.elementId, base: round(column.baseZ), top: round(footingTopZ),
        gap: round(column.baseZ - footingTopZ),
      }, { bodyIds: [columnBodyId], elementIds: [column.elementId] })]
      : []),
    ...(source.aggregateAssumed
      ? [note(CODE_AGGREGATE_ASSUMED, 'footing.cad.assumption.aggregate',
        { mm: source.maxAggregateSizeMm })]
      : []),
    ...(source.productionAssumptions ?? []),
  ];

  const handoff: RcCadHandoffV1 = {
    schema: RC_CAD_HANDOFF_SCHEMA,
    schemaVersion: RC_CAD_HANDOFF_SCHEMA_VERSION,
    generator: { name: RC_CAD_GENERATOR_NAME, version: RC_CAD_GENERATOR_VERSION },
    ...(source.project ? { project: source.project } : {}),
    subject: {
      kind: 'footing',
      entityId: f.id,
      name: f.name,
      nodeId: f.nodeId,
      elementIds: [column.elementId],
    },
    assembly: {
      kind: 'footingTransferCage',
      completeness: 'partialConnectionOnly',
      descriptionKey: 'footing.cad.assembly.description',
      families,
    },
    units: { length: 'm', angle: 'deg', barDiameter: 'mm', mass: 'kg' },
    coordinateSystem: { up: 'Z', handedness: 'right' },
    revisions: {
      detailing: source.revisions.detailing,
      demand: source.revisions.demand,
      ...(source.revisions.analysis !== undefined ? { analysis: source.revisions.analysis } : {}),
      ...(source.revisions.loads !== undefined ? { loads: source.revisions.loads } : {}),
      ...(source.revisions.regulation !== undefined
        ? { regulation: source.revisions.regulation } : {}),
      entity: f.revision,
    },
    certificate: source.certificate,
    concrete: { bodies: [footingBody, columnBody], interfaces: [iface] },
    reinforcement: { bars, marks },
    requirements: { cover: [coverReq], clearSpacing },
    checks,
    assumptions,
    unsupported,
  };

  return { ok: true, handoff };
}

// ─── Small mappers ───────────────────────────────────────────────

/** Six decimals, m — a micron. Enough for geometry, short of pretending to more. */
export function round(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

export function outSegment(s: BarSegment): CadBarSegment {
  const base: CadBarSegment = {
    kind: s.kind, start: pt(s.start), end: pt(s.end), length: s.length,
  };
  if (s.kind !== 'arc') return base;
  return {
    ...base,
    ...(s.radius !== undefined ? { radius: s.radius } : {}),
    ...(s.sweepDeg !== undefined ? { sweepDeg: s.sweepDeg } : {}),
    // Exactness may be CLAIMED only when the centre is present. Without it the recoverable
    // curve is the chord and the deviation is the full sagitta, so the approximation is
    // declared rather than left to be discovered.
    ...(s.centre ? { centre: pt(s.centre) } : { arcApproximated: true }),
  };
}

export function outTreatment(t: BarPath['startTreatment']): CadBar['startTreatment'] {
  if (t.kind !== 'hook') return { kind: t.kind };
  return {
    kind: 'hook',
    ...(t.hook ? { hook: JSON.parse(JSON.stringify(t.hook)) as Record<string, unknown> } : {}),
  };
}

/** Deterministic conflict order: by pair, then by location. Never by array position. */
export function conflictOrder(a: BarConflict, b: BarConflict): number {
  return a.barA.localeCompare(b.barA) || a.barB.localeCompare(b.barB)
    || a.at.x - b.at.x || a.at.y - b.at.y || a.at.z - b.at.z;
}

export function outFinding(c: BarConflict): CadFinding {
  return {
    findingId: `finding:${c.pairClass ?? 'unclassified'}:${c.barA}|${c.barB}`,
    severity: c.severity,
    barIdA: c.barA,
    barIdB: c.barB,
    ...(c.pairClass ? { pairClass: c.pairClass } : {}),
    at: pt(c.at),
    measured: c.clearance,
    required: c.required,
    shortfall: c.shortfall,
    unit: 'm',
    elementIds: [...c.elementIds].sort((x, y) => x - y),
    ...(c.classLabelKey ? { messageKey: c.classLabelKey } : {}),
  };
}
