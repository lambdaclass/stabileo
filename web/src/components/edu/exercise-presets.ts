/**
 * exercise-presets.ts — the questions a teacher actually asks, ready to add.
 *
 * # Why presets
 *
 * The first authoring panel made every question a form: pick a force, pick a
 * scope, pick a member, type a label, type a unit. That is five decisions to
 * ask "what is the maximum moment", which is the single most common question in
 * the subject. The form still exists for anything unusual, but the common cases
 * are one click, with their label and unit already right.
 *
 * # Steels
 *
 * `fy` was defaulting to 235, which is the European F-24 the CIRSOC profile
 * tables are computed for — technically consistent and, in an Argentine
 * classroom, not what anyone reaches for first. The named grades below make the
 * choice explicit instead of leaving a bare number that looks arbitrary.
 */

import type { AnswerSpec, ForceKind, StressMeasure } from './exercise-spec';

// ─── Steel grades ──────────────────────────────────────────────────

export interface SteelGrade {
  id: string;
  /** Shown as-is: these are proper names, not translated. */
  label: string;
  fy: number;
  /** Which i18n key explains where it is used. */
  noteKey: string;
}

/**
 * `ADN 420` leads because it is what a course reaches for by default. The
 * structural grades follow, and `F-24` is named explicitly because it is the
 * steel the shipped profile tables are tabulated for.
 */
export const STEEL_GRADES: SteelGrade[] = [
  { id: 'adn420', label: 'ADN 420', fy: 420, noteKey: 'edu.author.gradeAdn420' },
  { id: 'f24', label: 'F-24', fy: 235, noteKey: 'edu.author.gradeF24' },
  { id: 'f36', label: 'F-36', fy: 355, noteKey: 'edu.author.gradeF36' },
  { id: 'a36', label: 'ASTM A36', fy: 250, noteKey: 'edu.author.gradeA36' },
  { id: 'custom', label: '—', fy: 0, noteKey: 'edu.author.gradeCustom' },
];

export const DEFAULT_GRADE = STEEL_GRADES[0];

// ─── Question presets ──────────────────────────────────────────────

export interface QuestionPreset {
  id: string;
  /** Displayed label for the question itself — a symbol, not a sentence. */
  label: string;
  unit: string;
  answer: AnswerSpec;
  /** Whether the preset needs a section profile to be answerable. */
  needsProfile?: boolean;
}

const force = (id: string, label: string, unit: string, f: ForceKind): QuestionPreset => ({
  id, label, unit, answer: { kind: 'maxAbs', force: f },
});

const stress = (id: string, label: string, m: StressMeasure): QuestionPreset => ({
  id, label, unit: 'MPa', needsProfile: true,
  // Station 0 is the member start, which is where a cantilever's fixed end and
  // a beam's support both sit — the place these are asked about.
  answer: { kind: 'stress', measure: m, element: 0, t: 0 },
});

/** The characteristic values a statics or strength course asks for. */
export const CHARACTERISTIC_PRESETS: QuestionPreset[] = [
  force('mmax', 'Mmax', 'kN·m', 'moment'),
  force('vmax', 'Vmax', 'kN', 'shear'),
  force('nmax', 'Nmax', 'kN', 'axial'),
  stress('sigma', 'σmax', 'sigmaMax'),
  stress('tau', 'τmax', 'tauMax'),
  stress('vm', 'von Mises', 'vonMises'),
];

/** Where along a member a diagram question can be asked. */
export const STATIONS: Array<{ t: number; key: string }> = [
  { t: 0, key: 'edu.author.atStart' },
  { t: 0.25, key: 'edu.author.atQuarter' },
  { t: 0.5, key: 'edu.author.atMid' },
  { t: 0.75, key: 'edu.author.atThreeQuarter' },
  { t: 1, key: 'edu.author.atEnd' },
];

/** Diagram shapes, with the expression that produces each one. */
export const SHAPE_HINTS: Record<string, string> = {
  zero: 'edu.author.shapeZeroHint',
  constant: 'edu.author.shapeConstantHint',
  linear: 'edu.author.shapeLinearHint',
  quadratic: 'edu.author.shapeQuadraticHint',
};

/**
 * Suggested shapes for a diagram, given what loads the structure carries.
 *
 * Not a rule, a starting point: a member with no distributed load cannot have a
 * parabolic moment, and offering that as the default answer would be inviting a
 * mistake. The teacher can always override.
 */
export function suggestShapes(
  load: 'none' | 'uniform' | 'varying',
): Array<{ diagram: 'N' | 'V' | 'M'; correct: string }> {
  /*
   * Each diagram is the integral of the one before it, so the load sets the
   * whole chain: a point load gives constant shear and a linear moment, a
   * uniform load pushes both up one, and a triangular load pushes them up
   * again — quadratic shear, CUBIC moment. That last case had no suggestion
   * because the format had no cubic to suggest.
   */
  if (load === 'varying') {
    return [{ diagram: 'V', correct: 'quadratic' }, { diagram: 'M', correct: 'cubic' }];
  }
  if (load === 'uniform') {
    return [{ diagram: 'V', correct: 'linear' }, { diagram: 'M', correct: 'quadratic' }];
  }
  return [{ diagram: 'V', correct: 'constant' }, { diagram: 'M', correct: 'linear' }];
}

export const SUPPORT_TYPE_KEYS: Record<string, string> = {
  fixed: 'edu.support.fixed',
  pinned: 'edu.support.pinned',
  rollerX: 'edu.support.rollerX',
  rollerY: 'edu.support.rollerY',
  rollerZ: 'edu.support.rollerY',
  spring: 'edu.support.spring',
};

/** The types a teacher may offer for one support; springs need stiffnesses a variant cannot invent. */
export const SUPPORT_CHOICE_TYPES = ['fixed', 'pinned', 'rollerX', 'rollerY'] as const;
