import type { ElementForces } from '../../lib/engine/types';
import { t } from '../../lib/i18n';
import type { Variant } from './exercise-params';
import { evaluateAnswer, type EduExerciseSpec, type ReactionDof } from './exercise-spec';
import type { Submission, SubmittedAnswer } from './exercise-submission';
import { stressContext } from './exercise-stress';
import { readDisplayedReaction } from './edu-reactions';
import { isParametric, shapeAnswer, solveModel, specNodeIds, studentSeed, variantOf } from './exercise-variant';

export const TOLERANCE = 0.05;

export type Outcome = 'correct' | 'incorrect' | 'pending';

export function withinTolerance(student: number, correct: number): boolean {
  const abs = Math.abs(correct);
  const tol = abs > 0.01 ? abs * TOLERANCE : 0.1;
  return Math.abs(student - correct) <= tol;
}

/** Reactions keep their sign; diagram and characteristic values are marked on magnitude, as the exercise view does. */
export function markNumber(answer: string, correct: number | null, signed: boolean): Outcome {
  const v = parseFloat(answer.replace(',', '.'));
  if (correct === null || !Number.isFinite(correct) || Number.isNaN(v)) return 'pending';
  return (signed ? withinTolerance(v, correct) : withinTolerance(Math.abs(v), Math.abs(correct))) ? 'correct' : 'incorrect';
}

export interface RemarkedAnswer extends SubmittedAnswer {
  expected?: string;
  recorded: Outcome;
}

export interface Remark {
  answers: RemarkedAnswer[];
  variant: Variant | null;
  changed: number;
  seedMismatch: boolean;
}

/** The legajo wins over a carried seed: the seed is the part of a file a student could edit without it showing. */
export function submissionVariant(spec: EduExerciseSpec, sub: Submission): { which?: number | Variant; seedMismatch: boolean } {
  if (!isParametric(spec)) return { seedMismatch: false };
  if (sub.legajo) {
    const seed = studentSeed(spec.id, sub.legajo);
    return { which: seed, seedMismatch: sub.seed !== undefined && sub.seed !== seed };
  }
  if (sub.seed !== undefined) return { which: sub.seed, seedMismatch: false };
  if (sub.variant) return { which: sub.variant, seedMismatch: false };
  return { seedMismatch: false };
}

const fixed = (v: number | null) => (v === null || !Number.isFinite(v) ? undefined : v.toFixed(2));

/** Rebuilds the variant the submission was made against, solves it and marks every keyed answer again. Null when it cannot. */
export function remarkSubmission(spec: EduExerciseSpec, sub: Submission): Remark | null {
  const { which, seedMismatch } = submissionVariant(spec, sub);
  if (isParametric(spec) && which === undefined) return null;
  let ex;
  try { ex = variantOf(spec, which); } catch { return null; }
  const results = solveModel(ex.model, ex.solverType);
  if (typeof results === 'string') return null;
  const forces = results.elementForces as ElementForces[];
  const ctx = stressContext(ex.model.profile, ex.model.fy);
  const ids = specNodeIds(ex.model);

  const mark = (a: SubmittedAnswer): { outcome: Outcome; expected?: string } | null => {
    const [kind, i, dof] = (a.key ?? '').split(':');
    const n = Number(i);
    switch (kind) {
      case 'r': {
        const s = ex.supports[n];
        if (!s) return null;
        const v = readDisplayedReaction(results, ids[s.nodeIndex] ?? null, dof as ReactionDof);
        return { outcome: markNumber(a.answer, v, true), expected: fixed(v) };
      }
      case 'd':
      case 'c': {
        const q = kind === 'd' ? ex.diagramQuestions[n] : ex.characteristics[n];
        if (!q) return null;
        const v = evaluateAnswer(q.answer, forces, ctx);
        return { outcome: markNumber(a.answer, v, false), expected: fixed(v === null ? null : Math.abs(v)) };
      }
      case 'k': {
        const k = ex.kinematicQuestion;
        if (!k) return null;
        return { outcome: a.answer ? (a.answer === k.classification ? 'correct' : 'incorrect') : 'pending', expected: t(`edu.${k.classification}`) };
      }
      case 'kd': {
        const k = ex.kinematicQuestion;
        if (!k) return null;
        const deg = k.classification === 'hyperstatic' ? k.degree ?? 0 : 0;
        const v = parseInt(a.answer, 10);
        return { outcome: Number.isNaN(v) ? 'pending' : v === deg ? 'correct' : 'incorrect', expected: String(deg) };
      }
      case 's': {
        const q = ex.diagramShapeQuestions?.[n];
        const shape = q ? shapeAnswer(q, forces) : null;
        if (!shape) return null;
        return { outcome: a.answer ? (a.answer === shape ? 'correct' : 'incorrect') : 'pending', expected: t(`edu.shape.${shape}`) };
      }
      default:
        return null;
    }
  };

  let changed = 0;
  const answers = sub.answers.map((a): RemarkedAnswer => {
    const m = a.revealed ? null : mark(a);
    if (!m) return { ...a, recorded: a.outcome };
    if (m.outcome !== a.outcome) changed++;
    return { ...a, outcome: m.outcome, expected: m.expected, recorded: a.outcome };
  });
  return { answers, variant: ex.variant ?? null, changed, seedMismatch };
}
