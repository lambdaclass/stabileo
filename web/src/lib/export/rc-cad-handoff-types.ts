/**
 * `RcCadHandoffV1` — the TypeScript face of `rc-cad-handoff.schema.json`.
 *
 * The JSON Schema is the contract; this file is its binding for the producer side. They are
 * kept in step by a test that validates a produced manifest against the schema, so a field
 * added here without a schema change fails, and a schema change without a field here fails
 * as soon as the producer tries to populate it.
 *
 * Pure: no store, no runes, no i18n. Lengths m, angles degrees, bar diameters mm, mass kg.
 * Coordinates are Stabileo model axes, Z-up right-handed.
 */

export const RC_CAD_HANDOFF_SCHEMA = 'RcCadHandoffV1' as const;
export const RC_CAD_HANDOFF_SCHEMA_VERSION = 1 as const;

export interface CadPoint3 { x: number; y: number; z: number }

export interface CadFrame {
  translation?: CadPoint3;
  rotationDeg?: number;
}

/**
 * A structured message.
 *
 * `code` is the part a consumer branches on. `text` is rendered prose and `messageKey` lets
 * a consumer re-render it in its own locale from Stabileo's own dictionary rather than
 * inventing a sentence.
 */
export interface CadNote {
  code?: string;
  messageKey?: string;
  text: string;
  params?: Record<string, unknown>;
  elementIds?: number[];
  bodyIds?: string[];
}

export interface CadClauseRef {
  code?: string;
  edition?: string;
  clause?: string;
  label?: string;
}

/** Which cage a bar belongs to, and why that cage exists. */
export type ReinforcementFamilyKind = 'columnDowel' | 'starterTie';

export interface CadReinforcementFamily {
  familyId: string;
  kind: ReinforcementFamilyKind;
  purposeKey: string;
  barIds: string[];
  clauseRefs?: CadClauseRef[];
}

export type CadAssemblyKind = 'footingTransferCage';

export type CadAssemblyCompleteness =
  /** Only the connection reinforcement is present. */
  | 'partialConnectionOnly'
  /**
   * Every bar the footing requires. Semantic validation REFUSES this while any unsupported
   * condition states the mats are not modelled — the enum member exists so that refusal is
   * a real check rather than a vacuous one.
   */
  | 'completeFootingReinforcement';

export interface CadAssembly {
  kind: CadAssemblyKind;
  completeness: CadAssemblyCompleteness;
  descriptionKey: string;
  families: CadReinforcementFamily[];
}

export type CadBodyRole = 'footing' | 'pedestal' | 'supportedColumn';

/** A face of a box body, named in the body's own local axes. */
export type CadBodyFace = 'top' | 'bottom' | 'bMin' | 'bMax' | 'lMin' | 'lMax';

export interface CadComponentSource {
  kind: 'footing' | 'pedestal' | 'element';
  id: number;
  name?: string;
  revision?: number;
  sectionName?: string;
}

export interface CadBoxShape {
  kind: 'box';
  B: number;
  L: number;
  height: number;
  centre: CadPoint3;
  rotationDeg: number;
}

export interface CadConcreteBody {
  bodyId: string;
  role: CadBodyRole;
  source: CadComponentSource;
  elementId?: number;
  materialRef?: string | null;
  /** Faces that are cut planes, not concrete surfaces. No cover is measurable against one. */
  truncatedFaces?: CadBodyFace[];
  derivation?: CadNote;
  shape: CadBoxShape;
}

export interface CadInterfaceGeometry {
  kind: 'planarRectZ';
  elevation: number;
  B: number;
  L: number;
  centre: CadPoint3;
  rotationDeg: number;
}

export interface CadIntentionalBarPassage {
  barIds: string[];
  reasonKey: string;
  clauseRefs?: CadClauseRef[];
}

export interface CadConcreteInterface {
  interfaceId: string;
  kind: 'concreteToConcrete';
  participants: { belowBodyId: string; aboveBodyId: string };
  geometry: CadInterfaceGeometry;
  exposure: 'internal';
  intentionalBarPassage?: CadIntentionalBarPassage;
}

export interface CadBarSegment {
  kind: 'straight' | 'arc';
  start: CadPoint3;
  end: CadPoint3;
  length: number;
  radius?: number;
  sweepDeg?: number;
  centre?: CadPoint3;
  arcApproximated?: boolean;
}

export interface CadBarEndTreatment {
  kind: 'straight' | 'hook' | 'continuous';
  hook?: Record<string, unknown>;
}

export interface CadBar {
  id: string;
  mark?: string;
  diameterMm: number;
  role: string;
  familyId: string;
  layerId?: string;
  materialRef?: string | null;
  segments: CadBarSegment[];
  startTreatment: CadBarEndTreatment;
  endTreatment: CadBarEndTreatment;
  cuttingLength: number;
  ownerElementIds: number[];
}

export interface CadMark {
  mark: string;
  diameterMm: number;
  cuttingLength: number;
  quantity: number;
  shape?: string;
  massKg?: number;
  role: string;
  barIds: string[];
  ownerElementIds?: number[];
}

export type CadRequirementCategory = 'placementInput' | 'codeDerived' | 'userSpecified';

export interface CadSurfaceScope {
  face?: string;
  region?: string;
  note?: string;
}

/**
 * Where a distance requirement may be measured.
 *
 * This is the field that keeps a footing cover requirement inside the footing. Without it a
 * single scalar would be measured against every surface in the document, including the
 * footing/column contact — which is exactly how a correct dowel becomes a false breach.
 */
