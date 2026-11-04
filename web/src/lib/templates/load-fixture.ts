/**
 * Load a JSON fixture into the model store via the ExampleAPI.
 *
 * This is the single source of truth for example model loading.
 * Both the app (via ExampleAPI) and tests (via buildSolverInput3D) can
 * consume the same JSON files, eliminating mock divergence.
 */

import { generateCombinations } from '../codes/cirsoc101/combinations';
import { withOrigin } from '../codes/families';
import { CIRSOC101_BASIS } from '../codes/families/cirsoc';
import { expandCombinations, presentSymbols } from '../engine/loads/combination-cases';
import { tp } from '../i18n';

export interface JSONModel {
  name: string;
  materials: Array<{ id: number; [k: string]: unknown }>;
  sections: Array<{ id: number; [k: string]: unknown }>;
  nodes: Array<{ id: number; x: number; y: number; z: number; name?: string }>;
  elements: Array<{
    id: number;
    /** The user's name for the member, beside its number. */
    name?: string;
    type: 'frame' | 'truss';
    nodeI: number;
    nodeJ: number;
    materialId: number;
    sectionId: number;
    hingeStart?: boolean;
    hingeEnd?: boolean;
    /**
     * Per-axis end releases, for a space model: `hingeStart`/`hingeEnd` are a
     * plane frame's hinge (the in-plane moment) and cannot say which axis a 3D
     * hinge frees — an arch hinge turns about the axis normal to its plane, My
     * for an arch in XZ.
     */
    releaseI?: { my?: boolean; mz?: boolean; t?: boolean };
    releaseJ?: { my?: boolean; mz?: boolean; t?: boolean };
    /** Analytical member offset (PR [7] eccentric framing). */
    offset?: Record<string, unknown>;
    /**
     * Roll of the profile about the member axis, degrees.
     *
     * Per ELEMENT rather than per section, because members that share a section do not
     * share an orientation — every purlin on a pitched roof uses one profile and each is
     * rolled by its own slope. Carried the same way `offset` is: set on the created
     * element, since the `FixtureLoader` surface has no setter for it.
     */
    rollAngle?: number;
    /** A member of variable section: the section at end J, by the same ids as `sectionId`. */
    variableSection?: { sectionJ: number; segments?: number };
  }>;
  supports: Array<{ id: number; nodeId: number; type: string; [k: string]: unknown }>;
  loads: Array<{ type: string; data: Record<string, unknown> }>;
  plates: Array<{ id: number; nodes: number[]; materialId: number; thickness: number }>;
  quads: Array<{ id: number; nodes: number[]; materialId: number; thickness: number }>;
  constraints: Array<Record<string, unknown>>;
  loadCases: Array<{ id: number; type: string; name: string }>;
  combinations: Array<{ id: number; name: string; factors: Array<{ caseId: number; factor: number }>; origin?: unknown }>;
  /** Optional model provenance (CAD-derived draft examples carry their source
   *  DXF, assumptions, and review status). Passed through to the model. */
  provenance?: Record<string, unknown>;
  /** Point masses at nodes (t), for the dynamic analyses (`MassSource.points`). */
  pointMasses?: Array<{ nodeId: number; m: number; horizontalOnly?: boolean }>;
  /** The project's analysis rules (self-weight as case loads, combination method). */
  analysis?: import('../engine/analysis-settings').AnalysisSettings;
}

/**
 * Minimal API surface needed to load a fixture into any target
 * (model store, test mock, or solver input builder).
 */
