/**
 * Predefined exercises for Educational mode.
 * Each exercise defines a structure (nodes, elements, supports, loads)
 * that the solver resolves internally. The student must find the answers.
 */

import { t } from '../../lib/i18n';
import type { ElementForces } from '../../lib/engine/types';
import type { Variant } from './exercise-params';
import type { EduExerciseAPI } from './exercise-spec';

export type { EduExerciseAPI };

export interface DiagramQuestion {
  /** i18n key or plain text — the question prompt */
  question: string;
  /** Function that extracts the correct answer from element forces */
  getCorrect: (forces: ElementForces[]) => number;
  unit: string;
}

export type ExerciseCategory = 'statics' | 'strength' | 'advanced';

export type DiagramShape = 'zero' | 'constant' | 'linear' | 'quadratic' | 'cubic';

export interface KinematicQuestion {
  /** Correct classification */
  classification: 'isostatic' | 'hyperstatic';
  /** Degree of hyperstaticity (only for hyperstatic) */
  degree?: number;
}

export interface DiagramShapeQuestion {
  diagram: 'N' | 'V' | 'M';
  getCorrect: (forces: ElementForces[]) => DiagramShape | null;
}

/** A diagram the student draws instead of naming. */
export interface DiagramSketchQuestion {
  /**
   * Which one to draw. `D` is the deflected shape, and it belongs in this
   * list for the reason the chain V → M → D exists at all: each is the
   * integral of the one before, so each is one power higher. A triangular
   * load gives a quadratic shear, a cubic moment and a quartic deflection —
   * and a student who has seen that once stops guessing.
   */
  diagram: 'N' | 'V' | 'M' | 'D';
  /** Index into the built model's elements; the first member when absent. */
  elementIndex?: number;
}

export interface SectionDataItem {
  label: string;
  value: string;
}

export interface EduExercise {
  id: string;
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  category: ExerciseCategory;
  /** Which solver to use: 'linear' (default) or 'pdelta' */
  solverType?: 'linear' | 'pdelta';
  build: (api: EduExerciseAPI) => void;
  supports: Array<{
    label: string;
    nodeIndex: number;
    dofs: ('Rx' | 'Ry' | 'M')[];
  }>;
  characteristics: Array<{
    label: string;
    unit: string;
    /** Function that extracts the correct value from element forces */
    getCorrect: (forces: ElementForces[]) => number;
  }>;
  /** Questions about diagrams (Step 2) — the solver computes answers from results */
  diagramQuestions: DiagramQuestion[];
  /** Kinematic classification question (statics exercises) */
  kinematicQuestion?: KinematicQuestion;
  /** Diagram shape questions — student picks shape for N, V, M (statics exercises) */
  diagramShapeQuestions?: DiagramShapeQuestion[];
  /** Diagrams the student draws, ordinate by ordinate, with the power of each span */
  diagramSketchQuestions?: DiagramSketchQuestion[];
  /** Whether "show me the answer" is offered. Absent means yes. */
  allowReveal?: boolean;
  /** Section data to display as given info (strength/advanced exercises) */
  sectionData?: SectionDataItem[];
  variant?: Variant;
  seed?: number;
  legajo?: string;
}

export interface ExerciseSection {
  category: ExerciseCategory;
  title: string;
  exercises: EduExerciseSpec[];
}

import { getExerciseSpecs } from './exercise-data';
import { buildFromSpec, evaluateAnswer, type AnswerContext, type EduExerciseSpec, type ResolvedExerciseSpec } from './exercise-spec';
import { stressContext } from './exercise-stress';
import { shapeAnswer } from './exercise-variant';

/** The stress resolver meshes a section, so it is built once, and only cached once the engine could actually build it. */
export function toExercise(spec: ResolvedExerciseSpec, who: { legajo?: string } = {}): EduExercise {
  let ctx: AnswerContext | undefined;
  const stressCtx = (): AnswerContext => {
    if (ctx) return ctx;
    const built = stressContext(spec.model.profile, spec.model.fy);
    if (built.stress || !spec.model.profile) ctx = built;
    return built;
  };
  return {
    id: spec.id,
    title: spec.title,
    description: spec.description,
    difficulty: spec.difficulty,
    category: spec.category,
    solverType: spec.solverType,
    build: (api) => buildFromSpec(spec.model, api),
    supports: spec.supports,
    characteristics: spec.characteristics.map((c) => ({
      label: c.label,
      unit: c.unit,
      getCorrect: (forces) => evaluateAnswer(c.answer, forces, stressCtx()) ?? 0,
    })),
    diagramQuestions: spec.diagramQuestions.map((q) => ({
      question: q.question,
      unit: q.unit,
      getCorrect: (forces) => evaluateAnswer(q.answer, forces, stressCtx()) ?? 0,
    })),
    kinematicQuestion: spec.kinematicQuestion,
    diagramShapeQuestions: spec.diagramShapeQuestions?.map((q) => ({
      diagram: q.diagram,
      getCorrect: (forces) => shapeAnswer(q, forces),
    })),
    diagramSketchQuestions: spec.diagramSketchQuestions,
    allowReveal: spec.allowReveal,
    sectionData: spec.sectionData,
    variant: spec.variant,
    seed: spec.seed,
    legajo: who.legajo,
  };
}

const difficultyOrder: Record<string, number> = { easy: 0, medium: 1, hard: 2 };

function sortByDifficulty(exercises: EduExerciseSpec[]): EduExerciseSpec[] {
  return [...exercises].sort((a, b) => difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty]);
}

export function getExerciseSections(): ExerciseSection[] {
  const all = getExerciseSpecs();
  const of = (c: ExerciseCategory) => sortByDifficulty(all.filter((e) => e.category === c));
  return [
    { category: 'statics', title: t('edu.sectionStatics'), exercises: of('statics') },
    { category: 'strength', title: t('edu.sectionStrength'), exercises: of('strength') },
    { category: 'advanced', title: t('edu.sectionAdvanced'), exercises: of('advanced') },
  ];
}
