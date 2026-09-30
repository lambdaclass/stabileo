/**
 * exercise-spec.ts — an exercise as DATA rather than as code.
 *
 * # Why
 *
 * An exercise used to carry two functions: `build(api)`, which issued a
 * sequence of calls to construct the structure, and one `getCorrect` per
 * question, which dug the right answer out of the solver's output. Both are
 * TypeScript, so writing an exercise meant writing code, compiling it and
 * shipping it. For a mode whose whole point is having a lot of exercises, that
 * is the binding constraint.
 *
 * Here a structure is a list of nodes, elements, supports and loads, and an
 * answer is a description of what to measure. Nothing executes except this
 * module.
 *
 * # The bug the old shape encouraged
 *
 * Some `getCorrect` functions did not read the solver at all — they returned a
 * literal, `() => 5 * 8 * 8 / 8`. Not laziness: the extractor available for
 * "maximum moment" only looked at the two ENDS of each element, so the
 * mid-span maximum of a distributed load was invisible to it and the author had
 * to supply the value by hand. That works until the exercise changes, at which
 * point the stated answer is silently wrong and nothing notices.
 *
 * `maxAbs*` here sweeps the diagram along each element instead, so the
 * mid-span maximum is found and no answer needs to be written by hand.
 */

import type { SupportType } from '../../lib/store/ui.svelte';
import type { ElementForces } from '../../lib/engine/types';
import { computeDiagramValueAt } from '../../lib/engine/diagrams';
import { t, tp } from '../../lib/i18n';

// ─── The structure ─────────────────────────────────────────────────

export interface ModelSpec {
  /** Node positions as `[x, y]`, in metres. Referred to by index. */
  nodes: Array<[number, number]>;
  /** Elements as `[startNode, endNode]`, by node index. */
  elements: Array<[number, number]>;
  supports: Array<{ node: number; type: SupportType }>;
  /**
   * Catalogue profile the members use, by name.
   *
   * Only needed when the exercise asks about stresses — a statics problem about
   * reactions and diagrams does not care, and forcing a choice would be noise.
   * When present it is what makes "what is sigma_max here" answerable.
   */
  profile?: string;
  /** Yield strength in MPa, for failure-criterion questions. */
  fy?: number;
  nodalLoads?: Array<{ node: number; fx?: number; fy?: number; mz?: number }>;
  /** Distributed loads on an element index; `qJ` defaults to `qI` (uniform). */
  distributedLoads?: Array<{ element: number; qI: number; qJ?: number }>;
}

/** The subset of the model API an exercise needs. */
export interface EduExerciseAPI {
  addNode: (x: number, y: number) => number;
  addElement: (nI: number, nJ: number) => number;
  addSupport: (nodeId: number, type: SupportType) => void;
  addNodalLoad: (nodeId: number, fx: number, fy: number, mz?: number) => void;
  addDistributedLoad: (elementId: number, qI: number, qJ?: number) => void;
}

/**
 * Build a declared structure through the existing API.
 *
 * Kept as a translation rather than a replacement so the store, the panel and
 * everything downstream go on working unchanged; only the authoring surface
 * moved.
 */
export function buildFromSpec(model: ModelSpec, api: EduExerciseAPI): void {
  const nodeIds = model.nodes.map(([x, y]) => api.addNode(x, y));
  const elementIds = model.elements.map(([i, j]) => api.addElement(nodeIds[i], nodeIds[j]));
  for (const s of model.supports) api.addSupport(nodeIds[s.node], s.type);
  for (const l of model.nodalLoads ?? []) {
    api.addNodalLoad(nodeIds[l.node], l.fx ?? 0, l.fy ?? 0, l.mz);
  }
  for (const l of model.distributedLoads ?? []) {
    api.addDistributedLoad(elementIds[l.element], l.qI, l.qJ ?? l.qI);
  }
}

// ─── The answers ───────────────────────────────────────────────────

/** Which internal force a measurement refers to. */
export type ForceKind = 'moment' | 'shear' | 'axial';

