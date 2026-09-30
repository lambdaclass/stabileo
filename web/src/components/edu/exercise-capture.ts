/**
 * exercise-capture.ts — turn what a teacher DREW into an exercise, and back.
 *
 * # Why this exists
 *
 * Making an exercise a data structure was necessary but nowhere near
 * sufficient: a teacher was still expected to edit a TypeScript file, which is
 * programming with different syntax. Authoring has to happen where the
 * structure already gets built — on the canvas, with the tools that are there.
 *
 * So this reads the live model and produces a spec, and writes a spec back into
 * a model. Everything else about authoring is a question of which questions to
 * ask; the structure itself needs no new editor, because the app already is one.
 *
 * # What is deliberately dropped
 *
 * A spec keeps geometry, supports and loads. It does NOT keep materials,
 * sections, load cases, combinations or 3D data. An exercise is a statics
 * problem posed to a student, not a project file: carrying a section through
 * would make two exercises differ by properties nobody asked about, and the
 * answers are checked against the solve rather than against stored numbers.
 * A model with anything unrepresentable is reported, not silently truncated.
 */

import type { StructureModel, Node, Element, Support, Load } from '../../lib/store/model.svelte';
import type { ModelSpec, EduExerciseSpec } from './exercise-spec';
import { t, tp } from '../../lib/i18n';

/** What could not be captured, so the teacher is told rather than surprised. */
export interface CaptureWarning {
  kind:
    | 'threeDimensional'
    | 'unsupportedLoad'
    | 'unsupportedElement'
    | 'multipleLoadCases'
    | 'noSupports'
    | 'empty';
  detail: string;
}

export interface CaptureResult {
  spec: ModelSpec | null;
  warnings: CaptureWarning[];
}

/**
 * Read the current model as an exercise structure.
 *
 * Node and element IDs become INDICES, because a spec has to survive being
 * saved, shared and re-imported into a model whose ids start again from one.
 */
export function captureModel(model: StructureModel): CaptureResult {
  const warnings: CaptureWarning[] = [];
  const nodes = [...model.nodes.values()] as Node[];
  const elements = [...model.elements.values()] as Element[];

  if (nodes.length === 0 || elements.length === 0) {
    return {
      spec: null,
      warnings: [{ kind: 'empty', detail: t('edu.capture.empty') }],
    };
  }

  if (nodes.some((n) => (n.z ?? 0) !== 0)) {
    warnings.push({
      kind: 'threeDimensional',
      detail: t('edu.capture.threeDimensional'),
    });
  }

  const nodeIndex = new Map<number, number>();
  nodes.forEach((n, i) => nodeIndex.set(n.id, i));
  const elementIndex = new Map<number, number>();
  elements.forEach((e, i) => elementIndex.set(e.id, i));

  const truss = elements.filter((e) => e.type === 'truss');
  if (truss.length > 0 && truss.length < elements.length) {
    warnings.push({
      kind: 'unsupportedElement',
      detail: tp('edu.capture.mixedTruss', { n: truss.length }),
    });
  }

  const supports: ModelSpec['supports'] = [];
  for (const s of [...model.supports.values()] as Support[]) {
    const idx = nodeIndex.get(s.nodeId);
    if (idx == null) continue;
    // The model's support union is wider than the plane one an exercise can
    // pose; anything outside it is reported rather than coerced.
    const plane = ['fixed', 'pinned', 'rollerX', 'rollerY', 'rollerZ', 'spring'];
    if (!plane.includes(s.type as string)) {
      warnings.push({
        kind: 'unsupportedElement',
        detail: tp('edu.capture.unsupportedSupport', { type: s.type }),
      });
      continue;
    }
    supports.push({ node: idx, type: s.type as ModelSpec['supports'][number]['type'] });
  }
  if (supports.length === 0) {
    warnings.push({
      kind: 'noSupports',
      detail: t('edu.capture.noSupports'),
    });
  }

  const nodalLoads: NonNullable<ModelSpec['nodalLoads']> = [];
  const distributedLoads: NonNullable<ModelSpec['distributedLoads']> = [];
  const cases = new Set<string>();
  for (const l of model.loads as Load[]) {
    const anyCase = (l.data as { caseId?: string }).caseId;
    if (anyCase) cases.add(anyCase);
    if (l.type === 'nodal') {
      const d = l.data as { nodeId: number; fx?: number; fy?: number; mz?: number };
      const idx = nodeIndex.get(d.nodeId);
      if (idx == null) continue;
      nodalLoads.push({ node: idx, fx: d.fx || undefined, fy: d.fy || undefined, mz: d.mz || undefined });
    } else if (l.type === 'distributed') {
      const d = l.data as { elementId: number; qI: number; qJ?: number };
      const idx = elementIndex.get(d.elementId);
      if (idx == null) continue;
      distributedLoads.push({ element: idx, qI: d.qI, qJ: d.qJ ?? d.qI });
    } else {
      warnings.push({
        kind: 'unsupportedLoad',
        detail: tp('edu.capture.unsupportedLoad', { type: l.type }),
      });
    }
  }
  if (cases.size > 1) {
    warnings.push({
      kind: 'multipleLoadCases',
      detail: tp('edu.capture.multipleCases', { n: cases.size }),
    });
  }

  return {
    spec: {
      nodes: nodes.map((n) => [round(n.x), round(n.y)] as [number, number]),
      elements: elements.map((e) => [nodeIndex.get(e.nodeI)!, nodeIndex.get(e.nodeJ)!] as [number, number]),
      supports,
      nodalLoads: nodalLoads.length ? nodalLoads : undefined,
      distributedLoads: distributedLoads.length ? distributedLoads : undefined,
    },
    warnings,
  };
}

