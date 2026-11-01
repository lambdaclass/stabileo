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
 *   - analyses the project does not record count as run (`analysesRun` null: all of them).
 *
 * Pure: no store, no runes.
 */
import { materialFamilyOf } from '../engine/steel/material-family';
import { catalogueGradeFamily } from '../engine/steel/grade-family';
import { is3DWorkspace } from '../utils/workspace';

export const ANALYSIS_KINDS = [
  'linear', 'pdelta', 'modal', 'buckling', 'spectral', 'timeHistory', 'plastic', 'nonlinear', 'harmonic', 'ssi',
] as const;
export type AnalysisKind = (typeof ANALYSIS_KINDS)[number];

/**
 * Analyses whose runs are not reported to the stamp: the PRO advanced panel solves time
 * histories, nonlinear and harmonic analyses into its own state rather than through the results
 * store's setters. Soil-structure interaction (`ssi`) is solved there too, from soil springs kept
 * in the panel and never saved with the model, so nothing in a file says it was not run. Since a
 * stamp cannot say they were NOT run, they always count as run.
 */
export const UNTRACKED_ANALYSES: readonly AnalysisKind[] = ['timeHistory', 'nonlinear', 'harmonic', 'ssi'];

/** Every feature id a registry entry may name. The registry test fails on any other. */
export const FEATURE_IDS = [
  'plane2D', 'members', 'frameMembers', 'trussMembers', 'hinges', 'arcMembers',
  'steelMembers', 'steelCirsoc301', 'steelTensionWithoutConnection', 'timberOrAluminiumMembers',
  'concreteMembers', 'cirsoc201', 'aci318', 'footings', 'jointDesigns',
  'shells', 'curvedShells', 'shellEdgeLoads', 'eccentricities',
  'constraints', 'constraintOnSupportedNode', 'inclinedSupports', 'springs', 'multipleSupportsOnNode', 'settlements',
  'connectors', 'connectorsWithShear',
  'memberLoads', 'pointOrPartialMemberLoads', 'memberThermalLoads', 'areaDeadLoads',
  'combinations', 'cirsocCombinations', 'seismic', 'snow', 'wind',
  ...ANALYSIS_KINDS.map((k) => `analysis:${k}` as const),
] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

type Entries<T> = Array<[number, T]> | undefined;
interface Mat { id: number; fy?: number; gradeId?: string; name?: string; e?: number }
interface Elem {
  id: number; type?: string; materialId: number; nodeI: number; nodeJ: number;
  releaseI?: Record<string, unknown>; releaseJ?: Record<string, unknown>;
  semiRigid?: unknown; reinforcement?: unknown;
  tensionConnection?: { i?: unknown; j?: unknown };
  /** Set on the members of a curve drawn as one (`lib/model/curved-member.ts`). */
  arc?: unknown;
  /** Insertion offsets at the two ends, global m (`model/element-3d-metadata.ts`). */
  offset?: { i?: Offset3; j?: Offset3 };
}
interface Sup {
  nodeId: number; type?: string; angle?: number; isGlobal?: boolean; isInclined?: boolean; dofFrame?: string;
  normalX?: number; normalY?: number; normalZ?: number; curves?: unknown;
  [k: string]: unknown;
}

/** What `modelFeatures` reads: the snapshot shape, loosely, so a file from any version is read. */
export interface FeatureSnapshot {
  analysisMode?: string;
  materials?: Entries<Mat>;
  elements?: Entries<Elem>;
  supports?: Entries<Sup>;
  loads?: Array<{ type: string; data?: Record<string, unknown> }>;
  loadCases?: Array<{ id: number; type?: string; spectral?: unknown }>;
  combinations?: unknown[];
  combinationRules?: unknown[];
  solidShells?: Entries<unknown>;
  plates?: Entries<{ offset?: Offset3 }>;
  quads?: Entries<{ curved?: boolean; offset?: Offset3 }>;
  constraints?: Array<Record<string, unknown>>;
  connectors?: Entries<{ kShear?: number; kShearZ?: number }>;
  footings?: Entries<unknown>;
  jointDesigns?: unknown;
  groups?: Entries<{ kind?: string }>;
  regulations?: { roles?: Record<string, { adapterId?: string | null } | undefined> };
  dynamics?: { timeHistory?: unknown; spectra?: unknown[] };
  massSource?: unknown;
}

export interface FeatureContext {
  /** The workspace the project opens in (the file's `analysisMode`). */
  analysisMode?: string;
  /** Analyses the project's results came from, as its stamp records them; null: not recorded. */
  analysesRun?: readonly string[] | null;
}

interface Offset3 { x?: number; y?: number; z?: number }

const values = <T>(e: Entries<T>): T[] => (Array.isArray(e) ? e.map((x) => x?.[1]).filter((x): x is T => !!x) : []);
const nonZero = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v !== 0;
const positive = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const SPRING_KEYS = ['kx', 'ky', 'kz', 'krx', 'kry', 'krz'];
const SETTLEMENT_KEYS = ['dx', 'dy', 'dz', 'dry', 'drz', 'drx'];

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