/**
 * What to measure, declared rather than computed by a bespoke function.
 *
 * Everything here is read from the solver's own output, so an answer cannot
 * drift away from the structure it belongs to. That is the property the old
 * hand-written literals lacked.
 */
export type AnswerSpec =
  /**
   * Largest absolute value along the whole member, swept rather than sampled
   * at the ends — which is what makes a distributed load's mid-span maximum
   * visible. `elements` restricts the sweep; omitted means all of them.
   */
  | { kind: 'maxAbs'; force: ForceKind; elements?: number[] }
  /** Value at a fractional position along one element, `t` in `[0, 1]`. */
  | { kind: 'at'; force: ForceKind; element: number; t: number }
  /** Signed extreme along the member, keeping the sign. */
  | { kind: 'extreme'; force: ForceKind; sign: 'max' | 'min'; elements?: number[] }
  /**
   * Another answer times a constant — a section modulus, a unit conversion.
   * Keeps a derived quantity like `sigma = M/W` tied to the solver instead of
   * being written out by hand.
   */
  | { kind: 'scaled'; of: AnswerSpec; factor: number }
  /**
   * A literal, for a reference value the solver genuinely does not produce —
   * a section modulus from its own formula, an Euler load the student is meant
   * to compute. NOT for anything the solver could have told us.
   */
  | { kind: 'literal'; value: number }
  /**
   * A stress at a station, computed over the exercise's real section geometry.
   *
   * This is what the section work bought the teaching mode: a student can be
   * asked for a von Mises stress on an actual rolled profile, with the answer
   * coming from the same solver the professional mode uses.
   */
  | { kind: 'stress'; measure: StressMeasure; element: number; t: number };

/** Which stress a question asks about. */
export type StressMeasure = 'sigmaMax' | 'sigmaMin' | 'tauMax' | 'vonMises';

/** Stations per element when sweeping. Odd, so mid-span is sampled exactly. */
const SWEEP = 41;

/**
 * A diagram value in the convention the student is taught, and shown.
 *
 * The engine carries moments HOGGING-positive: the sagging moment at the
 * middle of a simply supported beam comes out negative. The canvas already
 * knows this — `diagramSideFactor` in draw-diagrams.ts flips nothing for
 * moment precisely because a negative engine value lands on the structural
 * side, which is where an engineer expects to see it drawn.
 *
 * A student writes that same moment as +40 kN·m sagging, and every course
 * does. Grading them against −40 would be marking them wrong for using the
 * convention the subject uses — so the sign is turned here, once, at the only
 * point where a diagram value is compared with something a student wrote.
 *
 * Deliberately NOT applied to stresses: those consume the raw element forces
 * through `ctx.stress`, where the engine's own convention is what the section
 * formulas expect.
 */
export function diagramValueAsShown(force: ForceKind, t: number, ef: ElementForces): number {
  const raw = computeDiagramValueAt(force, t, ef);
  return force === 'moment' ? -raw : raw;
}

function valueAt(force: ForceKind, t: number, ef: ElementForces): number {
  return diagramValueAsShown(force, t, ef);
}

function sweep(
  force: ForceKind,
  forces: ElementForces[],
  elements: number[] | undefined,
  pick: (acc: number, v: number) => number,
  seed: number,
): number {
  const idx = elements ?? forces.map((_, i) => i);
  let acc = seed;
  for (const i of idx) {
    const ef = forces[i];
    if (!ef) continue;
    for (let s = 0; s < SWEEP; s++) {
      acc = pick(acc, valueAt(force, s / (SWEEP - 1), ef));
    }
  }
  return acc;
}

/**
 * Evaluate an answer against solver output.
 *
 * Returns `null` when the structure does not contain what the answer refers to,
 * rather than a zero that would read as a legitimate result — a question
 * pointing at a non-existent element is an authoring error and has to surface
 * as one.
 */
