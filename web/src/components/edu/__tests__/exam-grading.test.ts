import { tp } from '../../../lib/i18n';
import { beforeAll, describe, expect, it } from 'vitest';
import { initSolver } from '../../../lib/engine/wasm-solver';
import { getExerciseSpecs } from '../exercise-data';
import { solveModel, specModelData, specNodeIds, variantOf } from '../exercise-variant';
import { readDisplayedReaction } from '../edu-reactions';
import { examSubmission, exerciseEnvelope, exerciseFromEnvelope, gradeAttempt, gradesCsv, questionKeys, storedSubmission } from '../exam-grading';
import { explainAnswer } from '../exam-explain';
import { sketchTruth } from '../sketch-truth';
import type { SubmittedAnswer } from '../exercise-submission';
import type { EduExerciseSpec } from '../exercise-spec';

beforeAll(async () => {
  await initSolver();
});

const spec = () => getExerciseSpecs().find((s) => s.id === 'frame-varying-supports')!;

function rightReactions(s: EduExerciseSpec, seed: number): SubmittedAnswer[] {
  const ex = variantOf(s, seed);
  const res = solveModel(ex.model);
  if (typeof res === 'string') throw new Error(res);
  const ids = specNodeIds(ex.model);
  return ex.supports.flatMap((sup, i) => sup.dofs.map((dof) => ({
    key: `r:${i}:${dof}`, label: `${sup.label} — ${dof}`, outcome: 'pending' as const,
    answer: readDisplayedReaction(res, ids[sup.nodeIndex]!, dof)!.toFixed(3),
  })));
}

function seedsWithDifferentSupports(): [number, number] {
  const seen = new Map<string, number>();
  for (let seed = 1; seed < 400 && seen.size < 2; seed += 7) {
    const key = JSON.stringify(variantOf(spec(), seed).model.supports);
    if (!seen.has(key)) seen.set(key, seed);
  }
  return [...seen.values()] as [number, number];
}

describe('the exercise an assignment stores', () => {
  it('known wrong result: #1927 — the question envelope cannot regenerate a grading key or produce a mark', () => {
    const questions = exerciseFromEnvelope({
      stabileoExercise: 1, questionsOnly: true,
      exercise: { ...spec(), kinematicQuestion: {}, diagramShapeQuestions: [{ diagram: 'M' }], characteristics: [], diagramQuestions: [] },
    })!;
    expect(variantOf(questions, 42).kinematicQuestion).toEqual({});
    expect(variantOf(questions, 42).diagramShapeQuestions).toEqual([{ diagram: 'M' }]);
    expect(gradeAttempt(questions, 42, {})).toBeNull();
  });
  it('round-trips through the envelope, and anything else reads as none', () => {
    expect(exerciseFromEnvelope(exerciseEnvelope(spec()))).toEqual(spec());
    expect(exerciseFromEnvelope({ title: 'x' })).toBeNull();
    expect(exerciseFromEnvelope(null)).toBeNull();
  });

  it('an attempt that saved nothing has no submission yet', () => {
    expect(storedSubmission({})).toBeNull();
    const sub = examSubmission(spec(), 7, []);
    expect(storedSubmission(sub)?.seed).toBe(7);
  });
});

describe("the teacher's browser grades again from the seed and the stored answers", () => {
  it('right answers for the seed score full on the reactions, and the same answers fail a different variant', () => {
    const [a, b] = seedsWithDifferentSupports();
    const answers = rightReactions(spec(), a);
    const ownGrade = gradeAttempt(spec(), a, examSubmission(spec(), a, answers), 'Ada')!;
    expect(ownGrade.resolved.seed).toBe(a);
    expect(ownGrade.total).toBe(questionKeys(variantOf(spec(), a)).length);
    expect(ownGrade.correct).toBe(answers.length);
    expect(ownGrade.submission.student).toBe('Ada');
    const other = gradeAttempt(spec(), b, examSubmission(spec(), b, answers))!;
    expect(other.correct).toBeLessThan(answers.length);
  });

  it("ignores a seed edited into the answers: the attempt row's seed is the one marked", () => {
    const [a, b] = seedsWithDifferentSupports();
    const answers = rightReactions(spec(), a);
    const tampered = { ...examSubmission(spec(), a, answers), seed: b };
    expect(gradeAttempt(spec(), a, tampered)!.correct).toBe(answers.length);
  });

  it('a blank attempt counts every question as not answered', () => {
    const g = gradeAttempt(spec(), 11, {})!;
    expect(g.correct).toBe(0);
    expect(g.total).toBeGreaterThan(0);
    expect(g.fraction).toBe(0);
  });

  it('marks a drawn diagram again from the drawing it carries', () => {
    const base = getExerciseSpecs().find((s) => (s.diagramSketchQuestions ?? []).length > 0);
    expect(base, 'a built-in exercise that asks for a drawing').toBeDefined();
    if (!base) return;
    const ex = variantOf(base, 0);
    const res = solveModel(ex.model);
    if (typeof res === 'string') throw new Error(res);
    const truth = sketchTruth(ex.diagramSketchQuestions![0]!, res, specModelData(ex.model))!;
    const flat = { points: [{ t: 0, value: 0 }, { t: 1, value: 0 }], powers: ['constant' as const] };
    const drawn = { key: 'sk:0', label: 'sk', answer: '', outcome: 'pending' as const, sketch: flat };
    const g = gradeAttempt(base, 0, examSubmission(base, 0, [drawn]))!;
    const row = g.answers.find((x) => x.key === 'sk:0')!;
    expect(row.outcome).toBe(truth.every((v) => Math.abs(v) < 1e-9) ? 'correct' : 'incorrect');
  });

  it('explains how each answer comes out, in words', () => {
    const ex = variantOf(spec(), 5);
    for (const key of questionKeys(ex)) expect(explainAnswer(ex, key).length, key).toBeGreaterThan(10);
    expect(explainAnswer(ex, 'r:0:Rx')).toBe(tp('exam.explain.reaction', { support: ex.supports[0].label, dof: 'Rx' }));
    expect(explainAnswer(ex, 'k')).toBe(tp('exam.explain.kinematic', { degree: ex.kinematicQuestion?.degree ?? 0 }));
    expect(explainAnswer(ex, 'unknown')).toBe('');
  });
});

