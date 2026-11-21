import { hasModalSeismicDerivation } from '../engine/loads/seismic-generation';
/**
 * Which features a saved model has, for deciding which registered result changes concern it.
 *
 * Read from the plain snapshot (what a `.ded`, an autosave or a tab carries), never from the live
 * stores: the decision is taken at the moment a project is opened, before anything is solved.
 *
 * ── The rule: when in doubt, the feature is present ────────────────
 *
 * A false "present" shows the engineer one notice too many. A false "absent" hides a change that
 * moved their numbers. So every reading below errs towards present:
 *   - a steel code that is not bound to something else counts as CIRSOC 301, the app's own;
 *   - a concrete code that is not bound counts as CIRSOC 201, the default of every new project;
 *   - analyses the project's stamp does not record count as run (`analysesRun` null: all of them).
 *
 * Pure: no store, no runes.
 */
import type { ArcSpec } from '../model/curved-member';
import { plateAnalysisIssue, type PlateAnalysisModel } from '../model/physical/plate-analysis';
import { materialFamilyOf } from '../engine/steel/material-family';
import { catalogueGradeFamily } from '../engine/steel/grade-family';
import { is3DWorkspace } from '../utils/workspace';
import { globalAxes } from '../features';
import { GRAVITY_SELF_WEIGHT, type SelfWeightLoad } from '../engine/analysis-settings';
import { isBareCustom3D, isBareRollerZ, isPlaneRoller, isSupportType } from '../model/support-types';

export const ANALYSIS_KINDS = [
  'linear', 'pdelta', 'modal', 'buckling', 'spectral', 'timeHistory', 'plastic', 'nonlinear', 'harmonic', 'ssi',
] as const;
export type AnalysisKind = (typeof ANALYSIS_KINDS)[number];

/**
 * The analyses a stamp written before #1658 records. The PRO advanced panel's time history,
 * nonlinear, harmonic and SSI runs were not reported then, so for such a stamp they count as run.
 */
export const LEGACY_RECORDED_ANALYSES: readonly AnalysisKind[] = ['linear', 'pdelta', 'modal', 'buckling', 'plastic', 'spectral'];

export const GLOBAL_AXES_EVIDENCE = 'axisNamedLoads';

/** Every feature id a registry entry may name. The registry test fails on any other. */
export const FEATURE_IDS = [
  'gallery:slab-on-columns:walls', 'example:rc-beam-flexure',
  GLOBAL_AXES_EVIDENCE,
  'plane2D', 'space3D', 'members', 'cableMembers', 'contactElements', 'frameMembers', 'trussMembers', 'hinges', 'arcMembers', 'shearAreas', 'thermalAtRelease',
  'steelMembers', 'steelCirsoc301', 'steelTensionWithoutConnection', 'steelDeclaredUnbracedLength', 'steelStaggeredOrUnboltedWebEnd', 'timberOrAluminiumMembers',
  'concreteMembers', 'fiberMembers', 'hognestadFiberMembers', 'cirsoc201', 'aci318', 'footings', 'jointDesigns',
  'shells', 'plateAnalysisIssue', 'curvedShells', 'shellEdgeLoads', 'eccentricities',
  'constraints', 'constraintOnSupportedNode', 'inclinedSupports', 'springs', 'multipleSupportsOnNode', 'bareRollerZ', 'bareCustom3D', 'localPlaneRoller', 'unknownSupportType', 'rollerSupports', 'namedSupportRestraintMasks', 'settlements', 'settledMaskedSupports', 'caseDisplacements',
  'connectors', 'connectorsWithShear', 'pathAnalysis',
  'stagedConstruction', 'generatedStructures', 'nodalMoments', 'trussMemberLoads', 'memberLoads', 'pointOrPartialMemberLoads', 'memberThermalLoads', 'areaDeadLoads', 'generatedLoads', 'generatedWindLoads', 'generatedSeismicLoads', 'unverifiedGeneratedSeismicLoads',
  'generatedWidthGravity', 'generatedPanelGravityShells', 'memberFloorZones', 'magnitudeCombinations',
  'partialDistributedMemberLoads', 'distributedMemberLoads', 'selfWeight', 'nonstandardPlanarSelfWeight', 'standaloneGravityToggleOff', 'nodalForces', 'forceSummaryResults',
  'ssiHistory', 'movingLoads', 'combinations', 'cirsocCombinations', 'seismic', 'snow', 'wind', 'timeHistorySpec',
  'superposedCombinations', 'repeatedCombinationCases',
  ...ANALYSIS_KINDS.map((k) => `analysis:${k}` as const),
] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