export interface FixtureLoader {
  addNode(x: number, y: number, z?: number): number;
  addElement(nI: number, nJ: number, type?: 'frame' | 'truss'): number;
  addSupport(nodeId: number, type: string, springK?: Record<string, number>, opts?: Record<string, unknown>): number;
  updateSupport?(id: number, data: Record<string, unknown>): void;
  addMaterial(data: Omit<Record<string, unknown>, 'id'>): number;
  addSection(data: Omit<Record<string, unknown>, 'id'>): number;
  updateElementMaterial(elemId: number, matId: number): void;
  updateElementSection(elemId: number, secId: number): void;
  // 2D loads
  addDistributedLoad?(elemId: number, qI: number, qJ?: number, angle?: number, isGlobal?: boolean, caseId?: number): number;
  addNodalLoad?(nodeId: number, fx: number, fy: number, mz?: number, caseId?: number): number;
  addPointLoadOnElement?(elementId: number, a: number, p: number, opts?: Record<string, unknown>): number;
  addThermalLoad?(elemId: number, dtUniform: number, dtGradient: number): number;
  toggleHinge?(elemId: number, end: 'start' | 'end'): void;
  toggleRelease?(elemId: number, end: 'i' | 'j', axis: 'my' | 'mz' | 't'): void;
  // 3D loads
  addDistributedLoad3D?(elemId: number, qYI: number, qYJ: number, qZI: number, qZJ: number, a?: number, b?: number, caseId?: number,
    opts?: { frame?: import('../engine/member-loads').MemberFrame; qXI?: number; qXJ?: number }): number;
  addNodalLoad3D?(nodeId: number, fx: number, fy: number, fz: number, mx: number, my: number, mz: number, caseId?: number): number;
  addSurfaceLoad3D?(quadId: number, q: number, caseId?: number): number;
  // Shell elements
  addPlate?(nodes: number[], materialId: number, thickness: number): number;
  addQuad?(nodes: number[], materialId: number, thickness: number): number;
  // Constraints
  addConstraint?(c: Record<string, unknown>): void;
  // Model metadata
  model: { name: string; loadCases: Array<{ id: number; type: string; name: string }>; combinations: Array<{ factors?: ReadonlyArray<{ caseId: number }>; [k: string]: unknown }> };
  nextId: { loadCase: number; combination: number };
}

/**
 * Load a JSON fixture into the given API target.
 * Replays all the creation calls in the correct order:
 * materials → sections → nodes → elements → supports → loads → shells → constraints
 */