describe('grades as CSV', () => {
  it('writes one row per attempt with the percentage, quoting what needs it and defusing formulas', () => {
    const csv = gradesCsv(['Name', 'Email', 'Started', 'Submitted', 'Status', 'Correct', 'Total', '%'], [
      { name: 'Pérez, Ada', email: 'ada@example.com', startedAt: '2026-11-12T13:00:00Z', submittedAt: '2026-11-12T13:40:00Z', status: 'Submitted', correct: 3, total: 4 },
      { name: '=HYPERLINK("x")', email: 'bob@example.com', startedAt: '2026-11-12T13:01:00Z', submittedAt: null, status: 'Open', correct: null, total: null },
    ]);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('Name,Email,Started,Submitted,Status,Correct,Total,%');
    expect(lines[1]).toBe('"Pérez, Ada",ada@example.com,2026-11-12T13:00:00Z,2026-11-12T13:40:00Z,Submitted,3,4,75');
    expect(lines[2]).toBe(`"'=HYPERLINK(""x"")",bob@example.com,2026-11-12T13:01:00Z,,Open,,,`);
  });
});

it.each([null, [], { typo: true }, { ...examSubmission(spec(), 1, []), submittedAt: 'yesterday' }])('known wrong result: #1927 — malformed saved work has no grade', stored => {
  expect(gradeAttempt(spec(), 1, stored)).toBeNull();
});

it('known wrong result: #1927 — displayed expected reactions round-trip through the grader', () => {
  const input = { ...spec(), params: undefined, model: { nodes: [[0, 0], [1, 0]], elements: [[0, 1]], supports: [{ node: 0, type: 'fixed' }], nodalLoads: [{ node: 1, fy: -0.012 }] }, supports: [{ label: 'A', nodeIndex: 0, dofs: ['Ry'] }] } as EduExerciseSpec;
  const row = gradeAttempt(input, 1, {})!.answers.find(a => a.key === 'r:0:Ry')!;
  const again = gradeAttempt(input, 1, examSubmission(input, 1, [{ ...row, answer: row.expected! }]))!;
  expect(again.answers.find(a => a.key === row.key)?.outcome).toBe('correct');
});

it('known wrong result: #1927 — Basic rejects a saved P-delta handoff before opening a model', async () => {
  const { takeStepsHandoff } = await import('../exam-steps-handoff');
  const model = variantOf(spec(), 1).model;
  const storage = new Map<string, string>();
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    removeItem: (key: string) => storage.delete(key),
  } });
  try {
    for (const solverType of ['linear', 'pdelta']) {
      for (const version of [1, 2]) storage.set('stabileo.exam.steps.v' + version, JSON.stringify({ title: 'beam', model, solverType }));
      const handoff = takeStepsHandoff();
      if (solverType === 'linear') expect(handoff?.model).toEqual(model);
      else expect(handoff).toBeNull();
    }
  } finally {
    if (prev) Object.defineProperty(globalThis, 'sessionStorage', prev);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});

it('known wrong result: #1927 — a teacher reads localized categorical answers in a submitted file', async () => {
  const { render } = await import('svelte/server');
  const { default: Review } = await import('../SubmissionReview.svelte');
  const input = spec();
  const submission = examSubmission(input, 2, [
    { key: 'k', label: 'Class', answer: 'isostatic', outcome: 'pending' },
    { key: 's:0', label: 'Shape', answer: 'quadratic', outcome: 'pending' },
  ]);
  const html = render(Review, { props: { submission, onclose() {} } }).body;
  expect(html).toContain(tp('edu.isostatic', {}));
  expect(html).toContain(tp('edu.shape.quadratic', {}));
  expect(html).not.toMatch(/>isostatic<|>quadratic</);
});

it('known wrong result: #1927 — every numbered step localizes its position as an argument', () => {
  for (const key of ['edu.step1Title', 'edu.step2Title', 'edu.step3Title', 'edu.fb.title']) {
    expect(tp(key, { n: 17 })).toContain('17');
  }
});

it('known wrong result: #1927 — review grades keyed work alongside unattributed legacy rows', () => {
  const base = spec();
  const rows = rightReactions(base, 5);
  const extra = { label: 'Legacy row', answer: 'legacy entry', outcome: 'correct' as const };
  const work = examSubmission(base, 5, [...rows, extra]);
  const grade = gradeAttempt(base, 5, work);
  expect(grade?.correct).toBe(rows.length);
  expect(grade?.total).toBe(questionKeys(variantOf(base, 5)).length);
});

it('known wrong result: #1927 — review independently marks a legacy file with a known exercise', async () => {
  const { render } = await import('svelte/server');
  const { default: Review } = await import('../SubmissionReview.svelte');
  const base = spec();
  const submission = examSubmission(base, 5, [{ label: 'Legacy row', answer: 'legacy entry', outcome: 'correct' }]);
  const html = render(Review, { props: { submission, spec: base, onclose() {} } }).body;
  expect.soft(html).toContain('review-remarked');
  expect.soft(html).not.toContain(tp('edu.review.remarkFailed', {}));
  expect(html).toContain('legacy entry');
});
