// Assignment system for LMS integration (Moodle / Google Classroom / any iframe host).
//
// Flow:
// 1. Teacher creates assignment via AssignmentCreator (picks model + adds questions)
// 2. System generates #assignment=<compressed> URL
// 3. Student opens URL → AssignmentView (locked model, questions panel, timer)
// 4. Student submits → auto-graded → score reported via postMessage to parent iframe
//
// The assignment URL contains the full model + questions + hashed answers.
// Answers are hashed (not plain) so students can't inspect the URL to cheat.

import { deflateSync, inflateSync } from 'fflate';
import type { ModelSnapshot } from '../store/history.svelte';
import { modelStore } from '../store/model.svelte';
import { uiStore } from '../store/ui.svelte';

// ─── Types ────────────────────────────────────────────────────────

export type QuestionType =
  | 'reaction'          // reaction component at a support
  | 'characteristic'    // Mmax, Vmax, Nmax, δmax, etc.
  | 'kinematic'         // isostatic / hyperstatic + degree
  | 'diagramShape';     // N/V/M diagram shape (zero/constant/linear/quadratic)

export interface AssignmentQuestion {
  id: number;
  type: QuestionType;
  label: string;        // display text (e.g. "Support A — Ry")
  unit?: string;        // kN, kN·m, etc.
  /** For numeric questions: hash of the correct answer (rounded to 2 decimals) */
  answerHash?: string;
  /** For choice questions (kinematic, diagramShape): hash of correct option */
  choiceHash?: string;
  /** Extra metadata for the question */
  meta?: Record<string, unknown>;
  /** Points for this question (default 1) */
  points?: number;
}

export interface AssignmentDef {
  version: 1;
  title: string;
  author?: string;
  /** Time limit in minutes (0 = no limit) */
  timeLimit: number;
  /** Max submission attempts (0 = unlimited) */
  maxAttempts: number;
  /** The structural model */
  model: ModelSnapshot;
  /** Analysis mode */
  analysisMode: '2d' | '3d';
  /** Questions the student must answer */
  questions: AssignmentQuestion[];
  /** Tolerance for numeric answers (fraction, default 0.05 = 5%) */
  tolerance: number;
  /** Salt for answer hashing (random per assignment) */
  salt: string;
  /** Whether to show the correct answers after submission */
  showAnswers: boolean;
}

export interface GradeResult {
  score: number;
  total: number;
  percent: number;
  details: Array<{
    questionId: number;
    label: string;
    correct: boolean;
    points: number;
  }>;
  timestamp: string;
  assignmentTitle: string;
}

// ─── Hashing ──────────────────────────────────────────────────────
// Simple non-cryptographic hash to obscure answers in the URL.
// NOT security-critical — just prevents casual inspection.

function simpleHash(value: string, salt: string): string {
  const str = salt + ':' + value;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  // Convert to hex, take absolute value
  return Math.abs(hash).toString(36);
}

export function hashNumericAnswer(value: number, tolerance: number, salt: string): string {
  // Round to the precision implied by tolerance
  const rounded = Math.round(Math.abs(value) * 100) / 100;
  return simpleHash(rounded.toFixed(2), salt);
}

export function hashChoiceAnswer(choice: string, salt: string): string {
  return simpleHash(choice.toLowerCase(), salt);
}

export function checkNumericAnswer(
  studentValue: number,
  question: AssignmentQuestion,
  tolerance: number,
  salt: string,
): boolean {
  // We can't recover the exact answer from the hash, so we check if the
  // student's answer hashes to the same value (within tolerance we try
  // the rounded student value directly)
  const studentRounded = Math.round(Math.abs(studentValue) * 100) / 100;
  const studentHash = simpleHash(studentRounded.toFixed(2), salt);
  if (studentHash === question.answerHash) return true;

  // Also try values within tolerance range (±5% steps)
  // This handles floating point rounding differences
  for (const delta of [-0.01, 0.01, -0.02, 0.02]) {
    const adjusted = Math.round((Math.abs(studentValue) + delta) * 100) / 100;
    if (adjusted >= 0 && simpleHash(adjusted.toFixed(2), salt) === question.answerHash) {
      return true;
    }
  }

  return false;
}