type Entries<T> = Array<[number, T]> | undefined;
interface Mat { id: number; fy?: number; gradeId?: string; name?: string; e?: number }
interface TensionEndSnapshot { kind?: string; connected?: string; webLines?: number; stagger?: { sMm?: number; gMm?: number } }
const staggerGiven = (st: TensionEndSnapshot['stagger']) => !!st && [st.sMm, st.gMm].every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
interface Elem {
  id: number; type?: string; behaviour?: string; materialId: number; sectionId?: number; nodeI: number; nodeJ: number;
  releaseI?: object; releaseJ?: object;
  semiRigid?: unknown; reinforcement?: unknown;
  tensionConnection?: { i?: TensionEndSnapshot; j?: TensionEndSnapshot };
  unbracedLength?: number;
  bracing?: { top?: readonly unknown[]; bottom?: readonly unknown[] };
  /** Set on the members of a curve drawn as one (`lib/model/curved-member.ts`). */
  arc?: { id: number; spec: ArcSpec };
  /** Insertion offsets at the two ends, global m (`model/element-3d-metadata.ts`). */
  offset?: { i?: Offset3; j?: Offset3 };
}
interface Sup {
  nodeId: number; type?: string; uplift?: boolean; angle?: number; isGlobal?: boolean; isInclined?: boolean; dofFrame?: string; dofRestraints?: unknown;
  normalX?: number; normalY?: number; normalZ?: number; curves?: unknown;
  kx?: unknown; ky?: unknown; kz?: unknown; krx?: unknown; kry?: unknown; krz?: unknown;
  dx?: unknown; dy?: unknown; dz?: unknown; dry?: unknown; drz?: unknown; drx?: unknown;
}

/** What `modelFeatures` reads: the snapshot shape, loosely, so a file from any version is read. */
type ShellSnapshot = { id?: number; nodes?: number[]; curved?: boolean; offset?: Offset3 };

interface FeatureSnapshotFields {
  analysisMode?: string;
  gapElements?: unknown[];
  nodeToSurfacePairs?: unknown[];
  upliftSupports?: unknown[];
  nodes?: Entries<{ x: number; y: number; z?: number }>;
  materials?: Entries<Mat>;
  elements?: Entries<Elem>;
  sections?: Entries<{ id: number; shearAreas?: unknown }>;
  fiberSections?: Record<string, { materials?: Array<{ type?: string }> }>;
  supports?: Entries<Sup>;
  loads?: Array<{ type: string; data?: Record<string, unknown> }>;
  loadCases?: Array<{ id: number; type?: string; spectral?: unknown; alternatives?: string; axisNamed?: boolean }>;
  combinations?: unknown[];
  combinationRules?: unknown[];
  solidShells?: Entries<unknown>;
  plates?: Entries<ShellSnapshot>;
  quads?: Entries<ShellSnapshot>;
  constraints?: Array<Record<string, unknown>>;
  connectors?: Entries<{ kShear?: number; kShearZ?: number }>;
  footings?: Entries<unknown>;
  jointDesigns?: unknown;
  groups?: Entries<{ name?: string; kind?: string; data?: unknown; members?: { nodes?: number[]; quads?: number[]; plates?: number[] } }>;
  regulations?: { roles?: Record<string, { adapterId?: string | null; settings?: Record<string, unknown> } | undefined> };
  dynamics?: { timeHistory?: unknown; spectra?: unknown[] };
  massSource?: unknown;
  analysis?: { selfWeight?: unknown[]; standaloneSelfWeight?: string };
  includeSelfWeight?: boolean;
  designData?: { loadBasis?: { resultsVersion?: unknown; derivation?: Array<{ key?: string }>; seismic?: unknown }; site?: { phases?: unknown[] } };
}

