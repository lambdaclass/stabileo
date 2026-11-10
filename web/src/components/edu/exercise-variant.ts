import type { SupportType } from '../../lib/store/ui.svelte';
import type { Element, Load, Material, Node, Section, Support } from '../../lib/store/model.svelte';
import type { AnalysisResults, ElementForces } from '../../lib/engine/types';
import { buildSolverInput2D, validateAndSolve2D, type ModelData } from '../../lib/engine/solver-service';
import { computeStaticDegree } from '../../lib/engine/kinematic-2d';
import { solvePDelta } from '../../lib/engine/wasm-solver';
import { resolveDefaultSection } from '../../lib/store/canonical-sections';
import { errorText } from '../../lib/utils/error-text';
import { i18n, t, tp } from '../../lib/i18n';
import {
  defaultVariant, drawVariant, lintParams, modelExprs, resolveModel, seedFrom, supportCombos,
  type ExerciseParams, type Variant,
} from './exercise-params';
import {
  diagramValueAsShown, evaluateAnswer,
  type DiagramShape, type EduExerciseSpec, type KinematicQuestion, type ModelSpec, type ReactionDof,
  type ResolvedExerciseSpec,
} from './exercise-spec';
import { degreeOfSamples } from './diagram-sketch';
import { readDisplayedReaction } from './edu-reactions';
import { stressContext } from './exercise-stress';
import { SUPPORT_TYPE_KEYS } from './exercise-presets';

export function isParametric(spec: Pick<EduExerciseSpec, 'params'>): boolean {
  const p = spec.params;
  if (!p) return false;
  return Object.keys(p.values).length > 0 || (p.supportChoices ?? []).some((c) => c.types.length > 1);
}

/** Same legajo, same variant: spaces, dots and hyphens are how one number gets typed three ways. */
export function normalizeLegajo(legajo: string): string {
  return legajo.trim().toUpperCase().replace(/[\s.\-]/g, '');
}

export function studentSeed(exerciseId: string, legajo: string): number {
  return seedFrom(`${exerciseId}:${normalizeLegajo(legajo)}`);
}

export function reactionDofsFor(type: SupportType): ReactionDof[] {
  switch (type) {
    case 'fixed': return ['Rx', 'Ry', 'M'];
    case 'rollerX': return ['Ry'];
    case 'rollerY':
    case 'rollerZ': return ['Rx'];
    default: return ['Rx', 'Ry'];
  }
}

export function formatParam(v: number): string {
  return new Intl.NumberFormat(i18n.locale || 'en', { maximumFractionDigits: 3, useGrouping: false }).format(v);
}

export function fillText(text: string, values: Record<string, number>): string {
  if (!text.includes('{')) return text;
  return text.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, name: string) =>
    name in values ? formatParam(values[name]!) : m);
}

function chosenVariant(params: ExerciseParams | undefined, which: number | Variant | undefined): Variant {
  if (!params) return { values: {}, supports: {} };
  if (which === undefined) return defaultVariant(params);
  return typeof which === 'number' ? drawVariant(params, which) : which;
}

/** The exercise a student actually gets. Without params the spec comes back meaning exactly what it meant. */
export function variantOf(spec: EduExerciseSpec, which?: number | Variant): ResolvedExerciseSpec {
  const parametric = isParametric(spec);
  const variant = chosenVariant(spec.params, which);
  const values = variant.values;
  const model = resolveModel(spec.model, variant);
  const fill = (s: string) => fillText(s, values);

  const varyingNodes = new Set(
    (spec.params?.supportChoices ?? [])
      .filter((c) => c.types.length > 1)
      .map((c) => spec.model.supports[c.support]?.node),
  );
  const typeAt = new Map(model.supports.map((s) => [s.node, s.type]));
  const supports = spec.supports.map((s) => ({
    label: fill(s.label),
    nodeIndex: s.nodeIndex,
    dofs: s.dofs === 'auto' || varyingNodes.has(s.nodeIndex)
      ? reactionDofsFor(typeAt.get(s.nodeIndex) ?? 'pinned')
      : [...s.dofs],
  }));

  const { params: _params, model: _model, supports: _supports, authoredFrom: _authored, ...rest } = spec;
  const out: ResolvedExerciseSpec = {
    ...rest,
    title: fill(spec.title),
    description: fill(spec.description),
    model,
    supports,
    characteristics: spec.characteristics.map((c) => ({ ...c, label: fill(c.label) })),
    diagramQuestions: spec.diagramQuestions.map((q) => ({ ...q, question: fill(q.question) })),
  };
  if (spec.sectionData) out.sectionData = spec.sectionData.map((d) => ({ label: fill(d.label), value: fill(d.value) }));
  if (spec.diagramShapeQuestions) {
    out.diagramShapeQuestions = spec.diagramShapeQuestions.map((q) => ({
      diagram: q.diagram,
      correct: parametric ? 'auto' : q.correct,
    }));
  }
  if (parametric) {
    if (spec.kinematicQuestion) {
      const k = kinematicsOf(model);
      if (k) out.kinematicQuestion = k;
      else delete out.kinematicQuestion;
    }
    out.variant = variant;
    if (typeof which === 'number') out.seed = which;
  }
  return out;
}

