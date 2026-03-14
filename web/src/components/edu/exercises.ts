/**
 * Predefined exercises for Educational mode.
 * Each exercise defines a structure (nodes, elements, supports, loads)
 * that the solver resolves internally. The student must find the answers.
 */

import type { SupportType } from '../../lib/store/ui.svelte';
import { t } from '../../lib/i18n';
import type { ElementForces } from '../../lib/engine/types';

export interface EduExerciseAPI {
  addNode: (x: number, y: number) => number;
  addElement: (nI: number, nJ: number) => number;
  addSupport: (nodeId: number, type: SupportType) => void;
  addNodalLoad: (nodeId: number, fx: number, fy: number, mz?: number) => void;
  addDistributedLoad: (elementId: number, qI: number, qJ?: number) => void;
}

export interface DiagramQuestion {
  /** i18n key or plain text — the question prompt */
  question: string;
  /** Function that extracts the correct answer from element forces */
  getCorrect: (forces: ElementForces[]) => number;
  unit: string;
}

export type ExerciseCategory = 'statics' | 'strength' | 'advanced';

export type DiagramShape = 'zero' | 'constant' | 'linear' | 'quadratic';

export interface KinematicQuestion {
  /** Correct classification */
  classification: 'isostatic' | 'hyperstatic';
  /** Degree of hyperstaticity (only for hyperstatic) */
  degree?: number;
}

export interface DiagramShapeQuestion {
  /** Which internal force diagram */
  diagram: 'N' | 'V' | 'M';
  /** Correct shape */
  correct: DiagramShape;
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
  /** Section data to display as given info (strength/advanced exercises) */
  sectionData?: SectionDataItem[];
}

export interface ExerciseSection {
  category: ExerciseCategory;
  title: string;
  exercises: EduExercise[];
}

// ─── Helper extractors ───────────────────────────────────────────

function maxAbsMoment(forces: ElementForces[]): number {
  let m = 0;
  for (const ef of forces) m = Math.max(m, Math.abs(ef.mStart), Math.abs(ef.mEnd));
  return m;
}

function maxAbsShear(forces: ElementForces[]): number {
  let v = 0;
  for (const ef of forces) v = Math.max(v, Math.abs(ef.vStart), Math.abs(ef.vEnd));
  return v;
}

function maxAbsAxial(forces: ElementForces[]): number {
  let n = 0;
  for (const ef of forces) n = Math.max(n, Math.abs(ef.nStart), Math.abs(ef.nEnd));
  return n;
}

/** Max moment in a subset of elements (by 0-based indices) */
function maxMomentIn(indices: number[]) {
  return (forces: ElementForces[]): number => {
    let m = 0;
    for (const i of indices) {
      if (i < forces.length) {
        m = Math.max(m, Math.abs(forces[i].mStart), Math.abs(forces[i].mEnd));
      }
    }
    return m;
  };
}

// ─── Exercise definitions ────────────────────────────────────────

