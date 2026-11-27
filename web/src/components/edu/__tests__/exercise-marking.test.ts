import { beforeAll, describe, expect, it } from 'vitest';
import { initSolver } from '../../../lib/engine/wasm-solver';
import { getExerciseSpecs } from '../exercise-data';
import { fromSubmissionCode, fromSubmissionFile, toSubmissionCode, toSubmissionFile, type Submission } from '../exercise-submission';
import { markNumber, remarkSubmission, submissionVariant } from '../exercise-marking';
import { solveModel, specNodeIds, studentSeed, variantOf } from '../exercise-variant';
import { toExercise } from '../exercises';
import { BAR_ENDS, END_DOFS, exerciseBars, freeBodyKey, freeBodyTruth } from '../free-body-step';
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
  const add = (key: string, answer: string) => answers.push({ key, label: key, answer, outcome: 'correct' });
  if (ex.kinematicQuestion?.classification === 'hyperstatic') add('kd', String(ex.kinematicQuestion.degree));
  const view = toExercise(ex);
  view.characteristics.forEach((q, i) => add('c:' + i, String(q.getCorrect(res.elementForces))));
  view.diagramQuestions.forEach((q, i) => add('d:' + i, String(q.getCorrect(res.elementForces))));
  view.diagramShapeQuestions?.forEach((q, i) => add('s:' + i, String(q.getCorrect(res.elementForces))));
  freeBodyTruth(ex.model, exerciseBars(ex), res.elementForces)!.forEach((truth, b) => {
    for (const end of BAR_ENDS) for (const dof of END_DOFS) add(freeBodyKey(b, end, dof), String(truth[end][dof]));
  });
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

  it('an answer that cannot be marked again earns nothing, whatever the file says, and keeps what it said', () => {
    const sub = rightAnswersFor('4004');
    sub.answers = [
      { label: 'old', answer: '1', outcome: 'correct' },
      { key: 'sk:0', label: 'sketch', answer: '', outcome: 'correct' },
      { key: 'c:0', label: 'revealed', answer: '', outcome: 'correct', revealed: true },
    ];
    const rows = remarkSubmission(spec(), sub)!.answers;
    expect(rows.filter(a => a.outcome !== 'pending').map(a => [a.key, a.outcome, a.recorded])).toEqual([
      ['c:0', 'incorrect', 'correct'],
    ]);
    expect(rows.filter(a => a.outcome === 'pending').every(a => a.recorded === 'pending')).toBe(true);
    expect(rows.some(a => !a.key || a.key === 'sk:0')).toBe(false);
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

it('known wrong result: #1927 — numeric answers consume the full token and retain the sign of small reactions', () => {
  for (const token of ['1/2', '1kN', '1 0', 'Infinity']) expect(markNumber(token, 1, true)).toBe('pending');
  for (const sign of [-1, 1]) {
    expect(markNumber(String(-sign * 0.09), sign * 0.005, true)).toBe('incorrect');
    expect(markNumber(String(sign * 0.005), sign * 0.005, true)).toBe('correct');
  }
  expect(markNumber(' 1,25e1 ', 12.5, true)).toBe('correct');
});

it('known wrong result: #1927 — re-marking rebuilds the assigned rows and their units', async () => {
  const { questionKeys } = await import('../exam-grading');
  const sub = rightAnswersFor('3003');
  const resolved = variantOf(spec(), studentSeed(spec().id, sub.legajo!));
  const row = { ...sub.answers[0]!, label: 'bogus', unit: 'bogus' };
  sub.answers = [row, row, { ...row, key: 'r:0:bogus' }];
  const marked = remarkSubmission(spec(), sub)!;
  expect(marked.answers.map(a => a.key)).toEqual(questionKeys(resolved));
  expect(marked.answers[0]).toMatchObject({ outcome: 'correct', unit: 'kN', label: resolved.supports[0]!.label + ' — Rx' });
  expect(marked.answers.slice(1).every(a => a.outcome === 'pending')).toBe(true);
});

it('known wrong result: #1927 — a fractional or suffixed degree cannot earn integer credit', () => {
  const base = spec();
  const sub = rightAnswersFor(legajosWithDifferentSupports().find(id => variantOf(base, studentSeed(base.id, id)).kinematicQuestion?.classification === 'hyperstatic')!);
  const deg = variantOf(base, sub.seed).kinematicQuestion!.degree!;
  for (const [token, expected] of [[String(deg), 'correct'], [deg + '.9', 'pending'], [deg + 'junk', 'pending']]) {
    sub.answers = [{ key: 'kd', label: 'degree', answer: token!, outcome: 'correct' }];
    expect(remarkSubmission(base, sub)!.answers.find(a => a.key === 'kd')?.outcome).toBe(expected);
  }
});

it.skip('known wrong result: #1927 — saved homework can be regraded only against its assigned revision', () => {
  const assigned = spec();
  const sub = rightAnswersFor('37');
  const exerciseRevision = toExercise(variantOf(assigned, sub.seed)).revision;
  const file = fromSubmissionFile(toSubmissionFile({ ...sub, exerciseRevision }));
  expect(file.ok && file.submission.exerciseRevision).toMatch(/^[0-9a-f]{64}$/);
  if (!file.ok) throw new Error(file.error);
  expect(remarkSubmission(assigned, file.submission)).not.toBeNull();
  const edited = { ...assigned, characteristics: [...assigned.characteristics, { label: 'extra', unit: 'kN', answer: { kind: 'literal' as const, value: 3 } }] };
  expect(remarkSubmission(edited, file.submission)).toBeNull();
});