export interface AnswerContext {
  /**
   * Resolves a stress measure over the exercise's section.
   *
   * Injected rather than imported so this module stays free of the section
   * engine — it is the piece that has to be trivially testable, since every
   * answer a student is marked against passes through it.
   */
  stress?: (measure: StressMeasure, element: number, t: number, forces: ElementForces[]) => number | null;
}

export function evaluateAnswer(
  spec: AnswerSpec,
  forces: ElementForces[],
  ctx: AnswerContext = {},
): number | null {
  switch (spec.kind) {
    case 'stress': {
      if (!forces[spec.element]) return null;
      // No resolver means the caller cannot answer stress questions. Null, not
      // zero: zero would read as "no stress here", which is a different claim.
      return ctx.stress ? ctx.stress(spec.measure, spec.element, spec.t, forces) : null;
    }
    case 'literal':
      return spec.value;
    case 'scaled': {
      const inner = evaluateAnswer(spec.of, forces, ctx);
      return inner === null ? null : inner * spec.factor;
    }
    case 'maxAbs': {
      if (spec.elements?.some((i) => !forces[i])) return null;
      return sweep(spec.force, forces, spec.elements, (a, v) => Math.max(a, Math.abs(v)), 0);
    }
    case 'extreme': {
      if (spec.elements?.some((i) => !forces[i])) return null;
      return spec.sign === 'max'
        ? sweep(spec.force, forces, spec.elements, (a, v) => Math.max(a, v), -Infinity)
        : sweep(spec.force, forces, spec.elements, (a, v) => Math.min(a, v), Infinity);
    }
    case 'at': {
      const ef = forces[spec.element];
      if (!ef) return null;
      return valueAt(spec.force, spec.t, ef);
    }
  }
}

// ─── The exercise ──────────────────────────────────────────────────

export type ExerciseCategory = 'statics' | 'strength' | 'advanced';
/**
 * The shapes a diagram can have, up to the one a triangular load produces.
 *
 * Cubic was missing, and it is not exotic: a linearly varying load makes the
 * shear quadratic and the moment cubic, which is the second case any course
 * covers. Without it the only honest answer to that exercise was absent from
 * the list.
 */
export type DiagramShape = 'zero' | 'constant' | 'linear' | 'quadratic' | 'cubic';

export interface KinematicQuestion {
  classification: 'isostatic' | 'hyperstatic';
  degree?: number;
}

export interface DiagramShapeQuestion {
  diagram: 'N' | 'V' | 'M';
  correct: DiagramShape;
}

/**
 * "Draw this diagram."
 *
 * Nothing but which diagram, on which member: the answer is the solve, so
 * there is no correct sketch to store and nothing for an author to get wrong.
 */
export interface DiagramSketchQuestion {
  /**
   * Which one to draw. `D` is the deflected shape, and it belongs in this
   * list for the reason the chain V → M → D exists at all: each is the
   * integral of the one before, so each is one power higher. A triangular
   * load gives a quadratic shear, a cubic moment and a quartic deflection —
   * and a student who has seen that once stops guessing.
   */
  diagram: 'N' | 'V' | 'M' | 'D';
  /** Index into `model.elements`; the first member when absent. */
  elementIndex?: number;
}

export interface SectionDataItem {
  label: string;
  value: string;
}

export interface EduExerciseSpec {
  id: string;
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  category: ExerciseCategory;
  solverType?: 'linear' | 'pdelta';
  /** The structure, as data. */
  model: ModelSpec;
  /** Reactions the student is asked for, by node index into `model.nodes`. */
  supports: Array<{ label: string; nodeIndex: number; dofs: ('Rx' | 'Ry' | 'M')[] }>;
  characteristics: Array<{ label: string; unit: string; answer: AnswerSpec }>;
  diagramQuestions: Array<{ question: string; unit: string; answer: AnswerSpec }>;
  kinematicQuestion?: KinematicQuestion;
  diagramShapeQuestions?: DiagramShapeQuestion[];
  /** Diagrams the student has to draw rather than name. */
  diagramSketchQuestions?: DiagramSketchQuestion[];
  sectionData?: SectionDataItem[];
  /**
   * Whether the student may reveal an answer instead of solving it.
   *
   * Defaults to true, which is how every exercise written before this existed
   * behaves. A teacher setting an assessment turns it off; one handing out
   * practice leaves it on. Absent means "on", so no existing file changes
   * meaning by being read with a newer app.
   */
  allowReveal?: boolean;
}