export interface FeatureSnapshot extends FeatureSnapshotFields {
  analysis?: FeatureSnapshotFields['analysis'] & { combinationMethod?: string };
}

export interface FeatureContext {
  /** The workspace the project opens in (the file's `analysisMode`). */
  analysisMode?: string;
  /** Analyses the project's results came from, as its stamp records them; null: not recorded. */
  analysesRun?: readonly string[] | null;
  /** Analyses whose runs the stamp records; any other counts as run. Absent: `LEGACY_RECORDED_ANALYSES`. */
  analysesRecorded?: readonly string[];
}

interface Offset3 { x?: number; y?: number; z?: number }

const values = <T>(e: Entries<T>): T[] => (Array.isArray(e) ? e.map((x) => x?.[1]).filter((x): x is T => !!x) : []);
const nonZero = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v !== 0;
const positive = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const SPRING_KEYS = ['kx', 'ky', 'kz', 'krx', 'kry', 'krz'] as const;
const SETTLEMENT_KEYS = ['dx', 'dy', 'dz', 'dry', 'drz', 'drx'] as const;

function isInclined(s: Sup): boolean {
  if (s.isInclined) return true;
  if (s.isGlobal === false || s.dofFrame === 'local') return true;
  if (nonZero(s.angle) && (s.angle as number) % 360 !== 0) return true;
  return false;
}

/** A member insertion (`offset.i` / `offset.j`) or a shell offset that moves anything. */
function offsetMoves(o: Offset3 | undefined): boolean {
  return !!o && [o.x, o.y, o.z].some(nonZero);
}

function hasRelease(r: object | undefined): boolean {
  return !!r && Object.values(r).some((v) => v === true);
}

/** Every constraint node that is a dependent ("slave") of the constraint. */
function slaveNodes(c: Record<string, unknown>): number[] {
  const out: number[] = [];
  if (typeof c.slaveNode === 'number') out.push(c.slaveNode);
  if (Array.isArray(c.slaveNodes)) for (const n of c.slaveNodes) if (typeof n === 'number') out.push(n);
  // Equal-DOF and linear MPCs name their nodes otherwise; every node they touch may be dependent.
  if (Array.isArray(c.nodes)) for (const n of c.nodes) if (typeof n === 'number') out.push(n);
  if (Array.isArray(c.terms)) for (const t of c.terms as Array<{ nodeId?: unknown }>) if (typeof t?.nodeId === 'number') out.push(t.nodeId);
  return out;
}

export const fromLoadPlan = (by: unknown): boolean => typeof by === 'string' && !!by && !/^(stair|arch):/.test(by);

export function unverifiedSeismicLoads(s: FeatureSnapshot) {
  const cases = new Set((Array.isArray(s.loadCases) ? s.loadCases : []).filter(c => c.type === 'E' && !c.spectral).map(c => c.id));
  if (cases.size === 0) return [];
  const settings = s.regulations?.roles?.seismic?.settings;
  const dialog = settings?.dialog as { seismicMethod?: { method?: string } } | undefined;
  const modalBasis = hasModalSeismicDerivation(s.designData?.loadBasis?.derivation) || dialog?.seismicMethod?.method === 'modal';
  const earlyGenerator = typeof settings?.periodSystem === 'string' && typeof settings?.regularity === 'string' &&
    typeof settings?.occupancy === 'string';
  return (Array.isArray(s.loads) ? s.loads : []).filter(l =>
    cases.has((l.data?.caseId ?? 1) as number) && l.data?.seismicGeneration !== 'static' &&
    (l.data?.seismicGeneration === 'unverified' || fromLoadPlan(l.data?.generatedBy) || modalBasis ||
      (earlyGenerator && /^nodal/.test(l.type))));
}

export function loadsGeneratedWith(s: FeatureSnapshot): number {
  const basis = s.designData?.loadBasis;
  if (basis) return Number.isInteger(basis.resultsVersion) ? (basis.resultsVersion as number) : 0;
  const snow = (Array.isArray(s.loadCases) ? s.loadCases : []).some(c => c.type === 'S');
  return snow || (Array.isArray(s.loads) ? s.loads : []).some(l => fromLoadPlan(l.data?.generatedBy)) ? 0 : Infinity;
}