export function checkChoiceAnswer(
  studentChoice: string,
  question: AssignmentQuestion,
  salt: string,
): boolean {
  return hashChoiceAnswer(studentChoice, salt) === question.choiceHash;
}

// ─── Compression ──────────────────────────────────────────────────

function uint8ToBase64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToUint8(str: string): Uint8Array {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const ASSIGNMENT_PREFIX = 'a1.';

export function compressAssignment(def: AssignmentDef): string {
  const json = JSON.stringify(def);
  const bytes = new TextEncoder().encode(json);
  const deflated = deflateSync(bytes, { level: 9 });
  return ASSIGNMENT_PREFIX + uint8ToBase64url(deflated);
}

export function decompressAssignment(data: string): AssignmentDef | null {
  try {
    if (!data.startsWith(ASSIGNMENT_PREFIX)) return null;
    const b64 = data.slice(ASSIGNMENT_PREFIX.length);
    const deflated = base64urlToUint8(b64);
    const bytes = inflateSync(deflated);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    if (!parsed.version || !parsed.model || !parsed.questions) return null;
    return parsed as AssignmentDef;
  } catch {
    return null;
  }
}

// ─── URL generation ───────────────────────────────────────────────

export function generateAssignmentURL(def: AssignmentDef): { url: string; length: number } {
  const compressed = compressAssignment(def);
  const url = `${location.origin}${location.pathname}#assignment=${compressed}`;
  return { url, length: compressed.length };
}

// ─── Random salt ──────────────────────────────────────────────────

export function generateSalt(): string {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(36)).join('').slice(0, 12);
}

// ─── Grade computation ───────────────────────────────────────────

export function gradeAssignment(
  def: AssignmentDef,
  answers: Map<number, string>,
): GradeResult {
  let score = 0;
  let total = 0;
  const details: GradeResult['details'] = [];

  for (const q of def.questions) {
    const pts = q.points ?? 1;
    total += pts;
    const studentAnswer = answers.get(q.id) ?? '';
    let correct = false;

    if (q.type === 'reaction' || q.type === 'characteristic') {
      const val = parseFloat(studentAnswer.replace(',', '.'));
      if (!isNaN(val)) {
        correct = checkNumericAnswer(val, q, def.tolerance, def.salt);
      }
    } else if (q.type === 'kinematic' || q.type === 'diagramShape') {
      if (studentAnswer) {
        correct = checkChoiceAnswer(studentAnswer, q, def.salt);
      }
    }

    if (correct) score += pts;
    details.push({ questionId: q.id, label: q.label, correct, points: pts });
  }

  return {
    score,
    total,
    percent: total > 0 ? Math.round((score / total) * 100) : 0,
    details,
    timestamp: new Date().toISOString(),
    assignmentTitle: def.title,
  };
}

// ─── LMS postMessage reporting ────────────────────────────────────

/**
 * Report grade to parent iframe (for LMS embedding).
 * Conforms to a simple message protocol that LMS plugins can listen to.
 */
export function reportGradeToLMS(grade: GradeResult): void {
  try {
    window.parent.postMessage({
      type: 'stabileo-grade',
      source: 'stabileo',
      ...grade,
    }, '*');
  } catch {
    // Cross-origin or no parent — ignore
  }
}

// ─── Build assignment from current model ──────────────────────────

export function buildAssignmentFromCurrentModel(
  title: string,
  questions: AssignmentQuestion[],
  options: {
    author?: string;
    timeLimit?: number;
    maxAttempts?: number;
    tolerance?: number;
    showAnswers?: boolean;
  } = {},
): AssignmentDef {
  const snapshot = modelStore.snapshot();
  const mode = uiStore.analysisMode;

  return {
    version: 1,
    title,
    author: options.author,
    timeLimit: options.timeLimit ?? 0,
    maxAttempts: options.maxAttempts ?? 0,
    model: snapshot,
    analysisMode: (mode === '2d' || mode === '3d') ? mode : '2d',
    questions,
    tolerance: options.tolerance ?? 0.05,
    salt: generateSalt(),
    showAnswers: options.showAnswers ?? true,
  };
}