const EDU_MATERIAL: Material = { id: 1, name: 'Acero A36', e: 200000, nu: 0.3, rho: 78.5, fy: 250, fu: 400 };
const EDU_SECTION: Section = {
  id: 1, name: 'IPN 300', a: 0.0069, iy: 0.000098, iz: 0.00000451, j: 0.0000004666,
  b: 0.125, h: 0.3, shape: 'I', tw: 0.0108, tf: 0.0162,
} as Section;

/** Node, element and support ids are index + 1; the default material and section are the ones a cleared model carries. */
export function specModelData(model: ModelSpec): ModelData {
  const hinged = (k: number, end: 'start' | 'end') => (model.hinges ?? []).some((h) => h.element === k && h.end === end);
  const truss = new Set(model.truss ?? []);
  const loads: Load[] = [];
  for (const l of model.nodalLoads ?? []) {
    loads.push({ type: 'nodal', data: { id: loads.length + 1, nodeId: l.node + 1, fx: l.fx ?? 0, fz: l.fy ?? 0, my: l.mz ?? 0 } } as Load);
  }
  for (const l of model.distributedLoads ?? []) {
    loads.push({ type: 'distributed', data: { id: loads.length + 1, elementId: l.element + 1, qI: l.qI, qJ: l.qJ ?? l.qI } } as Load);
  }
  return {
    nodes: new Map(model.nodes.map(([x, y], i) => [i + 1, { id: i + 1, x, y } as Node])),
    elements: new Map(model.elements.map(([a, b], k) => [k + 1, {
      id: k + 1, type: truss.has(k) ? 'truss' : 'frame', nodeI: a + 1, nodeJ: b + 1, materialId: 1, sectionId: 1,
      releaseI: { my: false, mz: hinged(k, 'start'), t: false },
      releaseJ: { my: false, mz: hinged(k, 'end'), t: false },
    } as Element])),
    supports: new Map(model.supports.map((s, k) => [k + 1, { id: k + 1, nodeId: s.node + 1, type: s.type } as Support])),
    loads,
    materials: new Map([[1, { ...EDU_MATERIAL }]]),
    sections: new Map([[1, resolveDefaultSection({ ...EDU_SECTION })]]),
  };
}

export function specNodeIds(model: ModelSpec): number[] {
  return model.nodes.map((_, i) => i + 1);
}

export function solveModel(model: ModelSpec, solverType: 'linear' | 'pdelta' = 'linear'): AnalysisResults | string {
  const data = specModelData(model);
  try {
    if (solverType === 'pdelta') {
      const input = buildSolverInput2D(data, false);
      if (!input) return t('results.emptyModelError');
      const r = solvePDelta(input);
      return typeof r === 'string' ? r : r.results;
    }
    return validateAndSolve2D(data, false) ?? t('results.emptyModelError');
  } catch (e) {
    return errorText(e, t('results.emptyModelError'));
  }
}

/** Counted from the structure, so it needs no solve; a mechanism comes back null. */
export function kinematicsOf(model: ModelSpec): KinematicQuestion | null {
  const input = buildSolverInput2D(specModelData(model), false);
  if (!input) return null;
  const { degree } = computeStaticDegree(input);
  if (degree < 0) return null;
  return degree === 0 ? { classification: 'isostatic' } : { classification: 'hyperstatic', degree };
}

const SHAPE_RANK: DiagramShape[] = ['zero', 'constant', 'linear', 'quadratic', 'cubic'];
const SHAPE_STATIONS = 41;

/** The highest power any member's diagram has; a member carrying a millionth of the peak is read as carrying nothing. */
export function shapeOf(diagram: 'N' | 'V' | 'M', forces: ElementForces[]): DiagramShape | null {
  if (!forces.length) return null;
  const kind = diagram === 'N' ? 'axial' : diagram === 'V' ? 'shear' : 'moment';
  const per = forces.map((ef) =>
    Array.from({ length: SHAPE_STATIONS }, (_, k) => diagramValueAsShown(kind, k / (SHAPE_STATIONS - 1), ef)));
  const peakOf = (s: number[]) => s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const amp = per.reduce((m, s) => Math.max(m, peakOf(s)), 0);
  if (!Number.isFinite(amp)) return null;
  if (amp < 1e-9) return 'zero';
  let best = 0;
  for (const s of per) {
    if (peakOf(s) < amp * 1e-6) continue;
    best = Math.max(best, SHAPE_RANK.indexOf(degreeOfSamples(s)));
  }
  return SHAPE_RANK[best]!;
}