export interface CadMeasurementScope {
  withinBodyId: string;
  excludeInterfaceIds?: string[];
  excludeTruncatedFaces?: boolean;
}

/**
 * Where a REQUIREMENT's number came from. `source` is mandatory: a distance a consumer must
 * measure against, with no stated origin, is a number nobody can audit.
 */
export interface CadProvenance {
  source: string;
  clauseRefs?: CadClauseRef[];
  messageKey?: string;
}

/**
 * Where a CHECK's result came from. `source` is optional here, and the difference from
 * `CadProvenance` is deliberate rather than an oversight: a check Stabileo did not evaluate has no
 * producing module to name, and inventing one — or naming the module that would have run it — would
 * imply it did. The reason such a check was not evaluated lives in `notEvaluatedCode` instead.
 */
export interface CadCheckProvenance {
  source?: string;
  clauseRefs?: CadClauseRef[];
  messageKey?: string;
}

export type CadElementType = 'footing' | 'pedestal' | 'slab' | 'wall' | 'beam' | 'column';

export interface CadCoverRequirement {
  requirementId: string;
  elementId: number;
  elementType: CadElementType;
  appliesToBodyIds: string[];
  surface?: CadSurfaceScope;
  appliesToBarIds?: string[];
  measurementScope: CadMeasurementScope;
  distance: number;
  unit: 'm';
  category: CadRequirementCategory;
  provenance: CadProvenance;
}

export interface CadRolePairScope {
  roleA: string;
  roleB: string;
  memberKind: 'beam' | 'column' | 'wall' | 'slab';
  governingBarDiameterMm: number;
  governedBy?: 'absoluteFloor' | 'barDiameter' | 'aggregate';
}

export interface CadClearSpacingRequirement {
  requirementId: string;
  barIdA?: string;
  barIdB?: string;
  appliesToRolePair?: CadRolePairScope;
  pairClass?: string;
  reportable?: boolean;
  elementIds?: number[];
  distance: number;
  unit: 'm';
  category: CadRequirementCategory;
  provenance: CadProvenance;
}

export type CadCheckKind =
  | 'barCollision' | 'barClearSpacing' | 'concreteCover' | 'reinforcementContainment';

export type CadCheckAuthority = 'stabileo' | 'none';

export type CadEvaluationStatus = 'EVALUATED' | 'NOT_EVALUATED';

/**
 * What a consumer may do with a check.
 *
 * The distinction that matters: `MAY_OBSERVE_NOT_COMPARABLE` permits a measurement but
 * forbids presenting it as a verdict, and `OUT_OF_SCOPE` forbids the measurement itself.
 * Collapsing the two would let a consumer report an unevaluated property as passing.
 */
export type CadConsumerObservationPolicy =
  | 'MAY_CROSS_CHECK' | 'MAY_OBSERVE_NOT_COMPARABLE' | 'OUT_OF_SCOPE';

export interface CadFinding {
  findingId: string;
  severity: string;
  barIdA?: string;
  barIdB?: string;
  pairClass?: string;
  at?: CadPoint3;
  measured?: number;
  required?: number;
  shortfall?: number;
  unit?: 'm';
  elementIds?: number[];
  messageKey?: string;
}

export interface CadCheckScope {
  elementIds?: number[];
  barIds?: string[];
  bodyIds?: string[];
  interfaceIds?: string[];
}

export interface CadCheck {
  checkId: string;
  checkKind: CadCheckKind;
  authority: CadCheckAuthority;
  evaluationStatus: CadEvaluationStatus;
  notEvaluatedReason?: string;
  notEvaluatedCode?: string;
  consumerObservationPolicy: CadConsumerObservationPolicy;
  requirementIds?: string[];
  scope?: CadCheckScope;
  findings?: CadFinding[];
  provenance?: CadCheckProvenance;
}

export interface RcCadHandoffV1 {
  schema: typeof RC_CAD_HANDOFF_SCHEMA;
  schemaVersion: typeof RC_CAD_HANDOFF_SCHEMA_VERSION;
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
  assembly: CadAssembly;
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

// ─── Stable condition codes ──────────────────────────────────────
//
// A consumer branches on these. They are values, not prose, so a wording change in either
// locale cannot alter consumer behaviour.

/** The footing's bottom and top mats are drawing requirements, not bar geometry, in PR19. */
export const CODE_FOOTING_MAT_NOT_MODELED = 'FOOTING_MAT_GEOMETRY_NOT_MODELED';
/** Stabileo has no production geometric containment checker — for any element type. */
export const CODE_NO_CONTAINMENT_CHECKER = 'NO_PRODUCTION_CONTAINMENT_CHECKER';
/** Column cover is deliberately not evaluated in this release, by anyone. */
export const CODE_COLUMN_COVER_OUT_OF_SCOPE = 'COLUMN_COVER_OUT_OF_SCOPE';
/** The stub carries only the extent needed to inspect the connection. */
export const CODE_COLUMN_STUB_TRUNCATED = 'COLUMN_STUB_TRUNCATED_AT_CAGE_TOP';
/** The column element's own base node sits above the footing top in the analysis model. */
export const CODE_COLUMN_BASE_ABOVE_FOOTING = 'COLUMN_ELEMENT_BASE_ABOVE_FOOTING_TOP';
/** Bar extents came from the production arc-aware sampler, at the production tolerance. */
export const CODE_EXTENTS_FROM_SAMPLER = 'BAR_EXTENTS_FROM_PRODUCTION_SAMPLER';
/** No concrete in the project stated a coarse-aggregate size, so the assumed value applies. */
export const CODE_AGGREGATE_ASSUMED = 'MAX_AGGREGATE_SIZE_ASSUMED';