export function getExercises(): EduExercise[] {
  return [
  // ── 1. Simply supported beam — Distributed load ────────────
  {
    id: 'simply-supported-distributed',
    title: t('edu.ex2Title'),
    description: t('edu.ex2Desc'),
    difficulty: 'easy',
    category: 'statics',
    build(api) {
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(8, 0);
      const e1 = api.addElement(n1, n2);
      api.addSupport(n1, 'pinned');
      api.addSupport(n2, 'rollerX');
      api.addDistributedLoad(e1, -5);
    },
    supports: [
      { label: t('edu.ex2SupportA'), nodeIndex: 0, dofs: ['Rx', 'Ry'] },
      { label: t('edu.ex2SupportB'), nodeIndex: 1, dofs: ['Ry'] },
    ],
    characteristics: [
      { label: 'Mmax', unit: 'kN·m', getCorrect: () => 5 * 8 * 8 / 8 },
      { label: 'Vmax', unit: 'kN', getCorrect: maxAbsShear },
    ],
    diagramQuestions: [
      { question: t('edu.dq.shearAtSupport'), getCorrect: f => Math.abs(f[0].vStart), unit: 'kN' },
      { question: t('edu.dq.momentAtMidspan'), getCorrect: () => 5 * 8 * 8 / 8, unit: 'kN·m' },
    ],
    kinematicQuestion: { classification: 'isostatic' },
    diagramShapeQuestions: [
      { diagram: 'N', correct: 'zero' },
      { diagram: 'V', correct: 'linear' },
      { diagram: 'M', correct: 'quadratic' },
    ],
  },
  // ── 3. Portal frame — Horizontal load ──────────────────────
  {
    id: 'portal-frame',
    title: t('edu.ex3Title'),
    description: t('edu.ex3Desc'),
    difficulty: 'medium',
    category: 'statics',
    build(api) {
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(0, 3);
      const n3 = api.addNode(4, 3);
      const n4 = api.addNode(4, 0);
      api.addElement(n1, n2);
      api.addElement(n2, n3);
      api.addElement(n3, n4);
      api.addSupport(n1, 'fixed');
      api.addSupport(n4, 'fixed');
      api.addNodalLoad(n2, 8, 0);
    },
    supports: [
      { label: t('edu.ex3SupportA'), nodeIndex: 0, dofs: ['Rx', 'Ry', 'M'] },
      { label: t('edu.ex3SupportB'), nodeIndex: 3, dofs: ['Rx', 'Ry', 'M'] },
    ],
    characteristics: [
      { label: t('edu.ex3MmaxCol'), unit: 'kN·m', getCorrect: maxMomentIn([0, 2]) },
      { label: t('edu.ex3MmaxBeam'), unit: 'kN·m', getCorrect: maxMomentIn([1]) },
    ],
    diagramQuestions: [
      { question: t('edu.dq.momentAtBase'), getCorrect: f => Math.abs(f[0].mStart), unit: 'kN·m' },
    ],
    kinematicQuestion: { classification: 'hyperstatic', degree: 3 },
    diagramShapeQuestions: [
      { diagram: 'V', correct: 'constant' },
      { diagram: 'M', correct: 'linear' },
    ],
  },
  // ── 4. Cantilever beam — Point load at tip ─────────────────
  {
    id: 'cantilever-point',
    title: t('edu.ex4Title'),
    description: t('edu.ex4Desc'),
    difficulty: 'easy',
    category: 'statics',
    build(api) {
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(4, 0);
      api.addElement(n1, n2);
      api.addSupport(n1, 'fixed');
      api.addNodalLoad(n2, 0, -12);
    },
    supports: [
      { label: t('edu.ex4SupportA'), nodeIndex: 0, dofs: ['Rx', 'Ry', 'M'] },
    ],
    characteristics: [
      { label: 'Mmax', unit: 'kN·m', getCorrect: maxAbsMoment },
      { label: 'Vmax', unit: 'kN', getCorrect: maxAbsShear },
    ],
    diagramQuestions: [
      { question: t('edu.dq.momentAtFixed'), getCorrect: f => Math.abs(f[0].mStart), unit: 'kN·m' },
      { question: t('edu.dq.shearConstant'), getCorrect: f => Math.abs(f[0].vStart), unit: 'kN' },
    ],
    kinematicQuestion: { classification: 'isostatic' },
    diagramShapeQuestions: [
      { diagram: 'N', correct: 'zero' },
      { diagram: 'V', correct: 'constant' },
      { diagram: 'M', correct: 'linear' },
    ],
  },
  // ── 5. Simple truss (triangle) ─────────────────────────────
  {
    id: 'simple-truss',
    title: t('edu.ex7Title'),
    description: t('edu.ex7Desc'),
    difficulty: 'medium',
    category: 'statics',
    build(api) {
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(4, 0);
      const n3 = api.addNode(2, 3);
      api.addElement(n1, n3); // left diagonal
      api.addElement(n2, n3); // right diagonal
      api.addElement(n1, n2); // bottom chord
      api.addSupport(n1, 'pinned');
      api.addSupport(n2, 'rollerX');
      api.addNodalLoad(n3, 0, -20);
    },
    supports: [
      { label: t('edu.ex7SupportA'), nodeIndex: 0, dofs: ['Rx', 'Ry'] },
      { label: t('edu.ex7SupportB'), nodeIndex: 1, dofs: ['Ry'] },
    ],
    characteristics: [
      { label: t('edu.ex7Nmax'), unit: 'kN', getCorrect: maxAbsAxial },
    ],
    diagramQuestions: [
      { question: t('edu.dq.axialBottomChord'), getCorrect: f => Math.abs(f[2]?.nStart ?? 0), unit: 'kN' },
    ],
    kinematicQuestion: { classification: 'isostatic' },
    diagramShapeQuestions: [
      { diagram: 'N', correct: 'constant' },
      { diagram: 'V', correct: 'zero' },
      { diagram: 'M', correct: 'zero' },
    ],
  },
  // ── 6. Bending stress — Rectangular section ───────────────
  // b=200 mm, h=400 mm simply supported beam
  // Mmax = PL/4 = 15×4/4 = 15 kN·m
  // Iz = bh³/12 = 0.2×0.4³/12 = 1.0667e-3 m⁴
  // W = Iz/(h/2) = bh²/6 = 0.2×0.4²/6 = 5.3333e-3 m³
  // σmax = M/W = 15/5.3333e-3 /1000 = 2.8125 MPa
  {
    id: 'bending-stress-rect',
    title: t('edu.ex9Title'),
    description: t('edu.ex9Desc'),
    difficulty: 'easy',
    category: 'strength',
    build(api) {
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(2, 0);
      const n3 = api.addNode(4, 0);
      api.addElement(n1, n2);
      api.addElement(n2, n3);
      api.addSupport(n1, 'pinned');
      api.addSupport(n3, 'rollerX');
      api.addNodalLoad(n2, 0, -15);
    },
    supports: [
      { label: t('edu.ex9SupportA'), nodeIndex: 0, dofs: ['Rx', 'Ry'] },
      { label: t('edu.ex9SupportB'), nodeIndex: 2, dofs: ['Ry'] },
    ],
    characteristics: [
      // Section modulus: W = bh²/6
      { label: t('edu.ex9W'), unit: 'm³', getCorrect: () => 5.3333e-3 },
      // σmax = Mmax / W  (in MPa)
      { label: 'σmax', unit: 'MPa', getCorrect: f => {
        const M = maxAbsMoment(f); // kN·m
        const W = 0.2 * 0.4 * 0.4 / 6; // m³
        return M / W / 1000; // kN·m / m³ = kPa → /1000 = MPa
      }},
    ],
    diagramQuestions: [
      { question: t('edu.dq.sigmaMax'), getCorrect: () => 2.8125, unit: 'MPa' },
      { question: t('edu.dq.momentAtCenter'), getCorrect: f => Math.abs(f[0].mEnd), unit: 'kN·m' },
    ],
    sectionData: [
      { label: 'b', value: '200 mm' },
      { label: 'h', value: '400 mm' },
      { label: t('edu.sectionFormula'), value: 'W = bh²/6' },
    ],
  },
  // ── 10. P-Delta — Leaning column ──────────────────────────
  // Fixed-base column, 5 m, 100 kN axial + 2 kN horizontal at top
  // First-order: M_base = H×L = 2×5 = 10 kN·m
  // P-Delta amplifies this: student must find the amplified moment from solver
  {
    id: 'pdelta-column',
    title: t('edu.ex10Title'),
    description: t('edu.ex10Desc'),
    difficulty: 'medium',
    category: 'advanced',
    solverType: 'pdelta',
    build(api) {
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(0, 5);
      api.addElement(n1, n2);
      api.addSupport(n1, 'fixed');
      api.addNodalLoad(n2, 2, -100);
    },
    supports: [
      { label: t('edu.ex10SupportA'), nodeIndex: 0, dofs: ['Rx', 'Ry', 'M'] },
    ],
    characteristics: [
      // First-order analytical value (hardcoded, student should know H×L)
      { label: t('edu.ex10MBase1st'), unit: 'kN·m', getCorrect: () => 10 },
      // P-Delta amplified moment (from solver — larger than 10)
      { label: t('edu.ex10MBasePD'), unit: 'kN·m', getCorrect: f => Math.abs(f[0].mStart) },
      // Euler critical load: Pcr = π²EI/(kL)² with k=2 (cantilever)
      // E=200000 MPa=200e6 kPa, Iz=9800 cm⁴=9.8e-5 m⁴, L=5 m
      { label: t('edu.ex10Pcr'), unit: 'kN', getCorrect: () => Math.PI ** 2 * 200e6 * 9.8e-5 / (2 * 5) ** 2 },
    ],
    diagramQuestions: [
      // Amplified moment at base from the P-Delta analysis
      { question: t('edu.dq.momentAtBasePD'), getCorrect: f => Math.abs(f[0].mStart), unit: 'kN·m' },
    ],
    sectionData: [
      { label: 'E', value: '200 000 MPa' },
      { label: 'Iz', value: '9 800 cm⁴' },
      { label: 'L', value: '5 m' },
      { label: t('edu.ex10BoundaryK'), value: 'k = 2 (' + t('edu.ex10Cantilever') + ')' },
      { label: t('edu.sectionFormula'), value: 'Pcr = π²EI / (kL)²' },
    ],
  },
];
}

// ─── Grouped + sorted exercises ─────────────────────────────────

const difficultyOrder: Record<string, number> = { easy: 0, medium: 1, hard: 2 };

function sortByDifficulty(exercises: EduExercise[]): EduExercise[] {
  return [...exercises].sort((a, b) => difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty]);
}

export function getExerciseSections(): ExerciseSection[] {
  const all = getExercises();
  const statics = sortByDifficulty(all.filter(e => e.category === 'statics'));
  const strength = sortByDifficulty(all.filter(e => e.category === 'strength'));
  const advanced = sortByDifficulty(all.filter(e => e.category === 'advanced'));

  return [
    { category: 'statics', title: t('edu.sectionStatics'), exercises: statics },
    { category: 'strength', title: t('edu.sectionStrength'), exercises: strength },
    { category: 'advanced', title: t('edu.sectionAdvanced'), exercises: advanced },
  ];
}