export function loadFixture(json: JSONModel, api: FixtureLoader, opts: { keepCombinations?: boolean } = {}): void {
  const { loadCases, combinations, rebuilt } = opts.keepCombinations ? keptLoadCases(json, api.model) : fixtureLoadCases(json, api.model);
  api.model.name = json.name;

  // ID remapping: fixture IDs may not match the auto-increment IDs from the API
  const nodeMap = new Map<number, number>();
  const elemMap = new Map<number, number>();
  const matMap = new Map<number, number>();
  const secMap = new Map<number, number>();
  const quadMap = new Map<number, number>();

  // Materials (skip id=1, it's the default — but update it if fixture overrides)
  for (const mat of json.materials) {
    if (mat.id === 1) {
      // Update default material in place via addMaterial trick:
      // Just map 1→1 and let the store keep its default
      // But we need the fixture's properties. Use addMaterial for id>1.
      matMap.set(1, 1);
      // The default material may have different properties; override by adding a new one
      // and remapping. But most stores don't support updateMaterial via ExampleAPI.
      // Since loadFixture is called after clear(), the default mat is Acero A36.
      // If fixture has a different material at id=1, add it as a new one.
      const defaultE = 200000;
      if (mat.e !== defaultE || mat.name !== 'Acero A36') {
        const newId = api.addMaterial(withoutId(mat));
        matMap.set(1, newId);
      }
    } else {
      const newId = api.addMaterial(withoutId(mat));
      matMap.set(mat.id, newId);
    }
  }

  // Sections (skip id=1 default — update if fixture overrides)
  for (const sec of json.sections) {
    if (sec.id === 1) {
      secMap.set(1, 1);
      const defaultName = 'IPN 300';
      if (sec.name !== defaultName) {
        const newId = api.addSection(withoutId(sec));
        secMap.set(1, newId);
      }
    } else {
      const newId = api.addSection(withoutId(sec));
      secMap.set(sec.id, newId);
    }
  }

  // Nodes
  for (const n of json.nodes) {
    const newId = api.addNode(n.x, n.y, n.z);
    nodeMap.set(n.id, newId);
    // A node's name, set on the created node: the `FixtureLoader` surface has no setter for it.
    if (n.name) {
      const created = (api.model as unknown as { nodes?: Map<number, { name?: string }> }).nodes?.get?.(newId);
      if (created) created.name = n.name;
    }
  }

  // Elements
  for (const e of json.elements) {
    const nI = nodeMap.get(e.nodeI)!;
    const nJ = nodeMap.get(e.nodeJ)!;
    const newId = api.addElement(nI, nJ, e.type);
    elemMap.set(e.id, newId);

    // Remap material and section
    const matId = matMap.get(e.materialId) ?? e.materialId;
    const secId = secMap.get(e.sectionId) ?? e.sectionId;
    if (matId !== 1) api.updateElementMaterial(newId, matId);
    if (secId !== 1) api.updateElementSection(newId, secId);

    // Analytical member offset (PR [7]) and profile roll — both set directly on the
    // created element, because `FixtureLoader` exposes no setter for either.
    if (e.offset || e.rollAngle !== undefined || e.variableSection || e.name) {
      type Carried = { offset?: unknown; rollAngle?: number; variableSection?: { sectionJ: number; segments?: number }; name?: string };
      const created = (api.model as unknown as { elements?: Map<number, Carried> }).elements?.get?.(newId)
        ?? (api as unknown as { elements?: Map<number, Carried> }).elements?.get?.(newId);
      if (created) {
        if (e.offset) created.offset = JSON.parse(JSON.stringify(e.offset));
        if (e.rollAngle !== undefined) created.rollAngle = e.rollAngle;
        if (e.variableSection) created.variableSection = { ...e.variableSection, sectionJ: secMap.get(e.variableSection.sectionJ) ?? e.variableSection.sectionJ };
        if (e.name) created.name = e.name;
      }
    }

    // Hinges
    if (e.hingeStart && api.toggleHinge) api.toggleHinge(newId, 'start');
    if (e.hingeEnd && api.toggleHinge) api.toggleHinge(newId, 'end');
    for (const [end, rel] of [['i', e.releaseI], ['j', e.releaseJ]] as const) {
      if (!rel || !api.toggleRelease) continue;
      for (const axis of ['my', 'mz', 't'] as const) if (rel[axis]) api.toggleRelease(newId, end, axis);
    }
  }

  // Supports — separate spring stiffness keys from opts (settlements, angles, 3D DOF)
  const springKeys = new Set(['kx', 'ky', 'kz', 'krx', 'kry', 'krz']);
  for (const s of json.supports) {
    const nodeId = nodeMap.get(s.nodeId)!;
    const { id: _id, nodeId: _nid, type, ...rest } = s;
    const springs: Record<string, number> = {};
    const opts: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (springKeys.has(k)) springs[k] = v as number;
      else opts[k] = v;
    }
    const hasSpring = Object.keys(springs).length > 0 ? springs : undefined;
    const hasOpts = Object.keys(opts).length > 0 ? opts : undefined;
    api.addSupport(nodeId, type, hasSpring, hasOpts);
  }

  // Loads
  for (const load of json.loads) {
    const d = load.data;
    switch (load.type) {
      case 'distributed': {
        api.addDistributedLoad?.(
          elemMap.get(d.elementId as number)!, d.qI as number, d.qJ as number,
          d.angle as number | undefined, d.isGlobal as boolean | undefined, d.caseId as number | undefined,
        );
        break;
      }
      case 'nodal': {
        api.addNodalLoad?.(
          nodeMap.get(d.nodeId as number)!,
          d.fx as number,
          d.fz as number,
          d.my as number | undefined,
          d.caseId as number | undefined,
        );
        break;
      }
      case 'pointOnElement': {
        const { elementId, a, p, ...opts } = d;
        api.addPointLoadOnElement?.(elemMap.get(elementId as number)!, a as number, p as number, opts);
        break;
      }
      case 'thermal': {
        api.addThermalLoad?.(elemMap.get(d.elementId as number)!, d.dtUniform as number, d.dtGradient as number);
        break;
      }
      case 'distributed3d': {
        api.addDistributedLoad3D?.(
          elemMap.get(d.elementId as number)!, d.qYI as number, d.qYJ as number,
          d.qZI as number, d.qZJ as number, d.a as number | undefined,
          d.b as number | undefined, d.caseId as number | undefined,
          { frame: d.frame as never, qXI: d.qXI as number | undefined, qXJ: d.qXJ as number | undefined },
        );
        break;
      }
      case 'nodal3d': {
        api.addNodalLoad3D?.(
          nodeMap.get(d.nodeId as number)!, d.fx as number, d.fy as number,
          d.fz as number, d.mx as number, d.my as number, d.mz as number,
          d.caseId as number | undefined,
        );
        break;
      }
      case 'surface3d': {
        const qId = quadMap.get(d.quadId as number) ?? d.quadId as number;
        api.addSurfaceLoad3D?.(qId, d.q as number, d.caseId as number | undefined);
        break;
      }
    }
  }

  // Plates
  for (const p of json.plates) {
    const mappedNodes = p.nodes.map(n => nodeMap.get(n)!);
    const matId = matMap.get(p.materialId) ?? p.materialId;
    api.addPlate?.(mappedNodes, matId, p.thickness);
  }

  // Quads
  for (const q of json.quads) {
    const mappedNodes = q.nodes.map(n => nodeMap.get(n)!);
    const matId = matMap.get(q.materialId) ?? q.materialId;
    const newId = api.addQuad?.(mappedNodes, matId, q.thickness);
    if (newId != null) quadMap.set(q.id, newId);
  }

  // Constraints
  for (const c of json.constraints) {
    // Remap node IDs in constraints
    const mapped = { ...c };
    if (typeof mapped.masterNode === 'number') mapped.masterNode = nodeMap.get(mapped.masterNode as number) ?? mapped.masterNode;
    if (Array.isArray(mapped.slaveNodes)) mapped.slaveNodes = (mapped.slaveNodes as number[]).map(n => nodeMap.get(n) ?? n);
    if (typeof mapped.nodeI === 'number') mapped.nodeI = nodeMap.get(mapped.nodeI as number) ?? mapped.nodeI;
    if (typeof mapped.nodeJ === 'number') mapped.nodeJ = nodeMap.get(mapped.nodeJ as number) ?? mapped.nodeJ;
    if (Array.isArray(mapped.nodes)) mapped.nodes = (mapped.nodes as number[]).map(n => nodeMap.get(n) ?? n);
    api.addConstraint?.(mapped);
  }

  api.model.loadCases = loadCases as any;
  api.model.combinations = combinations as any;
  if (json.loadCases.length > 0) api.nextId.loadCase = Math.max(...json.loadCases.map(lc => lc.id)) + 1;
  if (json.combinations.length > 0 || rebuilt) api.nextId.combination = Math.max(0, ...combinations.map(c => (c as { id: number }).id)) + 1;

  // Analysis rules, with any member list re-pointed at the ids this load gave the members.
  if (json.analysis) {
    const analysis = JSON.parse(JSON.stringify(json.analysis)) as NonNullable<JSONModel['analysis']>;
    for (const sw of analysis.selfWeight ?? []) {
      if (sw.elements) sw.elements = sw.elements.map((id) => elemMap.get(id) ?? id);
    }
    (api.model as { analysis?: unknown }).analysis = analysis;
  }

  // Point masses for the dynamic analyses, on the nodes this load created.
  if (json.pointMasses?.length) {
    const points = json.pointMasses.map((pm) => ({ ...pm, nodeId: nodeMap.get(pm.nodeId) ?? pm.nodeId }));
    (api.model as { massSource?: unknown }).massSource = { kind: 'custom', factors: [], points };
  }

  // Provenance passthrough (CAD-derived draft examples).
  if (json.provenance) {
    (api.model as { provenance?: unknown }).provenance = JSON.parse(JSON.stringify(json.provenance));
  }
}

