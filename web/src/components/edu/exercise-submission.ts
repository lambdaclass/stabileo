/**
 * exercise-submission.ts — what a student hands back.
 *
 * # Why this exists at all
 *
 * A teacher could send an exercise and a student could solve it, and there the
 * workflow stopped: the answers lived in one browser tab and nothing could
 * carry them anywhere. Everything a teacher does with a class — collect, look,
 * mark — happened outside the app, from a screenshot at best.
 *
 * # Why it is a file and a code, and not a server
 *
 * Stabileo is a static site. There is no account, no database and nothing that
 * could receive a POST, and adding one is a different project with a different
 * set of promises (who stores a minor's work, and for how long). So the
 * student's browser produces the artefact and the student hands it over the way
 * they already hand things in: a file for a campus upload, a short code for a
 * chat or an email body.
 *
 * # What a submission is NOT
 *
 * It is a RECORD, not a proof. Everything in it was produced on the student's
 * own machine and can be edited there, exactly like a photo of a notebook page
 * can be staged. The value is that the teacher sees each answer beside the
 * outcome the app gave it, for thirty students, without opening thirty tabs.
 * Nothing here should be read as authentication, and the review screen says so.
 */

import type { Variant } from './exercise-params';
import { SKETCH_POWERS, type Sketch } from './diagram-sketch';

/** One answered field, as the student left it. */
export interface SubmittedAnswer {
  /** Which question, so a teacher's app can mark it again: `r:<support>:<dof>`, `k`, `kd`, `s:<i>`, `d:<i>`, `sk:<i>`, `c:<i>`. */
  key?: string;
  /** What was asked — a support DOF, a characteristic, a diagram question. */
  label: string;
  /** Exactly what the student typed, before any parsing. */
  answer: string;
  unit?: string;
  /** The verdict the app gave when they pressed Verify. */
  outcome: 'correct' | 'incorrect' | 'pending';
  /** Whether they used "reveal" instead of solving it. Not a judgement — a
   *  teacher asked to mark this needs to know, and hiding it would make the
   *  record dishonest. */
  revealed?: boolean;
  /** The drawing behind an `sk:<i>` answer, so it can be marked again. */
  sketch?: Sketch;
}

export interface Submission {
  /** File marker, matching the exercise file's convention. */
  stabileoSubmission: 1;
  exerciseId: string;
  exerciseTitle: string;
  /** Whatever the student put in the name field; never required. */
  student: string;
  /** ISO instant, stamped by the browser that produced it. */
  submittedAt: string;
  answers: SubmittedAnswer[];
  legajo?: string;
  seed?: number;
  variant?: Variant;
}

export interface SubmissionScore {
  correct: number;
  answered: number;
  total: number;
  revealed: number;
}

/** The summary a teacher reads first: how much of it is right. */
export function scoreOf(sub: Submission): SubmissionScore {
  let correct = 0, answered = 0, revealed = 0;
  for (const a of sub.answers) {
    if (a.outcome === 'correct') correct++;
    if (a.outcome !== 'pending') answered++;
    if (a.revealed) revealed++;
  }
  return { correct, answered, total: sub.answers.length, revealed };
}

export type SubmissionParse =
  | { ok: true; submission: Submission }
  | { ok: false; error: string };

export function isSketch(v: unknown): v is Sketch {
  if (!v || typeof v !== 'object') return false;
  const { points, powers, vertices } = v as Sketch;
  return Array.isArray(points) && points.length >= 2
    && points.every((p) => p && Number.isFinite(p.t) && Number.isFinite(p.value))
    && Array.isArray(powers) && powers.length === points.length - 1
    && powers.every((p) => SKETCH_POWERS.includes(p))
    && (vertices === undefined || (Array.isArray(vertices) && vertices.every((x) => x === 'start' || x === 'end')));
}

function isVariant(v: unknown): v is Variant {
  if (!v || typeof v !== 'object') return false;
  const { values, supports } = v as Variant;
  return !!values && typeof values === 'object' && Object.values(values).every((x) => Number.isFinite(x))
    && !!supports && typeof supports === 'object' && Object.values(supports).every((x) => typeof x === 'string');
}

export function toSubmissionFile(sub: Submission): string {
  return JSON.stringify(sub, null, 2);
}

/**
 * Read a submission back, refusing anything that is not one.
 *
 * Validated on the way in rather than trusted: a teacher opening thirty files
 * from thirty students is exactly the situation where one truncated download,
 * or a file from a newer version of the app, must produce a sentence instead of
 * a blank screen.
 */
export function fromSubmissionFile(text: string): SubmissionParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'notJson' };
  }
  const o = raw as Partial<Submission>;
  if (!o || typeof o !== 'object' || o.stabileoSubmission !== 1) {
    return { ok: false, error: 'notSubmission' };
  }
  if (typeof o.exerciseId !== 'string' || typeof o.exerciseTitle !== 'string') {
    return { ok: false, error: 'incomplete' };
  }
  if (!Array.isArray(o.answers)) return { ok: false, error: 'incomplete' };

  const answers: SubmittedAnswer[] = [];
  for (const a of o.answers as SubmittedAnswer[]) {
    if (!a || typeof a.label !== 'string') return { ok: false, error: 'incomplete' };
    answers.push({
      ...(typeof a.key === 'string' ? { key: a.key } : {}),
      label: a.label,
      answer: typeof a.answer === 'string' ? a.answer : '',
      unit: typeof a.unit === 'string' ? a.unit : undefined,
      outcome: a.outcome === 'correct' || a.outcome === 'incorrect' ? a.outcome : 'pending',
      revealed: a.revealed === true,
      ...(isSketch(a.sketch) ? { sketch: a.sketch } : {}),
    });
  }
  return {
    ok: true,
    submission: {
      stabileoSubmission: 1,
      exerciseId: o.exerciseId,
      exerciseTitle: o.exerciseTitle,
      student: typeof o.student === 'string' ? o.student : '',
      submittedAt: typeof o.submittedAt === 'string' ? o.submittedAt : '',
      answers,
      ...(typeof o.legajo === 'string' && o.legajo ? { legajo: o.legajo } : {}),
      ...(Number.isInteger(o.seed) && o.seed! >= 0 ? { seed: o.seed } : {}),
      ...(isVariant(o.variant) ? { variant: o.variant } : {}),
    },
  };
}

/*
 * The code form.
 *
 * Same encoding as the exercise share link, for the same reason: a submission
 * has to survive being pasted into a chat window, an LMS comment box or the
 * body of an email, none of which are safe for raw JSON with newlines and
 * quotes in it. `encodeURIComponent` runs first because btoa only handles
 * latin-1 and a statement in Spanish will not survive it otherwise.
 */
export function toSubmissionCode(sub: Submission): string {
  return btoa(unescape(encodeURIComponent(toSubmissionFile(sub))));
}

export function fromSubmissionCode(code: string): SubmissionParse {
  const cleaned = code.trim().replace(/\s+/g, '');
  if (!cleaned) return { ok: false, error: 'emptyCode' };
  let json: string;
  try {
    json = decodeURIComponent(escape(atob(cleaned)));
  } catch {
    return { ok: false, error: 'damagedCode' };
  }
  return fromSubmissionFile(json);
}
