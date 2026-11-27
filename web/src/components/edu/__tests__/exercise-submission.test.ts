/**
 * What a student hands back has to survive the trip.
 *
 * A submission leaves the browser as a downloaded file or as a code pasted
 * into a chat window, and is read by a teacher who has thirty of them. The
 * failure that matters is not a crash: it is a truncated download or a code
 * that lost its tail on a line wrap being read as a valid, empty submission —
 * a student marked zero for a transport problem. Every reader here refuses
 * rather than guesses.
 */
import { describe, it, expect } from 'vitest';
import {
  toSubmissionFile, fromSubmissionFile,
  toSubmissionCode, fromSubmissionCode,
  scoreOf, type Submission,
} from '../exercise-submission';

const SUB: Submission = {
  stabileoSubmission: 1,
  exerciseId: 'viga-1',
  exerciseTitle: 'Viga simplemente apoyada — carga distribuida',
  student: 'Ana Pérez',
  submittedAt: '2026-08-11T00:00:00.000Z',
  answers: [
    { label: 'Apoyo A — Ry', answer: '20', unit: 'kN', outcome: 'correct' },
    { label: 'Apoyo B — Ry', answer: '18', unit: 'kN', outcome: 'incorrect' },
    { label: 'M máximo', answer: '', unit: 'kN·m', outcome: 'pending' },
    { label: 'V en el apoyo', answer: '20', unit: 'kN', outcome: 'correct', revealed: true },
  ],
};

describe('a submission survives the file', () => {
  it('round-trips every field, accents included', () => {
    const r = fromSubmissionFile(toSubmissionFile(SUB));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // `revealed` comes back explicit: the reader normalises it so a teacher's
    // table never has to distinguish "false" from "the field was not written".
    expect(r.submission).toEqual({
      ...SUB,
      answers: SUB.answers.map(a => ({ ...a, revealed: a.revealed === true })),
    });
  });

  it('refuses something that is not a submission', () => {
    for (const [text, error] of [
      ['not json at all', 'notJson'],
      ['{"hello":1}', 'notSubmission'],
      ['{"stabileoSubmission":1}', 'incomplete'],
      ['{"stabileoSubmission":1,"exerciseId":"a","exerciseTitle":"b"}', 'incomplete'],
    ] as const) {
      const r = fromSubmissionFile(text);
      expect(r.ok, text).toBe(false);
      if (!r.ok) expect(r.error).toBe(error);
    }
  });

  it('normalises an unknown outcome to "not checked" rather than trusting it', () => {
    const forged = JSON.stringify({
      ...SUB,
      answers: [{ label: 'x', answer: '1', outcome: 'brilliant' }],
    });
    const r = fromSubmissionFile(forged);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.submission.answers[0].outcome).toBe('pending');
  });
});

describe('a submission survives the code', () => {
  it('round-trips through the pasteable form', () => {
    const r = fromSubmissionCode(toSubmissionCode(SUB));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.submission.student).toBe('Ana Pérez');
    expect(r.submission.answers).toHaveLength(4);
  });

  it('tolerates the whitespace a chat window adds', () => {
    const code = toSubmissionCode(SUB);
    const wrapped = code.replace(/(.{40})/g, '$1\n  ');
    const r = fromSubmissionCode(wrapped);
    expect(r.ok).toBe(true);
  });

  it('refuses an empty or truncated code instead of reading an empty submission', () => {
    expect(fromSubmissionCode('   ')).toEqual({ ok: false, error: 'emptyCode' });
    const cut = toSubmissionCode(SUB).slice(0, 60);
    const r = fromSubmissionCode(cut);
    expect(r.ok).toBe(false);
  });
});

describe('the score a teacher reads first', () => {
  it('counts right, answered and revealed separately', () => {
    expect(scoreOf(SUB)).toEqual({ correct: 2, answered: 3, total: 4, revealed: 1 });
  });

  it('an untouched exercise scores zero out of its questions, not zero out of zero', () => {
    const blank: Submission = { ...SUB, answers: SUB.answers.map(a => ({ ...a, answer: '', outcome: 'pending', revealed: false })) };
    expect(scoreOf(blank)).toEqual({ correct: 0, answered: 0, total: 4, revealed: 0 });
  });
});

it.each(['sketch', 'variant'])('known wrong result: #1927 — review rejects damaged %s in files and codes', field => {
  const sub = field === 'variant' ? { ...SUB, variant: { supports: {}, values: [] } }
    : { ...SUB, answers: [{ ...SUB.answers[0], sketch: {} }] };
  expect.soft(fromSubmissionFile(JSON.stringify(sub)).ok).toBe(false);
  expect(fromSubmissionCode(toSubmissionCode(sub as Submission)).ok).toBe(false);
});
