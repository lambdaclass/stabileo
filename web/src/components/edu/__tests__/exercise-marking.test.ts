import { beforeAll, describe, expect, it } from 'vitest';
import { initSolver } from '../../../lib/engine/wasm-solver';
import { getExerciseSpecs } from '../exercise-data';
import { fromSubmissionCode, fromSubmissionFile, toSubmissionCode, toSubmissionFile, type Submission } from '../exercise-submission';
import { markNumber, remarkSubmission, submissionVariant } from '../exercise-marking';
import { solveModel, specNodeIds, studentSeed, variantOf } from '../exercise-variant';
import { readDisplayedReaction } from '../edu-reactions';

beforeAll(async () => {
  await initSolver();
});

const spec = () => getExerciseSpecs().find((s) => s.id === 'frame-varying-supports')!;

function legajosWithDifferentSupports(): [string, string] {
  const ex = spec();
  const seen = new Map<string, string>();
  for (let i = 1000; i < 1200; i++) {
    const v = variantOf(ex, studentSeed(ex.id, String(i)));
    const key = JSON.stringify(v.model.supports);
    if (!seen.has(key)) seen.set(key, String(i));
    if (seen.size === 2) break;
  }
  return [...seen.values()] as [string, string];
}

function rightAnswersFor(legajo: string): Submission {
  const ex = variantOf(spec(), studentSeed(spec().id, legajo));
  const res = solveModel(ex.model);
  if (typeof res === 'string') throw new Error(res);
  const ids = specNodeIds(ex.model);
  const answers = ex.supports.flatMap((s, i) => s.dofs.map((dof) => ({
    key: `r:${i}:${dof}`,
    label: `${s.label} — ${dof}`,
    answer: readDisplayedReaction(res, ids[s.nodeIndex]!, dof)!.toFixed(3),
    outcome: 'correct' as const,
  })));
  answers.push({ key: 'k', label: 'k', answer: ex.kinematicQuestion!.classification, outcome: 'correct' });
  return {
    stabileoSubmission: 1, exerciseId: ex.id, exerciseTitle: ex.title, student: '', submittedAt: '',
    answers, legajo, seed: ex.seed, variant: ex.variant,
  };
}

describe('a submission carries the variant it was made against', () => {
  it('round-trips legajo, seed and variant through the file and the code', () => {
    const sub = rightAnswersFor('104233');
    const file = fromSubmissionFile(toSubmissionFile(sub));
    const code = fromSubmissionCode(toSubmissionCode(sub));
    for (const r of [file, code]) {
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.submission.legajo).toBe('104233');
      expect(r.submission.seed).toBe(studentSeed(spec().id, '104233'));
      expect(r.submission.variant).toEqual(sub.variant);
      expect(r.submission.answers[0]!.key).toBe('r:0:Rx');
    }
  });

  it('drops a seed or a variant that is not one', () => {
    const r = fromSubmissionFile(JSON.stringify({ ...rightAnswersFor('1'), seed: -3, variant: { values: { L: 'x' }, supports: {} } }));
    expect(r.ok && r.submission.seed).toBe(undefined);
    expect(r.ok && r.submission.variant).toBe(undefined);
  });
});

describe('the teacher marks against the student\'s own variant', () => {
  it('right answers for legajo A are right for A and wrong for B', () => {
    const [a, b] = legajosWithDifferentSupports();
    const subA = rightAnswersFor(a);
    const mine = remarkSubmission(spec(), subA)!;
    expect(mine.answers.every((x) => x.outcome === 'correct')).toBe(true);
    expect(mine.changed).toBe(0);
    expect(mine.variant).toEqual(subA.variant);

    const asB = remarkSubmission(spec(), { ...subA, legajo: b, seed: undefined })!;
    expect(asB.variant).toEqual(variantOf(spec(), studentSeed(spec().id, b)).variant);
    expect(asB.changed).toBeGreaterThan(0);
  });

  it('the legajo wins over an edited seed, and says so', () => {
    const sub = { ...rightAnswersFor('2002'), seed: 1 };
    expect(submissionVariant(spec(), sub)).toEqual({ which: studentSeed(spec().id, '2002'), seedMismatch: true });
    const r = remarkSubmission(spec(), sub)!;
    expect(r.seedMismatch).toBe(true);
    expect(r.answers.every((x) => x.outcome === 'correct')).toBe(true);
  });

  it('gives the right value beside each answer', () => {
    const sub = rightAnswersFor('3003');
    const r = remarkSubmission(spec(), sub)!;
    for (const a of r.answers.filter((x) => x.key!.startsWith('r:'))) {
      expect(Number(a.expected)).toBeCloseTo(Number(a.answer), 2);
    }
  });

  it('an answer the old file carried without a key keeps its recorded verdict', () => {
    const sub = rightAnswersFor('4004');
    sub.answers = [{ label: 'old', answer: '1', outcome: 'incorrect' }];
    expect(remarkSubmission(spec(), sub)!.answers[0]).toMatchObject({ outcome: 'incorrect', recorded: 'incorrect' });
  });

  it('cannot rebuild a parametric variant from nothing', () => {
    const sub = { ...rightAnswersFor('5005'), legajo: undefined, seed: undefined, variant: undefined };
    expect(remarkSubmission(spec(), sub)).toBeNull();
  });

  it('marks reactions with their sign and magnitudes without', () => {
    expect(markNumber('-10', 10, true)).toBe('incorrect');
    expect(markNumber('-10', 10, false)).toBe('correct');
    expect(markNumber('10,2', 10, true)).toBe('correct');
    expect(markNumber('', 10, true)).toBe('pending');
  });
});