export const UNVERIFIED_SEISMIC_FEATURE = 'unverifiedGeneratedSeismicLoads';

function isStandardGravityRule(rule: unknown): boolean {
  if (rule === null || typeof rule !== 'object') return false;
  const { direction, factor, elements, groupId } = rule as Partial<SelfWeightLoad>;
  return direction === GRAVITY_SELF_WEIGHT.direction && factor === GRAVITY_SELF_WEIGHT.factor
    && elements === undefined && groupId === undefined;
}

function plateAnalysisModel(s: FeatureSnapshot): PlateAnalysisModel {
  const shells = (entries: Entries<ShellSnapshot>) => new Map((entries ?? []).flatMap(([id, shell]) =>
    Array.isArray(shell?.nodes) ? [[id, { id, nodes: shell.nodes, curved: shell.curved }]] as const : []));
  const groups: NonNullable<PlateAnalysisModel['groups']> = new Map((s.groups ?? []).flatMap(([id, group]) => {
    if (!group?.data || typeof group.data !== 'object') return [];
    return [[id, { id, name: group.name, members: group.members ?? {}, data: group.data as Record<string, unknown> }]] as const;
  }));
  return {
    nodes: new Map(s.nodes),
    elements: new Map(s.elements),
    materials: s.materials && new Map(s.materials),
    plates: shells(s.plates),
    quads: shells(s.quads),
    constraints: s.constraints,
    groups,
  };
}