export function shapeAnswer(q: { diagram: 'N' | 'V' | 'M'; correct: DiagramShape | 'auto' }, forces: ElementForces[]): DiagramShape | null {
  return q.correct === 'auto' ? shapeOf(q.diagram, forces) : q.correct;
}

export function supportTypeName(type: SupportType): string {
  return t(SUPPORT_TYPE_KEYS[type] ?? SUPPORT_TYPE_KEYS.pinned);
}

/** What a teacher reads to know which structure a student had: values with units, and the supports that changed. */
export function describeVariant(spec: Pick<EduExerciseSpec, 'params' | 'model'>, v: Variant): string {
  const parts: string[] = [];
  for (const k of Object.keys(spec.params?.values ?? {}).sort()) {
    if (!(k in v.values)) continue;
    const r = spec.params!.values[k]!;
    parts.push(`${r.label || k} = ${formatParam(v.values[k]!)}${r.unit ? ' ' + r.unit : ''}`);
  }
  for (const c of spec.params?.supportChoices ?? []) {
    if (c.types.length < 2) continue;
    const type = v.supports[c.support];
    if (type) parts.push(`${tp('edu.params.supportN', { n: String.fromCharCode(65 + c.support) })}: ${supportTypeName(type)}`);
  }
  return parts.join(' · ');
}

export interface VariantLint {
  problems: string[];
  checked: number;
}

function sampleVariants(params: ExerciseParams, seeds: number): Variant[] {
  const out: Variant[] = [];
  const base = defaultVariant(params);
  for (const supports of supportCombos(params)) out.push({ values: base.values, supports: { ...base.supports, ...supports } });
  for (let i = 0; i < seeds; i++) out.push(drawVariant(params, seedFrom(`lint:${i}`)));
  return out;
}

/** Every answer of one variant, solved; null entries are what makes a variant unusable. */
export function checkResolved(ex: ResolvedExerciseSpec): string[] {
  const results = solveModel(ex.model, ex.solverType);
  if (typeof results === 'string') return [results];
  const problems: string[] = [];
  const forces = results.elementForces as ElementForces[];
  const ctx = stressContext(ex.model.profile, ex.model.fy);
  const ids = specNodeIds(ex.model);
  const bad = (what: string) => problems.push(tp('edu.params.noAnswer', { what }));
  ex.supports.forEach((s) => {
    for (const dof of s.dofs) {
      if (readDisplayedReaction(results, ids[s.nodeIndex] ?? null, dof) === null) bad(`${s.label} ${dof}`);
    }
  });
  for (const c of ex.characteristics) {
    const v = evaluateAnswer(c.answer, forces, ctx);
    if (v === null || !Number.isFinite(v)) bad(c.label);
  }
  for (const q of ex.diagramQuestions) {
    const v = evaluateAnswer(q.answer, forces, ctx);
    if (v === null || !Number.isFinite(v)) bad(q.question || q.unit);
  }
  for (const q of ex.diagramShapeQuestions ?? []) if (shapeAnswer(q, forces) === null) bad(q.diagram);
  return problems;
}

/** Over every support combination and a spread of seeds: each variant must solve and answer everything it asks. */
export function lintVariants(spec: EduExerciseSpec, opts: { seeds?: number } = {}): VariantLint {
  if (!spec.params) {
    const exprs = modelExprs(spec.model).filter((e) => typeof e.expr === 'string');
    return { problems: exprs.map((e) => tp('edu.params.exprWithoutParams', { where: e.where })), checked: 0 };
  }
  const structural = lintParams(spec.model, spec.params);
  if (structural.length) return { problems: structural, checked: 0 };
  const seen = new Set<string>();
  const problems: string[] = [];
  const variants = sampleVariants(spec.params, opts.seeds ?? 50);
  for (const v of variants) {
    let found: string[];
    try {
      const ex = variantOf(spec, v);
      found = checkResolved(ex);
      if (spec.kinematicQuestion && !ex.kinematicQuestion) found.push(t('edu.params.mechanism'));
    } catch (e) {
      found = [errorText(e, String(e))];
    }
    for (const p of found) {
      if (seen.has(p)) continue;
      seen.add(p);
      problems.push(`${describeVariant(spec, v)} — ${p}`);
    }
  }
  return { problems, checked: variants.length };
}
