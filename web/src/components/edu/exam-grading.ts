import type { JsonObject } from '../../lib/api/assignments';
import { fromFile, toFile } from './exercise-capture';
import type { EduExerciseSpec, ResolvedExerciseSpec } from './exercise-spec';
import { fromSubmissionFile, type Submission, type SubmittedAnswer } from './exercise-submission';
import { remarkSubmission, type RemarkedAnswer } from './exercise-marking';
import { variantOf } from './exercise-variant';
import { exerciseBars, freeBodyKeys, freeBodyLabel, freeBodyUnit } from './free-body-step';
import { t } from '../../lib/i18n';

/** The exercise as an assignment stores it: the same envelope as an exercise file. */
export function exerciseEnvelope(spec: EduExerciseSpec): JsonObject {
  return JSON.parse(toFile(spec)) as JsonObject;
}

export function exerciseFromEnvelope(json: unknown): EduExerciseSpec | null {
  const r = fromFile(JSON.stringify(json ?? null));
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

/** Every question an exercise asks, by answer key, so a blank attempt still counts against all of them. */
export function questionKeys(ex: ResolvedExerciseSpec): string[] {
  const keys: string[] = [];
  ex.supports.forEach((s, i) => { for (const dof of s.dofs) keys.push(`r:${i}:${dof}`); });
  if (ex.kinematicQuestion) {
    keys.push('k');
    if (ex.kinematicQuestion.classification === 'hyperstatic') keys.push('kd');
  }
  keys.push(...freeBodyKeys(exerciseBars(ex)));
  (ex.diagramShapeQuestions ?? []).forEach((_, i) => keys.push(`s:${i}`));
  ex.diagramQuestions.forEach((_, i) => keys.push(`d:${i}`));
  (ex.diagramSketchQuestions ?? []).forEach((_, i) => keys.push(`sk:${i}`));
  ex.characteristics.forEach((_, i) => keys.push(`c:${i}`));
  return keys;
}

/** The label a question carries in the exercise view, for a question the student never reached. */
export function questionLabel(ex: ResolvedExerciseSpec, key: string): string {
  const [kind, i, dof] = key.split(':');
  const n = Number(i);
  switch (kind) {
    case 'r': return `${ex.supports[n]?.label ?? ''} — ${dof}`;
    case 'k': return t('edu.kinematicQuestion');
    case 'kd': return t('edu.hyperstaticDegree');
    case 's': return `${t('edu.shapeQuestion')} — ${ex.diagramShapeQuestions?.[n]?.diagram ?? ''}`;
    case 'd': return ex.diagramQuestions[n]?.question ?? key;
    case 'sk': return `${t('edu.sketch.span')} ${ex.diagramSketchQuestions?.[n]?.diagram ?? ''}`;
    case 'c': return ex.characteristics[n]?.label ?? key;
    case 'fb': return freeBodyLabel(exerciseBars(ex), key);
    default: return key;
  }
}

const unitOf = (ex: ResolvedExerciseSpec, key: string): string | undefined => {
  const [kind, i, dof] = key.split(':');
  if (kind === 'r') return dof === 'M' ? 'kN·m' : 'kN';
  if (kind === 'd') return ex.diagramQuestions[Number(i)]?.unit;
  if (kind === 'c') return ex.characteristics[Number(i)]?.unit;
  if (kind === 'fb') return freeBodyUnit(key.endsWith(':M') ? 'M' : 'Fx');
  return undefined;
};

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
  const keys = questionKeys(resolved);
  const base = storedSubmission(stored);
  const given = new Map((base?.answers ?? []).filter((a) => a.key).map((a) => [a.key!, a]));
  const full: SubmittedAnswer[] = keys.map((key) => given.get(key)
    ?? { key, label: questionLabel(resolved, key), answer: '', unit: unitOf(resolved, key), outcome: 'pending' });
  const submission: Submission = {
    ...examSubmission(spec, seed, full, base?.submittedAt ? new Date(base.submittedAt) : new Date(0)),
    student,
  };
  const remark = remarkSubmission(spec, submission);
  if (!remark) return null;
  const answers = remark.answers;
  const correct = answers.filter((a) => a.outcome === 'correct').length;
  const total = keys.length;
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
