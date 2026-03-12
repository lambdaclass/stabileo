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

export interface EduExercise {
  id: string;
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
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
  // ── 1. Simply supported beam — Point load ──────────────────
  {
    id: 'simply-supported-point',
    title: t('edu.ex1Title'),
    description: t('edu.ex1Desc'),
    difficulty: 'easy',
    build(api) {
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(3, 0);
      const n3 = api.addNode(6, 0);
      api.addElement(n1, n2);
      api.addElement(n2, n3);
      api.addSupport(n1, 'pinned');
      api.addSupport(n3, 'rollerX');
      api.addNodalLoad(n2, 0, -10);
    },
    supports: [
      { label: t('edu.ex1SupportA'), nodeIndex: 0, dofs: ['Rx', 'Ry'] },
      { label: t('edu.ex1SupportB'), nodeIndex: 2, dofs: ['Ry'] },
    ],
    characteristics: [
      { label: 'Mmax', unit: 'kN·m', getCorrect: maxAbsMoment },
      { label: 'Vmax', unit: 'kN', getCorrect: maxAbsShear },
    ],
    diagramQuestions: [
      { question: t('edu.dq.shearAtSupport'), getCorrect: f => Math.abs(f[0].vStart), unit: 'kN' },
      { question: t('edu.dq.momentAtCenter'), getCorrect: f => Math.abs(f[0].mEnd), unit: 'kN·m' },
    ],
  },
  // ── 2. Simply supported beam — Distributed load ────────────
  {
    id: 'simply-supported-distributed',
    title: t('edu.ex2Title'),
    description: t('edu.ex2Desc'),
    difficulty: 'easy',
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
      { label: 'Mmax', unit: 'kN·m', getCorrect: maxAbsMoment },
      { label: 'Vmax', unit: 'kN', getCorrect: maxAbsShear },
    ],
    diagramQuestions: [
      { question: t('edu.dq.shearAtSupport'), getCorrect: f => Math.abs(f[0].vStart), unit: 'kN' },
      { question: t('edu.dq.momentAtMidspan'), getCorrect: f => maxAbsMoment(f), unit: 'kN·m' },
    ],
  },
  // ── 3. Portal frame — Horizontal load ──────────────────────
  {
    id: 'portal-frame',
    title: t('edu.ex3Title'),
    description: t('edu.ex3Desc'),
    difficulty: 'medium',
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
  },
  // ── 4. Cantilever beam — Point load at tip ─────────────────
  {
    id: 'cantilever-point',
    title: t('edu.ex4Title'),
    description: t('edu.ex4Desc'),
    difficulty: 'easy',
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
  },
  // ── 5. Fixed-fixed beam — Distributed load ─────────────────
  {
    id: 'fixed-fixed-distributed',
    title: t('edu.ex5Title'),
    description: t('edu.ex5Desc'),
    difficulty: 'medium',
    build(api) {
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(6, 0);
      const e1 = api.addElement(n1, n2);
      api.addSupport(n1, 'fixed');
      api.addSupport(n2, 'fixed');
      api.addDistributedLoad(e1, -8);
    },
    supports: [
      { label: t('edu.ex5SupportA'), nodeIndex: 0, dofs: ['Rx', 'Ry', 'M'] },
      { label: t('edu.ex5SupportB'), nodeIndex: 1, dofs: ['Rx', 'Ry', 'M'] },
    ],
    characteristics: [
      { label: 'Mmax', unit: 'kN·m', getCorrect: maxAbsMoment },
      { label: 'Vmax', unit: 'kN', getCorrect: maxAbsShear },
    ],
    diagramQuestions: [
      { question: t('edu.dq.momentAtEnds'), getCorrect: f => Math.abs(f[0].mStart), unit: 'kN·m' },
      { question: t('edu.dq.shearAtSupport'), getCorrect: f => Math.abs(f[0].vStart), unit: 'kN' },
    ],
  },
  // ── 6. Cantilever — Distributed load ───────────────────────
  {
    id: 'cantilever-distributed',
    title: t('edu.ex6Title'),
    description: t('edu.ex6Desc'),
    difficulty: 'easy',
    build(api) {
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(5, 0);
      const e1 = api.addElement(n1, n2);
      api.addSupport(n1, 'fixed');
      api.addDistributedLoad(e1, -6);
    },
    supports: [
      { label: t('edu.ex6SupportA'), nodeIndex: 0, dofs: ['Rx', 'Ry', 'M'] },
    ],
    characteristics: [
      { label: 'Mmax', unit: 'kN·m', getCorrect: maxAbsMoment },
      { label: 'Vmax', unit: 'kN', getCorrect: maxAbsShear },
    ],
    diagramQuestions: [
      { question: t('edu.dq.momentAtFixed'), getCorrect: f => Math.abs(f[0].mStart), unit: 'kN·m' },
      { question: t('edu.dq.shearAtFixed'), getCorrect: f => Math.abs(f[0].vStart), unit: 'kN' },
    ],
  },
  // ── 7. Simple truss (triangle) ─────────────────────────────
  {
    id: 'simple-truss',
    title: t('edu.ex7Title'),
    description: t('edu.ex7Desc'),
    difficulty: 'medium',
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
  },
  // ── 8. Portal frame — Distributed load on beam ─────────────
  {
    id: 'portal-distributed',
    title: t('edu.ex8Title'),
    description: t('edu.ex8Desc'),
    difficulty: 'hard',
    build(api) {
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(0, 4);
      const n3 = api.addNode(5, 4);
      const n4 = api.addNode(5, 0);
      api.addElement(n1, n2);
      const eBeam = api.addElement(n2, n3);
      api.addElement(n3, n4);
      api.addSupport(n1, 'fixed');
      api.addSupport(n4, 'fixed');
      api.addDistributedLoad(eBeam, -10);
    },
    supports: [
      { label: t('edu.ex8SupportA'), nodeIndex: 0, dofs: ['Rx', 'Ry', 'M'] },
      { label: t('edu.ex8SupportB'), nodeIndex: 3, dofs: ['Rx', 'Ry', 'M'] },
    ],
    characteristics: [
      { label: t('edu.ex8MmaxBeam'), unit: 'kN·m', getCorrect: maxMomentIn([1]) },
      { label: 'Vmax', unit: 'kN', getCorrect: maxAbsShear },
    ],
    diagramQuestions: [
      { question: t('edu.dq.momentAtBeamEnds'), getCorrect: f => Math.abs(f[1].mStart), unit: 'kN·m' },
    ],
  },
];
}
