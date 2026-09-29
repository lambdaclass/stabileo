/**
 * An explained step-by-step solution, as data: what every method in the
 * "Explained step by step" catalog produces, and the one viewer
 * (components/steps/StepDocView) draws.
 *
 * A method builds a StepDoc from the model; it never builds HTML. Words are
 * i18n keys with parameters (the viewer translates them), mathematics is
 * KaTeX, figures are data for the one sketch renderer. So every method reads
 * the same way: an introduction saying what is assumed and why, then
 * numbered steps, each a sequence of blocks, a calculation always written as
 * formula, substitution, boxed result and, where there is one, a check; and
 * at the end a comparison with the matrix stiffness solve of the same model.
 */
import type { Sketch } from './sketch';

/** Words: an i18n key and its parameters (numbers are formatted by the viewer). */
export interface Txt { key: string; params?: Record<string, string | number> }
/** KaTeX source. */
export type Tex = string;

/** A table cell: plain text, words, or mathematics. */
export type Cell = string | number | Txt | { tex: Tex };

export type Block =
  /** A paragraph. `detail` paragraphs explain the why; the viewer can hide them. */
  | { kind: 'p'; text: Txt; detail?: boolean }
  /** A displayed equation, optionally with a sentence under it. */
  | { kind: 'eq'; tex: Tex; note?: Txt }
  /** A calculation: the formula, the numbers put in, the result (boxed), and a check. */
  | { kind: 'calc'; label?: Txt; formula: Tex; subst?: Tex; result: Tex; check?: Tex }
  /** A table. */
  | { kind: 'table'; head: Cell[]; rows: Cell[][]; caption?: Txt }
  /** A matrix or vector with optional row/column labels (DOF numbers, member names). */
  | { kind: 'matrix'; name: Tex; rows: number[][]; rowLabels?: string[]; colLabels?: string[]; scale?: number; caption?: Txt }
  /** A figure. */
  | { kind: 'fig'; sketch: Sketch; caption?: Txt }
  /** A highlighted note. */
  | { kind: 'note'; tone: 'info' | 'warn' | 'ok'; text: Txt }
  /** A titled group of blocks inside a step ("Span A–C", "Joint B"). */
  | { kind: 'sub'; title: Txt | string; blocks: Block[] }
  /** This method against the matrix stiffness solve of the same model. */
  | { kind: 'compare'; rows: CompareRow[]; caption?: Txt };

export interface CompareRow {
  /** What is compared: "M_AC", "A_y", "N_3". */
  label: Tex;
  method: number;
  matrix: number;
  unit: string;
}

export interface Step { title: Txt; blocks: Block[] }

export interface StepDoc {
  /** The catalog id of the method (registry.ts). */
  method: string;
  title: Txt;
  /** What was solved: "Continuous beam", "Plane truss". */
  subtitle?: Txt;
  /** Before step 1: the model, the assumptions, the units. */
  intro: Block[];
  steps: Step[];
}

/** Why a method cannot run on the model, in words. */
export interface NotApplicable { ok: false; reason: Txt }
export type Applicability = { ok: true } | NotApplicable;

export const tx = (key: string, params?: Record<string, string | number>): Txt => (params ? { key, params } : { key });
export const isTxt = (v: unknown): v is Txt => typeof v === 'object' && v !== null && 'key' in v && typeof (v as Txt).key === 'string';
