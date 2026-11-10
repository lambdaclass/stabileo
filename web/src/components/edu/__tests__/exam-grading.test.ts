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