/** Six decimals is a micrometre — well past anything a teacher draws. */
function round(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

// ─── Sharing ───────────────────────────────────────────────────────

/** Schema version, so a file from an older Stabileo can be recognised. */
export const EXERCISE_FILE_VERSION = 1;

export interface ExerciseFile {
  stabileoExercise: number;
  exercise: EduExerciseSpec;
}

/**
 * Serialise an exercise for a file or a link.
 *
 * Pretty-printed on purpose: a teacher who wants to hand-edit one afterwards
 * should be able to, and a diff between two versions should be readable. It is
 * a few hundred bytes either way.
 */
export function toFile(exercise: EduExerciseSpec): string {
  return JSON.stringify({ stabileoExercise: EXERCISE_FILE_VERSION, exercise } satisfies ExerciseFile, null, 2);
}

export type ParseResult =
  | { ok: true; exercise: EduExerciseSpec }
  | { ok: false; error: string };

/**
 * Read an exercise back, refusing anything that is not one.
 *
 * The checks are deliberately blunt and specific: a teacher who opens the wrong
 * file should be told that, not handed a half-built exercise that fails later
 * with something cryptic in front of a class.
 */
export function fromFile(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: t('edu.capture.errNotJson') };
  }
  const f = parsed as Partial<ExerciseFile>;
  if (typeof f?.stabileoExercise !== 'number') {
    return { ok: false, error: t('edu.capture.errNotExercise') };
  }
  if (f.stabileoExercise > EXERCISE_FILE_VERSION) {
    return {
      ok: false,
      error: tp('edu.capture.errNewer', { v: f.stabileoExercise, max: EXERCISE_FILE_VERSION }),
    };
  }
  const ex = f.exercise;
  if (!ex || typeof ex !== 'object') return { ok: false, error: t('edu.capture.errNoExercise') };
  for (const field of ['id', 'title', 'difficulty', 'category'] as const) {
    if (typeof ex[field] !== 'string') {
      return { ok: false, error: tp('edu.capture.errMissingField', { field }) };
    }
  }
  if (!ex.model?.nodes?.length || !ex.model?.elements?.length) {
    return { ok: false, error: t('edu.capture.errNoStructure') };
  }
  // Fill the optional collections so consumers never have to guard them.
  return {
    ok: true,
    exercise: {
      ...ex,
      supports: ex.supports ?? [],
      characteristics: ex.characteristics ?? [],
      diagramQuestions: ex.diagramQuestions ?? [],
    } as EduExerciseSpec,
  };
}