type FixtureCombination = { factors?: ReadonlyArray<{ caseId: number }> };
type FixtureCase = { id: number; type?: string; name: string };
type CodeCombination = { id: number; name: string; factors: Array<{ caseId: number; factor: number }>; origin?: unknown };

/** CIRSOC 101-2025 §2.3.2's strength combinations over `cases`, as signed. Needs the engine. */
function codeCombinations(cases: ReadonlyArray<FixtureCase>): CodeCombination[] {
  const specs = generateCombinations({ present: presentSymbols(cases) }).map((c) => withOrigin(c, CIRSOC101_BASIS));
  return expandCombinations(specs, cases).map((c, i) => ({ id: i + 1, name: c.name, factors: c.factors, ...(c.origin ? { origin: c.origin } : {}) }));
}

/**
 * The fixture's cases and combinations as releases up to v0.4.0 loaded them: its own, else the
 * ones in place, unchecked. Only for opening a fixture as such a release did (the legacy corpus).
 */
function keptLoadCases<C extends FixtureCombination>(
  json: Pick<JSONModel, 'loadCases' | 'combinations'>,
  current: { loadCases: ReadonlyArray<FixtureCase>; combinations: readonly C[] },
): { loadCases: ReadonlyArray<FixtureCase>; combinations: ReadonlyArray<C | JSONModel['combinations'][number]>; rebuilt: false } {
  return {
    loadCases: json.loadCases.length > 0 ? json.loadCases : current.loadCases,
    combinations: json.combinations.length > 0 ? json.combinations : current.combinations,
    rebuilt: false,
  };
}