function hasRelease(r: Record<string, unknown> | undefined): boolean {
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

/** The features of one saved model. */
export function modelFeatures(s: FeatureSnapshot, ctx: FeatureContext = {}): Set<FeatureId> {
  const f = new Set<FeatureId>();
  const mode = ctx.analysisMode ?? s.analysisMode ?? '2d';
  if (!is3DWorkspace(mode)) f.add('plane2D');

  const materials = new Map(values(s.materials).map((m) => [m.id, m]));
  const elements = values(s.elements);
  const familyOf = (id: number) => materialFamilyOf(materials.get(id) as never, catalogueGradeFamily).family;

  const roles = s.regulations?.roles ?? {};
  const steelCode = roles.steel?.adapterId ?? null;
  const concreteCode = roles.concrete?.adapterId ?? null;
  const loadsCode = roles.loads?.adapterId ?? null;

  if (elements.length) f.add('members');
  let steel = 0, concrete = 0, steelWithoutConnection = 0;
  for (const e of elements) {
    if (e.type === 'truss') f.add('trussMembers'); else f.add('frameMembers');
    if (hasRelease(e.releaseI) || hasRelease(e.releaseJ) || e.semiRigid) f.add('hinges');
    if (e.arc) f.add('arcMembers');
    if (offsetMoves(e.offset?.i) || offsetMoves(e.offset?.j)) f.add('eccentricities');
    const fam = familyOf(e.materialId);
    if (fam === 'timber' || fam === 'aluminium') f.add('timberOrAluminiumMembers');
    if (fam === 'steel') {
      steel++;
      if (!e.tensionConnection?.i || !e.tensionConnection?.j) steelWithoutConnection++;
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
  if (quads.some((q) => q?.curved)) f.add('curvedShells');
  if ([...quads, ...values(s.plates)].some((q) => offsetMoves(q?.offset))) f.add('eccentricities');

  const supports = values(s.supports);
  const supportedNodes = new Map<number, number>();
  for (const sp of supports) {
    supportedNodes.set(sp.nodeId, (supportedNodes.get(sp.nodeId) ?? 0) + 1);
    if (isInclined(sp)) f.add('inclinedSupports');
    if (sp.type === 'spring' || sp.type === 'spring3d' || sp.curves || SPRING_KEYS.some((k) => positive(sp[k]))) f.add('springs');
    if (SETTLEMENT_KEYS.some((k) => nonZero(sp[k]))) f.add('settlements');
  }
  if ([...supportedNodes.values()].some((n) => n > 1)) f.add('multipleSupportsOnNode');

  const constraints = Array.isArray(s.constraints) ? s.constraints : [];
  if (constraints.length) f.add('constraints');
  if (constraints.some((c) => slaveNodes(c).some((n) => supportedNodes.has(n)))) f.add('constraintOnSupportedNode');

  const connectors = values(s.connectors);
  if (connectors.length) f.add('connectors');
  if (connectors.some((c) => positive(c.kShear) || positive(c.kShearZ))) f.add('connectorsWithShear');

  const cases = Array.isArray(s.loadCases) ? s.loadCases : [];
  const caseType = new Map(cases.map((c) => [c.id, c.type]));
  for (const l of Array.isArray(s.loads) ? s.loads : []) {
    const t = l.type ?? '';
    const d = l.data ?? {};
    if (/^(distributed|pointOnElement|thermal)/.test(t)) f.add('memberLoads');
    if (t.startsWith('pointOnElement') || (t.startsWith('distributed') && (positive(d.a) || d.b !== undefined))) f.add('pointOrPartialMemberLoads');
    if (t === 'thermal') f.add('memberThermalLoads');
    if (/edge/i.test(t)) f.add('shellEdgeLoads');
    const dead = caseType.get(d.caseId as number) === 'D' || d.caseId === undefined;
    if ((t === 'surface3d' || d.fromDef !== undefined) && dead) f.add('areaDeadLoads');
  }
  if (values(s.groups).some((g) => g?.kind === 'floorLoad')) f.add('areaDeadLoads');

  const types = new Set(cases.map((c) => c.type));
  if (types.has('E') || cases.some((c) => c.spectral) || s.massSource) f.add('seismic');
  if (types.has('S')) f.add('snow');
  if (types.has('W')) f.add('wind');
  const combos = (Array.isArray(s.combinations) && s.combinations.length > 0) || (Array.isArray(s.combinationRules) && s.combinationRules.length > 0);
  if (combos) {
    f.add('combinations');
    if (loadsCode === null || loadsCode.startsWith('cirsoc')) f.add('cirsocCombinations');
  }

  // Analyses: what the stamp recorded, plus what the model itself implies; nothing recorded: all.
  const run = ctx.analysesRun;
  if (run == null) {
    for (const k of ANALYSIS_KINDS) f.add(`analysis:${k}`);
  } else {
    for (const k of run) if ((ANALYSIS_KINDS as readonly string[]).includes(k)) f.add(`analysis:${k}` as FeatureId);
    f.add('analysis:linear');
    for (const k of UNTRACKED_ANALYSES) f.add(`analysis:${k}`);
    if (s.dynamics?.timeHistory) f.add('analysis:timeHistory');
    if ((s.dynamics?.spectra?.length ?? 0) > 0 || cases.some((c) => c.spectral)) { f.add('analysis:spectral'); f.add('analysis:modal'); }
  }
  return f;
}