/**
 * Structural problems an exercise can have, found without running the solver.
 *
 * Kept separate from the solver-based validation so an author gets the cheap
 * feedback immediately: a support on a node that does not exist does not need a
 * linear system to be recognised as a mistake.
 */
export function lintExercise(ex: EduExerciseSpec): string[] {
  const problems: string[] = [];
  const nodeCount = ex.model.nodes.length;
  const elemCount = ex.model.elements.length;
  const node = (i: number, where: string) => {
    if (!Number.isInteger(i) || i < 0 || i >= nodeCount) {
      problems.push(tp('edu.lint.nodeMissing', { where, i, n: nodeCount }));
    }
  };
  const elem = (i: number, where: string) => {
    if (!Number.isInteger(i) || i < 0 || i >= elemCount) {
      problems.push(tp('edu.lint.elementMissing', { where, i, n: elemCount }));
    }
  };

  if (nodeCount < 2) problems.push(t('edu.lint.fewNodes'));
  if (elemCount < 1) problems.push(t('edu.lint.noElements'));
  if (ex.model.supports.length === 0) problems.push(t('edu.lint.noSupports'));

  ex.model.elements.forEach(([i, j], k) => {
    node(i, tp('edu.lint.whereElementStart', { k }));
    node(j, tp('edu.lint.whereElementEnd', { k }));
    if (i === j) problems.push(tp('edu.lint.sameNode', { k }));
  });
  ex.model.supports.forEach((s, k) => node(s.node, tp('edu.lint.whereSupport', { k })));
  (ex.model.nodalLoads ?? []).forEach((l, k) => node(l.node, tp('edu.lint.whereNodalLoad', { k })));
  (ex.model.distributedLoads ?? []).forEach((l, k) => elem(l.element, tp('edu.lint.whereDistLoad', { k })));
  ex.supports.forEach((s, k) => node(s.nodeIndex, tp('edu.lint.whereReaction', { k })));

  const checkAnswer = (a: AnswerSpec, where: string): void => {
    if (a.kind === 'at') {
      elem(a.element, where);
      if (a.t < 0 || a.t > 1) problems.push(tp('edu.lint.tOutside', { where, t: a.t }));
    } else if (a.kind === 'stress') {
      elem(a.element, where);
      if (a.t < 0 || a.t > 1) problems.push(tp('edu.lint.tOutside', { where, t: a.t }));
      if (!ex.model.profile) {
        problems.push(tp('edu.lint.stressNoProfile', { where }));
      }
    } else if (a.kind === 'scaled') {
      if (!Number.isFinite(a.factor) || a.factor === 0) {
        problems.push(tp('edu.lint.badFactor', { where, f: a.factor }));
      }
      checkAnswer(a.of, where);
    } else if (a.kind !== 'literal') {
      (a.elements ?? []).forEach((i) => elem(i, where));
    }
  };
  ex.characteristics.forEach((c, k) => checkAnswer(c.answer, tp('edu.lint.whereCharacteristic', { k, label: c.label })));
  ex.diagramQuestions.forEach((q, k) => checkAnswer(q.answer, tp('edu.lint.whereDiagram', { k })));

  // Two elements between the same pair of nodes is almost always a typo, and
  // it produces a structure that solves but is not the one intended.
  const seen = new Set<string>();
  ex.model.elements.forEach(([i, j], k) => {
    const key = i < j ? `${i}-${j}` : `${j}-${i}`;
    if (seen.has(key)) problems.push(tp('edu.lint.duplicate', { k }));
    seen.add(key);
  });

  return problems;
}