/**
 * The cases and combinations a fixture leaves the model with. A fixture with cases of its own and
 * no combinations keeps the current ones when each of their cases is there with the type it was
 * written for and every case it loads is in one of them; otherwise it
 * gets CIRSOC 101-2025's for its cases (`rebuilt`), and is refused if those leave a loaded case
 * out. One with a load in a case it lacks, or whose own combination names such a case or a factor
 * that is not a number, is refused.
 */
export function fixtureLoadCases<C extends FixtureCombination>(
  json: Pick<JSONModel, 'name' | 'loadCases' | 'combinations' | 'loads'>,
  current: { loadCases: ReadonlyArray<FixtureCase>; combinations: readonly C[] },
): { loadCases: ReadonlyArray<FixtureCase>; combinations: ReadonlyArray<C | CodeCombination>; rebuilt: boolean } {
  const loadCases = json.loadCases.length > 0 ? json.loadCases : current.loadCases;
  const typeOf = (cases: ReadonlyArray<FixtureCase>) => new Map(cases.map((c) => [c.id, c.type ?? '']));
  const now = typeOf(loadCases), before = typeOf(current.loadCases);
  const loaded = new Set<unknown>(json.loads.map((l) => (l.data?.caseId === undefined ? 1 : l.data.caseId)));
  const unlisted = [...loaded].filter((id) => typeof id !== 'number' || !now.has(id));
  if (unlisted.length > 0 && loadCases.length > 0) throw new Error(tp('fixture.err.loadCaseMissing', { model: json.name, ids: unlisted.join(', ') }));
  const factorsOf = (c: { factors?: unknown }) => (Array.isArray(c.factors) ? c.factors as Array<{ caseId: number; factor?: number } | null | undefined> : null);
  if (json.combinations.length === 0 && json.loadCases.length === 0) return { loadCases, combinations: current.combinations, rebuilt: false };
  if (json.combinations.length === 0) {
    const fits = (c: FixtureCombination) => (c.factors ?? []).every((f) => now.has(f.caseId) && now.get(f.caseId) === before.get(f.caseId));
    const combined = new Set(current.combinations.flatMap((c) => (c.factors ?? []).filter((f) => (f as { factor?: number }).factor !== 0).map((f) => f.caseId)));
    const everyLoadedCombined = [...loaded].every((id) => combined.has(id as number));
    if (current.combinations.every(fits) && everyLoadedCombined) return { loadCases, combinations: current.combinations, rebuilt: false };
    const rebuilt = codeCombinations(loadCases);
    const taken = new Set(rebuilt.flatMap((c) => c.factors.filter((f) => f.factor !== 0).map((f) => f.caseId)));
    const left = [...loaded].filter((id) => !taken.has(id as number));
    if (left.length > 0) throw new Error(tp('fixture.err.caseUncombined', { model: json.name, ids: left.join(', ') }));
    return { loadCases, combinations: rebuilt, rebuilt: true };
  }
  const dangling = json.combinations.filter((c) => c == null || !factorsOf(c)?.every((f) => f != null && now.has(f.caseId) && Number.isFinite(f.factor)));
  if (dangling.length > 0) {
    throw new Error(tp('fixture.err.combinationMalformed', { model: json.name, names: dangling.map((c) => `"${c?.name}"`).join(', ') }));
  }
  return { loadCases, combinations: json.combinations, rebuilt: false };
}

function withoutId(obj: Record<string, unknown>): Record<string, unknown> {
  const { id: _, ...rest } = obj;
  return rest;
}
