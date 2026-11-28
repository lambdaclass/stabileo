import type { JsonObject } from '../../lib/api/assignments';
import { readExerciseEnvelope, toFile } from './exercise-capture';
import type { EduExerciseSpec, ResolvedExerciseSpec } from './exercise-spec';
import { fromSubmissionFile, type Submission, type SubmittedAnswer } from './exercise-submission';
import { remarkSubmission, type RemarkedAnswer } from './exercise-marking';
import { variantOf } from './exercise-variant';
export { questionKeys, questionLabel } from './exercise-questions';

/** The exercise as an assignment stores it: the same envelope as an exercise file. */
export function exerciseEnvelope(spec: EduExerciseSpec): JsonObject {
  return JSON.parse(toFile(spec)) as JsonObject;
}

export function exerciseFromEnvelope(json: unknown): EduExerciseSpec | null {
  const r = readExerciseEnvelope(JSON.stringify(json ?? null));
  return r.ok ? r.exercise : null;
}

/** What an attempt stores as its answers: a submission, against the server's seed. */
export function examSubmission(spec: Pick<EduExerciseSpec, 'id' | 'title'>, seed: number, answers: SubmittedAnswer[], at = new Date()): Submission {
  return { stabileoSubmission: 1, exerciseId: spec.id, exerciseTitle: spec.title, student: '', submittedAt: at.toISOString(), answers, seed };
}

/** Null for an attempt that saved nothing yet (`{}`), or for anything that is not a submission. */
export function storedSubmission(json: unknown): Submission | null {
  if (!json || typeof json !== 'object' || Object.keys(json).length === 0) return null;
  const r = fromSubmissionFile(JSON.stringify(json));
  return r.ok ? r.submission : null;
}

export interface Grade {
  correct: number;
  total: number;
  fraction: number;
  answers: RemarkedAnswer[];
  submission: Submission;
  resolved: ResolvedExerciseSpec;
}

/**
 * Rebuilds the student's variant from the server's seed and marks the stored answers again.
 * The seed in the answers is ignored: the attempt row's is the one the server chose.
 */
export function gradeAttempt(spec: EduExerciseSpec, seed: number, stored: unknown, student = ''): Grade | null {
  let resolved: ResolvedExerciseSpec;
  try { resolved = variantOf(spec, seed); } catch { return null; }
  const base = storedSubmission(stored);
  if (!base && (!stored || typeof stored !== 'object' || Array.isArray(stored) || Object.keys(stored).length !== 0)) return null;
  if (base && base.exerciseId !== spec.id) return null;
  const at = new Date(base?.submittedAt || 0);
  if (!Number.isFinite(at.getTime())) return null;
  const submission: Submission = {
    ...examSubmission(spec, seed, base?.answers ?? [], at),
    student,
  };
  const remark = remarkSubmission(spec, submission);
  if (!remark) return null;
  const answers = remark.answers;
  const correct = answers.filter((a) => a.outcome === 'correct').length;
  const total = answers.length;
  return { correct, total, fraction: total ? correct / total : 0, answers, submission: { ...submission, answers }, resolved };
}

export interface GradeRow {
  name: string;
  email: string;
  startedAt: string;
  submittedAt: string | null;
  status: string;
  correct: number | null;
  total: number | null;
}

function csvField(v: string | number | null): string {
  let s = v === null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per attempt; the header is the caller's, already in the reader's language. */
export function gradesCsv(header: string[], rows: GradeRow[]): string {
  const lines = [header.map(csvField).join(',')];
  for (const r of rows) {
    const pct = r.correct !== null && r.total ? Math.round((r.correct / r.total) * 1000) / 10 : null;
    lines.push([r.name, r.email, r.startedAt, r.submittedAt, r.status, r.correct, r.total, pct].map(csvField).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