/** The features of one saved model. */
export function modelFeatures(s: FeatureSnapshot, ctx: FeatureContext = {}): Set<FeatureId> {
  const f = new Set<FeatureId>();
  const mode = ctx.analysisMode ?? s.analysisMode ?? '2d';
  if (ctx.analysesRun == null || ctx.analysesRun.some(k => k !== 'modal' && k !== 'buckling')) f.add('forceSummaryResults');
  f.add(is3DWorkspace(mode) ? 'space3D' : 'plane2D');

  const materials = new Map(values(s.materials).map((m) => [m.id, m]));
  const elements = values(s.elements);
  const familyOf = (id: number) => materialFamilyOf(materials.get(id) as never, catalogueGradeFamily).family;

  const roles = s.regulations?.roles ?? {};
  const steelCode = roles.steel?.adapterId ?? null;
  const concreteCode = roles.concrete?.adapterId ?? null;
  const loadsCode = roles.loads?.adapterId ?? null;

  const released = new Set<number>();
  const sheared = new Set(values(s.sections).filter((x) => x.shearAreas != null).map((x) => x.id));
  const fiberSections = new Set(Object.entries(s.fiberSections ?? {})
    .filter(([, section]) => (section.materials?.length ?? 0) > 0).map(([id]) => id));
  const hognestadSections = new Set(Object.entries(s.fiberSections ?? {})
    .filter(([, section]) => section.materials?.some((material) => material.type === 'concrete_hognestad'))
    .map(([id]) => id));
  if (elements.length) f.add('members');
  if (elements.some((e) => e.type === 'cable' || e.behaviour === 'cable')) f.add('cableMembers');
  if (elements.some((e) => e.type === 'gap' || e.type === 'contact' || e.behaviour === 'tensionOnly' || e.behaviour === 'compressionOnly')
    || s.gapElements?.length || s.nodeToSurfacePairs?.length || s.upliftSupports?.length) f.add('contactElements');
  let steel = 0, concrete = 0, steelWithoutConnection = 0, steelDeclaredLb = 0, steelChainEnd = 0;
  for (const e of elements) {
    if (e.type === 'truss' || e.type === 'cable') f.add('trussMembers');
    else if (e.type === 'frame') f.add('frameMembers');
    if (hasRelease(e.releaseI) || hasRelease(e.releaseJ) || e.semiRigid) { f.add('hinges'); if (e.type !== 'truss') released.add(e.id); }
    if (e.type !== 'truss' && e.sectionId !== undefined && sheared.has(e.sectionId)) f.add('shearAreas');
    if (e.type !== 'truss' && e.type !== 'cable' && e.sectionId !== undefined && fiberSections.has(String(e.sectionId))) f.add('fiberMembers');
    if (e.type !== 'truss' && e.type !== 'cable' && e.sectionId !== undefined && hognestadSections.has(String(e.sectionId))) f.add('hognestadFiberMembers');
    if (e.arc) f.add('arcMembers');
    if (offsetMoves(e.offset?.i) || offsetMoves(e.offset?.j)) f.add('eccentricities');
    const fam = familyOf(e.materialId);
    if (fam === 'timber' || fam === 'aluminium') f.add('timberOrAluminiumMembers');
    if (fam === 'steel') {
      steel++;
      if (!e.tensionConnection?.i || !e.tensionConnection?.j) steelWithoutConnection++;
      if ((e.unbracedLength ?? 0) > 0 || e.bracing?.top?.length || e.bracing?.bottom?.length) steelDeclaredLb++;
      if ([e.tensionConnection?.i, e.tensionConnection?.j].some((c) => c?.kind === 'bolted' && (staggerGiven(c.stagger) || (c.connected === 'all' && c.webLines === 0)))) steelChainEnd++;
    } else if (fam === 'concrete' || e.reinforcement) {
      concrete++;
    }
  }
  if (steel) {
    f.add('steelMembers');
    const cirsoc301 = steelCode === null || steelCode.startsWith('cirsoc301');
    if (cirsoc301) {
      f.add('steelCirsoc301');
      if (steelWithoutConnection) f.add('steelTensionWithoutConnection');
      if (steelDeclaredLb) f.add('steelDeclaredUnbracedLength');
      if (steelChainEnd) f.add('steelStaggeredOrUnboltedWebEnd');
    }
  }
  if (concrete) {
    f.add('concreteMembers');
    if (concreteCode === null || concreteCode.startsWith('cirsoc')) f.add('cirsoc201');
    if (concreteCode === 'aci-aisc') f.add('aci318');
  }
  if (values(s.footings).length) f.add('footings');
  const jd = s.jointDesigns;
  if (jd && (Array.isArray(jd) ? jd.length : typeof jd === 'object' && Object.keys(jd as object).length)) f.add('jointDesigns');

  const quads = values(s.quads);
  if (quads.length || values(s.plates).length || values(s.solidShells).length) f.add('shells');
  if (f.has('space3D') && (f.has('shells') || s.groups?.length)) {
    const issue = plateAnalysisIssue(plateAnalysisModel(s));
    if (issue && issue.kind !== 'unmeshed') f.add('plateAnalysisIssue');
  }
  if (quads.some((q) => q?.curved)) f.add('curvedShells');
  if ([...quads, ...values(s.plates)].some((q) => offsetMoves(q?.offset))) f.add('eccentricities');

  const supports = values(s.supports);
  if (supports.some(sp => isSupportType(sp.type) && sp.type.startsWith('roller'))) f.add('rollerSupports');
  if (supports.some(sp => sp.dofRestraints && isSupportType(sp.type) && sp.type !== 'custom3d')) f.add('namedSupportRestraintMasks');
  if (supports.some(isBareCustom3D)) f.add('bareCustom3D');
  if (supports.some(sp => sp.isGlobal === false && !sp.dofRestraints && isPlaneRoller(sp.type))) f.add('localPlaneRoller');
  if (supports.some(isBareRollerZ)) f.add('bareRollerZ');
  if (supports.some(sp => !isSupportType(sp.type))) f.add('unknownSupportType');
  if (supports.some((s) => s.uplift)) f.add('contactElements');
  const supportedNodes = new Map<number, number>();
  for (const sp of supports) {
    supportedNodes.set(sp.nodeId, (supportedNodes.get(sp.nodeId) ?? 0) + 1);
    if (isInclined(sp)) f.add('inclinedSupports');
    if (sp.type === 'spring' || sp.type === 'spring3d' || sp.curves || SPRING_KEYS.some((k) => positive(sp[k]))) f.add('springs');
    if (SETTLEMENT_KEYS.some((k) => nonZero(sp[k]))) {
      f.add('settlements');
      if (sp.dofRestraints) f.add('settledMaskedSupports');
    }
  }
  if ([...supportedNodes.values()].some((n) => n > 1)) f.add('multipleSupportsOnNode');

  const constraints = Array.isArray(s.constraints) ? s.constraints : [];
  if (constraints.length) f.add('constraints');
  if (constraints.some((c) => slaveNodes(c).some((n) => supportedNodes.has(n)))) f.add('constraintOnSupportedNode');

  const connectors = values(s.connectors);
  if (connectors.length) f.add('connectors');
  if (connectors.some((c) => positive(c.kShear) || positive(c.kShearZ))) f.add('connectorsWithShear');

  const axialMembers = new Set(elements.filter((e) => e.type === 'truss' || e.type === 'cable').map((e) => e.id));
  const cases = Array.isArray(s.loadCases) ? s.loadCases : [];
  if (globalAxes() && cases.some(c => c.axisNamed === true)) f.add(GLOBAL_AXES_EVIDENCE);
  if (cases.some((c) => c.alternatives?.startsWith('move:'))) f.add('movingLoads');
  if (s.includeSelfWeight || s.analysis?.selfWeight?.length) f.add('selfWeight');
  if (s.analysis?.standaloneSelfWeight === 'gravity' && s.includeSelfWeight !== true &&
      (elements.length || quads.length || values(s.plates).length)) {
    f.add('standaloneGravityToggleOff');
  }
  const weightRules = s.analysis?.selfWeight;
  if (f.has('plane2D') && elements.length && Array.isArray(weightRules) &&
      (weightRules.length > 1 || weightRules.some(rule => !isStandardGravityRule(rule)))) {
    f.add('nonstandardPlanarSelfWeight');
  }
  const caseType = new Map(cases.map((c) => [c.id, c.type]));
  const loadBasis = s.designData?.loadBasis;
  const loadNoteKeys = new Set(Array.isArray(loadBasis?.derivation) ? loadBasis.derivation.map(n => n?.key) : []);
  const gravityMode = (roles.loads?.settings?.dialog as { gravityMode?: unknown } | undefined)?.gravityMode;
  let memberGravity = false;
  let shellGravity = false;
  let generatedSeismic = !!loadBasis?.seismic || loadNoteKeys.has('loadPlan.derivation.seismic');
  for (const l of Array.isArray(s.loads) ? s.loads : []) {
    const t = l.type ?? '';
    const d = l.data ?? {};
    if (/^nodal/.test(t) && ['fx', 'fy', 'fz'].some((key) => typeof d[key] === 'number' && d[key] !== 0)) f.add('nodalForces');
    if (/^nodal/.test(t) && ['mx', 'my', 'mz'].some((key) => typeof d[key] === 'number' && d[key] !== 0)) f.add('nodalMoments');
    if (/^(distributed|axialDistributed|pointOnElement|thermal)/.test(t)) {
      f.add('memberLoads');
      if (axialMembers.has(d.elementId as number)) f.add('trussMemberLoads');
    }
    if (t.startsWith('distributed')) f.add('distributedMemberLoads');
    const partialDistributed = t.startsWith('distributed') && (positive(d.a) || d.b !== undefined);
    if (partialDistributed) f.add('partialDistributedMemberLoads');
    if (t.startsWith('pointOnElement') || partialDistributed) f.add('pointOrPartialMemberLoads');
    if (t === 'thermal') f.add('memberThermalLoads');
    if (t === 'displacement3d' && SETTLEMENT_KEYS.some((k) => !!d[k])) f.add('caseDisplacements');
    if (t === 'thermal' && released.has(d.elementId as number)) f.add('thermalAtRelease');
    if (/edge/i.test(t)) f.add('shellEdgeLoads');
    const dead = caseType.get(d.caseId as number) === 'D' || d.caseId === undefined;
    if ((t === 'surface3d' || d.fromDef !== undefined) && dead) f.add('areaDeadLoads');
    if (fromLoadPlan(d.generatedBy)) {
      f.add('generatedLoads');
      const type = caseType.get(d.caseId as number) ?? '';
      if (['W', 'Wa'].includes(type)) f.add('generatedWindLoads');
      if (type === 'E') generatedSeismic = true;
      if (['D', 'L', 'Lr'].includes(type)) {
        if (t === 'surface3d') shellGravity = true;
        if (t === 'distributed3d' || t === 'distributed') memberGravity = true;
      }
    }
  }
  if (s.designData?.site?.phases?.length) {
    f.add('stagedConstruction');
    f.add('pathAnalysis');
  }
  if (loadBasis) f.add('generatedLoads');
  if (generatedSeismic) f.add('generatedSeismicLoads');
  if (unverifiedSeismicLoads(s).length > 0) f.add(UNVERIFIED_SEISMIC_FEATURE);
  const hasShellGravity = shellGravity || ['shellLevel', 'slopedShells', 'partlyUnderShells'].some(kind => loadNoteKeys.has(`loadPlan.gravity.${kind}`));
  if (hasShellGravity || (gravityMode === 'panels' && memberGravity && quads.length > 0)) f.add('generatedPanelGravityShells');
  const inferredPanelMode = hasShellGravity || loadNoteKeys.has('loadPlan.gravity.panels') || loadNoteKeys.has('loadPlan.gravity.width');
  const widthMode = gravityMode === 'width' || (gravityMode !== 'panels' && !inferredPanelMode);
  if (widthMode && (memberGravity || generatedSeismic)) f.add('generatedWidthGravity');
  const floorDefs = values(s.groups).filter(g => g?.kind === 'floorLoad');
  if (floorDefs.length) f.add('areaDeadLoads');
  if (floorDefs.some(g => {
    const data = g.data as { target?: { by?: string }; distribution?: string } | undefined;
    return data?.target?.by === 'zone' && data.distribution !== 'slab';
  })) f.add('memberFloorZones');
  if (values(s.groups).some((g) => g?.kind === 'generated')) f.add('generatedStructures');

  const types = new Set(cases.map((c) => c.type));
  if (types.has('E') || cases.some((c) => c.spectral) || s.massSource) f.add('seismic');
  if (types.has('S')) f.add('snow');
  if (types.has('W') || types.has('Wa')) f.add('wind');
  const combos = (Array.isArray(s.combinations) && s.combinations.length > 0) || (Array.isArray(s.combinationRules) && s.combinationRules.length > 0);
  if (combos) {
    f.add('combinations');
    if (Array.isArray(s.combinations) && s.combinations.some(c => {
      const method = (c as { method?: string } | null)?.method;
      return method === 'abs' || method === 'srss';
    })) f.add('magnitudeCombinations');
    if (s.analysis?.combinationMethod === 'superpose') f.add('superposedCombinations');
    if (Array.isArray(s.combinations) && s.combinations.some(combination => {
      const factors = (combination as { factors?: unknown } | null)?.factors;
      if (!Array.isArray(factors)) return false;
      const ids = factors.map(factor => factor?.caseId).filter(id => typeof id === 'number');
      return new Set(ids).size < ids.length;
    })) f.add('repeatedCombinationCases');
    if (loadsCode === null || loadsCode.startsWith('cirsoc')) f.add('cirsocCombinations');
  }

  if (s.dynamics?.timeHistory) f.add('timeHistorySpec');

  // Analyses: what the stamp recorded, plus what the model itself implies; nothing recorded: all.
  const run = ctx.analysesRun;
  if (run == null) {
    for (const k of ANALYSIS_KINDS) f.add(`analysis:${k}`);
  } else {
    for (const k of run) if ((ANALYSIS_KINDS as readonly string[]).includes(k)) f.add(`analysis:${k}` as FeatureId);
    f.add('analysis:linear');
    const recorded = ctx.analysesRecorded ?? LEGACY_RECORDED_ANALYSES;
    for (const k of ANALYSIS_KINDS) if (!recorded.includes(k)) f.add(`analysis:${k}`);
    if (s.dynamics?.timeHistory) f.add('analysis:timeHistory');
    if ((s.dynamics?.spectra?.length ?? 0) > 0 || cases.some((c) => c.spectral)) { f.add('analysis:spectral'); f.add('analysis:modal'); }
  }
  const inferredSSI = is3DWorkspace(mode) && supports.some((sp) => !!sp.curves);
  if (inferredSSI) f.add('analysis:ssi');
  if (ctx.analysesRun?.includes('ssi') || inferredSSI) f.add('ssiHistory');
  return f;
}
